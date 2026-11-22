"use client";
import { useEffect, useRef, useState } from "react";
import { prepareWeddingAiDraftFields } from "@/lib/wedding/ai-schema";
import {
  errorMessage,
  pluralize,
  postWedding,
  weddingRequest,
  WeddingRequestError,
  type PanelProps,
} from "./client";

type Suggestion = { id: string; text: string };
type Job = {
  jobId: string;
  complete: number | boolean;
  total: number;
  suggestions: Suggestion[];
  status?: string;
  completed?: number;
};
type Info = {
  provider?: string;
  model?: string;
  available?: boolean;
  resetsAt?: number;
  remaining?: Record<string, number>;
};

const done = (job: Job) =>
  [
    "complete",
    "completed",
    "canceled",
    "failed",
    "uncertain",
    "unresolved",
    "paused",
  ].includes(job.status || "") ||
  job.complete === true ||
  (typeof job.complete === "number" && job.complete >= job.total);

export function DraftAssistant({
  state,
  ids,
  onSuggestions,
  signIn,
}: PanelProps & { ids: string[]; onSuggestions: (s: Suggestion[]) => void }) {
  const [tone, setTone] = useState("warm"),
    [consent, setConsent] = useState(false),
    [model, setModel] = useState<Info>({}),
    [job, setJob] = useState<Job | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [needsAuth, setNeedsAuth] = useState(false),
    [resuming, setResuming] = useState(false),
    [jobIds, setJobIds] = useState<string[]>([]),
    [running, setRunning] = useState(false);
  const runningRef = useRef(false),
    mounted = useRef(true),
    intent = useRef<{ sig: string; key: string } | null>(null);
  const key = "wed-drafts-" + state.project.id;
  const requestedIds = resuming ? jobIds : ids;
  const applicable = state.households
    .filter((h) => requestedIds.includes(h.id))
    .map((h) => ({
      id: h.id,
      ...prepareWeddingAiDraftFields(h, state.project.returnAddress),
    }));
  const signature = JSON.stringify([
    requestedIds,
    tone,
    applicable,
    model.model,
  ]);
  useEffect(() => {
    setConsent(false);
  }, [signature]);
  useEffect(() => {
    mounted.current = true;
    weddingRequest<Info>("ai")
      .then(setModel)
      .catch((e) => setError(errorMessage(e)));
    let saved = "";
    try {
      saved = sessionStorage.getItem(key) || "";
    } catch {}
    if (saved)
      weddingRequest<{
        job: Job & { result?: Job; sourceRevisions?: { id: string }[] };
      }>("ai?jobId=" + encodeURIComponent(saved))
        .then((d) => {
          if (mounted.current && d.job) {
            const j = { ...d.job, ...d.job.result };
            setJob(j);
            setJobIds(d.job.sourceRevisions?.map((r) => r.id) || []);
            onSuggestions(j.suggestions || []);
          }
        })
        .catch(() => {});
    return () => {
      mounted.current = false;
      runningRef.current = false;
    };
  }, [key]);

  function requestKey(sig: string) {
    if (intent.current?.sig !== sig)
      intent.current = { sig, key: crypto.randomUUID() };
    return intent.current.key;
  }

  async function run(resume: boolean) {
    if (!consent || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setBusy(true);
    setError("");
    setNeedsAuth(false);
    try {
      let latest = job;
      if (!resume) {
        setJobIds(ids);
        latest = await postWedding<Job>("ai", {
          action: "draft",
          ids,
          tone,
          consent: true,
          idempotencyKey: requestKey(signature),
        });
        try {
          sessionStorage.setItem(key, latest.jobId);
        } catch {}
      }
      while (latest && mounted.current) {
        setJob(latest);
        onSuggestions(latest.suggestions || []);
        if (done(latest) || !runningRef.current) break;
        const stepKey = requestKey(
          latest.jobId +
            ":" +
            String(latest.complete) +
            ":" +
            String(latest.suggestions?.length || 0),
        );
        const next: Job = await postWedding<Job>("ai", {
          action: "advance",
          jobId: latest.jobId,
          consent: true,
          idempotencyKey: stepKey,
        });
        if (
          next.status === "processing" &&
          next.suggestions.length === latest.suggestions.length
        ) {
          setJob(next);
          break;
        }
        latest = next;
      }
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
        setNeedsAuth(
          e instanceof WeddingRequestError && e.code === "ai_sign_in_required",
        );
      }
    } finally {
      runningRef.current = false;
      if (mounted.current) {
        setRunning(false);
        setBusy(false);
      }
    }
  }

  return (
    <div className="wed-notice">
      <h3>Personal note helper</h3>
      <p>
        We&apos;ll weave each guest&apos;s gift and memory into a warm starting
        draft you can edit — nothing is ever sent without your approval.
      </p>
      <p className="wed-meta">
        {requestedIds.length} selected. Greetings and sign-offs are added
        automatically.
      </p>
      <ul className="wed-list wed-scroll">
        {applicable.map((r, i) => (
          <li key={r.id}>
            Card {i + 1} ·{" "}
            {r.gift || r.memory
              ? [r.gift, r.memory].filter(Boolean).join(" · ")
              : "General wedding thank-you (no gift noted)"}
          </li>
        ))}
      </ul>
      <fieldset
        disabled={!state.actor.verified || busy || model.available === false}
      >
        <label>
          Tone
          <select
            disabled={
              !state.actor.verified ||
              resuming ||
              running ||
              model.available === false
            }
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            <option value="warm">Warm &amp; heartfelt</option>
            <option value="short">Short &amp; sweet</option>
            <option value="personal">Playful &amp; personal</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Allow SendMyNotes&apos; writing assistant to read these gift &amp;
          memory notes to suggest drafts (guest addresses are never shared).
        </label>
      </fieldset>
      {model.provider && (
        <small>
          {model.provider}
          {model.model ? " · " + model.model : ""}
        </small>
      )}
      <div className="wed-actions">
        {!state.actor.verified ? (
          <button type="button" onClick={signIn}>
            Sign in to use AI helper
          </button>
        ) : (
          <button
            type="button"
            disabled={
              busy ||
              !ids.length ||
              resuming ||
              !consent ||
              !model.model ||
              model.available === false
            }
            onClick={() => void run(false)}
          >
            Draft {pluralize(ids.length, "suggestion")}
          </button>
        )}
        {job && !done(job) && !running && (
          <button
            disabled={busy || (resuming && (!consent || !jobIds.length))}
            onClick={() => {
              if (resuming) {
                void run(true);
              } else {
                setResuming(true);
                setConsent(false);
              }
            }}
          >
            {resuming
              ? "Resume drafting"
              : "Review the previous batch to resume"}
          </button>
        )}
        {running && (
          <button
            onClick={() => {
              runningRef.current = false;
            }}
          >
            Pause after this group
          </button>
        )}
      </div>
      {resuming && !running && (
        <button
          onClick={() => {
            setResuming(false);
            setConsent(false);
          }}
        >
          Return to the current selection
        </button>
      )}
      {job && (
        <p role="status">
          {pluralize(job.suggestions?.length || 0, "suggestion")} ready across{" "}
          {pluralize(job.total, "selected card")}. Open each guest to review its
          words.
        </p>
      )}
      {model.available === false && (
        <p className="wed-notice">
          AI drafting is currently unavailable. Your shared and personal writing
          tools are ready to use.
        </p>
      )}
      {model.resetsAt && (
        <p className="wed-meta">
          {model.remaining?.drafts ?? 0} recipient drafts remaining. Allowance
          resets {new Date(model.resetsAt).toLocaleString()}.
        </p>
      )}
      {error && (
        <div className="wed-notice" role="alert">
          {error}{" "}
          {needsAuth && (
            <button type="button" onClick={signIn}>
              Sign in to use AI helper
            </button>
          )}
        </div>
      )}
    </div>
  );
}
