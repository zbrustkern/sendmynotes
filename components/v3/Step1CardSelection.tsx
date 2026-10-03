"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  Sparkles,
  ArrowRight,
  Check,
  ZoomIn,
  X,
  Palette,
  ShieldCheck,
  Feather,
  ChevronRight,
} from "lucide-react";
import { CARD_PRESETS, OCCASIONS, CardPreset } from "@/lib/card-presets";
import { CustomAiCommissionDrawer } from "./CustomAiCommissionDrawer";

interface Step1CardSelectionProps {
  selectedCardUrl: string;
  selectedCardTitle: string;
  selectedOccasion: string;
  onSelectPreset: (preset: CardPreset) => void;
  onSelectCustomArt: (art: { imageUrl: string; prompt: string; occasion: string }) => void;
  onContinue: () => void;
}

export function Step1CardSelection({
  selectedCardUrl,
  selectedCardTitle,
  selectedOccasion,
  onSelectPreset,
  onSelectCustomArt,
  onContinue,
}: Step1CardSelectionProps) {
  const [filterOccasion, setFilterOccasion] = useState<string>("All");
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [zoomPreset, setZoomPreset] = useState<CardPreset | null>(null);

  // Calculate active counts for each occasion filter chip
  const occasionCounts = useMemo(() => {
    const counts: Record<string, number> = { All: CARD_PRESETS.length };
    OCCASIONS.forEach((occ) => {
      counts[occ] = CARD_PRESETS.filter((p) => p.occasion === occ).length;
    });
    return counts;
  }, []);

  // Filtered preset cards
  const visiblePresets = useMemo(() => {
    if (filterOccasion === "All") return CARD_PRESETS;
    return CARD_PRESETS.filter((p) => p.occasion === filterOccasion);
  }, [filterOccasion]);

  // Currently selected preset or card info
  const activePreset = useMemo(() => {
    return CARD_PRESETS.find((p) => p.imageUrl === selectedCardUrl) || null;
  }, [selectedCardUrl]);

  return (
    <div className="space-y-6 pb-28 md:pb-12">
      {/* ASTER & BLANCHE COLOPHON & VALUE BANNER */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs p-4 sm:p-5 transition">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3 mb-3">
          {/* Colophon badge */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-700/80 shrink-0" />
            <span className="text-xs uppercase font-serif tracking-widest text-stone-600 font-semibold">
              Aster &amp; Blanche Press, Est. Lake Forest, IL
            </span>
          </div>

          {/* Pedigree tag */}
          <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-medium">
            <Feather className="w-3.5 h-3.5 text-amber-700" />
            <span>Heavy 100 lb cardstock • Real ballpoint inking</span>
          </div>
        </div>

        {/* Value banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-stone-800">
          <div className="space-y-0.5">
            <h1 className="text-lg sm:text-xl font-serif font-bold text-stone-900 tracking-tight">
              Ready-Made Stationery Leaf Collection
            </h1>
            <p className="text-xs text-stone-600">
              Select an authentic front leaf below, or commission custom artwork with Studio AI.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-amber-50/80 border border-amber-200/80 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-900 shrink-0 self-start sm:self-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>$9.00 Flat Rate • Real Pen Inking &amp; First-Class USPS Postage Included</span>
          </div>
        </div>
      </div>

      {/* OCCASION FILTER CHIPS WITH ACTIVE COUNTS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-stone-500 font-medium px-1">
          <span>Filter by Occasion</span>
          <span>Showing {visiblePresets.length} of {CARD_PRESETS.length} Curated Cards</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {/* All chip */}
          <button
            type="button"
            onClick={() => setFilterOccasion("All")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer shrink-0 border ${
              filterOccasion === "All"
                ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
            }`}
          >
            All ({occasionCounts["All"] || 11})
          </button>

          {/* 11 Occasion chips */}
          {OCCASIONS.map((occ) => {
            const count = occasionCounts[occ] || 0;
            const isSelected = filterOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                onClick={() => setFilterOccasion(occ)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition cursor-pointer shrink-0 border ${
                  isSelected
                    ? "bg-amber-800 text-white border-amber-800 shadow-xs"
                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                }`}
              >
                {occ} {count > 0 && <span className="opacity-75">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* CURATED A2 CARDS GRID (True vertical A2 5:7 proportions: 4.25" × 5.5") */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
        {visiblePresets.map((preset) => {
          const isSelected = selectedCardUrl === preset.imageUrl;
          return (
            <div
              key={preset.id}
              onClick={() => onSelectPreset(preset)}
              className={`group relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer flex flex-col bg-white border ${
                isSelected
                  ? "border-amber-600 ring-2 ring-amber-600/30 shadow-md transform -translate-y-0.5"
                  : "border-stone-200/90 hover:border-stone-300 hover:shadow-md"
              }`}
            >
              {/* True vertical A2 proportions (5:7 ratio) */}
              <div className="relative aspect-[5/7] w-full bg-stone-100 overflow-hidden">
                <Image
                  src={preset.imageUrl}
                  alt={preset.title}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-103"
                  priority={preset.id === "preset-bday-balloons" || preset.id === "preset-thankyou-botanical"}
                />

                {/* Subtle paper texture overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Selected Checkmark Badge */}
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-amber-700 text-white flex items-center justify-center shadow-md animate-in zoom-in-75 duration-150">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                )}

                {/* Quick Zoom Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomPreset(preset);
                  }}
                  className="absolute bottom-2.5 right-2.5 p-1.5 rounded-full bg-white/90 text-stone-700 hover:text-black hover:bg-white shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Zoom card leaf"
                  aria-label={`Preview ${preset.title}`}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                {/* Occasion pill tag on image */}
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-xs text-[10px] font-semibold uppercase tracking-wider text-stone-700 shadow-2xs">
                  {preset.occasion}
                </span>
              </div>

              {/* Card Meta Info */}
              <div className="p-3 sm:p-3.5 flex flex-col justify-between flex-1 bg-white">
                <div>
                  <h3 className="font-serif font-bold text-sm text-stone-900 line-clamp-1 group-hover:text-amber-800 transition">
                    {preset.title}
                  </h3>
                  <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-tight">
                    {preset.prompt}
                  </p>
                </div>

                <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="font-serif font-bold text-stone-800">$9.00</span>
                  <span
                    className={`font-medium text-[11px] flex items-center gap-0.5 ${
                      isSelected ? "text-amber-700 font-semibold" : "text-stone-400 group-hover:text-stone-700"
                    }`}
                  >
                    {isSelected ? "Selected" : "Select"}
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DISCRETE SECONDARY BUTTON: CUSTOM AI COMMISSION DRAWER */}
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-amber-50/50 border border-amber-200/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-900">
            <Palette className="w-3.5 h-3.5 text-amber-700" />
            <span>Looking for something bespoke?</span>
          </div>
          <p className="text-xs text-stone-600">
            Have our Studio AI paint a one-of-a-kind botanical, watercolor, or festive cover tailored to your story.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAiDrawerOpen(true)}
          className="px-4 py-2 bg-white hover:bg-stone-50 text-stone-800 hover:text-black border border-stone-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-700" />
          <span>+ Commission custom artwork with Studio AI (~15s)</span>
        </button>
      </div>

      {/* DESKTOP ADVANCE BAR */}
      <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-16 rounded-lg overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
            <Image
              src={selectedCardUrl}
              alt={selectedCardTitle}
              fill
              className="object-cover"
            />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Selected Card Leaf
            </div>
            <div className="font-serif font-bold text-stone-900 text-sm">
              {selectedCardTitle || activePreset?.title || "Curated Stationery Card"}
            </div>
            <div className="text-xs text-stone-500">
              $9.00 flat rate • Real pen inking &amp; USPS postage included
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="px-6 py-3 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <span>Write Note →</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg flex items-center justify-between gap-3 safe-area-inset-bottom">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-10 h-14 rounded-md overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
            <Image
              src={selectedCardUrl}
              alt={selectedCardTitle}
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="font-serif font-bold text-stone-900 text-xs truncate">
              {selectedCardTitle || activePreset?.title || "Card Selected"}
            </p>
            <p className="text-[11px] text-amber-800 font-semibold">
              $9.00 Flat Rate
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="px-5 py-2.5 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span>Write Note →</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ZOOM PREVIEW MODAL */}
      {zoomPreset && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setZoomPreset(null)}
        >
          <div
            className="relative max-w-sm w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  {zoomPreset.occasion}
                </span>
                <h3 className="font-serif font-bold text-base text-stone-900">
                  {zoomPreset.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setZoomPreset(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-[5/7] w-full rounded-xl overflow-hidden shadow-inner border border-stone-200">
              <Image
                src={zoomPreset.imageUrl}
                alt={zoomPreset.title}
                fill
                className="object-cover"
              />
            </div>

            <p className="text-xs text-stone-600 italic text-center">
              &ldquo;{zoomPreset.prompt}&rdquo;
            </p>

            <button
              type="button"
              onClick={() => {
                onSelectPreset(zoomPreset);
                setZoomPreset(null);
              }}
              className="w-full py-2.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-semibold transition"
            >
              Select This Card Leaf
            </button>
          </div>
        </div>
      )}

      {/* CUSTOM AI COMMISSION DRAWER */}
      <CustomAiCommissionDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        onSelectCover={(art) => {
          onSelectCustomArt(art);
          setIsAiDrawerOpen(false);
        }}
        currentOccasion={selectedOccasion}
      />
    </div>
  );
}
