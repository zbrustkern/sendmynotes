"use client";

import React from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Package,
  Users,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
  Database,
  Calendar,
  Clock,
  Download,
} from "lucide-react";
import {
  AdminGlobalScope,
  buildEvidenceDrilldownUrl,
} from "@/lib/admin-scope";
import { ExecutiveReportingOverview } from "@/lib/reporting-engine";
import { MetricStatus } from "@/lib/contracts/admin-overhaul";

export interface ExecutiveOverviewProps {
  report: ExecutiveReportingOverview | null;
  scope: AdminGlobalScope;
  onScopeChange: (newScope: AdminGlobalScope) => void;
  isLoading: boolean;
}

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Unavailable";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "Unavailable";
  const pct = rate > 1 ? rate : rate * 100;
  return `${pct.toFixed(1)}%`;
}

function StatusBadge({ status, label }: { status: MetricStatus; label?: string }) {
  switch (status) {
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>{label || "Verified"}</span>
        </span>
      );
    case "estimated":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <Clock className="w-2.5 h-2.5" />
          <span>{label || "Estimated"}</span>
        </span>
      );
    case "partial":
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
          <HelpCircle className="w-2.5 h-2.5" />
          <span>{label || "Partial"}</span>
        </span>
      );
    case "unavailable":
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-stone-100 text-stone-700 border border-stone-300">
          <AlertTriangle className="w-2.5 h-2.5 text-stone-500" />
          <span>{label || "Unavailable"}</span>
        </span>
      );
  }
}

export function ExecutiveOverview({
  report,
  scope,
  onScopeChange,
  isLoading,
}: ExecutiveOverviewProps) {
  // Loading skeleton when no prior report data exists
  if (isLoading && !report) {
    return (
      <div className="space-y-6" data-testid="overview-loading-state">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="executive-scorecard-grid">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              data-testid="metric-skeleton"
              className="bg-white rounded-2xl p-5 border border-stone-200 shadow-2xs animate-pulse space-y-3"
            >
              <div className="h-3.5 bg-stone-200 rounded w-1/2"></div>
              <div className="h-8 bg-stone-200 rounded w-3/4"></div>
              <div className="h-3 bg-stone-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center space-y-3 shadow-2xs">
        <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
        <h3 className="text-base font-semibold text-stone-900">No Reporting Data Available</h3>
        <p className="text-xs text-stone-500 max-w-md mx-auto">
          No report snapshot could be evaluated for the current scope. Check your date filter or ensure the reporting API is accessible.
        </p>
      </div>
    );
  }

  const { summaryMetrics, funnel, campaigns, operationalExceptions } = report;

  // Combine actual exceptions with explicit missing-evidence tasks.
  const rankedExceptions = [...(operationalExceptions || [])];

  if (summaryMetrics.supplierCostCents.status === "unavailable") {
    rankedExceptions.push({
      id: "exc_supplier_invoices_unconfirmed",
      category: "supplier_cost_unconfirmed",
      severity: "warning",
      title: "Actual Supplier COGS Unconfirmed (Margin Unavailable)",
      ageMs: 0,
    });
  }

  if (summaryMetrics.datedAdSpendCents.status === "unavailable") {
    rankedExceptions.push({
      id: "exc_ad_spend_missing",
      category: "dated_spend_missing",
      severity: "warning",
      title: "Dated Ad Spend Missing (CAC Unavailable)",
      ageMs: 0,
    });
  }


  return (
    <div className="space-y-6">
      {/* =========================================================================
          SECTION 1: ABOVE-THE-FOLD EXECUTIVE CORE GRID (AC01 at 1440x900)
          ========================================================================= */}

      {/* 1A. Four Compact KPI Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="executive-scorecard-grid">
        {/* Card 1: Verified Customer Demand */}
        <div
          onClick={() =>
            onScopeChange({ ...scope, workspace: "orders", drilldownMetric: "paidOrdersCount" })
          }
          className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs hover:border-stone-400 hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="View Verified Orders Drilldown"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Verified Demand
            </span>
            <StatusBadge status={summaryMetrics.paidOrdersCount.status} label="Verified" />
          </div>

          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {summaryMetrics.paidOrdersCount.value} orders
              <span className="text-xs font-sans font-medium text-stone-500 ml-1.5">(paid orders)</span>
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              Across <span className="font-semibold text-stone-900">{summaryMetrics.paidSessionsCount.value}</span> unique sessions
            </div>
          </div>

          <div className="text-xs text-stone-400 flex items-center justify-between pt-2 border-t border-stone-100">
            <span>Oct 11 Baseline: 0 Indep.</span>
            <span className="text-amber-700 font-medium inline-flex items-center gap-0.5">
              Orders <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 2: Net Captured Revenue */}
        <div
          onClick={() =>
            onScopeChange({ ...scope, workspace: "economics", drilldownMetric: "netCapturedRevenueCents" })
          }
          className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs hover:border-stone-400 hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="View Net Revenue Drilldown"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Net Receipts
            </span>
            <StatusBadge status={summaryMetrics.netReceipts.status} label="Cash Verified" />
          </div>

          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-emerald-950 tracking-tight">
              {formatCents(summaryMetrics.netReceipts.value)}
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              Gross {formatCents(summaryMetrics.verifiedCapturedRevenue.value)}
              {summaryMetrics.refundedAmount.value > 0 && (
                <span className="text-rose-600 ml-1">(-{formatCents(summaryMetrics.refundedAmount.value)} refunded)</span>
              )}
            </div>
          </div>

          <div className="text-xs text-stone-400 flex items-center justify-between pt-2 border-t border-stone-100">
            <span>AOV: {formatCents(summaryMetrics.averageOrderValueCents.value)}</span>
            <span className="text-amber-700 font-medium inline-flex items-center gap-0.5">
              Economics <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 3: Observed Funnel Conversion */}
        <div
          onClick={() =>
            onScopeChange({ ...scope, workspace: "journeys", drilldownMetric: "sessionConversionRatePercent" })
          }
          className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs hover:border-stone-400 hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="View Session Conversion Drilldown"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Session CVR
            </span>
            <StatusBadge status={summaryMetrics.sessionConversionRate.status} />
          </div>

          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {formatRate(summaryMetrics.sessionConversionRate.value)}
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              <span className="font-semibold text-stone-900">{summaryMetrics.sessionConversionRate.numerator ?? "Unknown"}</span> of{" "}
              <span className="font-semibold text-stone-900">{summaryMetrics.sessionConversionRate.denominator ?? "Unknown"}</span> entered sessions
            </div>
          </div>

          <div className="text-xs text-stone-400 flex items-center justify-between pt-2 border-t border-stone-100">
            <span>Observed entry · 24-hour horizon</span>
            <span className="text-amber-700 font-medium inline-flex items-center gap-0.5">
              Journeys <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 4: Acquisition & Unit Economics */}
        <div
          onClick={() =>
            onScopeChange({ ...scope, workspace: "growth", drilldownMetric: "blendedCacCents" })
          }
          className="bg-white rounded-2xl p-4.5 border border-stone-200/90 shadow-2xs hover:border-stone-400 hover:shadow-xs transition cursor-pointer flex flex-col justify-between"
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="View Growth & Unit Economics"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Acquisition Economics
            </span>
            <StatusBadge status={summaryMetrics.blendedCacCents.status} />
          </div>

          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 tracking-tight">
              {summaryMetrics.blendedCacCents.value !== null ? (
                formatCents(summaryMetrics.blendedCacCents.value)
              ) : (
                <span className="text-base text-stone-500 font-sans font-medium">Unavailable</span>
              )}
            </div>
            <div className="text-xs text-stone-600 mt-0.5">
              Spend:{" "}
              {summaryMetrics.datedAdSpendCents.value !== null ? (
                <span className="font-semibold text-stone-900">{formatCents(summaryMetrics.datedAdSpendCents.value)}</span>
              ) : (
                <span className="text-stone-500 italic">No spend imported</span>
              )}
            </div>
          </div>

          <div className="text-xs text-stone-400 flex items-center justify-between pt-2 border-t border-stone-100">
            <span>
              Margin:{" "}
              {summaryMetrics.contributionMarginPercent.value !== null
                ? `${summaryMetrics.contributionMarginPercent.value}%`
                : "Unconfirmed"}
            </span>
            <span className="text-amber-700 font-medium inline-flex items-center gap-0.5">
              Growth <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* 1B. Funnel & Ranked Actionable Exceptions Row (2:1 desktop layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Complete Observed Funnel Strip (2 Cols) */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between"
          data-testid="executive-funnel-summary"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Observed Journey Milestones</h3>
                <p className="text-xs text-stone-500">
                  Independent observed counts; missing steps do not establish abandonment.
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2 py-0.5 bg-stone-100 text-stone-700 rounded font-medium">
                  {funnel.branching.activeSessionsCount} active (5m)
                </span>
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-medium border border-amber-200">
                  {funnel.branching.addressDeferredCount} deferred address
                </span>
              </div>
            </div>

            {/* Horizontal Funnel Milestone Strip */}
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 my-2"
              role="region"
              aria-label="Observed Funnel Stages"
            >
              {funnel.stages.map((st) => (
                <div
                  key={st.stageKey}
                  onClick={() =>
                    onScopeChange({ ...scope, workspace: "journeys", drilldownStage: st.stageKey })
                  }
                  role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
                  className="bg-stone-50 hover:bg-stone-100 p-2.5 rounded-xl border border-stone-200/80 transition cursor-pointer text-center group"
                >
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider leading-snug min-h-[28px]">
                    {st.label}
                  </div>
                  <div className="text-base sm:text-lg font-serif font-bold text-stone-900 mt-0.5">
                    {st.observedCount}
                  </div>
                  <div className="text-xs text-stone-500 font-medium">
                    {st.conversionRateFromEntry === null ? "Observed reach" : formatRate(st.conversionRateFromEntry)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 pt-3 border-t border-stone-100 mt-3">
            <div className="flex items-center gap-3">
              <span>
                Confirmed: <strong className="text-stone-800">{funnel.branching.addressConfirmedCount}</strong>
              </span>
              <span>
                Deferred: <strong className="text-stone-800">{funnel.branching.addressDeferredCount}</strong>
              </span>
              <span>
                Draft Resumes: <strong className="text-stone-800">{funnel.branching.draftResumedCount}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onScopeChange({ ...scope, workspace: "journeys" })}
              className="text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
            >
              <span>Explore Visitor Journeys</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Ranked Actionable Exceptions Queue (1 Col - At least 3 visible above fold - AC01) */}
        <div
          className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between"
          data-testid="executive-exceptions-queue"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">Needs Attention</h3>
                <p className="text-xs text-stone-500">Ranked operational exceptions</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                {rankedExceptions.length} Actionable
              </span>
            </div>

            <div className="space-y-2">
              {rankedExceptions.slice(0, 4).map((exc) => {
                let targetWorkspace: AdminGlobalScope["workspace"] = "reliability";
                let actionLabel = (exc as any).actionLabel || "Inspect";

                if (exc.category.includes("fulfillment")) {
                  targetWorkspace = "orders";
                  if (!(exc as any).actionLabel) actionLabel = exc.orderId ? "Inspect Order" : "Inspect in Orders";
                } else if (exc.category.includes("supplier") || exc.category.includes("cost")) {
                  targetWorkspace = "economics";
                  if (!(exc as any).actionLabel) actionLabel = "Import Costs";
                } else if (exc.category.includes("spend")) {
                  targetWorkspace = "growth";
                  if (!(exc as any).actionLabel) actionLabel = "Import Spend";
                } else if (exc.category.includes("historical")) {
                  targetWorkspace = "orders";
                  if (!(exc as any).actionLabel) actionLabel = "Reconcile";
                }

                return (
                  <div
                    key={exc.id}
                    className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100/80 transition flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            exc.severity === "critical"
                              ? "bg-rose-500"
                              : exc.severity === "warning"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                          }`}
                        />
                        <span className="text-xs font-semibold text-stone-900 truncate">
                          {exc.title || (exc as any).message}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 font-mono mt-0.5 pl-3.5">
                        {exc.orderId ? `Order: ${exc.orderId}` : exc.category}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onScopeChange({
                          ...scope,
                          workspace: targetWorkspace,
                          drilldownExceptionId: exc.id,
                        })
                      }
                      className="text-xs font-semibold text-amber-800 hover:text-black shrink-0 underline"
                    >
                      {actionLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 mt-3 text-right">
            <button
              type="button"
              onClick={() => onScopeChange({ ...scope, workspace: "reliability" })}
              className="text-xs font-semibold text-stone-700 hover:text-stone-950 inline-flex items-center gap-1"
            >
              <span>View All Reliability Exceptions</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: SECONDARY ROW: ACQUISITION CAMPAIGNS & MEASUREMENT HEALTH
          ========================================================================= */}

      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Acquisition Performance (Full Cohort)</h3>
            <p className="text-xs text-stone-500">
              Aggregated across the entire entry cohort. Completely immune to session pagination.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={buildEvidenceDrilldownUrl(scope, { workspace: "growth" })}
              className="text-xs font-semibold text-amber-800 hover:text-black flex items-center gap-1"
            >
              <span>Explore All Campaigns</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Labeled Horizontal Overflow Container (AC02, 390px & 200% zoom) */}
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Campaign acquisition cohorts table"
          tabIndex={0}
        >
          <table className="w-full text-left text-xs text-stone-700 divide-y divide-stone-100 min-w-[700px]">
            <thead className="bg-[#FAF8F5] text-stone-500 font-semibold text-xs uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Channel / Campaign</th>
                <th className="py-2.5 px-3 text-right">Sessions</th>
                <th className="py-2.5 px-3 text-right">Paid Sessions</th>
                <th className="py-2.5 px-3 text-right">Paid Orders</th>
                <th className="py-2.5 px-3 text-right">Captured Revenue</th>
                <th className="py-2.5 px-3 text-right">Dated Spend</th>
                <th className="py-2.5 px-3 text-right">CAC</th>
                <th className="py-2.5 px-4 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-stone-400 italic">
                    No acquisition campaigns found for this reporting window.
                  </td>
                </tr>
              ) : (
                campaigns.slice(0, 5).map((cr, idx) => (
                  <tr key={idx} className="hover:bg-stone-50/80 transition">
                    <td className="py-2.5 px-4 font-medium text-stone-900">
                      <div>{cr.channel}</div>
                      {cr.campaign !== "none" && cr.campaign !== "_all_" && (
                        <div className="text-xs text-stone-400 font-mono">{cr.campaign}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{cr.sessions}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{cr.paidSessions}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">{cr.paidOrders}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-950">
                      {formatCents(cr.capturedRevenueCents)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {cr.datedSpendCents !== null ? formatCents(cr.datedSpendCents) : <span className="text-stone-400 italic">Missing</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      {cr.cacCents !== null ? formatCents(cr.cacCents) : <span className="text-stone-400 italic">Unavailable</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">
                      {cr.roas !== null ? `${cr.roas}x` : <span className="text-stone-400 italic">N/A</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Measurement Quality Strip */}
        <div
          className="p-3 bg-stone-50 border-t border-stone-200/70 text-xs text-stone-500 flex flex-wrap items-center justify-between gap-3"
          role="region"
          aria-label="Measurement quality and attribution health"
        >
          <div className="flex items-center gap-3">
            <span>
              Policy: <strong className="font-mono text-stone-700">{report.definitionVersion}</strong>
            </span>
            <span>
              Baseline: <strong className="font-mono text-stone-700">Canonical Baseline (Oct 11, 2026)</strong>
            </span>
            <span>
              Storage: <strong className="font-mono text-stone-700">{report.storage.adapterType}</strong>
            </span>
            <span>
              Warehouse: <strong className="font-mono text-stone-700">{report.storage.cloudWarehouseStatus}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Telemetry source read: {summaryMetrics.totalSessions.status}</span>
            </span>
            <span className="text-stone-300">|</span>
            <span className="text-stone-500">Bounded source read · coverage is not end-to-end verification</span>
          </div>
        </div>
      </div>
    </div>
  );
}
