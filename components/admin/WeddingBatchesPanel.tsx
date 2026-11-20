"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";

type DeliveryCounts = {
  held: number;
  pending: number;
  dispatching: number;
  retry: number;
  accepted: number;
  quarantined: number;
  rejected: number;
  mailed: number;
  refunded: number;
};

type BatchRow = {
  batchId: string;
  projectId: string;
  status: string;
  paymentMode: string;
  buyerEmail: string | null;
  dispatchMode: "auto" | "manual_release";
  dispatchStatus: string;
  dispatchError: string | null;
  preparedCardId: string | null;
  preparationState: string | null;
  count: number;
  capturedCents: number;
  refundedCents: number;
  createdAt: number;
  settledAt: number | null;
  counts: DeliveryCounts;
};

type DeliveryDetail = {
  householdId: string;
  ordinal: number;
  state: string;
  holdReason: string | null;
  attempts: number;
  supplierOrderId: string | null;
  supplierStatus: string | null;
  trackingNumber: string | null;
  error: string | null;
  envelopeName: string;
  destination: string;
  totalCents: number;
  refundStatus: string | null;
};

type BatchDetail = BatchRow & {
  deliveries: DeliveryDetail[];
};

type GlobalControl = {
  paused: boolean;
  reason?: string | null;
  actor?: string | null;
  version: number;
  updatedAt?: number | null;
};

const STATE_BADGES: Record<string, string> = {
  queued: "bg-sky-50 text-sky-800 border-sky-200",
  pending: "bg-sky-50 text-sky-800 border-sky-200",
  dispatching: "bg-indigo-50 text-indigo-800 border-indigo-200",
  accepted: "bg-emerald-50 text-emerald-800 border-emerald-200",
  mailed: "bg-purple-50 text-purple-800 border-purple-200",
  complete: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  retry: "bg-amber-50 text-amber-800 border-amber-200",
  checking: "bg-amber-50 text-amber-800 border-amber-200",
  awaiting_release: "bg-amber-50 text-amber-900 border-amber-300",
  paused: "bg-rose-50 text-rose-800 border-rose-200",
  quarantined: "bg-rose-50 text-rose-800 border-rose-200",
  rejected: "bg-rose-100 text-rose-900 border-rose-300",
  held: "bg-stone-100 text-stone-700 border-stone-200",
  staging_review: "bg-stone-100 text-stone-700 border-stone-200",
  refunded: "bg-stone-100 text-stone-600 border-stone-200",
};

function badgeClass(state: string): string {
  return STATE_BADGES[state] || "bg-stone-100 text-stone-700 border-stone-200";
}

export function WeddingBatchesPanel() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [dispatchMode, setDispatchMode] = useState<"auto" | "manual_release">("manual_release");
  const [globalControl, setGlobalControl] = useState<GlobalControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [detailByBatch, setDetailByBatch] = useState<Record<string, BatchDetail>>({});

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/wedding/batches", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load wedding batches.");
      setBatches(data.batches || []);
      setDispatchMode(data.dispatchMode || "manual_release");
      setGlobalControl(data.globalControl || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wedding batches.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/wedding/batches?batchId=${encodeURIComponent(batchId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.detail) throw new Error(data.error || "Could not load batch detail.");
      setDetailByBatch((prev) => ({ ...prev, [batchId]: data.detail }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load batch detail.");
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  async function runAction(key: string, payload: Record<string, unknown>, successMsg: string, refreshDetailFor?: string) {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/wedding/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      setNotice(successMsg);
      await loadBatches();
      if (refreshDetailFor) {
        await loadDetail(refreshDetailFor);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRefundCard(batchId: string, householdId: string) {
    if (!window.confirm(`Issue a Stripe refund for card ${householdId} in batch ${batchId}?`)) {
      return;
    }
    const key = `refund_${batchId}_${householdId}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const idempotencyKey = `adm_${batchId.slice(0, 20)}_${householdId.slice(0, 20)}_${Date.now()}`;
      const res = await fetch("/api/admin/wedding/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, householdId, idempotencyKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refund failed.");
      setNotice(`Refund ${data.status || "submitted"} for ${householdId} ($${((data.amountCents || 0) / 100).toFixed(2)}).`);
      await loadBatches();
      await loadDetail(batchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl font-bold text-stone-900">Wedding Batches &amp; Handwrytten Dispatch</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-stone-100 text-stone-800 border-stone-200">
              Mode: {dispatchMode}
            </span>
            {globalControl?.paused ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-rose-100 text-rose-900 border-rose-300">
                <AlertTriangle className="w-3 h-3" />
                Global Dispatch Paused
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Dispatch Active
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500">
            Single-cover upload per batch, fenced per-card Handwrytten dispatch, and per-card Stripe refunds.
          </p>
          {globalControl?.paused && globalControl.reason && (
            <p className="text-xs text-rose-800 font-medium pt-1">
              Pause reason: {globalControl.reason}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {globalControl?.paused ? (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() =>
                runAction(
                  "resume",
                  { action: "resume", reason: "Resumed by operator in Admin" },
                  "Wedding dispatch resumed.",
                )
              }
              className="h-9 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Resume Dispatch</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() =>
                runAction(
                  "pause",
                  { action: "pause", reason: "Paused by operator in Admin" },
                  "Global wedding dispatch paused.",
                )
              }
              className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <PauseCircle className="w-3.5 h-3.5" />
              <span>Pause Dispatch</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyKey !== null}
            onClick={() =>
              runAction("sync_status", { action: "sync_status" }, "Handwrytten delivery statuses synced.")
            }
            className="h-9 px-3 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyKey === "sync_status" ? "animate-spin" : ""}`} />
            <span>Sync Statuses</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadBatches()}
            className="h-9 px-3 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {loading && batches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-sm text-stone-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading wedding batches…</span>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center text-sm text-stone-500">
          No wedding batches have been created yet.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const isExpanded = expandedBatchId === b.batchId;
            const detail = detailByBatch[b.batchId];
            return (
              <div
                key={b.batchId}
                className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-2xs space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-stone-900">{b.batchId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeClass(b.dispatchStatus)}`}>
                        {b.dispatchStatus.replace(/_/g, " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-stone-50 text-stone-700 border-stone-200">
                        {b.paymentMode}
                      </span>
                      {b.preparedCardId && (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          HW Card #{b.preparedCardId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Project: {b.projectId}</span>
                      <span>Cards: {b.count}</span>
                      <span>Paid: ${(b.capturedCents / 100).toFixed(2)}</span>
                      {b.refundedCents > 0 && (
                        <span className="text-rose-700">Refunded: ${(b.refundedCents / 100).toFixed(2)}</span>
                      )}
                      {b.buyerEmail && <span>Buyer: {b.buyerEmail}</span>}
                    </div>
                    {b.dispatchError && (
                      <p className="text-xs text-rose-700 font-medium">{b.dispatchError}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {b.dispatchStatus === "awaiting_release" && (
                      <button
                        type="button"
                        disabled={busyKey !== null || globalControl?.paused}
                        onClick={() =>
                          runAction(
                            `release_${b.batchId}`,
                            { action: "release", batchId: b.batchId },
                            `Batch ${b.batchId} released to dispatch queue.`,
                            isExpanded ? b.batchId : undefined,
                          )
                        }
                        className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3 h-3" />
                        <span>Dispatch Batch</span>
                      </button>
                    )}

                    {b.counts.rejected > 0 && (
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runAction(
                            `retry_${b.batchId}`,
                            { action: "retry_rejected", batchId: b.batchId },
                            `Re-queued rejected cards for ${b.batchId}.`,
                            isExpanded ? b.batchId : undefined,
                          )
                        }
                        className="h-8 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Rejected ({b.counts.rejected})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedBatchId(null);
                        } else {
                          setExpandedBatchId(b.batchId);
                          void loadDetail(b.batchId);
                        }
                      }}
                      className="h-8 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>{isExpanded ? "Hide Cards" : "Inspect Cards"}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Per-card counts */}
                <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                  {(
                    [
                      ["pending", b.counts.pending],
                      ["dispatching", b.counts.dispatching],
                      ["accepted", b.counts.accepted],
                      ["mailed", b.counts.mailed],
                      ["retry", b.counts.retry],
                      ["quarantined", b.counts.quarantined],
                      ["rejected", b.counts.rejected],
                      ["held", b.counts.held],
                      ["refunded", b.counts.refunded],
                    ] as const
                  )
                    .filter(([, count]) => count > 0)
                    .map(([label, count]) => (
                      <span
                        key={label}
                        className={`px-2 py-0.5 rounded-md border font-medium ${badgeClass(label)}`}
                      >
                        {label}: {count}
                      </span>
                    ))}
                </div>

                {isExpanded && (
                  <div className="pt-3 border-t border-stone-100 space-y-2">
                    {!detail ? (
                      <p className="text-xs text-stone-500">Loading card deliveries…</p>
                    ) : (
                      <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                        {detail.deliveries.map((d) => (
                          <div
                            key={d.householdId}
                            className="p-3 bg-stone-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-stone-900">
                                  #{d.ordinal} {d.envelopeName}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeClass(d.state)}`}>
                                  {d.state}
                                </span>
                                {d.supplierOrderId && (
                                  <span className="font-mono text-[10px] text-indigo-700">
                                    HW: {d.supplierOrderId}
                                  </span>
                                )}
                                {d.refundStatus && (
                                  <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-800 text-[10px] font-semibold">
                                    refund: {d.refundStatus}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500">
                                {d.destination || d.householdId} &middot; ${(d.totalCents / 100).toFixed(2)} &middot; attempts: {d.attempts}
                                {d.supplierStatus ? ` · status: ${d.supplierStatus}` : ""}
                              </p>
                              {d.error && <p className="text-[11px] text-rose-700">{d.error}</p>}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {!d.refundStatus && b.status === "held" && (
                                <button
                                  type="button"
                                  disabled={busyKey !== null}
                                  onClick={() => void handleRefundCard(b.batchId, d.householdId)}
                                  className="px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                                >
                                  Refund Card
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
