"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  Package,
  Gift,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Info,
  ShieldCheck,
  Send,
  Sparkles,
  Tag,
  UserCheck,
  UserX,
  Server,
  Monitor,
  HelpCircle,
  X,
} from "lucide-react";
import type {
  GrowthWorkspaceReport,
  GrowthCampaignReportItem,
  RecoveryCandidate,
  ManualRecoveryLinkResult,
} from "@/lib/promotions-and-growth-service";
import { DESCRIPTIVE_ATTRIBUTION_BADGE, GROWTH_ADVISORY_NOTE } from "@/lib/promotion-client";
import { serializeAdminGlobalScope } from "@/lib/admin-scope";
import type { AdminGlobalScope } from "@/lib/admin-scope";

export interface GrowthWorkspaceProps {
  initialReport?: GrowthWorkspaceReport;
  userEmail?: string | null;
  scope: AdminGlobalScope;
  onRefresh?: () => void;
}

export function GrowthWorkspace({
  initialReport,
  userEmail,
  scope,
  onRefresh,
}: GrowthWorkspaceProps) {
  const [report, setReport] = useState<GrowthWorkspaceReport | null>(initialReport || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery Link Modal State
  const [recoveryModal, setRecoveryModal] = useState<{
    isOpen: boolean;
    candidate: RecoveryCandidate | null;
    offerCode: string;
    linkResult: ManualRecoveryLinkResult | null;
    isGenerating: boolean;
    copied: boolean;
  }>({
    isOpen: false,
    candidate: null,
    offerCode: "FINISH150",
    linkResult: null,
    isGenerating: false,
    copied: false,
  });

  // Campaign Offer Creation Modal State
  const [campaignOfferModal, setCampaignOfferModal] = useState<{
    isOpen: boolean;
    campaignId: string;
    code: string;
    purpose: string;
    discountType: "FIXED_AMOUNT" | "PERCENTAGE";
    discountValue: number;
    destinationPath: string;
    isSaving: boolean;
  }>({
    isOpen: false,
    campaignId: "",
    code: "",
    purpose: "",
    discountType: "FIXED_AMOUNT",
    discountValue: 150,
    destinationPath: "/send",
    isSaving: false,
  });

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        datePreset: scope.datePreset || scope.window || "since_oct13",
        timezone: scope.timezone,
        environment: scope.environment,
        mode: scope.mode,
        channel: scope.channel,
        device: scope.device,
      });
      if (scope.customFrom || scope.from) params.set("from", scope.customFrom || scope.from!);
      if (scope.customTo || scope.to) params.set("to", scope.customTo || scope.to!);
      const res = await fetch(`/api/admin/growth?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch growth report (status ${res.status})`);
      }
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching growth report";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Open Recovery Link Generator for a Draft
  const openRecoveryGenerator = async (candidate: RecoveryCandidate) => {
    const code = candidate.suggestedOfferCode || "FINISH150";
    setRecoveryModal({
      isOpen: true,
      candidate,
      offerCode: code,
      linkResult: null,
      isGenerating: true,
      copied: false,
    });

    try {
      const res = await fetch("/api/admin/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_recovery_link",
          environment: scope.environment,
          draftId: candidate.draftId,
          resumabilityType: candidate.resumabilityType,
          offerCode: code,
          originalChannel: candidate.originalChannel,
          originalUtmCampaign: candidate.originalUtmCampaign,
          destinationPath: candidate.destinationPath || "/send",
        }),
      });
      const data = await res.json();
      if (data.recoveryLink) {
        setRecoveryModal((prev) => ({
          ...prev,
          linkResult: data.recoveryLink,
          isGenerating: false,
        }));
      }
    } catch {
      setRecoveryModal((prev) => ({ ...prev, isGenerating: false }));
    }
  };

  // Re-generate recovery link if offer code changed
  const regenerateRecoveryLink = async (newCode: string) => {
    if (!recoveryModal.candidate) return;
    setRecoveryModal((prev) => ({ ...prev, offerCode: newCode, isGenerating: true }));
    try {
      const res = await fetch("/api/admin/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_recovery_link",
          environment: scope.environment,
          draftId: recoveryModal.candidate.draftId,
          resumabilityType: recoveryModal.candidate.resumabilityType,
          offerCode: newCode,
          originalChannel: recoveryModal.candidate.originalChannel,
          originalUtmCampaign: recoveryModal.candidate.originalUtmCampaign,
          destinationPath: recoveryModal.candidate.destinationPath || "/send",
        }),
      });
      const data = await res.json();
      if (data.recoveryLink) {
        setRecoveryModal((prev) => ({
          ...prev,
          linkResult: data.recoveryLink,
          isGenerating: false,
        }));
      }
    } catch {
      setRecoveryModal((prev) => ({ ...prev, isGenerating: false }));
    }
  };

  // Copy Recovery Link
  const copyRecoveryLink = async () => {
    if (!recoveryModal.linkResult?.fullAbsoluteUrl) return;
    try {
      await navigator.clipboard.writeText(recoveryModal.linkResult.fullAbsoluteUrl);
      setRecoveryModal((prev) => ({ ...prev, copied: true }));
      setTimeout(() => setRecoveryModal((prev) => ({ ...prev, copied: false })), 2500);
    } catch {
      // Fallback
    }
  };

  // Save Campaign Offer
  const saveCampaignOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCampaignOfferModal((prev) => ({ ...prev, isSaving: true }));
    try {
      const res = await fetch("/api/admin/growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_campaign_offer",
          environment: scope.environment,
          campaignId: campaignOfferModal.campaignId,
          code: campaignOfferModal.code.trim().toUpperCase(),
          purpose: campaignOfferModal.purpose,
          discountType: campaignOfferModal.discountType,
          discountValue: Number(campaignOfferModal.discountValue),
          destinationPath: campaignOfferModal.destinationPath,
          actorEmail: userEmail || "admin@sendmynotes.com",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create campaign offer.");
      }

      setCampaignOfferModal((prev) => ({ ...prev, isOpen: false, isSaving: false }));
      alert(`Campaign offer '${data.offer?.code}' created successfully!`);
      await fetchReport();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating campaign offer";
      alert(`Error: ${msg}`);
      setCampaignOfferModal((prev) => ({ ...prev, isSaving: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Link href={`/admin?${serializeAdminGlobalScope({ ...scope, workspace: "growth" })}`} className="inline-flex text-xs underline text-stone-600 hover:text-stone-950">
        Open legacy SEO, campaign, and scenario tools
      </Link>
      {/* 1. Header & Summary Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
              Growth & Campaign Analytics
            </h1>
          </div>
          <p className="text-sm text-stone-600 mt-1">
            Full-cohort campaign attribution, dated spend reconciliation, and measured recovery assistance.
          </p>
        </div>

        <button
          onClick={() => fetchReport()}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 rounded-lg border border-stone-200 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh Growth Data
        </button>
      </div>

      {/* Prominent Descriptive Attribution Badge (AC03) */}
      <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-800 shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
            {report?.attributionBadgeText || DESCRIPTIVE_ATTRIBUTION_BADGE}
          </div>
          <div className="text-xs text-stone-700 mt-1 leading-relaxed">
            {report?.advisoryNote || GROWTH_ADVISORY_NOTE}
          </div>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Dated Spend</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">
            {!report || report.spendStatus === "unavailable" ? "Unavailable" : `$${(report.totalDatedSpendCents / 100).toFixed(2)}`}
          </div>
          <div className="text-xs text-stone-600 mt-1">From spend ledger</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Paid Orders</div>
          <div className="text-2xl font-bold text-emerald-800 mt-1">
            {report?.totalPaidOrders || 0}
          </div>
          <div className="text-xs text-stone-600 mt-1">Cash-paying cards</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">100% Free Promo</div>
          <div className="text-2xl font-bold text-indigo-800 mt-1">
            {report?.totalFreePromoOrders || 0}
          </div>
          <div className="text-xs text-stone-600 mt-1">Separated promo count</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Studio Comps</div>
          <div className="text-2xl font-bold text-purple-800 mt-1">
            {report?.totalStudioComps || 0}
          </div>
          <div className="text-xs text-stone-600 mt-1">Founder test / VIP</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Net Receipts</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">
            ${((report?.totalCapturedRevenueCents || 0) / 100).toFixed(2)}
          </div>
          <div className="text-xs text-stone-600 mt-1">Stripe verified</div>
        </div>
      </div>

      {/* 2. Campaign Performance Table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
              Campaign Attribution & Conversion Economics
            </h2>
            <p className="text-xs text-stone-600 mt-0.5">
              Separates cash-paid orders from free promotional gifts. Dated ad spend merged from ledger.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-white text-stone-600 uppercase tracking-wider text-[11px] border-b border-stone-200">
              <tr>
                <th className="py-3 px-4">Campaign / Channel</th>
                <th className="py-3 px-3">Dated Spend</th>
                <th className="py-3 px-3">Paid Orders</th>
                <th className="py-3 px-3">Free Promo</th>
                <th className="py-3 px-3">Studio Comp</th>
                <th className="py-3 px-3">Net Revenue</th>
                <th className="py-3 px-3">Descriptive ROAS</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {(!report || report.campaigns.length === 0) ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-600">
                    No campaign records observed in selected window.
                  </td>
                </tr>
              ) : (
                report.campaigns.map((camp) => (
                  <tr key={camp.campaignId} className="hover:bg-stone-100 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-stone-900 font-mono">{camp.campaignId}</div>
                      <div className="text-[10px] text-stone-600 uppercase mt-0.5">{camp.channel}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono text-stone-800">
                        {camp.spendStatus === "unavailable" ? "Unavailable" : `$${(camp.datedSpendCents / 100).toFixed(2)}`}
                      </div>
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] mt-0.5 ${
                          camp.spendStatus === "verified"
                            ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/20"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {camp.spendStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-emerald-800">
                      {camp.paidOrdersCount}
                    </td>
                    <td className="py-3 px-3 font-semibold text-indigo-800">
                      {camp.freePromoOrdersCount}
                    </td>
                    <td className="py-3 px-3 font-semibold text-purple-800">
                      {camp.studioCompOrdersCount}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-stone-900">
                      ${(camp.netCapturedRevenueCents / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {camp.roas != null ? (
                        <span className="font-semibold text-amber-800">{camp.roas}x</span>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setCampaignOfferModal({
                            isOpen: true,
                            campaignId: camp.campaignId,
                            code: `${camp.campaignId.substring(0, 6).toUpperCase()}OFF`,
                            purpose: `Campaign offer for ${camp.campaignId}`,
                            discountType: "FIXED_AMOUNT",
                            discountValue: 150,
                            destinationPath: "/send",
                            isSaving: false,
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-slate-600 text-stone-800 font-medium text-[11px] transition"
                      >
                        + Create Offer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Measured Cart Recovery & Draft Assistance (AC03) */}
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-amber-500/10 text-amber-800 border border-amber-500/20">
                <Send className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
                High-Intent Draft Recovery & Assistance
              </h2>
            </div>
            <p className="text-xs text-stone-600 mt-1">
              Select or generate a contextual offer for legitimately resumable drafts. Strictly zero automated messaging.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(!report || report.recoveryCandidates.length === 0) ? (
            <div className="col-span-2 text-center p-6 text-xs text-stone-600">
              No active abandoned drafts observed.
            </div>
          ) : (
            report.recoveryCandidates.map((cand) => (
              <div
                key={cand.draftId}
                className="p-4 bg-white rounded-xl border border-stone-200 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-stone-900 flex items-center gap-2">
                      {cand.draftId}
                      {cand.recipientName && (
                        <span className="text-stone-600 font-sans font-normal text-[11px]">
                          for &quot;{cand.recipientName}&quot;
                        </span>
                      )}
                    </div>
                    {cand.customerEmail ? (
                      <div className="text-[11px] text-stone-700 mt-0.5">{cand.customerEmail}</div>
                    ) : (
                      <div className="text-[10px] text-stone-600 italic mt-0.5">Anonymous Guest Draft</div>
                    )}
                  </div>

                  {/* Resumability Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${
                      cand.resumabilityType === "server_order_draft"
                        ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-800 border-amber-500/30"
                    }`}
                  >
                    {cand.resumabilityType === "server_order_draft" ? (
                      <>
                        <Server className="w-3 h-3" />
                        Server Draft
                      </>
                    ) : (
                      <>
                        <Monitor className="w-3 h-3" />
                        Browser-Local Only
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-600 pt-2 border-t border-stone-200">
                  <div className="flex items-center gap-2">
                    {/* Eligibility Badge */}
                    {cand.contactEligibility === "eligible" ? (
                      <span className="flex items-center gap-1 text-emerald-800">
                        <UserCheck className="w-3.5 h-3.5" />
                        Contact Eligible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-stone-600">
                        <UserX className="w-3.5 h-3.5" />
                        Anonymous (No Email)
                      </span>
                    )}
                    <span>•</span>
                    <span>Origin: {cand.originalChannel || "direct"}</span>
                  </div>

                  <button
                    onClick={() => openRecoveryGenerator(cand)}
                    className="flex items-center gap-1 px-3 py-1 bg-amber-100 hover:bg-amber-100 text-stone-900 rounded font-medium text-xs transition"
                  >
                    Generate Link
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Manual Recovery Link Modal */}
      {recoveryModal.isOpen && recoveryModal.candidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-amber-800" />
                Manual Recovery Link Generator
              </h2>
              <button
                onClick={() => setRecoveryModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Draft Info */}
              <div className="p-3 bg-white rounded-xl space-y-1.5 border border-stone-200">
                <div className="flex justify-between">
                  <span className="text-stone-600">Target Draft:</span>
                  <span className="font-mono text-stone-900 font-bold">{recoveryModal.candidate.draftId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Draft Resumability:</span>
                  <span className="font-semibold text-stone-800">
                    {recoveryModal.candidate.resumabilityType === "server_order_draft"
                      ? "Server Order Draft (cross-device restoration)"
                      : "Browser-Local Only (local device cache)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-600">Acquisition Attribution:</span>
                  <span className="font-mono text-stone-700">
                    {recoveryModal.candidate.originalChannel || "direct"} (Preserved)
                  </span>
                </div>
              </div>

              {/* Offer Code Selection */}
              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Promotional Recovery Code
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={recoveryModal.offerCode}
                    onChange={(e) => {
                      const c = e.target.value.toUpperCase();
                      regenerateRecoveryLink(c);
                    }}
                    placeholder="e.g. FINISH150"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-mono uppercase"
                  />
                  <button
                    onClick={() => regenerateRecoveryLink("WELCOME2")}
                    className="px-2.5 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-stone-700 whitespace-nowrap"
                  >
                    Use WELCOME2
                  </button>
                </div>
              </div>

              {/* Generated URL Box */}
              {recoveryModal.linkResult && (
                <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-2">
                  <div className="text-[10px] text-stone-600 uppercase font-semibold">
                    Attribution-Preserving Recovery URL
                  </div>
                  <div className="font-mono text-amber-800 text-[11px] break-all select-all">
                    {recoveryModal.linkResult.fullAbsoluteUrl}
                  </div>
                  <div className="text-[10px] text-stone-600 leading-normal">
                    {recoveryModal.linkResult.notes}
                  </div>
                </div>
              )}

              {/* Strict Zero Outreach Disclaimer */}
              <div className="p-3 bg-white rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <div className="font-semibold text-stone-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-800" />
                  Strict Policy Guarantee
                </div>
                <div>
                  Zero automated customer messages or SMS are triggered. Copying or opening this link
                  does not mutate ad platforms or spam visitors.
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setRecoveryModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-stone-600 hover:text-stone-900"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={copyRecoveryLink}
                  className="flex items-center gap-1.5 px-5 py-2 font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg transition"
                >
                  {recoveryModal.copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Recovery Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create Campaign Offer Modal */}
      {campaignOfferModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-800" />
                Create Campaign Offer
              </h2>
              <button
                onClick={() => setCampaignOfferModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveCampaignOffer} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Target Campaign</label>
                <input
                  type="text"
                  disabled
                  value={campaignOfferModal.campaignId}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Offer Code <span className="text-rose-800">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={campaignOfferModal.code}
                  onChange={(e) =>
                    setCampaignOfferModal({
                      ...campaignOfferModal,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                    })
                  }
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Purpose / Tagline</label>
                <input
                  type="text"
                  value={campaignOfferModal.purpose}
                  onChange={(e) =>
                    setCampaignOfferModal({ ...campaignOfferModal, purpose: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Discount Type</label>
                  <select
                    value={campaignOfferModal.discountType}
                    onChange={(e) =>
                      setCampaignOfferModal({
                        ...campaignOfferModal,
                        discountType: e.target.value as any,
                        discountValue: e.target.value === "PERCENTAGE" ? 20 : 150,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  >
                    <option value="FIXED_AMOUNT">Fixed Dollar ($)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-700 font-medium mb-1">
                    Value {campaignOfferModal.discountType === "PERCENTAGE" ? "(%)" : "(cents)"}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={campaignOfferModal.discountValue}
                    onChange={(e) =>
                      setCampaignOfferModal({
                        ...campaignOfferModal,
                        discountValue: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setCampaignOfferModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={campaignOfferModal.isSaving}
                  className="px-5 py-2 font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg transition"
                >
                  {campaignOfferModal.isSaving ? "Saving..." : "Create Campaign Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
