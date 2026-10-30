"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Sparkles, X, Wand2, Loader2, AlertCircle, Check, ArrowRight } from "lucide-react";
import { OCCASIONS } from "@/lib/card-presets";
import { CardFrontPreview } from "@/components/CardFrontPreview";

interface CustomAiCommissionDrawerProps {
  savedArtwork?: { imageUrl: string; prompt: string; occasion: string } | null;
  onArtworkGenerated?: (art: { imageUrl: string; prompt: string; occasion: string }) => void;
  isOpen: boolean;
  onClose: () => void;
  onSelectCover: (art: {
    imageUrl: string;
    prompt: string;
    occasion: string;
    source?: "preset" | "custom";
    presetId?: string;
  }) => void;
  currentOccasion: string;
}

const QUICK_IDEAS: Record<string, string[]> = {
  Birthday: [
    "Golden retriever wearing party hat with confetti in soft watercolor",
    "Whimsical hot air balloons at pastel sunrise with gold flecks",
    "Vintage champagne tower with sparkling starlight effervescence",
  ],
  "Thank You": [
    "Delicate sunlit chamomile and lavender bouquet in mason jar",
    "Warm ceramic coffee mug on rustic cedar desk with morning glow",
    "Serene botanical olive wreath in timeless earthy watercolor",
  ],
  "Thinking of You": [
    "Cozy armchair by rain-streaked window looking out at misty forest",
    "Quiet ocean dunes with tall sea grass under lavender sunset sky",
    "Warm glowing lantern resting on ancient stone steps with ivy",
  ],
  Congratulations: [
    "Grand vintage champagne coupe with golden effervescent bubbles",
    "Magnificent golden sunrise breaking over mountain summit",
    "Festive evergreen laurel with celebratory celestial sparkles",
  ],
  Anniversary: [
    "Two swans gliding on moonlit mirror lake under weeping willow",
    "Lush monstera and gardenia botanical print with golden geometric accents",
    "Quiet romantic beach walk with gentle tide at twilight",
  ],
  "Love & Romance": [
    "Moody oil painting of deep crimson velvet garden roses",
    "Cozy couple silhouette under umbrella beneath glowing Parisian streetlamps",
    "Crescent moon nestled in starry midnight blue velvet sky",
  ],
  "Sympathy & Support": [
    "Tranquil weeping willow beside a peaceful reflecting stream",
    "Solitary elegant white calla lily in gentle morning light",
    "Serene misty mountain valley at peaceful morning sunrise",
  ],
  "Just Because": [
    "Playful ginger tabby cat sleeping inside a sunlit greenhouse",
    "Vintage manual typewriter with sweet pea wildflowers on cedar desk",
    "Whimsical hot air balloon drifting over rolling green orchards",
  ],
  "Christmas & Holidays": [
    "Snow-dusted pine lodge with warm glowing amber windows at twilight",
    "Vintage botanical cedar branch with festive red winter berries",
    "Classic nostalgic holiday mantelpiece with warm glowing hearth",
  ],
  Halloween: [
    "Warm glowing carved pumpkins on antique stone porch in autumn mist",
    "Enchanted moonlit pumpkin patch with swirling golden leaves",
    "Whimsical cozy ghost reading by candle in autumn woodland",
  ],
  "Easter & Spring": [
    "Pastel wildflower meadow with sweet baby bunny in morning dew",
    "Delicate flowering cherry blossom bough against pale azure sky",
    "Rustic woven basket with speckled pastel eggs and blooming peonies",
  ],
};

export function CustomAiCommissionDrawer({
  savedArtwork,
  onArtworkGenerated,
  isOpen,
  onClose,
  onSelectCover,
  currentOccasion,
}: CustomAiCommissionDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState(currentOccasion || "Birthday");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyBlock, setPolicyBlock] = useState<{
    message: string;
    suggestion?: string;
  } | null>(null);
  const [presetAlternative, setPresetAlternative] = useState<{
    id: string;
    title: string;
    imageUrl: string;
    occasion: string;
  } | null>(null);
  const [generatedArt, setGeneratedArt] = useState<{
    imageUrl: string;
    prompt: string;
    occasion: string;
  } | null>(null);

  useEffect(() => {
    if (savedArtwork?.imageUrl) {
      setGeneratedArt(savedArtwork);
      setPrompt(savedArtwork.prompt);
      setOccasion(savedArtwork.occasion);
    } else setGeneratedArt(null);
  }, [savedArtwork?.imageUrl]);

  if (!isOpen) return null;

  const quickPicks = QUICK_IDEAS[occasion] || QUICK_IDEAS["Birthday"] || [];

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please describe your custom card cover vision.");
      return;
    }

    setError(null);
    setPolicyBlock(null);
    setPresetAlternative(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/generate-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          occasion,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // HTTP 422: Policy Refusal (IP / Trademark / Safety)
        if (res.status === 422 || data.code === "ART_REQUEST_BLOCKED") {
          setGeneratedArt(null);
          setPolicyBlock({
            message:
              data.message ||
              "This prompt triggered image safety guidelines (often due to trademarked names or restricted characters).",
            suggestion: data.suggestion,
          });
          if (data.presetRecommendation) {
            setPresetAlternative(data.presetRecommendation);
          }
          return;
        }

        // HTTP 429: Rate limit
        if (res.status === 429) {
          setGeneratedArt(null);
          setError(
            data.message ||
              "You've reached the 5-card AI generation limit for now. Please choose from our ready-made card collection."
          );
          if (data.presetRecommendation) {
            setPresetAlternative(data.presetRecommendation);
          }
          return;
        }

        // HTTP 503 / 500 / other errors
        setGeneratedArt(null);
        setError(
          data.message ||
            "Our AI studio is temporarily busy. Please try again shortly or choose from our ready-made collection."
        );
        if (data.presetRecommendation) {
          setPresetAlternative(data.presetRecommendation);
        }
        return;
      }

      // Success: True custom art generated
      if (data.imageUrl) {
        const artwork = {
          imageUrl: data.imageUrl,
          prompt: prompt.trim(),
          occasion,
        };
        setGeneratedArt(artwork);
        onArtworkGenerated?.(artwork);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error generating custom art";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelect = () => {
    if (!generatedArt) return;
    onSelectCover({
      ...generatedArt,
      source: "custom",
    });
    onClose();
  };

  const handleSelectPresetAlternative = () => {
    if (!presetAlternative) return;
    onSelectCover({
      imageUrl: presetAlternative.imageUrl,
      prompt: presetAlternative.title,
      occasion: presetAlternative.occasion,
      source: "preset",
      presetId: presetAlternative.id,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#FCFAF7] h-full shadow-2xl flex flex-col overflow-y-auto border-l border-stone-200 animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-commission-title"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 bg-white sticky top-0 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 id="ai-commission-title" className="font-serif text-lg font-bold text-stone-900 leading-tight">
                Create Custom Artwork
              </h2>
              <p className="text-xs text-stone-500">
                Describe your vision and we&apos;ll create custom cover artwork (~15 seconds)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition"
            aria-label="Close commission drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 flex-1">
          {/* Occasion Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Card Occasion
            </label>
            <select
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-600 font-medium"
            >
              {OCCASIONS.map((occ) => (
                <option key={occ} value={occ}>
                  {occ}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt Textarea */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
              Artwork Vision &amp; Subject
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., Warm watercolor bouquet of sunlit lavender and daisies in an artisan ceramic pitcher..."
              className="w-full p-3.5 bg-white border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
            <p className="text-[11px] text-stone-400 mt-1">
              Tip: Mention lighting, medium (watercolor, gouache, oil painting), and specific favorite blooms or symbols.
            </p>
          </div>

          {/* Quick Ideas */}
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Studio Inspiration Ideas
            </span>
            <div className="space-y-1.5">
              {quickPicks.map((idea, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(idea);
                    if (error) setError(null);
                  }}
                  className="w-full text-left p-2.5 bg-white hover:bg-amber-50/70 border border-stone-200/80 hover:border-amber-300 rounded-lg text-xs text-stone-700 transition flex items-center justify-between group"
                >
                  <span className="line-clamp-1">{idea}</span>
                  <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                    Use
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Action */}
          <div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-3 px-4 bg-stone-900 hover:bg-black disabled:bg-stone-300 text-white rounded-xl font-medium text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Creating your artwork (~15s)...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 text-emerald-400" />
                  <span>Create Custom Artwork</span>
                </>
              )}
            </button>
          </div>

          {policyBlock && (
            <div className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl space-y-2.5 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block text-stone-900">
                    Prompt Safety &amp; Rights Notice
                  </span>
                  <p className="text-stone-700 mt-0.5 leading-relaxed">
                    {policyBlock.message}
                  </p>
                </div>
              </div>

              {policyBlock.suggestion && (
                <div className="p-3 bg-white/90 rounded-xl border border-amber-200/90 text-stone-800 space-y-1">
                  <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    How to rephrase your prompt:
                  </span>
                  <p className="text-[11px] text-stone-600 leading-normal">
                    {policyBlock.suggestion}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Optional Ready-Made Alternative (Separate from custom generation) */}
          {presetAlternative && !generatedArt && (
            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-800">
                  Ready-Made Card Recommendation
                </span>
                <span className="text-[10px] text-stone-500 uppercase tracking-wider">
                  {presetAlternative.occasion}
                </span>
              </div>
              <p className="text-[11px] text-stone-600">
                Prefer not to rephrase? You can choose this matching card from our collection:
              </p>
              <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-stone-200">
                <div className="w-14 aspect-[17/22] rounded-lg overflow-hidden bg-stone-100 shrink-0">
                  <CardFrontPreview
                    artworkUrl={presetAlternative.imageUrl}
                    title={presetAlternative.title}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-serif font-bold text-stone-900 truncate">
                    {presetAlternative.title}
                  </span>
                  <span className="block text-[10px] text-stone-500">
                    Folded greeting card
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectPresetAlternative}
                    className="mt-1.5 px-3 py-1 bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Choose this card instead →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* True Result Preview (Success Only) */}
          {generatedArt && (
            <div className="bg-white p-4 rounded-2xl border border-stone-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-4 h-4" /> Artwork Created
                </span>
              </div>
              <div className="w-full max-w-[240px] mx-auto">
                <CardFrontPreview
                  artworkUrl={generatedArt.imageUrl}
                  title={generatedArt.prompt}
                  priority
                />
              </div>
              <p className="text-xs text-stone-600 text-center italic line-clamp-2">
                &ldquo;{generatedArt.prompt}&rdquo;
              </p>
              <button
                type="button"
                onClick={handleSelect}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>Select &amp; Write Note →</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
