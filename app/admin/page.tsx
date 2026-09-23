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
  Lock,
  PenTool,
  Send,
  Eye,
} from "lucide-react";
import { AdminMetrics, Order } from "@/lib/types";

export default function AdminDashboardPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [authError, setAuthError] = useState("");

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const verifyAccess = (keyToTest: string) => {
    // Allows instant dev access with 'admin' or environment access
    if (keyToTest === "admin" || keyToTest === "sendmynotes2026" || process.env.NODE_ENV === "development") {
      setIsAuthenticated(true);
      sessionStorage.setItem("smn_admin_auth", "true");
      fetchMetrics();
    } else {
      setAuthError("Invalid admin access key. Please try again.");
    }
  };

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/metrics");
      if (!res.ok) throw new Error("Failed to load metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error("Error loading admin metrics:", err);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    if (sessionStorage.getItem("smn_admin_auth") === "true") {
      setIsAuthenticated(true);
      fetchMetrics();
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-stone-900 text-white flex items-center justify-center shadow-md">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-stone-900">
              sendmynotes Admin Portal
            </h1>
            <p className="text-xs text-stone-500">
              Enter your admin passphrase to access telemetry, customer analytics, and Handwrytten orders.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyAccess(accessKey);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                Passphrase
              </label>
              <input
                type="password"
                value={accessKey}
                onChange={(e) => {
                  setAccessKey(e.target.value);
                  if (authError) setAuthError("");
                }}
                placeholder="Enter passphrase (or 'admin')"
                className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
              {authError && <p className="text-xs text-rose-600 mt-1 font-medium">{authError}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-stone-900 hover:bg-black text-white text-sm font-semibold rounded-xl shadow-md transition cursor-pointer"
            >
              Unlock Dashboard
            </button>
          </form>

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
              onClick={fetchMetrics}
              disabled={loading}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 bg-stone-100 px-3.5 py-2 rounded-xl transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Storefront</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
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
                    const isProcessing =
                      order.status === "PROCESSING_HANDWRYTTEN";
                    const isPending = order.status === "PENDING_PAYMENT";
                    const canRetry = !isProcessing && !isPending;

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
                                isProcessing
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
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-serif font-bold text-stone-900 text-sm">
                          ${((order.amountInCents || 900) / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {canRetry ? (
                            <button
                              onClick={() => handleRetryFulfillment(order.id)}
                              disabled={retryingId === order.id}
                              className="px-2.5 py-1 text-[11px] font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-300 transition inline-flex items-center gap-1 shadow-sm disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${
                                  retryingId === order.id ? "animate-spin" : ""
                                }`}
                              />
                              {retryingId === order.id ? "Inking..." : "Retry Dispatch"}
                            </button>
                          ) : isProcessing ? (
                            <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Dispatched
                            </span>
                          ) : (
                            <span className="text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
