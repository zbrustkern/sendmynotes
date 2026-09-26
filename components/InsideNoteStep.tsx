"use client";

import React, { useState, useEffect } from "react";
import { PenTool, Type, Sparkles, Check, BookOpen, Quote, Sparkle, Heart, Smile, Feather, Compass } from "lucide-react";
import { FONT_OPTIONS, OCCASION_MESSAGE_BANK, OCCASIONS, MessageInspiration, MessageTone, getCohortFontOptions } from "@/lib/card-presets";
import { ThematicSentiment } from "@/lib/thematic-sentiment";
import { trackEvent } from "@/lib/telemetry";

interface InsideNoteStepProps {
  printedGreeting: string;
  onChangePrintedGreeting: (text: string) => void;
  handwrittenNote: string;
  onChangeHandwrittenNote: (text: string) => void;
  fontStyleId: string;
  onChangeFontStyleId: (id: string) => void;
  occasion?: string;
  onChangeOccasion?: (occ: string) => void;
  thematicSentiments?: ThematicSentiment[];
  themeTag?: string;
  coverPrompt?: string;
}

const TONE_FILTERS: { id: "all" | MessageTone; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All Tones", icon: Compass },
  { id: "warm", label: "Heartfelt", icon: Heart },
  { id: "funny", label: "Playful", icon: Smile },
  { id: "short", label: "Brief", icon: Feather },
  { id: "poetic", label: "Literary", icon: Quote },
];

export function InsideNoteStep({
  printedGreeting,
  onChangePrintedGreeting,
  handwrittenNote,
  onChangeHandwrittenNote,
  fontStyleId,
  onChangeFontStyleId,
  occasion = "Birthday",
  onChangeOccasion,
  thematicSentiments,
  themeTag,
  coverPrompt,
}: InsideNoteStepProps) {
  const [selectedTone, setSelectedTone] = useState<"all" | MessageTone>("all");
  const [isBrowserExpanded, setIsBrowserExpanded] = useState<boolean>(true);
  const [cohort, setCohort] = useState<"A" | "B">("A");

  useEffect(() => {
    try {
      let stored = localStorage.getItem("smn_font_cohort") as "A" | "B" | null;
      if (!stored) {
        stored = Math.random() < 0.5 ? "A" : "B";
        localStorage.setItem("smn_font_cohort", stored);
      }
      setCohort(stored);
    } catch {}
  }, []);

  const [shuffleIndex, setShuffleIndex] = useState(0);

  const availableFonts = getCohortFontOptions(cohort);

  // Retrieve message bank for current occasion, fallback to Birthday
  const messageBank: MessageInspiration[] =
    OCCASION_MESSAGE_BANK[occasion] || OCCASION_MESSAGE_BANK["Birthday"] || [];

  const filteredInspirations =
    selectedTone === "all"
      ? messageBank
      : messageBank.filter((item) => item.tone === selectedTone);

  const applyInspiration = (item: MessageInspiration) => {
    onChangeHandwrittenNote(item.handwritten);
    onChangePrintedGreeting("");
    trackEvent("inspiration_applied", 2, { occasion, tone: item.tone });
  };

  const shuffleNote = () => {
    if (filteredInspirations.length === 0) return;
    const nextIdx = (shuffleIndex + 1) % filteredInspirations.length;
    setShuffleIndex(nextIdx);
    const chosen = filteredInspirations[nextIdx];
    onChangeHandwrittenNote(chosen.handwritten);
    onChangePrintedGreeting("");
    trackEvent("note_shuffled", 2, { occasion, tone: chosen.tone });
  };

  const selectedFont =
    availableFonts.find(
      (f) => f.handwryttenFontId === fontStyleId || f.id === fontStyleId
    ) || availableFonts[0];

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            2
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            Inside Note (Real Handwriting)
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          Written with a real ballpoint pen on heavy 120 lb archival cardstock. Mailed directly to their door.
        </p>
      </div>

      {/* THEMATIC SENTIMENT PAIRINGS (Linked directly to custom front cover art) */}
      {thematicSentiments && thematicSentiments.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50 border-2 border-amber-300/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950 font-serif">
                Paired to Your Artwork {coverPrompt ? `(“${coverPrompt}”)` : ""}
              </h3>
            </div>
            <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-amber-200/70 text-amber-900 border border-amber-300 w-fit">
              Front-to-Inside Puns &amp; Sentiments
            </span>
          </div>
          <p className="text-xs text-stone-600">
            Commercial greeting cards connect the front art to the inside note. Click a paired theme below to automatically fill your inside top punchline and handwritten ballpoint note:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {thematicSentiments.map((item) => {
              const isSelected =
                printedGreeting === item.printedGreeting &&
                handwrittenNote === item.handwrittenNote;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChangePrintedGreeting(item.printedGreeting);
                    onChangeHandwrittenNote(item.handwrittenNote);
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-amber-100/90 border-amber-500 shadow-xs ring-2 ring-amber-400/50"
                      : "bg-white/90 border-amber-200/80 hover:border-amber-400 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-xs font-bold text-stone-900">
                      {item.themeTitle}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Check className="w-3 h-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-serif font-bold text-amber-950">
                    &ldquo;{item.printedGreeting}&rdquo;
                  </p>
                  <p className="text-[11px] text-stone-600 italic line-clamp-2 mt-1 leading-snug">
                    {item.handwrittenNote}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* BOUTIQUE MESSAGE BROWSER (Eliminates writer's block) */}
      <div className="bg-gradient-to-b from-[#FAF7F2] to-[#F5F0E8] rounded-2xl p-5 border border-stone-300/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 border border-amber-300/50 flex items-center justify-center text-amber-800">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                Browse Message Inspirations
                <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Ready to Send
                </span>
              </h3>
              <p className="text-xs text-stone-500">
                Thoughtfully crafted personal notes for every occasion. Click any note to apply.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onChangeOccasion && (
              <select
                value={occasion}
                onChange={(e) => onChangeOccasion(e.target.value)}
                className="text-xs font-medium px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {OCCASIONS.map((occ) => (
                  <option key={occ} value={occ}>
                    {occ}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setIsBrowserExpanded(!isBrowserExpanded)}
              className="text-xs text-stone-500 hover:text-stone-800 underline px-1 py-1"
            >
              {isBrowserExpanded ? "Collapse" : "Browse"}
            </button>
          </div>
        </div>

        {isBrowserExpanded && (
          <div className="space-y-3 pt-1">
            {/* Tone Selector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {TONE_FILTERS.map((tone) => {
                const Icon = tone.icon;
                const isToneActive = selectedTone === tone.id;
                return (
                  <button
                    key={tone.id}
                    type="button"
                    onClick={() => setSelectedTone(tone.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      isToneActive
                        ? "bg-stone-900 text-white shadow-sm"
                        : "bg-white/80 border border-stone-200 text-stone-600 hover:bg-white hover:text-stone-900"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tone.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Curated Message Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {filteredInspirations.length > 0 ? (
                filteredInspirations.map((item, idx) => {
                  const isCurrentPair = handwrittenNote.trim() === item.handwritten.trim();

                  return (
                    <div
                      key={idx}
                      onClick={() => applyInspiration(item)}
                      className={`relative group p-4 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer bg-white ${
                        isCurrentPair
                          ? "border-amber-600 ring-2 ring-amber-500/20 shadow-sm"
                          : "border-stone-200/90 hover:border-amber-400 hover:shadow-md"
                      }`}
                    >
                      <div className="space-y-2">
                        {/* Header & Tag */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-600 group-hover:bg-amber-50 group-hover:text-amber-800 transition">
                            {item.tag}
                          </span>
                          {isCurrentPair ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                              <Check className="w-3 h-3 stroke-[3]" />
                              Applied
                            </span>
                          ) : (
                            <span className="text-[11px] text-stone-400 group-hover:text-amber-700 transition font-medium">
                              Click to apply
                            </span>
                          )}
                        </div>

                        {/* Note Preview */}
                        <div className="border-l-2 border-amber-300/80 bg-stone-50/60 rounded-r-lg p-2.5 space-y-1.5">
                          <p className="text-xs text-stone-700 font-serif italic leading-relaxed line-clamp-3">
                            &ldquo;{item.handwritten}&rdquo;
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
                        <span className="text-stone-400">Penned in real ink</span>
                        <span className="font-semibold text-amber-800 group-hover:underline">
                          {isCurrentPair ? "Currently selected" : "Use this note →"}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 py-6 text-center text-xs text-stone-500 bg-white rounded-xl border border-stone-200">
                  No inspirations found for this tone filter. Try selecting "All Tones".
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Font Style Picker for Real-Pen Handwriting */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-indigo-600" />
            Handwriting Style
          </label>
          <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
            Real Ballpoint Ink
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {availableFonts.map((font) => {
            const isSelected = fontStyleId === font.handwryttenFontId || fontStyleId === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => {
                  onChangeFontStyleId(font.handwryttenFontId);
                  trackEvent("font_style_selected", 2, {
                    fontId: font.id,
                    fontName: font.name,
                    cohort,
                  });
                }}
                className={`p-3 text-left rounded-xl border-2 transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-500/20"
                    : "border-stone-200 hover:border-stone-300 bg-stone-50/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-800">{font.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 stroke-[3]" />}
                  </div>
                  <p
                    style={{ fontFamily: font.fontFamily }}
                    className={`text-xl text-[#1B3B6F] my-1 ${font.fontClass}`}
                  >
                    Warmest wishes
                  </p>
                </div>
                <p className="text-[10px] text-stone-500 leading-tight mt-1">{font.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inside Note Composition Area */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-4">
        {/* Part 1: Optional Inside Top Lead-in / Commercial Hook */}
        <div className="space-y-1.5 pb-3 border-b border-stone-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-stone-400" />
              Inside Top Greeting / Punchline (Optional)
            </label>
            <span className="text-[11px] text-stone-400">Pre-printed card hook or headline</span>
          </div>
          <input
            type="text"
            value={printedGreeting}
            onChange={(e) => onChangePrintedGreeting(e.target.value)}
            placeholder="e.g. Hope your celebration is DINO-MITE! (or leave blank for pure personal letter)"
            maxLength={120}
            className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-900 transition font-serif"
          />
        </div>

        {/* Part 2: Personal Note (Written in Real Ballpoint Ink) */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Personal Note (Written in Real Ballpoint Ink)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={shuffleNote}
                className="flex items-center gap-1 text-xs text-amber-800 hover:text-amber-900 font-semibold bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-full border border-amber-200/80 shadow-2xs transition cursor-pointer"
                title="Suggest another pre-written note in this tone"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>Suggest another note</span>
              </button>
              <span className="text-[11px] text-stone-400">Up to 500 characters</span>
            </div>
          </div>

        <textarea
          rows={6}
          value={handwrittenNote}
          onChange={(e) => onChangeHandwrittenNote(e.target.value)}
          placeholder="Dear Friend,&#10;&#10;Happy Birthday! So excited to celebrate your special moment with you..."
          maxLength={500}
          className="w-full p-4 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-900 transition leading-relaxed font-sans"
        />

        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span className="text-indigo-600 font-medium">Penned in real ballpoint ink with {selectedFont.name}</span>
          <span>{handwrittenNote.length}/500 characters</span>
        </div>
      </div>
    </div>
  </div>
  );
}
