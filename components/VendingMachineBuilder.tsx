"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Mail,
  PenTool,
  Printer,
  ChevronRight,
  CreditCard,
  Eye,
  X,
  User,
  LogIn,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { CardPreview } from "./CardPreview";
import { CoverStep } from "./CoverStep";
import { InsideNoteStep } from "./InsideNoteStep";
import { AddressStep } from "./AddressStep";
import { CheckoutStep } from "./CheckoutStep";
import { FeedbackModal } from "./FeedbackModal";
import { CARD_PRESETS, OCCASIONS, FONT_OPTIONS, CardPreset } from "@/lib/card-presets";
import { MailingAddress } from "@/lib/types";
import { trackEvent } from "@/lib/telemetry";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "./AuthModal";
import Link from "next/link";

export function VendingMachineBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, account, saveAddress } = useAuth();

  // Builder Steps: 1 = Cover, 2 = Inside Note, 3 = Address, 4 = Checkout
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isPrefilledFromUrl, setIsPrefilledFromUrl] = useState(false);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Feedback Modal State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  // Mobile Card Preview Modal Drawer State
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

  // Card Content State
  const [occasion, setOccasion] = useState<string>("Birthday");
  const [customPrompt, setCustomPrompt] = useState<string>("Whimsical watercolor balloons");
  const [coverUrl, setCoverUrl] = useState<string>(CARD_PRESETS[0].imageUrl);
  const [printedGreeting, setPrintedGreeting] = useState<string>(CARD_PRESETS[0].defaultPrintedMessage);
  const [handwrittenNote, setHandwrittenNote] = useState<string>(CARD_PRESETS[0].defaultHandwrittenNote);
  const [fontStyleId, setFontStyleId] = useState<string>("1");

  // Address State & Scheduling
  const [scheduledSendDate, setScheduledSendDate] = useState<string>("");
  const [saveRecipientToAddressBook, setSaveRecipientToAddressBook] = useState<boolean>(true);

  const [recipient, setRecipient] = useState<MailingAddress>({
    firstName: "Alex",
    lastName: "Rivera",
    street1: "742 Evergreen Terrace",
    street2: "",
    city: "Springfield",
    state: "OR",
    zip: "97477",
    country: "USA",
  });

  const [returnAddress, setReturnAddress] = useState<MailingAddress>({
    firstName: "Morgan",
    lastName: "Lee",
    street1: "452 Pacific Coast Highway",
    street2: "",
    city: "Santa Monica",
    state: "CA",
    zip: "90401",
    country: "USA",
  });

  // Pre-fill user's default return address if available
  useEffect(() => {
    if (account?.defaultReturnAddress) {
      setReturnAddress(account.defaultReturnAddress);
    }
  }, [account]);

  // Checkout State
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isInitializingCheckout, setIsInitializingCheckout] = useState<boolean>(false);
  const [isMockIntent, setIsMockIntent] = useState<boolean>(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Discount & Promo Voucher State
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    type: "PERCENTAGE" | "FIXED_AMOUNT";
    value: number;
    discountAmountInCents: number;
    finalAmountInCents: number;
    description?: string;
    isFree: boolean;
  } | null>(null);
  const [isFreeOrder, setIsFreeOrder] = useState<boolean>(false);

  // Pre-fill customer email if logged in
  useEffect(() => {
    if (user?.email && !customerEmail) {
      setCustomerEmail(user.email);
    }
  }, [user, customerEmail]);

  // Telemetry: Track session start on mount
  useEffect(() => {
    trackEvent("session_start", 1);
  }, []);

  // Hydrate card state from URL search parameters (Supports AI Agents & Direct Deep Links)
  useEffect(() => {
    if (!searchParams) return;
    let didPrefill = false;

    // 1. Occasion
    const occasionParam = searchParams.get("occasion");
    if (occasionParam) {
      const match = OCCASIONS.find(
        (o) => o.toLowerCase() === occasionParam.toLowerCase()
      );
      if (match) {
        setOccasion(match);
        didPrefill = true;
      }
    }

    // 2. Printed Greeting Sentiment
    const printedParam = searchParams.get("printed") || searchParams.get("greeting");
    if (printedParam) {
      setPrintedGreeting(printedParam);
      didPrefill = true;
    }

    // 3. Handwritten Inking Message
    const noteParam =
      searchParams.get("note") ||
      searchParams.get("message") ||
      searchParams.get("handwritten");
    if (noteParam) {
      setHandwrittenNote(noteParam);
      didPrefill = true;
    }

    // 4. Robotic Pen Style
    const fontParam = searchParams.get("font") || searchParams.get("fontId");
    if (fontParam) {
      if (["1", "2", "3", "4"].includes(fontParam)) {
        setFontStyleId(fontParam);
        didPrefill = true;
      } else {
        const foundFont = FONT_OPTIONS.find(
          (f) =>
            f.id.toLowerCase() === fontParam.toLowerCase() ||
            f.name.toLowerCase().includes(fontParam.toLowerCase())
        );
        if (foundFont) {
          setFontStyleId(foundFont.handwryttenFontId);
          didPrefill = true;
        }
      }
    }

    // 5. Cover Image or Prompt
    const coverParam = searchParams.get("cover");
    if (coverParam) {
      setCoverUrl(coverParam);
      didPrefill = true;
    }
    const promptParam = searchParams.get("prompt");
    if (promptParam) {
      setCustomPrompt(promptParam);
      didPrefill = true;
    }

    // 6. Recipient Address
    const to = searchParams.get("to") || searchParams.get("toName");
    const toFirst = searchParams.get("toFirst");
    const toLast = searchParams.get("toLast");
    const toStreet =
      searchParams.get("toStreet") ||
      searchParams.get("street1") ||
      searchParams.get("street");
    const toStreet2 = searchParams.get("toStreet2") || searchParams.get("street2");
    const toCity = searchParams.get("toCity") || searchParams.get("city");
    const toState = searchParams.get("toState") || searchParams.get("state");
    const toZip = searchParams.get("toZip") || searchParams.get("zip");

    if (to || toFirst || toLast || toStreet || toCity || toState || toZip) {
      didPrefill = true;
      setRecipient((prev) => {
        let fName = prev.firstName;
        let lName = prev.lastName;
        if (to) {
          const parts = to.trim().split(/\s+/);
          if (parts.length === 1) {
            fName = parts[0];
            lName = "";
          } else {
            fName = parts[0];
            lName = parts.slice(1).join(" ");
          }
        }
        if (toFirst) fName = toFirst;
        if (toLast) lName = toLast;

        return {
          ...prev,
          firstName: fName,
          lastName: lName,
          street1: toStreet || prev.street1,
          street2: toStreet2 || prev.street2,
          city: toCity || prev.city,
          state: toState ? toState.toUpperCase() : prev.state,
          zip: toZip || prev.zip,
        };
      });
    }

    // 7. Step Navigation
    const stepParam = searchParams.get("step");
    if (stepParam) {
      const s = parseInt(stepParam, 10);
      if (s >= 1 && s <= 4) {
        setCurrentStep(s);
      }
    }

    // 8. Discount & Promo Voucher Codes
    const promoParam =
      searchParams.get("discount") ||
      searchParams.get("code") ||
      searchParams.get("promo");
    if (promoParam) {
      applyDiscountCode(promoParam).catch((err) =>
        console.warn("Notice validating URL promo code:", err)
      );
      didPrefill = true;
    }

    if (didPrefill) {
      setIsPrefilledFromUrl(true);
      trackEvent("agent_url_prefilled", 1, {
        occasion: occasionParam,
        hasPrinted: !!printedParam,
        hasNote: !!noteParam,
        hasRecipient: !!to || !!toStreet,
      });
    }
  }, [searchParams]);

  // Handle Preset Selection
  const handleSelectPreset = (url: string, preset?: CardPreset) => {
    setCoverUrl(url);
    if (preset) {
      setOccasion(preset.occasion);
      setCustomPrompt(preset.prompt);
      trackEvent("cover_preset_selected", 1, { presetId: preset.id, occasion: preset.occasion, title: preset.title });
      if (!printedGreeting || printedGreeting === CARD_PRESETS[0].defaultPrintedMessage) {
        setPrintedGreeting(preset.defaultPrintedMessage);
      }
      if (!handwrittenNote || handwrittenNote === CARD_PRESETS[0].defaultHandwrittenNote) {
        setHandwrittenNote(preset.defaultHandwrittenNote);
      }
    }
  };

  const handleUpdateRecipient = (field: keyof MailingAddress, value: string) => {
    setRecipient((prev) => ({ ...prev, [field]: value }));
  };

  const handleUpdateReturn = (field: keyof MailingAddress, value: string) => {
    setReturnAddress((prev) => ({ ...prev, [field]: value }));
  };

  const navigateToStep = (targetStep: number) => {
    trackEvent("step_navigated", targetStep, { fromStep: currentStep, toStep: targetStep });
    setCurrentStep(targetStep);
  };

  // Apply or remove discount codes
  const applyDiscountCode = async (codeToApply: string) => {
    try {
      const res = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToApply }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        return { success: false, error: data.error || "Invalid discount code." };
      }
      setAppliedDiscount(data);
      setIsFreeOrder(Boolean(data.isFree));

      // If we are already on step 4 with an initialized order, re-create the intent with the new discount
      if (currentStep === 4 && orderId) {
        await proceedToCheckout(data.code);
      }

      return { success: true };
    } catch {
      return { success: false, error: "Unable to validate discount code." };
    }
  };

  const removeDiscountCode = async () => {
    setAppliedDiscount(null);
    setIsFreeOrder(false);
    if (currentStep === 4 && orderId) {
      await proceedToCheckout(null);
    }
  };

  // Move to Step 4 and create PaymentIntent
  const proceedToCheckout = async (overrideDiscountCode?: string | null) => {
    setIsInitializingCheckout(true);
    setCheckoutError(null);
    trackEvent("address_completed", 3);

    const discountCodeToUse =
      overrideDiscountCode === null
        ? undefined
        : overrideDiscountCode !== undefined
        ? overrideDiscountCode
        : appliedDiscount?.code;

    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontImageUrl: coverUrl,
          printedMessage: printedGreeting,
          handwrittenNote,
          fontStyleId,
          recipientAddress: recipient,
          returnAddress,
          customerEmail,
          userId: user?.uid,
          scheduledSendDate: scheduledSendDate || undefined,
          discountCode: discountCodeToUse,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize checkout.");
      }

      // If user is logged in and opted to save recipient address to their address book
      if (user && saveRecipientToAddressBook) {
        saveAddress({
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          street1: recipient.street1,
          street2: recipient.street2,
          city: recipient.city,
          state: recipient.state,
          zip: recipient.zip,
          country: recipient.country,
          label: `${recipient.firstName}'s Address`,
        }).catch((err) => console.warn("Notice saving recipient:", err));
      }

      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);
      if (data.publishableKey) {
        setPublishableKey(data.publishableKey);
      }
      setIsMockIntent(data.isMock);
      setIsFreeOrder(Boolean(data.isFree));
      trackEvent("checkout_initiated", 4, { orderId: data.orderId, amount: data.amountInCents });
      setCurrentStep(4);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "We were unable to connect to our payment processor. Please try again shortly.";
      setCheckoutError(msg);
    } finally {
      setIsInitializingCheckout(false);
    }
  };

  const handlePaymentSuccess = (completedOrderId: string) => {
    trackEvent("payment_succeeded", 4, { orderId: completedOrderId });
    router.push(`/order/${completedOrderId}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] pb-24 text-stone-900">
      {/* TOP VENDING MACHINE HEADER */}
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-3">
          {/* Brand Mark */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center shadow-xs group-hover:bg-black transition shrink-0">
              <PenTool className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-base sm:text-xl font-bold tracking-tight text-stone-900">
                  sendmynotes<span className="text-amber-600">.com</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200/70 font-sans">
                  Atelier
                </span>
              </div>
            </div>
          </Link>

          {/* Right Header Navigation & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Clean Price Pill */}
            <div className="px-2.5 py-1 rounded-full bg-amber-50/80 border border-amber-200/80 flex items-center gap-1.5 text-xs">
              <span className="font-serif font-bold text-amber-950">
                {isFreeOrder
                  ? "Free"
                  : appliedDiscount
                  ? `$${(appliedDiscount.finalAmountInCents / 100).toFixed(2)}`
                  : "$9.00"}
              </span>
              <span className="text-[10px] text-amber-900/80 font-medium hidden xs:inline">• Postage Paid</span>
            </div>

            {/* Feedback Button */}
            <button
              type="button"
              onClick={() => setIsFeedbackModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl border border-stone-200/80 transition text-xs font-semibold cursor-pointer shrink-0"
              title="Give feedback"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden md:inline">Feedback</span>
            </button>

            {/* Auth Button */}
            {user ? (
              <Link
                href="/account"
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200/70 rounded-xl border border-stone-200 transition text-xs font-semibold text-stone-800"
              >
                <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">
                  {user.email ? user.email[0].toUpperCase() : "U"}
                </div>
                <span className="hidden sm:inline">Account</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ACTIVE PROMO / DISCOUNT BANNER */}
      {appliedDiscount && (
        <div className="bg-emerald-700 text-white px-4 py-2 text-xs font-semibold shadow-xs animate-in fade-in duration-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                Promo code <strong className="underline tracking-wider font-mono uppercase">{appliedDiscount.code}</strong> applied:{" "}
                {appliedDiscount.isFree
                  ? "100% Free Order!"
                  : appliedDiscount.type === "PERCENTAGE"
                  ? `${appliedDiscount.value}% Off at checkout!`
                  : `$${(appliedDiscount.discountAmountInCents / 100).toFixed(2)} Off at checkout!`}
              </span>
            </span>
            <button
              type="button"
              onClick={removeDiscountCode}
              className="text-white/80 hover:text-white underline text-[11px] cursor-pointer shrink-0 ml-2"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* EDITORIAL MICRO-HERO: Immediate Clarity on Value Prop */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 text-center pt-6 pb-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100/90 border border-stone-200 text-[10px] uppercase font-bold tracking-widest text-stone-600 mb-3">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>Aster &amp; Blanche Press • Lake Forest, IL</span>
        </div>

        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-stone-900 mb-2 leading-tight">
          Real Ink. Real Paper. Real Mail.
        </h1>

        <p className="text-xs sm:text-sm text-stone-600 max-w-xl mx-auto leading-relaxed mb-4">
          Type your message online in seconds. Our robotic pen plotters physically write it with real ballpoint ink on 120&nbsp;lb archival cardstock, stamped and posted via USPS First Class for a flat <strong>$9.00</strong>.
        </p>

        {/* 3-Step Horizon Micro-Bar */}
        <div className="inline-flex items-center justify-center gap-2 sm:gap-4 text-[11px] text-stone-500 bg-white/70 backdrop-blur-xs py-1.5 px-4 rounded-full border border-stone-200/60 shadow-xs flex-wrap">
          <span className="font-medium text-stone-800 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">1</span>
            Select or AI-Paint Cover
          </span>
          <span className="text-stone-300">→</span>
          <span className="font-medium text-stone-800 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">2</span>
            Type Note &amp; Pick Handwriting
          </span>
          <span className="text-stone-300">→</span>
          <span className="font-medium text-stone-800 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">3</span>
            We Ink &amp; Mail via USPS
          </span>
        </div>
      </section>

      {/* PREFILLED VIA ASSISTANT BANNER */}
      {isPrefilledFromUrl && (
        <div className="max-w-2xl mx-auto px-4 pt-2 mb-2">
          <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-950 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-xs sm:text-sm font-medium">
                Card details pre-loaded via assistant link. Feel free to review or customize below!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrefilledFromUrl(false)}
              className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP PROGRESS BAR */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <div className="grid grid-cols-4 gap-2 bg-stone-100/80 p-1.5 rounded-2xl border border-stone-200/60 max-w-2xl mx-auto mb-6 shadow-inner">
          {[
            { step: 1, label: "1. Cover Art", icon: Sparkles },
            { step: 2, label: "2. Inside Note", icon: PenTool },
            { step: 3, label: "3. Address", icon: Mail },
            { step: 4, label: "4. Checkout", icon: CreditCard },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = currentStep === item.step;
            const isCompleted = currentStep > item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => {
                  if (item.step < currentStep || (item.step === 4 && currentStep === 3)) {
                    if (item.step === 4) {
                      proceedToCheckout();
                    } else {
                      navigateToStep(item.step);
                    }
                  }
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-white text-stone-900 shadow-sm border border-stone-200"
                    : isCompleted
                    ? "text-stone-700 hover:text-stone-900"
                    : "text-stone-400 cursor-default"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-amber-600" : isCompleted ? "text-emerald-600" : ""}`} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.step}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN TWO-COLUMN WORKSPACE */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: LIVE INTERACTIVE CARD PREVIEW (Sticky) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 order-2 lg:order-1">
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl border border-stone-200/80 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-stone-400" />
                  Live Card Preview
                </span>
              </div>

              <CardPreview
                coverUrl={coverUrl}
                printedGreeting={printedGreeting}
                handwrittenNote={handwrittenNote}
                fontStyleId={fontStyleId}
                occasion={occasion}
                currentStep={currentStep}
                onNextStep={() => {
                  if (currentStep < 3) {
                    navigateToStep(currentStep + 1);
                  } else if (currentStep === 3) {
                    proceedToCheckout();
                  }
                }}
                onPreviousStep={() => {
                  if (currentStep > 1) {
                    navigateToStep(currentStep - 1);
                  }
                }}
              />

              <div className="mt-6 pt-5 border-t border-stone-100 grid grid-cols-3 gap-2 text-center text-[11px] text-stone-500">
                <div className="p-2 bg-stone-50/80 rounded-lg border border-stone-200/50">
                  <span className="block font-bold text-stone-800">5&quot; × 7&quot;</span>
                  <span className="text-[10px] text-stone-500">120 lb Cardstock</span>
                </div>
                <div className="p-2 bg-stone-50/80 rounded-lg border border-stone-200/50">
                  <span className="block font-bold text-indigo-900">Archival Ink</span>
                  <span className="text-[10px] text-stone-500">Robotic Plotter</span>
                </div>
                <div className="p-2 bg-stone-50/80 rounded-lg border border-stone-200/50">
                  <span className="block font-bold text-emerald-800">USPS Stamp</span>
                  <span className="text-[10px] text-stone-500">First Class Mail</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: STEP-BY-STEP BUILDER CONTROLS */}
          <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">
            {currentStep === 1 && (
              <CoverStep
                selectedCover={coverUrl}
                onSelectCover={handleSelectPreset}
                occasion={occasion}
                onChangeOccasion={setOccasion}
                customPrompt={customPrompt}
                onChangePrompt={setCustomPrompt}
                onContinue={() => navigateToStep(2)}
              />
            )}

            {currentStep === 2 && (
              <InsideNoteStep
                printedGreeting={printedGreeting}
                onChangePrintedGreeting={setPrintedGreeting}
                handwrittenNote={handwrittenNote}
                onChangeHandwrittenNote={setHandwrittenNote}
                fontStyleId={fontStyleId}
                onChangeFontStyleId={setFontStyleId}
                occasion={occasion}
                onChangeOccasion={setOccasion}
              />
            )}

            {currentStep === 3 && (
              <AddressStep
                recipient={recipient}
                onChangeRecipient={handleUpdateRecipient}
                returnAddress={returnAddress}
                onChangeReturnAddress={handleUpdateReturn}
                scheduledSendDate={scheduledSendDate}
                onChangeScheduledSendDate={setScheduledSendDate}
                saveRecipientToAddressBook={saveRecipientToAddressBook}
                onToggleSaveRecipient={setSaveRecipientToAddressBook}
              />
            )}

            {currentStep === 4 && (
              <CheckoutStep
                orderId={orderId}
                clientSecret={clientSecret}
                publishableKey={publishableKey}
                customerEmail={customerEmail}
                onChangeCustomerEmail={setCustomerEmail}
                onSuccess={handlePaymentSuccess}
                isMock={isMockIntent}
                scheduledSendDate={scheduledSendDate}
                appliedDiscount={appliedDiscount}
                onApplyDiscount={applyDiscountCode}
                onRemoveDiscount={removeDiscountCode}
                isFree={isFreeOrder}
              />
            )}

            {/* INLINE CHECKOUT ERROR BANNER */}
            {checkoutError && (
              <div className="p-4 bg-rose-50 border border-rose-200/90 rounded-2xl flex items-start gap-3 text-rose-900 text-xs shadow-xs animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">{checkoutError}</p>
                  <p className="text-[11px] text-rose-600 mt-1">
                    Our studio team has been automatically notified. You can click &ldquo;Proceed to Payment&rdquo; to retry or review your details.
                  </p>
                </div>
              </div>
            )}

            {/* NAVIGATION BUTTONS */}
            <div className="pt-4 border-t border-stone-200/80 flex items-center justify-between">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={() => navigateToStep(Math.max(1, currentStep - 1))}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 text-sm font-semibold hover:bg-stone-50 flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Previous Step
                </button>
              ) : (
                <div />
              )}

              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={() => navigateToStep(currentStep + 1)}
                  className="px-6 py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white text-sm font-semibold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {currentStep === 3 && (
                <button
                  type="button"
                  disabled={isInitializingCheckout}
                  onClick={() => proceedToCheckout()}
                  className="px-7 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {isFreeOrder
                      ? "Proceed to Confirmation (Free)"
                      : appliedDiscount
                      ? `Proceed to Payment ($${(appliedDiscount.finalAmountInCents / 100).toFixed(2)})`
                      : "Proceed to Payment ($9.00)"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* MOBILE FLOATING PREVIEW TRIGGER BAR */}
      <div className="lg:hidden fixed bottom-4 inset-x-4 z-30">
        <div className="bg-stone-900/95 backdrop-blur-md text-white p-2.5 pl-3 pr-3.5 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-8 aspect-[5/7] rounded-md overflow-hidden border border-white/20 shrink-0 bg-stone-800">
              <Image
                src={coverUrl}
                alt="Card thumbnail"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-amber-400 truncate">
                {occasion} Card
              </span>
              <span className="block text-xs font-medium text-stone-200 truncate">
                {currentStep === 1
                  ? "Front Cover Art"
                  : currentStep === 2
                  ? "Inside Note"
                  : currentStep === 3
                  ? "Mailing Address"
                  : "Order Summary"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsMobilePreviewOpen(true)}
            className="px-3 py-1.5 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-semibold tracking-wide flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>Preview Card</span>
          </button>
        </div>
      </div>

      {/* MOBILE CARD PREVIEW MODAL DRAWER */}
      {isMobilePreviewOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#FAF8F5] rounded-t-3xl sm:rounded-3xl border border-stone-200 max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-700 font-serif">
                  Physical Card Preview
                </span>
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                  5&quot; × 7&quot;
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobilePreviewOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col items-center">
              <CardPreview
                coverUrl={coverUrl}
                printedGreeting={printedGreeting}
                handwrittenNote={handwrittenNote}
                fontStyleId={fontStyleId}
                occasion={occasion}
                currentStep={currentStep}
                onNextStep={() => {
                  setIsMobilePreviewOpen(false);
                  if (currentStep < 3) {
                    navigateToStep(currentStep + 1);
                  } else if (currentStep === 3) {
                    proceedToCheckout();
                  }
                }}
                onPreviousStep={() => {
                  if (currentStep > 1) {
                    navigateToStep(currentStep - 1);
                  }
                }}
              />
            </div>

            <div className="p-3 bg-white border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsMobilePreviewOpen(false)}
                className="w-full py-2.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-semibold tracking-wide transition cursor-pointer"
              >
                Back to Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER BADGES */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-8 border-t border-stone-200/60 text-center text-xs text-stone-400 space-y-2">
        <div className="flex items-center justify-center gap-4 text-xs font-medium text-stone-500 pb-1">
          <button
            type="button"
            onClick={() => setIsFeedbackModalOpen(true)}
            className="hover:text-stone-900 transition flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
            <span>Give App Feedback</span>
          </button>
          <span>•</span>
          <Link href="/terms" className="hover:text-stone-900 transition underline underline-offset-2">
            Terms of Service
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-stone-900 transition underline underline-offset-2">
            Privacy Policy
          </Link>
        </div>
        <p className="flex items-center justify-center gap-2">
          <span>No Account Required</span>
          <span>•</span>
          <span>Inked by Robotic Plotters in the USA</span>
          <span>•</span>
          <span>USPS First Class Delivery</span>
        </p>
        <p className="text-[11px] text-stone-400">
          sendmynotes.com &copy; {new Date().getFullYear()} — Meaningful Handwritten Greeting Cards Made Simple
        </p>
      </footer>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        currentStep={currentStep}
        initialEmail={user?.email || customerEmail}
      />
    </div>
  );
}
