"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Tag,
  Plus,
  Search,
  Filter,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Archive,
  Pause,
  Play,
  Trash2,
  Eye,
  RefreshCw,
  Sparkles,
  DollarSign,
  TrendingUp,
  Clock,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  X,
  HelpCircle,
  FileText,
} from "lucide-react";
import {
  OFFER_CREATION_PRESETS,
  ALLOWED_DESTINATION_PATHS,
  previewOfferPricing,
  buildDestinationOfferLink,
} from "@/lib/promotion-client";
import type {
  OfferPresetKey,
  PromotionsWorkspaceOfferItem,
  OfferEvidenceDetail,
  ConsequentialChangePreview,
  DestinationValidationResult,
} from "@/lib/promotion-client";
import type { OfferLifecycleStatus } from "@/lib/contracts/admin-overhaul";
import { serializeAdminGlobalScope } from "@/lib/admin-scope";
import type { AdminGlobalScope } from "@/lib/admin-scope";

export interface PromotionsWorkspaceProps {
  initialOffers?: PromotionsWorkspaceOfferItem[];
  userEmail?: string | null;
  scope: AdminGlobalScope;
  onRefresh?: () => void;
}

export function PromotionsWorkspace({
  initialOffers = [],
  userEmail,
  scope,
  onRefresh,
}: PromotionsWorkspaceProps) {
  const [offers, setOffers] = useState<PromotionsWorkspaceOfferItem[]>(initialOffers);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OfferLifecycleStatus | "all">("all");

  // Create / Edit Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    purpose: "",
    campaignId: "",
    discountType: "FIXED_AMOUNT" as "FIXED_AMOUNT" | "PERCENTAGE",
    discountValue: 200, // cents or percentage
    destinationPath: "/send",
    maxUses: "" as string | number,
    dollarBudgetLimitCents: "" as string | number,
    perCustomerLimit: "" as string | number,
    startsAtDate: "",
    endsAtDate: "",
    reason: "",
  });

  // Link Builder Modal State
  const [isLinkBuilderOpen, setIsLinkBuilderOpen] = useState(false);
  const [linkOffer, setLinkOffer] = useState<PromotionsWorkspaceOfferItem | null>(null);
  const [linkAlias, setLinkAlias] = useState<"discount" | "code" | "promo">("discount");
  const [linkDestination, setLinkDestination] = useState("/send");
  const [linkUtmSource, setLinkUtmSource] = useState("growth");
  const [linkUtmCampaign, setLinkUtmCampaign] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Consequential Effect Preview Modal State
  const [consequentialModal, setConsequentialModal] = useState<{
    isOpen: boolean;
    preview: ConsequentialChangePreview | null;
    action: "create" | "update" | "pause" | "activate" | "archive" | "delete";
    code: string;
    payload?: any;
    reason: string;
    isExecuting: boolean;
  }>({
    isOpen: false,
    preview: null,
    action: "pause",
    code: "",
    reason: "",
    isExecuting: false,
  });

  // Evidence Detail Drawer State
  const [evidenceDrawer, setEvidenceDrawer] = useState<{
    isOpen: boolean;
    isLoading: boolean;
    data: OfferEvidenceDetail | null;
    code: string | null;
  }>({
    isOpen: false,
    isLoading: false,
    data: null,
    code: null,
  });

  // Fetch offers
  const fetchOffers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("environment", scope.environment);
      if (searchQuery) params.set("q", searchQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/promotions?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch promotions (status ${res.status})`);
      }
      const data = await res.json();
      if (data.offers) {
        setOffers(data.offers);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error fetching promotions";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, scope.environment]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Overall workspace stats
  const stats = useMemo(() => {
    let totalActive = 0;
    let totalRedemptions = 0;
    let totalSubsidyCents = 0;

    offers.forEach((o) => {
      if (o.status === "active") totalActive++;
      totalRedemptions += o.usedCount || 0;
      totalSubsidyCents += o.totalDiscountGivenCents || 0;
    });

    return {
      totalOffers: offers.length,
      totalActive,
      totalRedemptions,
      totalSubsidyCents,
    };
  }, [offers]);

  // Apply a preset to editor form
  const applyPreset = (presetKey: OfferPresetKey) => {
    const preset = OFFER_CREATION_PRESETS[presetKey];
    if (!preset) return;

    setFormData((prev) => ({
      ...prev,
      code: preset.codeSuggestion,
      purpose: preset.purpose,
      discountType: preset.discountType,
      discountValue: preset.discountValue,
      destinationPath: preset.destinationPath,
      maxUses: preset.maxUses ?? "",
      perCustomerLimit: preset.perCustomerLimit ?? "",
      reason: `Created via preset: ${preset.name}`,
    }));
  };

  // Live Price Preview for current editor form
  const liveEditorPricing = useMemo(() => {
    const val = Number(formData.discountValue) || 0;
    return previewOfferPricing(formData.discountType, val);
  }, [formData.discountType, formData.discountValue]);

  // Handle Create / Edit Submit
  const handleEditorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formData.code.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 2) {
      alert("Offer code must be at least 2 characters.");
      return;
    }

    const payload = {
      code: cleanCode,
      purpose: formData.purpose.trim() || "Promotional Discount",
      campaignId: formData.campaignId.trim() || undefined,
      discountType: formData.discountType,
      discountValue: Number(formData.discountValue) || 0,
      destinationPath: formData.destinationPath.trim() || "/send",
      maxUses: formData.maxUses ? Number(formData.maxUses) : undefined,
      dollarBudgetLimitCents: formData.dollarBudgetLimitCents ? Number(formData.dollarBudgetLimitCents) * 100 : undefined,
      perCustomerLimit: formData.perCustomerLimit ? Number(formData.perCustomerLimit) : undefined,
      startsAt: formData.startsAtDate ? new Date(formData.startsAtDate).getTime() : undefined,
      endsAt: formData.endsAtDate ? new Date(formData.endsAtDate).getTime() : undefined,
    };

    const action = editingCode ? "update" : "create";

    // Request Consequential Effect Preview before execution
    try {
      const res = await fetch(
        `/api/admin/promotions?view=effect-preview&code=${encodeURIComponent(cleanCode)}&action=${action}&environment=${encodeURIComponent(scope.environment)}`
      );
      const previewData = await res.json();
      setConsequentialModal({
        isOpen: true,
        preview: previewData.preview || null,
        action,
        code: cleanCode,
        payload,
        reason: formData.reason || `Audited ${action} via Promotions Workspace`,
        isExecuting: false,
      });
    } catch {
      // Fallback: open modal directly
      setConsequentialModal({
        isOpen: true,
        preview: null,
        action,
        code: cleanCode,
        payload,
        reason: formData.reason || `Audited ${action} via Promotions Workspace`,
        isExecuting: false,
      });
    }
  };

  // Trigger Consequential Action for Table Row (Pause, Activate, Archive, Delete)
  const triggerRowAction = async (
    code: string,
    action: "pause" | "activate" | "archive" | "delete"
  ) => {
    try {
      const res = await fetch(
        `/api/admin/promotions?view=effect-preview&code=${encodeURIComponent(code)}&action=${action}&environment=${encodeURIComponent(scope.environment)}`
      );
      const data = await res.json();
      setConsequentialModal({
        isOpen: true,
        preview: data.preview || null,
        action,
        code,
        payload: undefined,
        reason: `Admin requested ${action} for ${code}`,
        isExecuting: false,
      });
    } catch {
      setConsequentialModal({
        isOpen: true,
        preview: null,
        action,
        code,
        reason: `Admin requested ${action} for ${code}`,
        isExecuting: false,
      });
    }
  };

  // Confirm and Execute Consequential Action
  const executeConfirmedAction = async () => {
    setConsequentialModal((prev) => ({ ...prev, isExecuting: true }));
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: consequentialModal.action,
          code: consequentialModal.code,
          payload: consequentialModal.payload,
          reason: consequentialModal.reason,
          actorEmail: userEmail || "admin@sendmynotes.com",
          environment: scope.environment,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to execute offer mutation.");
      }

      setConsequentialModal({
        isOpen: false,
        preview: null,
        action: "pause",
        code: "",
        reason: "",
        isExecuting: false,
      });
      setIsEditorOpen(false);
      setEditingCode(null);
      await fetchOffers();
      onRefresh?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error executing action";
      alert(`Action Failed: ${msg}`);
      setConsequentialModal((prev) => ({ ...prev, isExecuting: false }));
    }
  };

  // Open Evidence Drawer
  const openEvidence = async (code: string) => {
    setEvidenceDrawer({
      isOpen: true,
      isLoading: true,
      data: null,
      code,
    });
    try {
      const res = await fetch(`/api/admin/promotions?view=evidence&code=${encodeURIComponent(code)}&environment=${encodeURIComponent(scope.environment)}`);
      const data = await res.json();
      if (data.evidence) {
        setEvidenceDrawer({
          isOpen: true,
          isLoading: false,
          data: data.evidence,
          code,
        });
      }
    } catch {
      setEvidenceDrawer((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Open Link Builder Modal
  const openLinkBuilder = (offer: PromotionsWorkspaceOfferItem) => {
    setLinkOffer(offer);
    setLinkDestination(offer.destinationPath || "/send");
    setLinkUtmCampaign(offer.campaignId || "");
    setCopiedLink(false);
    setIsLinkBuilderOpen(true);
  };

  // Current Generated Destination Link
  const currentLinkResult: DestinationValidationResult = useMemo(() => {
    if (!linkOffer) {
      return buildDestinationOfferLink({ code: "" });
    }
    return buildDestinationOfferLink({
      code: linkOffer.code,
      destinationPath: linkDestination,
      aliasParam: linkAlias,
      utmSource: linkUtmSource,
      utmCampaign: linkUtmCampaign,
    });
  }, [linkOffer, linkDestination, linkAlias, linkUtmSource, linkUtmCampaign]);

  const copyLinkToClipboard = async () => {
    if (!currentLinkResult.fullAbsoluteUrl) return;
    try {
      await navigator.clipboard.writeText(currentLinkResult.fullAbsoluteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="space-y-6">
      <Link href={`/admin?${serializeAdminGlobalScope({ ...scope, workspace: "promotions" })}`} className="inline-flex text-xs underline text-stone-600 hover:text-stone-950">
        Open legacy discount code tools
      </Link>
      {/* 1. Header & Summary Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-800 border border-amber-500/20">
              <Tag className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
              Promotions & Discount Controls
            </h1>
          </div>
          <p className="text-sm text-stone-600 mt-1">
            Authoritative promotional offers, destination-aware link distribution, and reconciled evidence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOffers()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 rounded-lg border border-stone-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setEditingCode(null);
              setFormData({
                code: "",
                purpose: "",
                campaignId: "",
                discountType: "FIXED_AMOUNT",
                discountValue: 200,
                destinationPath: "/send",
                maxUses: "",
                dollarBudgetLimitCents: "",
                perCustomerLimit: "",
                startsAtDate: "",
                endsAtDate: "",
                reason: "",
              });
              setIsEditorOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Create Offer
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Total Offers</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{stats.totalOffers}</div>
          <div className="text-xs text-stone-600 mt-1 flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            {stats.totalActive} currently active
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Total Redemptions</div>
          <div className="text-2xl font-bold text-stone-900 mt-1">{stats.totalRedemptions}</div>
          <div className="text-xs text-stone-600 mt-1">Observed checkout redemptions</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Discount Subsidy</div>
          <div className="text-2xl font-bold text-amber-800 mt-1">
            ${(stats.totalSubsidyCents / 100).toFixed(2)}
          </div>
          <div className="text-xs text-stone-600 mt-1">Studio customer savings given</div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-stone-200">
          <div className="text-xs font-medium text-stone-600 uppercase tracking-wider">Production Cost</div>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 text-xs font-medium rounded bg-amber-500/10 text-amber-800 border border-amber-500/30">
            <Info className="w-3.5 h-3.5" />
            Unconfirmed
          </div>
          <div className="text-xs text-stone-600 mt-1">Verified post-invoice allocation</div>
        </div>
      </div>

      {/* 2. Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-850 p-3 rounded-xl border border-stone-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search code, purpose, or campaign..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-900 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {(["all", "active", "scheduled", "paused", "expired", "exhausted", "archived"] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg capitalize whitespace-nowrap transition ${
                  statusFilter === status
                    ? "bg-amber-100 text-stone-900 font-semibold shadow-sm"
                    : "text-stone-600 hover:text-stone-800 hover:bg-white"
                }`}
              >
                {status}
              </button>
            )
          )}
        </div>
      </div>

      {/* 3. Offers Table */}
      <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
        {isLoading && offers.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-600 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-800" />
            Loading promotional offers...
          </div>
        ) : offers.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-600">
            No promotional offers found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-white text-stone-600 uppercase tracking-wider text-[11px] border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Offer Code & Purpose</th>
                  <th className="py-3 px-3">Type & Discount</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Final / Subsidy</th>
                  <th className="py-3 px-3">Usage & Cap</th>
                  <th className="py-3 px-3">Destination</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {offers.map((offer) => {
                  const statusColors: Record<OfferLifecycleStatus, string> = {
                    active: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30",
                    scheduled: "bg-blue-500/10 text-blue-800 border-blue-500/30",
                    paused: "bg-amber-500/10 text-amber-800 border-amber-500/30",
                    expired: "bg-rose-500/10 text-rose-800 border-rose-500/30",
                    exhausted: "bg-purple-500/10 text-purple-800 border-purple-500/30",
                    archived: "bg-slate-500/10 text-stone-600 border-slate-500/30",
                    draft: "bg-stone-500/10 text-stone-300 border-stone-500/30",
                  };

                  return (
                    <tr key={offer.code} className="hover:bg-stone-100 transition">
                      {/* Code & Purpose */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-stone-900 text-sm tracking-wide">
                          {offer.code}
                        </div>
                        <div className="text-stone-600 line-clamp-1 text-[11px] mt-0.5">
                          {offer.purpose || "Promotional Discount"}
                        </div>
                        {offer.campaignId && (
                          <span className="inline-block px-1.5 py-0.2 text-[10px] rounded bg-indigo-500/10 text-indigo-800 border border-indigo-500/20 mt-1 font-mono">
                            {offer.campaignId}
                          </span>
                        )}
                      </td>

                      {/* Type & Discount */}
                      <td className="py-3 px-3">
                        <span className="font-semibold text-stone-800">
                          {offer.discountType === "PERCENTAGE"
                            ? `${offer.discountValue}% OFF`
                            : `$${(offer.discountValue / 100).toFixed(2)} OFF`}
                        </span>
                        <div className="text-[10px] text-stone-600 mt-0.5">
                          {offer.discountType === "PERCENTAGE" ? "Percentage" : "Fixed Amount"}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${
                            statusColors[offer.status] || "bg-stone-100 text-stone-700"
                          }`}
                        >
                          {offer.status}
                        </span>
                        {offer.reservedCount > 0 && (
                          <div className="text-[10px] text-amber-800 mt-0.5 flex items-center gap-1 font-medium">
                            <Clock className="w-2.5 h-2.5" />
                            {offer.reservedCount} hold(s)
                          </div>
                        )}
                      </td>

                      {/* Final / Subsidy Preview */}
                      <td className="py-3 px-3">
                        <div className="text-stone-900 font-medium">
                          ${(offer.livePricePreview.finalAmountCents / 100).toFixed(2)}
                          {offer.livePricePreview.isFree && (
                            <span className="ml-1 text-[10px] font-bold text-emerald-800 bg-emerald-500/10 px-1 py-0.2 rounded">
                              FREE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-amber-800">
                          -${(offer.livePricePreview.subsidyCents / 100).toFixed(2)} subsidy
                        </div>
                      </td>

                      {/* Usage & Caps */}
                      <td className="py-3 px-3">
                        <div className="text-stone-800">
                          <span className="font-bold">{offer.usedCount}</span>
                          <span className="text-stone-600">
                            {offer.maxUses ? ` / ${offer.maxUses}` : " (unlimited)"}
                          </span>
                        </div>
                        {offer.totalDiscountGivenCents > 0 && (
                          <div className="text-[10px] text-stone-600 mt-0.5">
                            ${(offer.totalDiscountGivenCents / 100).toFixed(2)} given
                          </div>
                        )}
                      </td>

                      {/* Destination */}
                      <td className="py-3 px-3 font-mono text-[11px] text-stone-600">
                        {offer.destinationPath || "/send"}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Distribution Link */}
                          <button
                            title="Generate Shareable Destination Link"
                            onClick={() => openLinkBuilder(offer)}
                            className="p-1.5 rounded hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>

                          {/* View Evidence */}
                          <button
                            title="View Reconciled Offer Evidence"
                            onClick={() => openEvidence(offer.code)}
                            className="p-1.5 rounded hover:bg-stone-100 text-stone-700 hover:text-stone-900 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Lifecycle Toggle */}
                          {offer.status === "active" ? (
                            <button
                              title="Pause Offer"
                              onClick={() => triggerRowAction(offer.code, "pause")}
                              className="p-1.5 rounded hover:bg-stone-100 text-amber-800 transition"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              title="Activate Offer"
                              onClick={() => triggerRowAction(offer.code, "activate")}
                              className="p-1.5 rounded hover:bg-stone-100 text-emerald-800 transition"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          {/* Archive */}
                          {offer.status !== "archived" && (
                            <button
                              title="Archive Offer"
                              onClick={() => triggerRowAction(offer.code, "archive")}
                              className="p-1.5 rounded hover:bg-stone-100 text-stone-600 hover:text-stone-800 transition"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete (if canHardDelete) */}
                          <button
                            title={
                              offer.canHardDelete
                                ? "Delete Offer"
                                : "Hard delete blocked: historical redemptions exist (use Archive)"
                            }
                            onClick={() => triggerRowAction(offer.code, "delete")}
                            className={`p-1.5 rounded transition ${
                              offer.canHardDelete
                                ? "hover:bg-rose-500/20 text-rose-800"
                                : "text-slate-600 cursor-not-allowed"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Create / Edit Offer Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-800" />
                {editingCode ? `Edit Offer: ${editingCode}` : "Create New Promotional Offer"}
              </h2>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets Quick Pick */}
            {!editingCode && (
              <div className="mt-4 p-3 bg-white rounded-xl border border-stone-200">
                <div className="text-xs font-semibold text-amber-800 flex items-center gap-1 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Quick Starter Presets
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(Object.keys(OFFER_CREATION_PRESETS) as OfferPresetKey[]).map((key) => {
                    const preset = OFFER_CREATION_PRESETS[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyPreset(key)}
                        className="p-2 text-left bg-white hover:bg-stone-100 border border-stone-200 rounded-lg transition"
                      >
                        <div className="font-semibold text-stone-900">{preset.name}</div>
                        <div className="text-[10px] text-stone-600 mt-0.5 line-clamp-1">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleEditorSubmit} className="mt-4 space-y-4 text-xs">
              {/* Code & Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">
                    Offer Code <span className="text-rose-800">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingCode)}
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })
                    }
                    placeholder="e.g. WELCOME2"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-mono uppercase focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">
                    Purpose / Customer Headline
                  </label>
                  <input
                    type="text"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    placeholder="e.g. Welcome introductory gesture"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountType: e.target.value as "FIXED_AMOUNT" | "PERCENTAGE",
                        discountValue: e.target.value === "PERCENTAGE" ? 20 : 200,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="FIXED_AMOUNT">Fixed Dollar Amount ($)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">
                    {formData.discountType === "PERCENTAGE" ? "Discount Percentage (%)" : "Discount Amount (in cents)"}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={1}
                      max={formData.discountType === "PERCENTAGE" ? 100 : 900}
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 font-mono">
                      {formData.discountType === "PERCENTAGE"
                        ? "%"
                        : `$${(Number(formData.discountValue || 0) / 100).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Server Quote Preview Card */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <div className="text-[11px] font-semibold text-amber-800 flex items-center justify-between">
                  <span>Authoritative Price Preview ($9.00 Standard Card)</span>
                  {liveEditorPricing.isFree && (
                    <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-800 rounded font-bold">
                      100% FREE PROMO
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                  <div className="bg-white p-2 rounded">
                    <div className="text-[10px] text-stone-600">List Price</div>
                    <div className="font-semibold text-stone-700">
                      ${(liveEditorPricing.basePriceCents / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <div className="text-[10px] text-stone-600">Subsidy Given</div>
                    <div className="font-semibold text-amber-800">
                      -${(liveEditorPricing.subsidyCents / 100).toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <div className="text-[10px] text-stone-600">Customer Pays</div>
                    <div className="font-bold text-stone-900">
                      ${(liveEditorPricing.finalAmountCents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-stone-600 mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3 text-amber-800" />
                  Cost status: Unconfirmed (supplier margin computed upon invoice reconciliation).
                </div>
              </div>

              {/* Destination Path & Campaign */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Approved Destination</label>
                  <select
                    value={formData.destinationPath}
                    onChange={(e) => setFormData({ ...formData, destinationPath: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-mono"
                  >
                    {ALLOWED_DESTINATION_PATHS.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Campaign Association</label>
                  <input
                    type="text"
                    value={formData.campaignId}
                    onChange={(e) => setFormData({ ...formData, campaignId: e.target.value })}
                    placeholder="e.g. fall_launch_2026"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
              </div>

              {/* Caps & Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Max Redemptions Cap</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.maxUses}
                    onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Dollar Budget Limit ($)</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.dollarBudgetLimitCents}
                    onChange={(e) => setFormData({ ...formData, dollarBudgetLimitCents: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">Per-Customer Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.perCustomerLimit}
                    onChange={(e) => setFormData({ ...formData, perCustomerLimit: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
              </div>

              {/* Reason for Audit Log */}
              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Reason for Change (Recorded in Audit Log)
                </label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="e.g. Increasing budget for marketing test"
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg shadow-sm transition"
                >
                  Preview Consequences & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Destination Link Builder Modal */}
      {isLinkBuilderOpen && linkOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-amber-800" />
                Destination-Aware Share Link
              </h2>
              <button
                onClick={() => setIsLinkBuilderOpen(false)}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-stone-700 font-medium mb-1">Code & Parameter Alias</label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-white border border-stone-200 rounded-lg font-mono font-bold text-stone-900">
                    {linkOffer.code}
                  </span>
                  <select
                    value={linkAlias}
                    onChange={(e) => setLinkAlias(e.target.value as any)}
                    className="px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  >
                    <option value="discount">?discount= (Standard)</option>
                    <option value="code">?code= (Alternate)</option>
                    <option value="promo">?promo= (Legacy Alias)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-medium mb-1">Approved Destination</label>
                <select
                  value={linkDestination}
                  onChange={(e) => setLinkDestination(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-mono"
                >
                  {ALLOWED_DESTINATION_PATHS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-medium mb-1">UTM Source</label>
                  <input
                    type="text"
                    value={linkUtmSource}
                    onChange={(e) => setLinkUtmSource(e.target.value)}
                    placeholder="growth"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-stone-700 font-medium mb-1">UTM Campaign</label>
                  <input
                    type="text"
                    value={linkUtmCampaign}
                    onChange={(e) => setLinkUtmCampaign(e.target.value)}
                    placeholder="optional"
                    className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                  />
                </div>
              </div>

              {/* Full URL Box */}
              <div className="p-3 bg-white rounded-xl border border-stone-200">
                <div className="text-[10px] text-stone-600 font-medium uppercase mb-1">
                  Ready-to-Share Auto-Apply URL
                </div>
                <div className="font-mono text-amber-800 text-[11px] break-all select-all">
                  {currentLinkResult.fullAbsoluteUrl}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-800 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Allowlisted & Non-billable validation verified
                  </span>
                  <button
                    onClick={copyLinkToClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg transition"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Consequential Change Preview Confirmation Modal (AC04) */}
      {consequentialModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white border border-stone-200 rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-800" />
                Confirm Consequential Change: {consequentialModal.code}
              </h2>
              <button
                onClick={() => setConsequentialModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              {consequentialModal.preview && (
                <>
                  <div className="p-3 bg-white rounded-xl space-y-2 border border-stone-200">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Proposed Action:</span>
                      <span className="font-semibold text-stone-900 uppercase font-mono">
                        {consequentialModal.action}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Active Checkout Holds:</span>
                      <span className="font-bold text-amber-800">
                        {consequentialModal.preview.activeReservationsCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Historical Redemptions:</span>
                      <span className="font-bold text-stone-900">
                        {consequentialModal.preview.historicalRedemptionsCount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Subsidy Given:</span>
                      <span className="font-mono text-stone-700">
                        ${(consequentialModal.preview.totalDiscountGivenCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Warnings List */}
                  {consequentialModal.preview.warnings.length > 0 && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5">
                      <div className="text-[11px] font-semibold text-amber-800">
                        Consequential Effects & Policy Invariants:
                      </div>
                      {consequentialModal.preview.warnings.map((w, idx) => (
                        <div key={idx} className="text-stone-700 text-[11px] flex items-start gap-1.5">
                          <span className="text-amber-800 mt-0.5">•</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hard Delete Block Notice */}
                  {!consequentialModal.preview.canHardDelete && consequentialModal.action === "delete" && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 text-[11px]">
                      <div className="font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-800" />
                        Hard Deletion Forbidden by Policy
                      </div>
                      <p className="mt-1">
                        This code has {consequentialModal.preview.historicalRedemptionsCount} completed order
                        redemption(s). Hard-deleting would corrupt financial and accounting reports. Please
                        archive this code instead to preserve audit history.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Audit Reason Input */}
              <div>
                <label className="block text-stone-700 font-medium mb-1">
                  Audit Reason (Logged to admin_audit_log)
                </label>
                <input
                  type="text"
                  value={consequentialModal.reason}
                  onChange={(e) => setConsequentialModal({ ...consequentialModal, reason: e.target.value })}
                  placeholder="Reason for change..."
                  className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-900"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setConsequentialModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>

                {consequentialModal.preview &&
                !consequentialModal.preview.canHardDelete &&
                consequentialModal.action === "delete" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConsequentialModal((prev) => ({
                        ...prev,
                        action: "archive",
                        reason: "Converted from delete request to preserve accounting history",
                      }));
                    }}
                    className="px-5 py-2 font-semibold text-stone-900 bg-stone-100 hover:bg-slate-600 rounded-lg"
                  >
                    Archive Instead
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={consequentialModal.isExecuting}
                    onClick={executeConfirmedAction}
                    className="flex items-center gap-2 px-5 py-2 font-semibold text-stone-900 bg-amber-100 hover:bg-amber-100 rounded-lg shadow-sm"
                  >
                    {consequentialModal.isExecuting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Confirm & Execute Mutation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Evidence Detail Drawer (AC02) */}
      {evidenceDrawer.isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white border-l border-stone-200 h-full overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-indigo-500/10 text-indigo-800 border border-indigo-500/20">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-stone-900 font-mono">{evidenceDrawer.code}</h2>
                  <div className="text-xs text-stone-600">Offer Evidence & Financial Reconciliation</div>
                </div>
              </div>
              <button
                onClick={() => setEvidenceDrawer({ isOpen: false, isLoading: false, data: null, code: null })}
                className="text-stone-600 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {evidenceDrawer.isLoading ? (
              <div className="p-8 text-center text-sm text-stone-600 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-800" />
                Loading reconciled evidence...
              </div>
            ) : !evidenceDrawer.data ? (
              <div className="p-8 text-center text-sm text-stone-600">No evidence found for this offer.</div>
            ) : (
              <div className="space-y-6 text-xs">
                {/* Funnel Progress */}
                <div>
                  <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                    Conversion Funnel (Views to Capture)
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Views</div>
                      <div className="text-base font-bold text-stone-900 mt-0.5">
                        {evidenceDrawer.data.funnel.views}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Applies</div>
                      <div className="text-base font-bold text-stone-900 mt-0.5">
                        {evidenceDrawer.data.funnel.applies}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Rejects</div>
                      <div className="text-base font-bold text-rose-800 mt-0.5">
                        {evidenceDrawer.data.funnel.rejects}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Holds</div>
                      <div className="text-base font-bold text-amber-800 mt-0.5">
                        {evidenceDrawer.data.funnel.reservations}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Redeemed</div>
                      <div className="text-base font-bold text-emerald-800 mt-0.5">
                        {evidenceDrawer.data.funnel.redemptions}
                      </div>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-stone-200">
                      <div className="text-[10px] text-stone-600">Refunds</div>
                      <div className="text-base font-bold text-stone-600 mt-0.5">
                        {evidenceDrawer.data.funnel.refunds}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financial Exact Cents */}
                <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-2.5">
                  <div className="text-xs font-semibold text-stone-800 uppercase tracking-wider mb-2">
                    Financial Reconciliation (Exact Dollars & Cents)
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200">
                    <span className="text-stone-600">Gross List Value ($9/card):</span>
                    <span className="font-mono text-stone-900 font-semibold">
                      ${(evidenceDrawer.data.financials.grossListValueCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200">
                    <span className="text-stone-600">Discount Subsidy Given:</span>
                    <span className="font-mono text-amber-800 font-semibold">
                      -${(evidenceDrawer.data.financials.totalDiscountSubsidyCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200">
                    <span className="text-stone-600">Net Captured Cash Revenue:</span>
                    <span className="font-mono text-emerald-800 font-bold">
                      ${(evidenceDrawer.data.financials.netCapturedRevenueCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200">
                    <span className="text-stone-600">Total Refunded:</span>
                    <span className="font-mono text-stone-600">
                      ${(evidenceDrawer.data.financials.refundedCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-600">Supplier Production Cost:</span>
                    <span className="inline-flex items-center gap-1 font-mono text-amber-800 font-semibold bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">
                      <Info className="w-3 h-3" />
                      Unconfirmed (Margin Pending Invoice)
                    </span>
                  </div>
                </div>

                {/* Commercial Breakdown */}
                <div>
                  <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                    Commercial Kind Classification
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-white rounded-lg">
                      <div className="text-[10px] text-stone-600">Paid Discounted</div>
                      <div className="text-lg font-bold text-stone-900 mt-0.5">
                        {evidenceDrawer.data.commercialBreakdown.paidDiscountedCount}
                      </div>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg">
                      <div className="text-[10px] text-stone-600">100% Free Promo</div>
                      <div className="text-lg font-bold text-indigo-800 mt-0.5">
                        {evidenceDrawer.data.commercialBreakdown.freePromoCount}
                      </div>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg">
                      <div className="text-[10px] text-stone-600">Studio Comp</div>
                      <div className="text-lg font-bold text-purple-800 mt-0.5">
                        {evidenceDrawer.data.commercialBreakdown.studioCompCount}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order History */}
                <div>
                  <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                    Orders Redeemed ({evidenceDrawer.data.orders.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                    {evidenceDrawer.data.orders.length === 0 ? (
                      <div className="text-stone-600 italic p-3 text-center">No orders redeemed yet.</div>
                    ) : (
                      evidenceDrawer.data.orders.map((ord) => (
                        <div
                          key={ord.orderId}
                          className="p-2.5 bg-white rounded-lg flex items-center justify-between font-mono text-[11px] border border-stone-200"
                        >
                          <div>
                            <div className="font-bold text-stone-900">{ord.orderId}</div>
                            <div className="text-[10px] text-stone-600">
                              {new Date(ord.redeemedAt).toLocaleDateString()} • {ord.commercialKind}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-stone-900 font-semibold">
                              ${(ord.payableAmountCents / 100).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-amber-800">
                              -${(ord.discountAmountCents / 100).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Guest Coverage Note */}
                <div className="p-3 bg-white rounded-xl border border-stone-200 text-[11px] text-stone-600 leading-relaxed">
                  <div className="font-semibold text-stone-700 mb-1 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-stone-600" />
                    Guest Attribution & Identity Scope
                  </div>
                  {evidenceDrawer.data.coverageNote}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
