"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Step1CardSelection } from "./Step1CardSelection";
import { Step2NoteComposition, HANDWRITING_STYLES } from "./Step2NoteComposition";
import { Step3EnvelopeAddressing, AddressData } from "./Step3EnvelopeAddressing";
import { Step4ReviewAndPayment, AppliedDiscountInfo } from "./Step4ReviewAndPayment";
import { Step5Confirmation } from "./Step5Confirmation";
import { CARD_PRESETS, OCCASIONS, CardPreset } from "@/lib/card-presets";
import { trackEvent } from "@/lib/telemetry";
import { useAuth } from "@/context/AuthContext";
import { getStoredAttribution } from "@/components/AttributionTracker";
import { Feather, ShieldCheck } from "lucide-react";

export function extractRecipientName(salutation: string): string {
  if (!salutation) return "";
  let cleaned = salutation.trim();
  cleaned = cleaned.replace(/^(dear|dearest|to|hello|hi|hey)[:,\s]+\s*/i, "");
  cleaned = cleaned.replace(/[,!.:;]+$/, "").trim();
  return cleaned;
}

export function extractSenderName(signOff: string): string {
  if (!signOff) return "";
  let cleaned = signOff.trim();
  cleaned = cleaned.replace(
    /^(warmly|love|with love|sincerely|best regards|regards|best|cheers|yours truly|yours|affectionately|fondly|all the best)[,:\s]+/i,
    ""
  );
  cleaned = cleaned.replace(/[,!.:;]+$/, "").trim();
  return cleaned;
}

export interface TargetPurchaseExperienceProps {
  initialStep?: number;
  initialOccasion?: string;
  initialCardUrl?: string;
  initialNote?: string;
  initialSalutation?: string;
  initialSignOff?: string;
}

export function TargetPurchaseExperience(props?: TargetPurchaseExperienceProps) {
  const searchParams = useSearchParams();
  const { user, account } = useAuth();

  // 1. Step Navigation (1: Card, 2: Note, 3: Address, 4: Review/Pay, 5: Confirmation)
  const [currentStep, setCurrentStep] = useState<number>(props?.initialStep || 1);

  // 2. Card Selection State (Step 1)
  const [selectedCardUrl, setSelectedCardUrl] = useState<string>(
    props?.initialCardUrl || CARD_PRESETS[0].imageUrl
  );
  const [selectedCardTitle, setSelectedCardTitle] = useState<string>(
    CARD_PRESETS[0].title
  );
  const [occasion, setOccasion] = useState<string>(
    props?.initialOccasion || CARD_PRESETS[0].occasion
  );

  // 3. Note Composition State (Step 2)
  const [salutation, setSalutation] = useState<string>(
    props?.initialSalutation || "Dear Eleanor,"
  );
  const [bodyNote, setBodyNote] = useState<string>(
    props?.initialNote || CARD_PRESETS[0].defaultHandwrittenNote
  );
  const [signOff, setSignOff] = useState<string>(
    props?.initialSignOff || "Warmly, Thomas"
  );
  const [fontStyleId, setFontStyleId] = useState<string>("hwDavid");

  // Track if user explicitly edited recipient/sender full names in Step 3
  const [userCustomizedRecipientName, setUserCustomizedRecipientName] = useState(false);
  const [userCustomizedSenderName, setUserCustomizedSenderName] = useState(false);

  // 4. Envelope Addressing State (Step 3)
  const [recipient, setRecipient] = useState<AddressData>({
    fullName: "Eleanor Vance",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
  });

  const [sender, setSender] = useState<AddressData>({
    fullName: "Thomas Miller",
    street1: "",
    city: "",
    state: "",
    zip: "",
  });

  // 5. Checkout & Payment State (Step 4 & 5)
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isMockCheckout, setIsMockCheckout] = useState<boolean>(true);
  const [isFreeOrder, setIsFreeOrder] = useState<boolean>(false);
  const [amountInCents, setAmountInCents] = useState<number>(900);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscountInfo | null>(null);

  // Pre-fill user email and default return address if logged in
  useEffect(() => {
    if (user?.email && !customerEmail) {
      setCustomerEmail(user.email);
    }
    if (account?.defaultReturnAddress) {
      const def = account.defaultReturnAddress;
      setSender((prev) => ({
        ...prev,
        fullName: `${def.firstName} ${def.lastName}`.trim() || prev.fullName,
        street1: def.street1 || prev.street1,
        city: def.city || prev.city,
        state: def.state || prev.state,
        zip: def.zip || prev.zip,
      }));
      setUserCustomizedSenderName(true);
    }
  }, [user, account]);

  // Telemetry: track session start
  useEffect(() => {
    trackEvent("session_start", 1, { experience: "v3_target" });
  }, []);

  // Hydrate from searchParams if present
  useEffect(() => {
    if (!searchParams) return;

    const occParam = searchParams.get("occasion");
    if (occParam) {
      const matchedOcc = OCCASIONS.find(
        (o) => o.toLowerCase() === occParam.toLowerCase()
      );
      if (matchedOcc) {
        setOccasion(matchedOcc);
        const preset = CARD_PRESETS.find((p) => p.occasion === matchedOcc);
        if (preset) {
          setSelectedCardUrl(preset.imageUrl);
          setSelectedCardTitle(preset.title);
          if (!bodyNote) setBodyNote(preset.defaultHandwrittenNote);
        }
      }
    }

    const noteParam =
      searchParams.get("note") || searchParams.get("message") || searchParams.get("handwritten");
    if (noteParam) {
      setBodyNote(noteParam);
    }

    const toParam = searchParams.get("to") || searchParams.get("toName");
    if (toParam) {
      setSalutation(`Dear ${toParam},`);
      setRecipient((prev) => ({ ...prev, fullName: toParam }));
      setUserCustomizedRecipientName(true);
    }

    const fontParam = searchParams.get("font") || searchParams.get("fontId");
    if (fontParam && HANDWRITING_STYLES.some((f) => f.id === fontParam)) {
      setFontStyleId(fontParam);
    }
  }, [searchParams]);

  // Auto-sync Salutation -> Recipient Full Name
  const handleSalutationChange = (newSalutation: string) => {
    setSalutation(newSalutation);
    if (!userCustomizedRecipientName) {
      const extracted = extractRecipientName(newSalutation);
      if (extracted) {
        setRecipient((prev) => ({ ...prev, fullName: extracted }));
      }
    }
  };

  // Auto-sync Sign-Off -> Sender Full Name
  const handleSignOffChange = (newSignOff: string) => {
    setSignOff(newSignOff);
    if (!userCustomizedSenderName) {
      const extracted = extractSenderName(newSignOff);
      if (extracted) {
        setSender((prev) => ({ ...prev, fullName: extracted }));
      }
    }
  };

  // Recipient address updates
  const handleUpdateRecipient = (field: keyof AddressData, value: string) => {
    if (field === "fullName") {
      setUserCustomizedRecipientName(true);
    }
    setRecipient((prev) => ({ ...prev, [field]: value }));
  };

  // Sender address updates
  const handleUpdateSender = (field: keyof AddressData, value: string) => {
    if (field === "fullName") {
      setUserCustomizedSenderName(true);
    }
    setSender((prev) => ({ ...prev, [field]: value }));
  };

  // Presets selection handler
  const handleSelectPreset = (preset: CardPreset) => {
    setSelectedCardUrl(preset.imageUrl);
    setSelectedCardTitle(preset.title);
    setOccasion(preset.occasion);
    // If body note is currently empty or matches another preset default, update it
    const isDefaultNote = CARD_PRESETS.some((p) => p.defaultHandwrittenNote === bodyNote);
    if (!bodyNote.trim() || isDefaultNote) {
      setBodyNote(preset.defaultHandwrittenNote);
    }
  };

  // Custom AI artwork selection handler
  const handleSelectCustomArt = (art: { imageUrl: string; prompt: string; occasion: string }) => {
    setSelectedCardUrl(art.imageUrl);
    setSelectedCardTitle(`Custom AI: ${art.prompt.slice(0, 30)}...`);
    setOccasion(art.occasion);
  };

  // Active handwriting font class
  const activeFont = useMemo(() => {
    return HANDWRITING_STYLES.find((f) => f.id === fontStyleId) || HANDWRITING_STYLES[0];
  }, [fontStyleId]);

  // Navigate & Track Step
  const goToStep = (stepNumber: number) => {
    trackEvent("step_navigated", stepNumber, { fromStep: currentStep, toStep: stepNumber });
    setCurrentStep(stepNumber);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Initialize checkout PaymentIntent when proceeding from Step 3 to Step 4
  const initializeCheckout = async (overrideDiscountCode?: string) => {
    try {
      const fullHandwrittenMessage = [salutation, bodyNote, signOff].filter(Boolean).join("\n\n");

      const recParts = recipient.fullName.trim().split(/\s+/);
      const recipientFirstName = recParts[0] || "Friend";
      const recipientLastName = recParts.slice(1).join(" ") || "";

      const senderParts = sender.fullName.trim().split(/\s+/);
      const senderFirstName = senderParts[0] || "Friend";
      const senderLastName = senderParts.slice(1).join(" ") || "";

      const discountCodeToUse =
        overrideDiscountCode !== undefined
          ? overrideDiscountCode
          : appliedDiscount?.code;

      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasion,
          frontImageUrl: selectedCardUrl,
          printedMessage: "",
          handwrittenNote: fullHandwrittenMessage,
          fontStyleId,
          recipientAddress: {
            firstName: recipientFirstName,
            lastName: recipientLastName,
            street1: recipient.street1,
            street2: recipient.street2 || undefined,
            city: recipient.city,
            state: recipient.state,
            zip: recipient.zip,
            country: "USA",
          },
          returnAddress: {
            firstName: senderFirstName,
            lastName: senderLastName,
            street1: sender.street1,
            city: sender.city,
            state: sender.state,
            zip: sender.zip,
            country: "USA",
          },
          customerEmail,
          userId: user?.uid,
          discountCode: discountCodeToUse,
          attribution: getStoredAttribution() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize payment.");
      }

      setOrderId(data.orderId);
      setClientSecret(data.clientSecret);
      if (data.publishableKey) {
        setPublishableKey(data.publishableKey);
      }
      setIsMockCheckout(data.isMock);
      setIsFreeOrder(Boolean(data.isFree));
      setAmountInCents(data.amountInCents || 900);
      goToStep(4);
    } catch (err) {
      console.warn("Notice initializing checkout intent:", err);
      // Fallback: still navigate to step 4 in sandbox mode
      goToStep(4);
    }
  };

  // Promo code validation
  const handleApplyDiscount = async (code: string) => {
    try {
      const res = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        return { success: false, error: data.error || "Invalid promo code." };
      }

      setAppliedDiscount(data);
      setIsFreeOrder(Boolean(data.isFree));
      setAmountInCents(data.finalAmountInCents ?? 900);

      // Re-create payment intent with discount
      await initializeCheckout(data.code);
      return { success: true };
    } catch {
      return { success: false, error: "Unable to apply promo code." };
    }
  };

  const handleRemoveDiscount = async () => {
    setAppliedDiscount(null);
    setIsFreeOrder(false);
    setAmountInCents(900);
    await initializeCheckout("");
  };

  // Payment Success
  const handlePaymentSuccess = (completedOrderId: string) => {
    setOrderId(completedOrderId);
    trackEvent("payment_succeeded", 4, { orderId: completedOrderId });
    goToStep(5);
  };

  // Send another card: resets card/note but preserves sender address
  const handleSendAnotherCard = () => {
    setSelectedCardUrl(CARD_PRESETS[0].imageUrl);
    setSelectedCardTitle(CARD_PRESETS[0].title);
    setOccasion(CARD_PRESETS[0].occasion);
    setSalutation("Dear Eleanor,");
    setBodyNote(CARD_PRESETS[0].defaultHandwrittenNote);
    setSignOff(sender.fullName ? `Warmly, ${sender.fullName.split(" ")[0]}` : "Warmly, Thomas");
    setRecipient({
      fullName: "",
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
    });
    setUserCustomizedRecipientName(false);
    goToStep(1);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 selection:bg-amber-100 selection:text-amber-900">
      {/* TOP BRAND HEADER */}
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {/* Logo / Pedigree */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-stone-900 text-emerald-400 flex items-center justify-center font-sans font-bold text-xs shadow-2xs">
              SMN
            </div>
            <div>
              <span className="font-serif font-bold text-stone-950 text-base sm:text-lg tracking-tight block leading-tight">
                SendMyNotes
              </span>
              <span className="text-[10px] uppercase font-sans tracking-wider text-stone-500 block">
                Real Pen-Written Cards In 60 Seconds
              </span>
            </div>
          </div>

          {/* Stepper Pill Indicator (Screens 1 to 4) */}
          {currentStep <= 4 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-500 bg-stone-100/80 px-3 py-1.5 rounded-full border border-stone-200/70">
              <span className={`font-semibold ${currentStep === 1 ? "text-amber-800" : "text-stone-700"}`}>
                1. Card
              </span>
              <span className="text-stone-300">→</span>
              <span className={`font-semibold ${currentStep === 2 ? "text-amber-800" : "text-stone-700"}`}>
                2. Note
              </span>
              <span className="text-stone-300">→</span>
              <span className={`font-semibold ${currentStep === 3 ? "text-amber-800" : "text-stone-700"}`}>
                3. Address
              </span>
              <span className="text-stone-300">→</span>
              <span className={`font-semibold ${currentStep === 4 ? "text-amber-800" : "text-stone-700"}`}>
                4. Pay ($9)
              </span>
            </div>
          )}

          {/* Right badge */}
          <div className="flex items-center gap-1.5 text-xs text-stone-600 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">$9 Flat Rate</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
        {currentStep === 1 && (
          <Step1CardSelection
            selectedCardUrl={selectedCardUrl}
            selectedCardTitle={selectedCardTitle}
            selectedOccasion={occasion}
            onSelectPreset={handleSelectPreset}
            onSelectCustomArt={handleSelectCustomArt}
            onContinue={() => goToStep(2)}
          />
        )}

        {currentStep === 2 && (
          <Step2NoteComposition
            salutation={salutation}
            onChangeSalutation={handleSalutationChange}
            bodyNote={bodyNote}
            onChangeBodyNote={setBodyNote}
            signOff={signOff}
            onChangeSignOff={handleSignOffChange}
            fontStyleId={fontStyleId}
            onChangeFontStyleId={setFontStyleId}
            occasion={occasion}
            onBack={() => goToStep(1)}
            onContinue={() => goToStep(3)}
          />
        )}

        {currentStep === 3 && (
          <Step3EnvelopeAddressing
            recipient={recipient}
            onChangeRecipient={handleUpdateRecipient}
            sender={sender}
            onChangeSender={handleUpdateSender}
            fontClass={activeFont.fontClass}
            onBack={() => goToStep(2)}
            onContinue={() => initializeCheckout()}
          />
        )}

        {currentStep === 4 && (
          <Step4ReviewAndPayment
            cardTitle={selectedCardTitle}
            cardUrl={selectedCardUrl}
            salutation={salutation}
            bodyNote={bodyNote}
            signOff={signOff}
            fontClass={activeFont.fontClass}
            recipient={recipient}
            sender={sender}
            customerEmail={customerEmail}
            onChangeCustomerEmail={setCustomerEmail}
            orderId={orderId}
            clientSecret={clientSecret}
            publishableKey={publishableKey}
            isMock={isMockCheckout}
            isFree={isFreeOrder}
            onApplyDiscount={handleApplyDiscount}
            onRemoveDiscount={handleRemoveDiscount}
            appliedDiscount={appliedDiscount}
            onPaymentSuccess={handlePaymentSuccess}
            onBack={() => goToStep(3)}
          />
        )}

        {currentStep === 5 && (
          <Step5Confirmation
            orderId={orderId}
            cardTitle={selectedCardTitle}
            cardUrl={selectedCardUrl}
            occasion={occasion}
            salutation={salutation}
            bodyNote={bodyNote}
            signOff={signOff}
            fontClass={activeFont.fontClass}
            recipient={recipient}
            sender={sender}
            customerEmail={customerEmail}
            amountInCents={amountInCents}
            onSendAnotherCard={handleSendAnotherCard}
          />
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-stone-200/80 bg-white py-8 mt-12 text-center text-xs text-stone-500 space-y-2">
        <p className="font-serif font-medium text-stone-700">
          SendMyNotes • Real Ballpoint Inking &amp; First-Class USPS Delivery
        </p>
        <p className="text-[11px] text-stone-400">
          Luxury 120 lb Archival Cardstock • Flat $9.00 Rate (Postage Included)
        </p>
      </footer>
    </div>
  );
}
