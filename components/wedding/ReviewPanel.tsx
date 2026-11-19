"use client";
import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { quoteWeddingBatch, WEDDING_PRICE_BANDS } from "@/lib/wedding-pricing";
import {
  errorMessage,
  formatAddress,
  noteFor,
  isReady,
  dollars,
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
              (l) =>
                l.first >= b.first && (b.last === null || l.first <= b.last),
            );
            return (
              <tr key={b.first}>
                <th>{b.last ? b.first + "–" + b.last : b.first + "+"}</th>
                <td>{dollars(b.unitCents)}</td>
                <td>{l ? l.quantity + " × " + dollars(l.unitCents) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        Domestic mailing included. International mailing adds $5.00 per
        envelope. Your next batch picks up where you left off.
      </p>
      {selected > 0 && (
        <p>
          <strong>
            Estimated {dollars(estimate.subtotalCents + international * 500)}
          </strong>{" "}
          for {selected} envelopes, including {international} international.
        </p>
      )}
    </>
  );
}
function PayForm({
  batch,
  busy,
  confirm,
  fail,
}: {
  batch: Batch;
  busy: boolean;
  confirm: () => Promise<void>;
  fail: (s: string) => void;
}) {
  const stripe = useStripe(),
    elements = useElements(),
    [submitting, setSubmitting] = useState(false);
  return (
    <form
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
        } catch (e) {
          fail(errorMessage(e));
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
        Pay {dollars(batch.quote.totalCents)} in test mode
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
}: PanelProps & { purchasingOpen: boolean }) {
  const ready = households.filter((r) => isReady(p, r));
  const [selection, setSelection] = useState<Set<string>>(
      () => new Set(ready.slice(0, 100).map((r) => r.id)),
    ),
    [preview, setPreview] = useState(""),
    [batch, setBatch] = useState<Batch | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(true);
  const active = p.activeBatchId || null;
  const [stripe, setStripe] = useState<ReturnType<typeof loadStripe> | null>(
    null,
  );
  const selected = ready.filter((r) => selection.has(r.id));
  const shown =
    households.find((r) => r.id === preview) || selected[0] || households[0];
  const signature = JSON.stringify(selected.map((r) => [r.id, r.revision]));
  const enabled = purchasingOpen && batch?.checkoutEnabled === true;
  useEffect(() => {
    if (!active) setBatch((b) => (b?.batchId ? b : null));
  }, [signature, active, p.revision]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
  async function progress(b: Batch) {
    if (!mounted.current) return;
    setBatch(b);
    while (b.status === "preparing" && mounted.current) {
      b = await api("advance", { batchId: b.batchId });
      if (mounted.current) setBatch(b);
    }
    if (b.status === "held") {
      await refresh();
      notify("Test payment received. Your purchased cards are on hold.");
    }
  }
  useEffect(() => {
    if (!active) return;
    void work(async () => {
      const b = await api("status", { batchId: active });
      await progress(b);
    });
  }, [active]);
  async function getQuote() {
    setBatch(
      await api("quote", {
        selection: selected.map((r) => ({ id: r.id, revision: r.revision })),
      }),
    );
  }
  async function reserve() {
    if (!batch) return;
    const b = await api("reserve", {
      quoteHash: batch.quote.id,
      selection: selected.map((r) => ({ id: r.id, revision: r.revision })),
    });
    await progress(b);
  }
  async function pay() {
    if (!batch?.batchId) return;
    const b = await api("pay", { batchId: batch.batchId });
    if (!b.publishableKey?.startsWith("pk_test_") || !b.clientSecret)
      throw new Error("A test payment form is currently unavailable.");
    setStripe(loadStripe(b.publishableKey));
    setBatch({ ...batch, ...b });
  }
  async function confirm() {
    if (!batch?.batchId) return;
    await progress(await api("confirm", { batchId: batch.batchId }));
  }
  const frozen =
    !!batch?.batchId &&
    !["held", "canceled", "cancelled"].includes(batch.status || "");
  return (
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
            You have {ready.length} ready cards. The first 100 are suggested for
            this purchase. The others stay ready at their earned prices.
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
                    : "Ordered on hold"
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
      <section className="wed-note">
        <h2>Your total</h2>
        <Rates
          selected={selected.length}
          purchased={p.purchasedCount}
          international={
            selected.filter((r) => r.address.country !== "US").length
          }
        />
        <p className="wed-meta">
          Typical domestic transit is 2–7 business days after preparation.
          International delivery varies by country. Staging orders stay on hold.
        </p>
        {(!batch || !batch.batchId) && (
          <button
            disabled={busy || !selected.length}
            className="wed-primary"
            onClick={() => void work(getQuote)}
          >
            Review exact total
          </button>
        )}
        {batch?.quote && (
          <div className="wed-panel">
            <h3>
              {batch.status === "held"
                ? "Test order received"
                : "Reviewed total"}{" "}
              · {dollars(batch.quote.totalCents)}
            </h3>
            <p>
              {batch.quote.count} cards · {dollars(batch.quote.baseCents)} cards
              + {dollars(batch.quote.mailingCents)} international mailing. Tax
              included.
            </p>
            {batch.status === "preparing" && (
              <p role="status">
                Preparing {batch.preparedCount || 0} of {batch.count} envelopes…
              </p>
            )}
            {!batch.batchId &&
              (enabled ? (
                <button
                  disabled={busy || !(actor.role === "owner" || actor.canPay)}
                  className="wed-primary"
                  onClick={() => void work(reserve)}
                >
                  Confirm these {batch.quote.count} envelopes
                </button>
              ) : (
                <p>
                  Staging checkout is currently closed. Your project is saved.
                </p>
              ))}
            {batch.batchId &&
              ["ready", "awaiting_payment"].includes(batch.status || "") &&
              !batch.clientSecret && (
                <button disabled={busy} onClick={() => void work(pay)}>
                  Open secure test payment
                </button>
              )}
            {batch.clientSecret && stripe && (
              <Elements
                stripe={stripe}
                options={{ clientSecret: batch.clientSecret }}
              >
                <PayForm
                  batch={batch}
                  busy={busy}
                  fail={setError}
                  confirm={confirm}
                />
              </Elements>
            )}
            {batch.status === "held" && (
              <p>
                Your purchased cards are on hold. You can continue with the
                remaining envelopes.
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
        )}
        {error && (
          <p role="alert" className="wed-notice">
            {error}{" "}
            {actor.role === "editor" && !actor.verified && (
              <button onClick={signIn}>Sign in</button>
            )}
          </p>
        )}
      </section>
    </div>
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
