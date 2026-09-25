"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  DollarSign,
  TrendingUp,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  Users,
  ShieldCheck,
  ShieldAlert,
  Lock,
  PenTool,
  Send,
  Eye,
  Mail,
  ChevronDown,
  ChevronUp,
  Tag,
  Percent,
  Copy,
  Trash2,
  Check,
  Share2,
  Gift,
  Plus,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Sparkles,
  Globe,
  Compass,
  BookOpen,
  Layers,
  CreditCard,
  MapPin,
  Calculator,
  Target,
  PieChart,
  Receipt,
  Coins,
  Info,
} from "lucide-react";
import { AdminMetrics, Order, SystemIncident, DiscountCode, DiscountType, ScenarioPerformanceMetric } from "@/lib/types";
import { HandwryttenStatusWidget } from "@/components/admin/HandwryttenStatusWidget";
import { ProofInspectorModal } from "@/components/admin/ProofInspectorModal";
import { AddressRetryModal } from "@/components/admin/AddressRetryModal";
import { StudioCompModal } from "@/components/admin/StudioCompModal";
import { CohortAnalytics } from "@/components/admin/CohortAnalytics";
import { ValuationHeuristicsWidget } from "@/components/admin/ValuationHeuristicsWidget";

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<"orders" | "margins" | "discounts" | "scenarios" | "incidents">("orders");

  // Margins, Ad Spend & Campaign Attribution State
  const [adSpendInput, setAdSpendInput] = useState<string>("0.00");
  const [adSpendSynced, setAdSpendSynced] = useState<boolean>(false);
  const [savingAdSpend, setSavingAdSpend] = useState<boolean>(false);
  const [adSpendSuccess, setAdSpendSuccess] = useState<string>("");
  const [copiedTrackingTemplate, setCopiedTrackingTemplate] = useState<boolean>(false);
  const [campaignSearchQuery, setCampaignSearchQuery] = useState<string>("");

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingStripeId, setSyncingStripeId] = useState<string | null>(null);

  // Studio & Operator Modals State
  const [selectedProofOrderId, setSelectedProofOrderId] = useState<string | null>(null);
  const [addressRetryOrder, setAddressRetryOrder] = useState<Order | null>(null);
  const [addressRetryIncidentId, setAddressRetryIncidentId] = useState<string | null>(null);
  const [showCompModal, setShowCompModal] = useState(false);
  const [testingAlertEmail, setTestingAlertEmail] = useState(false);

  // Incidents & Alerts State
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [alertEmail, setAlertEmail] = useState("");
  const [newAlertEmail, setNewAlertEmail] = useState("");
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);

  // Discount Codes State
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountStats, setDiscountStats] = useState<{
    totalCodes: number;
    activeCodes: number;
    totalRedemptions: number;
    totalSavingsCents: number;
  } | null>(null);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [discountSearchQuery, setDiscountSearchQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create Discount Form State
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<DiscountType>("PERCENTAGE");
  const [newValue, setNewValue] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [discountFormError, setDiscountFormError] = useState("");
  const [discountFormSuccess, setDiscountFormSuccess] = useState("");

  // SEO & Scenario Performance Engine State
  const [scenarioMetrics, setScenarioMetrics] = useState<ScenarioPerformanceMetric[]>([]);
  const [scenarioSummary, setScenarioSummary] = useState<{
    totalViews: number;
    totalOrders: number;
    overallConversionRate: number;
    topScenario: string;
    activeScenariosCount: number;
  } | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [scenarioSearchQuery, setScenarioSearchQuery] = useState("");
  const [copiedScenarioUrl, setCopiedScenarioUrl] = useState<string | null>(null);

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
        fetchMetrics();
        fetchIncidents();
        fetchDiscounts();
        fetchScenarios();
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
      setMetrics(null);
    }
  };

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/metrics");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load metrics");
      const data: AdminMetrics = await res.json();
      setMetrics(data);
      if (!adSpendSynced && data.adSpendCents !== undefined) {
        setAdSpendInput(((data.adSpendCents || 0) / 100).toFixed(2));
        setAdSpendSynced(true);
      }
    } catch (err) {
      console.error("Error loading admin metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdSpend = async () => {
    setSavingAdSpend(true);
    setAdSpendSuccess("");
    try {
      const val = parseFloat(adSpendInput) || 0;
      const amountCents = Math.round(val * 100);
      const res = await fetch("/api/admin/ad-spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adSpendCents: amountCents }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdSpendSuccess("Ad spend updated & saved to cloud.");
        fetchMetrics();
        setTimeout(() => setAdSpendSuccess(""), 4000);
      } else {
        alert(data.error || "Failed to save ad spend.");
      }
    } catch (e) {
      alert("Error saving ad spend.");
    } finally {
      setSavingAdSpend(false);
    }
  };

  const handleRetryFulfillment = async (orderId: string) => {
    setRetryingId(orderId);
    try {
      const res = await fetch("/api/admin/retry-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Retry failed: ${data.error || "Unknown error"}`);
      } else {
        alert(`Order successfully dispatched to Handwrytten! Order ID: ${data.handwryttenOrderId}`);
      }
      await fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      alert(`Error retrying fulfillment: ${msg}`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleSyncHandwrytten = async (orderId: string) => {
    setSyncingId(orderId);
    try {
      const res = await fetch("/api/admin/sync-handwrytten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Sync failed: ${data.error || "Unknown error"}`);
      } else {
        alert(
          `Handwrytten status updated: ${data.handwryttenStatus || data.status}${
            data.mailedDate ? ` (Mailed: ${data.mailedDate})` : ""
          }`
        );
      }
      await fetchMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      alert(`Error syncing status from Handwrytten: ${msg}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncStripe = async (orderId: string) => {
    setSyncingStripeId(orderId);
    try {
      const res = await fetch("/api/admin/sync-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || data.error || "Could not verify Stripe payment for this order.");
      } else {
        alert(data.message || "Stripe payment verified and robotic dispatch started!");
        await fetchMetrics();
      }
    } catch {
      alert("Network error verifying Stripe payment.");
    } finally {
      setSyncingStripeId(null);
    }
  };

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const res = await fetch("/api/admin/incidents");
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.incidents || []);
        setAlertEmail(data.alertEmail || "");
        setNewAlertEmail(data.alertEmail || "");
      }
    } catch (err) {
      console.error("Error fetching incidents:", err);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const handleSaveAlertEmail = async () => {
    setSavingEmail(true);
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_alert_email", email: newAlertEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAlertEmail(data.alertEmail);
        alert(data.message || "Alert email updated successfully");
      } else {
        alert(data.error || "Failed to save alert email");
      }
    } catch {
      alert("Network error saving alert email");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestAlertEmail = async () => {
    const targetEmail = newAlertEmail.trim() || alertEmail.trim();
    if (!targetEmail) {
      alert("Please enter an alert email address first.");
      return;
    }
    setTestingAlertEmail(true);
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_alert_email", email: targetEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || `Test alert successfully dispatched to ${targetEmail}! Check your inbox.`);
      } else {
        alert(data.error || "Failed to dispatch test alert");
      }
    } catch {
      alert("Network error dispatching test alert.");
    } finally {
      setTestingAlertEmail(false);
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_incident", incidentId }),
      });
      if (res.ok) {
        setIncidents((prev) =>
          prev.map((inc) =>
            inc.id === incidentId
              ? {
                  ...inc,
                  resolved: true,
                  resolvedAt: Date.now(),
                  resolutionNote: "Marked resolved by operator",
                }
              : inc
          )
        );
      }
    } catch (err) {
      console.error("Error resolving incident:", err);
    }
  };

  const fetchDiscounts = async () => {
    setLoadingDiscounts(true);
    try {
      const res = await fetch("/api/admin/discounts");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDiscountCodes(data.codes || []);
        setDiscountStats(data.stats || null);
      }
    } catch (err) {
      console.error("Error fetching discounts:", err);
    } finally {
      setLoadingDiscounts(false);
    }
  };

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscountFormError("");
    setDiscountFormSuccess("");

    const trimmedCode = newCode.trim().toUpperCase();
    if (!trimmedCode || trimmedCode.length < 2) {
      setDiscountFormError("Code must be at least 2 characters.");
      return;
    }

    const valNum = parseFloat(newValue);
    if (isNaN(valNum) || valNum <= 0) {
      setDiscountFormError("Please enter a valid positive discount value.");
      return;
    }

    if (newType === "PERCENTAGE" && valNum > 100) {
      setDiscountFormError("Percentage discount cannot exceed 100%.");
      return;
    }

    setCreatingDiscount(true);
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          code: trimmedCode,
          type: newType,
          value: valNum,
          maxUses: newMaxUses.trim() ? parseInt(newMaxUses, 10) : undefined,
          expiresAt: newExpiresAt.trim() || undefined,
          description: newDescription.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDiscountFormError(data.error || "Failed to create discount code.");
      } else {
        setDiscountFormSuccess(`Discount code "${trimmedCode}" successfully created!`);
        setNewCode("");
        setNewValue("");
        setNewMaxUses("");
        setNewExpiresAt("");
        setNewDescription("");
        await fetchDiscounts();
      }
    } catch {
      setDiscountFormError("Network error creating discount code.");
    } finally {
      setCreatingDiscount(false);
    }
  };

  const handleToggleDiscount = async (code: string, currentStatus: boolean) => {
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle",
          code,
          isActive: !currentStatus,
        }),
      });
      if (res.ok) {
        setDiscountCodes((prev) =>
          prev.map((c) => (c.code === code ? { ...c, isActive: !currentStatus } : c))
        );
        fetchDiscounts();
      }
    } catch (err) {
      console.error("Error toggling discount status:", err);
    }
  };

  const handleDeleteDiscount = async (code: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete discount code "${code}"?`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          code,
        }),
      });
      if (res.ok) {
        setDiscountCodes((prev) => prev.filter((c) => c.code !== code));
        fetchDiscounts();
      }
    } catch (err) {
      console.error("Error deleting discount code:", err);
    }
  };

  const handleCopyShareLink = (code: string) => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const url = `${origin}/?discount=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 2500);
  };

  const fetchScenarios = async () => {
    setLoadingScenarios(true);
    try {
      const res = await fetch("/api/admin/scenarios");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setScenarioMetrics(data.metrics || []);
        setScenarioSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Error fetching scenario analytics:", err);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const handleCopyScenarioLink = (path: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    setCopiedScenarioUrl(path);
    setTimeout(() => {
      setCopiedScenarioUrl((curr) => (curr === path ? null : curr));
    }, 2500);
  };

  const applyPreset = (preset: "VIP" | "DOLLAR2" | "PERCENT20") => {
    setDiscountFormError("");
    setDiscountFormSuccess("");
    if (preset === "VIP") {
      setNewCode("VIP100");
      setNewType("PERCENTAGE");
      setNewValue("100");
      setNewDescription("100% Free VIP Card Voucher");
    } else if (preset === "DOLLAR2") {
      setNewCode("SAVE2");
      setNewType("FIXED_AMOUNT");
      setNewValue("2.00");
      setNewDescription("$2.00 Off Order Promo");
    } else if (preset === "PERCENT20") {
      setNewCode("LAUNCH20");
      setNewType("PERCENTAGE");
      setNewValue("20");
      setNewDescription("20% Off Launch Celebration");
    }
  };

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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/auth");
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          fetchMetrics();
          fetchIncidents();
          fetchDiscounts();
          fetchScenarios();
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
    checkAuth();
  }, []);

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
              Enter your admin passphrase to access telemetry, customer analytics, and Handwrytten orders.
            </p>
          </div>

          {isLockedOut ? (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 text-xs font-semibold rounded-full border border-rose-200">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Brute-Force Lockout Active</span>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed font-sans">
                Too many incorrect passphrase attempts. Access for this IP address is temporarily suspended.
              </p>
              <div className="py-2">
                <div className="text-3xl font-mono font-bold text-rose-900 tracking-wider">
                  {formattedTimer}
                </div>
                <div className="text-[10px] uppercase font-semibold text-rose-500 tracking-wider mt-0.5">
                  Remaining Cooldown
                </div>
              </div>
              <p className="text-[11px] text-stone-500">
                The portal will automatically unlock once the cooldown timer expires.
              </p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (accessKey.trim()) verifyAccess(accessKey);
              }}
              className="space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Passphrase
                  </label>
                  {remainingAttempts !== null && remainingAttempts < 5 && (
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} left
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  value={accessKey}
                  onChange={(e) => {
                    setAccessKey(e.target.value);
                    if (authError) setAuthError("");
                  }}
                  disabled={authLoading}
                  placeholder="Enter admin passphrase"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
                {authError && (
                  <p className="text-xs text-rose-600 mt-2 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{authError}</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={authLoading || !accessKey.trim()}
                className="w-full py-3 bg-stone-900 hover:bg-black disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-stone-300" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Unlock Dashboard</span>
                )}
              </button>
            </form>
          )}

          <div className="text-center pt-2">
            <Link href="/" className="text-xs text-stone-400 hover:text-stone-700 transition">
              &larr; Return to Storefront
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredOrders = (metrics?.recentOrders || []).filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${order.recipientAddress.firstName} ${order.recipientAddress.lastName}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredDiscountCodes = (discountCodes || []).filter((c) => {
    if (!discountSearchQuery) return true;
    const q = discountSearchQuery.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  const filteredScenarioMetrics = (scenarioMetrics || []).filter((m) => {
    if (!scenarioSearchQuery) return true;
    const q = scenarioSearchQuery.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.slug.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  });

  const revenueDollars = ((metrics?.totalRevenueCents || 0) / 100).toFixed(2);
  const conversionRate =
    metrics && metrics.funnel.totalSessions > 0
      ? ((metrics.funnel.paid / metrics.funnel.totalSessions) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-20 text-stone-900">
      {/* ADMIN HEADER */}
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg font-bold text-stone-900">
                  sendmynotes Admin
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300/60">
                  Live Operations
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Customer telemetry, revenue analytics, and robotic fulfillment monitoring.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCompModal(true)}
              className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Dispatch Comp Card</span>
            </button>
            <button
              type="button"
              onClick={() => {
                fetchMetrics();
                fetchIncidents();
                fetchDiscounts();
                fetchScenarios();
              }}
              disabled={loading || loadingIncidents || loadingDiscounts || loadingScenarios}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition cursor-pointer"
              title="Refresh Data & Incidents"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading || loadingIncidents || loadingDiscounts || loadingScenarios ? "animate-spin" : ""
                }`}
              />
            </button>
            <Link
              href="/"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 bg-stone-100 px-3.5 py-2 rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 transition"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* ADMIN TABS NAVIGATION */}
      <div className="border-b border-stone-200/80 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto" aria-label="Admin Tabs">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeTab === "orders"
                  ? "border-stone-900 text-stone-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Orders &amp; Operations</span>
              {metrics?.totalOrders !== undefined && (
                <span className="ml-1 py-0.5 px-2 rounded-full text-[11px] bg-stone-100 text-stone-600 font-bold">
                  {metrics.totalOrders}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("margins")}
              className={`py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeTab === "margins"
                  ? "border-emerald-600 text-emerald-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Unit Economics &amp; Ads</span>
              {metrics?.margins?.netContributionMarginPercent !== undefined && (
                <span className="ml-1 py-0.5 px-2 rounded-full text-[11px] bg-emerald-100 text-emerald-800 font-bold">
                  {metrics.margins.netContributionMarginPercent}% Margin
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("discounts")}
              className={`py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeTab === "discounts"
                  ? "border-amber-600 text-amber-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <Tag className="w-4 h-4 text-amber-600" />
              <span>Discount Codes</span>
              {discountStats?.activeCodes !== undefined && discountStats.activeCodes > 0 && (
                <span className="ml-1 py-0.5 px-2 rounded-full text-[11px] bg-amber-100 text-amber-800 font-bold">
                  {discountStats.activeCodes} Active
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("scenarios")}
              className={`py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeTab === "scenarios"
                  ? "border-indigo-600 text-indigo-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <Globe className="w-4 h-4 text-indigo-600" />
              <span>SEO &amp; Scenarios</span>
              {scenarioSummary?.activeScenariosCount !== undefined && (
                <span className="ml-1 py-0.5 px-2 rounded-full text-[11px] bg-indigo-100 text-indigo-800 font-bold">
                  {scenarioSummary.activeScenariosCount} Active
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("incidents")}
              className={`py-3.5 px-3 border-b-2 font-medium text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeTab === "incidents"
                  ? "border-rose-600 text-rose-900 font-semibold"
                  : "border-transparent text-stone-500 hover:text-stone-800 hover:border-stone-300"
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>System Health &amp; Incidents</span>
              {incidents.filter((i) => !i.resolved).length > 0 && (
                <span className="ml-1 py-0.5 px-2 rounded-full text-[11px] bg-rose-100 text-rose-800 font-bold">
                  {incidents.filter((i) => !i.resolved).length} Unresolved
                </span>
              )}
            </button>
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* LIVE HANDWRYTTEN STATUS & BALANCE WIDGET */}
        <HandwryttenStatusWidget />
        {/* ===================== TAB: ORDERS & OPERATIONS ===================== */}
        {activeTab === "orders" && (
          <div className="space-y-8">
            {/* KPI METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Gross Revenue</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">${revenueDollars}</p>
                <p className="text-[11px] text-stone-400">$9.00 flat per delivered card</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Robotic Inking Queue</span>
                  <PenTool className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-indigo-900">
                  {metrics?.ordersByStatus.processing || 0}
                </p>
                <p className="text-[11px] text-indigo-600 font-medium">Dispatched to Handwrytten</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Orders</span>
                  <Package className="w-4 h-4 text-amber-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  {metrics?.totalOrders || 0}
                </p>
                <p className="text-[11px] text-stone-400">
                  {metrics?.ordersByStatus.pending || 0} pending drafts
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Funnel Conversion</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">{conversionRate}%</p>
                <p className="text-[11px] text-stone-400">
                  {metrics?.funnel.paid || 0} paid / {metrics?.funnel.totalSessions || 0} visits
                </p>
              </div>
            </div>

            {/* UNIT ECONOMICS & MARGINS QUICK BANNER */}
            <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-900 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-stone-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Unit Margin Intelligence
                    </span>
                    <span className="text-xs text-stone-400">Retail: $9.00 Flat Delivery</span>
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    $3.56 Contribution Margin (39.6%)
                  </h3>
                  <p className="text-xs text-stone-300">
                    Net cash generated per delivered card after Stripe processing fee (-$0.56) and Handwrytten robotic inking &amp; First Class postage (-$4.88).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("margins")}
                    className="text-xs font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 px-4 py-2.5 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <Calculator className="w-4 h-4" />
                    <span>Ad Spend &amp; Campaign Intel →</span>
                  </button>
                </div>
              </div>

              {/* 4 Waterfall Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 space-y-1">
                  <span className="text-stone-400 uppercase tracking-wider text-[10px] font-semibold">1. Gross Revenue</span>
                  <p className="text-base font-bold text-white font-mono">
                    ${((metrics?.margins?.grossRevenueCents || 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-stone-400">$9.00 flat per delivered card</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 space-y-1">
                  <span className="text-rose-300 uppercase tracking-wider text-[10px] font-semibold">2. Stripe Fees (2.9%+30¢)</span>
                  <p className="text-base font-bold text-rose-300 font-mono">
                    -${((metrics?.margins?.stripeFeesCents || 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-stone-400">~$0.56 per standard card</p>
                </div>

                <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 space-y-1">
                  <span className="text-indigo-300 uppercase tracking-wider text-[10px] font-semibold">3. Fulfillment COGS</span>
                  <p className="text-base font-bold text-indigo-300 font-mono">
                    -${((metrics?.margins?.fulfillmentCogsCents || 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-stone-400">$4.88 ink + card + stamp</p>
                </div>

                <div className="bg-emerald-950/40 rounded-2xl p-3.5 border border-emerald-500/30 space-y-1">
                  <span className="text-emerald-300 uppercase tracking-wider text-[10px] font-semibold">4. Net Profit Pool</span>
                  <p className="text-base font-bold text-emerald-400 font-mono">
                    +${((metrics?.margins?.netContributionMarginCents || 0) / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-emerald-300/80">Target Break-even CPA: $3.56</p>
                </div>
              </div>
            </div>

            {/* CUSTOMER JOURNEY FUNNEL & DROP-OFF TELEMETRY */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    Customer Funnel & Drop-Off Telemetry
                  </h2>
                  <p className="text-xs text-stone-500">
                    Track where prospective customers proceed or abandon before payment.
                  </p>
                </div>
                <span className="text-xs bg-amber-50 text-amber-800 font-semibold px-2.5 py-1 rounded-full border border-amber-200">
                  {metrics?.funnel.totalSessions || 0} Active Sessions
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-center">
                {[
                  {
                    step: "1. Cover Selection",
                    count: metrics?.funnel.coverSelected || 0,
                    desc: "Chose / painted AI cover",
                  },
                  {
                    step: "2. Note Written",
                    count: metrics?.funnel.noteCompleted || 0,
                    desc: "Entered sentiment & note",
                  },
                  {
                    step: "3. Address Entered",
                    count: metrics?.funnel.addressCompleted || 0,
                    desc: "Completed mailing form",
                  },
                  {
                    step: "4. Checkout Loaded",
                    count: metrics?.funnel.checkoutInitiated || 0,
                    desc: "Viewed Stripe payment",
                  },
                  {
                    step: "5. Completed Order",
                    count: metrics?.funnel.paid || 0,
                    desc: "Inked & dispatched ($9.00)",
                    highlight: true,
                  },
                ].map((f, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-2xl border transition-all ${
                      f.highlight
                        ? "bg-emerald-50/70 border-emerald-200 text-emerald-950 font-medium"
                        : "bg-stone-50/60 border-stone-200 text-stone-800"
                    }`}
                  >
                    <span className="block text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                      {f.step}
                    </span>
                    <span className="block font-serif text-2xl font-bold my-1">{f.count}</span>
                    <span className="block text-[11px] text-stone-500">{f.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* COHORT & HANDWRITING STYLE ANALYTICS */}
            <CohortAnalytics metrics={metrics} />

            {/* RECENT ORDERS TABLE */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-stone-600" />
                    Physical Orders & Fulfillment Logs
                  </h2>
                  <p className="text-xs text-stone-500">
                    Real-time Handwrytten order IDs and recipient destinations.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-stone-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search orders, emails..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PROCESSING_HANDWRYTTEN">Processing / Inked</option>
                    <option value="PENDING_PAYMENT">Pending Draft</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-sm">
                  No orders found matching your search.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-600">
                    <thead className="bg-stone-50 text-stone-400 uppercase tracking-wider text-[10px] font-semibold border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Card Art</th>
                        <th className="py-3 px-4">Order ID & Date</th>
                        <th className="py-3 px-4">Recipient</th>
                        <th className="py-3 px-4">Customer Email</th>
                        <th className="py-3 px-4">Status & Robot ID</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredOrders.map((order) => {
                        const isMailed = order.status === "MAILED";
                        const isProcessing =
                          order.status === "PROCESSING_HANDWRYTTEN";
                        const isPending = order.status === "PENDING_PAYMENT";
                        const canRetry = !isProcessing && !isPending && !isMailed;

                        return (
                          <tr key={order.id} className="hover:bg-stone-50/50 transition">
                            <td className="py-3 px-4">
                              <div className="relative w-10 h-14 rounded-lg overflow-hidden border border-stone-200 shadow-sm bg-stone-100 flex-shrink-0">
                                <Image
                                  src={order.frontImageUrl}
                                  alt="Cover"
                                  fill
                                  sizes="40px"
                                  unoptimized
                                  className="object-cover"
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Link
                                href={`/order/${order.id}`}
                                className="font-mono font-medium text-stone-900 hover:text-amber-600 hover:underline block"
                              >
                                {order.id}
                              </Link>
                              <span className="text-[10px] text-stone-400">
                                {new Date(order.createdAt).toLocaleDateString()} at{" "}
                                {new Date(order.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-semibold text-stone-800">
                                {order.recipientAddress.firstName} {order.recipientAddress.lastName}
                              </p>
                              <p className="text-[11px] text-stone-400 truncate max-w-[180px]">
                                {order.recipientAddress.city}, {order.recipientAddress.state}{" "}
                                {order.recipientAddress.zip}
                              </p>
                            </td>
                            <td className="py-3 px-4 truncate max-w-[160px]">
                              {order.customerEmail || "Guest (in checkout)"}
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    isMailed
                                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                                      : isProcessing
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : isPending
                                      ? "bg-stone-100 text-stone-600 border border-stone-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                  }`}
                                >
                                  {order.status === "QUEUED_FOR_FULFILLMENT"
                                    ? "QUEUED"
                                    : order.status}
                                </span>
                                {order.handwryttenOrderId && (
                                  <p className="font-mono text-[9px] text-indigo-700">
                                    HW: {order.handwryttenOrderId}
                                  </p>
                                )}
                                {order.handwryttenStatus && (
                                  <p className="text-[10px] font-medium text-stone-600">
                                    HW: <span className="capitalize font-semibold text-stone-900">{order.handwryttenStatus}</span>
                                  </p>
                                )}
                                {order.handwryttenMailedDate && (
                                  <p className="text-[9px] text-purple-700 font-medium">
                                    Mailed: {order.handwryttenMailedDate}
                                  </p>
                                )}
                                {order.handwryttenTrackingNumber && (
                                  <p className="text-[9px] text-stone-500 font-mono">
                                    Trk: {order.handwryttenTrackingNumber}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="font-serif font-bold text-stone-900 text-sm">
                                ${((order.amountInCents || 900) / 100).toFixed(2)}
                              </span>
                              {order.discountCode && (
                                <div className="mt-1 flex items-center justify-end gap-1">
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <Tag className="w-2.5 h-2.5" />
                                    {order.discountCode}
                                  </span>
                                  {order.paymentMethod === "PROMO_CODE" && (
                                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                                      VIP Free
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProofOrderId(order.id)}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded border border-stone-200 transition inline-flex items-center gap-1 cursor-pointer"
                                  title="Inspect 1:1 card proof and live handwriting"
                                >
                                  <Eye className="w-3 h-3 text-stone-500" />
                                  <span>Proof</span>
                                </button>
                                {canRetry && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleRetryFulfillment(order.id)}
                                      disabled={retryingId === order.id}
                                      className="px-2 py-0.5 text-[10px] font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 rounded border border-amber-300 transition inline-flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                                    >
                                      <RefreshCw
                                        className={`w-2.5 h-2.5 ${
                                          retryingId === order.id ? "animate-spin" : ""
                                        }`}
                                      />
                                      {retryingId === order.id ? "Inking..." : "Retry"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setAddressRetryOrder(order)}
                                      className="px-2 py-0.5 text-[10px] font-medium text-stone-700 bg-white hover:bg-stone-100 rounded border border-stone-300 transition inline-flex items-center gap-1 cursor-pointer"
                                      title="Edit recipient address before retry"
                                    >
                                      <MapPin className="w-2.5 h-2.5 text-stone-500" />
                                      <span>Edit</span>
                                    </button>
                                  </div>
                                )}
                                {order.handwryttenOrderId && (
                                  <button
                                    onClick={() => handleSyncHandwrytten(order.id)}
                                    disabled={syncingId === order.id}
                                    title="Check latest order and postal status directly from Handwrytten API"
                                    className="px-2 py-0.5 text-[10px] font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition inline-flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                                  >
                                    <RefreshCw
                                      className={`w-2.5 h-2.5 ${
                                        syncingId === order.id ? "animate-spin" : ""
                                      }`}
                                    />
                                    {syncingId === order.id ? "Checking..." : "Sync HW"}
                                  </button>
                                )}
                                {isMailed && (
                                  <span className="text-[11px] text-purple-700 font-medium inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Mailed
                                  </span>
                                )}
                                {isProcessing && !isMailed && (
                                  <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Dispatched
                                  </span>
                                )}
                                {isPending && (
                                  <button
                                    onClick={() => handleSyncStripe(order.id)}
                                    disabled={syncingStripeId === order.id}
                                    title="Check if customer completed payment on Stripe and initiate fulfillment"
                                    className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-300 transition inline-flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                                  >
                                    <CreditCard className={`w-3 h-3 ${syncingStripeId === order.id ? "animate-spin" : ""}`} />
                                    {syncingStripeId === order.id ? "Verifying..." : "Verify Stripe"}
                                  </button>
                                )}
                                {!isPending && !canRetry && !order.handwryttenOrderId && (
                                  <span className="text-stone-300">—</span>
                                )}
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
          </div>
        )}

        {/* ===================== TAB: UNIT ECONOMICS & MARGINS ===================== */}
        {activeTab === "margins" && (
          <div className="space-y-8">
            {/* UNIT ECONOMICS KPI SUMMARY */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Gross Retail Revenue</span>
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  ${((metrics?.margins?.grossRevenueCents || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-stone-400">
                  {metrics?.margins?.paidCardsCount || 0} delivered cards @ $9.00 flat
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Stripe Gateway Fees</span>
                  <Receipt className="w-4 h-4 text-rose-500" />
                </div>
                <p className="font-serif text-2xl font-bold text-rose-700">
                  -${((metrics?.margins?.stripeFeesCents || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-stone-400">2.9% + 30¢ (~$0.56 per standard card)</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Fulfillment COGS</span>
                  <Package className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-indigo-900">
                  -${((metrics?.margins?.fulfillmentCogsCents || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-stone-400">$4.88 ink + cardstock + First Class</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm space-y-1 bg-emerald-50/30">
                <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold uppercase tracking-wider">
                  <span>Net Contribution Margin</span>
                  <Coins className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-emerald-700">
                  +${((metrics?.margins?.netContributionMarginCents || 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-emerald-800 font-medium">
                  {metrics?.margins?.netContributionMarginPercent || 39.6}% margin ($3.56/card)
                </p>
              </div>
            </div>

            {/* INTERACTIVE AD SPEND & CPA SIMULATOR */}
            {(() => {
              const enteredAdSpend = parseFloat(adSpendInput) || 0;
              const paidCount = metrics?.margins?.paidCardsCount || 0;
              const netContribDollars = (metrics?.margins?.netContributionMarginCents || 0) / 100;
              const grossRevDollars = (metrics?.margins?.grossRevenueCents || 0) / 100;
              const cpaDollars = paidCount > 0 ? enteredAdSpend / paidCount : (enteredAdSpend > 0 ? enteredAdSpend : 0);
              const netProfitAfterAds = netContribDollars - enteredAdSpend;
              const roasRatio = enteredAdSpend > 0 ? (grossRevDollars / enteredAdSpend).toFixed(2) : "—";
              const isProfitable = paidCount > 0 ? cpaDollars <= 3.56 : netProfitAfterAds >= 0;

              return (
                <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Interactive Calculator
                        </span>
                        <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                          <Calculator className="w-4 h-4 text-amber-600" />
                          Ad Spend, CAC &amp; Profitability Simulator
                        </h2>
                      </div>
                      <p className="text-xs text-stone-500">
                        Input your Google Ads expenditure to evaluate live Customer Acquisition Cost (CAC), Return on Ad Spend (ROAS), and net studio profit.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveAdSpend}
                        disabled={savingAdSpend}
                        className="text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 px-4 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${savingAdSpend ? "animate-spin" : ""}`} />
                        <span>{savingAdSpend ? "Saving..." : "Save Ad Spend"}</span>
                      </button>
                    </div>
                  </div>

                  {adSpendSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{adSpendSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* LEFT: Ad Spend Input Controls */}
                    <div className="lg:col-span-5 space-y-4 bg-stone-50 p-5 rounded-2xl border border-stone-200">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                          Total Ad Spend (USD)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-stone-400">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={adSpendInput}
                            onChange={(e) => setAdSpendInput(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                        </div>
                      </div>

                      {/* Quick Increments */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-stone-500">Quick Simulation Presets:</span>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "+$10", val: 10 },
                            { label: "+$25", val: 25 },
                            { label: "+$50", val: 50 },
                            { label: "+$100", val: 100 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                const curr = parseFloat(adSpendInput) || 0;
                                setAdSpendInput((curr + preset.val).toFixed(2));
                              }}
                              className="text-xs font-medium px-2.5 py-1 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded-lg transition cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setAdSpendInput("0.00")}
                            className="text-xs font-medium px-2.5 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg transition cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-stone-200/80 text-[11px] text-stone-500 space-y-1">
                        <p className="flex items-center gap-1.5 font-medium text-stone-700">
                          <Target className="w-3.5 h-3.5 text-amber-600" />
                          <span>Break-even Target CPA: <strong>$3.56</strong></span>
                        </p>
                        <p>
                          Any Google Ads click-to-order cost under $3.56 is instantly profitable on the first card mailed.
                        </p>
                      </div>
                    </div>

                    {/* RIGHT: Live Simulated Metrics */}
                    <div className="lg:col-span-7 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-2xl border bg-stone-50 border-stone-200 space-y-1">
                          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            Blended CPA / CAC
                          </span>
                          <p className={`font-serif text-xl font-bold ${cpaDollars <= 3.56 ? "text-emerald-700" : "text-amber-700"}`}>
                            ${cpaDollars.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-stone-400">
                            {paidCount > 0 ? `Across ${paidCount} paid orders` : "Based on ad spend"}
                          </p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-stone-50 border-stone-200 space-y-1">
                          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            ROAS Multiple
                          </span>
                          <p className="font-serif text-xl font-bold text-stone-900">
                            {roasRatio !== "—" ? `${roasRatio}x` : "—"}
                          </p>
                          <p className="text-[10px] text-stone-400">Gross Rev / Ad Spend</p>
                        </div>

                        <div className={`p-4 rounded-2xl border space-y-1 ${netProfitAfterAds >= 0 ? "bg-emerald-50/50 border-emerald-200" : "bg-rose-50/50 border-rose-200"}`}>
                          <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                            Net Studio Profit
                          </span>
                          <p className={`font-serif text-xl font-bold ${netProfitAfterAds >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {netProfitAfterAds >= 0 ? `+$${netProfitAfterAds.toFixed(2)}` : `-$${Math.abs(netProfitAfterAds).toFixed(2)}`}
                          </p>
                          <p className="text-[10px] text-stone-400">After COGS, fees &amp; ads</p>
                        </div>
                      </div>

                      {/* Profitability Status Callout */}
                      <div
                        className={`p-4 rounded-2xl border flex items-start gap-3 ${
                          isProfitable
                            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                            : "bg-amber-50 border-amber-200 text-amber-900"
                        }`}
                      >
                        {isProfitable ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1 text-xs">
                          <p className="font-bold">
                            {isProfitable
                              ? "Profitable First-Order Acquisition (CPA ≤ $3.56)"
                              : "Growth & Customer Acquisition Investment (CPA > $3.56)"}
                          </p>
                          <p className="text-stone-600 leading-relaxed">
                            {isProfitable
                              ? `At a CPA of $${cpaDollars.toFixed(2)}, you are clearing positive cash flow on card #1. Repeat sends generated from recipient address book reminders are 100% organic profit.`
                              : `At a CPA of $${cpaDollars.toFixed(2)}, the first card operates as customer acquisition. Customers who save recipients average 3+ card orders per year, achieving full breakeven on repeat sends.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* LTV, CAC & VALUATION HEURISTICS ENGINE */}
            {(() => {
              const parsedAdSpend = parseFloat(adSpendInput) || 0;
              const currentPaidCount = metrics?.margins?.paidCardsCount || 0;
              const currentCac =
                currentPaidCount > 0
                  ? parsedAdSpend / currentPaidCount
                  : parsedAdSpend > 0
                  ? parsedAdSpend
                  : 3.56;

              return (
                <ValuationHeuristicsWidget
                  initialAssumptions={metrics?.valuationAssumptions}
                  actualCacDollars={currentCac}
                  paidOrdersCount={currentPaidCount}
                />
              );
            })()}

            {/* THE $9.00 UNIT WATERFALL EXPLAINER */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-stone-700" />
                  Unit Economics Anatomy: The $9.00 Card Waterfall
                </h3>
                <p className="text-xs text-stone-500">
                  Every standard card sent on sendmynotes is structured around deterministic, ultra-predictable unit economics.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">Retail Price</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      +$9.00
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Customer pays $9.00 flat with free First Class shipping, envelope addressing, and physical stamp included.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">Stripe Processing</span>
                    <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                      -$0.56
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Standard credit card interchange fee of 2.9% + $0.30 ($0.26 + $0.30 = $0.56 on $9.00). $0 for comp promo codes.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">Fulfillment COGS</span>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      -$4.88
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Handwrytten robotic pen drawing, custom 120 lb cardstock, envelope inking, and USPS First Class postage.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900">Net Gross Margin</span>
                    <span className="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-full">
                      +$3.56
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    <strong>39.6% net contribution margin.</strong> This is your exact break-even budget for Google Ads CAC.
                  </p>
                </div>
              </div>
            </div>

            {/* CAMPAIGN ATTRIBUTION & GOOGLE ADS INTEL */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    Campaign Attribution &amp; Traffic Intelligence
                  </h3>
                  <p className="text-xs text-stone-500">
                    Live attribution grouped by UTM parameters and Google Ads Click Identifiers (GCLID).
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search campaigns..."
                      value={campaignSearchQuery}
                      onChange={(e) => setCampaignSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Attribution Table */}
              {(() => {
                const attributions = (metrics?.campaignAttributions || []).filter((c) => {
                  const q = campaignSearchQuery.toLowerCase();
                  return (
                    c.campaignKey.toLowerCase().includes(q) ||
                    c.utmSource.toLowerCase().includes(q) ||
                    c.utmMedium.toLowerCase().includes(q)
                  );
                });

                if (attributions.length === 0) {
                  return (
                    <div className="py-12 text-center space-y-3 bg-stone-50/50 rounded-2xl border border-stone-200/60 p-6">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                        <Compass className="w-6 h-6" />
                      </div>
                      <div className="space-y-1 max-w-md mx-auto">
                        <p className="text-sm font-semibold text-stone-800">
                          {campaignSearchQuery ? "No matching campaigns found" : "Ready for Incoming Campaign Traffic"}
                        </p>
                        <p className="text-xs text-stone-500">
                          {campaignSearchQuery
                            ? "Try broadening your search term."
                            : "As visitors arrive with Google Ads parameters (gclid) or UTM tags, their order revenue and net margins will automatically display here."}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto rounded-2xl border border-stone-200">
                    <table className="w-full text-left text-xs text-stone-600">
                      <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider font-semibold border-b border-stone-200 text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Campaign Name</th>
                          <th className="py-3 px-4">Source / Medium</th>
                          <th className="py-3 px-4">Google Tag</th>
                          <th className="py-3 px-4 text-center">Paid Orders</th>
                          <th className="py-3 px-4 text-right">Gross Rev</th>
                          <th className="py-3 px-4 text-right">Net Margin</th>
                          <th className="py-3 px-4 text-right">Margin %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {attributions.map((c) => {
                          const marginPct =
                            c.grossRevenueCents > 0
                              ? Math.round((c.netContributionMarginCents / c.grossRevenueCents) * 100)
                              : 0;

                          return (
                            <tr key={c.campaignKey} className="hover:bg-stone-50/80 transition">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-stone-900">{c.campaignKey}</div>
                                {c.utmCampaign && c.utmCampaign !== "(not set)" && (
                                  <div className="text-[10px] text-stone-400 font-mono">
                                    utm_campaign={c.utmCampaign}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-[11px] text-stone-700">
                                {c.utmSource} / {c.utmMedium}
                              </td>
                              <td className="py-3.5 px-4">
                                {c.hasGclid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                    <Check className="w-3 h-3" /> GCLID
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-stone-400">—</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold text-stone-900">
                                {c.orderCount}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-medium text-stone-900">
                                ${(c.grossRevenueCents / 100).toFixed(2)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700">
                                +${(c.netContributionMarginCents / 100).toFixed(2)}
                              </td>
                              <td className="py-3.5 px-4 text-right font-bold text-stone-700">
                                {marginPct}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* GOOGLE ADS TRACKING TEMPLATE & SETUP ASSISTANT */}
            <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-8 border border-stone-800 space-y-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Google Ads Setup Assistant
                  </span>
                </div>
                <h3 className="font-serif text-xl font-bold text-white flex items-center gap-2">
                  Auto-Tagging &amp; UTM Tracking Template
                </h3>
                <p className="text-xs text-stone-300">
                  Paste this tracking template into your Google Ads Campaign or Account settings. sendmynotes will automatically detect every ad click, keyword, and creative variant.
                </p>
              </div>

              {/* Template Code Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span className="font-semibold text-stone-300">Google Ads Tracking Template URL:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const template = "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}";
                      navigator.clipboard.writeText(template);
                      setCopiedTrackingTemplate(true);
                      setTimeout(() => setCopiedTrackingTemplate(false), 2500);
                    }}
                    className="text-xs font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {copiedTrackingTemplate ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedTrackingTemplate ? "Copied!" : "Copy Tracking Template"}</span>
                  </button>
                </div>
                <div className="p-3.5 bg-black/60 rounded-xl border border-stone-700 font-mono text-xs text-amber-300 break-all select-all">
                  {"{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}"}
                </div>
              </div>

              {/* Step by step guide */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs border-t border-stone-800">
                <div className="space-y-1 text-stone-300">
                  <span className="text-amber-400 font-bold">Step 1: In Google Ads</span>
                  <p className="text-stone-400 text-[11px] leading-relaxed">
                    Navigate to <em>Campaign Settings → Campaign URL Options</em> (or Account Settings).
                  </p>
                </div>
                <div className="space-y-1 text-stone-300">
                  <span className="text-amber-400 font-bold">Step 2: Paste Template</span>
                  <p className="text-stone-400 text-[11px] leading-relaxed">
                    Paste the template above into the <strong>Tracking template</strong> input box.
                  </p>
                </div>
                <div className="space-y-1 text-stone-300">
                  <span className="text-amber-400 font-bold">Step 3: Enable Auto-Tagging</span>
                  <p className="text-stone-400 text-[11px] leading-relaxed">
                    Ensure Google Ads <strong>Auto-tagging (GCLID)</strong> is turned ON for high-fidelity conversion tracking.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: DISCOUNT CODES ===================== */}
        {activeTab === "discounts" && (
          <div className="space-y-8">
            {/* KPI METRIC CARDS FOR DISCOUNTS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Active Promo Codes</span>
                  <Tag className="w-4 h-4 text-amber-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  {discountStats?.activeCodes ?? 0}
                </p>
                <p className="text-[11px] text-stone-400">
                  {discountStats?.totalCodes ?? 0} total codes configured
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Redemptions</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-emerald-900">
                  {discountStats?.totalRedemptions ?? 0}
                </p>
                <p className="text-[11px] text-stone-400">Orders placed with promo discount</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Savings Given</span>
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  ${((discountStats?.totalSavingsCents ?? 0) / 100).toFixed(2)}
                </p>
                <p className="text-[11px] text-stone-400">Cumulative customer savings</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Shareable Links</span>
                  <Share2 className="w-4 h-4 text-amber-600" />
                </div>
                <p className="font-mono text-sm font-bold text-amber-900 truncate">
                  ?discount=CODE
                </p>
                <p className="text-[11px] text-stone-400">
                  Auto-hydrates and applies promo at checkout
                </p>
              </div>
            </div>

            {/* CREATE DISCOUNT CODE FORM */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-amber-600" />
                    Create New Discount Code
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Generate percentage discounts, dollar coupons, or 100% off VIP launch vouchers.
                  </p>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mr-1">
                    Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset("VIP")}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition cursor-pointer inline-flex items-center gap-1"
                  >
                    <Gift className="w-3 h-3 text-emerald-600" />
                    100% Off VIP
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("DOLLAR2")}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition cursor-pointer"
                  >
                    $2.00 Off
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("PERCENT20")}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition cursor-pointer"
                  >
                    20% Off Launch
                  </button>
                </div>
              </div>

              {discountFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between">
                  <span>{discountFormError}</span>
                  <button
                    type="button"
                    onClick={() => setDiscountFormError("")}
                    className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              )}

              {discountFormSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
                  <span>{discountFormSuccess}</span>
                  <button
                    type="button"
                    onClick={() => setDiscountFormSuccess("")}
                    className="text-emerald-500 hover:text-emerald-800 font-bold ml-2 cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              )}

              <form onSubmit={handleCreateDiscount} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Code */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      Discount Code *
                    </label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      placeholder="e.g. VIP100"
                      required
                      className="w-full px-3.5 py-2 text-sm font-mono font-bold uppercase bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      Discount Type
                    </label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as DiscountType)}
                      className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white cursor-pointer"
                    >
                      <option value="PERCENTAGE">Percentage (% Off)</option>
                      <option value="FIXED_AMOUNT">Fixed Amount ($ Off)</option>
                    </select>
                  </div>

                  {/* Value */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      {newType === "PERCENTAGE" ? "Percentage Value (1-100)" : "Dollar Value ($ USD)"} *
                    </label>
                    <div className="relative">
                      {newType === "FIXED_AMOUNT" && (
                        <span className="absolute left-3 top-2 text-stone-500 text-sm font-bold">$</span>
                      )}
                      <input
                        type="number"
                        step={newType === "PERCENTAGE" ? "1" : "0.01"}
                        min={newType === "PERCENTAGE" ? "1" : "0.50"}
                        max={newType === "PERCENTAGE" ? "100" : undefined}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder={newType === "PERCENTAGE" ? "20 (for 20% off)" : "2.00 (for $2.00 off)"}
                        required
                        className={`w-full py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white ${
                          newType === "FIXED_AMOUNT" ? "pl-7 pr-3" : "px-3.5"
                        }`}
                      />
                      {newType === "PERCENTAGE" && (
                        <span className="absolute right-3 top-2 text-stone-400 text-sm font-bold">%</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Max Uses */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      Max Uses Limit (Optional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                      placeholder="Leave empty for unlimited"
                      className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                  </div>

                  {/* Expiration Date */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      Expiration Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={newExpiresAt}
                      onChange={(e) => setNewExpiresAt(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                  </div>

                  {/* Description / Campaign */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                      Campaign Note (Internal)
                    </label>
                    <input
                      type="text"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="e.g. VIP friends, Twitter launch"
                      className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingDiscount}
                    className="px-5 py-2.5 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {creatingDiscount ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{creatingDiscount ? "Creating..." : "Save Discount Code"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* DISCOUNT CODES TABLE */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-stone-600" />
                    Configured Discount Codes
                  </h2>
                  <p className="text-xs text-stone-500">
                    Monitor redemption ratios, customer savings, and share direct links.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-stone-400" />
                  <input
                    type="text"
                    value={discountSearchQuery}
                    onChange={(e) => setDiscountSearchQuery(e.target.value)}
                    placeholder="Search codes, campaigns..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                </div>
              </div>

              {filteredDiscountCodes.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs">
                  <Tag className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="font-semibold text-stone-700">No discount codes found</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {discountSearchQuery
                      ? "Try searching for a different code name."
                      : "Create your first discount code using the form above."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-600">
                    <thead className="bg-stone-50 text-stone-400 uppercase tracking-wider text-[10px] font-semibold border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Code &amp; Campaign</th>
                        <th className="py-3 px-4">Discount Value</th>
                        <th className="py-3 px-4">Usage &amp; Cap</th>
                        <th className="py-3 px-4 text-right">Total Savings</th>
                        <th className="py-3 px-4">Expiration</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredDiscountCodes.map((c) => {
                        const isExpired = c.expiresAt && Date.now() > c.expiresAt;
                        const isExhausted =
                          c.maxUses != null && c.maxUses > 0 && c.usedCount >= c.maxUses;
                        const isFree =
                          (c.type === "PERCENTAGE" && c.value === 100) ||
                          (c.type === "FIXED_AMOUNT" && c.value >= 900);

                        return (
                          <tr key={c.id} className="hover:bg-stone-50/50 transition">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-stone-900 text-sm">
                                  {c.code}
                                </span>
                                {isFree && (
                                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    Free Card VIP
                                  </span>
                                )}
                              </div>
                              {c.description && (
                                <p className="text-[11px] text-stone-500 mt-0.5 max-w-[220px] truncate">
                                  {c.description}
                                </p>
                              )}
                              <span className="text-[10px] text-stone-400">
                                Created {new Date(c.createdAt).toLocaleDateString()}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  isFree
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                    : c.type === "PERCENTAGE"
                                    ? "bg-amber-100 text-amber-900 border border-amber-200"
                                    : "bg-blue-100 text-blue-900 border border-blue-200"
                                }`}
                              >
                                {c.type === "PERCENTAGE"
                                  ? `${c.value}% OFF`
                                  : `$${(c.value / 100).toFixed(2)} OFF`}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <span className="font-semibold text-stone-800">
                                  {c.usedCount}{" "}
                                  <span className="text-stone-400 font-normal">
                                    / {c.maxUses != null ? `${c.maxUses} max` : "∞"}
                                  </span>
                                </span>
                                {c.maxUses != null && (
                                  <div className="w-24 bg-stone-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        isExhausted ? "bg-rose-500" : "bg-amber-500"
                                      }`}
                                      style={{
                                        width: `${Math.min(100, (c.usedCount / c.maxUses) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right font-serif font-bold text-stone-900 text-sm">
                              ${((c.totalDiscountGivenCents || 0) / 100).toFixed(2)}
                            </td>

                            <td className="py-3.5 px-4 text-stone-600">
                              {c.expiresAt ? (
                                <div>
                                  <span
                                    className={`${
                                      isExpired
                                        ? "text-rose-600 font-semibold"
                                        : "text-stone-700"
                                    }`}
                                  >
                                    {new Date(c.expiresAt).toLocaleDateString()}
                                  </span>
                                  {isExpired && (
                                    <span className="block text-[9px] uppercase font-bold text-rose-600">
                                      Expired
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-stone-400">Never expires</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleDiscount(c.code, c.isActive)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer border ${
                                  !c.isActive
                                    ? "bg-stone-100 text-stone-600 border-stone-300 hover:bg-stone-200"
                                    : isExpired || isExhausted
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                }`}
                              >
                                {!c.isActive
                                  ? "Paused"
                                  : isExpired
                                  ? "Expired"
                                  : isExhausted
                                  ? "Maxed Out"
                                  : "Active"}
                              </button>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopyShareLink(c.code)}
                                  title="Copy shareable link (e.g. ?discount=CODE)"
                                  className={`px-2 py-1 text-[11px] font-medium rounded-lg border transition inline-flex items-center gap-1 cursor-pointer ${
                                    copiedCode === c.code
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                      : "bg-stone-50 text-stone-700 hover:bg-stone-100 border-stone-200"
                                  }`}
                                >
                                  {copiedCode === c.code ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Share2 className="w-3 h-3 text-stone-500" />
                                      <span>Share Link</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscount(c.code)}
                                  title="Delete discount code"
                                  className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
          </div>
        )}

        {/* ===================== TAB: SEO & SCENARIOS ===================== */}
        {activeTab === "scenarios" && (
          <div className="space-y-8">
            {/* KPI METRIC CARDS FOR SCENARIOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Scenario Traffic</span>
                  <Globe className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  {scenarioSummary?.totalViews ?? 0}
                </p>
                <p className="text-[11px] text-stone-400">Total organic landing page visits</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Scenario Orders</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-emerald-900">
                  {scenarioSummary?.totalOrders ?? 0}
                </p>
                <p className="text-[11px] text-stone-400">Physical cards placed ($9 flat)</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Scenario Conversion</span>
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-stone-900">
                  {scenarioSummary?.overallConversionRate ?? 0}%
                </p>
                <p className="text-[11px] text-stone-400">Visitor to paid order conversion</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-xs font-semibold uppercase tracking-wider">
                  <span>Active Engine Pages</span>
                  <Layers className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-2xl font-bold text-indigo-900">
                  {scenarioSummary?.activeScenariosCount ?? 12}
                </p>
                <p className="text-[11px] text-stone-400">Curated high-intent landing pages</p>
              </div>
            </div>

            {/* CONTINUOUS IMPROVEMENT & AUTOMATED INSIGHTS */}
            <div className="bg-gradient-to-br from-indigo-900 via-stone-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Continuous Improvement Engine
                  </span>
                </div>
                <Link
                  href="/send"
                  target="_blank"
                  className="text-xs font-medium text-stone-300 hover:text-white underline inline-flex items-center gap-1"
                >
                  <span>View Public Occasion Directory</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    Top Converting Anchor
                  </span>
                  <p className="font-bold text-sm text-white">
                    {scenarioSummary?.topScenario || "Job Interview Thank You"}
                  </p>
                  <p className="text-[11px] text-stone-300">
                    High intent searchers with immediate urgency convert at above average rates.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Anti-Spam Safeguard
                  </span>
                  <p className="font-bold text-sm text-white">12 Hand-Curated Pages</p>
                  <p className="text-[11px] text-stone-300">
                    Protected against Google Helpful Content updates with custom etiquette guides and FAQ schema.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Rich Schema Status
                  </span>
                  <p className="font-bold text-sm text-white">Product &amp; Offer Enabled</p>
                  <p className="text-[11px] text-stone-300">
                    Google SERP rich snippets active: $9.00 flat, in-stock, free USPS First Class delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* SCENARIOS PERFORMANCE TABLE */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-stone-600" />
                    Programmatic Landing Pages Telemetry
                  </h2>
                  <p className="text-xs text-stone-500">
                    Monitor traffic volume, conversion rates, drop-off bottlenecks, and automated recommendations.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-stone-400" />
                  <input
                    type="text"
                    value={scenarioSearchQuery}
                    onChange={(e) => setScenarioSearchQuery(e.target.value)}
                    placeholder="Search scenario or query..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                </div>
              </div>

              {filteredScenarioMetrics.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs">
                  <Globe className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="font-semibold text-stone-700">No scenarios found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-600">
                    <thead className="bg-stone-50 text-stone-400 uppercase tracking-wider text-[10px] font-semibold border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Scenario &amp; Query</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-center">Views</th>
                        <th className="py-3 px-4 text-center">Funnel (View→Edit→Pay)</th>
                        <th className="py-3 px-4 text-center">Conversion</th>
                        <th className="py-3 px-4 text-center">Health Status</th>
                        <th className="py-3 px-4">Optimization Recommendation</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {filteredScenarioMetrics.map((item) => {
                        const isTop = item.status === "top_performer";
                        const isNeedsAttention = item.status === "needs_attention";
                        const isHealthy = item.status === "healthy";

                        return (
                          <tr key={item.slug} className="hover:bg-stone-50/50 transition">
                            <td className="py-3.5 px-4">
                              <p className="font-semibold text-stone-900 text-sm">
                                {item.title}
                              </p>
                              <span className="font-mono text-[10px] text-stone-400 block mt-0.5">
                                {item.path}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <span className="capitalize px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                                {item.category}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center font-bold text-stone-900">
                              {item.views}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <div className="inline-flex items-center gap-1 font-mono text-[11px] text-stone-700 bg-stone-50 px-2 py-1 rounded-lg border border-stone-200">
                                <span>{item.views}</span>
                                <span className="text-stone-300">&rarr;</span>
                                <span className="text-amber-700">{item.customizations}</span>
                                <span className="text-stone-300">&rarr;</span>
                                <span className="text-indigo-700">{item.checkouts}</span>
                                <span className="text-stone-300">&rarr;</span>
                                <span className="font-bold text-emerald-700">{item.paidOrders}</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-center font-serif font-bold text-stone-900 text-sm">
                              {item.conversionRate}%
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                  isTop
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : isHealthy
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : isNeedsAttention
                                    ? "bg-rose-100 text-rose-800 border-rose-300"
                                    : "bg-stone-100 text-stone-600 border-stone-200"
                                }`}
                              >
                                {isTop
                                  ? "Top Performer"
                                  : isHealthy
                                  ? "Healthy"
                                  : isNeedsAttention
                                  ? "Needs Tweak"
                                  : "Gathering Data"}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 max-w-[240px]">
                              <p className="text-[11px] text-stone-600 leading-snug">
                                {item.actionableInsight}
                              </p>
                              {item.primaryDropoffStep !== "None (Initial Traffic)" && (
                                <span className="text-[10px] text-amber-800 font-medium block mt-0.5">
                                  Bottleneck: {item.primaryDropoffStep}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Link
                                  href={item.path}
                                  target="_blank"
                                  title="Open live landing page in new tab"
                                  className="p-1 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>

                                <button
                                  type="button"
                                  onClick={() => handleCopyScenarioLink(item.path)}
                                  title="Copy URL"
                                  className={`px-2 py-0.5 text-[10px] font-medium rounded-lg border transition cursor-pointer ${
                                    copiedScenarioUrl === item.path
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                      : "bg-stone-50 text-stone-600 hover:bg-stone-100 border-stone-200"
                                  }`}
                                >
                                  {copiedScenarioUrl === item.path ? "Copied!" : "Copy"}
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
          </div>
        )}

        {/* ===================== TAB: SYSTEM HEALTH & INCIDENTS ===================== */}
        {activeTab === "incidents" && (
          <div className="space-y-8">
            {/* SYSTEM HEALTH, INCIDENTS & ALERT SUBSCRIPTION */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          incidents.some((i) => !i.resolved)
                            ? "text-rose-600"
                            : "text-emerald-600"
                        }`}
                      />
                      System Health &amp; Incident Feed
                    </h2>
                    {incidents.filter((i) => !i.resolved).length > 0 ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                        {incidents.filter((i) => !i.resolved).length} Unresolved
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        All Systems Operational
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Real-time incident log for Stripe checkout, AI image generation, and Handwrytten robot fulfillment.
                  </p>
                </div>

                {/* ALERT SUBSCRIPTION EMAIL */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-72">
                    <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-stone-400" />
                    <input
                      type="email"
                      value={newAlertEmail}
                      onChange={(e) => setNewAlertEmail(e.target.value)}
                      placeholder="Alert email (e.g. zeke@...)"
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAlertEmail}
                    disabled={savingEmail}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-stone-900 hover:bg-black text-white transition disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {savingEmail ? "Saving..." : alertEmail ? "Update Alert Email" : "Subscribe"}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestAlertEmail}
                    disabled={testingAlertEmail}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition disabled:opacity-50 shrink-0 cursor-pointer inline-flex items-center gap-1"
                    title="Send a sample diagnostic alert email to verify notifications work"
                  >
                    <Send className="w-3 h-3" />
                    <span>{testingAlertEmail ? "Testing..." : "Test Alert"}</span>
                  </button>
                </div>
              </div>

              {/* INCIDENTS LIST */}
              {incidents.length === 0 ? (
                <div className="text-center py-6 text-stone-400 text-xs">
                  <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-stone-700">No Incidents Recorded</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Third-party API calls (Stripe, Imagen, Handwrytten) are executing smoothly without errors.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incidents.map((incident) => {
                    const isExpanded = expandedIncidentId === incident.id;
                    const typeColor =
                      incident.type === "STRIPE"
                        ? "bg-purple-100 text-purple-800 border-purple-200"
                        : incident.type === "IMAGE_GEN"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : incident.type === "HANDWRYTTEN"
                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                        : "bg-stone-100 text-stone-800 border-stone-200";

                    return (
                      <div
                        key={incident.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          incident.resolved
                            ? "bg-stone-50/70 border-stone-200 opacity-70"
                            : incident.severity === "error"
                            ? "bg-rose-50/40 border-rose-200"
                            : "bg-amber-50/40 border-amber-200"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${typeColor}`}>
                              {incident.type}
                            </span>
                            {incident.category === "STUDIO_BILLING" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                                Studio Wholesale Billing
                              </span>
                            )}
                            {incident.category === "OPERATOR_ACTION" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                                Operator Action Required
                              </span>
                            )}
                            {incident.category === "CUSTOMER_RECOVERED" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300">
                                Customer Recovered
                              </span>
                            )}
                            {incident.category === "TRANSIENT" && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-300">
                                Transient API
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                incident.severity === "error"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : "bg-amber-100 text-amber-800 border-amber-300"
                              }`}
                            >
                              {incident.severity}
                            </span>
                            <span className="text-[11px] text-stone-400">
                              {new Date(incident.createdAt).toLocaleDateString()} at{" "}
                              {new Date(incident.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {incident.resolved && (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Resolved
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {incident.technicalDetails && (
                              <button
                                type="button"
                                onClick={() => setExpandedIncidentId(isExpanded ? null : incident.id)}
                                className="text-[11px] font-medium text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 transition cursor-pointer"
                              >
                                <span>{isExpanded ? "Hide Details" : "Inspect"}</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                            {Boolean(incident.metadata?.orderId) && !incident.resolved && (
                              <button
                                type="button"
                                onClick={() => {
                                  const orderId = String(incident.metadata?.orderId);
                                  const found = metrics?.recentOrders.find((o) => o.id === orderId);
                                  if (found) {
                                    setAddressRetryOrder(found);
                                    setAddressRetryIncidentId(incident.id);
                                  } else {
                                    fetch(`/api/admin/order-proof?orderId=${encodeURIComponent(orderId)}`)
                                      .then((r) => r.json())
                                      .then((d) => {
                                        if (d.order) {
                                          setAddressRetryOrder(d.order);
                                          setAddressRetryIncidentId(incident.id);
                                        }
                                      });
                                  }
                                }}
                                className="text-[11px] font-medium text-amber-900 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg transition cursor-pointer inline-flex items-center gap-1"
                              >
                                <MapPin className="w-3 h-3 text-amber-600" />
                                <span>Fix Address</span>
                              </button>
                            )}
                            {!incident.resolved && (
                              <button
                                type="button"
                                onClick={() => handleResolveIncident(incident.id)}
                                className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                              >
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="font-semibold text-xs text-stone-800 mt-2">{incident.summary}</p>

                        {incident.resolutionNote && (
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{incident.resolutionNote}</span>
                          </div>
                        )}

                        {isExpanded && incident.technicalDetails && (
                          <div className="mt-3 p-3 bg-stone-900 text-stone-100 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap max-h-64 shadow-inner">
                            {incident.technicalDetails}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ===================== STUDIO & OPERATOR MODALS ===================== */}
      {selectedProofOrderId && (
        <ProofInspectorModal
          orderId={selectedProofOrderId}
          onClose={() => setSelectedProofOrderId(null)}
        />
      )}

      {addressRetryOrder && (
        <AddressRetryModal
          order={addressRetryOrder}
          incidentId={addressRetryIncidentId}
          onClose={() => {
            setAddressRetryOrder(null);
            setAddressRetryIncidentId(null);
          }}
          onSuccess={() => {
            fetchMetrics();
            fetchIncidents();
          }}
        />
      )}

      {showCompModal && (
        <StudioCompModal
          onClose={() => setShowCompModal(false)}
          onSuccess={() => {
            fetchMetrics();
          }}
        />
      )}
    </div>
  );
}
