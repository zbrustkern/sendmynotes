"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
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
  Bell,
  Check,
  Loader2,
  Calendar,
  Copy,
  Share2,
} from "lucide-react";
import confetti from "canvas-confetti";
import { detectCardIntent } from "@/lib/card-intent";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";
import { AddressData } from "./Step3EnvelopeAddressing";
import { trackGoogleAdsPurchase } from "@/lib/google-ads";
import { trackMetaPurchase } from "@/lib/meta-ads";

interface Step5ConfirmationProps {
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
}

export function Step5Confirmation({
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
}: Step5ConfirmationProps) {
  const deliveryEstimate = useMemo(() => calculateDeliveryEstimate(), []);

  // Launch celebration confetti and fire purchase conversions on mount
  useEffect(() => {
    try {
      confetti({
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

    // Emit final purchase marketing events only when order is verified (not reconciling)
    const isReconciling = fulfillmentStatus === "RECONCILING";
    if (orderId && !isReconciling) {
      trackGoogleAdsPurchase({
        orderId,
        amountInCents: amountInCents || 900,
        customerEmail,
        itemName: cardTitle,
      });
      trackMetaPurchase({
        orderId,
        value: amountInCents ? amountInCents / 100 : 9.0,
        customerEmail,
        customerName: sender.fullName,
        recipientCity: recipient.city,
        recipientState: recipient.state,
        recipientZip: recipient.zip,
        itemName: cardTitle,
      });
    }
  }, [orderId, viewToken, fulfillmentStatus, amountInCents, customerEmail, cardTitle, sender.fullName, recipient.city, recipient.state, recipient.zip]);

  // Occasion intent classification
  const intentConfig = useMemo(() => {
    return detectCardIntent({
      occasion,
      printedMessage: "",
      handwrittenNote: [salutation, bodyNote, signOff].filter(Boolean).join("\n\n"),
      recipientAddress: {
        firstName: recipient.fullName.split(" ")[0] || "Recipient",
        lastName: recipient.fullName.split(" ").slice(1).join(" ") || "",
        street1: recipient.street1,
        city: recipient.city,
        state: recipient.state,
        zip: recipient.zip,
      },
    });
  }, [occasion, salutation, bodyNote, signOff, recipient]);

  // Deferred Address State & Magic Link Helpers
  const isDeferred = Boolean(isAddressDeferred || !recipient.street1?.trim());

  const magicLinkUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sendmynotes.com";
    return `${origin}/orders/${orderId}/complete-address?token=${encodeURIComponent(viewToken || "")}`;
  }, [orderId, viewToken]);

  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(magicLinkUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      // fallback
    }
  };

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
      handleCopyLink();
    }
  };

  // Retention Reminder State
  const [reminderSaved, setReminderSaved] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(false);

  const handleSaveReminder = async () => {
    if (!customerEmail) return;
    setReminderLoading(true);

    try {
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: recipient.fullName,
          userEmail: customerEmail,
          occasionType: intentConfig.defaultOccasionType,
          occasionTitle: intentConfig.defaultOccasionTitle,
          month: intentConfig.suggestedMonth,
          day: intentConfig.suggestedDay,
          remindDaysBefore: intentConfig.interactionMode === "care_checkin" ? 0 : 14,
          orderId,
          recipientAddress: {
            firstName: recipient.fullName.split(" ")[0] || "Recipient",
            lastName: recipient.fullName.split(" ").slice(1).join(" ") || "",
            street1: recipient.street1,
            street2: recipient.street2,
            city: recipient.city,
            state: recipient.state,
            zip: recipient.zip,
          },
        }),
      });

      if (res.ok) {
        setReminderSaved(true);
      }
    } catch (err) {
      console.warn("Notice saving reminder:", err);
    } finally {
      setReminderLoading(false);
    }
  };

  return (
    <div className="max-w-4xl lg:max-w-5xl mx-auto space-y-7 pb-24 md:pb-12 animate-in fade-in duration-300">
      {/* CELEBRATION HERO BANNER */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200/90 shadow-sm text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            Order Confirmed &amp; Queued
          </span>
          <h1 className="font-serif font-bold text-2xl sm:text-3xl text-stone-900 tracking-tight">
            Your Handwritten Card is in Motion
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
            Receipt dispatched to <strong className="text-stone-900">{customerEmail}</strong>.
            {orderId && (
              <span className="block text-[11px] font-mono text-stone-400 mt-1">
                Order #{orderId}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* DEFERRED ADDRESS HIGH-AFFORDANCE LINK DELIVERY CARD */}
      {isDeferred && (
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

          {/* Magic Link URL Display Box */}
          <div className="p-3 bg-white/95 rounded-2xl border border-amber-300 shadow-2xs space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
              Your Unique Address Magic Link:
            </span>
            <input
              type="text"
              readOnly
              value={magicLinkUrl}
              onFocus={(e) => e.target.select()}
              className="w-full text-xs font-mono bg-stone-50 text-stone-900 border border-stone-200 rounded-xl px-3 py-2.5 select-all focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
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
              <Share2 className="w-4 h-4 text-amber-700" />
              <span>Share / Text Link to Myself</span>
            </button>

            <a
              href={magicLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 text-center shrink-0"
            >
              <span>Open &rarr;</span>
            </a>
          </div>

          <p className="text-[11px] text-stone-500 leading-relaxed">
            As soon as the mailing address is entered, your card is automatically released to our Phoenix studio robotic pen plotters and mailed via USPS First-Class.
          </p>
        </div>
      )}

      {/* 4-STAGE FULFILLMENT STEPPER */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200/90 shadow-sm space-y-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 border-b border-stone-100 pb-3">
          Real-Time Fulfillment Stepper
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
                  1. Payment Confirmed (${(amountInCents / 100).toFixed(2)})
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                  Complete
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Payment verified securely. Flat rate card, pen inking, and First-Class USPS postage paid in full.
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
                  2. {isDeferred ? "Awaiting Recipient Address" : fulfillmentStatus === "MAILED" ? "Inked & Mailed" : "Real Ballpoint Inking"}
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                  {isDeferred
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
                {isDeferred
                  ? "Order verified and held safely in queue. Robotic pen fulfillment begins as soon as you enter the recipient address."
                  : fulfillmentStatus === "QUEUED_FOR_FULFILLMENT"
                  ? "Order verified and queued for robotic pen fulfillment at Phoenix studio."
                  : "Phoenix Fulfillment Center robotic plotters loaded with genuine ballpoint ink on quality folded cardstock."}
              </p>
            </div>
          </div>

          {/* Stage 3: USPS First-Class Stamped */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 w-8 h-8 rounded-full bg-stone-100 text-stone-400 border border-stone-300 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-stone-700">
                3. USPS First-Class Stamped
              </span>
              <p className="text-xs text-stone-500">
                Enclosed in a matching envelope with an authentic USPS stamp. Typically prepared in 1–2 business days.
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
                4. Estimated USPS Arrival: {deliveryEstimate.earliestDate} – {deliveryEstimate.latestDate}
              </span>
              <p className="text-xs text-stone-500">
                Typically 2–7 business days domestic transit delivered directly to {recipient.fullName}&apos;s physical mailbox. Timing is estimated, not guaranteed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* OCCASION-TAILORED RETENTION PROMPT (1-CLICK ANNUAL REMINDER) */}
      <div className="bg-amber-50/70 rounded-3xl p-6 sm:p-7 border border-amber-200/90 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{intentConfig.badgeEmoji}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
            {intentConfig.badgeLabel}
          </span>
        </div>

        <h3 className="font-serif font-bold text-base sm:text-lg text-stone-900">
          {intentConfig.headline}
        </h3>

        <p className="text-xs text-stone-600 leading-relaxed">
          {intentConfig.description}
        </p>

        {reminderSaved ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{intentConfig.successTitle} — {intentConfig.successDescription}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSaveReminder}
            disabled={reminderLoading}
            className="w-full sm:w-auto px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {reminderLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span>{intentConfig.primaryButtonLabel} (1-Click Opt-In)</span>
          </button>
        )}
      </div>

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
          <span className="font-bold text-stone-900 text-sm">$9.00</span>
          <span className="text-[10px] text-emerald-700 font-semibold block">Paid</span>
        </div>
      </div>

      {/* PROTECTED GUEST RECEIPT LINK */}
      {viewToken && (
        <div className="flex justify-center -mt-2">
          <a
            href={`/order/${orderId}?viewToken=${viewToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-amber-900 hover:text-amber-950 font-medium underline underline-offset-2 flex items-center gap-1.5 transition"
          >
            <span>View protected guest receipt</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

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
