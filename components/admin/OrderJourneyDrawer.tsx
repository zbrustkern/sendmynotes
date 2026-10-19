"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Globe,
  MapPin,
  TrendingUp,
  DollarSign,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Eye,
  PenTool,
  Mail,
  ShieldCheck,
  Tag,
  Sparkles,
  RefreshCw,
  Lock,
  Unlock,
  AlertCircle,
  FileText,
  Send,
  X,
} from "lucide-react";
import type { Order, MailingAddress } from "@/lib/types";
import type {
  InvestigationOrderSummary,
  UnifiedEvidenceTimeline,
  TimelineEvent,
} from "@/lib/investigation-service";
import {
  deriveOrderStates,
  deriveFulfillmentStateLabel,
  maskStreet,
  maskEmail,
  maskName,
} from "@/lib/admin-investigation-client";

export interface OrderJourneyDrawerProps {
  order: Order | InvestigationOrderSummary;
  timeline?: UnifiedEvidenceTimeline | null;
  onInspectProof?: (orderId: string) => void;
  onRetryAddress?: (order: any) => void;
  onSyncStripe?: (orderId: string) => Promise<void> | void;
  onSyncHandwrytten?: (orderId: string) => Promise<void> | void;
  onRetryFulfillment?: (orderId: string) => Promise<void> | void;
  onRevealPii?: (orderId: string) => Promise<void> | void;
  onClose?: () => void;
}

export function OrderJourneyDrawer({
  order,
  timeline: externalTimeline,
  onInspectProof,
  onRetryAddress,
  onSyncStripe,
  onSyncHandwrytten,
  onRetryFulfillment,
  onRevealPii,
  onClose,
}: OrderJourneyDrawerProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [localTimeline, setLocalTimeline] = useState<UnifiedEvidenceTimeline | null>(externalTimeline || null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const orderId = "orderId" in order ? order.orderId : order.id;

  // Auto-fetch timeline if not provided
  useEffect(() => {
    if (externalTimeline) {
      setLocalTimeline(externalTimeline);
      return;
    }
    let isMounted = true;
    async function fetchTimeline() {
      if (!orderId) return;
      setLoadingTimeline(true);
      try {
        const res = await fetch(`/api/admin/investigations?domain=timeline&orderId=${encodeURIComponent(orderId)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setLocalTimeline(data);
        }
      } catch (err) {
        console.warn("Notice loading timeline:", err);
      } finally {
        if (isMounted) setLoadingTimeline(false);
      }
    }
    fetchTimeline();
    return () => {
      isMounted = false;
    };
  }, [orderId, externalTimeline]);

  const handleCopy = (fieldKey: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const states = localTimeline?.states || deriveOrderStates(order as any);

  // Derive channel info
  const attr = (order as any).attribution;
  const channelName =
    (order as any).channel ||
    attr?.utmMedium ||
    attr?.utmSource ||
    "Direct / Organic";

  const grossDollars = ((order.amountInCents || 900) / 100);

  // Recipient address resolution
  const recipientAddr = (order as any).recipientAddress;
  const recipientName = (order as any).recipientName || (recipientAddr ? `${recipientAddr.firstName} ${recipientAddr.lastName}` : "Customer Recipient");
  const recipientSummary = (order as any).recipientAddressSummary || (recipientAddr ? `${recipientAddr.street1}, ${recipientAddr.city}, ${recipientAddr.state} ${recipientAddr.zip}` : "No address recorded");

  return (
    <div
      className="bg-white border-t border-b border-stone-200/90 shadow-sm p-4 sm:p-6 space-y-6"
      role="region"
      aria-label={`Investigation details for order ${orderId}`}
    >
      {/* 1. TOP HEADER & CLOSE / QUICK ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
            360° Order &amp; Journey Investigation
          </span>
          <span className="text-xs font-bold text-stone-900">
            Order #{orderId}
          </span>
          {order.customerEmail && (
            <span className="text-xs text-stone-500 font-mono">
              ({order.customerEmail})
            </span>
          )}
          {(order as any).hasPrivateContentHidden && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
              <Lock className="w-2.5 h-2.5 text-stone-400" />
              <span>PII Masked</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onRevealPii && (order as any).hasPrivateContentHidden && (
            <button
              type="button"
              onClick={() => onRevealPii(orderId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-700" />
              <span>Reveal PII (Audited)</span>
            </button>
          )}

          {onInspectProof && (
            <button
              type="button"
              onClick={() => onInspectProof(orderId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-xs font-semibold text-stone-700 shadow-2xs transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-amber-600" />
              <span>Inspect Proof</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg cursor-pointer transition"
              aria-label="Close investigation drawer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. FOUR INDEPENDENT STATE PILLARS (SPRINT-0007-AC02) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80">
        {/* Pillar 1: Payment State */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Payment State
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
              states.paymentState === "captured_verified" || states.paymentState === "free_or_comp"
                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                : states.paymentState === "refunded" || states.paymentState === "partially_refunded"
                ? "bg-purple-100 text-purple-900 border border-purple-200"
                : states.paymentState === "verification_failed" || states.paymentState === "disputed"
                ? "bg-rose-100 text-rose-900 border border-rose-200"
                : "bg-amber-100 text-amber-900 border border-amber-200"
            }`}
          >
            {states.paymentState === "captured_verified" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
            <span className="capitalize">{states.paymentState.replace(/_/g, " ")}</span>
          </span>
        </div>

        {/* Pillar 2: Address State */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Address State
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
              states.addressState === "complete"
                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                : states.addressState === "deferred_awaiting_recipient"
                ? "bg-blue-100 text-blue-900 border border-blue-200"
                : "bg-rose-100 text-rose-900 border border-rose-200"
            }`}
          >
            {states.addressState === "complete" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
            <span className="capitalize">{states.addressState.replace(/_/g, " ")}</span>
          </span>
        </div>

        {/* Pillar 3: Fulfillment State (CRITICAL: AC02 Submitted to Supplier / Mailed via USPS) */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Fulfillment State
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
              states.fulfillmentState === "mailed_confirmed"
                ? "bg-purple-100 text-purple-900 border border-purple-200"
                : states.fulfillmentState === "submitted_to_supplier"
                ? "bg-indigo-100 text-indigo-900 border border-indigo-200"
                : states.fulfillmentState === "queued" || states.fulfillmentState === "dispatching_locked"
                ? "bg-blue-100 text-blue-900 border border-blue-200"
                : states.fulfillmentState === "failed"
                ? "bg-rose-100 text-rose-900 border border-rose-200"
                : "bg-stone-100 text-stone-700 border border-stone-200"
            }`}
          >
            {states.fulfillmentState === "mailed_confirmed" && <CheckCircle2 className="w-3 h-3 text-purple-600" />}
            <span>{states.fulfillmentStateLabel}</span>
          </span>
        </div>

        {/* Pillar 4: Communication State */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Communication State
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
              states.communicationState === "receipt_sent"
                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                : states.communicationState === "deferred_magic_link_sent"
                ? "bg-blue-100 text-blue-900 border border-blue-200"
                : states.communicationState === "failed"
                ? "bg-rose-100 text-rose-900 border border-rose-200"
                : "bg-stone-100 text-stone-700 border border-stone-200"
            }`}
          >
            <span className="capitalize">{states.communicationState.replace(/_/g, " ")}</span>
          </span>
        </div>
      </div>

      {/* 3. SAFETY ACTIONS BAR: READ-ONLY CHECKS VS BILLABLE RETRY */}
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mr-1">
            Safe Tools:
          </span>

          {onSyncStripe && (
            <button
              type="button"
              disabled={activeAction !== null}
              onClick={async () => {
                setActiveAction("sync_stripe");
                await onSyncStripe(orderId);
                setActiveAction(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${activeAction === "sync_stripe" ? "animate-spin text-amber-600" : "text-stone-600"}`} />
              <span>[Read-Only: Sync Stripe]</span>
            </button>
          )}

          {onSyncHandwrytten && (
            <button
              type="button"
              disabled={activeAction !== null}
              onClick={async () => {
                setActiveAction("sync_hw");
                await onSyncHandwrytten(orderId);
                setActiveAction(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${activeAction === "sync_hw" ? "animate-spin text-indigo-600" : "text-stone-600"}`} />
              <span>[Read-Only: Sync Supplier]</span>
            </button>
          )}

          {onRetryAddress && (
            <button
              type="button"
              onClick={() => onRetryAddress(order)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>[Edit/Repair Address]</span>
            </button>
          )}
        </div>

        {onRetryFulfillment && (
          <div>
            <button
              type="button"
              disabled={activeAction !== null}
              onClick={async () => {
                setActiveAction("retry_dispatch");
                await onRetryFulfillment(orderId);
                setActiveAction(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-stone-950 font-bold text-xs shadow-2xs transition cursor-pointer disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>[Billable Action: Retry Supplier Submission (Requires Pre-Check)]</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. CHRONOLOGICAL UNIFIED EVIDENCE TIMELINE (SPRINT-0007-T02, AC02) */}
      <div className="bg-stone-50/60 p-4 rounded-2xl border border-stone-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Unified Chronological Evidence Timeline
            </h4>
            {localTimeline?.resumedSessionIds && localTimeline.resumedSessionIds.length > 1 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                Multi-Session Resume ({localTimeline.resumedSessionIds.length} sessions)
              </span>
            )}
            {localTimeline?.identityStatus && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 capitalize">
                Identity: {localTimeline.identityStatus.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {loadingTimeline && (
            <span className="text-[11px] text-stone-400 flex items-center gap-1 font-mono">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
              Reconciling timeline...
            </span>
          )}
        </div>

        {/* Missing Evidence Stages Alert */}
        {localTimeline?.missingEvidenceStages && localTimeline.missingEvidenceStages.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Skipped/Unobserved Stages:</strong> {localTimeline.missingEvidenceStages.join(", ")}. Browser milestones were omitted before order conversion.
            </span>
          </div>
        )}

        {/* Timeline Events List */}
        <div className="space-y-2 mt-2">
          {(!localTimeline || localTimeline.events.length === 0) && !loadingTimeline && (
            <div className="text-xs text-stone-400 italic p-3 text-center bg-white rounded-xl border border-stone-200">
              No timeline events recorded yet for this order.
            </div>
          )}

          {localTimeline?.events.map((ev, index) => {
            const authorityBadge =
              ev.sourceAuthority === "provider_webhook"
                ? "bg-purple-100 text-purple-900 border-purple-200"
                : ev.sourceAuthority === "browser_observed"
                ? "bg-blue-100 text-blue-900 border-blue-200"
                : ev.sourceAuthority === "supplier_observation"
                ? "bg-indigo-100 text-indigo-900 border-indigo-200"
                : "bg-stone-100 text-stone-800 border-stone-200";

            return (
              <div
                key={ev.id || index}
                className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-2xs flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-stone-900">{ev.label}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase border ${authorityBadge}`}>
                      {ev.sourceAuthority.replace(/_/g, " ")}
                    </span>
                    {ev.correlation.gitSha && (
                      <span className="text-[10px] text-stone-400 font-mono">
                        ({ev.correlation.gitSha.substring(0, 7)})
                      </span>
                    )}
                  </div>
                  <p className="text-stone-600 text-[11px] leading-relaxed">{ev.description}</p>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono text-[10px] text-stone-400 block">
                    {new Date(ev.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                  <span className="font-mono text-[9px] text-stone-400 block">
                    {new Date(ev.timestamp).toLocaleDateString("en-US")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. ORDER DETAILS SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Origin */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Ad &amp; Marketing Origin
          </span>
          <p className="font-semibold text-stone-900">{channelName}</p>
          {(order as any).campaign && (
            <p className="text-[11px] text-stone-600 truncate">
              Campaign: {(order as any).campaign}
            </p>
          )}
        </div>

        {/* Customer & Creative */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Creative &amp; Occasion
          </span>
          <p className="font-semibold text-stone-900 capitalize">
            {(order as any).occasion || "Greeting"}
          </p>
          {(order as any).frontImageUrl && (
            <div className="relative w-12 h-16 rounded border border-stone-200 overflow-hidden mt-1">
              <Image src={(order as any).frontImageUrl} alt="Card preview" fill className="object-cover" unoptimized />
            </div>
          )}
        </div>

        {/* Financials */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Order Financials
          </span>
          <p className="font-semibold text-emerald-950 text-sm">
            ${grossDollars.toFixed(2)}
          </p>
          <p className="text-[11px] text-stone-500">
            Supplier COGS: <span className="font-mono text-stone-700">Unconfirmed (Est. $4.88)</span>
          </p>
        </div>

        {/* Destination */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Delivery Destination
          </span>
          <p className="font-semibold text-stone-900">{recipientName}</p>
          <p className="text-[11px] text-stone-600 leading-tight">{recipientSummary}</p>
        </div>
      </div>
    </div>
  );
}
