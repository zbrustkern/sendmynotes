"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, Wand2, RefreshCw, Check, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { CARD_PRESETS, OCCASIONS, CardPreset } from "@/lib/card-presets";

interface CoverStepProps {
  selectedCover: string;
  onSelectCover: (url: string, preset?: CardPreset) => void;
  occasion: string;
  onChangeOccasion: (occ: string) => void;
  customPrompt: string;
  onChangePrompt: (prompt: string) => void;
  onContinue?: () => void;
}

const OCCASION_PROMPT_INSPIRATIONS: Record<string, string[]> = {
  Birthday: [
    "Whimsical watercolor balloons in golden hour sunset",
    "Wildflower botanical meadow with gentle gold flecks",
    "Sparkling vintage champagne coupes with starry sky",
  ],
  "Thank You": [
    "Warm botanical painting of lavender and chamomile",
    "Sunlit ceramic coffee mug on rustic oak desk",
    "Classical olive branch wreath in warm earthen tones",
  ],
  "Thinking of You": [
    "Cozy window armchair looking out on gentle rain",
    "Misty emerald evergreen pine forest in watercolor",
    "Quiet coastal dunes at dusk with soft ocean tide",
  ],
  Congratulations: [
    "Champagne coupe with starry effervescence",
    "Majestic sunrise breaking over mountain summit",
    "Festive laurel garland with celebratory starlight",
  ],
  Anniversary: [
    "Two swans on moonlit lake with willow reflections",
    "Intertwined botanical monstera and gardenia blooms",
    "Quiet golden hour shoreline with soft ocean breeze",
  ],
  "Love & Romance": [
    "Velvet crimson garden roses in classic oil painting",
    "Two silhouettes under umbrella along cozy city walk",
    "Crescent moon and glowing lanterns in twilight sky",
  ],
  "Sympathy & Support": [
    "Gentle weeping willow beside tranquil reflective stream",
    "Single white lily in soft morning light",
    "Serene pastel sunrise over peaceful rolling hills",
  ],
  "Just Because": [
    "Curious ginger cat in sunlit botanic conservatory",
    "Vintage typewriter with sweet pea flowers on desk",
    "Whimsical hot air balloon floating over orchards",
  ],
  "Christmas & Holidays": [
    "Cozy snow-dusted pine cottage with glowing windows at twilight",
    "Vintage botanical evergreen branch with gold ribbon and berries",
    "Whimsical watercolor nutcracker and warm festive fireplace",
  ],
  Halloween: [
    "Warm glowing carved jack-o'-lantern on vintage stone porch",
    "Misty autumn moonlight over enchanted pumpkin patch",
    "Whimsical cozy ghost with candle in vintage autumn forest",
  ],
  "Easter & Spring": [
    "Gentle pastel spring bunny nestled in blooming chamomile meadow",
    "Soft watercolor easter basket with speckled eggs and sweet peas",
    "Sunlit spring blossom bough with robin singing in morning dew",
  ],
};

export function CoverStep({
  selectedCover,
  onSelectCover,
  occasion,
  onChangeOccasion,
  customPrompt,
  onChangePrompt,
  onContinue,
}: CoverStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingGenerations, setRemainingGenerations] = useState<number | null>(null);
  const [showCurated, setShowCurated] = useState(true);
  const [generatedArt, setGeneratedArt] = useState<{
    imageUrl: string;
    prompt: string;
    occasion: string;
  } | null>(null);

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

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setRemainingGenerations(0);
          setError(data.message || "You've reached the 5-card AI generation limit for now. Please select from our curated designs below!");
          return;
        }
        throw new Error(data.error || "Failed to generate artwork. Please try again.");
      }

      if (typeof data.remaining === "number") {
        setRemainingGenerations(data.remaining);
      }

      if (data.imageUrl) {
        setGeneratedArt({
          imageUrl: data.imageUrl,
          prompt: customPrompt,
          occasion,
        });
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
          Pick a design from our curated collection or type a custom prompt to have AI paint a unique card cover.
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                AI Artwork Prompt
              </label>
              {remainingGenerations !== null && (
                <span className="text-[10px] text-stone-400 font-medium">
                  {remainingGenerations} of 5 generations available
                </span>
              )}
            </div>
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

            {/* Inspiration Prompt Chips */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 mr-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" /> Ideas:
              </span>
              {(OCCASION_PROMPT_INSPIRATIONS[occasion] || OCCASION_PROMPT_INSPIRATIONS["Birthday"]).map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onChangePrompt(chip);
                    if (error) setError(null);
                  }}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-stone-100 hover:bg-amber-50 text-stone-600 hover:text-amber-900 border border-stone-200/90 hover:border-amber-300 transition-all text-left truncate max-w-[210px] sm:max-w-[260px] cursor-pointer"
                  title={chip}
                >
                  &ldquo;{chip}&rdquo;
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        )}
      </div>

      {/* NEW: Display Generated AI Art Immediately with Visual Confirmation & Direct Next Action */}
      {generatedArt && (
        <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/90 border-2 border-amber-400 rounded-2xl p-4 sm:p-5 shadow-md animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              Your Custom AI Painting
            </span>
            {selectedCover === generatedArt.imageUrl ? (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3 stroke-[3]" />
                Active Cover
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSelectCover(generatedArt.imageUrl)}
                className="text-[11px] font-semibold text-amber-800 bg-white border border-amber-300 hover:bg-amber-100 px-2.5 py-0.5 rounded-full transition cursor-pointer"
              >
                Use this AI painting
              </button>
            )}
          </div>

          <div
            onClick={() => onSelectCover(generatedArt.imageUrl)}
            className="flex items-center gap-3.5 bg-white/90 backdrop-blur-sm p-3 rounded-xl border border-amber-200/90 cursor-pointer hover:border-amber-400 transition"
          >
            <div className="relative w-16 sm:w-20 aspect-[5/7] rounded-lg overflow-hidden border border-stone-200 shadow-sm shrink-0 bg-stone-100">
              <Image
                src={generatedArt.imageUrl}
                alt="AI Generated Cover Art"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">
                {generatedArt.occasion} • Custom Prompt
              </span>
              <p className="text-xs sm:text-sm font-medium text-stone-800 italic line-clamp-2">
                &ldquo;{generatedArt.prompt}&rdquo;
              </p>
              <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1">
                Active on your 5×7 greeting card preview &rarr;
              </p>
            </div>
          </div>

          {/* Quick Continue Action Button: eliminates need to scroll past gallery */}
          {onContinue && (
            <div className="mt-3.5 pt-3 border-t border-amber-200/60 flex items-center justify-between gap-3">
              <span className="text-[11px] text-stone-500">
                Happy with this cover?
              </span>
              <button
                type="button"
                onClick={onContinue}
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <span>Write Inside Note</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Curated Collection (Collapsible / Non-blocking) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/80 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowCurated(!showCurated)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-700 hover:text-stone-900 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Curated Card Collection</span>
            <span className="text-[11px] text-stone-400 font-normal lowercase">
              ({CARD_PRESETS.length} ready designs)
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowCurated(!showCurated)}
            className="text-stone-400 hover:text-stone-700 p-1 rounded-lg transition cursor-pointer"
          >
            {showCurated ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>

        {showCurated && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
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
                      unoptimized
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
        )}
      </div>
    </div>
  );
}
