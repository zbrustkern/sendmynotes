"use client";
import { useEffect, useRef, useState } from "react";
import {
  errorMessage,
  postWedding,
  weddingRequest,
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
    [running, setRunning] = useState(false);
  const runningRef = useRef(false),
    mounted = useRef(true),
    intent = useRef<{ sig: string; key: string } | null>(null);
  const key = "wed-drafts-" + state.project.id;
  const signature = JSON.stringify([ids, tone]);
  const applicable = state.households.filter((h) => ids.includes(h.id));
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
      weddingRequest<{ job: Job & { result?: Job } }>(
        "ai?jobId=" + encodeURIComponent(saved),
      )
        .then((d) => {
          if (mounted.current && d.job) {
            const j = { ...d.job, ...d.job.result };
            setJob(j);
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
    try {
      let latest = job;
      if (!resume) {
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
      if (mounted.current) setError(errorMessage(e));
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
      <h3>Draft a note body</h3>
      <p>
        {ids.length} selected. Each suggestion comes back for you to read and
        accept.
      </p>
      <p className="wed-meta">
        Review the gift and memory below.{" "}
        {model.provider || "Provider unavailable"}
        {model.model ? " · " + model.model : ""}. The project adds names and
        sign-offs afterward.
      </p>
      <ul className="wed-list wed-scroll">
        {applicable.map((r, i) => (
          <li key={r.id}>
            Card {i + 1} · {r.gift || "No gift supplied"} ·{" "}
            {r.memory || "No memory supplied"}
          </li>
        ))}
      </ul>
      <label>
        Tone
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          <option value="warm">Warm</option>
          <option value="short">Short</option>
          <option value="personal">Personal</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Share these selected details with the writing model.
      </label>
      <div className="wed-actions">
        <button
          disabled={
            busy ||
            !ids.length ||
            !consent ||
            !state.actor.pilot ||
            !model.model ||
            model.available === false
          }
          onClick={() => void run(false)}
        >
          Draft {ids.length} {ids.length === 1 ? "suggestion" : "suggestions"}
        </button>
        {job && !done(job) && !running && (
          <button disabled={!consent || busy} onClick={() => void run(true)}>
            Resume drafting
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
      {job && (
        <p role="status">
          {job.suggestions?.length || 0} suggestions ready across {job.total}{" "}
          selected cards. Open each household to review its words.
        </p>
      )}
      {model.resetsAt && (
        <p className="wed-meta">
          {model.remaining?.drafts ?? 0} recipient drafts remaining. Allowance
          resets {new Date(model.resetsAt).toLocaleString()}.
        </p>
      )}
      {(!state.actor.pilot || error) && (
        <div>
          {error || "AI assistance is available to invited testers."}{" "}
          <button onClick={signIn}>Sign in</button>
        </div>
      )}
    </div>
  );
}
