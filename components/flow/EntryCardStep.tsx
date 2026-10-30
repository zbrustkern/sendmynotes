"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Check, Eye, Sparkles, AlertCircle } from "lucide-react";
import { CARD_PRESETS, CardPreset } from "@/lib/card-presets";
import { SelectedDesign } from "@/lib/draft";
import { Sheet } from "./Sheet";
import { CardFrontPreview } from "../CardFrontPreview";

// Personal occasions supported per builder plan §3 & seasonal relevance
export const PERSONAL_OCCASIONS = [
  "All",
  "Halloween",
  "Christmas & Holidays",
  "Birthday",
  "Thank You",
  "Thinking of You",
  "Congratulations",
  "Anniversary",
  "Just Because",
  "Sympathy & Support",
  "Love & Romance",
] as const;

export type PersonalOccasion = (typeof PERSONAL_OCCASIONS)[number];

interface EntryCardStepProps {
  amountInCents?: number;
  discountApplied?: boolean;
  selectedDesign: SelectedDesign | null;
  onSelectDesign: (preset: CardPreset) => void;
  onAcceptAndContinue: () => void;
  initialOccasion?: string;
  onOpenCustomArt?: () => void;
  lastCustomArtwork?: SelectedDesign | null;
  onRestoreCustomArt?: () => void;
}

export function EntryCardStep({
  amountInCents = 900,
  discountApplied = false,
  selectedDesign,
  onSelectDesign,
  onAcceptAndContinue,
  initialOccasion,
  onOpenCustomArt,
  lastCustomArtwork,
  onRestoreCustomArt,
}: EntryCardStepProps) {
  // Normalize initial occasion if provided
  const normalizedInitial = useMemo<PersonalOccasion>(() => {
    if (!initialOccasion) return "All";
    const match = PERSONAL_OCCASIONS.find(
      (occ) => occ.toLowerCase() === initialOccasion.toLowerCase()
    );
    return match || "All";
  }, [initialOccasion]);

  const [activeOccasion, setActiveOccasion] = useState<PersonalOccasion>(normalizedInitial);
  const [previewPreset, setPreviewPreset] = useState<CardPreset | null>(null);
  const [isCustomSheetOpen, setIsCustomSheetOpen] = useState(false);

  // Sync if initialOccasion prop updates
  useEffect(() => {
    if (initialOccasion) {
      const match = PERSONAL_OCCASIONS.find(
        (occ) => occ.toLowerCase() === initialOccasion.toLowerCase()
      );
      if (match) setActiveOccasion(match);
    }
  }, [initialOccasion]);

  // Telemetry landing hook (TODO: Lane B schema - track 'landing_viewed' once merged)
  useEffect(() => {
    // TODO: trackEvent('landing_viewed', { occasion: activeOccasion });
  }, []);

  // Filter cards by selected occasion, prioritizing timely seasonal cards and excluding off-season cards
  const filteredPresets = useMemo(() => {
    // Current season: Fall/Winter. Exclude off-season Spring/Easter from customer catalog for now
    const seasonalActive = CARD_PRESETS.filter((p) => p.occasion !== "Easter & Spring");
    if (activeOccasion === "All") {
      // Prioritize currently timely seasonal cards (Halloween, then Christmas) near the front
      const timely = seasonalActive.filter(
        (p) => p.occasion === "Halloween" || p.occasion === "Christmas & Holidays"
      );
      const evergreen = seasonalActive.filter(
        (p) => p.occasion !== "Halloween" && p.occasion !== "Christmas & Holidays"
      );
      return [...timely, ...evergreen];
    }
    return seasonalActive.filter((p) => p.occasion === activeOccasion);
  }, [activeOccasion]);

  // Handle card click: decouple browsing from overwriting if custom art is currently active
  const handleCardClick = (preset: CardPreset) => {
    if (selectedDesign?.source === "custom") {
      setPreviewPreset(preset);
      return;
    }
    // TODO: Lane B schema - track 'builder_started' on first deliberate interaction
    onSelectDesign(preset);
  };

  return (
    <div className="w-full max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-32">
      {/* 1. SHORT VALUE STATEMENT & HERO */}
      <section className="text-left mb-3.5 space-y-1.5" aria-labelledby="hero-title">
        <h1
          id="hero-title"
          className="text-xl sm:text-2xl font-bold font-serif text-stone-900 tracking-tight leading-tight"
        >
          Your words. Real ink. Mailed for you.
        </h1>
        <p className="text-sm text-stone-600 leading-snug">
          Choose a card, add your message, and we&apos;ll write and mail it for you.
        </p>
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
          <span>${(amountInCents / 100).toFixed(2)} including mailing.{discountApplied ? " Discount applied." : " No account needed."}</span>
        </div>
      </section>

      {/* 2. OCCASION FILTER CHIPS */}
      <section className="mb-3" aria-label="Filter cards by occasion">
        <div
          role="tablist"
          aria-label="Occasions"
          className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth -mx-4 px-4"
        >
          {PERSONAL_OCCASIONS.map((occ) => {
            const isActive = activeOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveOccasion(occ)}
                className={`whitespace-nowrap text-xs font-medium px-3.5 py-2 rounded-full min-h-[38px] transition-all flex items-center justify-center shrink-0 cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${
                  isActive
                    ? "bg-stone-900 text-white shadow-xs font-semibold"
                    : "bg-stone-100 hover:bg-stone-200/80 text-stone-700 border border-stone-200/70"
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. COMPACT 'MAKE A CUSTOM DESIGN' ENTRY / ACTIVE CUSTOM ARTWORK */}
      <div className="mb-3.5 space-y-2">
        {selectedDesign?.imageUrl &&
        (selectedDesign.source === "custom" || !filteredPresets.some((p) => p.imageUrl === selectedDesign.imageUrl)) ? (
          <div className="bg-emerald-50/80 border-2 border-emerald-600 rounded-xl p-3 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 aspect-[17/22] rounded-md overflow-hidden border border-emerald-300 shadow-2xs shrink-0 bg-stone-100">
                <CardFrontPreview
                  artworkUrl={selectedDesign.imageUrl}
                  title={selectedDesign.title}
                  sizes="60px"
                  priority
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>
                    {selectedDesign.source === "custom"
                      ? "Your Custom Artwork (Active)"
                      : "Curated Scenario Design (Active)"}
                  </span>
                </div>
                <p className="font-serif font-bold text-stone-900 text-xs sm:text-sm truncate">
                  {selectedDesign.title}
                </p>
                <p className="text-[11px] text-stone-500">
                  ${(amountInCents / 100).toFixed(2)} including mailing{discountApplied ? " · Discount applied" : ""} · Ready to write note
                </p>
              </div>
            </div>
            {selectedDesign.source === "custom" ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenCustomArt) onOpenCustomArt();
                  else setIsCustomSheetOpen(true);
                }}
                className="text-xs font-semibold text-stone-700 hover:text-stone-900 bg-white border border-stone-200 hover:bg-stone-50 px-2.5 py-1.5 rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
              >
                New art
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (onOpenCustomArt) {
                onOpenCustomArt();
              } else {
                setIsCustomSheetOpen(true);
              }
            }}
            className="w-full flex items-center justify-between gap-3 bg-stone-50 hover:bg-stone-100/90 active:bg-stone-200/70 border border-dashed border-stone-300 rounded-xl px-3.5 py-2.5 transition text-left cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-semibold leading-snug text-stone-900">
                  Create custom artwork
                </span>
                <span className="block text-[11px] leading-snug text-stone-500">
                  From a personal scene or memory
                </span>
              </div>
            </div>
            <span className="text-xs font-medium text-emerald-800 bg-white border border-stone-200 px-2.5 py-1 rounded-md shrink-0 shadow-2xs">
              Create
            </span>
          </button>
        )}
      </div>

      {/* 4. TWO-COLUMN 17:22 CARD GRID */}
      <section aria-label="Card designs">
        {filteredPresets.length === 0 ? (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-stone-400 mx-auto" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-stone-800">
              No cards found for &ldquo;{activeOccasion}&rdquo;
            </h3>
            <p className="text-xs text-stone-500 max-w-xs mx-auto">
              Try selecting &ldquo;All&rdquo; or explore other personal occasions.
            </p>
            <button
              type="button"
              onClick={() => setActiveOccasion("All")}
              className="inline-flex items-center justify-center text-xs font-medium bg-stone-900 text-white px-4 py-2 rounded-lg min-h-[44px] cursor-pointer"
            >
              Show all cards
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Dedicated Your Custom Cover card if custom art is selected or saved */}
            {(selectedDesign?.source === "custom" || lastCustomArtwork) && (() => {
              const customArt = selectedDesign?.source === "custom" ? selectedDesign : lastCustomArtwork!;
              const isSelected = selectedDesign?.source === "custom";

              return (
                <div
                  key="custom-art-cover-card"
                  onClick={() => {
                    if (!isSelected && onRestoreCustomArt) {
                      onRestoreCustomArt();
                    }
                  }}
                  className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all text-left bg-white select-none focus-within:ring-2 focus-within:ring-emerald-600 ${
                    isSelected
                      ? "border-emerald-600 ring-2 ring-emerald-600/20 shadow-md cursor-default"
                      : "border-stone-200/90 hover:border-emerald-400/80 shadow-2xs cursor-pointer"
                  }`}
                >
                  <div className="relative w-full aspect-[17/22] bg-stone-100 overflow-hidden">
                    <CardFrontPreview
                      artworkUrl={customArt.imageUrl}
                      title={customArt.title || "Your Custom Cover"}
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 25vw"
                      priority
                    />

                    {isSelected ? (
                      <div
                        className="absolute top-2 left-2 z-10 bg-emerald-700 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md ring-2 ring-white"
                        aria-label="Selected"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="absolute inset-x-2 bottom-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRestoreCustomArt?.();
                          }}
                          className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold py-1.5 px-2 rounded-lg shadow-sm transition cursor-pointer text-center"
                        >
                          Use my custom cover
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-2 sm:p-2.5 flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-stone-900 truncate font-serif">
                      Your Custom Cover
                    </span>
                    <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0">
                      Custom
                    </span>
                  </div>
                </div>
              );
            })()}

            {filteredPresets.map((preset, index) => {
              const isSelected = selectedDesign?.imageUrl === preset.imageUrl;
              // Eager load first row (first 4 items on desktop) for LCP / CLS prevention; lazy load remaining
              const isFirstRow = index < 4;

              return (
                <div
                  key={preset.id}
                  onClick={() => handleCardClick(preset)}
                  className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all text-left bg-white cursor-pointer select-none focus-within:ring-2 focus-within:ring-emerald-600 ${
                    isSelected
                      ? "border-emerald-600 ring-2 ring-emerald-600/20 shadow-md"
                      : "border-stone-200/90 hover:border-stone-400/80 shadow-2xs"
                  }`}
                >
                  {/* Card Front Frame (17:22 ratio) */}
                  <div className="relative w-full aspect-[17/22] bg-stone-100 overflow-hidden">
                    <CardFrontPreview
                      artworkUrl={preset.imageUrl}
                      title={preset.title}
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 25vw"
                      priority={isFirstRow}
                    />

                    {/* Preselection / Selection Checkmark Badge */}
                    {isSelected && (
                      <div
                        className="absolute top-2 left-2 z-10 bg-emerald-700 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md ring-2 ring-white"
                        aria-label="Selected"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />
                      </div>
                    )}

                    {/* Small Preview Control */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewPreset(preset);
                      }}
                      className="absolute bottom-2 right-2 z-10 bg-white/90 hover:bg-white text-stone-800 text-[11px] font-medium px-2 py-1.5 rounded-md shadow-xs backdrop-blur-xs flex items-center gap-1 border border-stone-200/70 min-h-[32px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                      aria-label={`Preview ${preset.title}`}
                    >
                      <Eye className="w-3.5 h-3.5 text-stone-600" aria-hidden="true" />
                      <span>Preview</span>
                    </button>
                  </div>

                  {/* Card Title (Short, No Paragraphs) */}
                  <div className="p-2 sm:p-2.5 flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-stone-900 truncate font-serif">
                      {preset.title}
                    </span>
                    <span className="text-[10px] text-stone-500 uppercase tracking-wider shrink-0">
                      {preset.occasion}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. PREVIEW BOTTOM SHEET (using native <dialog>) */}
      <Sheet
        isOpen={previewPreset !== null}
        onClose={() => setPreviewPreset(null)}
        title={previewPreset?.title || "Card Preview"}
        description={previewPreset ? `${previewPreset.occasion} • Folded greeting card (4.25 × 5.5 in)` : ""}
      >
        {previewPreset && (
          <div className="space-y-4">
            <div className="w-full max-w-xs mx-auto bg-stone-100 p-3 rounded-xl">
              <CardFrontPreview
                artworkUrl={previewPreset.imageUrl}
                title={previewPreset.title}
                sizes="(max-width: 640px) 85vw, 320px"
                priority
              />
            </div>

            <div className="bg-stone-50 rounded-xl p-3 text-xs text-stone-600 space-y-1">
              <p className="font-medium text-stone-900">Card details</p>
              <p>Mailed in an envelope with your message written in real pen ink inside.</p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectDesign(previewPreset);
                  setPreviewPreset(null);
                }}
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm py-3 px-4 rounded-xl min-h-[44px] cursor-pointer"
              >
                {selectedDesign?.imageUrl === previewPreset.imageUrl
                  ? "Selected"
                  : "Use this cover"}
              </button>
              <button
                type="button"
                onClick={() => setPreviewPreset(null)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-sm py-3 px-4 rounded-xl min-h-[44px] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* 6. CUSTOM ART PLACEHOLDER SHEET (UI entry for S1-05) */}
      <Sheet
        isOpen={isCustomSheetOpen}
        onClose={() => setIsCustomSheetOpen(false)}
        title="Make a custom design"
        description="Describe a personal scene or memory for custom artwork"
      >
        <div className="space-y-4 text-stone-800">
          <p className="text-sm font-serif font-medium text-stone-900">
            What would make this card feel like them?
          </p>
          <div className="space-y-2">
            {[
              "A golden retriever sitting under an autumn oak tree",
              "Two vintage coffee mugs with wildflowers in morning light",
              "A serene sailboat on calm blue waters at sunset",
            ].map((starter, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-stone-200 bg-stone-50/70 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                onClick={() => {
                  // Prepopulate or acknowledge
                }}
              >
                &ldquo;{starter}&rdquo;
              </div>
            ))}
          </div>

          <div className="bg-amber-50/80 border border-amber-200/70 rounded-xl p-3 text-xs text-amber-900">
            <span className="font-semibold block mb-0.5">Custom artwork generation coming soon</span>
            AI-assisted custom generation is arriving in sprint S1-05. For now, choose from our ready-made card collection.
          </div>

          <button
            type="button"
            onClick={() => setIsCustomSheetOpen(false)}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium text-sm py-3 px-4 rounded-xl min-h-[44px] cursor-pointer"
          >
            Browse ready-made cards
          </button>
        </div>
      </Sheet>
    </div>
  );
}
