"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { activeSessionCheckoutToken, readTrackerHistory, writeTrackerHistory } from "../OrderTracker";
import { privateOrderPath } from "@/lib/order-tracking-links";

function captureReturnTicket(orderId: string): string | null {
  const url = new URL(window.location.href);
  const path = `/order/${encodeURIComponent(orderId)}/return`;
  const fragment = new URLSearchParams(url.hash.slice(1));
  const ticket = fragment.get("return") || readTrackerHistory(orderId, path)?.returnTicket || null;
  writeTrackerHistory(orderId, { returnTicket: ticket }, path);
  return ticket;
}

function PaymentReturn({ orderId }: { orderId: string }) {
  const captured = useRef<{ ticket: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const exchangeTicket = async () => {
      // Use the router-integrated history API once the parent effects have run.
      await Promise.resolve();
      if (signal.aborted) return;
      const { ticket } = captured.current ??= { ticket: captureReturnTicket(orderId) };
      if (!ticket) {
        setFailed(true);
        return;
      }
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        headers: { "x-order-return-ticket": ticket },
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Private order access unavailable");
      const data = await response.json();
      if (typeof data?.readToken !== "string" || !data.readToken) throw new Error("Private order access unavailable");
      if (signal.aborted) return;
      const canonical = privateOrderPath(orderId, data.readToken);
      const trackerPath = activeSessionCheckoutToken(orderId)
        ? `${canonical}&return=${encodeURIComponent(ticket)}`
        : canonical;
      window.location.replace(trackerPath);
    };
    void exchangeTicket().catch(() => {
      if (!signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [orderId]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-5 py-12 text-stone-900">
      <section className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="font-serif text-2xl">{failed ? "Your order link could not be opened" : "Opening your order"}</h1>
        <p className="text-sm text-stone-600">
          {failed
            ? "You can still see the public order status using your order reference."
            : "We’re checking your private order link."}
        </p>
        {failed && <Link className="inline-flex rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white" href={`/order/${encodeURIComponent(orderId)}`}>View public order status</Link>}
      </section>
    </main>
  );
}

export default function PaymentReturnPage() {
  const { id } = useParams<{ id: string }>();
  return <PaymentReturn key={id} orderId={id} />;
}
