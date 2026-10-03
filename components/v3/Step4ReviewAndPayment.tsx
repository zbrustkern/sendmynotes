"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import {
  Lock,
  ShieldCheck,
  Mail,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Tag,
  Sparkles,
  CheckCircle2,
  X,
  CreditCard,
  Truck,
  Feather,
} from "lucide-react";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";
import { AddressData } from "./Step3EnvelopeAddressing";

export interface AppliedDiscountInfo {
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  discountAmountInCents: number;
  finalAmountInCents: number;
  description?: string;
  isFree: boolean;
}

interface Step4ReviewAndPaymentProps {
  cardTitle: string;
  cardUrl: string;
  salutation: string;
  bodyNote: string;
  signOff: string;
  fontClass: string;
  recipient: AddressData;
  sender: AddressData;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  orderId: string;
  clientSecret: string | null;
  publishableKey: string | null;
  isMock: boolean;
  isFree: boolean;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount: () => void;
  appliedDiscount: AppliedDiscountInfo | null;
  onPaymentSuccess: (orderId: string) => void;
  onBack: () => void;
}

interface InnerPaymentProps {
  cardTitle: string;
  cardUrl: string;
  salutation: string;
  bodyNote: string;
  signOff: string;
  fontClass: string;
  recipient: AddressData;
  sender: AddressData;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  orderId: string;
  isMock: boolean;
  isFree: boolean;
  appliedDiscount: AppliedDiscountInfo | null;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount: () => void;
  onPaymentSuccess: (orderId: string) => void;
  onBack: () => void;
}

function InnerPaymentForm({
  cardTitle,
  cardUrl,
  salutation,
  bodyNote,
  signOff,
  fontClass,
  recipient,
  sender,
  customerEmail,
  onChangeCustomerEmail,
  orderId,
  isMock,
  isFree,
  appliedDiscount,
  onApplyDiscount,
  onRemoveDiscount,
  onPaymentSuccess,
  onBack,
}: InnerPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Promo code toggle & input state
  const [showPromoInput, setShowPromoInput] = useState(Boolean(appliedDiscount));
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const deliveryEstimate = useMemo(() => calculateDeliveryEstimate(), []);

  // Excerpt of handwritten note
  const noteExcerpt = useMemo(() => {
    const combined = [salutation, bodyNote, signOff].filter(Boolean).join(" ");
    if (combined.length <= 110) return combined;
    return combined.slice(0, 110) + "...";
  }, [salutation, bodyNote, signOff]);

  const finalPriceCents = appliedDiscount ? appliedDiscount.finalAmountInCents : 900;
  const isZeroCost = isFree || finalPriceCents === 0;

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setPromoError(null);
    setPromoLoading(true);
    try {
      const res = await onApplyDiscount(promoInput.trim());
      if (!res.success) {
        setPromoError(res.error || "Invalid promo code.");
      } else {
        setPromoInput("");
      }
    } catch {
      setPromoError("Failed to validate promo code.");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerEmail.trim() || !customerEmail.includes("@")) {
      setErrorMessage("Please enter a valid email for your order receipt and USPS tracking.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    // 1. FREE ORDER FLOW
    if (isZeroCost) {
      try {
        const res = await fetch("/api/checkout/complete-free-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            discountCode: appliedDiscount?.code,
            customerEmail,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to process free order.");
        }

        setIsProcessing(false);
        onPaymentSuccess(orderId);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error completing free order";
        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }
    }

    // 2. MOCK / DEV ENVIRONMENT CHECKOUT
    if (isMock || !stripe || !elements) {
      setTimeout(async () => {
        try {
          await fetch("/api/webhooks/stripe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-mock-payment-intent": `pi_mock_${orderId}`,
            },
            body: JSON.stringify({
              type: "payment_intent.succeeded",
              data: {
                object: {
                  id: `pi_mock_${orderId}`,
                  metadata: {
                    orderId,
                    discountCode: appliedDiscount?.code,
                    discountAmountCents: appliedDiscount?.discountAmountInCents,
                  },
                  receipt_email: customerEmail,
                  amount: finalPriceCents,
                  status: "succeeded",
                },
              },
            }),
          });
        } catch (err) {
          console.warn("[Mock Payment] Webhook dispatch notification:", err);
        }

        setIsProcessing(false);
        onPaymentSuccess(orderId);
      }, 1000);
      return;
    }

    // 3. REAL STRIPE PAYMENT CONFIRMATION
    if (!isPaymentElementReady) {
      setErrorMessage("Payment form is loading. Please try again in a moment.");
      setIsProcessing(false);
      return;
    }

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/${orderId}`,
          receipt_email: customerEmail,
        },
        redirect: "if_required",
      });

      if (error) {
        setErrorMessage(error.message || "Payment declined. Please check your card information.");
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        try {
          await fetch("/api/checkout/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              paymentIntentId: paymentIntent.id,
              customerEmail,
            }),
          });
        } catch (confirmErr) {
          console.warn("[Checkout] Notice confirming order:", confirmErr);
        }

        setIsProcessing(false);
        onPaymentSuccess(orderId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment error occurred";
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-28 md:pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-800 text-white font-bold text-xs flex items-center justify-center">
              4
            </span>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Order Review &amp; Verified Payment
            </h1>
          </div>
          <p className="text-xs text-stone-500">
            Confirm your card, envelope addresses, and complete checkout.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit Address</span>
        </button>
      </div>

      {/* COMPACT PHYSICAL SUMMARY CARD */}
      <div className="bg-[#FAF8F5] rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-start gap-4">
          {/* Card thumbnail in true 5:7 vertical proportion */}
          <div className="relative w-16 h-[89px] sm:w-20 sm:h-[112px] rounded-lg overflow-hidden border border-stone-300 shadow-xs shrink-0 bg-stone-100">
            <Image
              src={cardUrl}
              alt={cardTitle}
              fill
              className="object-cover"
            />
          </div>

          {/* Details */}
          <div className="space-y-2 flex-1 min-w-0">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                A2 Folded Stationery Leaf (4.25&quot; × 5.5&quot;)
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900 truncate">
                {cardTitle}
              </h3>
            </div>

            {/* Note Excerpt */}
            <div className="p-2.5 bg-white/80 rounded-xl border border-stone-200 text-xs text-stone-700 italic">
              <span className={`text-stone-900 block ${fontClass}`}>
                &ldquo;{noteExcerpt}&rdquo;
              </span>
            </div>
          </div>
        </div>

        {/* 4-Point Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-stone-200/80 text-xs text-stone-700">
          <div className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-stone-200/70">
            <span className="text-base">📬</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                Deliver To
              </span>
              <span className="font-semibold text-stone-900 block truncate">
                {recipient.fullName || "Recipient"}
              </span>
              <span className="text-stone-500 text-[11px] truncate block">
                {recipient.street1}, {recipient.city}, {recipient.state} {recipient.zip}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-stone-200/70">
            <span className="text-base">✉️</span>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                Return From
              </span>
              <span className="font-semibold text-stone-900 block truncate">
                {sender.fullName || "Sender"}
              </span>
              <span className="text-stone-500 text-[11px] truncate block">
                {sender.city}, {sender.state} {sender.zip}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-stone-200/70">
            <Truck className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 block">
                Est. USPS Arrival
              </span>
              <span className="font-semibold text-stone-900">
                {deliveryEstimate.earliestDate} – {deliveryEstimate.latestDate}
              </span>
              <span className="text-stone-500 text-[10px] block">
                (3–5 business days nationwide)
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/80">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-800 block">
                Total Flat Rate
              </span>
              <span className="text-[11px] text-stone-600">
                Postage &amp; Pen Inking Included
              </span>
            </div>
            <div className="font-serif font-bold text-xl text-stone-950">
              {isZeroCost ? "$0.00 (Free)" : `$${(finalPriceCents / 100).toFixed(2)}`}
            </div>
          </div>
        </div>
      </div>

      {/* CUSTOMER EMAIL INPUT (RECEIPT & TRACKING) */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-xs space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-amber-800" />
          <span>Receipt &amp; USPS Tracking Notification Email</span>
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={customerEmail}
          onChange={(e) => {
            onChangeCustomerEmail(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="your.email@example.com"
          className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
        />
        <p className="text-[11px] text-stone-400">
          Zero accounts or passwords required. We only send your receipt and tracking updates.
        </p>
      </div>

      {/* COLLAPSED PROMO CODE LINK */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs">
        {appliedDiscount ? (
          <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-emerald-800 uppercase px-2 py-0.5 bg-emerald-100 rounded border border-emerald-300">
                {appliedDiscount.code}
              </span>
              <span className="text-emerald-700 font-medium">
                {appliedDiscount.isFree
                  ? "100% Free Order"
                  : appliedDiscount.type === "PERCENTAGE"
                  ? `${appliedDiscount.value}% Off`
                  : `-$${(appliedDiscount.discountAmountInCents / 100).toFixed(2)} Off`}
              </span>
            </div>
            <button
              type="button"
              onClick={onRemoveDiscount}
              className="p-1 text-stone-400 hover:text-rose-600 transition"
              title="Remove code"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : showPromoInput ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value.toUpperCase());
                  if (promoError) setPromoError(null);
                }}
                placeholder="PROMO CODE"
                maxLength={25}
                className="flex-1 px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl font-mono font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoInput.trim()}
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {promoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
              </button>
            </div>
            {promoError && (
              <p className="text-[11px] text-rose-600 font-medium">{promoError}</p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPromoInput(true)}
            className="text-xs text-amber-800 hover:text-amber-950 font-semibold flex items-center gap-1 transition cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>+ Have a voucher or promo code?</span>
          </button>
        )}
      </div>

      {/* PAYMENT CONTAINER */}
      {isZeroCost ? (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>100% Free Order Voucher</span>
          </div>
          <p className="text-xs text-emerald-800 leading-relaxed">
            Your card, real ballpoint inking, and USPS postage are completely covered by voucher{" "}
            <strong className="font-mono">{appliedDiscount?.code}</strong>. Zero billing info needed.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Apple Pay, Google Pay &amp; Card</span>
            </span>
            <span className="text-[10px] text-stone-400">256-bit Encrypted</span>
          </div>

          {isMock || !elements ? (
            <div className="p-4 bg-amber-50/60 border border-amber-200/70 rounded-xl space-y-2 text-xs text-stone-700">
              <div className="flex items-center justify-between text-amber-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  Dev &amp; Sandbox Verified Checkout Active
                </span>
                <span className="bg-amber-200/70 text-amber-900 text-[10px] uppercase font-mono px-2 py-0.5 rounded">
                  Sandbox
                </span>
              </div>
              <p className="text-[11px] text-stone-600">
                Test checkout enabled. Clicking &quot;Authorize &amp; Send Card&quot; simulates end-to-end payment and fulfillment dispatch.
              </p>
            </div>
          ) : (
            <div className="min-h-[140px] flex flex-col justify-center">
              {!isPaymentElementReady && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-stone-400 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                  <span>Loading secure Stripe payment fields...</span>
                </div>
              )}
              <PaymentElement
                id="v3-payment-element"
                options={{ layout: "tabs" }}
                onReady={() => setIsPaymentElementReady(true)}
                onLoadError={(err) => {
                  console.error("[Stripe Load Error]", err);
                  setErrorMessage(err.error?.message || "Could not load payment form.");
                }}
              />
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* SECURITY BADGES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-stone-600">
        <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200/70">
          <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
          <div>
            <span className="font-semibold text-stone-900 block">256-Bit SSL Encryption</span>
            <span className="text-[11px] text-stone-500">Bank-grade security via Stripe</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-xl border border-stone-200/70">
          <Feather className="w-4 h-4 text-amber-700 shrink-0" />
          <div>
            <span className="font-semibold text-stone-900 block">100% Satisfaction Guarantee</span>
            <span className="text-[11px] text-stone-500">Real ballpoint inking or free re-mail</span>
          </div>
        </div>
      </div>

      {/* DESKTOP ADVANCE BAR */}
      <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Back to Addressing</span>
        </button>

        <button
          type="submit"
          disabled={isProcessing || (!isZeroCost && !isMock && !isPaymentElementReady)}
          className="px-8 py-3.5 bg-stone-900 hover:bg-black disabled:bg-stone-300 text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              <span>Verifying &amp; Authorizing Order...</span>
            </>
          ) : (
            <>
              <span>
                {isZeroCost
                  ? "Complete Free Order →"
                  : `Authorize & Send Card ($${(finalPriceCents / 100).toFixed(2)}) →`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg flex items-center justify-between gap-3 safe-area-inset-bottom">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Address</span>
        </button>

        <button
          type="submit"
          disabled={isProcessing || (!isZeroCost && !isMock && !isPaymentElementReady)}
          className="px-5 py-2.5 bg-stone-900 hover:bg-black disabled:bg-stone-300 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <span>
                {isZeroCost
                  ? "Complete Order (Free) →"
                  : `Pay $${(finalPriceCents / 100).toFixed(2)} →`}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export function Step4ReviewAndPayment(props: Step4ReviewAndPaymentProps) {
  const stripePromise = useMemo(() => {
    return props.publishableKey ? loadStripe(props.publishableKey) : null;
  }, [props.publishableKey]);

  if (props.clientSecret && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: props.clientSecret,
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: "#B45309",
              colorBackground: "#FFFFFF",
              colorText: "#1C1917",
              borderRadius: "12px",
            },
          },
        }}
      >
        <InnerPaymentForm {...props} />
      </Elements>
    );
  }

  return <InnerPaymentForm {...props} isMock={true} />;
}
