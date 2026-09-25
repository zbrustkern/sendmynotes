"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  PenTool,
  Mail,
  Truck,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Feather,
  Calendar,
  User as UserIcon,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  Loader2,
} from "lucide-react";
import { Order } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { trackGoogleAdsPurchase } from "@/lib/google-ads";

export default function OrderStatusPage() {
  const params = useParams();
  const orderId = params?.id as string;
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Privacy verification unlock state
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;
    const fetchOrder = async () => {
      try {
        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const tokenFromUrl = urlParams?.get("token");
        const tokenFromStorage = typeof window !== "undefined" ? sessionStorage.getItem(`order_token_${orderId}`) : null;
        const activeToken = tokenFromUrl || tokenFromStorage;

        const endpoint = activeToken
          ? `/api/orders/${orderId}?token=${encodeURIComponent(activeToken)}`
          : `/api/orders/${orderId}`;

        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error("Order not found or still processing.");
        }
        const data = await res.json();
        if (data.order && data.order.status === "PENDING_PAYMENT" && typeof window !== "undefined") {
          const paymentIntentId = urlParams?.get("payment_intent") || data.order.stripePaymentId;
          if (paymentIntentId) {
            try {
              const confirmRes = await fetch("/api/checkout/confirm-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId,
                  paymentIntentId,
                }),
              });
              if (confirmRes.ok) {
                const confirmData = await confirmRes.json();
                if (confirmData.success && confirmData.status) {
                  data.order.status = confirmData.status;
                  data.order.handwryttenOrderId = confirmData.handwryttenOrderId;
                }
              }
            } catch (cErr) {
              console.warn("Notice during order page auto-confirmation:", cErr);
            }
          }
        }

        if (isMounted) {
          setOrder(data.order);
          setLoading(false);

          if (data.order && data.order.status !== "PENDING_PAYMENT") {
            trackGoogleAdsPurchase({
              orderId: data.order.id,
              amountInCents: data.order.amountInCents || 900,
            });
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Error loading order");
          setLoading(false);
        }
      }
    };

    fetchOrder();
    // Poll every 5s if order is still pending
    const interval = setInterval(fetchOrder, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orderId]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyInput.trim()) return;
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      const isEmail = verifyInput.includes("@");
      const payload = isEmail
        ? { email: verifyInput.trim() }
        : { zip: verifyInput.trim() };

      const res = await fetch(`/api/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setVerifyError(
          data.error || "Verification failed. Please check the entered ZIP code or email."
        );
      } else {
        setOrder(data.order);
        if (data.viewToken && typeof window !== "undefined") {
          sessionStorage.setItem(`order_token_${orderId}`, data.viewToken);
        }
      }
    } catch {
      setVerifyError("Network error verifying order.");
    } finally {
      setVerifyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center animate-bounce shadow-lg shadow-amber-600/25 mb-4">
          <PenTool className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-serif text-stone-900 mb-2">
          Retrieving Physical Order Tracker...
        </h2>
        <p className="text-sm text-stone-500">Checking robotic plotter queue</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-lg max-w-md w-full">
          <h2 className="text-lg font-bold text-stone-900 mb-2">Order Notice</h2>
          <p className="text-sm text-stone-600 mb-6">{error || "Could not locate this order."}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white text-sm font-semibold rounded-xl hover:bg-black transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "PROCESSING_HANDWRYTTEN":
        return {
          label: "Inking in Progress",
          className: "text-emerald-700 bg-emerald-50 border-emerald-200",
        };
      case "COMPLETED":
      case "MAILED":
        return {
          label: "Mailed via USPS",
          className: "text-emerald-700 bg-emerald-50 border-emerald-200",
        };
      case "PENDING_PAYMENT":
        return {
          label: "Awaiting Payment",
          className: "text-amber-700 bg-amber-50 border-amber-200",
        };
      case "PAYMENT_RECEIVED":
      case "QUEUED_FOR_FULFILLMENT":
      case "FAILED":
      default:
        return {
          label: "Queued for Inking",
          className: "text-amber-700 bg-amber-50 border-amber-200",
        };
    }
  };

  const statusDisplay = getStatusDisplay(order.status);
  const isMailed = order.status === "MAILED";
  const isInking = order.status === "PROCESSING_HANDWRYTTEN";
  const isQueuedOrPaid =
    order.status === "PAYMENT_RECEIVED" ||
    order.status === "QUEUED_FOR_FULFILLMENT" ||
    order.status === "FAILED" ||
    isInking ||
    isMailed;

  const trackingSteps = [
    {
      title: "Payment Confirmed ($9.00 Paid)",
      description: "Transaction complete. Receipt delivered to email.",
      icon: CheckCircle2,
      status: "complete",
    },
    {
      title: "Artwork Printed on Heavy Cardstock",
      description: "5×7 folded card printed with rich front cover artwork.",
      icon: Sparkles,
      status: "complete",
    },
    {
      title: order.scheduledSendDate
        ? `Scheduled Handwriting (${order.scheduledSendDate})`
        : isMailed
        ? "Real Ink Handwriting Complete"
        : "Real Ink Handwriting In Progress",
      description: order.scheduledSendDate
        ? `Order confirmed. Queued to be penned with real ink and postmarked on ${order.scheduledSendDate}.`
        : isMailed
        ? `Penned with real blue ballpoint ink. (Handwrytten Order ID: ${order.handwryttenOrderId || "confirmed"})`
        : isInking
        ? `Handwrytten robotic pen applying real blue ballpoint ink to inside right leaf. ${
            order.handwryttenOrderId ? `(Order ID: ${order.handwryttenOrderId})` : ""
          }`
        : "Order confirmed. Queued for real ink handwriting in our studio.",
      icon: order.scheduledSendDate ? Calendar : PenTool,
      status: isMailed ? "complete" : isQueuedOrPaid ? "current" : "upcoming",
    },
    {
      title: "Enveloped & Stamped",
      description: `Addressed to ${order.recipientAddress.firstName} ${order.recipientAddress.lastName} with USPS First Class postage.`,
      icon: Mail,
      status: isMailed ? "complete" : "upcoming",
    },
    {
      title: "Mailed via USPS First Class",
      description: isMailed
        ? `Dispatched into USPS postal stream${
            order.handwryttenMailedDate ? ` on ${order.handwryttenMailedDate}` : ""
          }.${
            order.handwryttenTrackingNumber
              ? ` Tracking: ${order.handwryttenTrackingNumber}`
              : " Estimated delivery: 2-4 business days."
          }`
        : "Dispatched into postal stream. Estimated delivery: 2-4 business days.",
      icon: Truck,
      status: isMailed ? "complete" : "upcoming",
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-20 text-stone-900">
      {/* HEADER */}
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Send Another Card</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/account"
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200 transition"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>My Account</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200 transition cursor-pointer"
              >
                Save Card to Account
              </button>
            )}
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-stone-400 block">Order Reference</span>
              <span className="font-mono text-xs text-stone-700">{order.id}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* ACCOUNT CLAIM BANNER IF GUEST */}
        {!user && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Feather className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">Save this card to a free account</h4>
                <p className="text-xs text-stone-600">
                  Save your recipient to your address book and track past deliveries with 1 click.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition flex-shrink-0 cursor-pointer shadow-sm"
            >
              Claim Free Account
            </button>
          </div>
        )}
        {/* SUCCESS BANNER */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-md text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900">
            Order Confirmed & Queued for Inking!
          </h1>
          <p className="text-stone-600 text-sm max-w-lg mx-auto">
            Your card is queued for real ink writing. We will pen it with real ink, stamp it, and mail it directly to your recipient.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="bg-amber-50 text-amber-800 font-semibold px-3 py-1 rounded-full border border-amber-200">
              Receipt Sent: {order.customerEmail || "Delivered"}
            </span>
            <span className="bg-indigo-50 text-indigo-800 font-semibold px-3 py-1 rounded-full border border-indigo-200">
              Real Ink: Active
            </span>
            <span className="bg-emerald-50 text-emerald-800 font-semibold px-3 py-1 rounded-full border border-emerald-200">
              USPS Postage: Included
            </span>
          </div>
        </div>

        {/* ROBOTIC FULFILLMENT TIMELINE */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-md space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-indigo-600" />
              Real Ink Fulfillment Tracker
            </h2>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusDisplay.className}`}>
              {statusDisplay.label}
            </span>
          </div>

          <div className="space-y-6">
            {trackingSteps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="flex items-start gap-4">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      step.status === "complete"
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                        : step.status === "current"
                        ? "bg-amber-500 text-white animate-pulse shadow-md shadow-amber-500/20"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`text-sm font-bold ${
                          step.status === "upcoming" ? "text-stone-400" : "text-stone-900"
                        }`}
                      >
                        {step.title}
                      </h3>
                      {step.status === "current" && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PRIVACY UNLOCK BANNER IF REDACTED */}
        {order.isRedacted && (
          <div className="bg-stone-900 text-white rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-serif font-bold text-white flex items-center gap-2">
                  <span>Private Details Protected</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans">
                    Zero-Trust Privacy
                  </span>
                </h3>
                <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                  Personal handwritten card messages and exact street addresses are obscured for privacy. If you placed or received this card, enter the 5-digit delivery ZIP code or billing email to reveal full details.
                </p>
              </div>
            </div>

            <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row gap-2 max-w-lg">
              <input
                type="text"
                value={verifyInput}
                onChange={(e) => {
                  setVerifyInput(e.target.value);
                  if (verifyError) setVerifyError(null);
                }}
                placeholder="Enter 5-digit delivery ZIP or purchaser email"
                className="flex-1 px-4 py-2.5 rounded-xl bg-stone-800 border border-stone-700 text-white text-xs placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={verifyLoading || !verifyInput.trim()}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {verifyLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Unlock className="w-3.5 h-3.5" />
                )}
                <span>Unlock Full Card</span>
              </button>
            </form>

            {verifyError && (
              <p className="text-xs text-rose-400 font-medium animate-in fade-in duration-150">
                {verifyError}
              </p>
            )}
          </div>
        )}

        {/* ORDER DETAILS & MAILING SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Preview Thumbnail */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-md flex flex-col justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Physical 5×7 Folded Card
            </h3>
            <div className="relative aspect-[5/7] w-full rounded-2xl overflow-hidden shadow-md border-2 border-stone-100">
              <Image
                src={order.frontImageUrl}
                alt="Front Cover"
                fill
                className="object-cover"
              />
            </div>
            <div className="mt-4 pt-4 border-t border-stone-100 text-xs space-y-1 text-stone-600">
              <p>
                <strong>Inside Top:</strong> &ldquo;{order.printedMessage}&rdquo;
              </p>
              <div className="text-indigo-800 font-medium">
                <strong>Inside Right (Real Ink Handwriting):</strong>{" "}
                {order.isRedacted ? (
                  <span className="italic text-stone-400 inline-flex items-center gap-1 text-[11px]">
                    <Lock className="w-3 h-3 text-amber-600 inline" /> Personal handwritten note shielded for privacy
                  </span>
                ) : (
                  <span>&ldquo;{order.handwrittenNote.slice(0, 100)}...&rdquo;</span>
                )}
              </div>
            </div>
          </div>

          {/* Recipient & Shipping Details */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200/80 shadow-md space-y-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-600" />
                Mailing Destination
              </h3>
              <div className="p-3.5 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-800">
                <p className="font-bold text-sm">
                  {order.recipientAddress.firstName} {order.recipientAddress.lastName}
                </p>
                <p>{order.recipientAddress.street1}</p>
                {order.recipientAddress.street2 && <p>{order.recipientAddress.street2}</p>}
                <p>
                  {order.recipientAddress.city}, {order.recipientAddress.state} {order.recipientAddress.zip}
                </p>
                <p className="text-stone-400 text-[11px] pt-1">United States of America</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                Return Address
              </h3>
              <div className="p-3.5 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-600">
                <p className="font-semibold">
                  {order.returnAddress.firstName} {order.returnAddress.lastName}
                </p>
                <p>{order.returnAddress.street1}</p>
                <p>
                  {order.returnAddress.city}, {order.returnAddress.state} {order.returnAddress.zip}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200/60 text-xs flex items-center justify-between text-amber-900">
              <span>Amount Paid</span>
              <span className="font-serif font-bold text-base">$9.00 Flat Rate</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-xl shadow-amber-600/20 transition-all cursor-pointer"
          >
            <PenTool className="w-4 h-4 text-amber-100" />
            <span>Send Another Card ($9.00)</span>
          </Link>
        </div>
      </main>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultEmail={order.customerEmail}
      />
    </div>
  );
}
