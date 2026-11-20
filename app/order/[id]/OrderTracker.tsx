"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  CheckCircle2,
  Clock,
  PenTool,
  Mail,
  Truck,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Feather,
  Calendar,
  User as UserIcon,
  Lock,
} from "lucide-react";
import { MultiSendOrderStatus } from "@/components/multi-send/MultiSendOrderStatus";
import type { MultiSendView } from "@/lib/multi-send/presentation";
import type { Order } from "@/lib/types";
import { isCustomerPurchaseOrder } from "@/lib/customer-purchase-classification";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { deferredAddressPath } from "@/lib/order-tracking-links";
import { CopyPrivateOrderLink } from "@/components/CopyPrivateOrderLink";
import { cancelGoogleAdsPurchaseRetries, hasGoogleAdsCheckoutProof, trackGoogleAdsPurchase } from "@/lib/google-ads";
import { trackMetaPurchase } from "@/lib/meta-ads";
import { prepareCheckoutPurchaseTags } from "@/lib/checkout-purchase-tags";

type TrackerOrder =
  | (Pick<Order, "id" | "status"> & { isRedacted: true; multiSendView?: MultiSendView })
  | (Order & { isRedacted: false; multiSendView?: MultiSendView; totalCents?: number; destinationCountryCode?: string });

interface TrackerLocation {
  readToken: string | null;
  viewToken: string | null;
  returnTicket: string | null;
  checkoutEntry: boolean;
  cleanUrl: boolean;
}

const TRACKER_HISTORY_KEY = "__smnTracker";

type TrackerHistoryCredentials = Pick<Partial<TrackerLocation>, "readToken" | "viewToken" | "returnTicket">;

function trackerPath(orderId: string): string {
  return `/order/${encodeURIComponent(orderId)}`;
}

export function writeTrackerHistory(orderId: string, state: TrackerHistoryCredentials, path: string): boolean {
  try {
    const nextState = { ...window.history.state, [TRACKER_HISTORY_KEY]: { orderId, path, ...state } };
    // Let Next's public history patch keep the router's URL synchronized with the scrubbed address.
    delete nextState.__NA;
    delete nextState._N;
    window.history.replaceState(nextState, "", path);
    return true;
  } catch {
    return false;
  }
}

export function readTrackerHistory(orderId: string, path: string) {
  const state = window.history.state?.[TRACKER_HISTORY_KEY];
  if (state?.orderId !== orderId || state.path !== path) return null;
  return state as TrackerHistoryCredentials;
}

function readTrackerLocation(orderId: string): TrackerLocation {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const path = trackerPath(orderId);
  const saved = readTrackerHistory(orderId, path);
  const adminReview = url.searchParams.get("review") === "admin";
  const explicitRead = fragment.get("read");
  const explicitCheckout = fragment.get("viewToken") || url.searchParams.get("token") || url.searchParams.get("viewToken");
  const checkoutEntry = !adminReview && !explicitRead && !explicitCheckout && fragment.get("checkout") === "1";
  const readToken = adminReview ? null : explicitRead || (!explicitCheckout ? saved?.readToken || null : null);
  const viewToken = adminReview || explicitRead ? null : explicitCheckout || saved?.viewToken || null;
  const returnTicket = !adminReview && explicitRead ? fragment.get("return") : null;
  // The return ticket is only needed for the initial callback. Refresh recovers read-only access.
  const safePath = adminReview ? `${path}?review=admin` : path;
  const cleanUrl = writeTrackerHistory(orderId, { readToken, viewToken }, safePath);
  return { readToken, viewToken, returnTicket, checkoutEntry, cleanUrl };
}

export function activeSessionCheckoutToken(orderId: string): string | null {
  if (!hasGoogleAdsCheckoutProof(orderId)) return null;
  try {
    return window.sessionStorage.getItem(`order_token_${orderId}`);
  } catch {
    return null;
  }
}

function safePublicStatus(status: string): { label: string; detail: string } {
  switch (status) {
    case "PENDING_PAYMENT":
      return { label: "Payment pending", detail: "This order is waiting for payment confirmation." };
    case "AWAITING_RECIPIENT_ADDRESS":
    case "ADDRESS_NEEDED":
    case "ADDRESS_REQUIRED":
    case "CONTACT_RECOVERY_REQUIRED":
      return { label: "Address needed", detail: "The sender needs to add a delivery address before this card can move forward." };
    case "DISPATCHING":
    case "PROCESSING_HANDWRYTTEN":
    case "PAYMENT_RECEIVED":
    case "QUEUED_FOR_FULFILLMENT":
      return { label: "Processing", detail: "This card is being prepared for mailing." };
    case "MAILED":
    case "COMPLETED":
      return { label: "Mailed", detail: "This card has been sent by mail." };
    case "DISPATCH_UNCERTAIN":
      return { label: "Status update pending", detail: "We’re checking this card’s mailing status." };
    case "PAYMENT_VERIFICATION_FAILED":
      return { label: "Payment verification needed", detail: "We couldn’t verify payment for this order." };
    case "FAILED":
      return { label: "Order needs attention", detail: "We couldn’t complete a step for this card. Check your order details for more information." };
    default:
      return { label: "Status update pending", detail: "Check again later or sign in to see whether this order appears in your card history." };
  }
}

export function OrderTracker({ orderId }: { orderId: string }) {
  const { user } = useAuth();
  const trackerLocation = useRef<TrackerLocation | null>(null);
  const confirmationStarted = useRef(false);
  const purchaseReported = useRef(false);
  const [order, setOrder] = useState<TrackerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [privateReadToken, setPrivateReadToken] = useState<string | null>(null);
  const [deferredCheckoutToken, setDeferredCheckoutToken] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    const { signal } = controller;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const begin = async () => {
      // Wait for the parent App Router effect to register its native history integration.
      await Promise.resolve();
      if (signal.aborted) return;
      const location = trackerLocation.current ??= readTrackerLocation(orderId);
      let shouldContinuePolling = false;
      const readToken = location.readToken;
      let activeCheckout = false;
      let checkoutToken = location.viewToken;
      const apiPath = `/api/orders/${encodeURIComponent(orderId)}`;

      const getOrder = async (headers: Record<string, string> = {}) => {
        const response = await fetch(apiPath, { headers, cache: "no-store", signal });
        if (!response.ok) throw new Error("Order not found or still processing.");
        return response.json();
      };

      const reportPurchase = (orderData: Order) => {
        const measurement = orderData.purchaseMeasurement;
        if (purchaseReported.current || !location.cleanUrl || !hasGoogleAdsCheckoutProof(orderId) ||
            !measurement?.eligible || measurement.transactionId !== orderId || !isCustomerPurchaseOrder(orderData) || orderData.status === "PENDING_PAYMENT" ||
            orderData.isInternationalPreview || orderData.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD") return;
        if (signal.aborted || !prepareCheckoutPurchaseTags(orderId, orderData.attribution)) return;
        purchaseReported.current = true;
        trackGoogleAdsPurchase({ orderId, measurement, consent: orderData.attribution });
        try {
          trackMetaPurchase({
            orderId: orderData.id,
            itemCount: measurement.itemCount || 1,
            value: measurement.amountInCents / 100,
            customerEmail: orderData.customerEmail,
            customerName: orderData.returnAddress?.firstName
              ? `${orderData.returnAddress.firstName} ${orderData.returnAddress.lastName || ""}`.trim()
              : undefined,
            recipientCity: orderData.recipientAddress?.city,
            recipientState: orderData.recipientAddress?.state,
            recipientZip: orderData.recipientAddress?.zip,
            itemName: orderData.occasion ? `${orderData.occasion} Card` : undefined,
          });
        } catch { /* Conversion delivery cannot interrupt private order access. */ }
      };

      const fetchOrder = async () => {
        try {
          const headers: Record<string, string> = {};
          if (checkoutToken) headers["x-view-token"] = checkoutToken;
          else if (readToken) headers["x-order-read-token"] = readToken;
          let data = await getOrder(headers);
          if (checkoutToken && readToken && data.accessKind !== "checkout") {
            checkoutToken = null;
            data = await getOrder({ "x-order-read-token": readToken });
          }
          if (signal.aborted || !data.order) return;
          shouldContinuePolling = !data.order.isRedacted;
          const token = !data.order.isRedacted && typeof data.readToken === "string" ? data.readToken : null;
          setPrivateReadToken(token);
          const authorizedCheckout = data.accessKind === "checkout" && !data.order.isRedacted ? checkoutToken : null;
          setDeferredCheckoutToken(authorizedCheckout ? checkoutToken : null);
          if (token && authorizedCheckout && !location.viewToken && !readToken) {
            // Keep the canonical history entry recoverable with only read access.
            writeTrackerHistory(orderId, { readToken: token }, trackerPath(orderId));
          }
          if (authorizedCheckout && activeCheckout && hasGoogleAdsCheckoutProof(orderId)) {
            if (data.order.status === "PENDING_PAYMENT" && data.order.stripePaymentId && !confirmationStarted.current) {
              confirmationStarted.current = true;
              try {
                const confirmRes = await fetch("/api/checkout/confirm-order", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-view-token": authorizedCheckout },
                  body: JSON.stringify({ orderId, paymentIntentId: data.order.stripePaymentId }),
                  signal,
                });
                if (confirmRes.ok) {
                  const confirmed = await confirmRes.json();
                  if (confirmed.success && confirmed.status) {
                    data.order.status = confirmed.status;
                    data.order.handwryttenOrderId = confirmed.handwryttenOrderId;
                    data.order.purchaseMeasurement = confirmed.purchaseMeasurement;
                  }
                }
              } catch { /* A later poll can observe authoritative payment processing. */ }
            }
            if (!signal.aborted) {
              try { reportPurchase(data.order); } catch { /* Tracking failures leave order access intact. */ }
            }
          }
          if (signal.aborted) return;
          setError(null);
          setOrder(data.order);
          setLoading(false);
        } catch (err: unknown) {
          if (signal.aborted) return;
          setError(err instanceof Error ? err.message : "Error loading order");
          setLoading(false);
        } finally {
          if (!signal.aborted && shouldContinuePolling) pollTimer = setTimeout(fetchOrder, 5000);
        }
      };

      if (location.returnTicket && readToken) {
        const sessionToken = activeSessionCheckoutToken(orderId);
        if (sessionToken) {
          const validated = await getOrder({ "x-order-return-ticket": location.returnTicket }).catch(() => null);
          if (validated?.readToken === readToken) {
            checkoutToken = sessionToken;
            activeCheckout = true;
          }
        }
      } else if (location.checkoutEntry && !readToken && hasGoogleAdsCheckoutProof(orderId)) {
        checkoutToken ||= activeSessionCheckoutToken(orderId);
        activeCheckout = Boolean(checkoutToken);
      }
      if (!signal.aborted) await fetchOrder();
    };
    void begin();
    return () => {
      controller.abort();
      if (pollTimer) clearTimeout(pollTimer);
      cancelGoogleAdsPurchaseRetries(orderId);
    };
  }, [orderId]);

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

  if (order.isRedacted) {
    const publicStatus = safePublicStatus(order.status);
    return (
      <main className="min-h-screen bg-[#FAF8F5] px-5 py-12 text-stone-900">
        <section className="mx-auto max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-800"><Lock className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wide">Order status</span></div>
          <h1 className="font-serif text-2xl">{publicStatus.label}</h1>
          <p className="text-sm text-stone-600">{publicStatus.detail}</p>
          {order.multiSendView && <p className="text-sm text-stone-600">{order.multiSendView.quantity} cards</p>}
          <p className="text-xs text-stone-500">Order reference <span className="font-mono">{order.id}</span></p>
          <div className="space-y-2 border-t border-stone-100 pt-4">
            <h2 className="text-sm font-semibold">Your order details are private</h2>
            <p className="text-sm text-stone-600">Open your private order link, or sign in and check your card history.</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={() => setIsAuthModalOpen(true)} className="rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-semibold text-white">Sign in</button>
              <Link href={`/account/history/${encodeURIComponent(orderId)}`} className="text-sm font-medium text-emerald-800 underline">Check this order in card history</Link>
            </div>
          </div>
        </section>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </main>
    );
  }

  if (order.multiSendView) return (
    <>
      <div className="mx-auto max-w-4xl px-4 pt-5"><CopyPrivateOrderLink orderId={orderId} readToken={privateReadToken} /></div>
      <MultiSendOrderStatus order={order} view={order.multiSendView} />
    </>
  );

  const orderTotalCents = order.totalCents ?? order.quote?.totalCents ?? order.finalAmountInCents ?? order.amountInCents ?? 900;
  const destinationCountry = order.destinationCountryCode || order.quote?.countryCode || order.recipientAddress?.country;
  const isInternational = Boolean(destinationCountry && !["US", "USA", "United States"].includes(destinationCountry));
  const isPreviewHold = isInternational && Boolean(order.isInternationalPreview || order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD");
  const isMailed = !isPreviewHold && order.status === "MAILED";
  const isInking = !isPreviewHold && order.status === "PROCESSING_HANDWRYTTEN";
  const isQueuedOrPaid = order.status === "PAYMENT_RECEIVED" || order.status === "QUEUED_FOR_FULFILLMENT" || order.status === "FAILED" || isInking || isMailed;

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "PENDING_PAYMENT":
      case "PAYMENT_VERIFICATION_FAILED":
      case "AWAITING_RECIPIENT_ADDRESS":
        return { label: safePublicStatus(status).label, className: "text-amber-700 bg-amber-50 border-amber-200" };
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
  const paymentPending = order.status === "PENDING_PAYMENT";
  const paymentVerificationFailed = order.status === "PAYMENT_VERIFICATION_FAILED";

  const trackingSteps = [
    {
      title: paymentPending || paymentVerificationFailed ? safePublicStatus(order.status).label : isPreviewHold ? `Test payment recorded ($${(orderTotalCents / 100).toFixed(2)})` : `Payment Confirmed ($${(orderTotalCents / 100).toFixed(2)} Paid)`,
      description: paymentPending || paymentVerificationFailed ? safePublicStatus(order.status).detail : isPreviewHold ? "No real charge occurred. Receipt email is suppressed in staging." : order.contactEmailChoice === "omitted" ? "Transaction complete. No email updates were requested; return to this secure order page for status." : order.receiptEmailSentAt ? `Receipt email requested for ${order.customerEmail}.` : "Transaction complete. Order status is available on this secure page.",
      icon: CheckCircle2,
      status: paymentPending || paymentVerificationFailed ? "current" : "complete",
    },
    {
      title: isPreviewHold ? "Held for staging review" : "Artwork Printed on Quality Cardstock",
      description: isPreviewHold ? "No card was printed, inked, or sent to fulfillment." : "Folded card printed with rich front cover artwork.",
      icon: Sparkles,
      status: isPreviewHold ? "current" : paymentPending || paymentVerificationFailed ? "upcoming" : "complete",
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
      description: isPreviewHold ? "No postage or shipment was created for this staging test." : isInternational ? `Addressed to ${order.recipientAddress?.firstName} ${order.recipientAddress?.lastName} in ${destinationCountry}. Delivery timing varies by destination.` : `Addressed to ${order.recipientAddress?.firstName} ${order.recipientAddress?.lastName} with USPS First Class postage.`,
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
                Sign in
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
        <CopyPrivateOrderLink orderId={orderId} readToken={privateReadToken} compact />
        {/* ACCOUNT CLAIM BANNER IF GUEST */}
        {!user && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Feather className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-stone-900">Your SendMyNotes account</h4>
                <p className="text-xs text-stone-600">
                  Sign in to manage your address book and view your card history.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition flex-shrink-0 cursor-pointer shadow-sm"
            >
              Sign in or create an account
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
            {paymentPending || paymentVerificationFailed || order.status === "AWAITING_RECIPIENT_ADDRESS" ? safePublicStatus(order.status).detail : isPreviewHold ? "Test checkout recorded. No real charge, receipt email, card printing, fulfillment, or mailing occurred." : isInternational ? "Your card is queued for real ink writing and international mailing. Delivery timing varies by destination." : "Your card is queued for real ink writing. We will pen it with real ink, stamp it, and mail it directly to your recipient."}{!isPreviewHold && order.contactEmailChoice === "omitted" ? " No email receipt or mailing updates were requested. This secure page will show your order status." : ""}
          </p>

          {(order.fulfillmentStatus === "CONTACT_RECOVERY_REQUIRED" || order.status === "AWAITING_RECIPIENT_ADDRESS" || order.addressDeferred || order.address_deferred) && deferredCheckoutToken && (
            <div className="max-w-xl mx-auto rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-950">
              <strong>Payment received; recipient address still needed.</strong>
              <p className="mt-1">No email address is available for a reminder. Use this secure link to add the recipient address and release the card to fulfillment.</p>
              <a className="mt-3 inline-flex rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white" href={deferredAddressPath(order.id, deferredCheckoutToken)}>Add recipient address</a>
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
        {order.contactEmailChoice !== "omitted" && !order.recipientOccasion?.remindMe && (
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
                <span>&ldquo;{(order.handwrittenNote || "").slice(0, 100)}...&rdquo;</span>
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
                  {order.recipientAddress?.firstName} {order.recipientAddress?.lastName}
                </p>
                <p>{order.recipientAddress?.street1}</p>
                {order.recipientAddress?.street2 && <p>{order.recipientAddress?.street2}</p>}
                <p>
                  {[order.recipientAddress?.city, order.recipientAddress?.state, order.recipientAddress?.zip].filter(Boolean).join(" ")}
                </p>
                <p className="text-stone-400 text-[11px] pt-1">{isInternational ? destinationCountry : "United States of America"}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
                Return Address
              </h3>
              <div className="p-3.5 bg-stone-50 rounded-xl text-xs space-y-1 text-stone-600">
                <p className="font-semibold">
                  {order.returnAddress?.firstName} {order.returnAddress?.lastName}
                </p>
                <p>{order.returnAddress?.street1}</p>
                <p>
                  {order.returnAddress?.city}, {order.returnAddress?.state} {order.returnAddress?.zip}
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
      />
    </div>
  );
}
