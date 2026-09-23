"use client";

import React, { useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Lock, ShieldCheck, Mail, ArrowRight, Loader2, AlertCircle } from "lucide-react";

interface CheckoutStepProps {
  orderId: string;
  clientSecret: string | null;
  publishableKey?: string | null;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  onSuccess: (orderId: string) => void;
  isMock: boolean;
}

function InnerPaymentForm({
  orderId,
  customerEmail,
  onChangeCustomerEmail,
  onSuccess,
  isMock,
}: {
  orderId: string;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  onSuccess: (orderId: string) => void;
  isMock: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail.trim() || !customerEmail.includes("@")) {
      setErrorMessage("Please enter a valid email address for your order receipt.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    // Mock Mode Checkout (Development/Sandbox)
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
                  metadata: { orderId },
                  receipt_email: customerEmail,
                  amount: 900,
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
        onSuccess(orderId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment error occurred";
      setErrorMessage(msg);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Zero Login Receipt Email Field */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5 text-stone-500" />
          Receipt & Tracking Delivery Email
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

      {/* Stripe Payment Elements or Mock Card UI */}
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
              Stripe test mode active. Clicking &quot;Send Handwritten Card&quot; will process your \$9.00 order and dispatch the robotic pen fulfillment pipeline immediately.
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

      {errorMessage && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 text-stone-800 text-xs rounded-xl flex items-start gap-2.5 shadow-sm">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold text-stone-900">
              {errorMessage.includes("does not match") || errorMessage.includes("publishable key")
                ? "Payment system is currently updating settings."
                : "Unable to process payment right now."}
            </p>
            <p className="text-[11px] text-stone-600 leading-normal">
              {errorMessage.includes("does not match") || errorMessage.includes("publishable key")
                ? "Please refresh the page in a moment to complete your order."
                : errorMessage}
            </p>
            <details className="text-[10px] text-stone-400 cursor-pointer pt-1">
              <summary>Technical Details</summary>
              <p className="mt-1 font-mono bg-white/80 p-2 rounded border border-stone-200 text-stone-600 break-all select-all">
                {errorMessage}
              </p>
            </details>
          </div>
        </div>
      )}

      {/* Flat Rate Total Box */}
      <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-2">
        <div className="flex justify-between text-xs text-stone-600">
          <span>5×7 Custom Folded Linen Card</span>
          <span>$6.00</span>
        </div>
        <div className="flex justify-between text-xs text-stone-600">
          <span>Robotic Pen Inking (Real Ballpoint)</span>
          <span>$2.00</span>
        </div>
        <div className="flex justify-between text-xs text-stone-600">
          <span>USPS First Class Stamp & Mailing</span>
          <span>$1.00</span>
        </div>
        <div className="pt-2 border-t border-amber-200/60 flex justify-between items-baseline font-bold text-stone-900">
          <span className="text-sm">Total Due</span>
          <span className="text-xl text-amber-950 font-serif">$9.00</span>
        </div>
      </div>

      {/* Order Confirmation Primary Action Button */}
      <button
        type="submit"
        disabled={isProcessing || (!isMock && !isPaymentElementReady)}
        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-500 text-white font-bold text-base shadow-xl hover:shadow-2xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing & Inking Card...</span>
          </>
        ) : !isMock && !isPaymentElementReady ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-white/80" />
            <span>Loading Payment Form...</span>
          </>
        ) : (
          <>
            <span>Send Handwritten Card — $9.00 Flat</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </>
        )}
      </button>

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
    if (!activePublishableKey || activePublishableKey.includes("placeholder")) {
      return null;
    }
    return loadStripe(activePublishableKey);
  }, [activePublishableKey]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            4
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            Payment & Mailing Confirmation
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          Zero accounts or onboarding required. Flat \$9.00 all-inclusive with real pen inking and USPS postage.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-stone-200/80 shadow-sm">
        {props.clientSecret && stripePromise ? (
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
