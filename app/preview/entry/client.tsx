"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CARD_PRESETS, OCCASIONS, CardPreset, matchOccasionToPreset, getTopPresetForOccasion, canonicalOccasion } from "@/lib/card-presets";
import { useDraft, AddressDraft } from "@/lib/draft";
import {
  FlowHeader,
  ProgressIndicator,
  ActionBar,
  EntryCardStep,
  FlowStep,
} from "@/components/flow";
import { Step2NoteComposition, HANDWRITING_STYLES } from "@/components/v3/Step2NoteComposition";
import { Step3EnvelopeAddressing, AddressData, MailingOption, isInternationalCountry } from "@/components/v3/Step3EnvelopeAddressing";
import { Step4ReviewAndPayment, AppliedDiscountInfo } from "@/components/v3/Step4ReviewAndPayment";
import { Step5Confirmation } from "@/components/v3/Step5Confirmation";
import { CustomAiCommissionDrawer } from "@/components/v3/CustomAiCommissionDrawer";
import { evaluateCheckoutInitTransition } from "@/lib/payment-mode";
import { trackEvent, trackEventV2, getSessionId } from "@/lib/telemetry";
import { bindJourneyToDraft } from "@/lib/journey-identity";
import {
  trackGA4ViewItem,
  trackGA4BeginCheckout,
  trackGA4AddShippingInfo,
  trackGA4AddPaymentInfo,
} from "@/lib/google-ads";
import {
  trackMetaViewContent,
  trackMetaAddToCart,
  trackMetaCustomizeProduct,
  trackMetaInitiateCheckout,
  trackMetaAddPaymentInfo,
} from "@/lib/meta-ads";
import { getStoredAttribution } from "@/components/AttributionTracker";
import { useAuth } from "@/context/AuthContext";
import { AlertCircle } from "lucide-react";
import { parseScenarioNote, mapScenarioFontId } from "@/lib/seo-scenarios";
import { extractRecipientName, extractSenderName } from "@/components/v3/TargetPurchaseExperience";
import { extractOfferCodeFromUrlParams } from "@/lib/discount";

export interface EntryPrototypeClientProps {
  initialOccasion?: string;
  initialPresetId?: string;
  initialCoverUrl?: string;
  initialPrintedGreeting?: string;
  initialHandwrittenNote?: string;
  initialFontStyleId?: string;
  scenarioSlug?: string;
  scenarioTitle?: string;
  embedded?: boolean;
  initialStep?: FlowStep;
}

export function EntryPrototypeClient({
  initialOccasion,
  initialPresetId,
  initialCoverUrl,
  initialPrintedGreeting,
  initialHandwrittenNote,
  initialFontStyleId,
  scenarioSlug,
  scenarioTitle,
  embedded = false,
  initialStep,
}: EntryPrototypeClientProps = {}) {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const occasionParam = initialOccasion || searchParams?.get("occasion") || undefined;
  const presetParam = initialPresetId || searchParams?.get("preset") || undefined;

  // Parse pre-seeded etiquette scenario note if provided
  const parsedScenario = useMemo(() => {
    if (initialHandwrittenNote) {
      return parseScenarioNote(initialHandwrittenNote);
    }
    return null;
  }, [initialHandwrittenNote]);

  // Map legacy numerical font IDs to Handwrytten SVG handwriting styles
  const mappedInitialFont = useMemo(() => {
    return mapScenarioFontId(initialFontStyleId);
  }, [initialFontStyleId]);

  // Contextual deep link auto-selection detection: only for specific scenario routes or curated occasion/card deep links.
  // Generic ad traffic, sitelinks, and generic auto_select=1 do NOT auto-select a card or skip to note.
  const isAutoSelectMode = useMemo(() => {
    return Boolean(
      scenarioSlug ||
      initialHandwrittenNote ||
      (occasionParam && initialCoverUrl)
    );
  }, [scenarioSlug, initialHandwrittenNote, occasionParam, initialCoverUrl]);

  // Resolve contextual preselection if specified
  const initialPreset = useMemo(() => {
    if (presetParam) {
      const found = CARD_PRESETS.find((p) => p.id.toLowerCase() === presetParam.toLowerCase());
      if (found) return found;
    }
    if (occasionParam) {
      const found = matchOccasionToPreset(occasionParam);
      if (found) return found;
    }
    return undefined;
  }, [presetParam, occasionParam]);

  const targetOccasionSlug = useMemo(() => {
    if (occasionParam) return canonicalOccasion(occasionParam);
    if (initialOccasion) return canonicalOccasion(initialOccasion);
    if (scenarioSlug) return canonicalOccasion(scenarioSlug);
    if (isAutoSelectMode && initialPreset?.occasion) return canonicalOccasion(initialPreset.occasion);
    return "general";
  }, [occasionParam, initialOccasion, scenarioSlug, isAutoSelectMode, initialPreset?.occasion]);

  const resolvedInitialPresetId = isAutoSelectMode
    ? (scenarioSlug || initialPreset?.id || CARD_PRESETS[0].id)
    : undefined;
  const resolvedInitialPresetTitle = isAutoSelectMode
    ? (scenarioTitle || initialPreset?.title || (occasionParam ? `${occasionParam} Card` : CARD_PRESETS[0].title))
    : undefined;
  const resolvedInitialPresetUrl = isAutoSelectMode
    ? (initialCoverUrl || initialPreset?.imageUrl || CARD_PRESETS[0].imageUrl)
    : undefined;

  const { draft, dispatch, clearDraft, isLoaded } = useDraft({
    experienceVersion: "candidate_v1",
    initialPresetId: resolvedInitialPresetId,
    initialPresetTitle: resolvedInitialPresetTitle,
    initialPresetUrl: resolvedInitialPresetUrl,
    initialOccasion: isAutoSelectMode ? (occasionParam || initialPreset?.occasion) : undefined,
    initialHandwrittenNote: parsedScenario?.bodyNote,
    initialSalutation: parsedScenario?.salutation,
    initialSignOff: parsedScenario?.signOff,
    initialFontStyleId: mappedInitialFont,
  });

  // Current active step (curated deep links default directly to 'note' studio; generic entries start on 'card' selector)
  const effectiveInitialStep: FlowStep = initialStep || (isAutoSelectMode ? "note" : "card");

  const [step, setStep] = useState<FlowStep>(effectiveInitialStep);
  const [isOrderConfirmed, setIsOrderConfirmed] = useState(false);

  // Address deferral bypass & mobile keyboard/validation states
  const [isAddressDeferred, setIsAddressDeferred] = useState(false);
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);
  const [restoredToast, setRestoredToast] = useState(false);
  const [hasCustomUserEdits, setHasCustomUserEdits] = useState(false);

  // Mark draft as containing real user edits (persisted to localStorage)
  const markUserCustomEdit = useCallback(() => {
    setHasCustomUserEdits(true);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("hasCustomUserEdits", "true");
        localStorage.setItem(`hasCustomUserEdits_${targetOccasionSlug}`, "true");
      } catch {
        // ignore
      }
    }
  }, [targetOccasionSlug]);

  // Custom AI drawer state
  const [isCustomAiOpen, setIsCustomAiOpen] = useState(false);

  // Salutation and signoff helper state (for note step auto-sync)
  const [salutation, setSalutation] = useState(parsedScenario?.salutation || "");
  const [signOff, setSignOff] = useState(parsedScenario?.signOff || "");

  // Address editing state (bridged with draft)
  const [recipient, setRecipient] = useState<AddressData>({
    fullName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
  });
  const [domesticRecipient, setDomesticRecipient] = useState<AddressData>({ fullName: "", street1: "", street2: "", city: "", state: "", zip: "" });
  const [internationalRecipient, setInternationalRecipient] = useState<AddressData | null>(null);
  const [mailingOptions, setMailingOptions] = useState<{ destinations: MailingOption[]; enabled: boolean; previewAvailable?: boolean } | null>(null);
  const isInternational = isInternationalCountry(recipient.country);

  const [sender, setSender] = useState<AddressData>({
    fullName: "",
    street1: "",
    city: "",
    state: "",
    zip: "",
  });

  const [userCustomizedRecipientName, setUserCustomizedRecipientName] = useState(false);
  const [userCustomizedSenderName, setUserCustomizedSenderName] = useState(false);
  const [userCustomizedNote, setUserCustomizedNote] = useState(false);

  // Payment & checkout state
  const [customerEmail, setCustomerEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [fulfillmentStatus, setFulfillmentStatus] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isMockCheckout, setIsMockCheckout] = useState(false);
  const [isFreeOrder, setIsFreeOrder] = useState(false);
  const [amountInCents, setAmountInCents] = useState(900);
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscountInfo | null>(null);
  const [checkoutInitError, setCheckoutInitError] = useState<string | null>(null);
  const [isInitializingCheckout, setIsInitializingCheckout] = useState(false);
  const checkoutRequestInFlight = React.useRef(false);
  const discountRequestInFlight = React.useRef(false);
  const addressRevision = React.useRef(0);
  const currentDisplayTotalCents = isInternational
    ? (appliedDiscount?.finalAmountInCents ?? draft.appliedOffer?.finalAmountInCents ?? 900) + 500
    : amountInCents;

  useEffect(() => {
    let alive = true;
    fetch("/api/mailing-options", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((options) => {
        if (!alive || !options || !Array.isArray(options.destinations)) return;
        setMailingOptions({ destinations: options.destinations, enabled: options.enabled === true, previewAvailable: options.previewAvailable === true });
      })
      .catch(() => { if (alive) setMailingOptions(null); });
    return () => { alive = false; };
  }, []);

  // Pre-fill user email if authenticated
  useEffect(() => {
    if (user?.email && !customerEmail) {
      setCustomerEmail(user.email);
    }
  }, [user, customerEmail]);

  // Sync draft to local state once loaded and verify any completed order server-side
  useEffect(() => {
    if (!isLoaded) return;

    if (draft.completed) {
      // Recover checkout identity from storage and verify with server
      const savedOrderId =
        (typeof window !== "undefined"
          ? sessionStorage.getItem("smn_completed_order_id") ||
            sessionStorage.getItem("smn_checkout_order_id")
          : null) || "";
      const savedViewToken =
        (typeof window !== "undefined"
          ? sessionStorage.getItem("smn_completed_view_token") ||
            (savedOrderId ? sessionStorage.getItem(`order_token_${savedOrderId}`) : null)
          : null) || null;

      if (savedOrderId) {
        setOrderId(savedOrderId);
        if (savedViewToken) setViewToken(savedViewToken);

        // Verify order on server before presenting confirmation
        fetch(`/api/orders/${savedOrderId}${savedViewToken ? `?token=${encodeURIComponent(savedViewToken)}` : ""}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.order && data.order.status !== "PENDING_PAYMENT") {
              setFulfillmentStatus(data.order.status);
              setIsOrderConfirmed(true);
            } else {
              // Not paid on server — never treat a client completed bit as proof of payment!
              setIsOrderConfirmed(false);
              dispatch({ type: "SET_STEP", payload: "pay" });
              setStep("pay");
            }
          })
          .catch(() => {
            setIsOrderConfirmed(false);
          });
      } else {
        // No order identity found — do not certify completed
        setIsOrderConfirmed(false);
      }
    } else if (isAutoSelectMode) {
      // Auto-selection takes precedence over default "card" currentStep from createInitialDraft
      if (draft.currentStep === "address" || draft.currentStep === "pay") {
        setStep(draft.currentStep as FlowStep);
      } else {
        setStep("note");
      }
    } else if (draft.currentStep && draft.currentStep !== "confirmation") {
      setStep(draft.currentStep as FlowStep);
    } else if (initialStep) {
      setStep(initialStep);
    } else if (initialHandwrittenNote) {
      setStep("note");
    } else if (typeof window !== "undefined" && window.innerWidth >= 1024 && !searchParams?.get("step")) {
      setStep("note");
    }

    if (!draft.selectedDesign && (resolvedInitialPresetUrl && resolvedInitialPresetTitle)) {
      dispatch({
        type: "SELECT_DESIGN",
        payload: {
          presetId: resolvedInitialPresetId,
          imageUrl: resolvedInitialPresetUrl,
          title: resolvedInitialPresetTitle,
          occasion: occasionParam || initialPreset?.occasion || targetOccasionSlug,
          source: "preset",
          accepted: isAutoSelectMode || Boolean(initialHandwrittenNote),
        },
      });
    }

    if (draft.note.salutation !== undefined && draft.note.salutation !== "") {
      setSalutation(draft.note.salutation);
    } else if (parsedScenario?.salutation) {
      setSalutation(parsedScenario.salutation);
    }
    if (draft.note.signOff !== undefined && draft.note.signOff !== "") {
      setSignOff(draft.note.signOff);
    } else if (parsedScenario?.signOff) {
      setSignOff(parsedScenario.signOff);
    }

    if (draft.recipient) {
      const restoredRecipient = {
        fullName: draft.recipient.name || "",
        street1: draft.recipient.addressLine1 || "",
        street2: draft.recipient.addressLine2 || "",
        city: draft.recipient.city || "",
        state: draft.recipient.state || "",
        zip: draft.recipient.zip || "",
        country: draft.recipient.country || "US",
      };
      setRecipient(restoredRecipient);
      if (!isInternationalCountry(restoredRecipient.country)) setDomesticRecipient(restoredRecipient);
      else setInternationalRecipient(restoredRecipient);
      if (draft.recipient.name) {
        setUserCustomizedRecipientName(true);
      }
    }

    if (draft.sender) {
      setSender({
        fullName: draft.sender.name || "",
        street1: draft.sender.addressLine1 || "",
        city: draft.sender.city || "",
        state: draft.sender.state || "",
        zip: draft.sender.zip || "",
      });
      if (draft.sender.name) {
        setUserCustomizedSenderName(true);
      }
    }

    if (draft.appliedOffer) {
      setAppliedDiscount({
        code: draft.appliedOffer.code,
        type: draft.appliedOffer.discountType,
        value: draft.appliedOffer.discountValue,
        discountAmountInCents: draft.appliedOffer.discountAmountInCents,
        finalAmountInCents: draft.appliedOffer.finalAmountInCents,
        isFree: Boolean(draft.appliedOffer.isFree),
      });
      setIsFreeOrder(Boolean(draft.appliedOffer.isFree));
      setAmountInCents(draft.appliedOffer.finalAmountInCents);
    }
  }, [
    isLoaded,
    draft.completed,
    draft.currentStep,
    draft.selectedDesign,
    draft.note.salutation,
    draft.note.signOff,
    draft.recipient,
    draft.sender,
    draft.appliedOffer,
    initialPreset,
    resolvedInitialPresetUrl,
    targetOccasionSlug,
    mappedInitialFont,
    resolvedInitialPresetTitle,
    resolvedInitialPresetId,
    occasionParam,
    initialStep,
    initialHandwrittenNote,
    parsedScenario?.salutation,
    parsedScenario?.signOff,
    isAutoSelectMode,
    dispatch,
  ]);

  // Hydrate draft from localStorage (scoped by occasion) for Meta in-app browser resilience
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 2. Once Per Browser Tab Session (sessionStorage Guard)
    const isAlreadyHydrated = sessionStorage.getItem("smn_draft_hydrated") === "1";
    sessionStorage.setItem("smn_draft_hydrated", "1");

    try {
      const scopedKey = `smn_active_draft_v2_${targetOccasionSlug}`;
      const saved = localStorage.getItem(scopedKey) || localStorage.getItem("smn_active_draft_v2");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") return;

      const savedOccasion = canonicalOccasion(parsed.canonicalOccasion || parsed.occasionSlug);
      const isCrossOccasion = Boolean(
        targetOccasionSlug !== "general" &&
        (
          savedOccasion !== targetOccasionSlug ||
          (scenarioSlug && parsed.scenarioSlug && parsed.scenarioSlug !== scenarioSlug) ||
          (!scenarioSlug && parsed.scenarioSlug && parsed.scenarioSlug === "loss-of-beloved-pet" && targetOccasionSlug === "sympathy")
        )
      );

      // If cross-occasion draft detected:
      // DO NOT restore note, greeting, sign-off, or cover from foreign occasion!
      // Completely clear mismatched draft from global localStorage so old occasion never bleeds!
      if (isCrossOccasion) {
        try {
          localStorage.removeItem("smn_active_draft_v2");
          localStorage.removeItem("hasCustomUserEdits");
          if (savedOccasion) {
            localStorage.removeItem(`smn_active_draft_v2_${savedOccasion}`);
            localStorage.removeItem(`hasCustomUserEdits_${savedOccasion}`);
          }
        } catch {
          // ignore
        }

        if (parsed.recipientAddress && !recipient.fullName && !recipient.street1) {
          setRecipient(parsed.recipientAddress);
          if (parsed.domesticRecipientAddress) setDomesticRecipient(parsed.domesticRecipientAddress);
          else if (isInternationalCountry(parsed.recipientAddress.country)) setInternationalRecipient(parsed.recipientAddress);
        }
        if (parsed.senderAddress && !sender.fullName && !sender.street1) {
          setSender(parsed.senderAddress);
        }
        if (isAutoSelectMode) {
          setStep("note");
        }
        return;
      }

      // 1. Require Real User Edits (hasCustomUserEdits === true)
      const hasRealUserEdits = Boolean(
        parsed.hasCustomUserEdits === true ||
        localStorage.getItem("hasCustomUserEdits") === "true" ||
        localStorage.getItem(`hasCustomUserEdits_${targetOccasionSlug}`) === "true"
      );

      if (hasRealUserEdits) {
        setHasCustomUserEdits(true);
      }

      if (
        parsed &&
        (parsed.insideNoteText || parsed.recipientName || parsed.recipientAddress?.fullName || parsed.senderName)
      ) {
        if (parsed.salutation && !salutation) setSalutation(parsed.salutation);
        if (parsed.signOff && !signOff) setSignOff(parsed.signOff);
        if (parsed.insideNoteText && !draft.note.text) {
          dispatch({ type: "UPDATE_NOTE", payload: { text: parsed.insideNoteText } });
        }
        if (parsed.addressDeferred !== undefined) {
          const savedCountry = parsed.recipientAddress?.country;
          const savedInternational = isInternationalCountry(savedCountry);
          setIsAddressDeferred(savedInternational ? false : Boolean(parsed.addressDeferred));
        }
        if (parsed.recipientAddress && !recipient.fullName && !recipient.street1) {
          setRecipient(parsed.recipientAddress);
          if (parsed.domesticRecipientAddress) setDomesticRecipient(parsed.domesticRecipientAddress);
          if (parsed.internationalRecipientAddress) setInternationalRecipient(parsed.internationalRecipientAddress);
          else if (isInternationalCountry(parsed.recipientAddress.country)) setInternationalRecipient(parsed.recipientAddress);
        }
        if (parsed.senderAddress && !sender.fullName && !sender.street1) {
          setSender(parsed.senderAddress);
        }
        if (parsed.currentStep && parsed.currentStep !== "confirmation") {
          if (isAutoSelectMode) {
            // Contextual deep links: open note editor unless user had already navigated deeper
            if (!parsed.insideNoteText?.trim()) {
              setStep("note");
            } else if (parsed.currentStep !== "card") {
              setStep(parsed.currentStep as FlowStep);
            } else {
              setStep("note");
            }
          } else if (hasRealUserEdits && parsed.currentStep !== "card") {
            // Returning visitor with genuine edits: preserve saved work
            setStep(parsed.currentStep as FlowStep);
          } else if (!initialStep) {
            setStep(parsed.currentStep as FlowStep);
          }
        }

        if (!isAlreadyHydrated) {
          const draftId = parsed.draftId || `draft_${targetOccasionSlug}`;
          bindJourneyToDraft(draftId);
          trackEventV2("draft_resumed", {
            draftId,
            restoredStep: parsed.currentStep || "note",
            hasEdits: hasRealUserEdits,
          });
        }

        // Only display "Welcome back" toast if draft has real user edits AND tab was not already hydrated
        if (hasRealUserEdits && !isAlreadyHydrated) {
          setRestoredToast(true);
          const t = setTimeout(() => setRestoredToast(false), 4500);
          return () => clearTimeout(t);
        }
      }
    } catch {
      // ignore
    }
  }, [
    targetOccasionSlug,
    isAutoSelectMode,
    initialStep,
    salutation,
    signOff,
    draft.note.text,
    recipient.fullName,
    recipient.street1,
    sender.fullName,
    sender.street1,
    dispatch,
  ]);

  // Current selected card details
  const currentCard = useMemo(() => {
    if (draft.selectedDesign) {
      const presetMatch = CARD_PRESETS.find((p) => p.id === draft.selectedDesign?.presetId);
      const occasion =
        draft.selectedDesign.occasion ||
        presetMatch?.occasion ||
        (draft.selectedDesign.source === "preset"
          ? CARD_PRESETS.find((p) => p.title === draft.selectedDesign?.title)?.occasion
          : undefined) ||
        occasionParam ||
        CARD_PRESETS[0].occasion;

      return {
        imageUrl: draft.selectedDesign.imageUrl,
        title: draft.selectedDesign.title,
        presetId: draft.selectedDesign.presetId,
        occasion,
      };
    }
    const defaultPreset = initialPreset || CARD_PRESETS[0];
    return {
      imageUrl: defaultPreset.imageUrl,
      title: defaultPreset.title,
      presetId: defaultPreset.id,
      occasion: defaultPreset.occasion,
    };
  }, [draft.selectedDesign, initialPreset, occasionParam]);

  // Telemetry on initial load
  useEffect(() => {
    trackEvent("session_start", 1, { experience: "candidate_v1" });
    trackEvent("step_1_landed", 1, {
      landingPath: typeof window !== "undefined" ? window.location.pathname : undefined,
      auto_selected: isAutoSelectMode,
      autoSelected: isAutoSelectMode,
    });
    trackEventV2("entry_viewed", {
      entryRoute: typeof window !== "undefined" ? window.location.pathname : "/",
      occasion: occasionParam || currentCard.occasion,
      scenarioSlug,
    });
    trackEventV2("cover_loaded", {
      presetId: resolvedInitialPresetId || currentCard.presetId,
      occasion: occasionParam || currentCard.occasion,
      autoSelected: isAutoSelectMode,
      auto_selected: isAutoSelectMode,
      source: isAutoSelectMode ? "scenario_seeded" : "preset_default",
    });

    if (initialHandwrittenNote) {
      trackEventV2("note_template_loaded", {
        charCount: initialHandwrittenNote.length,
        occasion: occasionParam,
        scenarioSlug,
        noteEdited: false,
        wasEdited: false,
      });
    }

    const promo = extractOfferCodeFromUrlParams(searchParams);
    if (promo) {
      trackEventV2("offer_viewed", {
        promoCode: promo,
        source: "url_param",
      });
    }

    if (isAutoSelectMode) {
      trackEvent("step_2_cover_ready", 1, {
        presetId: resolvedInitialPresetId || currentCard.presetId,
        occasion: occasionParam || currentCard.occasion,
        title: resolvedInitialPresetTitle || currentCard.title,
        auto_selected: true,
        autoSelected: true,
      });
    }
    trackGA4ViewItem({
      itemId: resolvedInitialPresetId || CARD_PRESETS[0].id,
      itemName: resolvedInitialPresetTitle || CARD_PRESETS[0].title,
      price: 9.0,
      itemCategory: occasionParam || CARD_PRESETS[0].occasion,
    });
    trackMetaViewContent({
      contentId: resolvedInitialPresetId || CARD_PRESETS[0].id,
      contentName: resolvedInitialPresetTitle || CARD_PRESETS[0].title,
      contentCategory: occasionParam || CARD_PRESETS[0].occasion,
      value: 9.0,
    });
  }, [
    isAutoSelectMode,
    resolvedInitialPresetId,
    resolvedInitialPresetTitle,
    occasionParam,
    currentCard.presetId,
    currentCard.occasion,
    currentCard.title,
  ]);

  // Active handwriting font
  const activeFont = useMemo(() => {
    const styleId = draft.note.style || "hwDavid";
    return HANDWRITING_STYLES.find((f) => f.id === styleId) || HANDWRITING_STYLES[0];
  }, [draft.note.style]);

  // Keystroke-level localStorage persistence (Meta In-App Browser Rescue)
  useEffect(() => {
    if (typeof window === "undefined" || !isLoaded || isOrderConfirmed) return;
    try {
      const draftId = `draft_${targetOccasionSlug}`;
      bindJourneyToDraft(draftId);
      const draftData = {
        draftId,
        coverId: currentCard.presetId,
        occasionSlug: currentCard.occasion,
        canonicalOccasion: targetOccasionSlug,
        scenarioSlug: scenarioSlug || undefined,
        insideNoteText: draft.note.text,
        salutation,
        signOff,
        fontStyleId: draft.note.style || "hwDavid",
        senderName: sender.fullName,
        recipientName: recipient.fullName,
        recipientAddress: recipient,
        domesticRecipientAddress: domesticRecipient,
        internationalRecipientAddress: internationalRecipient,
        senderAddress: sender,
        currentStep: step,
        addressDeferred: isAddressDeferred,
        hasCustomUserEdits,
        updatedAt: Date.now(),
      };
      localStorage.setItem(`smn_active_draft_v2_${targetOccasionSlug}`, JSON.stringify(draftData));
      localStorage.setItem("smn_active_draft_v2", JSON.stringify(draftData));
      if (hasCustomUserEdits) {
        localStorage.setItem("hasCustomUserEdits", "true");
        localStorage.setItem(`hasCustomUserEdits_${targetOccasionSlug}`, "true");
      }
    } catch {
      // ignore
    }
  }, [
    isLoaded,
    isOrderConfirmed,
    currentCard.presetId,
    currentCard.occasion,
    targetOccasionSlug,
    draft.note.text,
    draft.note.style,
    salutation,
    signOff,
    sender,
    recipient,
    domesticRecipient,
    internationalRecipient,
    step,
    isAddressDeferred,
    hasCustomUserEdits,
  ]);

  // Handle card selection from grid
  const handleSelectPreset = (preset: CardPreset) => {
    dispatch({
      type: "SELECT_DESIGN",
      payload: {
        presetId: preset.id,
        imageUrl: preset.imageUrl,
        title: preset.title,
        occasion: preset.occasion,
        source: "preset",
        accepted: false,
      },
    });

    trackEvent("cover_preset_selected", 1, {
      presetId: preset.id,
      title: preset.title,
      occasion: preset.occasion,
    });
    trackEventV2("cover_selected", {
      presetId: preset.id,
      occasion: preset.occasion,
      source: "preset_picker",
      autoSelected: false,
      auto_selected: false,
    });
  };

  // Handle Custom AI generation selection (Finding 8: never transmit customer prompt to Meta)
  const handleSelectCustomCover = (art: { imageUrl: string; prompt: string; occasion: string }) => {
    dispatch({
      type: "SELECT_DESIGN",
      payload: {
        imageUrl: art.imageUrl,
        title: "Custom Artwork Card",
        occasion: art.occasion,
        source: "custom",
        accepted: true,
      },
    });

    trackEvent("custom_generation_completed", 1, {
      occasion: art.occasion,
    });
    trackEvent("card_completed", 1, {
      cardType: "custom",
    });
    trackEventV2("cover_selected", {
      occasion: art.occasion,
      source: "custom_ai",
      autoSelected: false,
      auto_selected: false,
    });

    trackMetaCustomizeProduct({
      customizationType: "AI Art Generated",
      occasion: art.occasion,
      contentName: "Custom Artwork Card",
    });
    trackMetaAddToCart({
      contentId: "custom_ai",
      contentName: "Custom Artwork Card",
      value: 9.0,
    });

    setStep("note");
    dispatch({ type: "SET_STEP", payload: "note" });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Auto-sync Salutation -> Recipient Full Name and persist to draft
  const handleSalutationChange = (newSalutation: string) => {
    markUserCustomEdit();
    if (!userCustomizedNote) {
      setUserCustomizedNote(true);
      trackEventV2("note_edit_started", {
        inputField: "salutation",
        charCount: newSalutation.length,
      });
    }
    setSalutation(newSalutation);
    dispatch({ type: "UPDATE_NOTE", payload: { salutation: newSalutation } });
    if (!userCustomizedRecipientName) {
      const extracted = extractRecipientName(newSalutation);
      setRecipient((prev) => ({ ...prev, fullName: extracted }));
      dispatch({
        type: "UPDATE_RECIPIENT",
        payload: {
          name: extracted,
          addressLine1: recipient.street1,
          addressLine2: recipient.street2,
          city: recipient.city,
          state: recipient.state,
          zip: recipient.zip,
        },
      });
    }
  };

  // Auto-sync Sign-Off -> Sender Full Name and persist to draft
  const handleSignOffChange = (newSignOff: string) => {
    markUserCustomEdit();
    if (!userCustomizedNote) {
      setUserCustomizedNote(true);
      trackEventV2("note_edit_started", {
        inputField: "signOff",
        charCount: newSignOff.length,
      });
    }
    setSignOff(newSignOff);
    dispatch({ type: "UPDATE_NOTE", payload: { signOff: newSignOff } });
    if (!userCustomizedSenderName) {
      const extracted = extractSenderName(newSignOff);
      setSender((prev) => ({ ...prev, fullName: extracted }));
      dispatch({
        type: "UPDATE_SENDER",
        payload: {
          name: extracted,
          addressLine1: sender.street1,
          city: sender.city,
          state: sender.state,
          zip: sender.zip,
        },
      });
    }
  };

  // Handle note body change
  const handleBodyNoteChange = (newText: string) => {
    markUserCustomEdit();
    if (!userCustomizedNote) {
      setUserCustomizedNote(true);
      trackEventV2("note_edit_started", {
        inputField: "note",
        charCount: newText.length,
      });
    }
    dispatch({
      type: "UPDATE_NOTE",
      payload: { text: newText },
    });
    trackEvent("inside_note_edited", 2, {
      charCount: newText.length,
      hasContent: newText.trim().length > 0,
      noteEdited: true,
      isDirty: true,
    });
  };

  // Handle handwriting style change
  const handleFontStyleChange = (newFontId: string) => {
    dispatch({
      type: "UPDATE_NOTE",
      payload: { style: newFontId },
    });
    trackEvent("font_style_selected", 2, { fontId: newFontId });
  };

  // Handle recipient address updates
  const handleUpdateRecipient = (field: keyof AddressData, value: string) => {
    if (checkoutRequestInFlight.current) return;
    addressRevision.current += 1;
    markUserCustomEdit();
    if (field === "fullName") {
      setUserCustomizedRecipientName(true);
    }
    const updated = { ...recipient, [field]: value };
    setRecipient(updated);

    const mapped: AddressDraft = {
      name: updated.fullName,
      addressLine1: updated.street1,
      addressLine2: updated.street2,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      country: updated.country || "USA",
    };
    dispatch({ type: "UPDATE_RECIPIENT", payload: mapped });
  };

  const handleSaveInternationalRecipient = (address: AddressData) => {
    if (checkoutRequestInFlight.current) return;
    addressRevision.current += 1;
    if (!isInternational) setDomesticRecipient(recipient);
    setInternationalRecipient(address);
    setRecipient(address);
    setIsAddressDeferred(false);
    // Immediately unbind any previously initialized domestic payment form. A fresh
    // server response is required before payment can be shown for this destination.
    setClientSecret(null);
    setOrderId("");
    setViewToken(null);
    setCheckoutInitError(null);
    dispatch({ type: "SET_CHECKOUT_SNAPSHOT", payload: null });
    const mapped: AddressDraft = { name: address.fullName, addressLine1: address.street1, addressLine2: address.street2, city: address.city, state: address.state, zip: address.zip, country: address.country };
    dispatch({ type: "UPDATE_RECIPIENT", payload: mapped });
    markUserCustomEdit();
  };

  const handleUseUSRecipient = () => {
    if (checkoutRequestInFlight.current) return;
    addressRevision.current += 1;
    if (isInternational) setInternationalRecipient(recipient);
    const restored = { ...domesticRecipient, country: "US" };
    setRecipient(restored);
    setAmountInCents(appliedDiscount?.finalAmountInCents ?? draft.appliedOffer?.finalAmountInCents ?? 900);
    setIsAddressDeferred(false);
    setClientSecret(null);
    setOrderId("");
    setViewToken(null);
    setCheckoutInitError(null);
    dispatch({ type: "SET_CHECKOUT_SNAPSHOT", payload: null });
    dispatch({ type: "UPDATE_RECIPIENT", payload: { name: restored.fullName, addressLine1: restored.street1, addressLine2: restored.street2, city: restored.city, state: restored.state, zip: restored.zip, country: "US" } });
  };

  // Handle sender address updates
  const handleUpdateSender = (field: keyof AddressData, value: string) => {
    markUserCustomEdit();
    if (field === "fullName") {
      setUserCustomizedSenderName(true);
    }
    const updated = { ...sender, [field]: value };
    setSender(updated);

    const mapped: AddressDraft = {
      name: updated.fullName,
      addressLine1: updated.street1,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      country: "USA",
    };
    dispatch({ type: "UPDATE_SENDER", payload: mapped });
  };

  // Navigation handlers
  const handleStepTransition = (nextStep: FlowStep) => {
    if (nextStep === "note") {
      if (!draft.selectedDesign) {
        return;
      }
      dispatch({ type: "ACCEPT_DESIGN" });

      trackEvent("card_completed", 1, {
        presetId: draft.selectedDesign?.presetId,
        cardType: draft.selectedDesign?.source || "preset",
      });
      trackEvent("step_2_cover_ready", 1, {
        presetId: draft.selectedDesign?.presetId || currentCard.presetId,
        occasion: currentCard.occasion,
      });
      trackMetaAddToCart({
        contentId: currentCard.presetId || "card",
        contentName: currentCard.title,
        value: 9.0,
      });
    } else if (nextStep === "address") {
      // Auto-carry names from salutation and sign-off into recipient and sender
      const extractedRec = extractRecipientName(salutation);
      if (extractedRec && (!recipient.fullName.trim() || recipient.fullName.toLowerCase() === "friend")) {
        setRecipient((prev) => ({ ...prev, fullName: extractedRec }));
        dispatch({
          type: "UPDATE_RECIPIENT",
          payload: {
            name: extractedRec,
            addressLine1: recipient.street1,
            addressLine2: recipient.street2,
            city: recipient.city,
            state: recipient.state,
            zip: recipient.zip,
            country: "USA",
          },
        });
      }

      const extractedSnd = extractSenderName(signOff);
      if (extractedSnd && (!sender.fullName.trim() || sender.fullName.toLowerCase() === "friend")) {
        setSender((prev) => ({ ...prev, fullName: extractedSnd }));
        dispatch({
          type: "UPDATE_SENDER",
          payload: {
            name: extractedSnd,
            addressLine1: sender.street1,
            city: sender.city,
            state: sender.state,
            zip: sender.zip,
            country: "USA",
          },
        });
      }

      const noteWasEdited = Boolean(
        userCustomizedNote ||
        hasCustomUserEdits ||
        (initialHandwrittenNote && draft.note.text !== initialHandwrittenNote) ||
        (!initialHandwrittenNote && draft.note.text.trim().length > 0)
      );

      trackEventV2("note_confirmed", {
        charCount: draft.note.text.length,
        fontId: draft.note.style || "hwDavid",
        wasEdited: noteWasEdited,
        noteEdited: noteWasEdited,
        hasPrintedGreeting: Boolean(salutation || signOff),
      });
      trackEventV2("address_viewed", {
        deferred: isAddressDeferred,
      });

      trackEvent("note_completed", 2, {
        charCount: draft.note.text.length,
        fontId: draft.note.style || "hwDavid",
      });
      trackEvent("step_4a_address_viewed", 4);
      trackGA4BeginCheckout({
        itemId: currentCard.presetId || "card",
        itemName: currentCard.title,
        price: 9.0,
      });
      trackMetaInitiateCheckout({
        contentName: currentCard.title,
        value: 9.0,
      });
    }

    setStep(nextStep);
    dispatch({ type: "SET_STEP", payload: nextStep });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Validate address and transition to checkout (never disable button silently without explanation)
  const handleAddressSubmit = () => {
    trackEvent("step_4a_address_viewed", 4);
    if (!recipient.fullName.trim()) {
      const err = "Please provide the recipient's full name.";
      setAddressValidationError(err);
      trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
      trackEventV2("address_validation_failed", {
        errorCategory: "missing_recipient_name",
        fieldName: "recipient.fullName",
      });
      return;
    }
    if (!isAddressDeferred) {
      if (!recipient.street1.trim()) {
        const err = "Please provide the recipient's street address.";
        setAddressValidationError(err);
        trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
        trackEventV2("address_validation_failed", {
          errorCategory: "missing_recipient_street",
          fieldName: "recipient.street1",
        });
        return;
      }
      const mailingRule = mailingOptions?.destinations.find((destination) => destination.countryCode === recipient.country);
      const needsRegion = isInternational ? Boolean(mailingRule?.regionRequired) : true;
      const needsPostal = isInternational ? Boolean(mailingRule?.postalCodeRequired) : true;
      if (!recipient.city.trim() || (needsRegion && !recipient.state.trim()) || (needsPostal && !recipient.zip.trim())) {
        const err = isInternational ? "Please complete the required locality, region, and postal details for this destination." : "Please complete the recipient's City, State, and ZIP code.";
        setAddressValidationError(err);
        trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
        trackEventV2("address_validation_failed", {
          errorCategory: "missing_recipient_city_state_zip",
        });
        return;
      }
    }
    if (!sender.fullName.trim()) {
      const err = "Please provide your name for your return address.";
      setAddressValidationError(err);
      trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
      trackEventV2("address_validation_failed", {
        errorCategory: "missing_sender_name",
        fieldName: "sender.fullName",
      });
      return;
    }
    if (!isAddressDeferred && (!sender.city.trim() || !sender.state.trim())) {
      const err = "Please provide your city and state for your return address.";
      setAddressValidationError(err);
      trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
      trackEventV2("address_validation_failed", {
        errorCategory: "missing_sender_city_state",
      });
      return;
    }

    setAddressValidationError(null);
    trackEvent("step_4b_address_completed", 4, {
      used_address_deferral: isAddressDeferred,
    });
    if (isAddressDeferred) {
      trackEventV2("address_deferred", {
        reason: "sender_will_provide_later",
      });
    } else {
      trackEventV2("address_confirmed", {
        hasReturnAddress: Boolean(sender.street1 && sender.city),
        hasRecipientStreet2: Boolean(recipient.street2),
      });
    }
    initializeCheckout();
  };

  // Initialize PaymentIntent when advancing from address to pay
  const initializeCheckout = async (
    overrideDiscountCode?: string,
    expectedAmountInCents?: number,
    allowDuringDiscountValidation = false
  ) => {
    if (checkoutRequestInFlight.current || (discountRequestInFlight.current && !allowDuringDiscountValidation)) return false;
    checkoutRequestInFlight.current = true;
    const requestedAddressRevision = addressRevision.current;
    setCheckoutInitError(null);
    setIsInitializingCheckout(true);
    // Invalidate the previous provider/order binding while the server recalculates
    // the current destination and offer. The prior offer remains visible until the
    // matching replacement response succeeds, but its payment form cannot submit.
    setClientSecret(null);
    setOrderId("");
    setViewToken(null);
    setIsFreeOrder(false);
    dispatch({ type: "SET_CHECKOUT_SNAPSHOT", payload: null });

    try {
      const discountCodeToUse =
        overrideDiscountCode !== undefined
          ? overrideDiscountCode
          : appliedDiscount?.code || draft.appliedOffer?.code || draft.discountCode || undefined;

      let discountToApply =
        discountCodeToUse && appliedDiscount?.code === discountCodeToUse
          ? appliedDiscount
          : null;
      const shouldRevalidateDiscount = Boolean(
        discountCodeToUse && draft.appliedOffer?.code === discountCodeToUse
      );
      if (discountCodeToUse && (!discountToApply || shouldRevalidateDiscount)) {
        const validationResponse = await fetch("/api/discount/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: discountCodeToUse }),
        });
        let validation: AppliedDiscountInfo & { valid?: boolean; error?: string };
        try {
          validation = await validationResponse.json();
        } catch {
          throw new Error("Unable to validate your saved discount code. Please retry checkout.");
        }
        const definitiveInvalidCode =
          (validationResponse.status >= 400 && validationResponse.status < 500) ||
          (validationResponse.ok && validation.valid === false);
        if (definitiveInvalidCode) {
          dispatch({ type: "SET_DISCOUNT_CODE", payload: null });
          dispatch({ type: "SET_APPLIED_OFFER", payload: null });
          throw new Error(validation.error || "Your saved discount code is no longer valid. Retry checkout to continue at the regular price.");
        }
        if (!validationResponse.ok || validation.valid !== true) {
          throw new Error(validation.error || "Unable to validate your saved discount code. Please retry checkout.");
        }
        discountToApply = validation;
      }

      trackEventV2("checkout_requested", {
        amountInCents: currentDisplayTotalCents,
        hasDiscount: Boolean(discountCodeToUse),
        isAddressDeferred,
      });

      const fullHandwrittenMessage = [salutation, draft.note.text, signOff]
        .filter(Boolean)
        .join("\n\n");

      const recParts = recipient.fullName.trim().split(/\s+/);
      const recipientFirstName = recParts[0] || "Friend";
      const recipientLastName = recParts.slice(1).join(" ") || "";

      const senderParts = sender.fullName.trim().split(/\s+/);
      const senderFirstName = senderParts[0] || "Friend";
      const senderLastName = senderParts.slice(1).join(" ") || "";

      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasion: currentCard.occasion,
          frontImageUrl: currentCard.imageUrl,
          printedMessage: "",
          handwrittenNote: fullHandwrittenMessage,
          fontStyleId: draft.note.style || "hwDavid",
          addressDeferred: isAddressDeferred,
          address_deferred: isAddressDeferred,
          recipientAddress: {
            firstName: recipientFirstName,
            lastName: recipientLastName,
            street1: recipient.street1,
            street2: recipient.street2 || undefined,
            city: recipient.city,
            state: recipient.state,
            zip: recipient.zip,
            country: recipient.country || "US",
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
          sessionId: getSessionId(),
          experienceVersion: draft.experienceVersion || "candidate_v1",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize payment gateway.");
      }
      if (requestedAddressRevision !== addressRevision.current) {
        throw new Error("The recipient address changed while checkout was updating. Please review it and try again.");
      }

      const decision = evaluateCheckoutInitTransition(true);
      if (!decision.canAdvance) {
        throw new Error(decision.errorMessage || "Unable to proceed to payment.");
      }

      const expectedPrice = expectedAmountInCents !== undefined
        ? expectedAmountInCents + (isInternational ? 500 : 0)
        : discountCodeToUse ? (discountToApply?.finalAmountInCents ?? 900) + (isInternational ? 500 : 0) : 900 + (isInternational ? 500 : 0);
      const serverPrice = data.quote?.totalCents ?? data.finalAmountInCents ?? data.amountInCents;
      if (expectedPrice !== undefined && serverPrice !== expectedPrice) {
        throw new Error("Your checkout total changed. Please retry checkout and reapply your code.");
      }

      setOrderId(data.orderId);
      if (data.viewToken) {
        setViewToken(data.viewToken);
      }
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("smn_checkout_order_id", data.orderId);
          if (data.viewToken) {
            sessionStorage.setItem("smn_checkout_view_token", data.viewToken);
            sessionStorage.setItem(`order_token_${data.orderId}`, data.viewToken);
          }
        } catch {
          // ignore
        }
      }
      setClientSecret(data.clientSecret);
      if (data.publishableKey) {
        setPublishableKey(data.publishableKey);
      }
      setIsMockCheckout(Boolean(data.isMock));
      setIsFreeOrder(Boolean(data.isFree));
      setAmountInCents(data.quote?.totalCents ?? data.finalAmountInCents ?? data.amountInCents ?? 900);
      setAppliedDiscount(discountToApply);
      if (discountToApply) {
        dispatch({
          type: "SET_APPLIED_OFFER",
          payload: {
            code: discountToApply.code,
            quoteId: (discountToApply as any).quoteId,
            offerId: (discountToApply as any).offerId,
            offerVersion: (discountToApply as any).offerVersion,
            discountType: discountToApply.type,
            discountValue: discountToApply.value,
            discountAmountInCents: discountToApply.discountAmountInCents,
            finalAmountInCents: discountToApply.finalAmountInCents,
            isFree: Boolean(discountToApply.isFree),
            quoteExpiresAt: (discountToApply as any).quoteExpiresAt,
            appliedAt: Date.now(),
          },
        });
      }
      setCheckoutInitError(null);

      trackEventV2("checkout_created", {
        orderId: data.orderId,
        isMock: Boolean(data.isMock),
        isFree: Boolean(data.isFree),
        amountInCents: data.quote?.totalCents ?? data.finalAmountInCents ?? data.amountInCents ?? 900,
      });

      trackEvent("address_completed", 3, {
        hasReturnAddress: Boolean(sender.street1 && sender.city),
        usedAddressDeferral: isAddressDeferred,
      });
      trackEvent("step_5_checkout_initiated", 5, {
        isMock: Boolean(data.isMock),
        isFree: Boolean(data.isFree),
        amountInCents: data.quote?.totalCents ?? data.finalAmountInCents ?? data.amountInCents ?? 900,
      });
      trackGA4AddShippingInfo({
        itemId: currentCard.presetId || "card",
        itemName: currentCard.title,
        price: (data.quote?.totalCents ?? data.finalAmountInCents ?? data.amountInCents ?? 900) / 100,
        shippingTier: isInternational ? "International mailing" : "USPS First Class",
      });

      setStep("pay");
      dispatch({ type: "SET_STEP", payload: "pay" });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Payment is temporarily unavailable. Your card and message are saved. Please try again shortly.";
      console.warn("Notice initializing checkout intent:", msg);
      evaluateCheckoutInitTransition(false);
      setCheckoutInitError(msg);
      return false;
    } finally {
      checkoutRequestInFlight.current = false;
      setIsInitializingCheckout(false);
    }
  };

  // Promo code validation
  const handleApplyDiscount = async (code: string) => {
    if (discountRequestInFlight.current || checkoutRequestInFlight.current) return { success: false, error: "Checkout is updating. Please try again." };
    discountRequestInFlight.current = true;
    trackEventV2("discount_apply_requested", {
      promoCode: code.trim(),
    });
    try {
      const res = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        trackEventV2("discount_rejected", {
          promoCode: code.trim(),
          rejectionReason: data.error || "invalid_code",
        });
        return { success: false, error: data.error || "Invalid promo code." };
      }

      const previousOrderId = orderId;
      if (step === "pay" && !await initializeCheckout(data.code, data.finalAmountInCents, true)) {
        return { success: false, error: "Unable to update your payment. Please retry checkout before paying." };
      }
      if (step === "pay" && previousOrderId) {
        await fetch("/api/discount/validate", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: previousOrderId }),
        }).catch(() => {});
      }
      setAppliedDiscount(data);
      // On the payment step initializeCheckout has already atomically created a
      // new server-priced intent. Keep its authoritative international total
      // and free-order status (a base-only 100% offer still owes the surcharge).
      if (step !== "pay") {
        setIsFreeOrder(Boolean(data.isFree));
        setAmountInCents(data.finalAmountInCents ?? 900);
      }
      dispatch({ type: "SET_DISCOUNT_CODE", payload: data.code });
      trackEventV2("discount_applied", {
        promoCode: data.code,
        discountType: data.discountType || (data.isFree ? "free_order" : "percent_or_fixed"),
        amountSavedInCents: 900 - (data.finalAmountInCents ?? 900),
        finalAmountInCents: data.finalAmountInCents ?? 900,
      });
      dispatch({
        type: "SET_APPLIED_OFFER",
        payload: {
          code: data.code,
          quoteId: data.quoteId,
          offerId: data.offerId,
          offerVersion: data.offerVersion,
          discountType: data.type || "PERCENTAGE",
          discountValue: data.value || 0,
          discountAmountInCents: data.discountAmountInCents || 0,
          finalAmountInCents: data.finalAmountInCents ?? 900,
          isFree: Boolean(data.isFree),
          quoteExpiresAt: data.quoteExpiresAt,
          appliedAt: Date.now(),
        },
      });
      return { success: true };
    } catch {
      trackEventV2("discount_rejected", {
        promoCode: code.trim(),
        rejectionReason: "network_error",
      });
      return { success: false, error: "Unable to apply promo code." };
    } finally {
      discountRequestInFlight.current = false;
    }
  };

  const handleRemoveDiscount = async () => {
    if (discountRequestInFlight.current || checkoutRequestInFlight.current) return;
    discountRequestInFlight.current = true;
    const previousOrderId = orderId;
    try {
      if (step === "pay" && !await initializeCheckout("", 900, true)) return;
      if (step === "pay" && previousOrderId) {
        await fetch("/api/discount/validate", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: previousOrderId }),
        }).catch(() => {});
      }
      setAppliedDiscount(null);
      if (step !== "pay") {
        setIsFreeOrder(false);
        setAmountInCents(900);
      }
      dispatch({ type: "SET_DISCOUNT_CODE", payload: null });
      dispatch({ type: "SET_APPLIED_OFFER", payload: null });
      if (appliedDiscount) {
        trackEventV2("discount_removed", {
          promoCode: appliedDiscount.code,
        });
      }
    } finally {
      discountRequestInFlight.current = false;
    }
  };

  // Destination-aware auto-apply: detect ?discount=, ?code=, or ?promo= on entry routes
  useEffect(() => {
    if (!isLoaded) return;
    const codeFromUrl = extractOfferCodeFromUrlParams(searchParams);
    if (codeFromUrl && !appliedDiscount && !draft.appliedOffer) {
      handleApplyDiscount(codeFromUrl);
    }
  }, [isLoaded, searchParams]);

  // Payment success handler (server records verified telemetry)
  const handlePaymentSuccess = (
    completedOrderId: string,
    returnedViewToken?: string | null,
    status?: string | null
  ) => {
    setOrderId(completedOrderId);
    const finalToken = returnedViewToken || viewToken;
    if (finalToken) {
      setViewToken(finalToken);
    }
    if (status) {
      setFulfillmentStatus(status);
    }
    setIsOrderConfirmed(true);
    dispatch({ type: "MARK_COMPLETED" });

    trackEvent("step_6_paid_order", 6, {
      orderId: completedOrderId,
    });

    setHasCustomUserEdits(false);
    setRestoredToast(false);

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`smn_active_draft_v2_${targetOccasionSlug}`);
        localStorage.removeItem("smn_active_draft_v2");
        localStorage.removeItem("hasCustomUserEdits");
        localStorage.removeItem(`hasCustomUserEdits_${targetOccasionSlug}`);
        sessionStorage.removeItem("smn_draft_hydrated");
        sessionStorage.setItem("smn_completed_order_id", completedOrderId);
        if (finalToken) {
          sessionStorage.setItem("smn_completed_view_token", finalToken);
          sessionStorage.setItem(`order_token_${completedOrderId}`, finalToken);
        }
      } catch {
        // ignore
      }
    }
  };

  // Reset entire flow handler for "Clear draft" and "Send another card"
  const resetEntireFlow = () => {
    clearDraft();
    setIsOrderConfirmed(false);
    setStep("card");
    setIsAddressDeferred(false);
    setAddressValidationError(null);
    setSalutation("");
    setSignOff("");
    setRecipient({
      fullName: "",
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
    });
    setDomesticRecipient({ fullName: "", street1: "", street2: "", city: "", state: "", zip: "" });
    setInternationalRecipient(null);
    setSender({
      fullName: "",
      street1: "",
      city: "",
      state: "",
      zip: "",
    });
    setUserCustomizedRecipientName(false);
    setUserCustomizedSenderName(false);
    setOrderId("");
    setViewToken(null);
    setFulfillmentStatus(null);
    setClientSecret(null);
    setPublishableKey(null);
    setIsMockCheckout(false);
    setIsFreeOrder(false);
    setAmountInCents(900);
    setAppliedDiscount(null);
    setCheckoutInitError(null);
    setHasCustomUserEdits(false);
    setRestoredToast(false);

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`smn_active_draft_v2_${targetOccasionSlug}`);
        localStorage.removeItem("smn_active_draft_v2");
        localStorage.removeItem("hasCustomUserEdits");
        localStorage.removeItem(`hasCustomUserEdits_${targetOccasionSlug}`);
        sessionStorage.removeItem("smn_checkout_order_id");
        sessionStorage.removeItem("smn_checkout_view_token");
        sessionStorage.removeItem("smn_completed_order_id");
        sessionStorage.removeItem("smn_completed_view_token");
        sessionStorage.removeItem("smn_draft_hydrated");
      } catch {
        // ignore
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Auto-resume checkout intent on pay-step refresh if not already initialized
  useEffect(() => {
    if (
      isLoaded &&
      step === "pay" &&
      !orderId &&
      !isFreeOrder &&
      !clientSecret &&
      !isInitializingCheckout &&
      !checkoutInitError &&
      !isOrderConfirmed
    ) {
      initializeCheckout();
    }
  }, [isLoaded, step, orderId, isFreeOrder, clientSecret, isInitializingCheckout, checkoutInitError, isOrderConfirmed, appliedDiscount, draft.discountCode, draft.appliedOffer]);

  // Check if address is valid for advancing
  const isAddressValid = isAddressDeferred
    ? Boolean(recipient.fullName.trim() && sender.fullName.trim())
    : Boolean(
        recipient.fullName.trim() &&
          recipient.street1.trim() &&
          recipient.city.trim() &&
          recipient.state.trim() &&
          recipient.zip.trim().length >= 5 &&
          sender.fullName.trim() &&
          sender.street1.trim() &&
          sender.city.trim() &&
          sender.state.trim() &&
          sender.zip.trim().length >= 5
      );

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-stone-300 border-t-emerald-700 rounded-full animate-spin mx-auto" />
          <p className="text-xs uppercase tracking-widest text-stone-500">
            Initializing draft...
          </p>
        </div>
      </div>
    );
  }

  // Render Post-Purchase Confirmation (Step 5)
  if (isOrderConfirmed) {
    return (
      <div className={`min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col antialiased ${embedded ? "rounded-3xl border border-stone-200/90 shadow-xs overflow-hidden" : ""}`}>
        {!embedded && <FlowHeader showClearDraft={false} onClearDraft={resetEntireFlow} orderTotalCents={isInternational ? currentDisplayTotalCents : undefined} />}
        <main className="flex-1 max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <Step5Confirmation
            orderId={orderId}
            viewToken={viewToken}
            fulfillmentStatus={fulfillmentStatus || undefined}
            cardTitle={currentCard.title}
            cardUrl={currentCard.imageUrl}
            occasion={currentCard.occasion}
            salutation={salutation}
            bodyNote={draft.note.text}
            signOff={signOff}
            fontClass={activeFont.fontClass}
            recipient={recipient}
            sender={sender}
            customerEmail={customerEmail}
            amountInCents={amountInCents}
            onSendAnotherCard={resetEntireFlow}
            isAddressDeferred={isAddressDeferred || !recipient.street1?.trim()}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white text-stone-900 flex flex-col antialiased relative ${embedded ? "rounded-3xl border border-stone-200/90 shadow-xs overflow-hidden" : ""}`}>
      {/* RESTORED DRAFT HYDRATION TOAST */}
      {restoredToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 text-white px-4 py-2.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span>✨ Welcome back — your handwritten note was saved.</span>
        </div>
      )}

      {/* 1. COMPACT SENDMYNOTES FLOW HEADER (suppressed when embedded in an occasion/scenario landing page with its own navbar) */}
      {!embedded && <FlowHeader showClearDraft={true} onClearDraft={resetEntireFlow} orderTotalCents={isInternational ? currentDisplayTotalCents : undefined} />}

      {/* 2. PROGRESS INDICATOR: CARD / NOTE / ADDRESS / PAY */}
      <ProgressIndicator currentStep={step} />

      {/* 3. STEP CONTENT */}
      <main className="flex-1 w-full">
        {step === "card" && (
          <EntryCardStep
            selectedDesign={draft.selectedDesign}
            onSelectDesign={handleSelectPreset}
            onAcceptAndContinue={() => handleStepTransition("note")}
            initialOccasion={occasionParam}
            onOpenCustomArt={() => setIsCustomAiOpen(true)}
          />
        )}

        {step === "note" && (
          <div className="max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 py-4 lg:py-6 pb-28 lg:pb-8">
            <Step2NoteComposition
              hideFixedActionBar={false}
              salutation={salutation}
              onChangeSalutation={handleSalutationChange}
              bodyNote={draft.note.text}
              onChangeBodyNote={handleBodyNoteChange}
              signOff={signOff}
              onChangeSignOff={handleSignOffChange}
              fontStyleId={draft.note.style || "hwDavid"}
              onChangeFontStyleId={handleFontStyleChange}
              occasion={currentCard.occasion}
              cardTitle={currentCard.title}
              cardUrl={currentCard.imageUrl}
              scenarioSlug={scenarioSlug}
              onSelectCover={(preset) => handleSelectPreset(preset)}
              onChangeOccasion={(newOccasion, preset) => {
                const targetPreset = preset || CARD_PRESETS.find((p) => p.occasion === newOccasion) || CARD_PRESETS[0];
                dispatch({
                  type: "SELECT_DESIGN",
                  payload: {
                    presetId: targetPreset.id,
                    imageUrl: targetPreset.imageUrl,
                    title: targetPreset.title,
                    occasion: newOccasion,
                    source: "preset",
                    accepted: true,
                  },
                });
              }}
              onBack={() => {
                setStep("card");
                dispatch({ type: "SET_STEP", payload: "card" });
              }}
              onContinue={() => handleStepTransition("address")}
            />
          </div>
        )}

        {step === "address" && (
          <div className="max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 py-4 lg:py-6 pb-28 lg:pb-8 space-y-4">
            {addressValidationError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 shadow-xs animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{addressValidationError}</span>
              </div>
            )}
            {checkoutInitError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-4 text-xs text-rose-900 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{checkoutInitError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => initializeCheckout()}
                  disabled={isInitializingCheckout}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-semibold rounded-lg text-xs transition cursor-pointer shrink-0"
                >
                  {isInitializingCheckout ? "Connecting..." : "Try again"}
                </button>
              </div>
            )}
            <Step3EnvelopeAddressing
              hideFixedActionBar={true}
              recipient={recipient}
              onChangeRecipient={handleUpdateRecipient}
              sender={sender}
              onChangeSender={handleUpdateSender}
              fontClass={activeFont.fontClass}
              isAddressDeferred={isAddressDeferred}
              mailingOptions={mailingOptions}
              isBusy={isInitializingCheckout}
              isInternational={isInternational}
              onSaveInternational={handleSaveInternationalRecipient}
              savedInternationalRecipient={internationalRecipient}
              onUseUSAddress={handleUseUSRecipient}
              displayTotalCents={currentDisplayTotalCents}
              onChangeAddressDeferred={setIsAddressDeferred}
              onValidationError={(err) => setAddressValidationError(err)}
              onBack={() => {
                if (!isInitializingCheckout) {
                  setStep("note");
                  dispatch({ type: "SET_STEP", payload: "note" });
                }
              }}
              onContinue={handleAddressSubmit}
            />
          </div>
        )}

        {step === "pay" && (
          <div className="max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 py-4 lg:py-6 pb-28 lg:pb-8">
            <Step4ReviewAndPayment
              isUpdatingCheckout={isInitializingCheckout}
              checkoutError={checkoutInitError}
              onRetryCheckout={() => { void initializeCheckout(); }}
              cardTitle={currentCard.title}
              cardUrl={currentCard.imageUrl}
              salutation={salutation}
              bodyNote={draft.note.text}
              signOff={signOff}
              fontClass={activeFont.fontClass}
              fontStyleId={draft.note.style || "hwDavid"}
              occasion={currentCard.occasion}
              recipient={recipient}
              sender={sender}
              customerEmail={customerEmail}
              onChangeCustomerEmail={setCustomerEmail}
              orderId={orderId}
              clientSecret={clientSecret}
              publishableKey={publishableKey}
              isMock={isMockCheckout}
              isFree={isFreeOrder}
              amountInCents={amountInCents}
              destinationCountry={recipient.country || "US"}
              onApplyDiscount={handleApplyDiscount}
              onRemoveDiscount={handleRemoveDiscount}
              appliedDiscount={appliedDiscount}
              onPaymentSuccess={handlePaymentSuccess}
              onBack={() => {
                setStep("address");
                dispatch({ type: "SET_STEP", payload: "address" });
              }}
            />
          </div>
        )}
      </main>

      {/* 4. PERSISTENT BOTTOM ACTION BAR (Steps 1 and 3) */}
      {step !== "pay" && step !== "note" && (
        <ActionBar
          priceDisplay={isInternational || currentDisplayTotalCents !== 900 ? `$${(currentDisplayTotalCents / 100).toFixed(2)} total` : "$9 total"}
          priceSubtext={isInternational ? "International mailing included" : "USPS mailing included"}
          primaryLabel={step === "card" ? "Write your note" : "Review & pay"}
          isLoading={isInitializingCheckout}
          isDisabled={step === "card" ? !draft.selectedDesign : false}
          onPrimaryClick={() => {
            if (step === "card") {
              handleStepTransition("note");
            } else if (step === "address") {
              handleAddressSubmit();
            }
          }}
          secondaryAction={
            step === "address" ? (
              <button
                type="button"
                onClick={() => {
                  setStep("note");
                  dispatch({ type: "SET_STEP", payload: "note" });
                }}
                className="text-xs text-stone-600 hover:text-stone-900 font-medium px-3 py-2 rounded-lg hover:bg-stone-100 transition cursor-pointer"
              >
                Edit note
              </button>
            ) : undefined
          }
        />
      )}

      {/* 5. CUSTOM AI COMMISSION DRAWER */}
      <CustomAiCommissionDrawer
        isOpen={isCustomAiOpen}
        onClose={() => setIsCustomAiOpen(false)}
        onSelectCover={handleSelectCustomCover}
        currentOccasion={currentCard.occasion}
      />
    </div>
  );
}
