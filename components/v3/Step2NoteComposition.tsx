"use client";

import React, { useState, useMemo } from "react";
import {
  PenTool,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Heart,
  Smile,
  Quote,
  Feather,
  Info,
} from "lucide-react";
import { OCCASION_MESSAGE_BANK, MessageInspiration } from "@/lib/card-presets";

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
    description: "Clean, natural everyday print with effortless charm. Recommended.",
    sample: "Happy Birthday! Wishing you a wonderful year ahead.",
  },
  {
    id: "hwKate",
    name: "Carefree Kate",
    fontClass: "font-hwKate",
    description: "Graceful, rounded cursive with flowing romantic warmth.",
    sample: "With all my love and warmest thoughts today.",
  },
  {
    id: "hwAdam",
    name: "Executive Adam",
    fontClass: "font-hwAdam",
    description: "Strong upright architectural all-caps lettering.",
    sample: "CONGRATULATIONS ON THIS INCREDIBLE MILESTONE!",
  },
  {
    id: "hwChase",
    name: "Charming Chase",
    fontClass: "font-hwChase",
    description: "Expressive, stylish modern handwriting with slight cadence.",
    sample: "Thinking of you and sending big smiles your way.",
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
}: Step2NoteCompositionProps) {
  // Inspiration drawer state
  const [isInspirationOpen, setIsInspirationOpen] = useState(false);
  const [selectedToneTab, setSelectedToneTab] = useState<"Warm" | "Heartfelt" | "Playful" | "Literary">("Warm");

  // Confirmation before replacing text
  const [pendingInspiration, setPendingInspiration] = useState<string | null>(null);

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
  const WARN_CHARS = 420;
  const isApproachingLimit = charCount >= WARN_CHARS && charCount <= MAX_CHARS;
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
    // If user has already typed custom note, prompt confirmation
    if (bodyNote.trim() && bodyNote.trim() !== text.trim()) {
      setPendingInspiration(text);
    } else {
      applyInspirationText(text);
    }
  };

  const applyInspirationText = (text: string) => {
    // Ensure we don't exceed 450 characters combined with salutation & sign-off
    const projectedCombined = [salutation, text, signOff].filter(Boolean).join("\n\n");
    if (projectedCombined.length > MAX_CHARS) {
      const allowedBodyLen = MAX_CHARS - (salutation.length + signOff.length + 4);
      onChangeBodyNote(text.slice(0, Math.max(10, allowedBodyLen)));
    } else {
      onChangeBodyNote(text);
    }
    setPendingInspiration(null);
  };

  // Enforce 450 character hard cap when typing in body
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newBody = e.target.value;
    const projectedCombined = [salutation, newBody, signOff].filter(Boolean).join("\n\n");

    if (projectedCombined.length <= MAX_CHARS) {
      onChangeBodyNote(newBody);
    } else {
      // Calculate how much we can allow
      const allowedBodyLen = MAX_CHARS - (salutation.length + signOff.length + (salutation ? 2 : 0) + (signOff ? 2 : 0));
      if (allowedBodyLen > 0) {
        onChangeBodyNote(newBody.slice(0, allowedBodyLen));
      }
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-12">
      {/* STEP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-800 text-white font-bold text-xs flex items-center justify-center">
              2
            </span>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Interior Note Composition &amp; Handwriting
            </h1>
          </div>
          <p className="text-xs text-stone-500">
            Pen your personal message. Handwrytten robotic plotters will ink every line with authentic ballpoint pens.
          </p>
        </div>

        {/* Back navigation button */}
        <button
          type="button"
          onClick={onBack}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Change Card</span>
        </button>
      </div>

      {/* REAL-TIME PHYSICAL FIT METER */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-medium text-stone-700">
            <PenTool className="w-3.5 h-3.5 text-amber-700" />
            <span>Physical A2 Card Leaf Fit</span>
          </div>
          <div className="font-mono text-xs font-semibold">
            <span className={isAtLimit ? "text-rose-600 font-bold" : isApproachingLimit ? "text-amber-700 font-bold" : "text-stone-600"}>
              {charCount}
            </span>
            <span className="text-stone-400"> / {MAX_CHARS} chars</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-200 rounded-full ${
              isAtLimit
                ? "bg-rose-500"
                : isApproachingLimit
                ? "bg-amber-500"
                : "bg-emerald-600"
            }`}
            style={{ width: `${Math.min(100, (charCount / MAX_CHARS) * 100)}%` }}
          />
        </div>

        {/* Status text */}
        <div className="text-[11px] flex items-center justify-between">
          {isAtLimit ? (
            <span className="text-rose-600 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Maximum capacity reached. Fits beautifully on physical A2 card leaf.
            </span>
          ) : isApproachingLimit ? (
            <span className="text-amber-700 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Approaching card space limit.
            </span>
          ) : (
            <span className="text-emerald-700 font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5 shrink-0" />
              Fits beautifully on physical A2 card leaf
            </span>
          )}
          <span className="text-stone-400 text-[10px]">A2 Leaf (4.25&quot; × 5.5&quot;)</span>
        </div>
      </div>

      {/* THE LINED STATIONERY NOTE COMPOSER */}
      <div className="bg-[#FAF8F5] rounded-2xl p-4 sm:p-6 border border-stone-200 shadow-sm space-y-4">
        {/* 1. Salutation / Recipient Input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
            1. Salutation / Recipient
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
            }}
            placeholder="Dear Eleanor,"
            className={`w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 shadow-2xs ${currentFont.fontClass}`}
          />
          <p className="text-[11px] text-stone-400 mt-0.5">
            Auto-syncs recipient name onto your envelope.
          </p>
        </div>

        {/* 2. Lined Stationery Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600">
              2. Letter Body (Inked Interior Message)
            </label>
            <span className="text-[11px] text-stone-500 font-serif italic">
              Font: {currentFont.name}
            </span>
          </div>

          <div className="relative rounded-2xl border border-stone-300 overflow-hidden bg-white shadow-2xs">
            {/* Lined stationery ruling effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_31px,#94A3B8_32px)] bg-[length:100%_32px]" />

            <textarea
              rows={6}
              value={bodyNote}
              onChange={handleBodyChange}
              placeholder="Write your note from the heart..."
              className={`w-full p-4 sm:p-5 bg-transparent relative z-10 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 text-lg leading-[32px] tracking-wide resize-y min-h-[180px] ${currentFont.fontClass}`}
            />
          </div>
        </div>

        {/* 3. Closing & Sign-off Input */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
            3. Closing &amp; Sign-off
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
            }}
            placeholder="Warmly, Thomas"
            className={`w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 shadow-2xs ${currentFont.fontClass}`}
          />
          <p className="text-[11px] text-stone-400 mt-0.5">
            Auto-syncs your name onto the return address in top-left envelope corner.
          </p>
        </div>
      </div>

      {/* HANDWRITING STYLE PICKER (4 Authentic Options) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-amber-700" />
              Robotic Penmanship Style
            </h2>
            <p className="text-[11px] text-stone-500">
              Each stroke is physically drawn by high-precision mechanical plotters.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
            Active: {currentFont.name}
          </span>
        </div>

        {/* 4 Font Options Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HANDWRITING_STYLES.map((style) => {
            const isSelected = fontStyleId === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onChangeFontStyleId(style.id)}
                className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? "bg-amber-50/70 border-amber-600 ring-2 ring-amber-600/20 shadow-xs"
                    : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs text-stone-900">
                    {style.name}
                  </span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-amber-700 text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>

                {/* Font sample rendering in authentic font */}
                <p className={`text-base text-stone-800 my-1 truncate ${style.fontClass}`}>
                  {style.sample}
                </p>

                <p className="text-[11px] text-stone-400 mt-1 line-clamp-1">
                  {style.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBORDINATE TONE INSPIRATION DRAWER (Warm, Heartfelt, Playful, Literary) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
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
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-700 block">
                Need Message Inspiration? ({occasion})
              </span>
              <span className="text-[11px] text-stone-400">
                Browse curated sentiments written by stationery essayists.
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
                      ? "bg-amber-800 text-white shadow-xs"
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
                      <span className="uppercase tracking-wider text-amber-800 font-semibold">
                        {msg.tag || selectedToneTab}
                      </span>
                      <span className="text-amber-700 opacity-0 group-hover:opacity-100 transition font-semibold">
                        Click to Use →
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

      {/* INKING GUARANTEE CALLOUT */}
      <div className="p-4 bg-stone-100/80 rounded-2xl border border-stone-200/80 flex items-start gap-3">
        <Feather className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-600 leading-relaxed">
          <strong className="text-stone-900 font-semibold">Authentic Inking Guarantee:</strong>{" "}
          All interior text is plotted in genuine ballpoint ink by automated precision pens—never digital imitation fonts or toner.
        </p>
      </div>

      {/* CONFIRMATION MODAL BEFORE REPLACING USER TEXT */}
      {pendingInspiration && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center gap-2.5 text-amber-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-serif font-bold text-base text-stone-900">
                Replace your existing note?
              </h3>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              You have already written custom text in your note body. Using this inspiration draft will overwrite what you have typed.
            </p>
            <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-700 italic border border-stone-200 line-clamp-3">
              &ldquo;{pendingInspiration}&rdquo;
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingInspiration(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition"
              >
                Keep My Note
              </button>
              <button
                type="button"
                onClick={() => applyInspirationText(pendingInspiration)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-800 hover:bg-amber-900 text-white shadow-xs transition"
              >
                Replace With Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP ADVANCE BAR */}
      <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Back to Card</span>
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-3 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <span>Address Envelope →</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
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
            {charCount}/{MAX_CHARS} chars
          </span>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="px-5 py-2.5 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <span>Address Envelope →</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
