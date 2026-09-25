"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, ExternalLink, PenTool, CheckCircle2, Clock, Truck, Copy, Check } from "lucide-react";
import { Order } from "@/lib/types";

interface ProofInspectorModalProps {
  orderId: string;
  onClose: () => void;
}

export function ProofInspectorModal({ orderId, onClose }: ProofInspectorModalProps) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [hwStatus, setHwStatus] = useState<any | null>(null);
  const [activeView, setActiveView] = useState<"inside" | "cover" | "back">("inside");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadProof() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/order-proof?orderId=${encodeURIComponent(orderId)}`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data.order);
          setHwStatus(data.handwrytten);
        }
      } catch (err) {
        console.error("Error loading order proof:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProof();
  }, [orderId]);

  const copyOrderId = () => {
    navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-stone-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-bold text-lg text-stone-900">Physical Proof Inspector</h3>
                <span className="font-mono text-xs text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded">
                  {orderId}
                </span>
                <button
                  type="button"
                  onClick={copyOrderId}
                  className="text-stone-400 hover:text-stone-600 p-1"
                  title="Copy Order ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-stone-500">
                1:1 simulation of the plotted cardstock, handwriting coordinates, and postage details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {loading || !order ? (
          <div className="p-12 text-center text-stone-500">
            <div className="w-8 h-8 border-2 border-stone-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Fetching physical proof and Handwrytten telemetry...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* View Switcher Tabs */}
            <div className="flex items-center justify-center gap-2 pb-2 border-b border-stone-100">
              <button
                type="button"
                onClick={() => setActiveView("inside")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeView === "inside"
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Inside Note (Real Handwriting)
              </button>
              <button
                type="button"
                onClick={() => setActiveView("cover")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeView === "cover"
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Front Cover Art
              </button>
              <button
                type="button"
                onClick={() => setActiveView("back")}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activeView === "back"
                    ? "bg-stone-900 text-white shadow-xs"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Backplate Colophon
              </button>
            </div>

            {/* Visual Canvas Proof */}
            <div className="flex justify-center bg-stone-100/70 p-6 rounded-2xl border border-stone-200/80">
              {activeView === "inside" && (
                <div className="relative w-full max-w-[520px] aspect-[4.25/5.5] bg-[#FCFAF7] rounded-xl shadow-lg border border-stone-200 p-8 flex flex-col justify-between overflow-hidden">
                  <div className="absolute top-2 right-3 text-[9px] uppercase tracking-wider text-stone-400 font-mono">
                    A2 Folded Leaf (4.25&quot; &times; 5.5&quot;)
                  </div>

                  <div className="space-y-4 my-auto">
                    {order.printedMessage && (
                      <div className="font-serif text-stone-700 text-lg sm:text-xl font-medium tracking-wide">
                        {order.printedMessage}
                      </div>
                    )}
                    <div
                      className="font-caveat text-xl sm:text-2xl text-blue-900 leading-relaxed whitespace-pre-wrap select-text"
                      style={{
                        fontFamily: "'Caveat', cursive, 'Casual David', sans-serif",
                        lineHeight: "1.75",
                      }}
                    >
                      {order.handwrittenNote}
                    </div>
                  </div>

                  <div className="text-[10px] text-stone-400 font-mono text-center pt-4 border-t border-stone-200/40">
                    Handwrytten Plotter: Casual David (hwDavid) &bull; Ballpoint Blue Ink
                  </div>
                </div>
              )}

              {activeView === "cover" && (
                <div className="relative w-full max-w-[420px] aspect-[4.25/5.5] rounded-xl shadow-lg border border-stone-200 overflow-hidden bg-stone-100">
                  <Image
                    src={order.frontImageUrl}
                    alt="Card Front Cover"
                    fill
                    sizes="420px"
                    unoptimized
                    className="object-cover"
                  />
                </div>
              )}

              {activeView === "back" && (
                <div className="relative w-full max-w-[420px] aspect-[4.25/5.5] rounded-xl shadow-lg border border-stone-200 overflow-hidden bg-[#FCFAF7] flex items-center justify-center p-6">
                  <div className="relative w-full h-full">
                    <Image
                      src="/aster-blanche-backplate.png"
                      alt="Aster & Blanche Backplate"
                      fill
                      sizes="420px"
                      unoptimized
                      className="object-contain"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Postal & Fulfillment Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Recipient Address (Mailing Face)
                </div>
                <p className="font-semibold text-stone-900 text-sm">
                  {order.recipientAddress.firstName} {order.recipientAddress.lastName}
                </p>
                <p className="text-xs text-stone-600">{order.recipientAddress.street1}</p>
                {order.recipientAddress.street2 && (
                  <p className="text-xs text-stone-600">{order.recipientAddress.street2}</p>
                )}
                <p className="text-xs text-stone-600">
                  {order.recipientAddress.city}, {order.recipientAddress.state} {order.recipientAddress.zip}
                </p>
              </div>

              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Fulfillment &amp; Postal Telemetry
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Status:</span>
                  <span className="font-bold text-stone-900">{order.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Handwrytten ID:</span>
                  <span className="font-mono text-indigo-700 font-semibold">
                    {order.handwryttenOrderId || "Pending Dispatch"}
                  </span>
                </div>
                {order.handwryttenTrackingNumber && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">USPS Tracking:</span>
                    <a
                      href={order.handwryttenTrackingUrl || `https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.handwryttenTrackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-amber-700 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>{order.handwryttenTrackingNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Customer:</span>
                  <span className="text-stone-700">{order.customerEmail || "Guest"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <Link
            href={`/order/${orderId}`}
            target="_blank"
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1"
          >
            <span>Open Customer Receipt View</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-900 hover:bg-black text-white transition cursor-pointer"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
}
