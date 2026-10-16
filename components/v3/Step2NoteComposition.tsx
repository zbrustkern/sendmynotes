"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  ArrowRight,
  Check,
  AlertTriangle,
  AlertCircle,
  Eye,
  Undo2,
  Layers,
  PenTool,
} from "lucide-react";
import { OCCASION_MESSAGE_BANK, MessageInspiration, CARD_PRESETS, CardPreset } from "@/lib/card-presets";
import { Sheet } from "@/components/flow/Sheet";
import { CardPreview } from "@/components/CardPreview";
import { trackEvent } from "@/lib/telemetry";

export interface StarterPrompt {
  label: string;
  template: string;
}

export function getStarterPrompts(occasion: string, scenarioSlug?: string): StarterPrompt[] {
  const occ = (occasion || "").toLowerCase();
  const slug = (scenarioSlug || "").toLowerCase();

  // 1. Pet Loss / Pet Sympathy (100% bracket-free)
  if (slug.includes("pet") || occ.includes("pet") || (occ.includes("sympathy") && slug.includes("loss"))) {
    return [
      {
        label: "1. Warm & Short",
        template: "I was so deeply heartbroken to hear about the loss of your sweet companion. They brought so much pure joy into your life, and I am grateful you gave them such a wonderful home filled with love. Sending you the warmest hugs and strength right now.",
      },
      {
        label: "2. Rainbow Bridge",
        template: "May the joyful memories of your sweet companion bring comfort across the rainbow bridge. Thinking of you and honoring the unconditional love you shared.",
      },
      {
        label: "3. Thinking of Your Family",
        template: "Holding you and your family close in our hearts during this heartbreaking time. Here for you whenever you need a listening ear or a quiet hug.",
      },
    ];
  }

  // 2. Sympathy & Support (100% bracket-free)
  if (occ.includes("sympathy") || occ.includes("support") || occ.includes("condolence")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Sending you gentle strength, peace, and quiet comfort during this difficult time. Holding you close in my thoughts and heart.",
      },
      {
        label: "2. Fond Memories",
        template: "May the warmest memories bring solace to your heart today. Honoring a truly beautiful life and the enduring love that lives on.",
      },
      {
        label: "3. Thinking of Your Family",
        template: "Holding you and your entire family in our thoughts and prayers. We are here for you in every way, always.",
      },
    ];
  }

  // 3. Birthday (100% bracket-free)
  if (occ.includes("birthday") || occ.includes("bday")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Happy Birthday! Wishing you a joyful day filled with sunshine, laughter, and all your favorite things.",
      },
      {
        label: "2. Golden Milestones",
        template: "Celebrating you today and so proud of everything you’ve achieved this year. Here’s to an extraordinary year ahead!",
      },
      {
        label: "3. Cheers & Hugs",
        template: "Sending you the biggest birthday hugs from across the miles. Can’t wait to celebrate together very soon!",
      },
    ];
  }

  // 4. Thank You (100% bracket-free)
  if (occ.includes("thank")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Thank you so much for your incredible kindness and generosity. It truly meant the world to me!",
      },
      {
        label: "2. Heartfelt Gratitude",
        template: "I cannot thank you enough for always being in my corner. People like you make life so much brighter.",
      },
      {
        label: "3. Thinking of You",
        template: "Deeply grateful for your time, support, and friendship. Thank you from the bottom of my heart!",
      },
    ];
  }

  // 5. Congratulations (100% bracket-free)
  if (occ.includes("congrat")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Huge congratulations! So thrilled to celebrate this incredible milestone with you—pop the bubbly!",
      },
      {
        label: "2. Hard Work & Pride",
        template: "Your hard work and dedication paid off in the most wonderful way. So immensely proud of you!",
      },
      {
        label: "3. New Horizons",
        template: "Here’s to this exciting new chapter and bright horizons ahead. You earned every bit of this success!",
      },
    ];
  }

  // 6. Anniversary / Love (100% bracket-free)
  if (occ.includes("anniversary") || occ.includes("love") || occ.includes("romance")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Happy Anniversary my love! Every single day with you is a gift, and I am so grateful for you.",
      },
      {
        label: "2. Fond Memories",
        template: "Thank you for another wonderful year of laughter, partnership, and adventures. Here is to a lifetime more together.",
      },
      {
        label: "3. My Steady Anchor",
        template: "In a world of constant noise, your love is my steady anchor and favorite home. Happy Anniversary!",
      },
    ];
  }

  // Default / Thinking of You / Just Because (100% bracket-free)
  return [
    {
      label: "1. Warm & Short",
      template: "Thinking of you today and sending a little piece of sunshine your way. Hope today treats you kindly!",
    },
    {
      label: "2. Fond Memories",
      template: "You crossed my mind today and I wanted to send a reminder of how much you are loved. Grateful for our friendship!",
    },
    {
      label: "3. Big Hugs",
      template: "Sending you warmth, strength, and big hugs from afar. Can’t wait to catch up very soon!",
    },
  ];
}

export interface HandwritingStyle {
  id: string;
  name: string;
  subtitle: string;
  fontClass: string;
  fontFamily: string;
  description: string;
  sample: string;
}

export const HANDWRITING_STYLES: HandwritingStyle[] = [
  {
    id: "hwDavid",
    name: "Casual David",
    subtitle: "Neat Print",
    fontClass: "font-hwDavid",
    fontFamily: "var(--font-hw-david), 'HandwryttenDavid', cursive",
    description: "Clean, natural everyday print with effortless charm.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwKate",
    name: "Carefree Kate",
    subtitle: "Warm Script",
    fontClass: "font-hwKate",
    fontFamily: "var(--font-hw-kate), 'HandwryttenKate', cursive",
    description: "Graceful, rounded cursive with flowing warmth.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwAdam",
    name: "Executive Adam",
    subtitle: "Clean Block",
    fontClass: "font-hwAdam",
    fontFamily: "var(--font-hw-adam), 'HandwryttenAdam', cursive",
    description: "Strong upright architectural lettering.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwChase",
    name: "Charming Chase",
    subtitle: "Modern Script",
    fontClass: "font-hwChase",
    fontFamily: "var(--font-hw-chase), 'HandwryttenChase', cursive",
    description: "Expressive, stylish modern handwriting.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
];

export const STUDIO_OCCASION_PILLS = [
  { label: "Thinking of You", occasion: "Thinking of You", presetId: "preset-thinking-coffee" },
  { label: "Thank You", occasion: "Thank You", presetId: "preset-thankyou-botanical" },
  { label: "Birthday", occasion: "Birthday", presetId: "preset-bday-balloons" },
  { label: "Sympathy", occasion: "Sympathy & Support", presetId: "preset-sympathy-olive" },
  { label: "Pet Loss", occasion: "Sympathy & Support", presetId: "preset-sympathy-rainbow", scenarioSlug: "loss-of-beloved-pet" },
] as const;

interface Step2NoteCompositionProps {
  salutation: string;
  onChangeSalutation: (val: string) => void;
  bodyNote: string;
  onChangeBodyNote: (val: string) => void;
  signOff: string;
  onChangeSignOff: (val: string) => void;
  fontStyleId: string;
  onChangeFontStyleId: (id: string) => void;
  occasion: string;
  onChangeOccasion?: (occ: string, defaultPreset?: CardPreset) => void;
  onBack: () => void;
  onContinue: () => void;
  hideFixedActionBar?: boolean;
  cardTitle?: string;
  cardUrl?: string;
  scenarioSlug?: string;
  onSelectCover?: (preset: CardPreset) => void;
}

export function Step2NoteComposition({
  salutation,
  onChangeSalutation,
  bodyNote,
  onChangeBodyNote,
  signOff,
  onChangeSignOff,
  fontStyleId,
  onChangeFontStyleId,
  occasion,
  onChangeOccasion,
  onBack,
  onContinue,
  hideFixedActionBar = false,
  cardTitle,
  cardUrl,
  scenarioSlug,
  onSelectCover,
}: Step2NoteCompositionProps) {
  // Quick cover switcher sheet state (for "See All 12")
  const [isCoverSheetOpen, setIsCoverSheetOpen] = useState(false);

  // Card preview sheet state for full inspection modal
  const [isPreviewCardOpen, setIsPreviewCardOpen] = useState(false);

  // 1-Tap toggle between Edit Text and Live Ballpoint Ink Preview
  const [noteMode, setNoteMode] = useState<"edit" | "preview">("edit");

  // Undo memory for starter insertion
  const [previousBodyNote, setPreviousBodyNote] = useState<string | null>(null);

  // Hard safety guard state for leftover bracket placeholders
  const [bracketWarning, setBracketWarning] = useState<string | null>(null);

  // Salutation input ref for auto-highlighting "Friend" on focus
  const salutationInputRef = useRef<HTMLInputElement>(null);

  // Active font object
  const currentFont = useMemo(() => {
    return HANDWRITING_STYLES.find((f) => f.id === fontStyleId) || HANDWRITING_STYLES[0];
  }, [fontStyleId]);

  // Combined letter text for character measurement
  const fullText = useMemo(() => {
    return [salutation, bodyNote, signOff].filter(Boolean).join("\n\n");
  }, [salutation, bodyNote, signOff]);

  const charCount = fullText.length;
  const MAX_CHARS = 450;
  const WARN_CHARS = 400;
  const isApproachingLimit = charCount >= WARN_CHARS && charCount < MAX_CHARS;
  const isAtLimit = charCount >= MAX_CHARS;

  // Track initial values on mount to differentiate between pre-filled default template and real edits
  const initialValuesRef = useRef({
    salutation,
    bodyNote,
    signOff,
  });

  const firedStep3Ref = useRef(false);

  // Emit default_template_loaded on passive mount if initial note is pre-populated
  useEffect(() => {
    if (bodyNote.trim().length > 0) {
      trackEvent("default_template_loaded", 2, {
        charCount: fullText.length,
        occasion,
        scenarioSlug,
        noteEdited: false,
      });
    }
  }, []);

  // Fire step_3_note_typed ONLY when the user actively interacts
  const markNoteAsEditedAndFireStep3 = useCallback(
    (charLength: number, fromStarterPrompt = false, field = "body") => {
      if (!firedStep3Ref.current) {
        firedStep3Ref.current = true;
        trackEvent("step_3_note_typed", 2, {
          charCount: charLength,
          usedStarterPrompt: fromStarterPrompt,
          noteEdited: true,
          isDirty: true,
          inputField: field,
        });
      }
    },
    []
  );

  const applyInspirationText = (text: string) => {
    setPreviousBodyNote(bodyNote);
    const projectedCombined = [salutation, text, signOff].filter(Boolean).join("\n\n");
    if (projectedCombined.length > MAX_CHARS) {
      const allowedBodyLen = MAX_CHARS - (salutation.length + signOff.length + 4);
      onChangeBodyNote(text.slice(0, Math.max(10, allowedBodyLen)));
    } else {
      onChangeBodyNote(text);
    }
    if (bracketWarning && !/\[.*?\]/.test(text)) {
      setBracketWarning(null);
    }
    markNoteAsEditedAndFireStep3(text.length, false, "inspiration");
  };

  // Available covers for quick switcher (all 12 presets)
  const availableCovers = useMemo(() => {
    const occasionLower = (occasion || "").toLowerCase();
    const matched = CARD_PRESETS.filter((p) => p.occasion.toLowerCase() === occasionLower);
    const others = CARD_PRESETS.filter((p) => p.occasion.toLowerCase() !== occasionLower);
    const combined = [...matched, ...others];
    return combined.slice(0, Math.max(12, combined.length));
  }, [occasion]);

  // Starter prompts bank for occasion / scenario
  const starterPrompts = useMemo(() => {
    return getStarterPrompts(occasion, scenarioSlug);
  }, [occasion, scenarioSlug]);

  const handleUseStarterPrompt = (prompt: StarterPrompt, promptNumber: number) => {
    setPreviousBodyNote(bodyNote);
    applyInspirationText(prompt.template);
    trackEvent("starter_prompt_used", 2, {
      promptLabel: prompt.label,
      occasion,
      promptNumber,
    });
    markNoteAsEditedAndFireStep3(prompt.template.length, true, "starterPrompt");
  };

  const handleUndoStarter = () => {
    if (previousBodyNote !== null) {
      onChangeBodyNote(previousBodyNote);
      setPreviousBodyNote(null);
    }
  };

  // Enforce 450 character hard cap when typing in body
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newBody = e.target.value;
    const projectedCombined = [salutation, newBody, signOff].filter(Boolean).join("\n\n");

    if (projectedCombined.length <= MAX_CHARS) {
      onChangeBodyNote(newBody);
    } else {
      const allowedBodyLen = MAX_CHARS - (salutation.length + signOff.length + (salutation ? 2 : 0) + (signOff ? 2 : 0));
      if (allowedBodyLen > 0) {
        onChangeBodyNote(newBody.slice(0, allowedBodyLen));
      }
    }

    if (bracketWarning && !/\[.*?\]/.test(`${salutation} ${newBody} ${signOff}`)) {
      setBracketWarning(null);
    }

    if (newBody !== initialValuesRef.current.bodyNote) {
      markNoteAsEditedAndFireStep3(newBody.length, false, "body");
    }
  };

  // Smart greeting focus handler: highlight the word "Friend" if present so typing replaces it in 1 keystroke
  const handleGreetingFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const friendIdx = val.indexOf("Friend");
    if (friendIdx !== -1) {
      e.target.setSelectionRange(friendIdx, friendIdx + "Friend".length);
    }
  };

  // 1-Tap Occasion Switcher handler
  const handleOccasionSwitch = (item: (typeof STUDIO_OCCASION_PILLS)[number]) => {
    const targetPreset = CARD_PRESETS.find((p) => p.id === item.presetId) || CARD_PRESETS[0];
    if (onSelectCover) {
      onSelectCover(targetPreset);
    }
    if (onChangeOccasion) {
      onChangeOccasion(item.occasion, targetPreset);
    }
    // Switch starter notes to the new occasion's top template
    const newPrompts = getStarterPrompts(item.occasion, item.label === "Pet Loss" ? "loss-of-beloved-pet" : undefined);
    if (newPrompts.length > 0) {
      applyInspirationText(newPrompts[0].template);
    }
    if (!salutation || salutation.toLowerCase().includes("friend") || salutation.toLowerCase().includes("dear")) {
      onChangeSalutation("Dear Friend,");
    }
    if (!signOff || signOff.toLowerCase().includes("warmly")) {
      onChangeSignOff("Warmly,");
    }
    setBracketWarning(null);
    trackEvent("cover_preset_selected", 2, {
      occasion: item.occasion,
      presetId: targetPreset.id,
      title: targetPreset.title,
    });
  };

  // Hard safety guard validation before advancing to Address step
  const handleProceedToAddress = () => {
    const combined = `${salutation} ${bodyNote} ${signOff}`;
    const hasBracket = /\[.*?\]/.test(combined);
    if (hasBracket) {
      setBracketWarning("Quick check: Replace [bracketed text] with a real name before continuing.");
      trackEvent("inside_note_edited", 2, {
        has_unresolved_bracket: true,
        salutation,
        signOff,
      });
      return;
    }
    setBracketWarning(null);
    onContinue();
  };

  // Detect which occasion pill is currently active
  const activeOccasionKey = useMemo(() => {
    if (scenarioSlug?.includes("pet")) return "pet loss";
    const occ = (occasion || "").toLowerCase();
    if (occ.includes("pet")) return "pet loss";
    if (occ.includes("sympathy") || occ.includes("support") || occ.includes("condolence")) return "sympathy";
    if (occ.includes("thank")) return "thank you";
    if (occ.includes("birthday") || occ.includes("bday")) return "birthday";
    return "thinking of you";
  }, [occasion, scenarioSlug]);

  return (
    <div className="w-full space-y-4">
      {/* 1. MOBILE-ONLY TOP CARD BAR (< lg) WITH HIGH-AFFORDANCE PREVIEW BUTTON */}
      <div className="lg:hidden bg-[#F9F6F0] rounded-2xl p-2.5 sm:p-3 border border-stone-200/90 shadow-2xs flex items-center justify-between gap-2.5">
        {/* Left: Mini Front Cover Artwork Thumbnail */}
        <div
          onClick={() => setIsPreviewCardOpen(true)}
          className="relative w-14 aspect-[17/22] rounded-lg overflow-hidden shadow-xs border border-stone-300 bg-stone-100 shrink-0 cursor-pointer group"
          title="Tap to preview full card and live ink"
        >
          <img
            src={cardUrl || availableCovers[0]?.imageUrl}
            alt={cardTitle || "Front Cover Artwork"}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-x-0 bottom-0 bg-stone-900/80 text-white text-[8px] font-bold text-center py-0.5 px-0.5 truncate">
            Front
          </div>
        </div>

        {/* Center: Title + Explicit High-Affordance [ Preview Card & Live Ink ] Button */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-stone-900 truncate">
              {cardTitle || "Featured Design"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsPreviewCardOpen(true)}
            className="w-full px-2.5 py-1.5 bg-amber-100/90 hover:bg-amber-200/90 active:bg-amber-300/90 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <span>🔍 Preview Card &amp; Live Ink</span>
          </button>
        </div>

        {/* Right: All Covers Button */}
        <button
          type="button"
          onClick={() => setIsCoverSheetOpen(true)}
          className="px-2 py-2 bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-300 rounded-xl text-xs font-semibold text-stone-800 shadow-2xs flex flex-col items-center justify-center gap-0.5 shrink-0 cursor-pointer min-w-[64px]"
        >
          <Layers className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-[11px] leading-tight">All Covers</span>
          <span className="text-[9px] text-stone-500 font-normal">({availableCovers.length})</span>
        </button>
      </div>

      {/* 2. MAIN TWO-COLUMN SPLIT-SCREEN WORKBENCH (lg:grid-cols-12) */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start">
        {/* LEFT COLUMN (lg:col-span-6 — The Tactile Stationery Desk) */}
        <div className="hidden lg:block lg:col-span-6 lg:sticky lg:top-6">
          <div className="bg-[#F9F6F0] rounded-3xl p-5 border border-stone-200/90 shadow-sm space-y-4">
            {/* Elevated Desk Header */}
            <div className="flex items-center justify-between border-b border-stone-200/70 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <h3 className="font-serif font-bold text-sm text-stone-900">
                  Tactile Stationery Desk
                </h3>
              </div>
              <span className="text-[11px] font-medium text-stone-500 bg-white/80 border border-stone-200 px-2 py-0.5 rounded-full">
                1:1 Real Ballpoint Pen Inking
              </span>
            </div>

            {/* Desktop "Corner Peek / Side-by-Side" Live Preview */}
            <div className="relative w-full max-w-[400px] min-h-[520px] mx-auto aspect-[17/22] rounded-2xl overflow-hidden shadow-xl border border-stone-200 bg-[#FDFCF7] paper-texture select-none group">
              {/* Blind-Deboss Inset Micro-Rule (Traditional letterpress border) */}
              <div className="absolute inset-3.5 rounded-xl border border-stone-300/40 pointer-events-none" />

              {/* Realistic Left Spine Fold Shadow (Folded card hinge) */}
              <div className="absolute left-0 top-0 bottom-0 w-[4%] bg-gradient-to-r from-stone-400/25 via-stone-300/10 to-transparent pointer-events-none z-10" />

              {/* 1:1 Live Ballpoint Ink Inside Page */}
              <div className="relative z-10 w-full h-full p-6 pt-10 flex flex-col justify-start overflow-hidden">
                <div className={`text-[#1B3B6F] whitespace-pre-line text-sm sm:text-base leading-relaxed ${currentFont.fontClass}`}>
                  {salutation && <p className="mb-2 font-medium">{salutation}</p>}
                  <p className="mb-3 min-h-[70px]">
                    {bodyNote || "Your personal note written in real ballpoint ink will appear here..."}
                  </p>
                  {signOff && <p className="font-medium">{signOff}</p>}
                </div>
              </div>

              {/* FRONT COVER ARTWORK CORNER PEEK (Tucked visibly at top-left corner) */}
              <div
                onClick={() => setIsPreviewCardOpen(true)}
                title="Click to inspect full card inside and out"
                className="absolute top-3 left-3 z-20 w-28 sm:w-32 aspect-[17/22] rounded-xl overflow-hidden shadow-2xl border-2 border-white bg-stone-100 cursor-pointer transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-200 group/peek"
              >
                <img
                  src={cardUrl || availableCovers[0]?.imageUrl}
                  alt={cardTitle || "Front Cover Artwork"}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-stone-900/85 backdrop-blur-xs text-white text-[8px] font-bold text-center py-0.5 px-1 truncate">
                  Front Artwork
                </div>
              </div>

              {/* Expand Full Spread Button (Bottom right hover) */}
              <button
                type="button"
                onClick={() => setIsPreviewCardOpen(true)}
                className="absolute bottom-2.5 right-2.5 z-20 px-2.5 py-1 bg-white/90 hover:bg-white text-stone-700 text-[10px] font-semibold rounded-lg shadow-xs border border-stone-200 flex items-center gap-1 backdrop-blur-xs transition cursor-pointer"
              >
                <Eye className="w-3 h-3 text-stone-600" />
                <span>Full Card Spread</span>
              </button>
            </div>

            {/* 1-Tap Handwriting Style Selector Pills */}
            <div className="space-y-1.5 pt-1 border-t border-stone-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800">Handwriting Style:</span>
                <span className="text-[11px] text-stone-500 font-medium">{currentFont.description}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {HANDWRITING_STYLES.map((style) => {
                  const isSelected = fontStyleId === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => onChangeFontStyleId(style.id)}
                      className={`p-2 rounded-xl transition cursor-pointer text-center flex flex-col items-center justify-center ${
                        isSelected
                          ? "bg-emerald-800 text-white shadow-xs ring-2 ring-emerald-600/30 border border-emerald-800"
                          : "bg-white text-stone-800 border border-stone-200 hover:bg-stone-50 hover:border-stone-300"
                      }`}
                    >
                      <span className={`${style.fontClass} text-[19px] sm:text-[20px] leading-tight block truncate w-full`}>
                        {style.name}
                      </span>
                      <span className={`text-[10px] font-sans font-normal mt-0.5 block ${isSelected ? "text-emerald-100" : "text-stone-500"}`}>
                        {style.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ONE Visual Cover Thumbnail Strip with "See All 12" */}
            <div className="space-y-1.5 pt-1 border-t border-stone-200/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800">Card Front Design:</span>
                <span className="text-[11px] text-stone-600 truncate max-w-[200px]">{cardTitle}</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {availableCovers.slice(0, 6).map((preset) => {
                  const isSelected = cardUrl === preset.imageUrl || cardTitle === preset.title;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectCover?.(preset)}
                      className={`group relative shrink-0 w-14 sm:w-16 aspect-[17/22] rounded-xl overflow-hidden border transition cursor-pointer text-left ${
                        isSelected
                          ? "border-emerald-600 ring-2 ring-emerald-600/50 shadow-sm"
                          : "border-stone-200 hover:border-amber-400 opacity-80 hover:opacity-100 bg-stone-100"
                      }`}
                      title={preset.title}
                    >
                      <img
                        src={preset.imageUrl}
                        alt={preset.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-stone-900/85 backdrop-blur-xs text-white text-[8px] font-medium px-0.5 py-0.5 truncate text-center block">
                        {preset.title}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsCoverSheetOpen(true)}
                  className="shrink-0 w-14 sm:w-16 aspect-[17/22] rounded-xl border-2 border-dashed border-stone-300 hover:border-emerald-600 bg-white hover:bg-stone-50 flex flex-col items-center justify-center p-1 text-center cursor-pointer transition text-stone-600 hover:text-emerald-800"
                >
                  <span className="text-[11px] font-bold leading-tight">See All</span>
                  <span className="text-[10px] text-stone-500 font-semibold">{availableCovers.length} &rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (lg:col-span-6 — The Guided Note & Action Column) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/90 shadow-sm space-y-4">
            {/* 1. 1-TAP OCCASION SWITCHER PILLS AT VERY TOP */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-stone-500 text-[10px]">
                  Select Occasion
                </span>
                <span className="text-[11px] text-stone-400">1-Tap Card &amp; Message Switch</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {STUDIO_OCCASION_PILLS.map((item) => {
                  const isActive = activeOccasionKey === item.label.toLowerCase();
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleOccasionSwitch(item)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                        isActive
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200/70"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. GREETING INPUT */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Greeting (optional)
              </label>
              <input
                ref={salutationInputRef}
                type="text"
                value={salutation}
                onFocus={handleGreetingFocus}
                onChange={(e) => {
                  const val = e.target.value;
                  const projected = [val, bodyNote, signOff].filter(Boolean).join("\n\n");
                  if (projected.length <= MAX_CHARS) {
                    onChangeSalutation(val);
                  }
                  if (bracketWarning && !/\[.*?\]/.test(`${val} ${bodyNote} ${signOff}`)) {
                    setBracketWarning(null);
                  }
                  if (val !== initialValuesRef.current.salutation) {
                    markNoteAsEditedAndFireStep3(bodyNote.length, false, "greeting");
                  }
                }}
                placeholder="e.g. Dear Sarah,"
                className={`w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans ${
                  bracketWarning && /\[.*?\]/.test(salutation)
                    ? "border-amber-400 bg-amber-50/40 ring-2 ring-amber-300"
                    : "border-stone-300"
                }`}
              />
              <p className="text-[11px] text-stone-500 mt-1">
                We&apos;ll automatically pre-fill this name into the recipient address step.
              </p>
            </div>

            {/* 3. YOUR MESSAGE TEXTAREA + STARTER INSPIRATION CHIPS + 1-TAP LIVE INK TOGGLE */}
            <div>
              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <label className="block text-xs font-semibold text-stone-700">
                  Your message
                </label>

                <div className="flex items-center gap-2">
                  {/* 1-Tap Toggle: Edit Text vs Preview in Real Ballpoint Ink */}
                  <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                    <button
                      type="button"
                      onClick={() => setNoteMode("edit")}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer flex items-center gap-1 ${
                        noteMode === "edit"
                          ? "bg-white text-stone-900 shadow-2xs"
                          : "text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      <PenTool className="w-3 h-3" />
                      <span>Edit Text</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteMode("preview")}
                      className={`px-2 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer flex items-center gap-1 ${
                        noteMode === "preview"
                          ? "bg-white text-emerald-900 shadow-2xs"
                          : "text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      <Eye className="w-3 h-3 text-emerald-700" />
                      <span>Preview in Real Ballpoint Ink</span>
                    </button>
                  </div>

                  <div className="font-mono text-stone-500 text-xs">
                    <span className={isAtLimit ? "text-rose-600 font-bold" : isApproachingLimit ? "text-amber-700 font-bold" : "text-stone-700"}>
                      {charCount}
                    </span>
                    <span> / {MAX_CHARS}</span>
                  </div>
                </div>
              </div>

              {/* 1-Tap Starter Note Chips (Blank-Page Cure) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-1.5">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-900 shrink-0">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Starters:</span>
                </span>
                {starterPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleUseStarterPrompt(p, idx + 1)}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-950 border border-amber-200/90 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition shrink-0"
                  >
                    {p.label}
                  </button>
                ))}
                {previousBodyNote !== null && (
                  <button
                    type="button"
                    onClick={handleUndoStarter}
                    className="px-2 py-1 text-xs text-stone-500 hover:text-stone-800 font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Undo2 className="w-3 h-3" />
                    <span>Undo</span>
                  </button>
                )}
              </div>

              {/* Note Content: Lined Stationery Textarea OR 1:1 Live Ink Pane */}
              {noteMode === "edit" ? (
                <div className={`relative rounded-2xl border overflow-hidden bg-white shadow-2xs ${
                  bracketWarning && /\[.*?\]/.test(bodyNote)
                    ? "border-amber-400 bg-amber-50/30 ring-2 ring-amber-300"
                    : "border-stone-300"
                }`}>
                  <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_31px,#94A3B8_32px)] bg-[length:100%_32px]" />
                  <textarea
                    rows={5}
                    value={bodyNote}
                    onChange={handleBodyChange}
                    placeholder="Write your note from the heart..."
                    className="w-full p-4 bg-transparent relative z-10 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-base leading-[32px] resize-y min-h-[150px] font-sans"
                  />
                </div>
              ) : (
                <div className="relative rounded-2xl border border-stone-200 overflow-hidden bg-[#FDFCF7] paper-texture shadow-xs p-5 select-none min-h-[160px] flex flex-col justify-start">
                  <div className="absolute inset-2.5 rounded-xl border border-stone-300/40 pointer-events-none" />
                  <div className="absolute left-0 top-0 bottom-0 w-[4%] bg-gradient-to-r from-stone-400/20 via-stone-300/10 to-transparent pointer-events-none z-10" />
                  <div className={`text-[#1B3B6F] relative z-10 text-sm sm:text-base leading-relaxed whitespace-pre-line ${currentFont.fontClass}`}>
                    {salutation && <p className="mb-2 font-medium">{salutation}</p>}
                    <p className="mb-3 min-h-[60px]">{bodyNote || "Your personal note written in real ballpoint ink will appear here..."}</p>
                    {signOff && <p className="font-medium">{signOff}</p>}
                  </div>
                  <div className="mt-auto pt-2 border-t border-stone-200/60 flex items-center justify-between text-[11px] text-stone-500">
                    <span className="flex items-center gap-1 text-emerald-800 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      <span>Real blue ballpoint pen inking</span>
                    </span>
                    <span className="font-semibold text-stone-700">{currentFont.name} ({currentFont.subtitle})</span>
                  </div>
                </div>
              )}

              {isAtLimit && (
                <p className="text-xs text-rose-600 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Maximum card message length reached (450 characters).</span>
                </p>
              )}
            </div>

            {/* 4. SIGN-OFF INPUT */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Sign-off / Your name
              </label>
              <input
                type="text"
                value={signOff}
                onChange={(e) => {
                  const val = e.target.value;
                  const projected = [salutation, bodyNote, val].filter(Boolean).join("\n\n");
                  if (projected.length <= MAX_CHARS) {
                    onChangeSignOff(val);
                  }
                  if (bracketWarning && !/\[.*?\]/.test(`${salutation} ${bodyNote} ${val}`)) {
                    setBracketWarning(null);
                  }
                  if (val !== initialValuesRef.current.signOff) {
                    markNoteAsEditedAndFireStep3(bodyNote.length, false, "signOff");
                  }
                }}
                placeholder="e.g. Warmly, Ezekiel"
                className={`w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans ${
                  bracketWarning && /\[.*?\]/.test(signOff)
                    ? "border-amber-400 bg-amber-50/40 ring-2 ring-amber-300"
                    : "border-stone-300"
                }`}
              />
              <p className="text-[11px] text-stone-500 mt-1">
                We&apos;ll automatically pre-fill your name for your return address.
              </p>
            </div>

            {/* BRACKET SAFETY GUARD NOTIFICATION (Warm Amber) */}
            {bracketWarning && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{bracketWarning}</span>
              </div>
            )}

            {/* QUICK HANDWRITING SELECTOR PILLS */}
            <div className="space-y-1.5 pt-2 border-t border-stone-200">
              <div className="flex items-center justify-between text-xs text-stone-700">
                <span className="font-semibold">Handwriting Style:</span>
                <span className="text-[11px] text-stone-500">{currentFont.name} &bull; {currentFont.subtitle}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {HANDWRITING_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onChangeFontStyleId(style.id)}
                    className={`p-2 rounded-xl transition cursor-pointer text-center flex flex-col items-center justify-center ${
                      fontStyleId === style.id
                        ? "bg-emerald-800 text-white shadow-xs ring-2 ring-emerald-600/30 border border-emerald-800"
                        : "bg-stone-50 text-stone-800 border border-stone-200 hover:bg-stone-100"
                    }`}
                  >
                    <span className={`${style.fontClass} text-[19px] sm:text-[20px] leading-tight block truncate w-full`}>
                      {style.name}
                    </span>
                    <span className={`text-[10px] font-sans font-normal mt-0.5 block ${fontStyleId === style.id ? "text-emerald-100" : "text-stone-500"}`}>
                      {style.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 5. ALWAYS-VISIBLE PRIMARY FORWARD CTA BUTTON (DESKTOP WORKBENCH) */}
            <div className="hidden lg:block pt-3 border-t border-stone-200/80">
              <button
                type="button"
                onClick={handleProceedToAddress}
                className="w-full py-3.5 px-6 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold rounded-xl text-base transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Recipient Address — $9.00 All-In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-stone-500 text-center leading-relaxed mt-2">
                Includes heavy 120lb cotton card, real pen handwriting &amp; First-Class USPS stamp. Don&apos;t know their address yet? You can add it after checkout.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MOBILE PINNED STICKY BOTTOM ACTION BAR (< lg) */}
      {!hideFixedActionBar && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg safe-area-inset-bottom">
          {bracketWarning && (
            <div className="mb-2 p-2 bg-amber-50 border border-amber-300 rounded-lg text-[11px] text-amber-900 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{bracketWarning}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleProceedToAddress}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Continue to Address ($9.00 All-In)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-stone-500 text-center mt-1">
            USPS First-Class stamp included &bull; Add street address later if needed
          </p>
        </div>
      )}

      {/* 4. FULL "SEE ALL 12" COVER DESIGNS SHEET */}
      <Sheet
        isOpen={isCoverSheetOpen}
        onClose={() => setIsCoverSheetOpen(false)}
        title="Select Card Front Design"
        description={`Choose from all ${availableCovers.length} original greeting cards. Your written note is completely preserved.`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2 max-h-[70vh] overflow-y-auto">
          {availableCovers.map((preset) => {
            const isSelected = cardUrl === preset.imageUrl || cardTitle === preset.title;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  if (onSelectCover) {
                    onSelectCover(preset);
                  }
                  setIsCoverSheetOpen(false);
                }}
                className={`group rounded-xl border text-left overflow-hidden transition cursor-pointer flex flex-col ${
                  isSelected
                    ? "border-emerald-600 ring-2 ring-emerald-600/30 bg-emerald-50/40"
                    : "border-stone-200 hover:border-amber-400 bg-white hover:shadow-xs"
                }`}
              >
                <div className="relative aspect-[17/22] w-full bg-stone-100 overflow-hidden">
                  <img
                    src={preset.imageUrl}
                    alt={preset.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs shadow-xs">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block truncate">
                    {preset.occasion}
                  </span>
                  <span className="text-xs font-semibold text-stone-900 block truncate">
                    {preset.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* 5. FULL ENLARGED CARD INSPECTION SHEET: FRONT COVER ALONGSIDE 1:1 LIVE BALLPOINT INK */}
      <Sheet
        isOpen={isPreviewCardOpen}
        onClose={() => setIsPreviewCardOpen(false)}
        title="Card Inspection &amp; Live Ink Preview"
        description={`${cardTitle || "Folded Greeting Card"} — Front Cover &amp; 1:1 Ballpoint Inking`}
      >
        <div className="py-2 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Side-by-Side: Front Cover alongside 1:1 Live Ballpoint Ink Inside Page */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* 1. FRONT COVER */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
                Front Cover Artwork
              </span>
              <div className="relative w-full max-w-[280px] aspect-[17/22] rounded-2xl overflow-hidden shadow-md border-2 border-stone-200 bg-stone-100">
                <img
                  src={cardUrl || availableCovers[0]?.imageUrl}
                  alt={cardTitle || "Front Cover Artwork"}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-xs font-semibold text-stone-800 text-center">
                {cardTitle}
              </span>
            </div>

            {/* 2. 1:1 LIVE BALLPOINT INK INSIDE PAGE */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                1:1 Real Ballpoint Ink Page
              </span>
              <div className="relative w-full max-w-[280px] aspect-[17/22] rounded-2xl overflow-hidden shadow-md border-2 border-stone-200 bg-[#FDFCF7] paper-texture p-6 flex flex-col justify-start select-none">
                <div className="absolute inset-2.5 rounded-xl border border-stone-300/40 pointer-events-none" />
                <div className="absolute left-0 top-0 bottom-0 w-[4%] bg-gradient-to-r from-stone-400/25 via-stone-300/10 to-transparent pointer-events-none z-10" />
                <div className={`text-[#1B3B6F] relative z-10 text-xs sm:text-sm leading-relaxed whitespace-pre-line ${currentFont.fontClass}`}>
                  {salutation && <p className="mb-2 font-medium">{salutation}</p>}
                  <p className="mb-3 min-h-[70px]">
                    {bodyNote || "Your personal note written in real ballpoint ink will appear here..."}
                  </p>
                  {signOff && <p className="font-medium">{signOff}</p>}
                </div>
              </div>
              <span className="text-xs font-medium text-stone-600 text-center">
                Penned in <strong className="text-stone-900">{currentFont.name}</strong> ({currentFont.subtitle})
              </span>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
