"use client";

import { deferredAddressPath } from "@/lib/order-tracking-links";
import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  PenTool,
  Mail,
  Truck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Feather,
  Check,
  Copy,
  Share2,
} from "lucide-react";
import confetti from "canvas-confetti";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";
import { AddressData, isInternationalCountry } from "./Step3EnvelopeAddressing";
import { cancelGoogleAdsPurchaseRetries, hasGoogleAdsCheckoutProof, purchaseConsentAllowed, trackGoogleAdsPurchase } from "@/lib/google-ads";
import { trackMetaPurchase } from "@/lib/meta-ads";
import { MultiSendOrderStatus } from "@/components/multi-send/MultiSendOrderStatus";
import { CopyPrivateOrderLink } from "@/components/CopyPrivateOrderLink";
import { isCustomerPurchaseOrder } from "@/lib/customer-purchase-classification";
import type { MultiSendView } from "@/lib/multi-send/presentation";
import type { Order } from "@/lib/types";

interface Step5ConfirmationProps {
  cardQuantity?: number;
  orderId: string;
  viewToken?: string | null;
  fulfillmentStatus?: string;
  cardTitle: string;
  cardUrl: string;
  occasion: string;
  salutation: string;
  bodyNote: string;
  signOff: string;
  fontClass: string;
  recipient: AddressData;
  sender: AddressData;
  customerEmail: string;
  amountInCents: number;
  onSendAnotherCard: () => void;
  isAddressDeferred?: boolean;
  isPreviewHold?: boolean;
}

export function Step5Confirmation({
  cardQuantity = 1,
  orderId,
  viewToken,
  fulfillmentStatus,
  cardTitle,
  cardUrl,
  occasion,
  salutation,
  bodyNote,
  signOff,
  fontClass,
  recipient,
  sender,
  customerEmail,
  amountInCents,
  onSendAnotherCard,
  isAddressDeferred = false,
  isPreviewHold = false,
}: Step5ConfirmationProps) {
  const [batchOrder, setBatchOrder] = useState<(Order & {multiSendView: MultiSendView}) | null>(null);
  const [privateReadToken, setPrivateReadToken] = useState<string | null>(null);
  const [magicLinkFallback, setMagicLinkFallback] = useState("");
  const deliveryEstimate = useMemo(() => calculateDeliveryEstimate(), []);
  const isInternational = isInternationalCountry(recipient.country);
  const isPreviewHoldActive = isPreviewHold && isInternational;

  // Launch celebration confetti and fire purchase conversions on mount
  useEffect(() => {
    try {
      if (!isPreviewHoldActive) confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#B45309", "#059669", "#D97706", "#F59E0B"],
      });
    } catch {
      // ignore
    }

    if (orderId && viewToken && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`order_token_${orderId}`, viewToken);
      } catch {
        // ignore
      }
    }

    // Conversion reporting requires the same order-specific proof as the submitted checkout.
    const isReconciling = fulfillmentStatus === "RECONCILING";
    let cancelled = false;
    if (orderId && viewToken) {
      void fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        headers: { "x-view-token": viewToken },
        cache: "no-store",
      }).then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (cancelled || !data?.order) return;
          if (typeof data.readToken === "string" && data.readToken) setPrivateReadToken(data.readToken);
          const order = data.order as Order & { multiSendView?: MultiSendView };
          if (cardQuantity > 1 && order.multiSendView && !order.multiSendView.redacted) {
            setBatchOrder(order as Order & { multiSendView: MultiSendView });
          }
          if (isReconciling || isPreviewHoldActive || data.accessKind !== "checkout" || !hasGoogleAdsCheckoutProof(orderId) || order.purchaseMeasurement?.transactionId !== orderId || !order.purchaseMeasurement?.eligible || !purchaseConsentAllowed(order.attribution) || !isCustomerPurchaseOrder(order) || order.status === "PENDING_PAYMENT" || order.isInternationalPreview || order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD") return;
          if (order.purchaseMeasurement) {
            trackGoogleAdsPurchase({ orderId, measurement: order.purchaseMeasurement, consent: order.attribution });
          }
          try {
            trackMetaPurchase({
              orderId: order.id,
              itemCount: order.purchaseMeasurement?.itemCount || order.multiSendView?.quantity || 1,
              value: order.purchaseMeasurement.amountInCents / 100,
              customerEmail: order.customerEmail,
              customerName: order.returnAddress?.firstName ? `${order.returnAddress.firstName} ${order.returnAddress.lastName || ""}`.trim() : undefined,
              recipientCity: order.recipientAddress?.city,
              recipientState: order.recipientAddress?.state,
              recipientZip: order.recipientAddress?.zip,
              itemName: order.occasion ? `${order.occasion} Card` : undefined,
            });
          } catch { /* independent destination must not affect confirmation */ }
        })
        .catch(() => { /* order access and conversion delivery must not affect confirmation */ });
    }
    return () => {
      cancelled = true;
      if (orderId) cancelGoogleAdsPurchaseRetries(orderId);
    };
  }, [orderId, viewToken, fulfillmentStatus, cardQuantity, isPreviewHoldActive]);

  // Deferred Address State & Magic Link Helpers
  const isDeferred = Boolean(isAddressDeferred || !recipient.street1?.trim());

  const magicLinkUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sendmynotes.com";
    return viewToken ? `${origin}${deferredAddressPath(orderId, viewToken)}` : "";
  }, [orderId, viewToken]);

  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = magicLinkUrl;
    setMagicLinkFallback("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      setMagicLinkFallback(url);
    }
  };

  const [shareCopied, setShareCopied] = useState(false);

  const handleShareLink = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "SendMyNotes - Add Recipient Address",
          text: `Add mailing address for ${recipient.fullName || "recipient"}'s card (Order #${orderId}):`,
          url: magicLinkUrl,
        });
      } catch {
        // user cancelled share
      }
    } else {
      setMagicLinkFallback("");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(magicLinkUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 3000);
      } catch {
        setMagicLinkFallback(magicLinkUrl);
      }
    }
  };

  if (cardQuantity > 1) return (
    <div className="max-w-4xl mx-auto space-y-5">
      <CopyPrivateOrderLink orderId={orderId} readToken={privateReadToken} />
      {batchOrder
        ? <MultiSendOrderStatus order={batchOrder} view={batchOrder.multiSendView} />
        : <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6"><h1 className="font-serif text-3xl">Your order is being confirmed</h1><p className="text-sm text-stone-600">Your {cardQuantity} purchased cards and their individual status are available on the private order page.</p></section>}
    </div>
  );

  return (
    <div className="max-w-4xl lg:max-w-5xl mx-auto space-y-7 pb-24 md:pb-12 animate-in fade-in duration-300">
      {/* CELEBRATION HERO BANNER */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/90 shadow-sm text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            {isPreviewHoldActive ? "International Staging Test · Held" : "Order Confirmed & Queued"}
          </span>
          <h1 className="font-serif font-bold text-2xl sm:text-3xl text-stone-900 tracking-tight">
            {isPreviewHoldActive ? "Test checkout recorded; nothing is being mailed" : "Your Handwritten Card is in Motion"}
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
            {isPreviewHoldActive
              ? "No real charge or receipt email was sent. This staging preview is held; nothing will be printed, fulfilled, or mailed."
              : customerEmail ? <>Your order is confirmed. Receipt emails and available mailing updates will go to <strong className="text-stone-900">{customerEmail}</strong>.</> : <>No email receipt requested. Use this secure order page to check your status; no email updates will be sent.</>}
            {orderId && (
              <span className="block text-[11px] font-mono text-stone-400 mt-1">
                Order #{orderId}
              </span>
            )}
          </p>
        </div>
      </div>

      <CopyPrivateOrderLink orderId={orderId} readToken={privateReadToken} />

      {/* DEFERRED ADDRESS HIGH-AFFORDANCE LINK DELIVERY CARD */}
      {isDeferred && magicLinkUrl && !isPreviewHoldActive && (
        <div className="bg-gradient-to-br from-amber-50 via-orange-50/70 to-yellow-50 rounded-3xl p-6 sm:p-7 border-2 border-amber-400 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-pulse shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-950 bg-amber-200/80 border border-amber-300 px-2.5 py-0.5 rounded-full">
              Action Required: Add Recipient Address
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="font-serif font-bold text-xl sm:text-2xl text-stone-900">
              Your Card is Locked In &amp; Held in Queue
            </h2>
            <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
              Whenever you have {recipient.fullName || "their"}&apos;s street address handy, use your personal magic link below to enter it. We&apos;ve also emailed this link to <strong className="text-stone-900">{customerEmail}</strong>.
            </p>
          </div>

          {/* 1-Tap Action Buttons: Copy Link & Share / Text Link to Myself */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-5 py-3 bg-amber-800 hover:bg-amber-900 active:bg-amber-950 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer flex-1"
            >
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />
                  <span>Magic Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Magic Link</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareLink}
              className="px-5 py-3 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-800 font-bold text-xs sm:text-sm rounded-xl border border-stone-300 shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer flex-1"
            >
              {shareCopied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-amber-700" />
                  <span>Copy to Share</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.open(magicLinkUrl, "_blank", "noopener,noreferrer")}
              className="px-4 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 text-center shrink-0"
            >
              <span>Open &rarr;</span>
            </button>
          </div>

          {magicLinkFallback && (
            <div className="rounded-xl border border-amber-300 bg-white p-3 space-y-1.5">
              <label htmlFor={`deferred-address-link-${orderId}`} className="block text-[11px] font-semibold text-stone-700">Select and copy this address-completion link:</label>
              <input
                id={`deferred-address-link-${orderId}`}
                type="text"
                readOnly
                value={magicLinkFallback}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[11px] text-stone-900"
              />
            </div>
          )}

          <p className="text-[11px] text-stone-500 leading-relaxed">
            As soon as the mailing address is entered, your card is automatically released to our Phoenix studio robotic pen plotters and mailed via USPS First-Class.
          </p>
        </div>
      )}

      {/* 4-STAGE FULFILLMENT STEPPER */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 border-b border-stone-100 pb-3">
          {isPreviewHoldActive ? "International Preview Status" : "Real-Time Fulfillment Stepper"}
        </h2>

        <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
          {/* Stage 1: Payment Confirmed */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Check className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-900">
                  {isPreviewHoldActive ? `1. Test payment recorded ($${(amountInCents / 100).toFixed(2)})` : `1. Payment Confirmed ($${(amountInCents / 100).toFixed(2)})`}
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  {isPreviewHoldActive ? "Test mode" : "Complete"}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {isPreviewHoldActive ? "No real charge occurred. This order is held for staging review." : isInternational ? "Payment verified securely. Card, pen inking, and international mailing paid in full." : "Payment verified securely. Flat rate card, pen inking, and First-Class USPS postage paid in full."}
              </p>
            </div>
          </div>

          {/* Stage 2: Real Ballpoint Inking (Dynamic fulfillment state) */}
          <div className="relative flex items-start gap-4">
            <div className={`relative z-10 w-8 h-8 rounded-full ${isDeferred ? "bg-amber-600" : "bg-amber-700"} text-white flex items-center justify-center shadow-xs shrink-0 ${isDeferred ? "" : "animate-pulse"}`}>
              {isDeferred ? <Clock className="w-4 h-4" /> : <PenTool className="w-4 h-4" />}
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-950">
                  2. {isPreviewHoldActive ? "Held in staging" : isDeferred ? "Awaiting Recipient Address" : fulfillmentStatus === "MAILED" ? "Inked & Mailed" : "Real Ballpoint Inking"}
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                  {isPreviewHoldActive ? "No fulfillment"
                    : isDeferred
                    ? "Held in Queue"
                    : fulfillmentStatus === "MAILED"
                    ? "Mailed"
                    : fulfillmentStatus === "PROCESSING_HANDWRYTTEN"
                    ? "In Production"
                    : fulfillmentStatus === "QUEUED_FOR_FULFILLMENT"
                    ? "Queued for Fulfillment"
                    : "Payment Received"}
                </span>
              </div>
              <p className="text-xs text-stone-600">
                {isPreviewHoldActive ? "No card was printed or sent to fulfillment."
                  : isDeferred
                  ? "Order verified and held safely in queue. Robotic pen fulfillment begins as soon as you enter the recipient address."
                  : fulfillmentStatus === "QUEUED_FOR_FULFILLMENT"
                  ? "Order verified and queued for robotic pen fulfillment at Phoenix studio."
                  : "Phoenix Fulfillment Center robotic plotters loaded with genuine ballpoint ink on quality folded cardstock."}
              </p>
            </div>
          </div>

          {/* Stage 3: mailing */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 w-8 h-8 rounded-full bg-stone-100 text-stone-400 border border-stone-300 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-stone-700">
                {isPreviewHoldActive ? "3. Mailing not started" : isInternational ? "3. Mailing" : "3. USPS First-Class Stamped"}
              </span>
              <p className="text-xs text-stone-500">
                {isPreviewHoldActive ? "No postage or shipment was created for this staging test." : isInternational ? "Delivery timing varies by destination. Preparation and transit are separate." : "Enclosed in an envelope with an authentic USPS stamp. Typically prepared in 1–2 business days."}
              </p>
            </div>
          </div>

          {/* Stage 4: Estimated Arrival */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 w-8 h-8 rounded-full bg-stone-100 text-stone-400 border border-stone-300 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-stone-700">
                {isPreviewHoldActive ? "4. Delivery not scheduled" : isInternational ? "4. Delivery timing varies by destination" : `4. Estimated USPS Arrival: ${deliveryEstimate.earliestDate} – ${deliveryEstimate.latestDate}`}
              </span>
              <p className="text-xs text-stone-500">
                {isPreviewHoldActive ? "No delivery estimate applies because this preview is not being mailed." : isInternational ? `Transit time depends on the destination for ${recipient.fullName}.` : `Typically 2–7 business days domestic transit delivered directly to ${recipient.fullName}'s physical mailbox. Timing is estimated, not guaranteed.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {!isPreviewHoldActive && <div className="bg-amber-50/70 rounded-3xl p-6 sm:p-7 border border-amber-200/90 shadow-xs space-y-3">
        <h3 className="font-serif font-bold text-base sm:text-lg text-stone-900">Remember a date for next time</h3>
        <p className="text-xs text-stone-600 leading-relaxed">No occasion reminder was set from this order. If you’d like to keep a date in your account, add it to Dates &amp; reminders. You can choose whether to opt in there.</p>
        <Link href="/account/dates" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-800 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-900">Manage dates &amp; reminders</Link>
      </div>}

      {/* SUMMARY RECAP CARD */}
      <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-12 h-16 rounded-lg overflow-hidden border border-stone-200 shrink-0 bg-stone-100">
            <Image
              src={cardUrl}
              alt={cardTitle}
              fill
              unoptimized={Boolean(cardUrl?.startsWith("data:"))}
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-serif font-bold text-stone-900 truncate">{cardTitle}</p>
            <p className="text-stone-500 truncate">To: {recipient.fullName}</p>
            <p className="text-stone-500 truncate">From: {sender.fullName}</p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="font-bold text-stone-900 text-sm">${(amountInCents / 100).toFixed(2)}</span>
          <span className="text-[10px] text-emerald-700 font-semibold block">{isPreviewHoldActive ? "Test mode" : "Paid"}</span>
        </div>
      </div>

      {/* CTA: SEND ANOTHER CARD */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onSendAnotherCard}
          className="w-full sm:w-auto px-8 py-3.5 bg-stone-900 hover:bg-black text-white font-semibold rounded-2xl text-sm transition shadow-sm inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Send Another Card →</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-[11px] text-stone-400 mt-2">
          Your return address is saved and will be prefilled for your next card.
        </p>
      </div>
    </div>
  );
}
