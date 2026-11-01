"use client";

import React, { useEffect, useState, useMemo } from "react";
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
import { isCustomerPurchaseOrder } from "@/lib/customer-purchase-classification";
import { detectCardIntent } from "@/lib/card-intent";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { cancelGoogleAdsPurchaseRetries, hasGoogleAdsCheckoutProof, trackGoogleAdsPurchase } from "@/lib/google-ads";
import { trackMetaPurchase } from "@/lib/meta-ads";

export default function OrderStatusPage() {
  const params = useParams();
  const orderId = params?.id as string;
  const { user, saveAddress } = useAuth();

  useEffect(() => () => {
    if (orderId) cancelGoogleAdsPurchaseRetries(orderId);
  }, [orderId]);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Privacy verification unlock state
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Post-order occasion-tailored reminder prompt state
  const intentConfig = useMemo(() => {
    return order ? detectCardIntent(order) : null;
  }, [order]);

  // Auto-sync recipient address to user's address book if logged in or after claiming account
  useEffect(() => {
    if (user && order?.recipientAddress && order.recipientAddress.street1) {
      saveAddress({
        firstName: order.recipientAddress.firstName,
        lastName: order.recipientAddress.lastName,
        street1: order.recipientAddress.street1,
        street2: order.recipientAddress.street2,
        city: order.recipientAddress.city,
        state: order.recipientAddress.state,
        zip: order.recipientAddress.zip,
        country: order.recipientAddress.country,
        label: `${order.recipientAddress.firstName}'s Address`,
        occasionType: order.recipientOccasion?.occasionType,
        occasionTitle: order.recipientOccasion?.occasionTitle,
        occasionMonth: order.recipientOccasion?.month,
        occasionDay: order.recipientOccasion?.day,
        occasionYear: order.recipientOccasion?.year,
        remindMe: order.recipientOccasion?.remindMe,
        remindDaysBefore: order.recipientOccasion?.remindDaysBefore,
      }).catch((err) => console.warn("Notice syncing address book on order page:", err));
    }
  }, [user, order?.id]);

  useEffect(() => {
    if (!orderId) return;

    let isMounted = true;
    const fetchOrder = async () => {
      try {
        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const tokenFromUrl = urlParams?.get("token") || urlParams?.get("viewToken");
        if (tokenFromUrl && typeof window !== "undefined") {
          try {
            sessionStorage.setItem(`order_token_${orderId}`, tokenFromUrl);
            // Bearer token hygiene: strip sensitive tokens from URL history to prevent leaking into Referer headers or analytics
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("token");
            cleanUrl.searchParams.delete("viewToken");
            const newSearch = cleanUrl.searchParams.toString();
            window.history.replaceState({}, "", cleanUrl.pathname + (newSearch ? `?${newSearch}` : ""));
          } catch {
            // ignore storage/history errors in restricted sandboxes
          }
        }
        let tokenFromStorage: string | null = null;
        try {
          tokenFromStorage = typeof window !== "undefined" ? sessionStorage.getItem(`order_token_${orderId}`) : null;
        } catch {
          // A redirect token in the URL can still authorize this fetch when storage is denied.
        }
        const activeToken = tokenFromUrl || tokenFromStorage;

        const endpoint = activeToken
          ? `/api/orders/${orderId}?token=${encodeURIComponent(activeToken)}`
          : `/api/orders/${orderId}`;

        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error("Order not found or still processing.");
        }
        const data = await res.json();
        if (!isMounted) return;
        if (isCustomerPurchaseOrder(data.order) && data.order?.purchaseMeasurement && !data.order.isInternationalPreview && data.order.fulfillmentStatus !== "INTERNATIONAL_PREVIEW_HOLD" && hasGoogleAdsCheckoutProof(orderId)) {
          trackGoogleAdsPurchase({
            orderId,
            measurement: data.order.purchaseMeasurement,
            consent: data.order.attribution,
          });
        }
        if (data.order && data.order.status === "PENDING_PAYMENT" && typeof window !== "undefined" && hasGoogleAdsCheckoutProof(orderId)) {
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
                if (!isMounted) return;
                if (confirmData.success && confirmData.status) {
                  data.order.status = confirmData.status;
                  data.order.handwryttenOrderId = confirmData.handwryttenOrderId;
                  data.order.purchaseMeasurement = confirmData.purchaseMeasurement;
                  if (isCustomerPurchaseOrder(data.order) && confirmData.purchaseMeasurement && !data.order.isInternationalPreview && data.order.fulfillmentStatus !== "INTERNATIONAL_PREVIEW_HOLD" && hasGoogleAdsCheckoutProof(orderId)) {
                    trackGoogleAdsPurchase({
                      orderId,
                      measurement: confirmData.purchaseMeasurement,
                      consent: data.order.attribution,
                    });
                  }
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

          if (isCustomerPurchaseOrder(data.order) && data.order.status !== "PENDING_PAYMENT" && !data.order.isInternationalPreview && data.order.fulfillmentStatus !== "INTERNATIONAL_PREVIEW_HOLD") {
            try {
            trackMetaPurchase({
              orderId: data.order.id,
              value: data.order.amountInCents ? data.order.amountInCents / 100 : 9.0,
              customerEmail: data.order.customerEmail,
              customerName: data.order.returnAddress?.firstName
                ? `${data.order.returnAddress.firstName} ${data.order.returnAddress.lastName || ""}`.trim()
                : undefined,
              recipientCity: data.order.recipientAddress?.city,
              recipientState: data.order.recipientAddress?.state,
              recipientZip: data.order.recipientAddress?.zip,
              itemName: data.order.occasion ? `${data.order.occasion} Card` : undefined,
            });
            } catch { /* independent destination must not break order status */ }
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

  const orderTotalCents = order.quote?.totalCents ?? order.finalAmountInCents ?? order.amountInCents ?? 900;
  const isInternational = Boolean((order.quote?.countryCode || order.recipientAddress.country) && !["US", "USA", "United States"].includes(order.quote?.countryCode || order.recipientAddress.country || ""));
  const isPreviewHold = isInternational && Boolean(order.isInternationalPreview || order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD");
  const isMailed = !isPreviewHold && order.status === "MAILED";
  const isInking = !isPreviewHold && order.status === "PROCESSING_HANDWRYTTEN";
  const isQueuedOrPaid = order.status === "PAYMENT_RECEIVED" || order.status === "QUEUED_FOR_FULFILLMENT" || order.status === "FAILED" || isInking || isMailed;

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "PROCESSING_HANDWRYTTEN":
        return {
          label: isPreviewHold ? "Held for staging review" : "Inking in Progress",
          className: isPreviewHold ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200",
        };
      case "COMPLETED":
      case "MAILED":
        return {
          label: isPreviewHold ? "Held for staging review" : isInternational ? "Mailed internationally" : "Mailed via USPS",
          className: isPreviewHold ? "text-amber-700 bg-amber-50 border-amber-200" : "text-emerald-700 bg-emerald-50 border-emerald-200",
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
          label: isPreviewHold ? "Held for staging review" : "Queued for Inking",
          className: "text-amber-700 bg-amber-50 border-amber-200",
        };
    }
  };

  const statusDisplay = getStatusDisplay(order.status);

  const trackingSteps = [
    {
      title: isPreviewHold ? `Test payment recorded ($${(orderTotalCents / 100).toFixed(2)})` : `Payment Confirmed ($${(orderTotalCents / 100).toFixed(2)} Paid)`,
      description: isPreviewHold ? "No real charge occurred. Receipt email is suppressed in staging." : order.contactEmailChoice === "omitted" ? "Transaction complete. No email updates were requested; return to this secure order page for status." : order.receiptEmailSentAt ? `Receipt email requested for ${order.customerEmail}.` : "Transaction complete. Order status is available on this secure page.",
      icon: CheckCircle2,
      status: "complete",
    },
    {
      title: isPreviewHold ? "Held for staging review" : "Artwork Printed on Quality Cardstock",
      description: isPreviewHold ? "No card was printed, inked, or sent to fulfillment." : "Folded card printed with rich front cover artwork.",
      icon: Sparkles,
      status: isPreviewHold ? "current" : "complete",
    },
    {
      title: isPreviewHold ? "No handwriting started" : order.scheduledSendDate
        ? `Scheduled Handwriting (${order.scheduledSendDate})`
        : isMailed
        ? "Real Ink Handwriting Complete"
        : "Real Ink Handwriting In Progress",
      description: isPreviewHold ? "This test order remains held in staging; no physical production occurred." : order.scheduledSendDate
        ? `Order confirmed. Queued to be penned with real ink and mailed for ${order.scheduledSendDate}.`
        : isMailed
        ? `Penned with real blue ballpoint ink. (Handwrytten Order ID: ${order.handwryttenOrderId || "confirmed"})`
        : isInking
        ? `Handwrytten robotic pen applying real blue ballpoint ink to inside right leaf. ${
            order.handwryttenOrderId ? `(Order ID: ${order.handwryttenOrderId})` : ""
          }`
        : "Order confirmed. Queued for real ink handwriting in our studio.",
      icon: order.scheduledSendDate ? Calendar : PenTool,
      status: isPreviewHold ? "current" : isMailed ? "complete" : isQueuedOrPaid ? "current" : "upcoming",
    },
    {
      title: isPreviewHold ? "Mailing not started" : "Enveloped & Stamped",
      description: isPreviewHold ? "No postage or shipment was created for this staging test." : isInternational ? `Addressed to ${order.recipientAddress.firstName} ${order.recipientAddress.lastName} in ${order.quote?.countryCode || order.recipientAddress.country}. Delivery timing varies by destination.` : `Addressed to ${order.recipientAddress.firstName} ${order.recipientAddress.lastName} with USPS First Class postage.`,
      icon: Mail,
      status: isMailed ? "complete" : "upcoming",
    },
    {
      title: isPreviewHold ? "Delivery not scheduled" : isInternational ? "Mailed internationally" : "Mailed via USPS First Class",
      description: isPreviewHold ? "This preview order will not be mailed; no delivery estimate applies." : isMailed
        ? `Dispatched into USPS postal stream${
            order.handwryttenMailedDate ? ` on ${order.handwryttenMailedDate}` : ""
          }.${
            order.handwryttenTrackingNumber
              ? ` Tracking: ${order.handwryttenTrackingNumber}`
              : isInternational ? " Delivery timing varies by destination." : " Domestic transit typically takes 2–7 business days; delivery timing is estimated."
          }`
        : isInternational ? "Delivery timing varies by destination; no delivery date is guaranteed." : "Domestic transit typically takes 2–7 business days; delivery timing is estimated, not guaranteed.",
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
            {isPreviewHold ? "International Staging Test · Held" : "Order Confirmed & Queued for Inking!"}
          </h1>
          <p className="text-stone-600 text-sm max-w-lg mx-auto">
            {isPreviewHold ? "Test checkout recorded. No real charge, receipt email, card printing, fulfillment, or mailing occurred." : isInternational ? "Your card is queued for real ink writing and international mailing. Delivery timing varies by destination." : "Your card is queued for real ink writing. We will pen it with real ink, stamp it, and mail it directly to your recipient."}{!isPreviewHold && order.contactEmailChoice === "omitted" ? " No email receipt or mailing updates were requested. This secure page will show your order status." : ""}
          </p>

          {order.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED" && order.viewToken && (
            <div className="max-w-xl mx-auto rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-950">
              <strong>Payment received; recipient address still needed.</strong>
              <p className="mt-1">No email address is available for a reminder. Use this secure link to add the recipient address and release the card to fulfillment.</p>
              <a className="mt-3 inline-flex rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white" href={`/orders/${order.id}/complete-address?token=${encodeURIComponent(order.viewToken)}`}>Add recipient address</a>
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="bg-amber-50 text-amber-800 font-semibold px-3 py-1 rounded-full border border-amber-200">
              {isPreviewHold ? "Staging test · no receipt email sent" : order.contactEmailChoice === "omitted" ? "No email receipt requested" : order.receiptEmailSentAt ? `Receipt emailed to ${order.customerEmail}` : order.customerEmail ? `Email provided: ${order.customerEmail}` : "Email receipt unavailable"}
            </span>
            <span className="bg-indigo-50 text-indigo-800 font-semibold px-3 py-1 rounded-full border border-indigo-200">
              {isPreviewHold ? "Fulfillment: Held" : "Real Ink: Active"}
            </span>
            <span className="bg-emerald-50 text-emerald-800 font-semibold px-3 py-1 rounded-full border border-emerald-200">
              {isPreviewHold ? "Mailing: Not started" : isInternational ? "International Mailing: Included" : "USPS Postage: Included"}
            </span>
          </div>
        </div>

        {/* A checkout preference is not a persisted account reminder. */}
        {order.customerEmail && order.recipientOccasion?.remindMe && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-500/10 border border-amber-300/80 rounded-3xl p-5 sm:p-6 shadow-xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-stone-900 font-serif pt-1">A reminder choice is recorded with this order</h3>
              <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">This order detail does not confirm a saved account reminder or an email. Add the date in your account to manage reminder consent and timing.</p>
              <Link href="/account/dates" className="inline-flex min-h-11 items-center mt-3 rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black">Manage dates &amp; reminders</Link>
            </div>
          </div>
        )}

        {/* Post-order account date handoff; nothing is saved or scheduled here. */}
        {order.contactEmailChoice !== "omitted" && !order.recipientOccasion?.remindMe && intentConfig && (
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-stone-900 font-serif">Keep a date in mind for next time</h3>
            <p className="text-xs text-stone-500 max-w-xl leading-relaxed">This order does not create a saved date or reminder. Add an occasion in your account if you’d like to manage one. Reminder emails depend on your settings and available delivery service.</p>
            <Link href="/account/dates" className="inline-flex min-h-11 items-center rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black">Manage dates &amp; reminders</Link>
          </div>
        )}

        {/* ROBOTIC FULFILLMENT TIMELINE */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/80 shadow-md space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-indigo-600" />
              {isPreviewHold ? "International Preview Status" : "Real Ink Fulfillment Tracker"}
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
              Physical Folded Card
            </h3>
            <div className="relative aspect-[5/7] w-full rounded-2xl overflow-hidden shadow-md border-2 border-stone-100">
              <Image
                src={order.frontImageUrl}
                alt="Front Cover"
                fill
                unoptimized={Boolean(order.frontImageUrl?.startsWith("data:"))}
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
                  {[order.recipientAddress.city, order.recipientAddress.state, order.recipientAddress.zip].filter(Boolean).join(" ")}
                </p>
                <p className="text-stone-400 text-[11px] pt-1">{isInternational ? order.quote?.countryCode || order.recipientAddress.country : "United States of America"}</p>
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
              <span className="font-serif font-bold text-base">${(orderTotalCents / 100).toFixed(2)} Total</span>
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
