"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  Eye,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Send,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import type { AdminGlobalScope } from "@/lib/admin-scope";
import type {
  InvestigationOrderSummary,
  FulfillmentRetryGateResult,
} from "@/lib/investigation-service";
import { OrderJourneyDrawer } from "./OrderJourneyDrawer";

export interface OrdersInvestigationWorkspaceProps {
  scope: AdminGlobalScope;
  onScopeChange: (newScope: AdminGlobalScope) => void;
  onInspectProof?: (orderId: string) => void;
  onRetryAddress?: (order: any) => void;
}

export function OrdersInvestigationWorkspace({
  scope,
  onScopeChange,
  onInspectProof,
  onRetryAddress,
}: OrdersInvestigationWorkspaceProps) {
  const [orders, setOrders] = useState<InvestigationOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(scope.orderId || null);

  // Invariant Scoped Totals (AC01)
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);
  const [scopedPaidOrdersTotal, setScopedPaidOrdersTotal] = useState(0);
  const [scopedNetRevenueCents, setScopedNetRevenueCents] = useState(0);
  const [hiddenExceptionsCount, setHiddenExceptionsCount] = useState(0);
  const [strandedPaidCount, setStrandedPaidCount] = useState(0);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

  // Pagination
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);

  // PII Reveal Modal State
  const [revealTargetOrderId, setRevealTargetOrderId] = useState<string | null>(null);
  const [revealReason, setRevealReason] = useState("");
  const [revealingPii, setRevealingPii] = useState(false);
  const [revealedOrders, setRevealedOrders] = useState<Record<string, any>>({});

  // Retry Gate State
  const [retryGateResult, setRetryGateResult] = useState<{
    orderId: string;
    gate: FulfillmentRetryGateResult;
  } | null>(null);
  const [retryingFulfillment, setRetryingFulfillment] = useState(false);

  const fetchOrders = useCallback(async (currentCursor?: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("domain", "orders");
      params.set("datePreset", scope.datePreset || scope.window || "since_oct13");
      params.set("timezone", scope.timezone);
      params.set("environment", scope.environment);
      if (scope.customFrom || scope.from) params.set("from", scope.customFrom || scope.from!);
      if (scope.customTo || scope.to) params.set("to", scope.customTo || scope.to!);
      params.set("mode", scope.mode);
      if (scope.drilldownMetric) params.set("drilldownMetric", scope.drilldownMetric);
      if (scope.drilldownStage) params.set("drilldownStage", scope.drilldownStage);
      if (scope.channel && scope.channel !== "all") params.set("channel", scope.channel);
      if (scope.device && scope.device !== "all") params.set("device", scope.device);
      if (scope.inAppBrowserOnly) params.set("inApp", "true");
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (currentCursor) params.set("cursor", currentCursor);
      params.set("limit", "25");

      const res = await fetch(`/api/admin/investigations?${params.toString()}`);
      if (!res.ok) { const failure = await res.json().catch(() => ({})); throw new Error(failure.error || "Evidence source unavailable"); }
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotalMatchingCount(data.totalMatchingCount || 0);
        setScopedPaidOrdersTotal(data.scopedPaidOrdersTotal || 0);
        setScopedNetRevenueCents(data.scopedNetRevenueCents || 0);
        setHiddenExceptionsCount(data.hiddenOperationalExceptionsCount || 0);
        setStrandedPaidCount(data.strandedPaidExceptionsCount || 0);
        setWarningBanner(data.warningBanner || null);
        setHasMore(data.hasMore || false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Evidence source unavailable");
      console.error("Failed to load orders evidence:", err);
    } finally {
      setLoading(false);
    }
  }, [scope, search, statusFilter]);

  useEffect(() => {
    fetchOrders(cursor);
  }, [fetchOrders, cursor]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor(undefined);
    setCursorHistory([]);
    fetchOrders(undefined);
  };

  const handleNextPage = () => {
    if (orders.length > 0) {
      const lastId = orders[orders.length - 1].orderId;
      setCursorHistory((prev) => [...prev, cursor || ""]);
      setCursor(lastId);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, prev.length - 1));
      setCursor(prevCursor || undefined);
    }
  };

  const handleExecutePiiReveal = async () => {
    if (!revealTargetOrderId || revealReason.trim().length < 5) return;
    setRevealingPii(true);
    try {
      const res = await fetch("/api/admin/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reveal_pii",
          orderId: revealTargetOrderId,
          operatorId: "admin_operator",
          reason: revealReason.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealedOrders((prev) => ({
          ...prev,
          [revealTargetOrderId]: data,
        }));
        setRevealTargetOrderId(null);
        setRevealReason("");
      }
    } catch (err) {
      console.error("PII reveal failed:", err);
    } finally {
      setRevealingPii(false);
    }
  };

  const handleCheckRetryGate = async (orderId: string) => {
    try {
      const res = await fetch("/api/admin/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "check_retry_gate",
          orderId,
        }),
      });
      if (res.ok) {
        const gate = (await res.json()) as FulfillmentRetryGateResult;
        setRetryGateResult({ orderId, gate });
      }
    } catch (err) {
      console.error("Retry gate check failed:", err);
    }
  };

  const handleConfirmBillableRetry = async (orderId: string) => {
    setRetryingFulfillment(true);
    try {
      const res = await fetch("/api/admin/retry-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          confirmBillableDispatch: true,
          idempotencyKey: `retry_${orderId}_${Date.now()}`,
        }),
      });
      if (res.ok) {
        setRetryGateResult(null);
        fetchOrders(cursor);
      } else {
        const errData = await res.json();
        alert(`Fulfillment retry blocked: ${errData.error || "Gate rejected"}`);
      }
    } catch (err) {
      console.error("Error executing retry fulfillment:", err);
    } finally {
      setRetryingFulfillment(false);
    }
  };

  return (
    <div className="space-y-6">
      {loadError && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Evidence unavailable or stale: {loadError}</p>}
      {/* 1. OPERATIONAL EXCEPTION ALERT BANNER (AC01) */}
      {warningBanner && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>{warningBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => onScopeChange({ ...scope, mode: "operational_all" })}
            className="px-3 py-1.5 rounded-xl bg-amber-900 text-white font-bold hover:bg-black transition cursor-pointer shrink-0"
          >
            Switch to Operational Mode
          </button>
        </div>
      )}

      {/* 2. INVARIANT SCOPED AGGREGATES HEADER (AC01) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Scoped Matching Orders
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            {totalMatchingCount}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Scoped Verified Paid
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            {scopedPaidOrdersTotal} <span className="text-xs font-sans font-medium text-stone-400">orders</span>
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Scoped Net Receipts
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-emerald-950">
            ${(scopedNetRevenueCents / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* 3. SEARCH & STATUS FILTER TOOLBAR */}
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Order ID, masked email, recipient, promo..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition cursor-pointer shrink-0"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCursor(undefined);
            }}
            className="bg-white border border-stone-200 rounded-xl py-1.5 px-3 text-xs text-stone-700 cursor-pointer shadow-2xs"
            aria-label="Filter orders by state"
          >
            <option value="">All States</option>
            <option value="captured_verified">Paid &amp; Captured</option>
            <option value="unpaid">Unpaid / In Cart</option>
            <option value="submitted_to_supplier">Submitted to Supplier</option>
            <option value="mailed_confirmed">Mailed via USPS</option>
            <option value="failed">Fulfillment Failed</option>
            <option value="deferred_awaiting_recipient">Awaiting Address</option>
          </select>

          <button
            type="button"
            onClick={() => fetchOrders(cursor)}
            disabled={loading}
            className="p-2 border border-stone-200 hover:bg-stone-100 rounded-xl transition text-stone-600 cursor-pointer disabled:opacity-60"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* 4. ORDERS TABLE WITH DEFAULT PII MASKING */}
      <div
        className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
        role="region"
        aria-label="Orders investigation dataset"
        tabIndex={0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200/80 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                <th className="py-3 px-4">Order ID &amp; Channel</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Customer (Masked)</th>
                <th className="py-3 px-3">Recipient Destination</th>
                <th className="py-3 px-3 text-right">Amount</th>
                <th className="py-3 px-3">Payment State</th>
                <th className="py-3 px-3">Fulfillment State</th>
                <th className="py-3 px-4 text-right">Safety Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 italic">
                    Loading scoped orders evidence...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400 italic">
                    No matching orders found in current scope.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedOrderId === order.orderId;
                  const revealed = revealedOrders[order.orderId];
                  const emailToDisplay = revealed?.customerEmail || order.customerEmail;
                  const addressToDisplay = revealed?.recipientAddress
                    ? `${revealed.recipientAddress.street1}, ${revealed.recipientAddress.city}`
                    : order.recipientAddressSummary;

                  return (
                    <React.Fragment key={order.orderId}>
                      <tr
                        onClick={() => setSelectedOrderId(isSelected ? null : order.orderId)}
                        className={`hover:bg-amber-50/40 transition cursor-pointer ${
                          isSelected ? "bg-amber-50/60" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-stone-900">
                          <div className="flex items-center gap-1.5">
                            <span>#{order.orderId}</span>
                            {order.isFounderTest && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                                Founder
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-stone-400 block font-sans font-medium">
                            {order.channel}
                          </span>
                        </td>

                        <td className="py-3 px-3 font-mono text-stone-600">
                          {new Date(order.occurredAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        <td className="py-3 px-3 font-mono text-stone-600">
                          <div className="flex items-center gap-1">
                            <span>{emailToDisplay}</span>
                            {!revealed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRevealTargetOrderId(order.orderId);
                                }}
                                className="p-0.5 text-stone-400 hover:text-amber-700"
                                title="Reveal full customer email (audited)"
                              >
                                <Lock className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-stone-700">
                          <p className="font-semibold text-stone-900 truncate max-w-[150px]">
                            {revealed?.recipientAddress
                              ? `${revealed.recipientAddress.firstName} ${revealed.recipientAddress.lastName}`
                              : order.recipientName}
                          </p>
                          <p className="text-[10px] text-stone-500 truncate max-w-[180px]">
                            {addressToDisplay}
                          </p>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                          ${(order.amountInCents / 100).toFixed(2)}
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${
                              order.paymentState === "captured_verified"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {order.paymentState.replace(/_/g, " ")}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.fulfillmentState === "submitted_to_supplier"
                                ? "bg-indigo-100 text-indigo-900"
                                : order.fulfillmentState === "mailed_confirmed"
                                ? "bg-purple-100 text-purple-900"
                                : order.fulfillmentState === "failed"
                                ? "bg-rose-100 text-rose-900"
                                : "bg-stone-100 text-stone-700"
                            }`}
                          >
                            {order.fulfillmentStateLabel}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {onInspectProof && (
                              <button
                                type="button"
                                onClick={() => onInspectProof(order.orderId)}
                                className="p-1 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-600 transition"
                                title="Inspect Card Proof"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {order.fulfillmentState === "failed" && (
                              <button
                                type="button"
                                onClick={() => handleCheckRetryGate(order.orderId)}
                                className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-500 text-stone-950 font-bold text-[10px] transition cursor-pointer"
                                title="Pre-check billable retry gate"
                              >
                                Pre-Check Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Drawer Row */}
                      {isSelected && (
                        <tr>
                          <td colSpan={8} className="p-0 bg-stone-50">
                            <OrderJourneyDrawer
                              order={order}
                              onInspectProof={onInspectProof}
                              onRetryAddress={onRetryAddress}
                              onClose={() => setSelectedOrderId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="bg-stone-50 border-t border-stone-200/80 p-3 flex items-center justify-between text-xs text-stone-600">
          <span>
            Showing <strong className="text-stone-900">{orders.length}</strong> of{" "}
            <strong className="text-stone-900">{totalMatchingCount}</strong> matching orders
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={!hasMore}
              className="p-1.5 rounded-lg border border-stone-200 hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. AUDITED PII REVEAL MODAL */}
      {revealTargetOrderId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 text-stone-900 font-bold">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <span>Audited PII Reveal Request</span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Customer email, physical address, and private message data are masked by default. Under privacy policy,
              accessing unmasked data requires recording an immutable audit entry.
            </p>
            <div>
              <label className="text-xs font-semibold text-stone-700 block mb-1">
                Operational Reason (required, &gt;=5 characters):
              </label>
              <textarea
                value={revealReason}
                onChange={(e) => setRevealReason(e.target.value)}
                placeholder="e.g. Investigating USPS address bounce or customer support inquiry"
                rows={3}
                className="w-full border border-stone-300 rounded-xl p-2.5 text-xs text-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevealTargetOrderId(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-stone-600 hover:bg-stone-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revealingPii || revealReason.trim().length < 5}
                onClick={handleExecutePiiReveal}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-stone-900 text-white hover:bg-black transition disabled:opacity-40 cursor-pointer"
              >
                {revealingPii ? "Recording Audit..." : "Authorize & Reveal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. RETRY GATE CONFIRMATION MODAL (AC03) */}
      {retryGateResult && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 text-stone-900 font-bold">
              <Send className="w-5 h-5 text-amber-600" />
              <span>Fulfillment Retry Pre-Check Gate</span>
            </div>

            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                retryGateResult.gate.allowed
                  ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                  : "bg-rose-50 border-rose-200 text-rose-950"
              }`}
            >
              <div className="font-bold mb-1">
                Gate Status: {retryGateResult.gate.allowed ? "Passed — Safe to Retry" : "Blocked by Safety Check"}
              </div>
              <p>{retryGateResult.gate.message}</p>
            </div>

            {retryGateResult.gate.allowed ? (
              <p className="text-xs text-stone-600 leading-relaxed">
                Confirming will trigger a <strong>billable physical card submission</strong> to Handwrytten. Please
                verify that the address and note are correct before proceeding.
              </p>
            ) : (
              <p className="text-xs text-stone-600 leading-relaxed">
                Suggested remedy: <strong>{retryGateResult.gate.suggestedAction.replace(/_/g, " ")}</strong>.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRetryGateResult(null)}
                className="px-3 py-1.5 rounded-xl text-xs text-stone-600 hover:bg-stone-100 transition"
              >
                Close
              </button>

              {retryGateResult.gate.allowed && (
                <button
                  type="button"
                  disabled={retryingFulfillment}
                  onClick={() => handleConfirmBillableRetry(retryGateResult.orderId)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-500 text-stone-950 transition disabled:opacity-40 cursor-pointer"
                >
                  {retryingFulfillment ? "Submitting..." : "Confirm Billable Dispatch"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
