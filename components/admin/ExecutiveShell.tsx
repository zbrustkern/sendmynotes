"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Tag,
  Users,
  Package,
  ShieldAlert,
  Sliders,
  DollarSign,
  RefreshCw,
  Calendar,
  Filter,
  Globe,
  Clock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Menu,
  X,
  ChevronDown,
  Smartphone,
  Monitor,
} from "lucide-react";
import {
  AdminGlobalScope,
  AdminWorkspaceId,
  ADMIN_WORKSPACES,
  DatePreset,
  serializeAdminGlobalScope,
} from "@/lib/admin-scope";

export interface ExecutiveShellProps {
  currentWorkspace?: AdminWorkspaceId;
  scope: AdminGlobalScope;
  onScopeChange: (newScope: AdminGlobalScope) => void;
  onWorkspaceChange?: (workspace: AdminWorkspaceId) => void;
  onRefresh: () => void;
  isLoading: boolean;
  isStale?: boolean;
  refreshError?: string | null;
  lastUpdated?: string | null;
  orderCount?: number;
  exceptionCount?: number;
  onCompClick?: () => void;
  onTriggerComp?: () => void;
  onLogout?: () => void;
  userEmail?: string | null;
  children: React.ReactNode;
}

const WORKSPACE_ICONS: Record<AdminWorkspaceId, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  growth: TrendingUp,
  promotions: Tag,
  journeys: Users,
  orders: Package,
  reliability: ShieldAlert,
  controls: Sliders,
  economics: DollarSign,
};

export function ExecutiveShell({
  currentWorkspace,
  scope,
  onScopeChange,
  onWorkspaceChange,
  onRefresh,
  isLoading,
  isStale = false,
  refreshError = null,
  lastUpdated = null,
  orderCount,
  exceptionCount,
  onCompClick,
  onTriggerComp,
  onLogout,
  userEmail,
  children,
}: ExecutiveShellProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(scope.customFrom || "");
  const [customTo, setCustomTo] = useState(scope.customTo || "");

  const activeWorkspace = currentWorkspace || scope.workspace;
  const compHandler = onCompClick || onTriggerComp;

  const handleWorkspaceSelect = (id: AdminWorkspaceId) => {
    const nextScope = {
      ...scope,
      workspace: id,
      drilldownMetric: undefined,
      drilldownStage: undefined,
      drilldownChannel: undefined,
      drilldownExceptionId: undefined,
    };
    if (onWorkspaceChange) {
      onWorkspaceChange(id);
    } else {
      const query = serializeAdminGlobalScope(nextScope);
      const destination = ["orders", "journeys", "economics", "promotions", "growth"].includes(id)
        ? `/admin/${id}`
        : "/admin";
      router.push(query ? `${destination}?${query}` : destination);
    }
    setMobileMenuOpen(false);
  };

  const handleDatePresetSelect = (preset: DatePreset) => {
    if (preset === "custom") {
      setCustomDateOpen(true);
      return;
    }
    setCustomDateOpen(false);
    onScopeChange({
      ...scope,
      datePreset: preset,
      customFrom: undefined,
      customTo: undefined,
    });
  };

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customFrom && customTo) {
      onScopeChange({
        ...scope,
        datePreset: "custom",
        customFrom,
        customTo,
      });
      setCustomDateOpen(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF8F5] text-stone-900 flex flex-col font-sans">
      {/* 1. TOP APPLICATION HEADER */}
      <header className="border-b border-stone-200/90 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          {/* Brand & Environment Identity */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-900"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="admin-workspaces"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href={`/admin?${serializeAdminGlobalScope({ ...scope, workspace: "overview", drilldownMetric: undefined, drilldownStage: undefined })}`} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-serif font-bold text-sm shadow-2xs group-hover:bg-black transition">
                SMN
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-sm sm:text-base text-stone-900 tracking-tight leading-none">
                    SendMyNotes Admin
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {scope.environment}
                  </span>
                </div>
                <div className="text-xs text-stone-500 font-medium leading-none mt-1 hidden sm:block">
                  Stationery Commerce & Executive Portal
                </div>
              </div>
            </Link>
          </div>

          {/* Quick Actions & Freshness */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => compHandler ? compHandler() : router.push(`/admin?${serializeAdminGlobalScope({ ...scope, workspace: "overview" })}`)}
              className="text-xs font-bold text-stone-950 bg-amber-400 hover:bg-amber-500 active:scale-95 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-500"
              title={compHandler ? "Dispatch Complimentary Card" : "Open complimentary card tools"}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{compHandler ? "Dispatch Comp" : "Comp tools"}</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 active:scale-95 rounded-lg border border-stone-200 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-stone-900"
              title="Refresh Reporting Snapshot"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-600" : "text-stone-600"}`} />
              <span className="hidden md:inline">Refresh</span>
            </button>

            {lastUpdated && (
              <span className="text-xs text-stone-500 font-mono hidden xl:inline" title="Snapshot Timestamp">
                {Number.isNaN(Date.parse(lastUpdated)) ? "Updated on request" : new Intl.DateTimeFormat("en-US", { timeZone: scope.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(lastUpdated))}
              </span>
            )}

            {userEmail && (
              <div className="hidden lg:flex items-center gap-1.5 text-xs text-stone-600 border-l border-stone-200 pl-3">
                <span className="max-w-[140px] truncate" title={userEmail}>
                  {userEmail}
                </span>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="text-xs text-rose-600 hover:text-rose-800 underline font-medium cursor-pointer ml-1"
                  >
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. PRIMARY WORKSPACES NAVIGATION */}
        <div className="border-t border-stone-200/80 bg-white">
          <div className="max-w-[1600px] mx-auto px-2 sm:px-6">
            <nav
              id="admin-workspaces"
              className={`flex items-center gap-1 sm:gap-2 py-1.5 no-scrollbar scroll-smooth lg:flex-nowrap lg:overflow-x-auto ${mobileMenuOpen ? "flex-wrap overflow-visible" : "flex-nowrap overflow-x-auto"}`}
              role="navigation"
              aria-label="Admin primary workspaces"
            >
              {ADMIN_WORKSPACES.map((ws) => {
                const IconComponent = WORKSPACE_ICONS[ws.id] || LayoutDashboard;
                const isActive = scope.workspace === ws.id;

                let badgeCount: number | undefined;
                let badgeVariant = "default";
                if (ws.id === "orders" && orderCount !== undefined) {
                  badgeCount = orderCount;
                } else if (ws.id === "reliability" && exceptionCount !== undefined && exceptionCount > 0) {
                  badgeCount = exceptionCount;
                  badgeVariant = "alert";
                }

                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => handleWorkspaceSelect(ws.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap focus-visible:ring-2 focus-visible:ring-stone-900 ${
                      isActive
                        ? "bg-stone-900 text-white shadow-2xs"
                        : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                    }`}
                  >
                    <IconComponent className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-stone-500"}`} />
                    <span>{ws.shortLabel}</span>

                    {badgeCount !== undefined && (
                      <span
                        className={`ml-0.5 px-1.5 py-0.2 rounded-full text-xs font-bold ${
                          badgeVariant === "alert"
                            ? isActive
                              ? "bg-rose-500 text-white"
                              : "bg-rose-100 text-rose-800 border border-rose-200"
                            : isActive
                            ? "bg-stone-700 text-stone-200"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* 3. COMPACT GLOBAL SCOPE FILTER BAR */}
        <div
          role="region"
          aria-label="Global reporting scope"
          className="border-t border-stone-200/70 bg-[#F7F5F0] py-2 px-3 sm:px-6"
        >
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2.5 text-xs">
            {/* Left Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Date Preset Selector */}
              <div className="inline-flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5 shadow-2xs">
                <span className="text-xs text-stone-400 pl-1.5 font-medium flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-stone-400" />
                  <span className="hidden sm:inline">Window:</span>
                </span>
                {(
                  [
                    { id: "today", label: "Today" },
                    { id: "7d", label: "7d" },
                    { id: "30d", label: "30d" },
                    { id: "since_oct13", label: "Since Oct 13 Baseline" },
                    { id: "custom", label: "Custom" },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleDatePresetSelect(preset.id)}
                    className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition ${
                      scope.datePreset === preset.id
                        ? "bg-stone-900 text-white font-semibold"
                        : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Classification Mode Toggle */}
              <div className="inline-flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => onScopeChange({ ...scope, mode: "customer_reporting" })}
                  className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition ${
                    scope.mode === "customer_reporting"
                      ? "bg-stone-900 text-white font-semibold"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                  title="Customer Reporting excludes founder, staff, synthetic test orders and bot traffic"
                >
                  Customer Mode
                </button>
                <button
                  type="button"
                  onClick={() => onScopeChange({ ...scope, mode: "operational_all" })}
                  className={`px-2 py-1 rounded text-xs font-medium cursor-pointer transition ${
                    scope.mode === "operational_all"
                      ? "bg-stone-900 text-white font-semibold"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                  title="All Operational includes founder tests, comps and unclassified historical records"
                >
                  Operational Mode
                </button>
              </div>

              {/* Channel Filter */}
              <div className="relative inline-flex items-center">
                <select
                  value={scope.channel}
                  onChange={(e) =>
                    onScopeChange({ ...scope, channel: e.target.value as AdminGlobalScope["channel"] })
                  }
                  className="bg-white border border-stone-200 rounded-lg py-1 pl-2.5 pr-7 text-xs font-medium text-stone-700 shadow-2xs focus:ring-1 focus:ring-stone-900 cursor-pointer"
                  aria-label="Filter by Acquisition Channel"
                >
                  <option value="all">All Channels</option>
                  <option value="paid">All Paid Ads</option>
                  <option value="google_cpc">Google CPC</option>
                  <option value="meta_paid">Meta Paid</option>
                  <option value="organic_direct">Organic & Direct</option>
                </select>
              </div>

              {/* Device Category Filter */}
              <div className="relative inline-flex items-center">
                <select
                  value={scope.device}
                  onChange={(e) =>
                    onScopeChange({ ...scope, device: e.target.value as AdminGlobalScope["device"] })
                  }
                  className="bg-white border border-stone-200 rounded-lg py-1 pl-2.5 pr-7 text-xs font-medium text-stone-700 shadow-2xs focus:ring-1 focus:ring-stone-900 cursor-pointer"
                  aria-label="Filter by Device Category"
                >
                  <option value="all">All Devices</option>
                  <option value="mobile">Mobile Only</option>
                  <option value="desktop">Desktop Only</option>
                  <option value="tablet">Tablet Only</option>
                </select>
              </div>
            </div>

            {/* Right Scope Details: Timezone & Active Filters Disclosures */}
            <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
              <span className="inline-flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 text-stone-700">
                <Clock className="w-3 h-3 text-stone-500" />
                <span>America/Chicago (CT)</span>
              </span>

              {scope.drilldownMetric && (
                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono font-bold border border-amber-200">
                  <span>Drilldown: {scope.drilldownMetric}</span>
                  <button
                    type="button"
                    onClick={() => onScopeChange({ ...scope, drilldownMetric: undefined })}
                    className="hover:text-black ml-1"
                    title="Clear Metric Drilldown"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Custom Date Modal Dropdown */}
          {customDateOpen && (
            <div className="max-w-[1600px] mx-auto mt-2 pt-2 border-t border-stone-200 flex items-center gap-3">
              <form onSubmit={handleCustomDateSubmit} className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-stone-600 font-medium">From:</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs"
                  required
                />
                <label className="text-xs text-stone-600 font-medium">To:</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-white border border-stone-300 rounded px-2 py-1 text-xs"
                  required
                />
                <button
                  type="submit"
                  className="bg-stone-900 text-white font-semibold text-xs px-3 py-1 rounded hover:bg-black transition cursor-pointer"
                >
                  Apply Window
                </button>
                <button
                  type="button"
                  onClick={() => setCustomDateOpen(false)}
                  className="text-stone-500 hover:text-stone-800 text-xs px-2 py-1"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}
        </div>

        {/* 4. STALE / PARTIAL / REFRESH ERROR BANNER (AC03) */}
        {(isStale || refreshError) && (
          <div
            role="alert"
            className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Snapshot Refresh Failed:</strong> Displaying prior snapshot from{" "}
                <span className="font-mono">{lastUpdated || "previous cache"}</span>. Never assuming healthy or zero.
              </span>
            </div>
            {refreshError && <span className="font-mono text-xs text-amber-700">{refreshError}</span>}
          </div>
        )}
      </header>

      {/* 5. MAIN CONTENT REGION */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 md:py-6">{children}</main>
    </div>
  );
}
