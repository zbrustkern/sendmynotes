"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, X } from "lucide-react";
import { MailingAddress } from "@/lib/types";
import type { AdminCompCatalogResponse, AdminCompCreateOrderResponse, AdminCompLifecycleStatus, AdminCompMode, AdminCompPaymentRequestStatus, AdminCompQuoteSnapshot } from "@/lib/admin-comp-types";
import { US_STATES } from "@/components/v3/Step3EnvelopeAddressing";

type Mode = AdminCompMode;
type CatalogLine = AdminCompCatalogResponse["lines"][number];
type Destination = { countryCode: string; countryName: string; regionRequired: boolean; postalCodeRequired: boolean; regions: { code: string; name: string }[] };
type Catalog = AdminCompCatalogResponse;
type Quote = AdminCompQuoteSnapshot;
type OrderResult = AdminCompCreateOrderResponse;
type CountryOption = { countryCode: string; countryName: string; available?: boolean; regionRequired: boolean; postalCodeRequired: boolean; regions?: { code: string; name: string }[] };
type Preset = { id: string; title: string; url: string };

const FALLBACK_PRESET_COVERS: Preset[] = [
  { id: "preset:birthday-balloons", title: "Celebration Garland", url: "/presets/birthday-balloons.jpg" },
  { id: "preset:thank-you-botanical", title: "Wildflower Meadow", url: "/presets/thank-you-botanical.jpg" },
  { id: "preset:thinking-of-you-misty-pines", title: "Misty Pines & Dawn", url: "/presets/thinking-of-you-misty-pines.jpg" },
  { id: "preset:congrats-champagne", title: "Golden Cheers Coupes", url: "/presets/congrats-champagne.jpg" },
  { id: "preset:anniversary-monstera", title: "Botanical Wreath", url: "/presets/anniversary-monstera.jpg" },
  { id: "preset:love-roses", title: "Velvet Blossoms", url: "/presets/love-roses.jpg" },
];

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const parseCents = (raw: string): number | null => {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [dollars, fraction = ""] = value.split(".");
  return Number(dollars) * 100 + Number((fraction + "00").slice(0, 2));
};
const emptyAddress = (country = "US"): MailingAddress => ({ firstName: "", lastName: "", street1: "", street2: "", city: "", state: "", zip: "", country });
const json = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};

export function StudioCompModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const quoteGeneration = useRef(0);
  const createKey = useRef<string | null>(null);
  const createFingerprint = useRef<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countryError, setCountryError] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [mode, setMode] = useState<Mode>("full_comp");
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [reason, setReason] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [coverId, setCoverId] = useState(FALLBACK_PRESET_COVERS[0].id);
  const [fontStyleId, setFontStyleId] = useState("hwDavid");
  const [printedGreeting, setPrintedGreeting] = useState("");
  const [handwrittenNote, setHandwrittenNote] = useState("");
  const [recipient, setRecipient] = useState<MailingAddress>(emptyAddress("US"));
  const [returnAddress, setReturnAddress] = useState<MailingAddress>(emptyAddress("US"));
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [paymentLink, setPaymentLink] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => restoreFocusRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let active = true;
    fetch("/api/mailing-options", { cache: "no-store" }).then(json).then((data) => {
      if (!active) return;
      const available = (data.destinations || []).filter((d: CountryOption) => d.available !== false);
      setCountries([{ countryCode: "US", countryName: "United States", regionRequired: true, postalCodeRequired: true, regions: [] }, ...available].sort((a: CountryOption, b: CountryOption) => a.countryName.localeCompare(b.countryName)));
    }).catch((err: Error) => { if (active) setCountryError(err.message || "Could not load destination options."); }).finally(() => { if (active) setCountriesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const seq = ++quoteGeneration.current;
    setCatalogLoading(true); setCatalogError(""); setCatalog(null); setQuote(null); setQuoteError("");
    fetch(`/api/admin/comp/catalog?countryCode=${encodeURIComponent(countryCode)}`, { cache: "no-store" }).then(json).then((data) => {
      if (active && seq === quoteGeneration.current) setCatalog(data);
    }).catch((err: Error) => { if (active && seq === quoteGeneration.current) setCatalogError(err.message || "Could not load pricing for this destination."); }).finally(() => { if (active && seq === quoteGeneration.current) setCatalogLoading(false); });
    return () => { active = false; };
  }, [countryCode]);

  const country = useMemo(() => countries.find((item) => item.countryCode === countryCode), [countries, countryCode]);
  const destination = catalog?.destination;
  const lines = catalog?.lines || [];
  const [quoteReasonSnapshot, setQuoteReasonSnapshot] = useState("");
  const auditReason = useMemo(() => [reason.trim(), internalNote.trim()].filter(Boolean).join(" — "), [internalNote, reason]);
  const quoteFresh = Boolean(quote && quote.expiresAt > Date.now() && quote.destinationCountryCode === countryCode && quote.mode === mode && quoteReasonSnapshot === auditReason);
  const presetCovers: Preset[] = catalog?.presets?.length ? catalog.presets.map((preset) => ({ id: preset.assetId, title: preset.label, url: preset.url })) : FALLBACK_PRESET_COVERS;
  const isHeldPreview = Boolean(result?.staging.held || result?.lifecycleStatus === "review_only_held");

  const createQuote = useCallback(async (nextMode = mode, values = adjustments) => {
    if (!catalog) return null;
    const generation = ++quoteGeneration.current;
    setQuoteLoading(true); setQuoteError(""); setError(""); setQuote(null);
    try {
      const body: { mode: Mode; destinationCountryCode: string; adjustments?: { lineId: string; waivedCents: number }[]; reason: string } = {
        mode: nextMode, destinationCountryCode: countryCode, reason: auditReason,
      };
      if (nextMode === "individual_adjustments") {
        body.adjustments = lines.filter((line) => line.adjustmentEligible).map((line) => {
          const cents = parseCents(values[line.lineId] || "0");
          const maximum = line.unitPriceCents * line.quantity;
          if (cents === null || cents < 0 || cents > maximum) {
            throw new Error(`${line.label} adjustment must be a whole-cent amount from $0.00 through ${money(maximum)}.`);
          }
          return { lineId: line.lineId, waivedCents: cents };
        });
      }
      const data = await json(await fetch("/api/admin/comp/quotes", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) }));
      if (generation !== quoteGeneration.current) return null;
      setQuote(data.quote);
      setQuoteReasonSnapshot(auditReason);
      return data.quote as Quote;
    } catch (err) {
      if (generation === quoteGeneration.current) setQuoteError(err instanceof Error ? err.message : "Could not calculate the admin adjustment.");
      return null;
    } finally { if (generation === quoteGeneration.current) setQuoteLoading(false); }
  }, [adjustments, auditReason, catalog, countryCode, lines, mode]);

  const invalidateQuote = () => {
    quoteGeneration.current += 1;
    setQuote(null); setQuoteError(""); setError(""); setPaymentLink("");
  };
  const setRecipientField = (key: keyof MailingAddress, value: string) => { setRecipient((old) => ({ ...old, [key]: value })); invalidateQuote(); };
  const setReturnField = (key: keyof MailingAddress, value: string) => { setReturnAddress((old) => ({ ...old, [key]: value })); invalidateQuote(); };

  const validateAddress = (address: MailingAddress, rules: Destination | undefined, label: string): string[] => {
    const errors: string[] = [];
    if (!address.firstName.trim()) errors.push(`${label} first name is required.`);
    if (!address.lastName.trim()) errors.push(`${label} last name is required.`);
    if (!address.street1.trim()) errors.push(`${label} street address is required.`);
    if (!address.city.trim()) errors.push(`${label} city is required.`);
    if (rules?.regionRequired && !address.state.trim()) errors.push(`${label} region is required.`);
    if (rules?.postalCodeRequired && !address.zip.trim()) errors.push(`${label} postal code is required.`);
    return errors;
  };

  const handleContinue = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!catalog) { setError(catalogError || "Destination pricing is not ready."); return; }
    if (!reason.trim()) { setError("A reason is required for the admin adjustment."); return; }
    if (reason.trim() === "Other" && !internalNote.trim()) { setError("Add an internal note when the reason is Other."); return; }
    if (auditReason.length > 500) { setError("The reason and internal note must total 500 characters or fewer."); return; }
    if (!handwrittenNote.trim()) { setError("Add the card’s handwritten message before continuing."); return; }
    const recipientErrors = validateAddress(recipient, destination, "Recipient");
    const usRules = { regionRequired: true, postalCodeRequired: true } as Destination;
    const senderErrors = validateAddress(returnAddress, usRules, "Personal US return address");
    if (recipientErrors.length || senderErrors.length) { setError([...recipientErrors, ...senderErrors].join(" ")); return; }
    const newQuote = await createQuote();
    if (newQuote) setStep(2);
  };

  const updateAdjustment = (lineId: string, raw: string) => {
    setAdjustments((old) => ({ ...old, [lineId]: raw })); invalidateQuote();
  };
  const refreshQuote = async () => { await createQuote(mode, adjustments); };
  const toReview = async () => {
    if (!quoteFresh) { await refreshQuote(); return; }
    setStep(3);
  };
  const backToAdjustments = () => { setStep(2); invalidateQuote(); };

  const fingerprint = useMemo(() => JSON.stringify({ quoteId: quote?.quoteId, coverId, fontStyleId, printedGreeting, handwrittenNote, recipient, returnAddress, customerEmail: customerEmail.trim() }), [coverId, customerEmail, fontStyleId, handwrittenNote, printedGreeting, quote?.quoteId, recipient, returnAddress]);

  const createOrder = async () => {
    if (!quote || (!quoteFresh && !(createKey.current && createFingerprint.current === fingerprint))) { setError("The quote has expired or changed. Refresh it before creating the order."); return; }
    setBusy(true); setError(""); setPaymentStatus("");
    try {
      if (createFingerprint.current !== fingerprint || !createKey.current) {
        createKey.current = crypto.randomUUID(); createFingerprint.current = fingerprint;
      }
      const data = await json(await fetch("/api/admin/comp/orders", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": createKey.current }, credentials: "same-origin",
        body: JSON.stringify({ quoteId: quote.quoteId, idempotencyKey: createKey.current, frontImageAssetId: coverId, printedMessage: printedGreeting, handwrittenNote, fontStyleId, recipientAddress: { ...recipient, country: countryCode }, returnAddress: { ...returnAddress, country: "US" }, customerEmail: customerEmail.trim() || undefined }),
      }));
      const created = data as OrderResult;
      setResult(created); setStep(3); onSuccess();
      if (created.paymentRequest?.capabilityUrl) setPaymentLink(created.paymentRequest.capabilityUrl);
      if (created.paymentRequest?.status === "review_only_held" || created.staging?.held) setPaymentStatus("This staging review is held. No payment link, email, or supplier dispatch was created.");
      else if (created.quote.customerPayableCents > 0 && created.orderId) {
        setPaymentStatus("Payment request is pending.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Order creation outcome is unclear. Retry or check status before starting another order."); }
    finally { setBusy(false); }
  };

  const createPaymentRequest = async () => {
    if (!result || result.quote.customerPayableCents <= 0) return;
    setBusy(true); setError("");
    try {
      const data = await json(await fetch(`/api/admin/comp/orders/${encodeURIComponent(result.orderId)}/payment-request`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `comp-payment-${result.orderId}` }, credentials: "same-origin", body: "{}" }));
      const paymentRequest = data.paymentRequest;
      if (paymentRequest.status === "review_only_held") setPaymentStatus("Held for staging review. No payment link or PaymentIntent was created.");
      else { setPaymentStatus(`Payment request ready for ${money(paymentRequest.amountCents)}.`); setPaymentLink(paymentRequest.capabilityUrl || ""); }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create the payment request. Check status and retry."); }
    finally { setBusy(false); }
  };

  const checkStatus = async () => {
    if (!result) return;
    setBusy(true); setError("");
    try {
      const data = await json(await fetch(`/api/admin/comp/orders/${encodeURIComponent(result.orderId)}`, { cache: "no-store", credentials: "same-origin" }));
      const refreshed = data as { lifecycleStatus: AdminCompLifecycleStatus; paymentRequestStatus: AdminCompPaymentRequestStatus; paymentStatus: AdminCompPaymentRequestStatus; amountDueCents: number; quote: Quote };
      setResult((old) => old ? { ...old, lifecycleStatus: refreshed.lifecycleStatus, quote: refreshed.quote, paymentRequest: { ...old.paymentRequest, status: refreshed.paymentRequestStatus || refreshed.paymentStatus } } : old);
      const held = refreshed.lifecycleStatus === "review_only_held" || refreshed.paymentRequestStatus === "review_only_held";
      setPaymentStatus(held ? "Held for staging review. Nothing was paid or dispatched." : refreshed.paymentRequestStatus === "paid" ? "Payment is verified by the server." : `Current order status: ${refreshed.lifecycleStatus}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Status is unavailable. Retry this check."); }
    finally { setBusy(false); }
  };

  const copyLink = async () => { try { await navigator.clipboard.writeText(paymentLink); setPaymentStatus("Payment link copied. No email was sent."); } catch { setPaymentStatus("Copy failed. Select and copy the link manually; no email was sent."); } };

  const addressInputs = (value: MailingAddress, setter: (key: keyof MailingAddress, value: string) => void, rules: Destination | undefined, prefix: string, sender = false) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="text-xs">First name<input autoComplete={sender ? "section-sender given-name" : "section-recipient given-name"} value={value.firstName} onChange={(e) => setter("firstName", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label className="text-xs">Last name<input autoComplete={sender ? "section-sender family-name" : "section-recipient family-name"} value={value.lastName} onChange={(e) => setter("lastName", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label className="text-xs sm:col-span-2">Street address<input autoComplete={sender ? "section-sender address-line1" : "section-recipient address-line1"} value={value.street1} onChange={(e) => setter("street1", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label className="text-xs sm:col-span-2">Apartment, suite, etc. (optional)<input autoComplete={sender ? "section-sender address-line2" : "section-recipient address-line2"} value={value.street2 || ""} onChange={(e) => setter("street2", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label className="text-xs">City or locality<input autoComplete={sender ? "section-sender address-level2" : "section-recipient address-level2"} value={value.city} onChange={(e) => setter("city", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <label className="text-xs">{rules?.regions?.length ? "State / province" : "Region / state (optional)"}{rules?.regions?.length ? <select autoComplete={sender ? "section-sender address-level1" : "section-recipient address-level1"} value={value.state} onChange={(e) => setter("state", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="">Choose region</option>{rules.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select> : <input autoComplete={sender ? "section-sender address-level1" : "section-recipient address-level1"} value={value.state} onChange={(e) => setter("state", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" />}</label>
      <label className="text-xs">Postal code<input autoComplete={sender ? "section-sender postal-code" : "section-recipient postal-code"} value={value.zip} onChange={(e) => setter("zip", e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
      <p className="text-[11px] text-stone-500 sm:col-span-2">{prefix}{rules?.postalCodeRequired ? " Postal code required." : ""}{rules?.regionRequired ? " Region required." : ""}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/60 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="comp-title" aria-describedby="comp-description" className="flex max-h-screen w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[94vh] sm:rounded-2xl">
        <header className="flex items-start justify-between border-b border-stone-200 px-4 py-4 sm:px-6">
          <div><p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">SendMyNotes · Admin only</p><h2 id="comp-title" className="mt-1 font-serif text-xl font-semibold">Create a complimentary card</h2><p id="comp-description" className="mt-1 text-xs text-stone-600">Create a new card, then review pricing and choose what to cover.</p></div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="Close complimentary card dialog" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 text-xs sm:px-6" aria-label="Progress"><span className={`rounded-full px-2 py-1 ${step === 1 ? "bg-stone-900 text-white" : "bg-stone-100"}`}>1 · Card & address</span><span className={`rounded-full px-2 py-1 ${step === 2 ? "bg-stone-900 text-white" : "bg-stone-100"}`}>2 · Adjustment</span><span className={`rounded-full px-2 py-1 ${step === 3 ? "bg-stone-900 text-white" : "bg-stone-100"}`}>3 · Review</span></div>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {countryError && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Could not load destination list: {countryError}</div>}
          {catalogError && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Could not load the server quote catalog: {catalogError}</div>}

          {step === 1 && !result && <form onSubmit={handleContinue} className="space-y-5">
            <fieldset><legend className="mb-2 text-sm font-semibold">Card cover</legend><div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{presetCovers.map((preset) => <button key={preset.id} type="button" aria-pressed={coverId === preset.id} onClick={() => { setCoverId(preset.id); invalidateQuote(); }} className={`relative aspect-[4.25/5.5] overflow-hidden rounded-lg border-2 ${coverId === preset.id ? "border-stone-900 ring-2 ring-stone-300" : "border-stone-200"}`}><Image src={preset.url} alt={preset.title} fill sizes="120px" unoptimized className="object-cover" /><span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1 text-[9px] text-white">{preset.title}</span></button>)}</div><p className="mt-2 text-[11px] text-stone-500">Choose a cover from your collection.</p></fieldset>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Handwriting style<select value={fontStyleId} onChange={(e) => { setFontStyleId(e.target.value); invalidateQuote(); }} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="hwDavid">Casual David</option><option value="hwChase">Charming Chase</option><option value="hwKate">Carefree Kate</option><option value="hwAdam">Executive Adam</option><option value="hwWill">Dapper Will</option></select></label><label className="text-xs">Greeting (optional)<input value={printedGreeting} onChange={(e) => { setPrintedGreeting(e.target.value); invalidateQuote(); }} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label></div>
            <label className="block text-xs">Handwritten note *<textarea required rows={5} value={handwrittenNote} onChange={(e) => { setHandwrittenNote(e.target.value); invalidateQuote(); }} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label>
            <div className="rounded-xl border border-stone-200 p-3"><label className="block text-sm font-semibold">Recipient destination</label><select aria-label="Recipient country" value={countryCode} disabled={countriesLoading} onChange={(e) => { const code = e.target.value; setCountryCode(code); setRecipient((old) => ({ ...old, country: code, state: "" })); invalidateQuote(); }} className="mt-2 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="US">United States</option>{countries.filter((x) => x.countryCode !== "US").map((item) => <option key={item.countryCode} value={item.countryCode}>{item.countryName}</option>)}</select><div className="mt-3">{addressInputs(recipient, setRecipientField, destination || (countryCode === "US" ? { countryCode: "US", countryName: "United States", regionRequired: true, postalCodeRequired: true, regions: US_STATES.map((s) => ({ code: s.code, name: s.name })) } : country ? { ...country, regions: country.regions || [] } : undefined), "Recipient address.")}</div></div>
            <div className="rounded-xl border border-stone-200 p-3"><h3 className="text-sm font-semibold">Personal US return address</h3><p className="mb-3 text-[11px] text-stone-500">Required for the envelope. Enter the sender’s own address.</p>{addressInputs(returnAddress, setReturnField, { countryCode: "US", countryName: "United States", regionRequired: true, postalCodeRequired: true, regions: US_STATES.map((s) => ({ code: s.code, name: s.name })) }, "US return address.", true)}</div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Customer email (optional; this flow does not send email)<input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label><div><label className="block text-xs">Reason *<select value={reason} onChange={(e) => { setReason(e.target.value); invalidateQuote(); }} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2"><option value="">Choose reason</option><option>Personal gift</option><option>Founder sample</option><option>Service recovery</option><option>Other</option></select></label><label className="mt-2 block text-xs">Internal note (optional; included in the audit reason)<textarea rows={2} maxLength={450} value={internalNote} onChange={(e) => { setInternalNote(e.target.value); invalidateQuote(); }} className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2" /></label></div></div>
            <div className="flex justify-end"><button type="submit" disabled={catalogLoading || !catalog || countriesLoading} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{catalogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Review adjustment <ArrowRight className="h-4 w-4" /></button></div>
          </form>}

          {step === 2 && !result && <div className="space-y-5">
            <div className="rounded-xl border border-stone-200 p-4"><h3 className="font-semibold">Admin adjustment</h3><fieldset className="mt-3 grid gap-2 sm:grid-cols-2"><legend className="sr-only">Choose adjustment mode</legend><label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === "full_comp" ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}><input type="radio" name="comp-mode" checked={mode === "full_comp"} onChange={() => { setMode("full_comp"); setAdjustments({}); invalidateQuote(); }} /><span><strong className="block text-sm">Fully complimentary</strong><span className="text-xs text-stone-600">Cover every eligible current line.</span></span></label><label className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${mode === "individual_adjustments" ? "border-stone-900 bg-stone-50" : "border-stone-200"}`}><input type="radio" name="comp-mode" checked={mode === "individual_adjustments"} onChange={() => { setMode("individual_adjustments"); invalidateQuote(); }} /><span><strong className="block text-sm">Adjust individual items</strong><span className="text-xs text-stone-600">Choose a waiver for each eligible line.</span></span></label></fieldset>
              <div className="mt-4 overflow-hidden rounded-lg border border-stone-200"><div className="grid grid-cols-[1fr_5rem_7rem] gap-2 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-600"><span>Order item</span><span className="text-right">Price</span><span className="text-right">Comp</span></div>{lines.map((line) => <div key={line.lineId} className="grid grid-cols-[1fr_5rem_7rem] items-center gap-2 border-t border-stone-100 px-3 py-3 text-xs"><span>{line.label}</span><span className="text-right tabular-nums">{money(line.unitPriceCents * line.quantity)}</span><span className="text-right">{mode === "full_comp" ? <span className="tabular-nums">−{money(line.unitPriceCents * line.quantity)}</span> : <label className="sr-only" htmlFor={`adjustment-${line.lineId}`}>{line.label} comp amount in dollars</label>}{mode === "individual_adjustments" && <input id={`adjustment-${line.lineId}`} aria-label={`${line.label} comp amount in dollars`} type="number" min="0" max={(line.unitPriceCents * line.quantity / 100).toFixed(2)} step="0.01" value={adjustments[line.lineId] ?? "0.00"} disabled={!line.adjustmentEligible} onChange={(e) => updateAdjustment(line.lineId, e.target.value)} className="w-full rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums disabled:bg-stone-100" />}</span></div>)}</div>
              <p className="mt-2 text-[11px] text-stone-500">Adjustments must use whole cents and cannot exceed an item’s price.</p>
              <div aria-live="polite" className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">{quoteFresh && quote ? <><div className="flex justify-between"><span>Listed total</span><strong>{money(quote.grossCents)}</strong></div><div className="mt-1 flex justify-between"><span>Admin comp adjustment</span><strong>−{money(quote.waivedCents)}</strong></div><div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-base"><span>Customer pays</span><strong>{money(quote.customerPayableCents)}</strong></div></> : <span>{quoteLoading ? "Updating totals…" : "Update totals to continue."}</span>}</div>
              {quoteError && <p role="alert" className="mt-2 text-sm text-rose-700">{quoteError}</p>}
              <div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setStep(1)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm">Back</button><button type="button" onClick={refreshQuote} disabled={quoteLoading || !catalog} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">{quoteLoading ? "Updating…" : "Update totals"}</button><button type="button" onClick={toReview} disabled={quoteLoading || !quoteFresh} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review <ArrowRight className="h-4 w-4" /></button></div>
            </div>
          </div>}

          {step === 3 && !result && quote && <div className="space-y-4">
            <div className="rounded-xl border border-stone-200 p-4"><h3 className="font-semibold">Review new card</h3><dl className="mt-3 grid gap-y-3 text-sm sm:grid-cols-[9rem_1fr]"><dt className="text-stone-500">Recipient address</dt><dd>{recipient.firstName} {recipient.lastName}<br />{recipient.street1}{recipient.street2 ? <><br />{recipient.street2}</> : null}<br />{recipient.city}{recipient.state ? `, ${recipient.state}` : ""} {recipient.zip}<br />{destination?.countryName || country?.countryName}</dd><dt className="text-stone-500">Personal US return</dt><dd>{returnAddress.firstName} {returnAddress.lastName}<br />{returnAddress.street1}{returnAddress.street2 ? <><br />{returnAddress.street2}</> : null}<br />{returnAddress.city}, {returnAddress.state} {returnAddress.zip}<br />United States</dd><dt className="text-stone-500">Card</dt><dd>{presetCovers.find((x) => x.id === coverId)?.title}; {({ hwDavid: "Casual David", hwChase: "Charming Chase", hwKate: "Carefree Kate", hwAdam: "Executive Adam", hwWill: "Dapper Will" } as Record<string, string>)[fontStyleId] || fontStyleId}</dd><dt className="text-stone-500">Greeting</dt><dd>{printedGreeting || "None"}</dd><dt className="text-stone-500">Handwritten note</dt><dd className="whitespace-pre-wrap">{handwrittenNote}</dd><dt className="text-stone-500">Reason</dt><dd>{auditReason}</dd></dl></div>
            <div className="rounded-xl border border-stone-200"><div className="divide-y divide-stone-100">{quote.lines.map((line) => <div key={line.lineId} className="flex justify-between gap-3 p-3 text-sm"><span>{line.label}<span className="block text-xs text-stone-500">{money(line.grossCents)} − {money(line.waivedCents)} adjustment</span></span><strong>{money(line.dueCents)}</strong></div>)}</div><div className="space-y-1 bg-stone-50 p-3 text-sm"><div className="flex justify-between"><span>Original total</span><strong>{money(quote.grossCents)}</strong></div><div className="flex justify-between"><span>Admin adjustment</span><strong>−{money(quote.waivedCents)}</strong></div><div className="flex justify-between border-t border-stone-200 pt-2 text-base"><span>Customer pays</span><strong>{money(quote.customerPayableCents)}</strong></div></div></div>
            {catalog?.staging.reviewOnly && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><strong>Staging review only.</strong> The order will be held. No payment, email, printing, fulfillment, or mailing will occur.</div>}
            {!quoteFresh && <p role="alert" className="text-sm text-rose-700">This quote expired or the details changed. Go back and refresh.</p>}
            <div className="flex flex-wrap justify-between gap-2"><button type="button" onClick={backToAdjustments} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" />Edit adjustment</button><button type="button" onClick={createOrder} disabled={busy || !quoteFresh} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{catalog?.staging.reviewOnly ? `Save held preview · ${money(quote.customerPayableCents)} balance` : quote.customerPayableCents === 0 ? "Record complimentary card" : `Create order · ${money(quote.customerPayableCents)} due`}</button></div>
          </div>}

          {result && <div className="space-y-4">
            <div role="status" className={`rounded-xl border p-4 ${isHeldPreview ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="font-semibold">{isHeldPreview ? "Staging preview held" : result.lifecycleStatus === "payment_pending" ? "Order created · payment pending" : "Complimentary card recorded"}</h3><p className="mt-1 text-sm">Order {result.orderId}. Customer pays {money(result.quote.customerPayableCents)}. {isHeldPreview ? "No real payment, email, printing, fulfillment, or mailing occurred." : result.lifecycleStatus === "payment_pending" ? "The order will not dispatch until the exact balance is paid and verified." : "Review supplier and dispatch status in the admin order record."}</p></div></div></div>
            {result.quote.customerPayableCents > 0 && !isHeldPreview && <div className="rounded-xl border border-stone-200 p-4"><h3 className="font-semibold">Customer payment request</h3>{paymentLink ? <><p className="mt-1 text-sm">Fixed balance: {money(result.quote.customerPayableCents)}. No email was sent.</p><div className="mt-3 flex gap-2"><input aria-label="Customer payment link" readOnly value={paymentLink} className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-xs" /><button type="button" onClick={copyLink} className="rounded-lg border border-stone-300 px-3 py-2 text-sm">Copy link</button></div></> : <><p className="mt-1 text-sm text-stone-600">Create a secure link for the exact server-stored balance. Creating a link does not dispatch the card.</p><button type="button" onClick={createPaymentRequest} disabled={busy} className="mt-3 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Create payment link"}</button></>}</div>}
            {paymentStatus && <p role="status" className="text-sm text-stone-700">{paymentStatus}</p>}
            <button type="button" onClick={checkStatus} disabled={busy} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">{busy ? "Checking…" : "Check order status"}</button>
            <div className="flex justify-end"><button type="button" onClick={() => { setResult(null); setQuote(null); setStep(1); setError(""); setPaymentStatus(""); createKey.current = null; createFingerprint.current = null; onClose(); }} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Done</button></div>
          </div>}
        </main>
      </section>
    </div>
  );
}
