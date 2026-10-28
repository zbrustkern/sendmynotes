"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
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
  Eye,
} from "lucide-react";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";
import { AddressData, isInternationalCountry } from "./Step3EnvelopeAddressing";
import { evaluatePaymentSubmission } from "@/lib/payment-mode";
import { checkoutEmailRequired, normalizeCheckoutEmail } from "@/lib/checkout-contact-policy";
import { trackEvent, trackEventV2 } from "@/lib/telemetry";
import { Sheet } from "@/components/flow/Sheet";
import { CardPreview } from "@/components/CardPreview";
import { markGoogleAdsCheckoutActive, clearGoogleAdsCheckoutActive } from "@/lib/google-ads";

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
  fontStyleId?: string;
  occasion?: string;
  recipient: AddressData;
  sender: AddressData;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  orderId: string;
  viewToken?: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  isMock: boolean;
  isFree: boolean;
  amountInCents?: number;
  destinationCountry?: string;
  isUpdatingCheckout?: boolean;
  checkoutError?: string | null;
  onRetryCheckout?: () => void;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount: () => void;
  appliedDiscount: AppliedDiscountInfo | null;
  onPaymentSuccess: (orderId: string, viewToken?: string | null, fulfillmentStatus?: string | null) => void;
  onPaymentStateChange?: (busy: boolean) => void;
  onBack: () => void;
}

interface InnerPaymentProps {
  cardTitle: string;
  cardUrl: string;
  salutation: string;
  bodyNote: string;
  signOff: string;
  fontClass: string;
  fontStyleId?: string;
  occasion?: string;
  recipient: AddressData;
  sender: AddressData;
  customerEmail: string;
  onChangeCustomerEmail: (email: string) => void;
  orderId: string;
  viewToken?: string | null;
  isMock: boolean;
  isFree: boolean;
  amountInCents?: number;
  destinationCountry?: string;
  appliedDiscount: AppliedDiscountInfo | null;
  onApplyDiscount: (code: string) => Promise<{ success: boolean; error?: string }>;
  onRemoveDiscount: () => void;
  onPaymentSuccess: (orderId: string, viewToken?: string | null, fulfillmentStatus?: string | null) => void;
  onPaymentStateChange?: (busy: boolean) => void;
  onBack: () => void;
}

function InnerPaymentForm({
  cardTitle,
  cardUrl,
  salutation,
  bodyNote,
  signOff,
  fontClass,
  fontStyleId,
  occasion,
  recipient,
  sender,
  customerEmail,
  onChangeCustomerEmail,
  orderId,
  viewToken,
  isMock,
  isFree,
  amountInCents,
  destinationCountry = "US",
  appliedDiscount,
  onApplyDiscount,
  onRemoveDiscount,
  onPaymentSuccess,
  onPaymentStateChange,
  onBack,
}: InnerPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessingState] = useState(false);
  const actionInFlight = React.useRef<"payment" | "promo" | null>(null);
  const setIsProcessing = (processing: boolean) => {
    actionInFlight.current = processing ? "payment" : null;
    setIsProcessingState(processing);
  };
  const [isPaymentCaptured, setIsPaymentCaptured] = useState(false);
  const [committedEmail, setCommittedEmail] = useState(customerEmail);
  const emailTouched = React.useRef(false);
  useEffect(() => { if (!emailTouched.current) setCommittedEmail(customerEmail); }, [customerEmail]);
  useEffect(() => { onPaymentStateChange?.(isProcessing || isPaymentCaptured); }, [isProcessing, isPaymentCaptured, onPaymentStateChange]);
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
  const commitContactPreference = async (): Promise<string | null> => {
    if (!orderId || !viewToken) return "Your checkout session is incomplete. Refresh the checkout and try again.";
    const normalized = normalizeCheckoutEmail(customerEmail);
    if (normalized === null) return "Enter a valid email address or leave the field blank.";
    const email = normalized;
    emailTouched.current = true;
    setCommittedEmail(email);
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Enter a valid email address or leave the field blank.";
    if (checkoutEmailRequired(!recipient.street1?.trim(), email)) return "An email is required to add the recipient address later.";
    try {
      const response = await fetch("/api/checkout/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, viewToken, customerEmail: email }),
      });
      const data = await response.json();
      return response.ok ? null : (data.error || "We couldn't save your email preference. Please retry before paying.");
    } catch {
      return "We couldn't save your email preference. Check your connection and retry before paying.";
    }
  };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const [showPromoInput, setShowPromoInput] = useState(Boolean(appliedDiscount));
  const [promoInput, setPromoInput] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [priceReconfirmationRequired, setPriceReconfirmationRequired] = useState(false);

  const deliveryEstimate = useMemo(() => calculateDeliveryEstimate(), []);

  // Excerpt of handwritten note
  const noteExcerpt = useMemo(() => {
    const combined = [salutation, bodyNote, signOff].filter(Boolean).join(" ");
    if (combined.length <= 110) return combined;
    return combined.slice(0, 110) + "...";
  }, [salutation, bodyNote, signOff]);

  const finalPriceCents = amountInCents ?? (appliedDiscount ? appliedDiscount.finalAmountInCents : 900);
  const isInternational = isInternationalCountry(destinationCountry);
  const isZeroCost = isFree || finalPriceCents === 0;

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionInFlight.current || isPaymentCaptured || !promoInput.trim()) return;
    actionInFlight.current = "promo";
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
      actionInFlight.current = null;
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = async () => {
    if (actionInFlight.current || isPaymentCaptured) return;
    actionInFlight.current = "promo";
    setPromoLoading(true);
    try {
      await onRemoveDiscount();
    } finally {
      actionInFlight.current = null;
      setPromoLoading(false);
    }
  };

  const handleExpressReady = (event: {
    availablePaymentMethods?: { applePay?: boolean; googlePay?: boolean; link?: boolean };
  }) => {
    const methods = event?.availablePaymentMethods;
    const hasAny = Boolean(methods && (methods.applePay || methods.googlePay || methods.link));
    setWalletAvailable(hasAny);
    trackEventV2("wallet_availability_observed", {
      applePay: Boolean(methods?.applePay),
      googlePay: Boolean(methods?.googlePay),
      link: Boolean(methods?.link),
    });
    trackEvent("wallet_availability_observed", 4, {
      applePay: Boolean(methods?.applePay),
      googlePay: Boolean(methods?.googlePay),
      link: Boolean(methods?.link),
    });
  };

  const handleExpressConfirm = async () => {
    if (actionInFlight.current || isPaymentCaptured) return;
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setErrorMessage(null);

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    trackEventV2("payment_attempted", {
      paymentMethodType: "wallet",
      attemptId,
      orderId,
    });
    trackEvent("payment_attempted", 4, {
      paymentMethodType: "wallet",
      attemptId,
    });

    try {
      const contactError = await commitContactPreference();
      if (contactError) { setErrorMessage(contactError); setIsProcessing(false); return; }
      // Per Stripe Express Checkout documentation: elements.submit() validates element fields
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message || "Please complete all required payment details.");
        trackEventV2("payment_failed", {
          attemptId,
          errorCategory: submitError.type || "validation_error",
          errorCode: submitError.code || "submit_error",
        });
        setIsProcessing(false);
        return;
      }

      markGoogleAdsCheckoutActive(orderId, viewToken);
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/${orderId}`,
        },
        redirect: "if_required",
      });

      if (error) {
        clearGoogleAdsCheckoutActive(orderId);
        setErrorMessage(error.message || "Wallet payment failed. Please use card below.");
        trackEventV2("payment_failed", {
          attemptId,
          errorCategory: error.type || "wallet_error",
          errorCode: error.code || "decline",
        });
        trackEvent("payment_failed", 4, {
          attemptId,
          errorCategory: error.type || "wallet_error",
        });
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === "requires_action") {
        trackEventV2("payment_action_required", {
          attemptId,
          actionType: paymentIntent.next_action?.type || "3ds",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        trackEventV2("payment_confirmation_observed", {
          orderId,
          amountInCents: finalPriceCents,
          in_app_browser: false,
          used_address_deferral: !recipient.street1?.trim(),
        });
        trackEvent("payment_confirmation_observed", 4, {
          orderId,
          amountInCents: finalPriceCents,
          in_app_browser: false,
          used_address_deferral: !recipient.street1?.trim(),
        });

        // Stripe captured payment: lock form against duplicate charges
        setIsPaymentCaptured(true);
        let confirmData: any = null;
        try {
          const confirmRes = await fetch("/api/checkout/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              paymentIntentId: paymentIntent.id,
              customerEmail,
              verifyOnly: true,
            }),
          });
          confirmData = await confirmRes.json();
          if (confirmRes.status === 409 || confirmData?.requiresPriceReconfirmation) {
            setPriceReconfirmationRequired(true);
            setErrorMessage(confirmData?.error || "Price changed or quote expired. Please reconfirm total before paying.");
            setIsProcessing(false);
            return;
          }
          if (confirmRes.ok && confirmData.success) {
            // Fire background supplier fulfillment + receipt dispatch without blocking confirmation UI
            void fetch("/api/checkout/confirm-order", {
              method: "POST",
              keepalive: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                paymentIntentId: paymentIntent.id,
                customerEmail,
              }),
            }).catch((bgErr) => console.warn("[Checkout] Background fulfillment notice:", bgErr));

            setIsProcessing(false);
            onPaymentSuccess(orderId, confirmData?.viewToken || viewToken, confirmData?.status);
            return;
          }
        } catch (confirmErr) {
          console.warn("[Checkout] Notice confirming order:", confirmErr);
        }

        // Paid by customer, but server fulfillment delay or outage: transition to reconciling state
        setIsProcessing(false);
        onPaymentSuccess(orderId, null, "RECONCILING");
      }
    } catch (err) {
      clearGoogleAdsCheckoutActive(orderId);
      const msg = err instanceof Error ? err.message : "Payment error occurred";
      setErrorMessage(msg);
      trackEventV2("payment_failed", {
        attemptId,
        errorCategory: "unexpected_error",
        errorCode: "exception",
      });
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionInFlight.current || isPaymentCaptured) return;

    if (normalizeCheckoutEmail(customerEmail) === null) {
      setErrorMessage("Enter a valid email address or leave the field blank.");
      return;
    }
    if (checkoutEmailRequired(!recipient.street1?.trim(), customerEmail.trim())) {
      setErrorMessage("An email is required to add the recipient address later.");
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    const contactError = await commitContactPreference();
    if (contactError) { setErrorMessage(contactError); setIsProcessing(false); return; }

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
          if (res.status === 409 || data?.requiresPriceReconfirmation) {
            setPriceReconfirmationRequired(true);
            setErrorMessage(data?.error || "Price changed or promo expired. Please reconfirm total before proceeding.");
            setIsProcessing(false);
            return;
          }
          throw new Error(data.error || "Failed to process free order.");
        }

        setIsProcessing(false);
        onPaymentSuccess(orderId, data.viewToken, data.status);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error completing free order";
        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }
    }

    // 2. EVALUATE PAYMENT SUBMISSION MODE
    const submissionDecision = evaluatePaymentSubmission({
      isZeroCost,
      isMock,
      hasStripe: Boolean(stripe),
      hasElements: Boolean(elements),
    });

    if (submissionDecision.mode === "blocked_error") {
      setErrorMessage(
        submissionDecision.errorMessage ||
        "Payment processor is unavailable. Please check your connection and retry."
      );
      setIsProcessing(false);
      return;
    }

    if (submissionDecision.mode === "local_mock") {
      try {
        const confirmRes = await fetch("/api/checkout/confirm-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            paymentIntentId: `pi_mock_${orderId}`,
            customerEmail,
          }),
        });
        const confirmData = await confirmRes.json();
        if (confirmRes.status === 409 || confirmData?.requiresPriceReconfirmation) {
          setPriceReconfirmationRequired(true);
          setErrorMessage(confirmData?.error || "Price changed or quote expired. Please reconfirm total before paying.");
          setIsProcessing(false);
          return;
        }
        if (!confirmRes.ok || !confirmData.success) {
          throw new Error(confirmData.error || "Failed to confirm simulated order.");
        }
        setIsProcessing(false);
        onPaymentSuccess(orderId, confirmData.viewToken, confirmData.status);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error confirming simulated order.";
        setErrorMessage(msg);
        setIsProcessing(false);
        return;
      }
    }

    // 3. REAL STRIPE PAYMENT CONFIRMATION
    if (!stripe || !elements) {
      setErrorMessage("Payment processor is unavailable. Please check your connection and retry.");
      trackEventV2("payment_ui_failed", {
        errorCategory: "stripe_elements_unavailable",
        errorCode: "elements_null",
      });
      setIsProcessing(false);
      return;
    }

    if (!isPaymentElementReady) {
      setErrorMessage("Payment form is loading. Please try again in a moment.");
      setIsProcessing(false);
      return;
    }

    const attemptId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    trackEventV2("payment_attempted", {
      paymentMethodType: "card",
      attemptId,
      orderId,
    });
    trackEvent("payment_attempted", 4, {
      paymentMethodType: "card",
      attemptId,
    });

    try {
      markGoogleAdsCheckoutActive(orderId, viewToken);
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/${orderId}`,
        },
        redirect: "if_required",
      });

      if (error) {
        clearGoogleAdsCheckoutActive(orderId);
        setErrorMessage(error.message || "Payment declined. Please check your card information.");
        trackEventV2("payment_failed", {
          attemptId,
          errorCategory: error.type || "card_error",
          errorCode: error.code || "decline",
        });
        trackEvent("payment_failed", 4, {
          attemptId,
          errorCategory: error.type || "card_error",
        });
        setIsProcessing(false);
      } else if (paymentIntent && paymentIntent.status === "requires_action") {
        trackEventV2("payment_action_required", {
          attemptId,
          actionType: paymentIntent.next_action?.type || "3ds",
        });
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        trackEventV2("payment_confirmation_observed", {
          orderId,
          amountInCents: finalPriceCents,
          in_app_browser: false,
          used_address_deferral: !recipient.street1?.trim(),
        });
        trackEvent("payment_confirmation_observed", 4, {
          orderId,
          amountInCents: finalPriceCents,
          in_app_browser: false,
          used_address_deferral: !recipient.street1?.trim(),
        });

        // Stripe captured payment: lock form against duplicate charges
        setIsPaymentCaptured(true);
        let confirmData: any = null;
        try {
          const confirmRes = await fetch("/api/checkout/confirm-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              paymentIntentId: paymentIntent.id,
              customerEmail,
              verifyOnly: true,
            }),
          });
          confirmData = await confirmRes.json();
          if (confirmRes.status === 409 || confirmData?.requiresPriceReconfirmation) {
            setPriceReconfirmationRequired(true);
            setErrorMessage(confirmData?.error || "Price changed or quote expired. Please reconfirm total before paying.");
            setIsProcessing(false);
            return;
          }
          if (confirmRes.ok && confirmData.success) {
            // Fire background supplier fulfillment + receipt dispatch without blocking confirmation UI
            void fetch("/api/checkout/confirm-order", {
              method: "POST",
              keepalive: true,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                paymentIntentId: paymentIntent.id,
                customerEmail,
              }),
            }).catch((bgErr) => console.warn("[Checkout] Background fulfillment notice:", bgErr));

            setIsProcessing(false);
            onPaymentSuccess(orderId, confirmData?.viewToken || viewToken, confirmData?.status);
            return;
          }
        } catch (confirmErr) {
          console.warn("[Checkout] Notice confirming order:", confirmErr);
        }

        // Paid by customer, but server fulfillment delay or outage: transition to reconciling state
        setIsProcessing(false);
        onPaymentSuccess(orderId, null, "RECONCILING");
      }
    } catch (err) {
      clearGoogleAdsCheckoutActive(orderId);
      const msg = err instanceof Error ? err.message : "Payment error occurred";
      setErrorMessage(msg);
      trackEventV2("payment_failed", {
        attemptId,
        errorCategory: "unexpected_error",
        errorCode: "exception",
      });
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, []);

  const recipientDisplayName = recipient.fullName?.trim() || "Recipient";
  const recipientLocation = useMemo(() => {
    if (!recipient.street1?.trim()) {
      return "Address Added Later";
    }
    if (recipient.city?.trim()) {
      return `${recipient.city.trim()}${recipient.state?.trim() ? `, ${recipient.state.trim()}` : ""}${isInternational ? `, ${recipient.country || destinationCountry}` : ""}`;
    }
    return recipient.street1.trim();
  }, [recipient, isInternational, destinationCountry]);

  const paymentElementOptions = useMemo(
    () => ({
      layout: "tabs" as const,
      paymentMethodOrder: ["apple_pay", "google_pay", "card", "link"],
      defaultValues: {
        billingDetails: {
          email: committedEmail.trim() || undefined,
          name: recipient.fullName || sender.fullName || undefined,
        },
      },
    }),
    [committedEmail, recipient.fullName, sender.fullName]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 md:pb-12">
      {/* COMPACT STEP HEADER */}
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-amber-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
            4
          </span>
          <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
            Review &amp; Pay
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            if (actionInFlight.current || isPaymentCaptured) return;
            trackEventV2("payment_canceled", { stage: "review_and_pay" });
            trackEvent("payment_canceled", 4, { stage: "review_and_pay" });
            onBack();
          }}
          className="px-2.5 py-1 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit Address</span>
        </button>
      </div>

      {/* SLEEK 1-ROW ORDER SUMMARY BAR (Mobile only) */}
      <div className="lg:hidden bg-[#FAF8F5] rounded-2xl p-3 sm:p-3.5 border border-stone-200 shadow-2xs flex items-center justify-between gap-3 min-h-[84px]">
        {/* Left: Thumbnail + Recipient info + Delivery + Preview/Edit */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-12 h-16 sm:w-14 sm:h-[75px] rounded-lg overflow-hidden border border-stone-300 shadow-2xs shrink-0 bg-stone-100">
            <Image
              src={cardUrl}
              alt={cardTitle}
              fill
              unoptimized={Boolean(cardUrl?.startsWith("data:"))}
              className="object-cover"
            />
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-serif font-bold text-sm text-stone-900 truncate max-w-[140px] sm:max-w-[200px]">
                {cardTitle}
              </span>
              <span className="text-[10px] text-stone-400">•</span>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="text-[11px] text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2 flex items-center gap-0.5 cursor-pointer"
              >
                <Eye className="w-3 h-3 inline" />
                <span>Preview / Edit</span>
              </button>
            </div>

            <div className="text-xs text-stone-600 truncate">
              <span className="font-medium text-stone-800">To: </span>
              <span>{recipientDisplayName}</span>
              <span className="text-stone-400"> ({recipientLocation})</span>
            </div>

            <div className="text-[11px] text-stone-500 flex items-center gap-1">
              <Truck className="w-3 h-3 text-amber-700 shrink-0" />
              <span>{isInternational ? "Delivery timing varies by destination" : `Est. Arrival: ${deliveryEstimate.earliestDate} – ${deliveryEstimate.latestDate}`}</span>
            </div>
          </div>
        </div>

        {/* Right: Total Price + Subtitle */}
        <div className="text-right shrink-0 pl-2 border-l border-stone-200/80">
          <div className="font-serif font-bold text-lg sm:text-xl text-stone-950">
            {isZeroCost ? "$0.00 Total" : `$${(finalPriceCents / 100).toFixed(2)} Total`}
          </div>
          <div className="text-[10px] sm:text-[11px] text-stone-500 whitespace-nowrap">
            {isInternational ? "International mailing included" : "Postage & Real Pen Included"}
          </div>
        </div>
      </div>

      {/* 2-COLUMN DESKTOP SPLIT SCREEN WORKBENCH */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start">
        {/* LEFT COLUMN: Sticky Order Review Summary Card (lg:col-span-5) */}
        <div className="hidden lg:block lg:col-span-5 space-y-5 lg:sticky lg:top-6">
          <div className="bg-[#FAF8F5] rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-sm space-y-5">
            {/* Header: Title & Total */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-200/80 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-full inline-block mb-1">
                  Order Review
                </span>
                <h2 className="font-serif text-lg font-bold text-stone-900 leading-snug">
                  {cardTitle}
                </h2>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  {isInternational ? "Folded Cardstock Card • Real Pen Ink • International mailing" : "Folded Cardstock Card • Real Pen Ink • USPS 1st Class Stamp"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-serif font-bold text-xl text-stone-950">
                  {isZeroCost ? "$0.00" : `$${(finalPriceCents / 100).toFixed(2)}`}
                </div>
                <div className="text-[10px] text-emerald-700 font-medium">All-Inclusive</div>
              </div>
            </div>

            {/* Note & Card Preview Leaf */}
            <div className="relative w-full rounded-2xl overflow-hidden border border-stone-200/80 bg-[#FDFCF7] paper-texture shadow-inner p-4 space-y-3">
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-r from-stone-400/20 to-transparent pointer-events-none" />

              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span className="flex items-center gap-1.5">
                  <Feather className="w-3.5 h-3.5 text-amber-800" />
                  <span>Real Ballpoint Inking</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(true)}
                  className="text-[11px] text-amber-800 hover:text-amber-950 font-medium underline underline-offset-2 flex items-center gap-0.5 cursor-pointer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Full Card Spread</span>
                </button>
              </div>

              <div className="flex gap-3.5 items-start">
                <div
                  onClick={() => setIsPreviewOpen(true)}
                  title="Click to preview full card"
                  className="relative w-20 aspect-[17/22] rounded-xl overflow-hidden border border-stone-300 shadow-sm shrink-0 bg-stone-100 cursor-pointer group hover:shadow-md transition"
                >
                  <Image
                    src={cardUrl}
                    alt={cardTitle}
                    fill
                    unoptimized={Boolean(cardUrl?.startsWith("data:"))}
                    className="object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-stone-900/80 text-[8px] text-white text-center py-0.5 font-bold">
                    Front Cover
                  </div>
                </div>

                <div className="flex-1 min-w-0 bg-white/70 rounded-xl p-3 border border-stone-200/60 shadow-2xs">
                  <div className={`text-[#1B3B6F] text-xs leading-relaxed ${fontClass || "font-David"}`}>
                    {salutation && <p className="font-semibold mb-1 truncate">{salutation}</p>}
                    <p className="line-clamp-4 text-stone-800 text-[11px] leading-relaxed">
                      {bodyNote || "Your personal note written in real ballpoint ink..."}
                    </p>
                    {signOff && <p className="font-semibold mt-1 truncate">{signOff}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Addressing Block: Recipient & Return */}
            <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-2xs space-y-3 text-xs">
              <div className="flex items-start justify-between border-b border-stone-100 pb-2.5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Mailing To (Recipient)
                  </div>
                  <div className="font-semibold text-stone-900 mt-0.5">{recipientDisplayName}</div>
                  {recipient.street1?.trim() ? (
                    <div className="text-stone-600 text-[11px] leading-tight mt-0.5">
                      <div>{recipient.street1}{recipient.street2 ? `, ${recipient.street2}` : ""}</div>
                      <div>{recipient.city}{recipient.state ? `, ${recipient.state}` : ""}{recipient.zip ? ` ${recipient.zip}` : ""}</div>
                      {isInternational && <div>{recipient.country || destinationCountry}</div>}
                    </div>
                  ) : (
                    <div className="text-amber-800 text-[11px] font-medium mt-0.5">
                      Address link will be sent to recipient
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { if (!actionInFlight.current && !isPaymentCaptured) onBack(); }}
                  className="text-[11px] text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2 cursor-pointer"
                >
                  Edit
                </button>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Return Address (From You)
                </div>
                <div className="font-semibold text-stone-900 mt-0.5">{sender.fullName || "Sender"}</div>
                {sender.street1?.trim() && (
                  <div className="text-stone-600 text-[11px] leading-tight mt-0.5">
                    <div>{sender.street1}{sender.street2 ? `, ${sender.street2}` : ""}</div>
                    <div>{sender.city}, {sender.state} {sender.zip}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Estimated Arrival Window */}
            <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-amber-200/70 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4 text-amber-800" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-stone-900">
                  {isInternational ? "Delivery timing varies by destination" : `Est. USPS Arrival: ${deliveryEstimate.earliestDate} – ${deliveryEstimate.latestDate}`}
                </div>
                <div className="text-[11px] text-stone-500">
                  {isInternational ? "Delivery estimates depend on the destination. Tracking appears when provided by the mail service." : "Sent via First-Class Mail. Tracking details appear when provided by the mail service."}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Customer Email + Stripe Express Checkout & Cards (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-4">
          {/* CUSTOMER EMAIL INPUT (RECEIPT & TRACKING) - IMMEDIATELY ABOVE PAYMENT */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200/90 shadow-2xs space-y-1.5">
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-800" />
                <span>Email {recipient.street1?.trim() ? "(optional)" : "(required to add the address later)"}</span>
              </span>
              <span className="text-[10px] text-stone-400 font-normal lowercase">no password needed</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isProcessing || isPaymentCaptured}
              value={customerEmail}
              onChange={(e) => {
                emailTouched.current = true;
                onChangeCustomerEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              onBlur={() => setCommittedEmail(customerEmail)}
              placeholder="your.email@example.com"
              className="w-full px-3.5 py-2 text-base sm:text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
            />
            <p className="text-[11px] text-stone-500">
              {recipient.street1?.trim() ? "For your receipt and available mailing updates. You can leave this blank." : "We’ll email a secure link so you can add the recipient address later."}
            </p>
          </div>

          {/* STRIPE PAYMENT CONTAINER - DIRECTLY ABOVE THE FOLD */}
          {isZeroCost ? (
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>100% Free Order Voucher</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Your card, real ballpoint inking, and {isInternational ? "international mailing" : "USPS postage"} are completely covered by voucher{" "}
                <strong className="font-mono">{appliedDiscount?.code}</strong>. Zero billing info needed.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Payment</span>
                </span>
              </div>

              {isMock ? (
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
              ) : !elements ? (
                <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-xl space-y-2 text-xs text-stone-700">
                  <div className="flex items-center justify-between text-rose-900 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      Payment Processor Unavailable
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600">
                    Unable to load secure payment elements. Please refresh or retry.
                  </p>
                </div>
              ) : (
                <div className="min-h-[140px] flex flex-col justify-center space-y-4">
                  {!isPaymentElementReady && (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 text-stone-400 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-700" />
                      <span>Loading secure Stripe payment fields...</span>
                    </div>
                  )}

                  {/* EXPRESS CHECKOUT ELEMENT (Apple Pay / Google Pay / Link) */}
                  <div className={walletAvailable ? "space-y-3" : "h-0 overflow-hidden opacity-0 pointer-events-none"}>
                    {!promoLoading && <ExpressCheckoutElement
                      onConfirm={handleExpressConfirm}
                      onReady={handleExpressReady}
                      options={{
                        buttonHeight: 44,
                        paymentMethodOrder: ["applePay", "googlePay", "link"],
                      }}
                    />}
                    {walletAvailable && (
                      <div className="relative my-3">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-stone-200" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-3 text-stone-400 font-medium">
                            — Or pay with card —
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CARD ELEMENT FALLBACK */}
                  <PaymentElement
                    id="v3-payment-element"
                    options={paymentElementOptions}
                    onReady={() => {
                      setIsPaymentElementReady(true);
                      trackEventV2("payment_ui_ready", {
                        paymentElement: true,
                        mode: isMock ? "mock" : "stripe",
                      });
                    }}
                    onLoadError={(err) => {
                      console.error("[Stripe Load Error]", err);
                      setErrorMessage(err.error?.message || "Could not load payment form.");
                      trackEventV2("payment_ui_failed", {
                        errorCategory: "stripe_element_load_error",
                        errorCode: err.error?.code || "load_error",
                      });
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* COLLAPSED PROMO CODE LINK */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200/90 shadow-2xs">
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
                  onClick={handleRemovePromo}
                  disabled={isProcessing || promoLoading || isPaymentCaptured}
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
                    disabled={isProcessing || promoLoading || isPaymentCaptured || !promoInput.trim()}
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

          {priceReconfirmationRequired && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-900 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Price Quote Updated</span>
              </div>
              <p className="text-amber-900 text-xs leading-relaxed">
                The promotional price quote has expired or terms have changed. Please reconfirm your order total before paying.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    setPriceReconfirmationRequired(false);
                    setErrorMessage(null);
                    if (appliedDiscount?.code) {
                      await onApplyDiscount(appliedDiscount.code);
                    } else {
                      handleRemovePromo();
                    }
                  }}
                  className="px-3.5 py-1.5 bg-amber-800 hover:bg-amber-900 text-white font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  Reconfirm &amp; Refresh Total
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <p className="text-center text-xs text-stone-500">Payments processed securely by Stripe</p>

          {/* DESKTOP ADVANCE BAR */}
          <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
            <button
              type="button"
              onClick={() => { if (!actionInFlight.current && !isPaymentCaptured) onBack(); }}
              className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Back to Addressing</span>
            </button>

            <button
              type="submit"
              disabled={promoLoading || isProcessing || isPaymentCaptured || (!isZeroCost && !isMock && !isPaymentElementReady)}
              className="px-8 py-3.5 bg-stone-900 hover:bg-black disabled:bg-stone-300 text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
          {isPaymentCaptured ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Payment Captured • Finalizing Order...</span>
            </>
          ) : isProcessing ? (
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
    </div>
  </div>

  {/* MOBILE STICKY BOTTOM ACTION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg flex items-center justify-between gap-3 safe-area-inset-bottom">
        <button
          type="button"
          onClick={() => { if (!actionInFlight.current && !isPaymentCaptured) onBack(); }}
          disabled={isPaymentCaptured}
          className="px-3 py-2 text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1 disabled:opacity-40"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Address</span>
        </button>

        <button
          type="submit"
          disabled={promoLoading || isProcessing || isPaymentCaptured || (!isZeroCost && !isMock && !isPaymentElementReady)}
          className="px-5 py-2.5 bg-stone-900 hover:bg-black disabled:bg-stone-300 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPaymentCaptured ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Payment Received...</span>
            </>
          ) : isProcessing ? (
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

      {/* CARD PREVIEW SHEET */}
      <Sheet
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Card Preview"
        description={cardTitle}
      >
        <div className="py-2">
          <CardPreview
            coverUrl={cardUrl}
            printedGreeting={salutation}
            handwrittenNote={[bodyNote, signOff].filter(Boolean).join("\n\n")}
            fontStyleId={fontStyleId || "hwDavid"}
            occasion={occasion || "Greeting Card"}
            currentStep={4}
            initialView="cover"
          />
        </div>
      </Sheet>
    </form>
  );
}

export function Step4ReviewAndPayment(props: Step4ReviewAndPaymentProps) {
  const stripePromise = useMemo(() => {
    return props.publishableKey ? loadStripe(props.publishableKey) : null;
  }, [props.publishableKey]);

  if (props.isUpdatingCheckout || props.checkoutError) {
    return (
      <div role={props.checkoutError ? "alert" : "status"} className="p-6 rounded-2xl border border-stone-200 bg-white space-y-3">
        <p>{props.checkoutError || "Updating your secure checkout…"}</p>
        {props.checkoutError && props.onRetryCheckout && (
          <button type="button" onClick={props.onRetryCheckout} className="underline font-semibold">
            Retry checkout
          </button>
        )}
      </div>
    );
  }

  if (props.clientSecret && stripePromise) {
    return (
      <Elements
        key={props.clientSecret}
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

  return (
    <Elements
      stripe={null}
      key={props.orderId || (props.isFree ? "free" : props.isMock ? "mock" : "unavailable")}
    >
      <InnerPaymentForm {...props} isMock={props.isMock ?? false} />
    </Elements>
  );
}
