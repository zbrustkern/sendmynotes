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
import { Step3EnvelopeAddressing, AddressData } from "@/components/v3/Step3EnvelopeAddressing";
import { Step4ReviewAndPayment, AppliedDiscountInfo } from "@/components/v3/Step4ReviewAndPayment";
import { Step5Confirmation } from "@/components/v3/Step5Confirmation";
import { CustomAiCommissionDrawer } from "@/components/v3/CustomAiCommissionDrawer";
import { evaluateCheckoutInitTransition } from "@/lib/payment-mode";
import { extractRecipientName, extractSenderName } from "@/components/v3/TargetPurchaseExperience";
import { trackEvent, getSessionId } from "@/lib/telemetry";
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

  // Deep link auto-selection detection: occasion routes, scenario slug, auto_select=1, or paid traffic UTMs
  const autoParam = searchParams?.get("auto_select");
  const utmSource = searchParams?.get("utm_source")?.toLowerCase();

  const isAutoSelectMode = useMemo(() => {
    return Boolean(
      scenarioSlug ||
      initialHandwrittenNote ||
      autoParam === "1" ||
      utmSource === "google" ||
      utmSource === "meta" ||
      (occasionParam && !presetParam)
    );
  }, [scenarioSlug, initialHandwrittenNote, autoParam, utmSource, occasionParam, presetParam]);

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
    return CARD_PRESETS[0];
  }, [presetParam, occasionParam]);

  const targetOccasionSlug = useMemo(() => {
    if (occasionParam) return canonicalOccasion(occasionParam);
    if (initialOccasion) return canonicalOccasion(initialOccasion);
    if (scenarioSlug) return canonicalOccasion(scenarioSlug);
    if (initialPreset?.occasion) return canonicalOccasion(initialPreset.occasion);
    return "thinking-of-you";
  }, [occasionParam, initialOccasion, scenarioSlug, initialPreset?.occasion]);

  const resolvedInitialPresetId = scenarioSlug || initialPreset?.id || CARD_PRESETS[0].id;
  const resolvedInitialPresetTitle =
    scenarioTitle || initialPreset?.title || (occasionParam ? `${occasionParam} Card` : CARD_PRESETS[0].title);
  const resolvedInitialPresetUrl = initialCoverUrl || initialPreset?.imageUrl || CARD_PRESETS[0].imageUrl;

  const { draft, dispatch, clearDraft, isLoaded } = useDraft({
    experienceVersion: "candidate_v1",
    initialPresetId: resolvedInitialPresetId,
    initialPresetTitle: resolvedInitialPresetTitle,
    initialPresetUrl: resolvedInitialPresetUrl,
    initialOccasion: occasionParam || initialPreset?.occasion,
    initialHandwrittenNote: parsedScenario?.bodyNote,
    initialSalutation: parsedScenario?.salutation,
    initialSignOff: parsedScenario?.signOff,
    initialFontStyleId: mappedInitialFont,
  });

  // Current active step (curated deep links & paid ads default directly to 'note' studio)
  const effectiveInitialStep: FlowStep = isAutoSelectMode
    ? "note"
    : (initialStep || "card");

  const [step, setStep] = useState<FlowStep>(effectiveInitialStep);
  const [isOrderConfirmed, setIsOrderConfirmed] = useState(false);

  // Address deferral bypass & mobile keyboard/validation states
  const [isAddressDeferred, setIsAddressDeferred] = useState(false);
  const [addressValidationError, setAddressValidationError] = useState<string | null>(null);
  const [restoredToast, setRestoredToast] = useState(false);

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

  const [sender, setSender] = useState<AddressData>({
    fullName: "",
    street1: "",
    city: "",
    state: "",
    zip: "",
  });

  const [userCustomizedRecipientName, setUserCustomizedRecipientName] = useState(false);
  const [userCustomizedSenderName, setUserCustomizedSenderName] = useState(false);

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
    }

    const currentDesignOccasion = canonicalOccasion(draft.selectedDesign?.occasion);
    const isDesignMismatched = Boolean(
      draft.selectedDesign &&
      (
        currentDesignOccasion !== targetOccasionSlug ||
        (scenarioSlug && draft.selectedDesign.presetId && draft.selectedDesign.presetId !== scenarioSlug) ||
        (!scenarioSlug && draft.selectedDesign.presetId && draft.selectedDesign.presetId === "loss-of-beloved-pet" && targetOccasionSlug === "sympathy")
      )
    );

    if ((!draft.selectedDesign || isDesignMismatched) && (resolvedInitialPresetUrl && resolvedInitialPresetTitle)) {
      if (isDesignMismatched) {
        try {
          localStorage.removeItem("smn_active_draft_v2");
          if (currentDesignOccasion) {
            localStorage.removeItem(`smn_active_draft_v2_${currentDesignOccasion}`);
          }
        } catch {
          // ignore
        }
      }

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

      if (isDesignMismatched) {
        const starterNote = parsedScenario?.bodyNote || initialPreset?.defaultHandwrittenNote || "";
        dispatch({
          type: "UPDATE_NOTE",
          payload: {
            text: starterNote,
            salutation: parsedScenario?.salutation || "",
            signOff: parsedScenario?.signOff || "",
            style: mappedInitialFont,
          },
        });
        setSalutation(parsedScenario?.salutation || "");
        setSignOff(parsedScenario?.signOff || "");
      }
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
      setRecipient({
        fullName: draft.recipient.name || "",
        street1: draft.recipient.addressLine1 || "",
        street2: draft.recipient.addressLine2 || "",
        city: draft.recipient.city || "",
        state: draft.recipient.state || "",
        zip: draft.recipient.zip || "",
      });
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
  }, [
    isLoaded,
    draft.completed,
    draft.currentStep,
    draft.selectedDesign,
    draft.note.salutation,
    draft.note.signOff,
    draft.recipient,
    draft.sender,
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
    try {
      const scopedKey = `smn_active_draft_v2_${targetOccasionSlug}`;
      const saved = localStorage.getItem(scopedKey) || localStorage.getItem("smn_active_draft_v2");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") return;

      const savedOccasion = canonicalOccasion(parsed.canonicalOccasion || parsed.occasionSlug);
      const isCrossOccasion = Boolean(
        savedOccasion !== targetOccasionSlug ||
        (scenarioSlug && parsed.scenarioSlug && parsed.scenarioSlug !== scenarioSlug) ||
        (!scenarioSlug && parsed.scenarioSlug && parsed.scenarioSlug === "loss-of-beloved-pet" && targetOccasionSlug === "sympathy")
      );

      // If cross-occasion draft detected:
      // DO NOT restore note, greeting, sign-off, or cover from foreign occasion!
      // Completely clear mismatched draft from global localStorage so old occasion never bleeds!
      if (isCrossOccasion) {
        try {
          localStorage.removeItem("smn_active_draft_v2");
          if (savedOccasion) {
            localStorage.removeItem(`smn_active_draft_v2_${savedOccasion}`);
          }
        } catch {
          // ignore
        }

        if (parsed.recipientAddress && !recipient.fullName && !recipient.street1) {
          setRecipient(parsed.recipientAddress);
        }
        if (parsed.senderAddress && !sender.fullName && !sender.street1) {
          setSender(parsed.senderAddress);
        }
        if (isAutoSelectMode) {
          setStep("note");
        }
        return;
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
          setIsAddressDeferred(Boolean(parsed.addressDeferred));
        }
        if (parsed.recipientAddress && !recipient.fullName && !recipient.street1) {
          setRecipient(parsed.recipientAddress);
        }
        if (parsed.senderAddress && !sender.fullName && !sender.street1) {
          setSender(parsed.senderAddress);
        }
        if (parsed.currentStep && parsed.currentStep !== "confirmation") {
          if (isAutoSelectMode) {
            // Requirement 2: If fresh visitor arrives with ?auto_select=1 and has no existing insideNoteText in localStorage,
            // auto_select=1 must take precedence and set active step to Inside Note Editor immediately.
            if (!parsed.insideNoteText?.trim()) {
              setStep("note");
            } else if (parsed.currentStep !== "card") {
              setStep(parsed.currentStep as FlowStep);
            } else {
              setStep("note");
            }
          } else if (!initialStep) {
            setStep(parsed.currentStep as FlowStep);
          }
        }
        setRestoredToast(true);
        const t = setTimeout(() => setRestoredToast(false), 4500);
        return () => clearTimeout(t);
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
      const draftData = {
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
        senderAddress: sender,
        currentStep: step,
        addressDeferred: isAddressDeferred,
        updatedAt: Date.now(),
      };
      localStorage.setItem(`smn_active_draft_v2_${targetOccasionSlug}`, JSON.stringify(draftData));
      localStorage.setItem("smn_active_draft_v2", JSON.stringify(draftData));
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
    step,
    isAddressDeferred,
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
    dispatch({
      type: "UPDATE_NOTE",
      payload: { text: newText },
    });
    trackEvent("inside_note_edited", 2, {
      charCount: newText.length,
      hasContent: newText.trim().length > 0,
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
      country: "USA",
    };
    dispatch({ type: "UPDATE_RECIPIENT", payload: mapped });
  };

  // Handle sender address updates
  const handleUpdateSender = (field: keyof AddressData, value: string) => {
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
        const fallback = initialPreset || CARD_PRESETS[0];
        dispatch({
          type: "SELECT_DESIGN",
          payload: {
            presetId: fallback.id,
            imageUrl: fallback.imageUrl,
            title: fallback.title,
            occasion: fallback.occasion,
            source: "preset",
            accepted: true,
          },
        });
      } else {
        dispatch({ type: "ACCEPT_DESIGN" });
      }

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
      return;
    }
    if (!isAddressDeferred) {
      if (!recipient.street1.trim()) {
        const err = "Please provide the recipient's street address.";
        setAddressValidationError(err);
        trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
        return;
      }
      if (!recipient.city.trim() || !recipient.state.trim() || !recipient.zip.trim()) {
        const err = "Please complete the recipient's City, State, and ZIP code.";
        setAddressValidationError(err);
        trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
        return;
      }
    }
    if (!sender.fullName.trim()) {
      const err = "Please provide your name for your return address.";
      setAddressValidationError(err);
      trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
      return;
    }
    if (!isAddressDeferred && (!sender.city.trim() || !sender.state.trim())) {
      const err = "Please provide your city and state for your return address.";
      setAddressValidationError(err);
      trackEvent("step_4a_address_viewed", 4, { last_validation_error: err });
      return;
    }

    setAddressValidationError(null);
    trackEvent("step_4b_address_completed", 4, {
      used_address_deferral: isAddressDeferred,
    });
    initializeCheckout();
  };

  // Initialize PaymentIntent when advancing from address to pay
  const initializeCheckout = async (overrideDiscountCode?: string) => {
    setCheckoutInitError(null);
    setIsInitializingCheckout(true);

    try {
      const fullHandwrittenMessage = [salutation, draft.note.text, signOff]
        .filter(Boolean)
        .join("\n\n");

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
          sessionId: getSessionId(),
          experienceVersion: draft.experienceVersion || "candidate_v1",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize payment gateway.");
      }

      const decision = evaluateCheckoutInitTransition(true);
      if (!decision.canAdvance) {
        throw new Error(decision.errorMessage || "Unable to proceed to payment.");
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
      setAmountInCents(data.finalAmountInCents ?? data.amountInCents ?? 900);
      setCheckoutInitError(null);

      trackEvent("address_completed", 3, {
        hasReturnAddress: Boolean(sender.street1 && sender.city),
        usedAddressDeferral: isAddressDeferred,
      });
      trackEvent("step_5_checkout_initiated", 5, {
        isMock: Boolean(data.isMock),
        isFree: Boolean(data.isFree),
        amountInCents: data.finalAmountInCents ?? data.amountInCents ?? 900,
      });
      trackGA4AddShippingInfo({
        itemId: currentCard.presetId || "card",
        itemName: currentCard.title,
        price: 9.0,
        shippingTier: "USPS First Class",
      });

      setStep("pay");
      dispatch({ type: "SET_STEP", payload: "pay" });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Payment is temporarily unavailable. Your card and message are saved. Please try again shortly.";
      console.warn("Notice initializing checkout intent:", msg);
      evaluateCheckoutInitTransition(false);
      setCheckoutInitError(msg);
    } finally {
      setIsInitializingCheckout(false);
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
      dispatch({ type: "SET_DISCOUNT_CODE", payload: data.code });

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
    dispatch({ type: "SET_DISCOUNT_CODE", payload: null });
    await initializeCheckout("");
  };

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

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`smn_active_draft_v2_${targetOccasionSlug}`);
        localStorage.removeItem("smn_active_draft_v2");
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

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`smn_active_draft_v2_${targetOccasionSlug}`);
        localStorage.removeItem("smn_active_draft_v2");
        sessionStorage.removeItem("smn_checkout_order_id");
        sessionStorage.removeItem("smn_checkout_view_token");
        sessionStorage.removeItem("smn_completed_order_id");
        sessionStorage.removeItem("smn_completed_view_token");
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
      !clientSecret &&
      !isInitializingCheckout &&
      !checkoutInitError &&
      !isOrderConfirmed
    ) {
      initializeCheckout();
    }
  }, [isLoaded, step, clientSecret, isInitializingCheckout, checkoutInitError, isOrderConfirmed]);

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
        {!embedded && <FlowHeader showClearDraft={false} onClearDraft={resetEntireFlow} />}
        <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
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
      {!embedded && <FlowHeader showClearDraft={true} onClearDraft={resetEntireFlow} />}

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
          <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
            <Step2NoteComposition
              hideFixedActionBar={true}
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
              onBack={() => {
                setStep("card");
                dispatch({ type: "SET_STEP", payload: "card" });
              }}
              onContinue={() => handleStepTransition("address")}
            />
          </div>
        )}

        {step === "address" && (
          <div className="max-w-4xl mx-auto px-4 py-6 pb-32 space-y-4">
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
              onChangeAddressDeferred={setIsAddressDeferred}
              onValidationError={(err) => setAddressValidationError(err)}
              onBack={() => {
                setStep("note");
                dispatch({ type: "SET_STEP", payload: "note" });
              }}
              onContinue={handleAddressSubmit}
            />
          </div>
        )}

        {step === "pay" && (
          <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
            <Step4ReviewAndPayment
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

      {/* 4. PERSISTENT BOTTOM ACTION BAR (Steps 1 to 3) */}
      {step !== "pay" && (
        <ActionBar
          priceDisplay="$9 total"
          priceSubtext="USPS mailing included"
          primaryLabel={
            step === "card"
              ? "Write your note"
              : step === "note"
              ? "Add mailing address"
              : "Review & pay"
          }
          isLoading={isInitializingCheckout}
          isDisabled={step === "note" && !draft.note.text.trim()}
          onPrimaryClick={() => {
            if (step === "card") {
              handleStepTransition("note");
            } else if (step === "note") {
              handleStepTransition("address");
            } else if (step === "address") {
              handleAddressSubmit();
            }
          }}
          secondaryAction={
            step !== "card" ? (
              <button
                type="button"
                onClick={() => {
                  if (step === "note") {
                    setStep("card");
                    dispatch({ type: "SET_STEP", payload: "card" });
                  }
                  if (step === "address") {
                    setStep("note");
                    dispatch({ type: "SET_STEP", payload: "note" });
                  }
                }}
                className="text-xs text-stone-600 hover:text-stone-900 font-medium px-3 py-2 rounded-lg hover:bg-stone-100 transition cursor-pointer"
              >
                {step === "note" ? "Change card" : "Edit note"}
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
