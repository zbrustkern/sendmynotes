"use client";

import React, { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function UnsubscribeContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "ready" | "done" | "invalid" | "submitting">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!token) { setState("invalid"); return; }
    fetch(`/api/post-purchase/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok || body.valid === false) throw new Error("This link is invalid or expired."); if (active) setState("ready"); })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "This link is invalid or expired."); setState("invalid"); } });
    return () => { active = false; };
  }, [token]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!token || state === "submitting") return;
    setState("submitting"); setError("");
    try { const response = await fetch("/api/post-purchase/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "We could not update your preference. Try again."); setState("done"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We could not update your preference. Try again."); setState("ready"); }
  }
  return <main className="min-h-screen bg-[#faf8f5] px-4 py-16 text-stone-800"><section className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10"><p className="font-serif text-xl">SendMyNotes</p>{state === "loading" && <p className="mt-8 text-sm text-stone-600" role="status">Checking this unsubscribe link…</p>}{state === "ready" && <><h1 className="mt-8 font-serif text-3xl">Stop follow-ups and offers?</h1><p className="mt-4 text-sm leading-6 text-stone-600">You will still receive receipts and necessary updates about your orders.</p><form onSubmit={submit}><button className="mt-6 min-h-12 rounded-lg bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Stop follow-ups and offers</button></form></>}{state === "submitting" && <p className="mt-8 text-sm text-stone-600" role="status">Updating your preference…</p>}{state === "done" && <><h1 className="mt-8 font-serif text-3xl">You’re unsubscribed.</h1><p className="mt-4 text-sm leading-6 text-stone-600">You will no longer receive SendMyNotes follow-ups and offers. Your order receipts and necessary order updates will continue.</p></>}{state === "invalid" && <><h1 className="mt-8 font-serif text-3xl">Link unavailable</h1><p className="mt-4 text-sm leading-6 text-stone-600">{error || "This link is invalid or expired."} If you need help, contact SendMyNotes support.</p></>}{error && state === "ready" && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}</section></main>;
}

export default function UnsubscribePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#faf8f5] p-8 text-stone-600">Loading unsubscribe page…</main>}><UnsubscribeContent /></Suspense>;
}
