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
} from "lucide-react";
import confetti from "canvas-confetti";
import { detectCardIntent } from "@/lib/card-intent";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";
import { AddressData } from "./Step3EnvelopeAddressing";
import { trackGoogleAdsPurchase } from "@/lib/google-ads";
import { trackMetaPurchase } from "@/lib/meta-ads";

interface Step5ConfirmationProps {
  orderId: string;
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
}

export function Step5Confirmation({
  orderId,
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

    if (orderId) {
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
  }, [orderId, amountInCents, customerEmail, cardTitle, sender.fullName, recipient.city, recipient.state, recipient.zip]);

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
    <div className="max-w-2xl mx-auto space-y-7 pb-24 md:pb-12 animate-in fade-in duration-300">
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

          {/* Stage 2: Queued for Real Ballpoint Inking */}
          <div className="relative flex items-start gap-4">
            <div className="relative z-10 w-8 h-8 rounded-full bg-amber-700 text-white flex items-center justify-center shadow-xs shrink-0 animate-pulse">
              <PenTool className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-950">
                  2. Queued for Real Ballpoint Inking
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                  In Production
                </span>
              </div>
              <p className="text-xs text-stone-600">
                Phoenix Fulfillment Center robotic plotters loaded with genuine ballpoint ink on 120 lb archival cardstock.
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
                Enclosed in 70 lb envelope with authentic USPS stamp. Scheduled for next business day carrier dispatch.
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
                Nationwide transit window (3–5 business days) delivered directly to {recipient.fullName}&apos;s physical mailbox.
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
            <Image src={cardUrl} alt={cardTitle} fill className="object-cover" />
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
