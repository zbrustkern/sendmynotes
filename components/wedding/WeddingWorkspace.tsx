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
const nextStepLabels = [
  "Your card",
  "Your people",
  "Your words",
  "Review & send",
] as const;
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
                "Choose Start my thank-you cards to apply this tester invitation to your new project.",
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
          ? "Exploring a sample wedding with 100 fictional guests."
          : "Your private wedding project is ready.",
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
        setNotice("You're signed in! Pick up right where you left off.");
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
                  Sample wedding
                </button>
              )}
              <button
                type="button"
                className="wed-link-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Start a brand-new blank wedding project? Your current project stays saved via its backup link.",
                    )
                  ) {
                    void start(false, true);
                  }
                }}
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
              <h1>Your wedding thank-yous, written in real pen &amp; ink.</h1>
              <p>
                Every note in your own words, paired with your favorite wedding
                photo—written by real ballpoint pens (never printed), addressed
                with your personal return address, stamped, and mailed for you.
              </p>
              <div className="wed-cta-stack">
                <div className="wed-actions">
                  <button
                    className="wed-primary"
                    onClick={() => void start(false)}
                    disabled={busy}
                  >
                    Start my thank-you cards
                  </button>
                  <button
                    className="wed-quiet-btn"
                    onClick={() => void start(true)}
                    disabled={busy}
                  >
                    Preview a sample wedding
                  </button>
                  {state && (
                    <button onClick={() => setNewStart(false)}>
                      Back to my project
                    </button>
                  )}
                </div>
                <p className="wed-cta-micro">
                  Free to design &amp; import your list · Pay only when ready to
                  mail
                </p>
              </div>
              <p className="wed-pricing-bar">
                Volume pricing from{" "}
                <span className="wed-price">$9.00</span> down to{" "}
                <span className="wed-price">$6.50/card</span> · e.g., 100
                domestic cards = <span className="wed-price">$727</span> total ·
                Stamp &amp; tax included · Pay in batches as addresses arrive
              </p>
              {stagingReviewOnly && (
                <p className="wed-meta">
                  Staging preview uses test payments and holds orders before
                  fulfillment.
                </p>
              )}
            </div>
            <div className="wed-hero-gallery">
              <figure className="wed-hero-figure">
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
                <figcaption className="wed-hero-caption">
                  Unretouched real ballpoint ink (shown on an everyday card —
                  yours features your wedding photo &amp; words)
                </figcaption>
              </figure>
              <div className="wed-hero-card-wrap">
                <img
                  src="/presets/thank-you-laurel-wreath.jpg"
                  alt="Laurel wreath thank-you card front preview"
                  className="wed-hero-card"
                  width={340}
                  height={440}
                />
                <span className="wed-hero-badge">
                  Your wedding photo or botanical front
                </span>
              </div>
            </div>
          </section>
          <ul
            className="wed-trust-strip"
            aria-label="What makes every card feel personal"
          >
            <li className="wed-trust-item">
              <strong>Real pen &amp; ink</strong>
              <p>
                Precision writing machines hold real ballpoint pens on 120 lb
                vellum folded A2 cards (4.25&quot; × 5.5&quot;)—never printed
                fonts.
              </p>
            </li>
            <li className="wed-trust-item">
              <strong>Truly from you</strong>
              <p>
                Your personal return address on white envelopes, real
                First-Class USPS stamp (Phoenix, AZ postmark).
              </p>
            </li>
            <li className="wed-trust-item">
              <strong>Your exact words</strong>
              <p>
                Write one heartfelt note or personalize every card by gift and
                memory.
              </p>
            </li>
            <li className="wed-trust-item">
              <strong>Mail in batches</strong>
              <p>
                Send 40 today and 60 next week; your earned volume pricing
                carries forward automatically.
              </p>
            </li>
          </ul>
          <section className="wed-how-it-works" aria-label="How it works">
            <h2>How it works</h2>
            <ol className="wed-how-grid">
              <li>
                <strong>1. Upload your wedding photo or pick a design</strong>
                <p>
                  Crop your favorite photo and add optional names or date, or
                  pick a timeless botanical front.
                </p>
              </li>
              <li>
                <strong>
                  2. Import your guest &amp; gift list and personalize each note
                </strong>
                <p>
                  Bring exports from Zola, The Knot, Joy, or spreadsheets, write
                  one shared note, or personalize by gift.
                </p>
              </li>
              <li>
                <strong>
                  3. Real pens write every card, stamp &amp; mail them
                </strong>
                <p>
                  1–2 business days preparation + 2–7 business days estimated
                  domestic USPS transit.
                </p>
              </li>
            </ol>
            <div className="wed-how-proof">
              <picture>
                <source
                  srcSet="/wedding/hero-card-envelope.webp"
                  type="image/webp"
                />
                <img
                  src="/wedding/hero-card-envelope.jpg"
                  alt="Folded card beside a white envelope addressed in real blue ink"
                  width={960}
                  height={960}
                />
              </picture>
              <div>
                <strong>
                  Real-ink envelope addressing with your personal return address
                </strong>
                <p className="wed-meta">
                  Every white envelope is addressed in matching ballpoint ink
                  with a real First-Class USPS stamp.
                </p>
              </div>
            </div>
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
                  <span className="wed-step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{name}</span>
                </button>
              ))}
            </nav>
            {synthetic && (
              <p className="wed-notice">
                You’re exploring a sample wedding with fictional guests.{" "}
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
              <WritingPanel
                {...props}
                registerFlush={registerFlush}
                onContinueToReview={() => void navigate(3)}
              />
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
