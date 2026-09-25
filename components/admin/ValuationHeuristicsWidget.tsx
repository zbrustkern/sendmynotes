"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  DollarSign,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Target,
  PieChart,
  Building,
  Award,
  Info,
  Coins,
  ChevronRight,
  ShieldCheck,
  Scale,
  Sparkles,
} from "lucide-react";
import { ValuationHeuristicAssumptions } from "@/lib/types";
import {
  DEFAULT_VALUATION_ASSUMPTIONS,
  VALUATION_PRESETS,
  calculateValuationHeuristics,
  calculateScaleSensitivityMatrix,
  STANDARD_RETAIL_PRICE,
  STANDARD_NET_CONTRIBUTION,
} from "@/lib/valuation-heuristics";

interface ValuationHeuristicsWidgetProps {
  initialAssumptions?: ValuationHeuristicAssumptions;
  actualCacDollars?: number;
  paidOrdersCount?: number;
}

export function ValuationHeuristicsWidget({
  initialAssumptions,
  actualCacDollars = 3.56,
  paidOrdersCount = 0,
}: ValuationHeuristicsWidgetProps) {
  const [assumptions, setAssumptions] = useState<ValuationHeuristicAssumptions>(
    initialAssumptions || DEFAULT_VALUATION_ASSUMPTIONS
  );
  const [activePreset, setActivePreset] = useState<"conservative" | "base" | "growth" | "custom">("base");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [showSensitivityTable, setShowSensitivityTable] = useState(true);

  // Sync initial assumptions if loaded asynchronously
  useEffect(() => {
    if (initialAssumptions) {
      setAssumptions(initialAssumptions);
    }
  }, [initialAssumptions]);

  const outputs = useMemo(() => {
    return calculateValuationHeuristics(assumptions, actualCacDollars);
  }, [assumptions, actualCacDollars]);

  const sensitivityRows = useMemo(() => {
    return calculateScaleSensitivityMatrix(assumptions);
  }, [assumptions]);

  const applyPreset = (presetKey: "conservative" | "base" | "growth") => {
    setActivePreset(presetKey);
    setAssumptions({ ...VALUATION_PRESETS[presetKey].assumptions });
  };

  const updateAssumption = <K extends keyof ValuationHeuristicAssumptions>(
    key: K,
    value: ValuationHeuristicAssumptions[K]
  ) => {
    setActivePreset("custom");
    setAssumptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAssumptions = async () => {
    setSaving(true);
    setSaveSuccess("");
    try {
      const res = await fetch("/api/admin/valuation-assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assumptions),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveSuccess("Assumptions model saved to cloud.");
        setTimeout(() => setSaveSuccess(""), 4000);
      } else {
        alert(data.error || "Failed to save assumptions.");
      }
    } catch {
      alert("Error connecting to server to save assumptions.");
    } finally {
      setSaving(false);
    }
  };

  // Determine LTV:CAC health tier
  const ltvTier = useMemo(() => {
    const ratio = outputs.ltvToCacRatio;
    if (ratio < 1.0) {
      return {
        label: "Value Destructive (CAC > LTV)",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
        message: "Customer acquisition exceeds total expected lifetime profit. Focus on retention or reducing CPA.",
      };
    } else if (ratio < 2.5) {
      return {
        label: "Moderate Margin / Long Payback",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
        message: "Viable business model, but requires ~2-3 repeat cards to recover acquisition costs.",
      };
    } else if (ratio <= 4.5) {
      return {
        label: "Golden DTC Benchmark (3x - 5x)",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
        message: "Ideal balance of high unit profitability and aggressive customer acquisition headroom.",
      };
    } else {
      return {
        label: "Hyper-Efficient / Under-Investing in Ads",
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
        message: "Exceptional LTV relative to CAC. You have significant room to increase Google Ads bids.",
      };
    }
  }, [outputs.ltvToCacRatio]);

  return (
    <div className="space-y-8">
      {/* SECTION HEADER */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 text-white rounded-3xl p-6 sm:p-8 shadow-lg border border-stone-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-stone-800">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Heuristic Economic Engine
              </span>
              <span className="text-xs text-stone-400">Deterministic Physical Product Modeling</span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5">
              <Award className="w-6 h-6 text-amber-400" />
              LTV, CAC &amp; Business Valuation Engine
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 max-w-3xl leading-relaxed">
              Model lifetime customer equity, acquisition payback horizons, and multi-scenario enterprise valuation
              benchmarks driven by customizable retention, address book adoption, and market multiples.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSaveAssumptions}
              disabled={saving}
              className="text-xs font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 px-4 py-2.5 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${saving ? "animate-spin" : ""}`} />
              <span>{saving ? "Saving..." : "Save Model to Cloud"}</span>
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {/* TOP LEVEL VALUATION & LTV HIGHLIGHT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-1">
            <span className="text-stone-400 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
              <span>Customer LTV (Net Margin)</span>
              <Coins className="w-3.5 h-3.5 text-amber-400" />
            </span>
            <p className="text-2xl font-bold text-white font-serif">
              ${outputs.modeledLtvGrossMargin.toFixed(2)}
            </p>
            <p className="text-[10px] text-stone-400">
              {outputs.modeledLifetimeOrders} lifetime cards @ $3.56 margin
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-1">
            <span className="text-stone-400 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
              <span>LTV : CAC Multiple</span>
              <Target className="w-3.5 h-3.5 text-emerald-400" />
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-serif">
              {outputs.ltvToCacRatio}x
            </p>
            <p className="text-[10px] text-stone-400">
              Against ${outputs.blendedCac.toFixed(2)} acquisition cost
            </p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-1">
            <span className="text-stone-400 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
              <span>CAC Payback Horizon</span>
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
            </span>
            <p className="text-2xl font-bold text-indigo-300 font-serif">
              {outputs.cacPaybackCards} Cards
            </p>
            <p className="text-[10px] text-stone-400">
              ~{outputs.cacPaybackMonths} months at active send cadence
            </p>
          </div>

          <div className="bg-emerald-950/40 rounded-2xl p-4 border border-emerald-500/30 space-y-1">
            <span className="text-emerald-300 uppercase tracking-wider text-[10px] font-semibold flex items-center justify-between">
              <span>Target Cohort Valuation</span>
              <Building className="w-3.5 h-3.5 text-emerald-400" />
            </span>
            <p className="text-2xl font-bold text-emerald-400 font-serif">
              ${Math.round(outputs.blendedValuationEstimate).toLocaleString()}
            </p>
            <p className="text-[10px] text-emerald-300/80">
              At {assumptions.targetActiveCustomers} active customers scale
            </p>
          </div>
        </div>

        {/* LTV:CAC HEALTH BANNER */}
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${ltvTier.badgeClass}`}>
                {ltvTier.label}
              </span>
              <span className="text-stone-300 font-medium">LTV:CAC Health Analysis</span>
            </div>
            <p className="text-stone-400 text-[11px] leading-relaxed">
              {ltvTier.message}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-stone-400 text-[10px]">Lifetime Gross Revenue:</span>
            <p className="text-white font-mono font-bold text-sm">
              ${outputs.modeledLifetimeRevenue.toFixed(2)} / customer
            </p>
          </div>
        </div>
      </div>

      {/* INTERACTIVE ASSUMPTIONS CONSOLE */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-600" />
              Adjustable Heuristic Assumptions Console
            </h3>
            <p className="text-xs text-stone-500">
              Calibrate retention velocity, address book lift, and valuation multiples. All projections update in real-time.
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
            {(["conservative", "base", "growth"] as const).map((presetKey) => {
              const preset = VALUATION_PRESETS[presetKey];
              const isSelected = activePreset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => applyPreset(presetKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <span>{preset.name.split(" ")[0]}</span>
                  <span className="hidden sm:inline text-[10px] text-stone-400 ml-1">({preset.badge})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 8 Granular Sliders / Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* 1. Annual Cards / Customer */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Annual Cards / Customer</label>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                {assumptions.annualCardsPerCustomer} cards
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="8.0"
              step="0.1"
              value={assumptions.annualCardsPerCustomer}
              onChange={(e) => updateAssumption("annualCardsPerCustomer", parseFloat(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Birthdays, anniversaries, holidays, and thank-yous.
            </p>
          </div>

          {/* 2. Customer Lifespan Years */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Customer Lifespan (Years)</label>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                {assumptions.customerLifespanYears} yrs
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="6.0"
              step="0.25"
              value={assumptions.customerLifespanYears}
              onChange={(e) => updateAssumption("customerLifespanYears", parseFloat(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Average tenure before customer dormancy or churn.
            </p>
          </div>

          {/* 3. Address Book Adoption Rate */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Address Book Adoption</label>
              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                {Math.round(assumptions.addressBookAdoptionRate * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.90"
              step="0.05"
              value={assumptions.addressBookAdoptionRate}
              onChange={(e) => updateAssumption("addressBookAdoptionRate", parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              % of customers checking &ldquo;Save address to my book&rdquo;.
            </p>
          </div>

          {/* 4. Address Book Repeat Lift */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Address Book Repeat Lift</label>
              <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                {assumptions.addressBookOrderMultiplier}x
              </span>
            </div>
            <input
              type="range"
              min="1.1"
              max="3.0"
              step="0.1"
              value={assumptions.addressBookOrderMultiplier}
              onChange={(e) => updateAssumption("addressBookOrderMultiplier", parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Re-order multiplier once recipient address is saved.
            </p>
          </div>

          {/* 5. SDE Valuation Multiple */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">SDE Profit Multiple</label>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                {assumptions.valuationMultipleSde}x
              </span>
            </div>
            <input
              type="range"
              min="1.5"
              max="7.0"
              step="0.25"
              value={assumptions.valuationMultipleSde}
              onChange={(e) => updateAssumption("valuationMultipleSde", parseFloat(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Seller&apos;s Discretionary Earnings (SDE) micro-DTC market multiple.
            </p>
          </div>

          {/* 6. Revenue Multiple */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Revenue (ARR) Multiple</label>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                {assumptions.valuationMultipleRevenue}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.25"
              value={assumptions.valuationMultipleRevenue}
              onChange={(e) => updateAssumption("valuationMultipleRevenue", parseFloat(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Run-rate Gross Merchandise Value / Revenue Multiple.
            </p>
          </div>

          {/* 7. Monthly Fixed Overhead */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Monthly Fixed Overhead</label>
              <span className="text-xs font-mono font-bold text-stone-800 bg-stone-200 px-2 py-0.5 rounded">
                ${assumptions.monthlyFixedOverheadDollars}/mo
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="5"
              value={assumptions.monthlyFixedOverheadDollars}
              onChange={(e) => updateAssumption("monthlyFixedOverheadDollars", parseFloat(e.target.value))}
              className="w-full accent-stone-700 cursor-pointer"
            />
            <p className="text-[10px] text-stone-500">
              Hosting, domains, Postmark/SendGrid email, and tooling ($300/yr).
            </p>
          </div>

          {/* 8. Target Active Customer Scale */}
          <div className="p-4 bg-stone-50/70 rounded-2xl border border-stone-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800">Target Active Cohort</label>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded">
                {assumptions.targetActiveCustomers} users
              </span>
            </div>
            <select
              value={assumptions.targetActiveCustomers}
              onChange={(e) => updateAssumption("targetActiveCustomers", parseInt(e.target.value, 10))}
              className="w-full py-1.5 px-2 bg-white border border-stone-300 rounded-lg text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {[50, 100, 250, 500, 1000, 2500, 5000].map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString()} Active Customers
                </option>
              ))}
            </select>
            <p className="text-[10px] text-stone-500">
              Portfolio scale used to calculate annual run-rate and valuation.
            </p>
          </div>
        </div>
      </div>

      {/* VALUATION TRIPLE-MODEL COMPARISON */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="space-y-1 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
              Valuation Triangulation
            </span>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-700" />
              Enterprise Valuation Multiples ({assumptions.targetActiveCustomers.toLocaleString()} Customer Cohort)
            </h3>
          </div>
          <p className="text-xs text-stone-500">
            Professional micro-acquisition valuation methodologies comparing Discretionary Cash Flow (SDE), Gross Run-Rate, and Customer Equity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* SDE Multiple Valuation */}
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                1. SDE Cash Flow Model
              </span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                {assumptions.valuationMultipleSde}x Multiple
              </span>
            </div>
            <p className="font-serif text-3xl font-bold text-stone-900">
              ${Math.round(outputs.estimatedValuationSde).toLocaleString()}
            </p>
            <div className="text-xs text-stone-500 space-y-1 border-t border-stone-200/80 pt-2.5">
              <div className="flex justify-between">
                <span>Annual Net Profit (SDE):</span>
                <span className="font-mono font-semibold text-stone-800">
                  ${Math.round(outputs.annualNetProfitSde).toLocaleString()}/yr
                </span>
              </div>
              <div className="flex justify-between">
                <span>Fixed Overhead Deducted:</span>
                <span className="font-mono text-stone-600">
                  -${outputs.annualFixedOverhead.toLocaleString()}/yr
                </span>
              </div>
            </div>
            <p className="text-[11px] text-stone-400 italic">
              Standard methodology for Acquire.com and Flippa e-commerce listings.
            </p>
          </div>

          {/* Revenue Multiple Valuation */}
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                2. Run-Rate GMV Model
              </span>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                {assumptions.valuationMultipleRevenue}x Multiple
              </span>
            </div>
            <p className="font-serif text-3xl font-bold text-indigo-900">
              ${Math.round(outputs.estimatedValuationRevenue).toLocaleString()}
            </p>
            <div className="text-xs text-stone-500 space-y-1 border-t border-stone-200/80 pt-2.5">
              <div className="flex justify-between">
                <span>Annual Run-Rate Gross (GMV):</span>
                <span className="font-mono font-semibold text-stone-800">
                  ${Math.round(outputs.annualRunRateRevenue).toLocaleString()}/yr
                </span>
              </div>
              <div className="flex justify-between">
                <span>Annual Delivered Cards:</span>
                <span className="font-mono text-stone-600">
                  {Math.round(outputs.annualRunRateRevenue / STANDARD_RETAIL_PRICE).toLocaleString()} cards
                </span>
              </div>
            </div>
            <p className="text-[11px] text-stone-400 italic">
              Common metric used by venture studios and strategic brand aggregators.
            </p>
          </div>

          {/* Customer Equity Valuation */}
          <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                3. Customer Equity Model
              </span>
              <span className="text-xs font-bold text-white bg-emerald-700 px-2 py-0.5 rounded-full">
                Cohort Net LTV
              </span>
            </div>
            <p className="font-serif text-3xl font-bold text-emerald-800">
              ${Math.round(outputs.estimatedCustomerEquity).toLocaleString()}
            </p>
            <div className="text-xs text-emerald-900/80 space-y-1 border-t border-emerald-200 pt-2.5">
              <div className="flex justify-between">
                <span>Active Customer Cohort:</span>
                <span className="font-mono font-semibold text-emerald-900">
                  {assumptions.targetActiveCustomers.toLocaleString()} users
                </span>
              </div>
              <div className="flex justify-between">
                <span>Modeled Net LTV / User:</span>
                <span className="font-mono font-semibold text-emerald-900">
                  ${outputs.modeledLtvGrossMargin.toFixed(2)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-emerald-700 italic">
              Direct NPV of customer relationship assets and address book lock-in.
            </p>
          </div>
        </div>

        {/* Blended Weighted Average Highlight */}
        <div className="p-4 bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300">
                Composite Fair Market Valuation
              </span>
              <p className="text-sm font-semibold text-white">
                Weighted composite estimate (45% SDE + 25% Revenue + 30% Customer Equity)
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-serif text-2xl sm:text-3xl font-bold text-amber-300">
              ${Math.round(outputs.blendedValuationEstimate).toLocaleString()}
            </p>
            <p className="text-[10px] text-stone-400">
              Target active base: {assumptions.targetActiveCustomers.toLocaleString()} customers
            </p>
          </div>
        </div>
      </div>

      {/* SCALE & VALUATION MILESTONE ROADMAP */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-stone-700" />
              Scale &amp; Valuation Milestone Matrix
            </h3>
            <p className="text-xs text-stone-500">
              How business valuation and annual cash flow expand as active customer count grows under current assumptions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSensitivityTable(!showSensitivityTable)}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 px-3 py-1.5 rounded-lg transition"
          >
            {showSensitivityTable ? "Collapse Table" : "Expand Table"}
          </button>
        </div>

        {showSensitivityTable && (
          <div className="overflow-x-auto rounded-2xl border border-stone-200">
            <table className="w-full text-left text-xs text-stone-600">
              <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider font-semibold border-b border-stone-200 text-[10px]">
                <tr>
                  <th className="py-3 px-4">Active Customers</th>
                  <th className="py-3 px-4 text-center">Annual Orders</th>
                  <th className="py-3 px-4 text-right">Annual Run-Rate Gross</th>
                  <th className="py-3 px-4 text-right">Net Contribution</th>
                  <th className="py-3 px-4 text-right">Annual SDE Profit</th>
                  <th className="py-3 px-4 text-right text-emerald-800">Est. SDE Valuation ({assumptions.valuationMultipleSde}x)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-mono">
                {sensitivityRows.map((row) => {
                  const isCurrentTarget = row.customers === assumptions.targetActiveCustomers;
                  return (
                    <tr
                      key={row.customers}
                      className={`transition ${
                        isCurrentTarget
                          ? "bg-amber-50/70 font-semibold text-stone-900"
                          : "hover:bg-stone-50/60"
                      }`}
                    >
                      <td className="py-3.5 px-4 font-sans font-bold flex items-center gap-1.5 text-stone-900">
                        {isCurrentTarget && (
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        )}
                        <span>{row.customers.toLocaleString()} customers</span>
                      </td>
                      <td className="py-3.5 px-4 text-center text-stone-700">
                        {row.annualOrders.toLocaleString()} cards/yr
                      </td>
                      <td className="py-3.5 px-4 text-right text-stone-900">
                        ${row.annualRevenue.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right text-stone-700">
                        +${row.annualContribution.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                        +${row.annualNetProfitSde.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-800 font-serif text-sm">
                        ${row.estimatedValuation.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STRATEGIC OPERATOR PLAYBOOK */}
      <div className="bg-stone-50 rounded-3xl p-6 sm:p-8 border border-stone-200/80 space-y-4">
        <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          The Economics of sendmynotes: Why Handwritten Gifting Scales Profitably
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-stone-600 leading-relaxed">
          <div className="p-4 bg-white rounded-2xl border border-stone-200/70 space-y-1.5">
            <span className="font-bold text-stone-900 flex items-center gap-1">
              <span>Zero Physical Inventory Waste</span>
            </span>
            <p>
              Unlike traditional stationery retailers who risk unsold holiday stock, every single card is manufactured and robotic-inked on-demand after customer payment.
            </p>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-stone-200/70 space-y-1.5">
            <span className="font-bold text-stone-900 flex items-center gap-1">
              <span>The Address Book Flywheel</span>
            </span>
            <p>
              When a customer checks &ldquo;Save address to my book&rdquo;, sendmynotes captures calendar occasion dates. Automated reminders generate high-margin re-orders with $0 marginal ad spend.
            </p>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-stone-200/70 space-y-1.5">
            <span className="font-bold text-stone-900 flex items-center gap-1">
              <span>Deterministic $3.56 Gross Margin</span>
            </span>
            <p>
              A clean 39.56% net contribution margin ensures that as long as Google Ads Customer Acquisition Cost (CAC) stays below LTV (~$35.24), you can scale ad spend aggressively.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
