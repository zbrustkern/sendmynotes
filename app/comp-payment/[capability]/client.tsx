"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { AlertCircle, CheckCircle2, Loader2, Lock } from "lucide-react";

type PaymentPage = { orderId: string; status: string; quote: { lines: { label: string; grossCents: number; waivedCents: number; dueCents: number }[]; grossCents: number; waivedCents: number; customerPayableCents: number; currency: "USD" }; expiresAt: number };
type PaymentIntent = { clientSecret: string; amountCents: number; currency: "USD" };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const json = async (response: Response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "This payment request is unavailable."); return data; };

function PayForm({ capability, page, intent, onError, onSubmitted }: { capability: string; page: PaymentPage; intent: PaymentIntent; onError: (message: string) => void; onSubmitted: () => void }) {
  const stripe = useStripe(); const elements = useElements(); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!stripe || !elements || !ready || busy) return;
    setBusy(true); onError("");
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/comp-payment/${encodeURIComponent(capability)}` }, redirect: "if_required" });
      if (result.error) { onError(result.error.message || "Payment could not be confirmed. Please try again."); setBusy(false); return; }
      // A client confirmation is not the payment authority; wait for server verification.
      onSubmitted();
    } catch {
      onError("Payment confirmation could not be completed. Check the order status before trying again.");
      setBusy(false);
    }
  };
  return <form onSubmit={submit} className="mt-5 space-y-4"><PaymentElement onReady={() => setReady(true)} /><button type="submit" disabled={!stripe || !ready || busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}Pay {money(intent.amountCents)}</button><p className="text-center text-xs text-stone-500">Payment goes only toward this fixed order balance. The order will not be dispatched until payment is verified.</p></form>;
}

export function CompPaymentClient({ capability }: { capability: string }) {
  const [page, setPage] = useState<PaymentPage | null>(null); const [intent, setIntent] = useState<PaymentIntent | null>(null); const [stripeKey, setStripeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [awaitingVerification, setAwaitingVerification] = useState(false);
  useEffect(() => { let active = true; fetch(`/api/comp-payment/${encodeURIComponent(capability)}`, { cache: "no-store" }).then(json).then((data) => { if (active) setPage(data); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "This payment request could not be loaded."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [capability]);
  const stripePromise = useMemo(() => stripeKey ? loadStripe(stripeKey) : null, [stripeKey]);
  const refreshStatus = async () => {
    const data = await json(await fetch(`/api/comp-payment/${encodeURIComponent(capability)}`, { cache: "no-store" }));
    setPage(data);
    return data as PaymentPage;
  };
  const awaitVerifiedStatus = async () => {
    setAwaitingVerification(true); setIntent(null); setError("");
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const current = await refreshStatus();
        if (["paid", "paid_ready", "supplier_accepted", "fulfilled"].includes(current.status)) { setAwaitingVerification(false); return; }
      } catch { /* keep the confirmation in pending state and let the user retry status */ }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setAwaitingVerification(false);
  };
  const loadPayment = async () => { setBusy(true); setError(""); try { const data = await json(await fetch(`/api/comp-payment/${encodeURIComponent(capability)}/payment-intent`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })); const publishableKey = data.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null; if (!page || data.amountCents !== page.quote.customerPayableCents || data.currency !== "USD") throw new Error("The payment amount or currency does not match this order balance. No payment was started; contact support."); if (!data.clientSecret || !publishableKey) throw new Error("Secure payment is unavailable right now."); setIntent({ clientSecret: data.clientSecret, amountCents: data.amountCents, currency: data.currency }); setStripeKey(publishableKey); } catch (err) { setError(err instanceof Error ? err.message : "Secure payment is unavailable right now."); } finally { setBusy(false); } };
  const status = page?.status;
  const held = status === "review_only_held";
  const paid = status === "paid" || status === "paid_ready" || status === "supplier_accepted" || status === "fulfilled";
  const expired = Boolean(page && page.expiresAt <= Date.now());
  return <main className="min-h-screen bg-[#FAF8F5] px-4 py-10 text-stone-900"><div className="mx-auto max-w-xl rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8"><p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">SendMyNotes</p><h1 className="mt-2 font-serif text-2xl">Order payment</h1>{loading && <p role="status" className="mt-5">Loading payment request…</p>}{error && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</p>}{page && <>
    <p className="mt-2 text-sm text-stone-600">Order {page.orderId}</p>
    <div className="mt-5 divide-y divide-stone-100 rounded-lg border border-stone-200">{page.quote.lines.map((line, index) => <div key={`${line.label}-${index}`} className="flex justify-between gap-3 p-3 text-sm"><span>{line.label}<span className="block text-xs text-stone-500">{money(line.grossCents)} less {money(line.waivedCents)} admin adjustment</span></span><strong>{money(line.dueCents)}</strong></div>)}<div className="flex justify-between bg-stone-50 p-3 text-base"><span>Balance due</span><strong>{money(page.quote.customerPayableCents)}</strong></div></div>
    {held && <div role="status" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Staging review only.</strong> This order is held. No payment link is active, and no payment, email, printing, fulfillment, or mailing will occur.</div>}
    {paid && <div role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm"><CheckCircle2 className="mr-2 inline h-4 w-4" />Payment is verified for this order. Any next step will be shown in the order status.</div>}
    {awaitingVerification && <div role="status" className="mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">Payment was submitted. Waiting for the server to verify it; do not pay again. This page checks the order status automatically.</div>}
    {expired && !paid && !held && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">This payment request has expired. Ask the sender for an updated link.</p>}
    {!loading && !held && !paid && !expired && status === "payment_pending" && !intent && !awaitingVerification && <button type="button" onClick={loadPayment} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue to secure payment · {money(page.quote.customerPayableCents)}</button>}
    {intent && stripePromise && page && <Elements key={intent.clientSecret} stripe={stripePromise} options={{ clientSecret: intent.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#44403c", borderRadius: "10px" } } }}><PayForm capability={capability} page={page} intent={intent} onError={setError} onSubmitted={awaitVerifiedStatus} /></Elements>}
    {status === "payment_pending" && !paid && !held && (awaitingVerification || intent) && <button type="button" onClick={() => { void refreshStatus().catch((err) => setError(err instanceof Error ? err.message : "Status check failed.")); }} className="mt-3 rounded-lg border border-stone-300 px-3 py-2 text-sm">Check payment status</button>}
    <p className="mt-6 text-xs text-stone-500">This link can pay only the displayed balance for this order. It cannot change card details, address, or adjustment.</p>
  </>}</div></main>;
}
