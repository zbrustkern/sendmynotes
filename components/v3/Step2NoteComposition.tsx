"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  PenTool,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Undo2,
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

  // 1. Pet Loss / Pet Sympathy
  if (slug.includes("pet") || occ.includes("pet") || (occ.includes("sympathy") && slug.includes("loss"))) {
    return [
      {
        label: "1. Warm & Short",
        template: "Sending you so much love and gentle strength today. Sweet [Pet's Name] was so deeply loved and had the most wonderful life by your side.",
      },
      {
        label: "2. Rainbow Bridge / Fond Memories",
        template: "May the joyful memories of sweet [Pet's Name] bring comfort across the rainbow bridge. Thinking of you and honoring the unconditional love you shared.",
      },
      {
        label: "3. Thinking of Your Family",
        template: "Holding you and your family close in our hearts during this heartbreaking time. Here for you whenever you need a listening ear or a quiet hug.",
      },
    ];
  }

  // 2. Sympathy & Support
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

  // 3. Birthday
  if (occ.includes("birthday") || occ.includes("bday")) {
    return [
      {
        label: "1. Warm & Short",
        template: "Happy Birthday! Wishing you a joyful day filled with sunshine, laughter, and all your favorite things.",
      },
      {
        label: "2. Rainbow Year / Milestones",
        template: "Celebrating you today and so proud of everything you’ve achieved this year. Here’s to an extraordinary year ahead!",
      },
      {
        label: "3. Thinking of You / Cheers",
        template: "Sending you the biggest birthday hugs from across the miles. Can’t wait to celebrate together very soon!",
      },
    ];
  }

  // 4. Thank You
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

  // 5. Congratulations
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
        label: "3. Thinking of Your Future",
        template: "Here’s to this exciting new chapter and bright horizons ahead. You earned every bit of this success!",
      },
    ];
  }

  // 6. Anniversary / Love
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
        label: "3. Thinking of Our Journey",
        template: "In a world of constant noise, your love is my steady anchor and favorite home. Happy Anniversary!",
      },
    ];
  }

  // Default / Thinking of You / Just Because
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
      label: "3. Thinking of You",
      template: "Sending you warmth, strength, and big hugs from afar. Can’t wait to catch up very soon!",
    },
  ];
}

export interface HandwritingStyle {
  id: string;
  name: string;
  fontClass: string;
  description: string;
  sample: string;
}

export const HANDWRITING_STYLES: HandwritingStyle[] = [
  {
    id: "hwDavid",
    name: "Casual David",
    fontClass: "font-hwDavid",
    description: "Clean, natural everyday print with effortless charm.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwKate",
    name: "Carefree Kate",
    fontClass: "font-hwKate",
    description: "Graceful, rounded cursive with flowing warmth.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwAdam",
    name: "Executive Adam",
    fontClass: "font-hwAdam",
    description: "Strong upright architectural lettering.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
  {
    id: "hwChase",
    name: "Charming Chase",
    fontClass: "font-hwChase",
    description: "Expressive, stylish modern handwriting.",
    sample: "Wishing you a wonderful day and a happy year ahead!",
  },
];

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
  onBack,
  onContinue,
  hideFixedActionBar = false,
  cardTitle,
  cardUrl,
  scenarioSlug,
  onSelectCover,
}: Step2NoteCompositionProps) {
  // Handwriting style drawer state
  const [isFontSheetOpen, setIsFontSheetOpen] = useState(false);

  // Quick cover switcher sheet state
  const [isCoverSheetOpen, setIsCoverSheetOpen] = useState(false);

  // Card preview sheet state for mobile
  const [isPreviewCardOpen, setIsPreviewCardOpen] = useState(false);

  // Inspiration drawer state
  const [isInspirationOpen, setIsInspirationOpen] = useState(false);
  const [selectedToneTab, setSelectedToneTab] = useState<"Warm" | "Heartfelt" | "Playful" | "Literary">("Warm");

  // Confirmation before replacing text
  const [pendingInspiration, setPendingInspiration] = useState<string | null>(null);

  // Undo memory for starter insertion
  const [previousBodyNote, setPreviousBodyNote] = useState<string | null>(null);

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

  // Retrieve message bank for occasion
  const messageBank: MessageInspiration[] = useMemo(() => {
    return OCCASION_MESSAGE_BANK[occasion] || OCCASION_MESSAGE_BANK["Birthday"] || [];
  }, [occasion]);

  // Filter messages by selected tone tab
  const filteredMessages = useMemo(() => {
    if (selectedToneTab === "Warm") {
      return messageBank.filter((m) => m.tone === "warm");
    }
    if (selectedToneTab === "Heartfelt") {
      return messageBank.filter((m) => m.tag === "Heartfelt" || m.tone === "warm");
    }
    if (selectedToneTab === "Playful") {
      return messageBank.filter((m) => m.tone === "funny" || m.tag === "Playful");
    }
    if (selectedToneTab === "Literary") {
      return messageBank.filter((m) => m.tone === "poetic" || m.tag === "Literary");
    }
    return messageBank;
  }, [messageBank, selectedToneTab]);

  const handleInspirationClick = (text: string) => {
    if (bodyNote.trim() && bodyNote.trim() !== text.trim()) {
      setPendingInspiration(text);
    } else {
      applyInspirationText(text);
    }
  };

  // Track initial values on mount to differentiate between pre-filled default template and real edits
  const initialValuesRef = useRef({
    salutation,
    bodyNote,
    signOff,
  });

  const firedStep3Ref = useRef(false);

  // Emit default_template_loaded on passive mount if initial note is pre-populated
  // Never fire step_3_note_typed passively!
  useEffect(() => {
    if (bodyNote.trim().length > 0) {
      trackEvent("default_template_loaded", 2, {
        charCount: fullText.length,
        occasion,
        scenarioSlug,
        noteEdited: false,
      });
    }
  }, []); // Run once on component mount

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
    setPendingInspiration(null);
    markNoteAsEditedAndFireStep3(text.length, false, "inspiration");
  };

  // Available covers for quick switcher (at least 6 designs)
  const availableCovers = useMemo(() => {
    const occasionLower = (occasion || "").toLowerCase();
    const matched = CARD_PRESETS.filter((p) => p.occasion.toLowerCase() === occasionLower);
    const others = CARD_PRESETS.filter((p) => p.occasion.toLowerCase() !== occasionLower);
    const combined = [...matched, ...others];
    return combined.slice(0, Math.max(6, Math.min(12, combined.length)));
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

  const handleUseStarter = (starterText: string) => {
    setPreviousBodyNote(bodyNote);
    applyInspirationText(starterText);
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

    if (newBody !== initialValuesRef.current.bodyNote) {
      markNoteAsEditedAndFireStep3(newBody.length, false, "body");
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-12">
      {/* STEP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Write your note
            </h1>
          </div>
          <p className="text-xs text-stone-600">
            Your words, written in real pen ink.
          </p>
        </div>

        {/* Back navigation button */}
        <button
          type="button"
          onClick={onBack}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Change card</span>
        </button>
      </div>

      {/* HIGH-VISIBILITY CARD COVER SHOWCASE & 1-TAP MINI COVER STRIP */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200/90 shadow-2xs space-y-3">
        {/* COMPACT "SWAP COVER DESIGN" PILL VISIBLE AT TOP */}
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
            <span className="text-stone-700 truncate">
              Selected Cover:{" "}
              <strong className="text-stone-900 font-semibold">{cardTitle || "Featured Design"}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsCoverSheetOpen(true)}
            className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950 bg-white hover:bg-amber-100/80 border border-amber-300/80 px-2.5 py-1 rounded-lg shadow-2xs transition cursor-pointer shrink-0"
          >
            <span>Swap Cover Design</span>
            <span className="text-[11px] text-amber-800 font-normal">({availableCovers.length}) &rarr;</span>
          </button>
        </div>

        {/* Selected Cover Visual Showcase + 1-Tap Mini Strip */}
        <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-4 pt-0.5">
          {/* Active Front Cover Preview Thumbnail */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              className="relative w-20 sm:w-24 aspect-[17/22] rounded-xl overflow-hidden shadow-md border border-stone-200/80 bg-stone-100 cursor-pointer group"
              onClick={() => setIsPreviewCardOpen(true)}
              title="Click to preview full folded card"
            >
              {cardUrl ? (
                <img
                  src={cardUrl}
                  alt={cardTitle || "Selected Card Front"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-400">
                  <Eye className="w-5 h-5" />
                </div>
              )}
              <span className="absolute bottom-1 left-1 right-1 bg-stone-900/80 backdrop-blur-xs text-white text-[9px] font-medium text-center py-0.5 rounded px-1 truncate">
                Physical Front
              </span>
            </div>

            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
                Front Cover
              </span>
              <h4 className="text-xs sm:text-sm font-serif font-bold text-stone-900 line-clamp-1">
                {cardTitle || "Featured Design"}
              </h4>
              <p className="text-[11px] text-stone-500 line-clamp-1">
                Heavy folded cardstock &bull; Real ink
              </p>
              <button
                type="button"
                onClick={() => setIsPreviewCardOpen(true)}
                className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer underline"
              >
                <Eye className="w-3 h-3" />
                <span>View inside &amp; out</span>
              </button>
            </div>
          </div>

          {/* Vertical Divider on Desktop */}
          <div className="hidden sm:block w-px bg-stone-200/90 my-1 shrink-0" />

          {/* 1-Tap Mini Cover Strip (4-6 occasion designs) */}
          <div className="flex-1 min-w-0 w-full space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-stone-700">
                1-Tap Swap: Quick {occasion} Covers
              </span>
              <button
                type="button"
                onClick={() => setIsCoverSheetOpen(true)}
                className="text-amber-800 font-medium hover:underline text-[11px] cursor-pointer"
              >
                All designs ({availableCovers.length}) &rarr;
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
              {availableCovers.slice(0, 6).map((preset) => {
                const isSelected = cardUrl === preset.imageUrl || cardTitle === preset.title;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      if (onSelectCover) {
                        onSelectCover(preset);
                      }
                      trackEvent("step_2_cover_ready", 2, {
                        presetId: preset.id,
                        occasion: preset.occasion,
                        title: preset.title,
                        swapped_via_mini_strip: true,
                      });
                    }}
                    className={`group relative shrink-0 w-14 sm:w-16 aspect-[17/22] rounded-lg overflow-hidden border transition cursor-pointer text-left ${
                      isSelected
                        ? "border-emerald-600 ring-2 ring-emerald-600/40 shadow-sm"
                        : "border-stone-200 hover:border-amber-400 opacity-80 hover:opacity-100"
                    }`}
                    title={preset.title}
                  >
                    <img
                      src={preset.imageUrl}
                      alt={preset.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-stone-900/80 backdrop-blur-xs text-white text-[8px] font-medium px-1 py-0.5 truncate text-center block">
                      {preset.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT: SIDE-BY-SIDE ON DESKTOP, STACKED ON MOBILE */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
        {/* COMPOSITION FORM (Left Column) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#FAF8F5] rounded-2xl p-4 sm:p-6 border border-stone-200 shadow-xs space-y-4">
            {/* 1. Salutation / Recipient Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Greeting (optional)
              </label>
              <input
                type="text"
                value={salutation}
                onChange={(e) => {
                  const val = e.target.value;
                  const projected = [val, bodyNote, signOff].filter(Boolean).join("\n\n");
                  if (projected.length <= MAX_CHARS) {
                    onChangeSalutation(val);
                  }
                  if (val !== initialValuesRef.current.salutation) {
                    markNoteAsEditedAndFireStep3(bodyNote.length, false, "greeting");
                  }
                }}
                placeholder="e.g. Dear Eleanor,"
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs font-sans"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                We&apos;ll carry this name into the address step.
              </p>
            </div>

            {/* 2. Message Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
                  Your message
                </label>
                <span className="text-[11px] text-stone-500 font-medium">
                  Style: {currentFont.name}
                </span>
              </div>

              {/* 1-Tap Starter Note Prompts (Blank-Page Cure) */}
              <div className="mb-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                  <span className="flex items-center gap-1.5 text-stone-900 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Need inspiration? Tap to insert &amp; edit:</span>
                  </span>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                  {starterPrompts.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleUseStarterPrompt(p, idx + 1)}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100/90 active:bg-amber-200 border border-amber-200/90 hover:border-amber-400 rounded-full text-xs font-medium text-amber-950 transition shadow-2xs whitespace-nowrap cursor-pointer shrink-0"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Undo chip if starter just used */}
              {previousBodyNote !== null && (
                <div className="mb-2 flex items-center justify-between bg-stone-100 rounded-lg px-3 py-1.5 text-xs text-stone-700">
                  <span>Starter applied</span>
                  <button
                    type="button"
                    onClick={handleUndoStarter}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                </div>
              )}

              <div className="relative rounded-2xl border border-stone-300 overflow-hidden bg-white shadow-2xs">
                {/* Lined stationery ruling effect */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_31px,#94A3B8_32px)] bg-[length:100%_32px]" />

                <textarea
                  rows={6}
                  value={bodyNote}
                  onChange={handleBodyChange}
                  placeholder="Write your note from the heart..."
                  className="w-full p-4 sm:p-5 bg-transparent relative z-10 text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-base sm:text-lg leading-[32px] tracking-normal resize-y min-h-[170px] font-sans"
                />
              </div>

              {/* Character count and limit warning directly under textarea */}
              <div className="mt-1.5 flex items-center justify-between text-xs text-stone-500">
                <div>
                  {isAtLimit ? (
                    <span className="text-rose-600 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Message limit reached (450 characters)
                    </span>
                  ) : isApproachingLimit ? (
                    <span className="text-amber-700 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Getting close to the message limit
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-stone-500 font-medium ml-auto">
                  <span className={isAtLimit ? "text-rose-600 font-bold" : isApproachingLimit ? "text-amber-700 font-bold" : "text-stone-700"}>
                    {charCount}
                  </span>
                  <span> / {MAX_CHARS} characters</span>
                </div>
              </div>
            </div>

            {/* 3. Closing & Sign-off Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
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
                  if (val !== initialValuesRef.current.signOff) {
                    markNoteAsEditedAndFireStep3(bodyNote.length, false, "signOff");
                  }
                }}
                placeholder="e.g. Warmly, Thomas"
                className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs font-sans"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                We&apos;ll use your name on the envelope.
              </p>
            </div>
          </div>

          {/* COMPACT CONTROLS ROW: HANDWRITING SELECTOR, COVER SWITCHER & MOBILE PREVIEW BUTTON */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl p-4 border border-stone-200/90 shadow-2xs">
            {/* Quick Cover Switcher for mobile & compact view */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Cover:</span>
              <button
                type="button"
                onClick={() => setIsCoverSheetOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-900 font-medium text-xs transition cursor-pointer"
              >
                <span className="font-semibold truncate max-w-[130px]">{cardTitle || "Design"}</span>
                <span className="text-amber-800 font-semibold">· Swap ({availableCovers.length})</span>
              </button>
            </div>

            {/* Collapsed Handwriting Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">Handwriting:</span>
              <button
                type="button"
                onClick={() => setIsFontSheetOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-900 font-medium text-xs transition cursor-pointer"
              >
                <span className="font-semibold">{currentFont.name}</span>
                <span className="text-stone-500">· Change</span>
              </button>
            </div>

            {/* Mobile "Preview your card" Button */}
            <button
              type="button"
              onClick={() => setIsPreviewCardOpen(true)}
              className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium text-xs border border-emerald-200/70 transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-700" />
              <span>Preview your card</span>
            </button>
          </div>

          {/* SUBORDINATE INSPIRATION DRAWER */}
          <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setIsInspirationOpen(!isInspirationOpen)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-stone-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-800">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-stone-800 block">
                    Need a little inspiration?
                  </span>
                  <span className="text-[11px] text-stone-500">
                    Browse suggested messages for {occasion}.
                  </span>
                </div>
              </div>
              {isInspirationOpen ? (
                <ChevronUp className="w-4 h-4 text-stone-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-stone-400" />
              )}
            </button>

            {isInspirationOpen && (
              <div className="p-4 pt-1 border-t border-stone-100 bg-[#FAF8F5] space-y-3">
                {/* Tone filter tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(["Warm", "Heartfelt", "Playful", "Literary"] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setSelectedToneTab(tone)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer shrink-0 ${
                        selectedToneTab === tone
                          ? "bg-stone-900 text-white shadow-xs"
                          : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>

                {/* Message ideas */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredMessages.length === 0 ? (
                    <p className="text-xs text-stone-500 py-3 text-center">
                      Select another tone tab to view messages for {occasion}.
                    </p>
                  ) : (
                    filteredMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleInspirationClick(msg.handwritten)}
                        className="p-3 bg-white hover:bg-amber-50/70 border border-stone-200/80 hover:border-amber-300 rounded-xl transition cursor-pointer group space-y-1 shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-stone-400 font-medium">
                          <span className="uppercase tracking-wider text-emerald-800 font-semibold">
                            {msg.tag || selectedToneTab}
                          </span>
                          <span className="text-emerald-700 opacity-0 group-hover:opacity-100 transition font-semibold">
                            Click to use →
                          </span>
                        </div>
                        <p className={`text-sm text-stone-800 leading-relaxed ${currentFont.fontClass}`}>
                          &ldquo;{msg.handwritten}&rdquo;
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* INKING NOTICE CALLOUT */}
          <div className="p-3.5 bg-stone-100/70 rounded-2xl border border-stone-200/70 flex items-start gap-2.5">
            <PenTool className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-600 leading-relaxed">
              <strong className="text-stone-900 font-semibold">Real Pen Inking:</strong>{" "}
              All interior text is written with real ballpoint pen ink—never printed digital imitation fonts or toner.
            </p>
          </div>
        </div>

        {/* DESKTOP SIDE-BY-SIDE CARD PREVIEW (Right Column) */}
        <div className="hidden lg:block lg:col-span-5 sticky top-24 space-y-3">
          <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 shadow-2xs">
            {/* Tactile Header Pill above card preview */}
            <button
              type="button"
              onClick={() => setIsCoverSheetOpen(true)}
              className="w-full mb-3 px-3.5 py-2.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-amber-400 rounded-xl shadow-2xs text-left flex items-center justify-between text-xs transition cursor-pointer group"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="font-semibold text-stone-900 truncate">
                  Cover: {cardTitle || "Featured Design"}
                </span>
              </div>
              <span className="text-amber-800 font-semibold shrink-0 group-hover:underline">
                Swap Cover Design ({availableCovers.length}) →
              </span>
            </button>

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                Card Preview
              </span>
              <span className="text-[11px] text-stone-500">
                {cardTitle || "Folded Greeting Card"}
              </span>
            </div>
            <CardPreview
              coverUrl={cardUrl || ""}
              printedGreeting={salutation}
              handwrittenNote={[bodyNote, signOff].filter(Boolean).join("\n\n")}
              fontStyleId={fontStyleId}
              occasion={occasion}
              currentStep={2}
            />
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL BEFORE REPLACING USER TEXT */}
      {pendingInspiration && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center gap-2.5 text-stone-900">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <h3 className="font-serif font-bold text-base text-stone-900">
                Replace your existing note?
              </h3>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              You have already written text in your note. Using this message will replace what you typed.
            </p>
            <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-700 italic border border-stone-200 line-clamp-3">
              &ldquo;{pendingInspiration}&rdquo;
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingInspiration(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                Keep my note
              </button>
              <button
                type="button"
                onClick={() => applyInspirationText(pendingInspiration)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs transition cursor-pointer"
              >
                Use this message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HANDWRITING STYLE SELECTION SHEET */}
      <Sheet
        isOpen={isFontSheetOpen}
        onClose={() => setIsFontSheetOpen(false)}
        title="Handwriting"
        description="Choose how your note looks."
      >
        <div className="space-y-3">
          {HANDWRITING_STYLES.map((style) => {
            const isSelected = fontStyleId === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  onChangeFontStyleId(style.id);
                  setIsFontSheetOpen(false);
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/20 shadow-xs"
                    : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs text-stone-900">
                    {style.name}
                  </span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-emerald-700 text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>

                <p className={`text-base text-stone-800 my-1 truncate ${style.fontClass}`}>
                  {style.sample}
                </p>

                <p className="text-[11px] text-stone-500 mt-0.5">
                  {style.description}
                </p>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* MOBILE CARD PREVIEW SHEET */}
      <Sheet
        isOpen={isPreviewCardOpen}
        onClose={() => setIsPreviewCardOpen(false)}
        title="Card Preview"
        description={cardTitle || "Folded Greeting Card"}
      >
        <div className="py-2">
          {/* Tactile Header Pill inside mobile preview sheet */}
          <button
            type="button"
            onClick={() => {
              setIsPreviewCardOpen(false);
              setIsCoverSheetOpen(true);
            }}
            className="w-full mb-3 px-3.5 py-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl shadow-2xs text-left flex items-center justify-between text-xs transition cursor-pointer"
          >
            <span className="font-semibold text-stone-900 truncate">
              Cover: {cardTitle || "Featured Design"}
            </span>
            <span className="text-amber-800 font-semibold shrink-0">
              Swap Design ({availableCovers.length}) →
            </span>
          </button>

          <CardPreview
            coverUrl={cardUrl || ""}
            printedGreeting={salutation}
            handwrittenNote={[bodyNote, signOff].filter(Boolean).join("\n\n")}
            fontStyleId={fontStyleId}
            occasion={occasion}
            currentStep={2}
          />
        </div>
      </Sheet>

      {/* QUICK COVER SWITCHER BOTTOM-SHEET / MODAL */}
      <Sheet
        isOpen={isCoverSheetOpen}
        onClose={() => setIsCoverSheetOpen(false)}
        title="Swap Card Design"
        description={`Select a cover design for your ${occasion} card. Your written note is completely preserved.`}
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

      {/* DESKTOP ADVANCE BAR */}
      <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Back to card</span>
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <span>Add mailing address →</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      {!hideFixedActionBar && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg flex items-center justify-between gap-3 safe-area-inset-bottom">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-2 text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Card</span>
          </button>

          <div className="text-center">
            <span className="text-[11px] font-mono text-stone-500">
              {charCount}/{MAX_CHARS}
            </span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>Add mailing address →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
