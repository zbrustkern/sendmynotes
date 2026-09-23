"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { CardPreview } from "./CardPreview";
import { CoverStep } from "./CoverStep";
import { InsideNoteStep } from "./InsideNoteStep";
import { AddressStep } from "./AddressStep";
import { CheckoutStep } from "./CheckoutStep";
import { CARD_PRESETS, CardPreset } from "@/lib/card-presets";
import { MailingAddress } from "@/lib/types";
import { trackEvent } from "@/lib/telemetry";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "./AuthModal";
import Link from "next/link";
import { User, LogIn } from "lucide-react";

export function VendingMachineBuilder() {
  const router = useRouter();
  const { user, account, saveAddress } = useAuth();

  // Builder Steps: 1 = Cover, 2 = Inside Note, 3 = Address, 4 = Checkout
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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

  // Move to Step 4 and create PaymentIntent
  const proceedToCheckout = async () => {
    setIsInitializingCheckout(true);
    trackEvent("address_completed", 3);
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
      trackEvent("checkout_initiated", 4, { orderId: data.orderId, amount: 900 });
      setCurrentStep(4);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error initializing payment";
      alert(msg);
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
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20">
              <PenTool className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-stone-900">
                  sendmynotes<span className="text-amber-600">.com</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                  No Account Required
                </span>
              </div>
              <p className="text-xs text-stone-500 hidden sm:block">
                AI-designed 5×7 greeting cards, written with real pens by robotic plotters.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="block text-[10px] uppercase font-semibold text-stone-400">Flat Rate</span>
              <span className="font-serif text-base sm:text-lg font-bold text-stone-900 leading-none">
                $9.00 <span className="text-xs font-sans font-normal text-emerald-600">Postage Incl.</span>
              </span>
            </div>

            <div className="h-6 w-px bg-stone-200 hidden sm:block" />

            {user ? (
              <Link
                href="/account"
                className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200/70 rounded-xl border border-stone-200 transition text-xs font-semibold text-stone-800"
              >
                <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">
                  {user.email ? user.email[0].toUpperCase() : "U"}
                </div>
                <span className="hidden md:inline">My Account</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200/70 rounded-xl border border-stone-200 transition text-xs font-semibold text-stone-700 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* STEP PROGRESS BAR */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid grid-cols-4 gap-2 bg-stone-100/80 p-1.5 rounded-2xl border border-stone-200/60 max-w-2xl mx-auto mb-8 shadow-inner">
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
              />

              <div className="mt-6 pt-5 border-t border-stone-100 grid grid-cols-3 gap-2 text-center text-[11px] text-stone-500">
                <div className="p-2 bg-stone-50 rounded-lg">
                  <span className="block font-bold text-stone-800">5&quot; × 7&quot;</span>
                  <span>Heavy Cardstock</span>
                </div>
                <div className="p-2 bg-stone-50 rounded-lg">
                  <span className="block font-bold text-indigo-700">Real Ink</span>
                  <span>Handwritten</span>
                </div>
                <div className="p-2 bg-stone-50 rounded-lg">
                  <span className="block font-bold text-emerald-700">USPS Stamp</span>
                  <span>First Class Mail</span>
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
              />
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
                  onClick={proceedToCheckout}
                  className="px-7 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-500 text-white text-sm font-bold shadow-lg shadow-amber-500/25 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <span>Proceed to Payment ($9.00)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER BADGES */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 pt-8 border-t border-stone-200/60 text-center text-xs text-stone-400 space-y-2">
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
    </div>
  );
}
