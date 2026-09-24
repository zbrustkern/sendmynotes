"use client";

import React, { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Lock,
  ShieldCheck,
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
  Tag,
  Sparkles,
  CheckCircle2,
  X,
} from "lucide-react";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";

export interface AppliedDiscountInfo {
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  discountAmountInCents: number;
  finalAmountInCents: number;
  description?: string;
  isFree: boolean;
}

interface CheckoutStepProps {
  orderId: string;
  clientSecret: string | null;
  publishableKey?: string | null;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  onSuccess: (orderId: string) => void;
  isMock: boolean;
  scheduledSendDate?: string;
  appliedDiscount?: AppliedDiscountInfo | null;
  onApplyDiscount?: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount?: () => void;
  isFree?: boolean;
}

function InnerPaymentForm({
  orderId,
  customerEmail,
  onChangeCustomerEmail,
  onSuccess,
  isMock,
  scheduledSendDate,
  appliedDiscount,
  onApplyDiscount,
  onRemoveDiscount,
  isFree,
}: CheckoutStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Promo code input state
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const deliveryEstimate = React.useMemo(
    () => calculateDeliveryEstimate(scheduledSendDate),
    [scheduledSendDate]
  );

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim() || !onApplyDiscount) return;
    setPromoError(null);
    setPromoLoading(true);
    try {
      const res = await onApplyDiscount(promoInput.trim());
      if (!res.success) {
        setPromoError(res.error || "Invalid code.");
      } else {
        setPromoInput("");
      }
    } catch {
      setPromoError("Failed to apply promo code.");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim() || !customerEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address for your order receipt.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    // 1. FREE ORDER FLOW (100% Covered by Promo Code)
    if (isFree || (appliedDiscount && appliedDiscount.finalAmountInCents === 0)) {
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
          throw new Error(data.error || "Failed to complete free order.");
        }

        setIsProcessing(false);
        onSuccess(orderId);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error completing free order";
        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }
    }

    // 2. MOCK MODE CHECKOUT (Development/Sandbox)
    if (isMock || !stripe || !elements) {
      setTimeout(async () => {
        try {
          // Trigger the mock webhook execution on server for end-to-end flow
          const webhookRes = await fetch("/api/webhooks/stripe", {
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
                  amount: appliedDiscount ? appliedDiscount.finalAmountInCents : 900,
                  status: "succeeded",
                },
              },
            }),
          });
          const webhookData = await webhookRes.json();
          console.log("[Mock Checkout] Webhook simulation returned:", webhookData);
        } catch (err) {
          console.warn("[Mock Checkout] Webhook simulation notice:", err);
        }
        setIsProcessing(false);
        onSuccess(orderId);
      }, 1200);
      return;
    }

    // 3. REAL STRIPE CHECKOUT
    if (!isPaymentElementReady) {
      setErrorMessage("Payment form is still loading. Please try again in a moment.");
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
        setErrorMessage(error.message || "Payment failed. Please check your card info.");
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
          console.warn("[Checkout] Notice calling confirm-order fallback:", confirmErr);
        }
        setIsProcessing(false);
        onSuccess(orderId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment error occurred";
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  const finalPriceCents = appliedDiscount ? appliedDiscount.finalAmountInCents : 900;
  const discountCents = appliedDiscount ? appliedDiscount.discountAmountInCents : 0;
  const isZeroCost = isFree || finalPriceCents === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Customer Email Input */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-2 flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-stone-500" />
          Receipt &amp; Tracking Delivery Email
        </label>
        <input
          type="email"
          required
          value={customerEmail}
          onChange={(e) => {
            onChangeCustomerEmail(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
          placeholder="your.email@example.com"
          className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
        />
        <p className="text-[11px] text-stone-400 mt-1">
          Zero accounts or passwords required. We only send your receipt and USPS tracking updates.
        </p>
      </div>

      {/* PROMO / DISCOUNT CODE SECTION */}
      <div className="bg-stone-50/80 p-3.5 rounded-xl border border-stone-200 space-y-2.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-600" />
            Promo or Voucher Code
          </span>
          {appliedDiscount && (
            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Code Applied
            </span>
          )}
        </label>

        {appliedDiscount ? (
          <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-emerald-800 uppercase px-2 py-0.5 bg-emerald-100/80 rounded border border-emerald-300">
                {appliedDiscount.code}
              </span>
              <span className="text-emerald-700 font-medium">
                {appliedDiscount.isFree
                  ? "100% Free Order"
                  : appliedDiscount.type === "PERCENTAGE"
                  ? `${appliedDiscount.value}% Off (-$${(discountCents / 100).toFixed(2)})`
                  : `-$${(discountCents / 100).toFixed(2)} Off`}
              </span>
            </div>
            {onRemoveDiscount && (
              <button
                type="button"
                onClick={onRemoveDiscount}
                className="text-stone-400 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                title="Remove discount code"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value.toUpperCase());
                if (promoError) setPromoError(null);
              }}
              placeholder="e.g. LAUNCH100"
              maxLength={25}
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg font-mono font-semibold uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={handleApplyPromo}
              disabled={promoLoading || !promoInput.trim()}
              className="px-3.5 py-1.5 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              {promoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
            </button>
          </div>
        )}

        {promoError && (
          <p className="text-[11px] text-rose-600 font-medium animate-in fade-in duration-150">
            {promoError}
          </p>
        )}
      </div>

      {/* PAYMENT METHOD SECTION */}
      {isZeroCost ? (
        /* VIP Free Order Voucher Presentation (No Credit Card Required) */
        <div className="p-4 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>100% Free Order Covered by Promo Code</span>
          </div>
          <p className="text-xs text-emerald-800 leading-relaxed">
            Your card and robotic pen postage are completely covered by voucher{" "}
            <strong className="font-mono">{appliedDiscount?.code}</strong>. No payment card or billing information is required.
          </p>
          <div className="pt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Mailed via USPS First Class with archival ink robotic plotting.</span>
          </div>
        </div>
      ) : (
        /* Real Stripe Elements or Mock Payment Container */
        <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200">
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-emerald-600" />
              Secure Card Payment
            </span>
            <span className="text-[10px] text-stone-400">256-bit Encrypted</span>
          </label>

          {isMock || !elements ? (
            <div className="p-3 bg-white border border-stone-200 rounded-lg text-xs space-y-1.5 text-stone-600">
              <div className="flex items-center justify-between text-amber-700 font-medium">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Test Mode Active
                </span>
                <span className="bg-amber-100 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                  Dev / Test
                </span>
              </div>
              <p className="text-[11px] text-stone-500 leading-normal">
                Stripe test mode active. Clicking &quot;Send Handwritten Card&quot; will process your order and dispatch the robotic pen fulfillment pipeline immediately.
              </p>
            </div>
          ) : (
            <div className="min-h-[140px] flex flex-col justify-center">
              {!isPaymentElementReady && (
                <div className="flex flex-col items-center justify-center py-8 gap-2.5 text-stone-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                  <span>Loading secure Stripe payment fields...</span>
                </div>
              )}
              <PaymentElement
                id="payment-element"
                options={{
                  layout: "tabs",
                }}
                onReady={() => setIsPaymentElementReady(true)}
                onLoadError={(err) => {
                  console.error("[Stripe Load Error]", err);
                  setErrorMessage(
                    err.error?.message ||
                      "Could not load payment fields. If using an ad-blocker, please disable it for Stripe checkout."
                  );
                }}
              />
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200/90 text-rose-900 text-xs rounded-xl flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Flat Rate Total Box with Delivery Window & Discount Line */}
      <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-2">
        <div className="flex justify-between text-xs text-stone-600">
          <span>5×7 Heavy Cardstock &amp; Robot Pen</span>
          <span>$8.00</span>
        </div>
        <div className="flex justify-between text-xs text-stone-600">
          <span>USPS First Class Stamp &amp; Envelope</span>
          <span>$1.00</span>
        </div>

        {discountCents > 0 && (
          <div className="flex justify-between text-xs text-emerald-700 font-semibold pt-1 border-t border-amber-200/40">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              Discount ({appliedDiscount?.code})
            </span>
            <span>-${(discountCents / 100).toFixed(2)}</span>
          </div>
        )}

        <div className="pt-2 border-t border-amber-200/60 flex justify-between items-baseline font-bold text-stone-900">
          <span className="text-sm">Total Due</span>
          <span className="text-xl text-amber-950 font-serif">
            {isZeroCost ? (
              <span className="text-emerald-700 font-bold">$0.00 (Free)</span>
            ) : (
              `$${(finalPriceCents / 100).toFixed(2)}`
            )}
          </span>
        </div>

        {/* Estimated Arrival Line */}
        <div className="pt-2 border-t border-amber-200/40 flex items-center justify-between text-[11px] text-amber-900/90 font-medium">
          <span className="flex items-center gap-1">
            <span>📬</span> Est. USPS Arrival:
          </span>
          <span className="font-bold text-stone-900">
            {deliveryEstimate.earliestDate} – {deliveryEstimate.latestDate}
          </span>
        </div>
      </div>

      {/* Order Confirmation Primary Action Button */}
      <button
        type="submit"
        disabled={isProcessing || (!isZeroCost && !isMock && !isPaymentElementReady)}
        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-500 text-white font-bold text-base shadow-xl hover:shadow-2xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing &amp; Inking Card...</span>
          </>
        ) : !isZeroCost && !isMock && !isPaymentElementReady ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white/80" />
            <span>Loading Payment Form...</span>
          </>
        ) : (
          <>
            <span>
              {isZeroCost
                ? "Send Free Handwritten Card"
                : `Send Handwritten Card — $${(finalPriceCents / 100).toFixed(2)} Flat`}
            </span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>

      <p className="text-[11px] text-stone-500 text-center leading-relaxed">
        By placing your order, you agree to our{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-amber-800 underline hover:text-stone-900 font-medium">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-amber-800 underline hover:text-stone-900 font-medium">
          Privacy Policy
        </a>
        . As cards are personalized custom goods penned on demand, all sales are final once production begins.
      </p>

      <div className="flex items-center justify-center gap-3 text-[11px] text-stone-400">
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
          No Account Required
        </span>
        <span>•</span>
        <span>Real Pen-on-Paper</span>
        <span>•</span>
        <span>USPS First Class Delivery</span>
      </div>
    </form>
  );
}

export function CheckoutStep(props: CheckoutStepProps) {
  const activePublishableKey =
    props.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;

  const stripePromise = React.useMemo(() => {
    if (props.isFree || !activePublishableKey || activePublishableKey.includes("placeholder")) {
      return null;
    }
    return loadStripe(activePublishableKey);
  }, [activePublishableKey, props.isFree]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            4
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            Payment &amp; Mailing Confirmation
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          Zero accounts or onboarding required. Flat \$9.00 all-inclusive with real pen inking and USPS postage.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-sm">
        {!props.isFree && props.clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: props.clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#D97706",
                  colorBackground: "#FAF8F5",
                  borderRadius: "12px",
                },
              },
            }}
          >
            <InnerPaymentForm {...props} />
          </Elements>
        ) : (
          <InnerPaymentForm {...props} isMock={true} />
        )}
      </div>
    </div>
  );
}
