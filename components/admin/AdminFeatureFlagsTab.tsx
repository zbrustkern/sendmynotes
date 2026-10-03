"use client";

import React, { useEffect, useState } from "react";
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Calendar,
  CreditCard,
  Truck,
  Mail,
  Scale,
  Eye,
  Info,
  Clock,
} from "lucide-react";
import { FeatureFlagsMap } from "@/lib/types";

export function AdminFeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlagsMap>({ reworkV3Experience: false });
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const fetchFeatureFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags");
      if (!res.ok) throw new Error("Failed to load feature flags");
      const data = await res.json();
      if (data.flags) setFlags(data.flags);
      if (data.updatedAt) setUpdatedAt(data.updatedAt);
    } catch (err) {
      console.error("Error loading feature flags:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  const handleToggleFlag = async (flagKey: string, currentValue: boolean) => {
    const newValue = !currentValue;
    setSavingKey(flagKey);
    setSaveSuccess(null);

    // Optimistic update
    setFlags((prev) => ({
      ...prev,
      [flagKey]: newValue,
    }));

    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flagKey,
          enabled: newValue,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Rollback on failure
        setFlags((prev) => ({
          ...prev,
          [flagKey]: currentValue,
        }));
        alert(data.error || "Failed to update feature flag.");
      } else {
        setUpdatedAt(Date.now());
        setSaveSuccess(`"${flagKey}" is now ${newValue ? "ACTIVE" : "INACTIVE"} in production.`);
        setTimeout(() => setSaveSuccess(null), 4000);
      }
    } catch (err) {
      console.error("Error toggling flag:", err);
      setFlags((prev) => ({
        ...prev,
        [flagKey]: currentValue,
      }));
      alert("Network error updating feature flag.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleCopy = (text: string, label: string) => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(text);
    setCopiedLink(label);
    setTimeout(() => {
      setCopiedLink((curr) => (curr === label ? null : curr));
    }, 2500);
  };

  const isV3Active = Boolean(flags.reworkV3Experience);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 overflow-hidden">
      {/* 1. FEEDBACK TOAST */}
      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{saveSuccess}</span>
          </div>
          <span className="text-[10px] sm:text-xs text-emerald-700 font-mono shrink-0">Saved to Cloud</span>
        </div>
      )}

      {/* 2. PRODUCTION ROLLOUT HERO CARD */}
      <section className="rounded-2xl sm:rounded-3xl bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white p-4 sm:p-7 border border-stone-800 shadow-md space-y-4 relative overflow-hidden w-full min-w-0">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-400/10 text-amber-300 border border-amber-400/20">
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Production Rollout Control Center</span>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide border ${
                  isV3Active
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-stone-800 text-stone-300 border-stone-700"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isV3Active ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                {isV3Active ? "V3 LIVE ON ROOT (/)" : "V2 VENDING SERVING"}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight leading-tight">
              SendMyNotes Rework V3 Switchboard
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 font-light leading-relaxed">
              Instant zero-downtime toggle between legacy V2 Vending Machine and the modern Aster &amp; Blanche Atelier experience.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/new"
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold shadow-sm transition active:scale-98"
            >
              <span>Test /new (Always Active)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={fetchFeatureFlags}
              disabled={loading}
              className="p-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
              title="Refresh Flags from Cloud"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Tactile Switch Toggle Card */}
        <div className="relative z-10 bg-stone-800/90 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-stone-700/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors shadow-inner ${
                isV3Active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-xs sm:text-sm font-bold text-white block truncate">
                reworkV3Experience
              </span>
              <span className={`text-[10px] sm:text-xs font-medium block truncate ${isV3Active ? "text-emerald-400" : "text-stone-400"}`}>
                {isV3Active ? "100% of live root traffic receives V3" : "Root traffic serves legacy V2"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleToggleFlag("reworkV3Experience", isV3Active)}
            disabled={savingKey === "reworkV3Experience"}
            aria-pressed={isV3Active}
            className={`relative inline-flex h-7 sm:h-8 w-14 sm:w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${
              isV3Active ? "bg-emerald-500" : "bg-stone-600"
            } ${savingKey === "reworkV3Experience" ? "opacity-50 cursor-wait" : ""}`}
            title="Toggle Rework V3 Global Rollout"
          >
            <span className="sr-only">Toggle Rework V3 Experience</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-6 sm:h-7 w-6 sm:w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isV3Active ? "translate-x-7 sm:translate-x-8" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Live Traffic Callout */}
        <div
          className={`p-3.5 sm:p-4 rounded-xl border text-xs leading-relaxed transition-all ${
            isV3Active
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
              : "bg-stone-800/60 border-stone-700/80 text-stone-300"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <Info className={`w-4 h-4 shrink-0 mt-0.5 ${isV3Active ? "text-emerald-400" : "text-stone-400"}`} />
            <div className="space-y-0.5">
              <span className="font-semibold text-white block">
                Live Traffic Status on Root:
              </span>
              {isV3Active ? (
                <p>
                  Incoming visitors to <code className="bg-stone-900/80 px-1.5 py-0.5 rounded text-emerald-300 font-mono">sendmynotes.com/</code> immediately receive the Rework V3 Atelier experience (11 Occasions, A2 proportions, return address, Stripe Express).
                </p>
              ) : (
                <p>
                  Root visitors receive the legacy V2 interface. The new V3 experience is accessible for canary testing at <code className="bg-stone-900/80 px-1.5 py-0.5 rounded text-amber-300 font-mono">/new</code> or <code className="bg-stone-900/80 px-1.5 py-0.5 rounded text-amber-300 font-mono">/?v3=1</code>.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. DIRECT TESTING LINKS & QUERY OVERRIDES */}
      <section className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border border-stone-200 shadow-sm space-y-3 w-full min-w-0 overflow-hidden">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-stone-500 shrink-0" />
            <span>Direct Testing Links &amp; Query Overrides</span>
          </h3>
          <span className="text-[11px] text-stone-400">Canary URLs</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {/* Card 1: /new */}
          <div className="p-3 sm:p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-950">/new</span>
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Always Active
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                Dedicated canary route always serving V3 regardless of global flag.
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <a
                href="/new"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 text-center text-xs font-bold text-stone-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-2xs transition"
              >
                Launch ↗
              </a>
              <button
                type="button"
                onClick={() => handleCopy(`${typeof window !== "undefined" ? window.location.origin : ""}/new`, "/new")}
                className="p-1.5 bg-white hover:bg-stone-50 text-stone-700 rounded-lg border border-stone-200 transition cursor-pointer shrink-0"
                title="Copy /new link"
              >
                {copiedLink === "/new" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
              </button>
            </div>
          </div>

          {/* Card 2: /?v3=1 */}
          <div className="p-3 sm:p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-stone-900">/?v3=1</span>
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Force V3
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                Query override forcing root to render V3 even when flag is off.
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <a
                href="/?v3=1"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 text-center text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg shadow-2xs transition"
              >
                Test Force V3 ↗
              </a>
              <button
                type="button"
                onClick={() => handleCopy(`${typeof window !== "undefined" ? window.location.origin : ""}/?v3=1`, "/?v3=1")}
                className="p-1.5 bg-white hover:bg-stone-50 text-stone-700 rounded-lg border border-stone-200 transition cursor-pointer shrink-0"
                title="Copy /?v3=1 link"
              >
                {copiedLink === "/?v3=1" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
              </button>
            </div>
          </div>

          {/* Card 3: /?v3=0 */}
          <div className="p-3 sm:p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col justify-between space-y-2">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-stone-900">/?v3=0</span>
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-700 border border-stone-300">
                  Force V2
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                Query override forcing root to render legacy V2 vending machine.
              </p>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <a
                href="/?v3=0"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 text-center text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg border border-stone-200 transition"
              >
                Test Force V2 ↗
              </a>
              <button
                type="button"
                onClick={() => handleCopy(`${typeof window !== "undefined" ? window.location.origin : ""}/?v3=0`, "/?v3=0")}
                className="p-1.5 bg-white hover:bg-stone-50 text-stone-700 rounded-lg border border-stone-200 transition cursor-pointer shrink-0"
                title="Copy /?v3=0 link"
              >
                {copiedLink === "/?v3=0" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-500" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TIER 4: THE FINAL BOTTOM MENU (V3 ARCHITECTURAL SPECIFICATION) */}
      <section className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 lg:p-8 border border-stone-200 shadow-sm space-y-4 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-100 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="text-base font-serif font-bold text-stone-900">
                SendMyNotes Rework V3 Architectural Specification
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              The 5 core pillars delivered in the V3 experience to elevate SendMyNotes into an elite stationery atelier.
            </p>
          </div>
          <span className="self-start sm:self-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            5 Core Pillars
          </span>
        </div>

        {/* 2-Column Compact Mobile Grid (3-Col on Desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Pillar 1 */}
          <div className="p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${isV3Active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {isV3Active ? "LIVE" : "STAGED"}
              </span>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                1. 11 Ready-Made Occasions
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Direct browsing for Birthday, Anniversary, Sympathy, Thank You, Thinking of You, Congratulations, New Baby, Get Well, Romance, Father&apos;s Day, and Mother&apos;s Day with curated backplates.
              </p>
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${isV3Active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {isV3Active ? "LIVE" : "STAGED"}
              </span>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                2. True A2 Proportions
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Exact physical stationery dimensions (5.5&quot; × 4.25&quot;, 1.294 ratio) rendered in CSS and canvas, perfectly matching physical postal cards and envelopes.
              </p>
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${isV3Active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {isV3Active ? "LIVE" : "STAGED"}
              </span>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                3. Personal Sender Return Address
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Full customer return address printed on envelope back flaps. Establishes authentic mail provenance and complies with USPS postal standards.
              </p>
            </div>
          </div>

          {/* Pillar 4 */}
          <div className="p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${isV3Active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {isV3Active ? "LIVE" : "STAGED"}
              </span>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                4. Verified Stripe Express Checkout
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Single-click Apple Pay, Google Pay, and Link checkout flows with real-time address autofill and client secret payment intent synchronization.
              </p>
            </div>
          </div>

          {/* Pillar 5 */}
          <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${isV3Active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-stone-100 text-stone-600 border-stone-200"}`}>
                {isV3Active ? "LIVE" : "STAGED"}
              </span>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                5. 4-Stage Fulfillment Stepper
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Transparent real-time status tracker: Order Placed → Robotic Laser Inking → Envelope Sealing → Dispatched to USPS First-Class.
              </p>
            </div>
          </div>

          {/* Client Cookie Override */}
          <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200/80 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-stone-200 text-stone-700 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900">
                Client Cookie Override
              </h4>
              <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 font-light">
                Set <code className="bg-white px-1.5 py-0.5 rounded border border-stone-300 font-mono text-[10px]">smn_rework_v3=1</code> in DevTools console to persistently preview V3 across browser tabs.
              </p>
            </div>
          </div>
        </div>

        {/* Firestore Audit Trail */}
        <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] text-stone-400 font-mono">
          <span>system_config / feature_flags</span>
          <span>{updatedAt ? `Last Synced: ${new Date(updatedAt).toLocaleString()}` : "Loaded default config"}</span>
        </div>
      </section>
    </div>
  );
}
