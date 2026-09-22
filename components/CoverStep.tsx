"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, Wand2, RefreshCw, Check } from "lucide-react";
import { CARD_PRESETS, OCCASIONS, CardPreset } from "@/lib/card-presets";

interface CoverStepProps {
  selectedCover: string;
  onSelectCover: (url: string, preset?: CardPreset) => void;
  occasion: string;
  onChangeOccasion: (occ: string) => void;
  customPrompt: string;
  onChangePrompt: (prompt: string) => void;
}

export function CoverStep({
  selectedCover,
  onSelectCover,
  occasion,
  onChangeOccasion,
  customPrompt,
  onChangePrompt,
}: CoverStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!customPrompt.trim()) {
      setError("Please describe the artwork you want on the card cover.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/generate-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt,
          occasion,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate artwork. Please try again.");
      }

      const data = await res.json();
      if (data.imageUrl) {
        onSelectCover(data.imageUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error generating cover";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            1
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            5×7 Front Cover Art
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          Pick a curated design from our vending carousel or type a custom prompt to have AI paint a unique card cover.
        </p>
      </div>

      {/* Occasion & Prompt Generator Form */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
              Occasion
            </label>
            <select
              value={occasion}
              onChange={(e) => onChangeOccasion(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            >
              {OCCASIONS.map((occ) => (
                <option key={occ} value={occ}>
                  {occ}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
              AI Artwork Prompt
            </label>
            <div className="relative">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => {
                  onChangePrompt(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Whimsical watercolor wildflowers, soft pastels..."
                className="w-full pl-3.5 pr-28 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3.5 bg-stone-900 hover:bg-black text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Painting...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        )}
      </div>

      {/* Quick-Pick Carousel / Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Quick-Pick Vending Slots
          </label>
          <span className="text-[11px] text-stone-400">Click to dispense</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CARD_PRESETS.map((preset) => {
            const isSelected = selectedCover.includes(preset.id) || selectedCover === preset.imageUrl;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectCover(preset.imageUrl, preset)}
                className={`group relative text-left rounded-xl overflow-hidden border-2 transition-all p-1.5 bg-white ${
                  isSelected
                    ? "border-amber-500 ring-2 ring-amber-500/20 shadow-md"
                    : "border-stone-200 hover:border-stone-400/80 shadow-sm"
                }`}
              >
                <div className="relative aspect-[5/7] w-full rounded-lg overflow-hidden bg-stone-100">
                  <Image
                    src={preset.imageUrl}
                    alt={preset.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white p-1 rounded-full shadow">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                    <span className="block text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      {preset.occasion}
                    </span>
                    <span className="block text-xs font-semibold text-white truncate">
                      {preset.title}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
