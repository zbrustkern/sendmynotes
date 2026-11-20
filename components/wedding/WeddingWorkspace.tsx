"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AuthModal } from "@/components/AuthModal";
import { useAuth } from "@/context/AuthContext";
import {
  readWeddingAttributionPayload,
  trackWeddingFunnelEvent,
} from "@/lib/wedding/attribution-client";
import { CardPanel } from "./CardPanel";
import { PeoplePanel } from "./PeoplePanel";
import { WritingPanel } from "./WritingPanel";
import { Rates, ReviewPanel } from "./ReviewPanel";
import { SharingPanel } from "./SharingPanel";
import {
  errorMessage,
  postWedding,
  weddingRequest,
  WeddingRequestError,
  type Snapshot,
} from "./client";

const tabs = [
  "Your card",
  "Your people",
  "Your words",
  "Review & send",
] as const;
const nextStepLabels = ["Card", "People", "Writing", "Review & send"] as const;
type APIResult = Record<string, unknown> & Partial<Snapshot>;

export function WeddingWorkspace({
  purchasingOpen,
  stagingReviewOnly = false,
}: {
  purchasingOpen: boolean;
  stagingReviewOnly?: boolean;
}) {
  const [state, setState] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [step, setStep] = useState(0),
    [auth, setAuth] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [newStart, setNewStart] = useState(false),
    [estimate, setEstimate] = useState("100"),
    [intl, setIntl] = useState("0");
  const { loading: authLoading } = useAuth();
  const mounted = useRef(true),
    initialized = useRef(false),
    landingTracked = useRef(false),
    fragment = useRef<string | null>(null),
    paymentReturn = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const flushers = useRef(new Set<() => Promise<boolean>>());
  const registerFlush = useCallback((cb: () => Promise<boolean>) => {
    flushers.current.add(cb);
    return () => {
      flushers.current.delete(cb);
    };
  }, []);
  const apply = useCallback((data: APIResult) => {
    if (data.project && data.households && data.actor && mounted.current) {
      flushSync(() => setState(data as Snapshot));
    }
  }, []);
  const refresh = useCallback(async () => {
    const data = await weddingRequest<Snapshot>("project");
    apply(data);
  }, [apply]);
  const mutate = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      try {
        const data = await postWedding<APIResult>("project", {
          action,
          ...payload,
        });
        apply(data);
        return data;
      } catch (e) {
        if (e instanceof WeddingRequestError && e.status === 409) {
          await refresh().catch(() => {});
        }
        throw e;
      }
    },
    [apply, refresh],
  );
  const navigate = useCallback(
    async (n: number) => {
      for (const flush of flushers.current) if (!(await flush())) return;
      setStep(n);
      try {
        if (state)
          sessionStorage.setItem("wed-step-" + state.project.id, String(n));
      } catch {}
      requestAnimationFrame(() => heading.current?.focus());
    },
    [state],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (location.hash) {
      fragment.current = new URLSearchParams(location.hash.slice(1)).get(
        "wedding",
      );
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (new URLSearchParams(location.search).get("return") === "payment") {
      paymentReturn.current = true;
      history.replaceState(null, "", location.pathname);
    }
    if (initialized.current || authLoading) return;
    initialized.current = true;
    const token = fragment.current;
    void (async () => {
      try {
        let data: Snapshot;
        if (token) {
          try {
            data = await postWedding<Snapshot>("project", {
              action: "redeem",
              token,
            });
            fragment.current = null;
          } catch (e) {
            if (
              e instanceof WeddingRequestError &&
              e.code === "project_required"
            ) {
              setNotice(
                "Choose Start my thank-yous to apply this tester invitation to your new project.",
              );
              return;
            }
            throw e;
          }
        } else data = await weddingRequest<Snapshot>("project");
        apply(data);
        let initial = 0;
        try {
          initial =
            Number(sessionStorage.getItem("wed-step-" + data.project.id)) || 0;
        } catch {}
        setStep(
          paymentReturn.current || data.project.activeBatchId
            ? 3
            : Math.max(0, Math.min(3, initial)),
        );
      } catch (e) {
        if (
          !(e instanceof WeddingRequestError && [401, 404].includes(e.status))
        )
          setError(errorMessage(e));
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
  }, [apply, authLoading]);

  const showingLanding = !loading && (!state || newStart);
  useEffect(() => {
    if (!showingLanding || landingTracked.current) return;
    landingTracked.current = true;
    trackWeddingFunnelEvent("wedding_landing_viewed", {
      hasExistingProject: Boolean(state),
      stagingReviewOnly,
    });
  }, [showingLanding, state, stagingReviewOnly]);

  async function start(sample: boolean, forceNew = false) {
    setBusy(true);
    setError("");
    try {
      const d = await mutate("create", {
        sample,
        new: forceNew || newStart || Boolean(state),
        attribution: readWeddingAttributionPayload(),
      });
      if (fragment.current) {
        await mutate("redeem", { token: fragment.current });
        fragment.current = null;
      }
      setStep(sample ? 1 : 0);
      setNewStart(false);
      setNotice(
        sample
          ? "This is a private project with 100 fictional households."
          : "Your private project is ready.",
      );
      trackWeddingFunnelEvent(
        sample ? "wedding_sample_started" : "wedding_project_started",
        {
          sample,
          projectId: d.project?.id,
          ...(sample ? { householdCount: d.households?.length ?? 100 } : {}),
        },
      );
      if (!d.project) await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finishSignIn() {
    setAuth(false);
    try {
      if (state) {
        await mutate("claim");
        setNotice("Account linked. Resume the operation when you’re ready.");
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const props = state
    ? { state, mutate, refresh, notify: setNotice, signIn: () => setAuth(true) }
    : null;
  const synthetic =
    state?.households.every((r) => r.id.startsWith("sample_")) &&
    state.households.length > 0;
  const validEstimate =
    /^\d{1,3}$/.test(estimate) &&
    +estimate >= 1 &&
    +estimate <= 250 &&
    /^\d{1,3}$/.test(intl) &&
    +intl <= +estimate;

  return (
    <main className="wed">
      <header className="wed-top">
        <Link href="/">SendMyNotes</Link>
        <div className="wed-top-right">
          <span>Wedding thank-you notes</span>
          {state && !newStart && (
            <nav className="wed-top-nav" aria-label="Workspace navigation">
              <button
                type="button"
                className="wed-link-btn"
                onClick={() => setNewStart(true)}
              >
                Overview
              </button>
              {!synthetic && (
                <button
                  type="button"
                  className="wed-link-btn"
                  disabled={busy}
                  onClick={() => void start(true, true)}
                >
                  Try 100-household sample
                </button>
              )}
              <button
                type="button"
                className="wed-link-btn"
                disabled={busy}
                onClick={() => void start(false, true)}
              >
                Start fresh
              </button>
            </nav>
          )}
        </div>
      </header>
      {loading ? (
        <p className="wed-notice" role="status">
          Opening your wedding project…
        </p>
      ) : !state || newStart ? (
        <>
          <section className="wed-landing">
            <div>
              <h1>
                Your words, written in real pen &amp; ink—without three weekends
                at the kitchen table.
              </h1>
              <p>
                Upload your wedding photo or choose a classic design, bring your
                guest and gift list, and personalize every note. Automated
                equipment holding real pens writes each A2 folded card on 120 lb
                vellum cardstock, addresses a white envelope with your personal
                return address, and mails it via USPS.
              </p>
              <div className="wed-actions">
                <button
                  className="wed-primary"
                  onClick={() => void start(false)}
                  disabled={busy}
                >
                  Start my thank-yous
                </button>
                <button onClick={() => void start(true)} disabled={busy}>
                  Try 100-household sample
                </button>
                {state && (
                  <button onClick={() => setNewStart(false)}>
                    Back to my project
                  </button>
                )}
              </div>
              <p className="wed-pricing-bar">
                <span className="wed-price">$9/card</span> for 1–10 · down to{" "}
                <span className="wed-price">$6.50/card</span> at 100+ · postage
                &amp; tax included · pay in batches as addresses arrive
              </p>
              <p className="wed-meta">
                {stagingReviewOnly
                  ? "The sample uses 100 fictional households. Staging purchases use test payments and stay on hold."
                  : "The sample uses 100 fictional households so you can explore before starting your own list."}
              </p>
            </div>
            <div className="wed-hero-gallery">
              <picture>
                <source
                  srcSet="/wedding/hero-handwritten-note.webp"
                  type="image/webp"
                />
                <img
                  src="/wedding/hero-handwritten-note.jpg"
                  alt="Open folded card with a personal thank-you note written in real blue pen and ink"
                  className="wed-hero-photo wed-hero-photo-main"
                  width={960}
                  height={960}
                />
              </picture>
              <picture>
                <source
                  srcSet="/wedding/hero-card-envelope.webp"
                  type="image/webp"
                />
                <img
                  src="/wedding/hero-card-envelope.jpg"
                  alt="Folded card beside a white envelope addressed in real blue ink"
                  className="wed-hero-photo wed-hero-photo-secondary"
                  width={960}
                  height={960}
                />
              </picture>
            </div>
          </section>
          <section className="wed-how-it-works" aria-label="How it works">
            <h2>How it works</h2>
            <ol className="wed-how-grid">
              <li>
                <strong>1. Upload your wedding photo or pick a design</strong>
                <p>
                  Crop your own photo and add optional lettering, or pick one of
                  our timeless card fronts.
                </p>
              </li>
              <li>
                <strong>
                  2. Import your guest &amp; gift list and personalize each note
                </strong>
                <p>
                  Upload a spreadsheet or paste rows, write one shared note with
                  each guest’s name, or write individual words.
                </p>
              </li>
              <li>
                <strong>
                  3. We write every card with real pens, stamp &amp; mail them
                </strong>
                <p>
                  1–2 business days preparation + 2–7 business days estimated
                  domestic USPS transit.
                </p>
              </li>
            </ol>
          </section>
          <section className="wed-panel" aria-label="Batch price estimator">
            <h2>Estimate your cards</h2>
            <div className="wed-mini-grid">
              <label>
                Envelopes in your project
                <input
                  type="number"
                  min="1"
                  max="250"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                />
              </label>
              <label>
                International envelopes
                <input
                  type="number"
                  min="0"
                  max={estimate}
                  value={intl}
                  onChange={(e) => setIntl(e.target.value)}
                />
              </label>
            </div>
            {validEstimate ? (
              <Rates selected={+estimate} international={+intl} />
            ) : (
              <p>
                Use 1–250 whole envelopes and include international cards in
                that total.
              </p>
            )}
          </section>
        </>
      ) : (
        props && (
          <>
            <h1 tabIndex={-1} ref={heading}>
              {tabs[step]}
            </h1>
            <nav className="wed-steps" aria-label="Wedding project steps">
              {tabs.map((name, i) => (
                <button
                  key={name}
                  aria-current={step === i ? "step" : undefined}
                  onClick={() => void navigate(i)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {synthetic && (
              <p className="wed-notice">
                You’re working with the sample households.{" "}
                <button onClick={() => setNewStart(true)}>
                  Start my own project
                </button>
              </p>
            )}
            {step === 0 && (
              <CardPanel {...props} registerFlush={registerFlush} />
            )}
            {step === 1 && (
              <PeoplePanel
                {...props}
                editId={editId}
                onEdit={setEditId}
                registerFlush={registerFlush}
                stagingReviewOnly={stagingReviewOnly}
              />
            )}
            {step === 2 && (
              <WritingPanel {...props} registerFlush={registerFlush} />
            )}
            {step === 3 && (
              <ReviewPanel
                {...props}
                purchasingOpen={purchasingOpen}
                stagingReviewOnly={stagingReviewOnly}
              />
            )}
            {step < 3 && (
              <div className="wed-actions">
                <button
                  className="wed-primary"
                  onClick={() => void navigate(step + 1)}
                >
                  Continue to {nextStepLabels[step + 1]} →
                </button>
              </div>
            )}
            {!purchasingOpen && (
              <p className="wed-meta">
                {stagingReviewOnly
                  ? "Writing and review are open. Staging checkout is currently closed."
                  : "Writing and review are open. Checkout is currently paused."}
              </p>
            )}
            <SharingPanel {...props} />
          </>
        )
      )}
      {error && (
        <p role="alert" className="wed-notice">
          {error}{" "}
          <button
            onClick={() =>
              void refresh()
                .then(() => setError(""))
                .catch((e) => setError(errorMessage(e)))
            }
          >
            Retry
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="wed-notice">
          {notice}
        </p>
      )}
      {auth && (
        <AuthModal
          isOpen={auth}
          onClose={() => setAuth(false)}
          onSuccess={() => void finishSignIn()}
          title="Sign in to your wedding project"
          subtitle="Your project stays saved while you verify your account."
        />
      )}
    </main>
  );
}
