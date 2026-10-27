"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Package,
  TrendingUp,
  Tag,
  Plus,
  Search,
  RefreshCw,
  Gift,
  Eye,
  MapPin,
  CreditCard,
  Lock,
  Loader2,
  CheckCircle2,
  Share2,
  Check,
  Trash2,
  Compass,
  Info,
  DollarSign,
  PenTool,
  AlertTriangle,
  ShieldCheck,
  Mail,
  Send,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AdminMetrics, Order, SystemIncident, DiscountCode, DiscountType } from "@/lib/types";
import { HandwryttenStatusWidget } from "@/components/admin/HandwryttenStatusWidget";
import { AdminMeasurementPanel } from "@/components/admin/AdminMeasurementPanel";
import { ProofInspectorModal } from "@/components/admin/ProofInspectorModal";
import { AddressRetryModal } from "@/components/admin/AddressRetryModal";
import { StudioCompModal } from "@/components/admin/StudioCompModal";
import { OrderJourneyDrawer } from "@/components/admin/OrderJourneyDrawer";

export default function AdminDashboardPage() {
  const { user, signInWithGoogle, signOut: authSignOut } = useAuth();
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [adminUserEmail, setAdminUserEmail] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");

  // Navigation tab state: 4 focused views
  const [activeTab, setActiveTab] = useState<"orders" | "measurement" | "discounts" | "incidents">("orders");

  // Orders State
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingStripeId, setSyncingStripeId] = useState<string | null>(null);
  const [expandedJourneyOrderId, setExpandedJourneyOrderId] = useState<string | null>(null);

  // Modals
  const [selectedProofOrderId, setSelectedProofOrderId] = useState<string | null>(null);
  const [addressRetryOrder, setAddressRetryOrder] = useState<Order | null>(null);
  const [addressRetryIncidentId, setAddressRetryIncidentId] = useState<string | null>(null);
  const [showCompModal, setShowCompModal] = useState(false);

  // Incidents & Alerts State
  const [incidents, setIncidents] = useState<SystemIncident[]>([]);
  const [alertEmail, setAlertEmail] = useState("");
  const [newAlertEmail, setNewAlertEmail] = useState("");
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingAlertEmail, setTestingAlertEmail] = useState(false);
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);
  const [alertFormOpen, setAlertFormOpen] = useState(false);
  const [incidentFilter, setIncidentFilter] = useState<"UNRESOLVED" | "RESOLVED" | "ALL">("UNRESOLVED");

  // Discounts State
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

  const handleTabChange = (tab: "orders" | "measurement" | "discounts" | "incidents") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      url.searchParams.delete("workspace");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleGoogleAdminLogin = async () => {
    setGoogleAuthLoading(true);
    setAuthError("");
    try {
      let currentUser = user;
      if (!currentUser) {
        await signInWithGoogle();
        const { getFirebaseAuth } = await import("@/lib/firebase-client");
        currentUser = getFirebaseAuth().currentUser;
      }
      if (!currentUser) {
        throw new Error("Google sign-in was not completed.");
      }
      const idToken = await currentUser.getIdToken(true);
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAuthError(data.error || "Access denied. Your account is not authorized for administrator access.");
      } else {
        setIsAuthenticated(true);
        setAdminUserEmail(data.email || currentUser.email || null);
        fetchMetrics();
        fetchDiscounts();
        fetchIncidents();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error authenticating with Google.";
      setAuthError(msg);
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth", { method: "DELETE" });
      await authSignOut();
    } finally {
      setIsAuthenticated(false);
      setMetrics(null);
    }
  };

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("dateRange", "oct13");
      params.set("excludeFounder", "true");

      const res = await fetch(`/api/admin/metrics?${params.toString()}`);
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load metrics");
      const data: AdminMetrics = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error("Error loading admin metrics:", err);
    } finally {
      setLoading(false);
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

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const res = await fetch("/api/admin/incidents");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
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
        alert(data.message || `Test alert dispatched to ${targetEmail}`);
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
        body: JSON.stringify({
          action: "resolve_incident",
          incidentId,
          resolutionNote: "Marked resolved by operator",
        }),
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
            data.handwryttenTrackingNumber ? ` (Tracking: ${data.handwryttenTrackingNumber})` : ""
          }`
        );
      }
      await fetchMetrics();
    } catch {
      alert("Error syncing Handwrytten status.");
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
        alert(`Stripe sync: ${data.error || "Payment not verified or not yet completed."}`);
      } else {
        alert(`Payment verified! Order status updated: ${data.status}`);
        await fetchMetrics();
      }
    } catch {
      alert("Error verifying payment with Stripe.");
    } finally {
      setSyncingStripeId(null);
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
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/auth");
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          if (data.email) {
            setAdminUserEmail(data.email);
          }
          fetchMetrics();
          fetchDiscounts();
          fetchIncidents();
        }
      } catch (err) {
        console.error("Admin auth check failed:", err);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") || params.get("workspace");
      if (tabParam === "measurement") {
        setActiveTab("measurement");
      } else if (tabParam === "discounts" || tabParam === "promotions") {
        setActiveTab("discounts");
      } else if (tabParam === "incidents" || tabParam === "reliability") {
        setActiveTab("incidents");
      } else if (tabParam === "orders") {
        setActiveTab("orders");
      }
      const orderIdParam = params.get("orderId");
      if (orderIdParam) {
        setSearchQuery(orderIdParam);
        setExpandedJourneyOrderId(orderIdParam);
      }
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center shadow-md bg-stone-900 text-white">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">
              SendMyNotes Admin Portal
            </h1>
            <p className="text-xs text-stone-500">
              Sign in with your authorized Google account to view orders, verified measurement, and promotions.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleAdminLogin}
              disabled={googleAuthLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-stone-900 hover:bg-black text-white rounded-xl font-medium text-sm transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              {googleAuthLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>
                {user?.email ? `Continue as ${user.email}` : "Sign in with Google"}
              </span>
            </button>

            {user?.email && (
              <div className="flex items-center justify-between text-[11px] text-stone-500 px-1">
                <span>Account: {user.email}</span>
                <button
                  type="button"
                  onClick={() => authSignOut()}
                  className="text-stone-700 hover:text-stone-900 underline font-medium cursor-pointer"
                >
                  Switch account
                </button>
              </div>
            )}
          </div>

          {authError && (
            <p role="alert" className="text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">
              {authError}
            </p>
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
      String(order.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(order.customerEmail || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${order.recipientAddress?.firstName || ""} ${order.recipientAddress?.lastName || ""}`
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
      Boolean(c.description && c.description.toLowerCase().includes(q))
    );
  });

  const unresolvedIncidents = incidents.filter((inc) => !inc.resolved);
  const resolvedIncidents = incidents.filter((inc) => inc.resolved);
  const hasActiveAlerts = unresolvedIncidents.length > 0;
  const filteredIncidents =
    incidentFilter === "UNRESOLVED"
      ? unresolvedIncidents
      : incidentFilter === "RESOLVED"
      ? resolvedIncidents
      : incidents;

  const revenueDollars = ((metrics?.totalRevenueCents || 0) / 100).toFixed(2);
  const conversionRate =
    metrics && metrics.funnel.totalSessions > 0
      ? ((metrics.funnel.paid / metrics.funnel.totalSessions) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 pb-16">
      {/* TOP HEADER */}
      <header className="border-b border-stone-200/90 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-stone-900 flex items-center justify-center text-amber-400 font-bold font-serif text-sm shrink-0">
              S
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="font-serif text-base font-bold text-stone-900 whitespace-nowrap">
                SendMyNotes
              </h1>
              <span className="text-xs font-medium text-stone-400 whitespace-nowrap">
                Admin
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {adminUserEmail && (
              <span className="text-xs text-stone-400 hidden lg:inline truncate max-w-[180px] mr-1">
                {adminUserEmail}
              </span>
            )}

            <Link
              href="/"
              className="hidden sm:inline-flex items-center h-8 px-2.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition whitespace-nowrap"
            >
              Storefront
            </Link>

            <button
              type="button"
              onClick={() => {
                fetchMetrics();
                fetchDiscounts();
                fetchIncidents();
              }}
              disabled={loading || loadingIncidents}
              title="Refresh data"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  loading || loadingIncidents ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="h-4 w-px bg-stone-200 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center h-8 px-2.5 rounded-lg text-xs font-medium text-stone-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* 4 FOCUSED TABS NAVIGATION */}
        <div className="border-t border-stone-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav
              className="flex items-center gap-4 sm:gap-8 overflow-x-auto no-scrollbar"
              aria-label="Admin Tabs"
            >
              <button
                type="button"
                onClick={() => handleTabChange("orders")}
                className={`py-3 px-1 border-b-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === "orders"
                    ? "border-stone-900 text-stone-900 font-semibold"
                    : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300 font-medium"
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Orders</span>
                {metrics?.totalOrders !== undefined && (
                  <span className="ml-0.5 py-0.5 px-1.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                    {metrics.totalOrders}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("measurement")}
                className={`py-3 px-1 border-b-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === "measurement"
                    ? "border-stone-900 text-stone-900 font-semibold"
                    : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300 font-medium"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Measurement</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("discounts")}
                className={`py-3 px-1 border-b-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === "discounts"
                    ? "border-stone-900 text-stone-900 font-semibold"
                    : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300 font-medium"
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Discounts</span>
                {discountStats?.activeCodes !== undefined && discountStats.activeCodes > 0 && (
                  <span className="ml-0.5 py-0.5 px-1.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-700">
                    {discountStats.activeCodes}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleTabChange("incidents")}
                className={`py-3 px-1 border-b-2 text-xs sm:text-sm inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  activeTab === "incidents"
                    ? "border-stone-900 text-stone-900 font-semibold"
                    : "border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300 font-medium"
                }`}
              >
                {hasActiveAlerts ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
                <span>Troubleshooting</span>
                {hasActiveAlerts && (
                  <span className="ml-0.5 py-0.5 px-1.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    {unresolvedIncidents.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* ===================== TAB 1: ORDERS & FULFILLMENT ===================== */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Handwrytten Status Widget */}
            <HandwryttenStatusWidget />

            {/* ACTIVE TROUBLESHOOTING ALERT CALLOUT */}
            {hasActiveAlerts && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-900 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-rose-950">
                      {unresolvedIncidents.length} Unresolved System Alert{unresolvedIncidents.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-rose-800">
                      Latest: {unresolvedIncidents[0]?.summary}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabChange("incidents")}
                  className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs transition cursor-pointer shrink-0"
                >
                  Open Troubleshooting &rarr;
                </button>
              </div>
            )}

            {/* CANONICAL BASELINE DISCLOSURE BANNER */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-xs">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-950">
                  Canonical Baseline Notice (Oct 11, 2026)
                </p>
                <p className="text-amber-800 leading-relaxed">
                  Canonical baseline (Oct 11, 2026): 0 independent customer conversions (1 founder test). Any un-reconciled historical paid record requires verification against Stripe and founder test records before counting as independent customer demand.
                </p>
              </div>
            </div>

            {/* KPI METRIC CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                  <span>Gross Revenue</span>
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-stone-900">${revenueDollars}</p>
                <p className="text-[10px] sm:text-[11px] text-stone-400">$9.00 flat per card</p>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                  <span>Inking Queue</span>
                  <PenTool className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-indigo-900">
                  {metrics?.ordersByStatus.processing || 0}
                </p>
                <p className="text-[10px] sm:text-[11px] text-indigo-600 font-medium">Dispatched to HW</p>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                  <span>Total Orders</span>
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-stone-900">
                  {metrics?.totalOrders || 0}
                </p>
                <p className="text-[10px] sm:text-[11px] text-stone-400">
                  {metrics?.ordersByStatus.pending || 0} pending drafts
                </p>
              </div>

              <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-stone-500 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                  <span>Conversion</span>
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
                </div>
                <p className="font-serif text-xl sm:text-2xl font-bold text-stone-900">{conversionRate}%</p>
                <p className="text-[10px] sm:text-[11px] text-stone-400">
                  {metrics?.funnel.paid || 0} paid / {metrics?.funnel.totalSessions || 0} visits
                </p>
              </div>
            </div>

            {/* RECENT ORDERS TABLE & CONTROLS */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 lg:p-8 border border-stone-200 shadow-sm space-y-4 sm:space-y-5 w-full min-w-0 overflow-hidden">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-stone-100">
                <div>
                  <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-stone-600 shrink-0" />
                    <span>Physical Orders &amp; Fulfillment Logs</span>
                  </h2>
                  <p className="text-xs text-stone-500">
                    Real-time Handwrytten order IDs and recipient destinations.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search orders, emails..."
                      className="w-full h-8 pl-8 pr-3 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PROCESSING_HANDWRYTTEN">Submitted to Supplier</option>
                    <option value="PENDING_PAYMENT">Pending Draft</option>
                    <option value="FAILED">Failed</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowCompModal(true)}
                    className="h-8 px-3 bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                  >
                    <Gift className="w-3.5 h-3.5 text-amber-400" />
                    <span>Send Studio Comp</span>
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-sm">
                  No orders found matching your search.
                </div>
              ) : (
                <>
                  {/* MOBILE ORDER CARDS */}
                  <div className="md:hidden space-y-3 w-full min-w-0">
                    {filteredOrders.map((order) => {
                      const isMailed = order.status === "MAILED";
                      const isProcessing = order.status === "PROCESSING_HANDWRYTTEN";
                      const isPending = order.status === "PENDING_PAYMENT";
                      const isQueued = order.status === "QUEUED_FOR_FULFILLMENT";
                      const isFailed = order.status === "FAILED" || order.status === "PAYMENT_VERIFICATION_FAILED";
                      const isComp = order.paymentMethod === "STUDIO_COMP" || order.isComp;
                      const canRetry = !isProcessing && !isPending && !isMailed;

                      let statusLabel = String(order.status || "UNKNOWN").replace(/_/g, " ");
                      let statusStyle = "bg-stone-100 text-stone-700 border-stone-200";
                      if (isMailed) {
                        statusLabel = "Mailed";
                        statusStyle = "bg-purple-50 text-purple-700 border-purple-200";
                      } else if (isProcessing) {
                        statusLabel = "Submitted to Supplier";
                        statusStyle = "bg-emerald-50 text-emerald-800 border-emerald-200";
                      } else if (isPending) {
                        statusLabel = "Pending";
                        statusStyle = "bg-stone-100 text-stone-600 border-stone-200";
                      } else if (isQueued) {
                        statusLabel = "Queued";
                        statusStyle = "bg-amber-50 text-amber-800 border-amber-200";
                      } else if (isFailed) {
                        statusLabel = "Failed";
                        statusStyle = "bg-rose-50 text-rose-700 border-rose-200";
                      } else if (isComp) {
                        statusLabel = "Comp Card";
                        statusStyle = "bg-amber-50 text-amber-800 border-amber-200";
                      }

                      const shortOrderId =
                        order.id.length > 22
                          ? `${order.id.slice(0, 14)}...${order.id.slice(-6)}`
                          : order.id;

                      return (
                        <div
                          key={order.id}
                          className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-2xs space-y-3 w-full min-w-0 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-100 min-w-0">
                            <Link
                              href={`/order/${order.id}`}
                              className="font-mono text-xs font-bold text-stone-900 hover:text-amber-600 transition truncate min-w-0 flex items-center gap-1.5"
                              title={order.id}
                            >
                              <span className="text-stone-400 font-normal">#</span>
                              <span className="truncate">{shortOrderId}</span>
                            </Link>

                            <span
                              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusStyle}`}
                            >
                              {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                              {statusLabel}
                            </span>
                          </div>

                          <div className="flex items-start gap-3 min-w-0">
                            <div className="relative w-12 h-16 rounded-xl overflow-hidden border border-stone-200 shadow-2xs bg-stone-100 shrink-0">
                              <Image
                                src={order.frontImageUrl}
                                alt="Cover"
                                fill
                                sizes="48px"
                                unoptimized
                                className="object-cover"
                              />
                            </div>

                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-stone-900 truncate">
                                    {order.recipientAddress?.firstName} {order.recipientAddress?.lastName}
                                  </p>
                                  <p className="text-[11px] text-stone-500 truncate">
                                    {order.recipientAddress?.city}, {order.recipientAddress?.state} {order.recipientAddress?.zip}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-serif font-bold text-stone-900 text-sm">
                                    ${((order.amountInCents || 900) / 100).toFixed(2)}
                                  </span>
                                  {order.handwryttenOrderId && (
                                    <span className="font-mono text-[9px] text-indigo-700 block mt-0.5">
                                      HW: {order.handwryttenOrderId}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-stone-400 min-w-0">
                                <span className="truncate">
                                  {new Date(order.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                                  {new Date(order.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {order.discountCode && (
                                  <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <Tag className="w-2.5 h-2.5" />
                                    {order.discountCode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] text-stone-500 pt-2 border-t border-stone-100 flex items-center justify-between min-w-0 gap-2">
                            <span className="text-stone-400 text-[10px] uppercase font-semibold tracking-wider shrink-0">Buyer</span>
                            <span className="truncate max-w-[220px] font-medium text-stone-700">
                              {order.customerEmail || "Guest Checkout"}
                            </span>
                          </div>

                          {order.attribution && (
                            <div className="text-[10px] text-stone-600 pt-1 flex items-center justify-between min-w-0 gap-2">
                              <span className="text-amber-800 text-[9px] uppercase font-bold tracking-wider shrink-0">Channel</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 truncate max-w-[200px]">
                                {order.attribution.utmCampaign || order.attribution.utmSource || "Direct"}
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedJourneyOrderId(
                                expandedJourneyOrderId === order.id ? null : order.id
                              )
                            }
                            className={`w-full py-2 px-3 text-center text-xs font-semibold rounded-xl border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                              expandedJourneyOrderId === order.id
                                ? "bg-amber-900 text-amber-100 border-amber-950 shadow-inner"
                                : "bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            <Compass className="w-3.5 h-3.5 text-amber-600" />
                            <span>
                              {expandedJourneyOrderId === order.id
                                ? "Close 360° Journey"
                                : "View 360° Customer Journey"}
                            </span>
                          </button>

                          {expandedJourneyOrderId === order.id && (
                            <div className="pt-2">
                              <OrderJourneyDrawer
                                order={order}
                                onInspectProof={(id) => setSelectedProofOrderId(id)}
                                onRetryAddress={(ord) => setAddressRetryOrder(ord)}
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setSelectedProofOrderId(order.id)}
                              className="py-2.5 text-center text-xs font-semibold text-stone-700 bg-stone-50 hover:bg-stone-100 active:scale-98 rounded-xl border border-stone-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                              <span>View Proof</span>
                            </button>

                            {order.handwryttenOrderId ? (
                              <button
                                type="button"
                                onClick={() => handleSyncHandwrytten(order.id)}
                                disabled={syncingId === order.id}
                                className="py-2.5 text-center text-xs font-semibold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 active:scale-98 rounded-xl border border-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 shrink-0 ${syncingId === order.id ? "animate-spin" : ""}`}
                                />
                                <span>Check Status</span>
                              </button>
                            ) : canRetry ? (
                              <button
                                type="button"
                                onClick={() => handleRetryFulfillment(order.id)}
                                disabled={retryingId === order.id}
                                className="py-2.5 text-center text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 active:scale-98 rounded-xl border border-amber-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-3.5 h-3.5 shrink-0 ${retryingId === order.id ? "animate-spin" : ""}`}
                                />
                                <span>{retryingId === order.id ? "Inking..." : "Retry Dispatch"}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSyncStripe(order.id)}
                                disabled={syncingStripeId === order.id}
                                className="py-2.5 text-center text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 active:scale-98 rounded-xl border border-stone-200 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                                <span>Stripe Sync</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* DESKTOP ORDERS TABLE */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs text-stone-600">
                      <thead className="bg-stone-50 text-stone-400 uppercase tracking-wider text-[10px] font-semibold border-b border-stone-200">
                        <tr>
                          <th className="py-3 px-4">Card Art</th>
                          <th className="py-3 px-4">Order ID &amp; Date</th>
                          <th className="py-3 px-4">Attribution / Ad</th>
                          <th className="py-3 px-4">Recipient</th>
                          <th className="py-3 px-4">Customer Email</th>
                          <th className="py-3 px-4">Status &amp; Robot ID</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredOrders.map((order) => {
                          const isMailed = order.status === "MAILED";
                          const isProcessing = order.status === "PROCESSING_HANDWRYTTEN";
                          const isPending = order.status === "PENDING_PAYMENT";
                          const canRetry = !isProcessing && !isPending && !isMailed;

                          return (
                            <React.Fragment key={order.id}>
                              <tr className="hover:bg-stone-50/50 transition">
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
                                  {order.attribution ? (
                                    <div className="space-y-0.5 max-w-[140px]">
                                      <div className="flex items-center gap-1">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 truncate">
                                          {order.attribution.utmCampaign || order.attribution.utmSource || "Direct"}
                                        </span>
                                      </div>
                                      {order.attribution.gclid && (
                                        <span
                                          className="inline-block text-[9px] font-mono text-stone-500 bg-stone-100 px-1 py-0.5 rounded truncate max-w-[130px]"
                                          title={order.attribution.gclid}
                                        >
                                          GCLID: {order.attribution.gclid.slice(0, 8)}...
                                        </span>
                                      )}
                                      {order.attribution.googleClientId && (
                                        <span
                                          className="block text-[9px] font-mono text-stone-400 truncate"
                                          title={order.attribution.googleClientId}
                                        >
                                          GA4: {order.attribution.googleClientId.split(".").slice(-2).join(".")}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-stone-300 text-[11px] font-mono">Organic/Direct</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <p className="font-semibold text-stone-800">
                                    {order.recipientAddress?.firstName} {order.recipientAddress?.lastName}
                                  </p>
                                  <p className="text-[11px] text-stone-400 truncate max-w-[180px]">
                                    {order.recipientAddress?.city}, {order.recipientAddress?.state}{" "}
                                    {order.recipientAddress?.zip}
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
                                        : order.status === "PROCESSING_HANDWRYTTEN"
                                        ? "SUBMITTED TO SUPPLIER"
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
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedProofOrderId(order.id)}
                                        className="px-2 py-0.5 text-[10px] font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded border border-stone-200 transition inline-flex items-center gap-1 cursor-pointer"
                                        title="Inspect 1:1 card proof and live handwriting"
                                      >
                                        <Eye className="w-3 h-3 text-stone-500" />
                                        <span>Proof</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedJourneyOrderId(
                                            expandedJourneyOrderId === order.id ? null : order.id
                                          )
                                        }
                                        className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition inline-flex items-center gap-1 cursor-pointer ${
                                          expandedJourneyOrderId === order.id
                                            ? "bg-amber-900 text-amber-100 border-amber-950"
                                            : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                                        }`}
                                      >
                                        <Compass className="w-3 h-3 text-amber-600" />
                                        <span>Journey</span>
                                      </button>
                                    </div>

                                    {canRetry && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleRetryFulfillment(order.id)}
                                          disabled={retryingId === order.id}
                                          title="Resend print order directly to Handwrytten API"
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
                              {expandedJourneyOrderId === order.id && (
                                <tr key={`${order.id}-journey`} className="bg-stone-50/80">
                                  <td colSpan={8} className="p-0 border-b border-stone-200">
                                    <div className="p-4 sm:p-6 bg-stone-50/60 border-t border-b border-stone-200/80">
                                      <OrderJourneyDrawer
                                        order={order}
                                        onInspectProof={(id) => setSelectedProofOrderId(id)}
                                        onRetryAddress={(ord) => setAddressRetryOrder(ord)}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 2: MEASUREMENT ===================== */}
        {activeTab === "measurement" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
              <div>
                <h2 className="text-lg font-serif font-bold text-stone-900">
                  Conversion &amp; Verified Payment Evidence
                </h2>
                <p className="text-xs text-stone-500">
                  Scope-governed reconciliation of verified customer payments, Stripe balances, and marketing attribution.
                </p>
              </div>
            </div>
            <AdminMeasurementPanel
              onInspectOrder={(orderId) => {
                setActiveTab("orders");
                setSearchQuery(orderId);
                setExpandedJourneyOrderId(orderId);
              }}
            />
          </div>
        )}

        {/* ===================== TAB 3: DISCOUNTS ===================== */}
        {activeTab === "discounts" && (
          <div className="space-y-6">
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

        {/* ===================== TAB 4: TROUBLESHOOTING & INCIDENTS ===================== */}
        {activeTab === "incidents" && (
          <div className="space-y-6">
            <HandwryttenStatusWidget />

            {/* SYSTEM HEALTH, INCIDENTS & ALERT SUBSCRIPTION */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-stone-200 shadow-sm space-y-5">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className={`text-base font-bold flex items-center gap-2 ${
                        hasActiveAlerts ? "text-rose-700" : "text-stone-900"
                      }`}
                    >
                      {hasActiveAlerts ? (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>System Health &amp; Troubleshooting Feed</span>
                    </h2>
                    {hasActiveAlerts ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        {unresolvedIncidents.length} Unresolved
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        0 Open Alerts
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Diagnostic log and graceful error recovery for Stripe checkout, AI image generation, and Handwrytten fulfillment.
                  </p>
                </div>

                {/* CONTROLS: FILTER & ALERT SUBSCRIPTIONS */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                  {/* MOBILE 3-WAY SEGMENTED FILTER */}
                  <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl w-full sm:hidden">
                    <button
                      type="button"
                      onClick={() => setIncidentFilter("UNRESOLVED")}
                      className={`py-1.5 text-[11px] font-semibold rounded-lg transition text-center cursor-pointer ${
                        incidentFilter === "UNRESOLVED"
                          ? "bg-white shadow-2xs text-stone-900"
                          : "text-stone-500 hover:text-stone-900"
                      }`}
                    >
                      Unresolved ({unresolvedIncidents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentFilter("RESOLVED")}
                      className={`py-1.5 text-[11px] font-semibold rounded-lg transition text-center cursor-pointer ${
                        incidentFilter === "RESOLVED"
                          ? "bg-white shadow-2xs text-stone-900"
                          : "text-stone-500 hover:text-stone-900"
                      }`}
                    >
                      Resolved ({resolvedIncidents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentFilter("ALL")}
                      className={`py-1.5 text-[11px] font-semibold rounded-lg transition text-center cursor-pointer ${
                        incidentFilter === "ALL"
                          ? "bg-white shadow-2xs text-stone-900"
                          : "text-stone-500 hover:text-stone-900"
                      }`}
                    >
                      All ({incidents.length})
                    </button>
                  </div>

                  {/* DESKTOP STATUS FILTER DROPDOWN */}
                  <div className="hidden sm:flex items-center gap-1.5 bg-stone-50 border border-stone-300 rounded-lg px-2.5 h-8">
                    <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <select
                      value={incidentFilter}
                      onChange={(e) =>
                        setIncidentFilter(e.target.value as "UNRESOLVED" | "RESOLVED" | "ALL")
                      }
                      className="text-xs font-semibold bg-transparent text-stone-700 focus:outline-none cursor-pointer pr-1"
                      aria-label="Filter incidents"
                    >
                      <option value="UNRESOLVED">
                        Unresolved ({unresolvedIncidents.length})
                      </option>
                      <option value="RESOLVED">
                        Resolved ({resolvedIncidents.length})
                      </option>
                      <option value="ALL">
                        All Incidents ({incidents.length})
                      </option>
                    </select>
                  </div>

                  {/* ALERT EMAIL SUBSCRIPTION */}
                  <div className="w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setAlertFormOpen(!alertFormOpen)}
                      className="sm:hidden w-full flex items-center justify-between py-2 px-3 text-xs font-semibold text-stone-700 bg-stone-50 border border-stone-200 rounded-xl cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-stone-500" />
                        <span>Email Alert Notifications</span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-400 transition-transform ${
                          alertFormOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    <div
                      className={`${
                        alertFormOpen ? "block" : "hidden"
                      } sm:flex flex-wrap items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto`}
                    >
                      <div className="relative flex-1 w-full sm:w-56">
                        <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                        <input
                          type="email"
                          value={newAlertEmail}
                          onChange={(e) => setNewAlertEmail(e.target.value)}
                          placeholder="Alert email (e.g. zeke@...)"
                          className="w-full h-8 pl-8 pr-3 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 mt-2 sm:mt-0 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleSaveAlertEmail}
                          disabled={savingEmail}
                          className="h-8 px-3 text-xs font-semibold rounded-lg bg-stone-900 hover:bg-black text-white transition disabled:opacity-50 shrink-0 cursor-pointer text-center"
                        >
                          {savingEmail ? "Saving..." : alertEmail ? "Update Email" : "Subscribe"}
                        </button>
                        <button
                          type="button"
                          onClick={handleTestAlertEmail}
                          disabled={testingAlertEmail}
                          className="h-8 px-2.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition disabled:opacity-50 shrink-0 cursor-pointer inline-flex items-center justify-center gap-1 text-center"
                          title="Send a sample diagnostic alert email to verify notifications work"
                        >
                          <Send className="w-3 h-3" />
                          <span>{testingAlertEmail ? "Testing..." : "Test Alert"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* INCIDENTS LIST */}
              {filteredIncidents.length === 0 ? (
                incidentFilter === "UNRESOLVED" ? (
                  <div className="text-center py-10 px-4 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-2">
                    <ShieldCheck className="w-9 h-9 text-emerald-600 mx-auto" />
                    <p className="font-bold text-sm text-emerald-900">No Unresolved Errors</p>
                    <p className="text-xs text-emerald-700 max-w-md mx-auto">
                      No open Stripe, AI image generation, or Handwrytten fulfillment incidents require attention right now.
                    </p>
                    {resolvedIncidents.length > 0 && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setIncidentFilter("RESOLVED")}
                          className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                        >
                          View {resolvedIncidents.length} resolved incident{resolvedIncidents.length > 1 ? "s" : ""} &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4 rounded-2xl bg-stone-50 border border-stone-200 text-stone-500 text-xs space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-stone-400 mx-auto mb-1 opacity-70" />
                    <p className="font-semibold text-stone-700">No Incidents Found</p>
                    <p className="text-[11px] text-stone-400">
                      No incidents match the selected filter.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {filteredIncidents.map((incident) => {
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
                            ? "bg-stone-50/70 border-stone-200 opacity-75"
                            : incident.severity === "error"
                            ? "bg-rose-50/40 border-rose-200"
                            : "bg-amber-50/40 border-amber-200"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${typeColor}`}
                            >
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

                          <div className="flex items-center gap-2 flex-wrap">
                            {incident.technicalDetails && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedIncidentId(isExpanded ? null : incident.id)
                                }
                                className="text-[11px] font-medium text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 transition cursor-pointer"
                              >
                                <span>{isExpanded ? "Hide Details" : "Inspect"}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            )}
                            {Boolean(incident.metadata?.orderId) && !incident.resolved && (
                              <button
                                type="button"
                                onClick={() => {
                                  const orderId = String(incident.metadata?.orderId);
                                  const found = metrics?.recentOrders.find(
                                    (o) => o.id === orderId
                                  );
                                  if (found) {
                                    setAddressRetryOrder(found);
                                    setAddressRetryIncidentId(incident.id);
                                  } else {
                                    fetch(
                                      `/api/admin/order-proof?orderId=${encodeURIComponent(
                                        orderId
                                      )}`
                                    )
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
                                className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition cursor-pointer inline-flex items-center gap-1"
                              >
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Mark Resolved</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="font-semibold text-xs text-stone-800 mt-2">
                          {incident.summary}
                        </p>

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
          onSuccess={() => fetchMetrics()}
        />
      )}
    </div>
  );
}
