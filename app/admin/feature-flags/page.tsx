"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Layers,
  Calendar,
  CreditCard,
  Truck,
  Mail,
  Scale,
  Eye,
  Info,
  Clock,
  LayoutDashboard,
} from "lucide-react";
import { FeatureFlagsMap } from "@/lib/types";

export default function AdminFeatureFlagsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Feature Flags State
  const [flags, setFlags] = useState<FeatureFlagsMap>({ reworkV3Experience: false });
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Authentication check
  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
        fetchFeatureFlags();
      } else {
        if (data.locked) {
          setIsLockedOut(true);
          setLockoutRemainingSeconds(data.retryAfterSeconds || 900);
          setRemainingAttempts(0);
          setAuthError("Admin portal is temporarily locked due to repeated failed attempts.");
        } else if (typeof data.remainingAttempts === "number" && data.remainingAttempts < 5) {
          setRemainingAttempts(data.remainingAttempts);
        }
      }
    } catch (err) {
      console.error("Admin auth check failed:", err);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!isLockedOut || lockoutRemainingSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsLockedOut(false);
          setAuthError("");
          setRemainingAttempts(5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutRemainingSeconds]);

  const verifyAccess = async (keyToTest: string) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: keyToTest }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 429 || data.locked) {
          setIsLockedOut(true);
          setLockoutRemainingSeconds(data.retryAfterSeconds || 900);
          setRemainingAttempts(0);
          setAuthError(data.error || "Too many failed attempts. Admin access is locked for 15 minutes.");
        } else {
          if (typeof data.remainingAttempts === "number") {
            setRemainingAttempts(data.remainingAttempts);
          }
          setAuthError(data.error || "Invalid admin passphrase. Please try again.");
        }
      } else {
        setIsAuthenticated(true);
        setIsLockedOut(false);
        setLockoutRemainingSeconds(0);
        setRemainingAttempts(null);
        fetchFeatureFlags();
      }
    } catch {
      setAuthError("Network error. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
    } finally {
      setIsAuthenticated(false);
    }
  };

  const fetchFeatureFlags = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load feature flags");
      const data = await res.json();
      if (data.flags) {
        setFlags(data.flags);
      }
      if (data.updatedAt) {
        setUpdatedAt(data.updatedAt);
      }
    } catch (err) {
      console.error("Error loading feature flags:", err);
    } finally {
      setLoading(false);
    }
  };

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
      // Rollback
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

  // Render Login Screen if unauthenticated
  if (!isAuthenticated) {
    const minutes = Math.floor(lockoutRemainingSeconds / 60);
    const seconds = lockoutRemainingSeconds % 60;
    const formattedTimer = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div
              className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center shadow-md transition-colors ${
                isLockedOut ? "bg-rose-900 text-white" : "bg-stone-900 text-white"
              }`}
            >
              {isLockedOut ? (
                <ShieldAlert className="w-6 h-6 text-rose-400 animate-pulse" />
              ) : (
                <Lock className="w-6 h-6 text-amber-400" />
              )}
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">
              sendmynotes Admin Portal
            </h1>
            <p className="text-xs text-stone-500">
              Feature Flags &amp; Release Control Atelier
            </p>
          </div>

          {isLockedOut ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center space-y-2">
              <p className="text-sm font-semibold text-rose-900">Access Temporarily Suspended</p>
              <p className="text-xs text-rose-700">
                Too many failed attempts recorded. Security lockout active.
              </p>
              <div className="text-2xl font-mono font-bold text-rose-800 pt-1 tracking-wider">
                {formattedTimer}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyAccess(accessKey);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Admin Passphrase
                </label>
                <input
                  type="password"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Enter studio key..."
                  className="w-full px-4 py-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-900 text-sm bg-stone-50/50"
                  autoFocus
                />
              </div>

              {authError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-xl flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              {remainingAttempts !== null && remainingAttempts < 5 && remainingAttempts > 0 && (
                <p className="text-[11px] text-amber-700 text-center font-medium">
                  Notice: {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} remaining before 15-min lockout.
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading || !accessKey}
                className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-sm font-medium transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Unlock Feature Flags</span>
                  </>
                )}
              </button>
            </form>
          )}

          <div className="text-center pt-2">
            <Link href="/" className="text-xs text-stone-400 hover:text-stone-600 transition">
              ← Return to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isV3Active = Boolean(flags.reworkV3Experience);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-800 pb-24">
      {/* HEADER */}
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-amber-700/10 border border-amber-800/20 rounded-xl flex items-center justify-center text-amber-800">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-base sm:text-lg text-stone-900 tracking-tight">
                  sendmynotes
                </span>
                <span className="text-[10px] font-sans uppercase font-bold tracking-widest bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                  Feature Flags
                </span>
              </div>
              <p className="text-[11px] text-stone-400 hidden sm:block">
                Staged Rollout &amp; Architectural Switchboard
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <Link
              href="/admin"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl transition"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Dashboard</span>
            </Link>

            <button
              type="button"
              onClick={fetchFeatureFlags}
              disabled={loading}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer"
              title="Refresh Flags from Cloud"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <Link
              href="/"
              target="_blank"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 px-3 py-2 rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 transition cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* TOP BANNER */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white p-6 sm:p-8 border border-stone-800 shadow-lg">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Production Rollout Control Center</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
                SendMyNotes Rework V3 Experience Feature Flags
              </h1>
              <p className="text-sm text-stone-300 leading-relaxed font-light">
                Toggle between the legacy V2 Vending Machine and the modern Aster &amp; Blanche Rework V3 Target Experience in real-time. Changes persist directly to Firestore system configuration with zero downtime.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <a
                href="/new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold shadow-md transition"
              >
                <span>Test at /new (Always Active)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <Link
                href="/admin"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium border border-stone-700 transition"
              >
                <span>Back to Operations</span>
              </Link>
            </div>
          </div>
        </div>

        {/* FEEDBACK TOAST */}
        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-2xl flex items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{saveSuccess}</span>
            </div>
            <span className="text-xs text-emerald-600 font-mono">Saved to Firestore</span>
          </div>
        )}

        {/* PRIMARY TOGGLE CARD: REWORK V3 EXPERIENCE */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-stone-100 gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors shadow-inner ${
                  isV3Active
                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                    : "bg-amber-50 text-amber-600 border border-amber-200"
                }`}
              >
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-serif font-bold text-stone-900">
                    reworkV3Experience
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide transition-all ${
                      isV3Active
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm"
                        : "bg-stone-100 text-stone-700 border border-stone-300"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isV3Active ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                      }`}
                    />
                    {isV3Active ? "ACTIVE ON ROOT (/)" : "INACTIVE (V2 SERVING)"}
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  Global flag determining whether root visitors (`sendmynotes.com/`) receive the V3 experience or the V2 vending machine.
                </p>
              </div>
            </div>

            {/* INTERACTIVE SWITCH */}
            <div className="flex items-center gap-4 bg-stone-50 p-2.5 rounded-2xl border border-stone-200/70 self-start md:self-auto">
              <span className="text-xs font-semibold text-stone-600">
                {isV3Active ? "V3 Experience Enabled" : "V2 Experience Enabled"}
              </span>
              <button
                type="button"
                onClick={() => handleToggleFlag("reworkV3Experience", isV3Active)}
                disabled={savingKey === "reworkV3Experience"}
                aria-pressed={isV3Active}
                className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 ${
                  isV3Active ? "bg-emerald-600" : "bg-stone-300"
                } ${savingKey === "reworkV3Experience" ? "opacity-50 cursor-wait" : ""}`}
              >
                <span className="sr-only">Toggle Rework V3 Experience</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isV3Active ? "translate-x-8" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* LIVE ROOT BEHAVIOR CALLOUT */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              isV3Active
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : "bg-stone-50 border-stone-200 text-stone-800"
            }`}
          >
            <div className="flex items-start gap-3">
              <Info
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  isV3Active ? "text-emerald-700" : "text-stone-500"
                }`}
              />
              <div className="space-y-1 text-xs leading-relaxed">
                <p className="font-semibold text-sm">
                  Live Traffic Behavior on Root (`sendmynotes.com/`):
                </p>
                {isV3Active ? (
                  <p>
                    All incoming storefront visitors navigating to the root domain (`/`) will immediately see the <strong className="font-bold text-emerald-900">Rework V3 Target Experience</strong> (11 Occasions, A2 aspect ratio, sender return address, 4-stage fulfillment stepper). Override query params `?v3=0` can still be used to view legacy V2.
                  </p>
                ) : (
                  <p>
                    Root storefront visitors (`/`) continue to receive the <strong className="font-bold text-stone-900">V2 Vending Machine</strong> interface. The new V3 experience remains sandboxed and available for internal testing at <code className="bg-white px-1.5 py-0.5 rounded border border-stone-200 text-stone-900 font-mono">/new</code> or via the query override <code className="bg-white px-1.5 py-0.5 rounded border border-stone-200 text-stone-900 font-mono">/?v3=1</code>.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* DEEP TESTING & OVERRIDE LINKS */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-stone-400" />
              <span>Direct Testing Links &amp; Query Overrides</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: /new Permanent Endpoint */}
              <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 font-mono">/new</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      Always Active
                    </span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Dedicated testing route always serving Rework V3 regardless of global flag status.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="/new"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                  >
                    <span>Launch /new</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${window?.location?.origin || ""}/new`, "/new")}
                    className="p-2 bg-white hover:bg-amber-100 text-amber-900 rounded-xl border border-amber-200 transition cursor-pointer"
                    title="Copy /new URL"
                  >
                    {copiedLink === "/new" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-amber-800" />
                    )}
                  </button>
                </div>
              </div>

              {/* Card 2: Force V3 On /?v3=1 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 font-mono">/?v3=1</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Force On
                    </span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Query override forcing root to render V3 even when global flag is disabled.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="/?v3=1"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                  >
                    <span>Test Force V3</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${window?.location?.origin || ""}/?v3=1`, "/?v3=1")}
                    className="p-2 bg-white hover:bg-stone-100 text-stone-800 rounded-xl border border-stone-200 transition cursor-pointer"
                    title="Copy /?v3=1 URL"
                  >
                    {copiedLink === "/?v3=1" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-stone-700" />
                    )}
                  </button>
                </div>
              </div>

              {/* Card 3: Force V2 Off /?v3=0 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900 font-mono">/?v3=0</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 border border-stone-300">
                      Force Off
                    </span>
                  </div>
                  <p className="text-xs text-stone-600">
                    Query override forcing root to render legacy V2 vending machine.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <a
                    href="/?v3=0"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-900 text-xs font-semibold rounded-xl transition"
                  >
                    <span>Test Force V2</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(`${window?.location?.origin || ""}/?v3=0`, "/?v3=0")}
                    className="p-2 bg-white hover:bg-stone-100 text-stone-800 rounded-xl border border-stone-200 transition cursor-pointer"
                    title="Copy /?v3=0 URL"
                  >
                    {copiedLink === "/?v3=0" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-stone-700" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* V3 SPECIFICATION & FEATURE BREAKDOWN */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-sm space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-700" />
              <h2 className="text-xl font-serif font-bold text-stone-900">
                SendMyNotes Rework V3 Architectural Specification
              </h2>
            </div>
            <p className="text-xs text-stone-500">
              The 5 core pillars delivered in the V3 experience to elevate SendMyNotes into an elite stationery atelier.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Pillar 1 */}
            <div className="p-5 rounded-2xl bg-stone-50/70 border border-stone-200/70 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  1. 11 Ready-Made Occasions
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Direct browsing for Birthday, Anniversary, Sympathy, Thank You, Thinking of You, Congratulations, New Baby, Get Well, Romance, Father&apos;s Day, and Mother&apos;s Day with curated backplate artwork.
                </p>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="p-5 rounded-2xl bg-stone-50/70 border border-stone-200/70 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center">
                <Scale className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  2. True A2 Proportions
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Exact physical stationery dimensions (5.5&quot; × 4.25&quot;, 1.294 ratio) rendered in CSS and canvas, perfectly matching physical postal cards and envelopes.
                </p>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="p-5 rounded-2xl bg-stone-50/70 border border-stone-200/70 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  3. Personal Sender Return Address
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Full customer return address printed on envelope back flaps. Establishes authentic mail provenance and complies with USPS postal standards.
                </p>
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="p-5 rounded-2xl bg-stone-50/70 border border-stone-200/70 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  4. Verified Stripe Express Checkout
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Single-click Apple Pay, Google Pay, and Link checkout flows with real-time address autofill and client secret payment intent synchronization.
                </p>
              </div>
            </div>

            {/* Pillar 5 */}
            <div className="p-5 rounded-2xl bg-stone-50/70 border border-stone-200/70 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  5. 4-Stage Fulfillment Stepper
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Transparent real-time status tracker on order confirmation: Order Placed → Robotic Laser Inking → Envelope Sealing → Dispatched to USPS First-Class.
                </p>
              </div>
            </div>

            {/* Technical Cookie Override Info */}
            <div className="p-5 rounded-2xl bg-stone-100/80 border border-stone-200/80 space-y-3">
              <div className="w-9 h-9 rounded-xl bg-stone-200 text-stone-700 flex items-center justify-center">
                <Sliders className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-serif font-bold text-stone-900">
                  Client Cookie Override
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed font-light">
                  Operators can set <code className="bg-white px-1.5 py-0.5 rounded border border-stone-300 font-mono text-[11px]">smn_rework_v3=1</code> in DevTools console to persistently preview V3 across browser tabs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* AUDIT TRAIL & SYSTEM METADATA */}
        <section className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-stone-100 text-stone-600 rounded-xl flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-900">
                Firestore Persistence Audit
              </p>
              <p className="text-[11px] text-stone-500 font-mono">
                Collection: <span className="text-amber-800 font-bold">system_config</span> &bull; Doc ID: <span className="text-amber-800 font-bold">feature_flags</span>
              </p>
            </div>
          </div>

          <div className="text-right text-xs text-stone-500">
            {updatedAt ? (
              <span>Last updated: {new Date(updatedAt).toLocaleString()}</span>
            ) : (
              <span>Flags loaded with initial default configuration</span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
