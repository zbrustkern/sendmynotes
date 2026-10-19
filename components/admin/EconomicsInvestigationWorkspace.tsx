"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Download,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  FileText,
  Calculator,
} from "lucide-react";
import type { AdminGlobalScope } from "@/lib/admin-scope";
import type { EconomicsInvestigationReport } from "@/lib/investigation-service";

export interface EconomicsInvestigationWorkspaceProps {
  scope: AdminGlobalScope;
  onScopeChange: (newScope: AdminGlobalScope) => void;
}

export function EconomicsInvestigationWorkspace({
  scope,
  onScopeChange,
}: EconomicsInvestigationWorkspaceProps) {
  const [report, setReport] = useState<EconomicsInvestigationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"transactions" | "cohorts">("transactions");
  const [exportingCsv, setExportingCsv] = useState(false);

  const fetchEconomics = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      params.set("domain", "economics");
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

      const res = await fetch(`/api/admin/investigations?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error || "Economics report unavailable");
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Economics report unavailable");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    fetchEconomics();
  }, [fetchEconomics]);

  const handleDownloadCsv = () => {
    if (!report?.csvContent) return;
    setExportingCsv(true);
    try {
      const blob = new Blob([report.csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `smn-economics-ledger-${scope.datePreset || "oct13"}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  };

  const summary = report?.summary;
  if (!report) return <div role={loadError ? "alert" : "status"} className="rounded-xl border border-stone-200 bg-white p-5">
    {loadError || "Loading financial evidence…"}
    {loadError && <button type="button" onClick={fetchEconomics} className="ml-3 underline">Retry</button>}
  </div>;

  return (
    <div className="space-y-6">
      {loadError && <p role="alert" className="rounded-xl bg-amber-50 p-3">Refresh failed: {loadError}. Previously loaded evidence remains visible.</p>}
      {/* 1. AGGREGATE SUMMARY STRIP (AC04 - Aggregate == Detail == Export Parity) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4.5 rounded-2xl border border-stone-200/90 shadow-2xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Total Captured Revenue
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-emerald-950">
            ${((summary?.totalCapturedRevenueCents || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-stone-500 block">
            Refunds: -${((summary?.refundsCents || 0) / 100).toFixed(2)}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Net Cash Receipts
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            ${((summary?.netReceiptsCents || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-stone-500 block">Financial fact ledger</span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Invoiced Supplier Costs
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-indigo-950">
            ${((summary?.supplierInvoicedCostCents || 0) / 100).toFixed(2)}
          </span>
          <span className="text-[10px] text-stone-500 block">
            {summary?.invoicedOrdersCount || 0} Invoiced / {summary?.unconfirmedOrdersCount || 0} Unconfirmed
          </span>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
            Dated Campaign Spend
          </span>
          <span className="text-xl sm:text-2xl font-serif font-bold text-stone-900">
            {summary?.datedSpendCents == null ? "Unavailable" : `$${(summary.datedSpendCents / 100).toFixed(2)}`}
          </span>
          <span className="text-[10px] text-stone-500 block">From Dated Spend Ledger</span>
        </div>
      </div>

      {/* 2. VIEW TOGGLE & CSV EXPORT BUTTON */}
      <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              activeTab === "transactions" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Transaction Facts Ledger ({report?.transactionLedgerView.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cohorts")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition ${
              activeTab === "cohorts" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Cohort Acquisition Economics
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchEconomics}
            disabled={loading}
            className="p-2 border border-stone-200 hover:bg-stone-100 rounded-xl transition text-stone-600 cursor-pointer disabled:opacity-60"
            title="Refresh Economics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-600" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!report || exportingCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Ledger CSV</span>
          </button>
        </div>
      </div>

      {/* 3. DUAL-VIEW TABLES */}
      {activeTab === "transactions" ? (
        <div
          className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
          role="region"
          aria-label="Transaction facts ledger"
          tabIndex={0}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200/80 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Fact ID &amp; Payment Intent</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Order Link</th>
                  <th className="py-3 px-3 text-right">Captured</th>
                  <th className="py-3 px-3 text-right">Stripe Fee</th>
                  <th className="py-3 px-3 text-right">Supplier Cost</th>
                  <th className="py-3 px-3">Supplier Provenance</th>
                  <th className="py-3 px-4">Commercial Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono">
                {loading && !report ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400 italic font-sans">
                      Loading financial ledger facts...
                    </td>
                  </tr>
                ) : report?.transactionLedgerView.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400 italic font-sans">
                      No transaction facts recorded in current window.
                    </td>
                  </tr>
                ) : (
                  report?.transactionLedgerView.map((tx) => (
                    <tr key={tx.id} className="hover:bg-amber-50/40 transition">
                      <td className="py-3 px-4 font-bold text-stone-900">
                        <span>{tx.id}</span>
                        <span className="text-[10px] text-stone-400 block font-normal">
                          {tx.paymentIntentId}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-stone-600 font-sans">
                        {new Date(tx.occurredAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      <td className="py-3 px-3">
                        {tx.orderId ? (
                          <span className="text-stone-800 font-bold">#{tx.orderId}</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 font-sans">
                            Unmatched Fact
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-emerald-950">
                        ${(tx.amountCents / 100).toFixed(2)}
                      </td>

                      <td className="py-3 px-3 text-right text-stone-500">
                        -{tx.stripeFeeCents == null ? "Unknown" : `$${(tx.stripeFeeCents / 100).toFixed(2)}`}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {typeof tx.supplierCostCents === "number" ? (
                          <span className="font-bold text-indigo-950">
                            ${(tx.supplierCostCents / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-stone-400 italic font-sans">Unconfirmed</span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-sans">
                        {tx.supplierCostStatus === "verified_invoice" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Verified Invoice</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            <HelpCircle className="w-2.5 h-2.5" />
                            <span>Unconfirmed Invoice</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-sans text-stone-600 capitalize">
                        {tx.commercialKind.replace(/_/g, " ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div
          className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden"
          role="region"
          aria-label="Cohort acquisition economics"
          tabIndex={0}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200/80 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Channel &amp; Campaign</th>
                  <th className="py-3 px-3 text-right">Sessions</th>
                  <th className="py-3 px-3 text-right">Paid Orders</th>
                  <th className="py-3 px-3 text-right">Captured Revenue</th>
                  <th className="py-3 px-3 text-right">Dated Ad Spend</th>
                  <th className="py-3 px-3 text-right">Supplier Costs</th>
                  <th className="py-3 px-3 text-right">Blended CAC</th>
                  <th className="py-3 px-4 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report?.cohortEconomicsView.map((row, idx) => (
                  <tr key={idx} className="hover:bg-stone-50 transition">
                    <td className="py-3 px-4 font-bold text-stone-900">
                      <span>{row.channel}</span>
                      <span className="text-[10px] text-stone-400 font-mono block">
                        {row.campaign}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono">{row.sessions}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{row.paidOrders}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-950">
                      ${(row.revenueCents / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {row.datedSpendCents == null ? "Unavailable" : `$${(row.datedSpendCents / 100).toFixed(2)}`}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {row.costStatus === "verified" ? (
                        <span>{row.supplierCostCents == null ? "Unavailable" : `$${(row.supplierCostCents / 100).toFixed(2)}`}</span>
                      ) : (
                        <span className="text-amber-800 italic">Unconfirmed</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      {row.cacCents !== null ? `$${(row.cacCents / 100).toFixed(2)}` : "Unavailable"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {row.roas !== null ? `${row.roas}x` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SEPARATE SCENARIO & VALUATION MODELING (SPRINT-0007-T04, AC04) */}
      <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-amber-700" />
          <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
            Simulated Scenario &amp; Unit Economics Sandbox (Model Only)
          </h4>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            Scenario Simulation
          </span>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          {report?.scenarioModel.disclaimer}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-white p-3 rounded-xl border border-stone-200">
            <span className="text-[10px] text-stone-400 font-bold uppercase block">Modeled Card Price</span>
            <span className="text-sm font-bold font-mono text-stone-900">
              ${((report?.scenarioModel.baseAovCents || 900) / 100).toFixed(2)}
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-stone-200">
            <span className="text-[10px] text-stone-400 font-bold uppercase block">Modeled COGS Baseline</span>
            <span className="text-sm font-bold font-mono text-stone-900">
              ${((report?.scenarioModel.baseCogsCents || 488) / 100).toFixed(2)} (Unverified live billing)
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-stone-200">
            <span className="text-[10px] text-stone-400 font-bold uppercase block">Modeled Contribution Margin</span>
            <span className="text-sm font-bold font-mono text-emerald-950">
              {report?.scenarioModel.modeledContributionMarginPercent}% ($3.56/card)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
