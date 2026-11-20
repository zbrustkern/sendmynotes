"use client";
import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useAuth } from "@/context/AuthContext";
import { quoteWeddingBatch, WEDDING_PRICE_BANDS } from "@/lib/wedding-pricing";
import {
  fireWeddingBrowserPurchase,
  readWeddingAttributionPayload,
  trackWeddingFunnelEvent,
} from "@/lib/wedding/attribution-client";
import {
  errorMessage,
  formatAddress,
  noteFor,
  isReady,
  dollars,
  pluralize,
  postWedding,
  safePreview,
  type Person,
  type Project,
  type PanelProps,
} from "./client";
import { handFont } from "./CardPanel";

type Quote = {
  id: string;
  count: number;
  previouslyPurchased: number;
  promotion?: {
    savingsCents: number;
    remainingProjectUnits: number | null;
    remainingProjectCents?: number | null;
  };
  baseCents: number;
  mailingCents: number;
  totalCents: number;
  bands: ReturnType<typeof quoteWeddingBatch>["lines"];
};
type Batch = {
  batchId?: string;
  status?: string;
  preparedCount?: number;
  count?: number;
  quote: Quote;
  checkoutEnabled?: boolean;
  clientSecret?: string;
  publishableKey?: string;
};

const isSettledStatus = (status?: string) =>
  ["held", "paid", "queued", "dispatched"].includes(status || "");

export function Rates({
  selected = 0,
  purchased = 0,
  international = 0,
}: {
  selected?: number;
  purchased?: number;
  international?: number;
}) {
  const estimate = quoteWeddingBatch(selected, purchased);
  return (
    <>
      <div className="wed-table-wrap">
        <table>
          <caption style={{ textAlign: "left", fontWeight: 600 }}>
            Price per envelope, tax included
          </caption>
          <thead>
            <tr>
              <th>Project cards</th>
              <th>Each</th>
              <th>This selection</th>
            </tr>
          </thead>
          <tbody>
            {WEDDING_PRICE_BANDS.map((b) => {
              const l = estimate.lines.find(
                (line) =>
                  line.first >= b.first &&
                  (b.last === null || line.first <= b.last),
              );
              return (
                <tr key={b.first}>
                  <th>{b.last ? b.first + "–" + b.last : b.first + "+"}</th>
                  <td className="wed-price">{dollars(b.unitCents)}</td>
                  <td className="wed-price">
                    {l ? l.quantity + " × " + dollars(l.unitCents) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Domestic mailing included. International mailing adds $5.00 per
        envelope. Your next batch picks up where you left off.
      </p>
      {selected > 0 && (
        <p>
          <strong className="wed-price">
            Estimated {dollars(estimate.subtotalCents + international * 500)}
          </strong>{" "}
          for {pluralize(selected, "envelope")}, including {international}{" "}
          international.
        </p>
      )}
    </>
  );
}

function PayForm({
  batch,
  busy,
  stagingReviewOnly,
  confirm,
  fail,
}: {
  batch: Batch;
  busy: boolean;
  stagingReviewOnly: boolean;
  confirm: () => Promise<void>;
  fail: (s: string) => void;
}) {
  const stripe = useStripe(),
    elements = useElements(),
    [submitting, setSubmitting] = useState(false);
  return (
    <form
      className="wed-pay-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements || submitting) return;
        setSubmitting(true);
        try {
          const { error } = await stripe.confirmPayment({
            elements,
            confirmParams: {
              return_url: location.origin + "/thank-you/wedding?return=payment",
            },
            redirect: "if_required",
          });
          if (error)
            throw new Error(
              error.message || "Please review the payment details.",
            );
          await confirm();
        } catch (err) {
          fail(errorMessage(err));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <PaymentElement />
      <button
        disabled={!stripe || busy || submitting}
        className="wed-primary"
        type="submit"
      >
        {submitting
          ? "Confirming payment…"
          : stagingReviewOnly
            ? `Pay ${dollars(batch.quote.totalCents)} in test mode`
            : `Pay ${dollars(batch.quote.totalCents)}`}
      </button>
    </form>
  );
}

export function ReviewPanel({
  state: { project: p, households, actor },
  refresh,
  notify,
  signIn,
  purchasingOpen,
  stagingReviewOnly = false,
}: PanelProps & { purchasingOpen: boolean; stagingReviewOnly?: boolean }) {
  const { user } = useAuth();
  const ready = households.filter((r) => isReady(p, r));
  const [selection, setSelection] = useState<Set<string>>(
      () => new Set(ready.slice(0, 100).map((r) => r.id)),
    ),
    [promotionCode, setPromotionCode] = useState(""),
    [offerReference, setOfferReference] = useState(""),
    [buyerEmail, setBuyerEmail] = useState(() => user?.email || ""),
    [preview, setPreview] = useState(""),
    [batch, setBatch] = useState<Batch | null>(null),
    [quoting, setQuoting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true);
  const quoteSeqRef = useRef(0);
  const active = p.activeBatchId || null;
  const [stripe, setStripe] = useState<ReturnType<typeof loadStripe> | null>(
    null,
  );
  const selected = ready.filter((r) => selection.has(r.id));
  const internationalSelected = selected.filter(
    (r) => r.address.country !== "US",
  ).length;
  const shown =
    households.find((r) => r.id === preview) || selected[0] || households[0];
  const signature = JSON.stringify(selected.map((r) => [r.id, r.revision]));
  const quoteKey = JSON.stringify({
    signature,
    promotionCode: promotionCode.trim(),
    offerReference,
    projectRevision: p.revision,
  });
  const enabled =
    purchasingOpen && (batch ? batch.checkoutEnabled !== false : true);

  useEffect(() => {
    if (!buyerEmail && user?.email) {
      setBuyerEmail(user.email);
    }
  }, [buyerEmail, user?.email]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    const linked = window.smnLinkedOffer;
    if (linked)
      void linked.then((reference) => {
        if (!current) return;
        if (reference) {
          setOfferReference(reference);
          setBatch(null);
        } else {
          setError(
            "This offer link is unavailable. You can still review regular pricing.",
          );
        }
      });
    else
      setPromotionCode(
        new URLSearchParams(location.search).get("discount") || "",
      );
    return () => {
      current = false;
    };
  }, []);

  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const api = (action: string, body: Record<string, unknown>) =>
    postWedding<Batch>("checkout", { action, ...body });

  async function progress(b: Batch): Promise<Batch> {
    if (!mounted.current) return b;
    setBatch(b);
    while (b.status === "preparing" && mounted.current) {
      b = await api("advance", { batchId: b.batchId });
      if (mounted.current) setBatch(b);
    }
    if (isSettledStatus(b.status)) {
      await refresh();
      if (stagingReviewOnly) {
        notify("Test payment received. Your purchased cards are on hold.");
      } else {
        if (b.batchId) {
          fireWeddingBrowserPurchase({
            batchId: b.batchId,
            totalCents: b.quote.totalCents,
            count: b.quote.count,
            stagingReviewOnly,
          });
          trackWeddingFunnelEvent("wedding_purchase_completed", {
            batchId: b.batchId,
            count: b.quote.count,
            totalCents: b.quote.totalCents,
            stagingReviewOnly: false,
          });
        }
        notify(
          "Payment received. Your thank-you cards are queued for real-pen writing and mailing.",
        );
      }
    }
    return b;
  }

  useEffect(() => {
    if (!active) return;
    void work(async () => {
      const b = await api("status", { batchId: active });
      await progress(b);
    });
  }, [active]);

  // Auto-quote current selection whenever Review & send opens or selection/offer changes.
  useEffect(() => {
    if (active) return;
    if (selected.length === 0) {
      setBatch((b) => (b?.batchId ? b : null));
      return;
    }
    const seq = ++quoteSeqRef.current;
    const delay = promotionCode.trim() ? 300 : 40;
    const timer = setTimeout(() => {
      setQuoting(true);
      void api("quote", {
        selection: selected.map((r) => ({ id: r.id, revision: r.revision })),
        promotionCode: promotionCode.trim() || undefined,
        offerReference: offerReference || undefined,
      })
        .then((quoted) => {
          if (!mounted.current || seq !== quoteSeqRef.current) return;
          setBatch((prev) => (prev?.batchId ? prev : quoted));
          setError("");
        })
        .catch((e) => {
          if (!mounted.current || seq !== quoteSeqRef.current) return;
          setBatch((prev) => (prev?.batchId ? prev : null));
          setError(errorMessage(e));
        })
        .finally(() => {
          if (mounted.current && seq === quoteSeqRef.current) {
            setQuoting(false);
          }
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [quoteKey, active]);

  async function openPaymentForm(targetBatch: Batch) {
    if (!targetBatch.batchId) return;
    const b = await api("pay", { batchId: targetBatch.batchId });
    const key = (b.publishableKey || "").trim();
    const keyValid = stagingReviewOnly
      ? key.startsWith("pk_test_")
      : key.startsWith("pk_live_");
    if (!keyValid || !b.clientSecret) {
      throw new Error(
        stagingReviewOnly
          ? "A test payment form is currently unavailable."
          : "The payment form is currently unavailable. Please try again.",
      );
    }
    setStripe(loadStripe(key));
    setBatch({ ...targetBatch, ...b });
  }

  async function continueToPayment() {
    const trimmedEmail = buyerEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(
        "Enter a valid email address for your receipt and private tracker link.",
      );
      return;
    }
    if (!selected.length) {
      setError("Select at least one ready card to continue.");
      return;
    }
    if (!(actor.role === "owner" || actor.canPay)) {
      setError(
        "Sign in as the project owner or an authorized payer to continue.",
      );
      return;
    }

    const selectionPayload = selected.map((r) => ({
      id: r.id,
      revision: r.revision,
    }));
    const currentQuote =
      batch && !batch.batchId && batch.quote
        ? batch
        : await api("quote", {
            selection: selectionPayload,
            promotionCode: promotionCode.trim() || undefined,
            offerReference: offerReference || undefined,
          });
    setBatch(currentQuote);

    trackWeddingFunnelEvent("wedding_checkout_started", {
      count: currentQuote.quote.count,
      totalCents: currentQuote.quote.totalCents,
      internationalCount: internationalSelected,
      hasPromotion: Boolean(promotionCode.trim() || offerReference),
    });

    const reserved = await api("reserve", {
      quoteHash: currentQuote.quote.id,
      selection: selectionPayload,
      promotionCode: promotionCode.trim() || undefined,
      offerReference: offerReference || undefined,
      buyerEmail: trimmedEmail,
      attribution: readWeddingAttributionPayload(),
    });
    const prepared = await progress(reserved);
    if (
      ["ready", "awaiting_payment"].includes(prepared.status || "") &&
      !prepared.clientSecret
    ) {
      await openPaymentForm(prepared);
    }
  }

  async function confirm() {
    if (!batch?.batchId) return;
    await progress(await api("confirm", { batchId: batch.batchId }));
  }

  const frozen =
    !!batch?.batchId &&
    !["held", "paid", "queued", "dispatched", "canceled", "cancelled"].includes(
      batch.status || "",
    );
  const localEstimate = quoteWeddingBatch(selected.length, p.purchasedCount);
  const summaryTotalCents =
    batch?.quote?.totalCents ??
    localEstimate.subtotalCents + internationalSelected * 500;

  return (
    <>
      <div className="wed-columns">
        <section className="wed-panel">
          <h2>Choose your envelopes</h2>
          <p>
            {ready.length} ready ·{" "}
            {households.filter((r) => !r.paidBatchId && !isReady(p, r)).length}{" "}
            held · {p.purchasedCount} purchased.
          </p>
          {ready.length > 100 && (
            <p className="wed-notice">
              You have {pluralize(ready.length, "ready card")}. The first 100
              are suggested for this purchase. The others stay ready at their
              earned prices.
            </p>
          )}
          <div className="wed-actions">
            <button
              disabled={frozen || busy}
              onClick={() => {
                setSelection(new Set(ready.slice(0, 100).map((r) => r.id)));
                setBatch(null);
              }}
            >
              Select first {Math.min(100, ready.length)} ready
            </button>
            <button
              disabled={frozen || busy}
              onClick={() => {
                setSelection(new Set());
                setBatch(null);
              }}
            >
              Clear selection
            </button>
          </div>
          <ul className="wed-list wed-scroll">
            {households.map((r) => (
              <li key={r.id}>
                <label>
                  <input
                    type="checkbox"
                    disabled={
                      frozen ||
                      busy ||
                      !isReady(p, r) ||
                      (!selection.has(r.id) && selected.length >= 100)
                    }
                    checked={selection.has(r.id) && isReady(p, r)}
                    onChange={(e) => {
                      const s = new Set(selection);
                      if (e.target.checked) s.add(r.id);
                      else s.delete(r.id);
                      setSelection(s);
                      setBatch(null);
                    }}
                  />
                  {r.envelopeName} ·{" "}
                  {r.paidBatchId
                    ? (r as Person & { refundStatus?: string }).refundStatus ===
                      "refunded"
                      ? "Refunded"
                      : stagingReviewOnly
                        ? "Ordered on hold"
                        : "Ordered"
                    : isReady(p, r)
                      ? "Ready"
                      : "Held"}
                </label>
                <button onClick={() => setPreview(r.id)}>
                  Preview card and envelope
                </button>
              </li>
            ))}
          </ul>
          {shown && <CardInspection key={shown.id} row={shown} project={p} />}
        </section>
        <section id="wed-review-total" className="wed-note">
          <h2>Your total</h2>
          <details className="wed-mobile-collapse" open>
            <summary>Pricing breakdown</summary>
            <Rates
              selected={selected.length}
              purchased={p.purchasedCount}
              international={internationalSelected}
            />
          </details>
          <p className="wed-meta">
            {stagingReviewOnly
              ? "Typical domestic transit is 2–7 business days after preparation. International delivery varies by country. Staging orders stay on hold."
              : "1–2 business days preparation + 2–7 business days estimated domestic USPS transit. International delivery varies by country."}
          </p>
          {!batch?.batchId && (
            <>
              <label>
                Email for receipt &amp; private tracker link
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={buyerEmail}
                  disabled={busy}
                  onChange={(e) => {
                    setBuyerEmail(e.target.value);
                    setError("");
                  }}
                />
              </label>
              {offerReference ? (
                <p className="wed-notice">
                  Linked offer saved.{" "}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOfferReference("");
                      setBatch(null);
                    }}
                  >
                    Remove offer
                  </button>
                </p>
              ) : (
                <label>
                  Offer code (optional)
                  <input
                    value={promotionCode}
                    disabled={busy}
                    autoComplete="off"
                    maxLength={128}
                    onChange={(e) => {
                      setPromotionCode(e.target.value);
                      setBatch(null);
                      setError("");
                    }}
                  />
                </label>
              )}
            </>
          )}
          <div className="wed-panel">
            <h3>
              {isSettledStatus(batch?.status)
                ? stagingReviewOnly
                  ? "Test order received"
                  : "Order confirmed"
                : "Batch total"}{" "}
              · <span className="wed-price">{dollars(summaryTotalCents)}</span>
            </h3>
            {batch?.quote ? (
              <>
                <p>
                  {pluralize(batch.quote.count, "card")} ·{" "}
                  <span className="wed-price">
                    {dollars(batch.quote.baseCents)}
                  </span>{" "}
                  cards +{" "}
                  <span className="wed-price">
                    {dollars(batch.quote.mailingCents)}
                  </span>{" "}
                  international mailing. Tax included.
                </p>
                {batch.quote.promotion && (
                  <p>
                    Offer savings −
                    <span className="wed-price">
                      {dollars(batch.quote.promotion.savingsCents)}
                    </span>
                    .
                    {batch.quote.promotion.remainingProjectUnits !== null &&
                      ` Project credit remaining after this batch: ${pluralize(batch.quote.promotion.remainingProjectUnits, "envelope")}.`}
                    {batch.quote.promotion.remainingProjectCents != null &&
                      ` Remaining credit: ${dollars(batch.quote.promotion.remainingProjectCents)}.`}
                  </p>
                )}
              </>
            ) : (
              <p className="wed-meta">
                {selected.length === 0
                  ? "Select ready cards on the left to calculate your batch total."
                  : quoting
                    ? "Calculating exact batch total…"
                    : `${pluralize(selected.length, "card")} selected · estimated ${dollars(summaryTotalCents)}.`}
              </p>
            )}
            {batch?.status === "preparing" && (
              <div className="wed-prepare-progress" role="status">
                <p>
                  Preparing {batch.preparedCount || 0} of{" "}
                  {pluralize(batch.count || batch.quote.count, "card")}…
                </p>
                <progress
                  max={batch.count || batch.quote.count || 1}
                  value={batch.preparedCount || 0}
                />
              </div>
            )}
            {!batch?.batchId &&
              (enabled ? (
                <button
                  type="button"
                  disabled={
                    busy ||
                    !selected.length ||
                    !(actor.role === "owner" || actor.canPay)
                  }
                  className="wed-primary"
                  onClick={() => void work(continueToPayment)}
                >
                  {busy
                    ? "Preparing payment…"
                    : stagingReviewOnly
                      ? `Continue to test payment — ${dollars(summaryTotalCents)}`
                      : `Continue to payment — ${dollars(summaryTotalCents)}`}
                </button>
              ) : (
                <p className="wed-meta">
                  {stagingReviewOnly
                    ? "Staging checkout is currently closed. Your project is saved."
                    : "Checkout is currently paused. Your project is saved."}
                </p>
              ))}
            {batch?.batchId &&
              ["ready", "awaiting_payment"].includes(batch.status || "") &&
              !batch.clientSecret && (
                <button
                  type="button"
                  className="wed-primary"
                  disabled={busy}
                  onClick={() => void work(() => openPaymentForm(batch))}
                >
                  {stagingReviewOnly
                    ? "Resume test payment"
                    : "Resume payment"}
                </button>
              )}
            {batch?.clientSecret && stripe && (
              <Elements
                stripe={stripe}
                options={{ clientSecret: batch.clientSecret }}
              >
                <PayForm
                  batch={batch}
                  busy={busy}
                  stagingReviewOnly={stagingReviewOnly}
                  fail={setError}
                  confirm={confirm}
                />
              </Elements>
            )}
            {isSettledStatus(batch?.status) && (
              <p>
                {stagingReviewOnly
                  ? "Your purchased cards are on hold. You can continue with the remaining envelopes."
                  : "Your thank-you cards are queued for real-pen writing and mailing. You can continue with any remaining envelopes."}
              </p>
            )}
            {frozen && (
              <div className="wed-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      await progress(
                        await api("confirm", { batchId: batch.batchId }),
                      );
                    })
                  }
                >
                  Check payment status
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      await api("cancel", { batchId: batch.batchId });
                      setBatch(null);
                      await refresh();
                    })
                  }
                >
                  Cancel this reservation
                </button>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="wed-notice">
              {error}{" "}
              {actor.role === "editor" && !actor.verified && (
                <button type="button" onClick={signIn}>
                  Sign in
                </button>
              )}
            </p>
          )}
        </section>
      </div>
      {selected.length > 0 && !isSettledStatus(batch?.status) && (
        <div className="wed-sticky-summary" aria-label="Selected batch summary">
          <div>
            <strong>{pluralize(selected.length, "card")}</strong>
            <span className="wed-price"> · {dollars(summaryTotalCents)}</span>
          </div>
          <a href="#wed-review-total" className="wed-primary">
            {batch?.clientSecret ? "Finish payment" : "Continue to payment"}
          </a>
        </div>
      )}
    </>
  );
}

type SavedCard = {
  note: string;
  handwriting: string;
  envelopeName: string;
  recipient: {
    address: {
      firstName: string;
      lastName: string;
      street1: string;
      street2: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
  };
  cover: { url: string };
};
function CardInspection({ row, project }: { row: Person; project: Project }) {
  const [card, setCard] = useState<SavedCard | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    if (!row.paidBatchId) return;
    let active = true;
    postWedding<{ card: SavedCard }>("checkout", {
      action: "card",
      batchId: row.paidBatchId,
      householdId: row.id,
    })
      .then((r) => {
        if (active) setCard(r.card);
      })
      .catch((e) => {
        if (active) setErr(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [row.id, row.paidBatchId]);
  const a = card?.recipient.address;
  const address = a
    ? [
        card?.envelopeName,
        a.street1,
        a.street2,
        [a.city, a.state, a.zip].filter(Boolean).join(" "),
        a.country,
      ]
        .filter(Boolean)
        .join("\n")
    : formatAddress(row);
  const url = card?.cover.url;
  const src =
    url && url.startsWith("/api/wedding/") && !url.includes("//")
      ? url
      : safePreview(url || project.cover.url);
  return (
    <details open>
      <summary>
        {row.envelopeName}’s {row.paidBatchId ? "purchased " : ""}card and
        envelope
      </summary>
      {err ? (
        <p role="alert">{err}</p>
      ) : row.paidBatchId && !card ? (
        <p role="status">Loading the purchased card…</p>
      ) : (
        <>
          <img className="wed-front" src={src} alt="Selected card front" />
          <pre
            className="wed-letter"
            style={{
              fontFamily: handFont(card?.handwriting || project.handwriting),
            }}
          >
            {card?.note ?? noteFor(project, row)}
          </pre>
          <pre className="wed-letter">{address}</pre>
        </>
      )}
    </details>
  );
}
