"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Sparkles, X, Wand2, Loader2, AlertCircle, Check, ArrowRight } from "lucide-react";
import { OCCASIONS } from "@/lib/card-presets";
import { CardFrontPreview } from "@/components/CardFrontPreview";
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';

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
  onGenerationOutcome?: (outcome: "requested" | "completed" | "failed") => void;
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
  onGenerationOutcome,
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
    saveCapability: string | null;
  } | null>(null);
  const { user } = useAuth();
  const [showSaveSignIn, setShowSaveSignIn] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveRequestKey, setSaveRequestKey] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousOpenRef = useRef(false);
  const occasionEditedRef = useRef(false);
  const promptEditedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Initialize a genuinely fresh draft from the picker chip. Edited inputs and
  // saved/generated work survive dismissal and a later reopen.
  useEffect(() => {
    if (isOpen && !previousOpenRef.current && !prompt && !promptEditedRef.current && !occasionEditedRef.current && !generatedArt) {
      setOccasion(OCCASIONS.includes(currentOccasion as typeof OCCASIONS[number]) ? currentOccasion : "Birthday");
    }
    previousOpenRef.current = isOpen;
  }, [isOpen, currentOccasion, prompt, generatedArt]);

  // Keep keyboard interaction inside the modal and prevent the page behind it
  // from scrolling. Parent wiring owns focus restoration to the opener.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const focusIsInNestedModal = activeElement instanceof HTMLElement &&
        !dialogRef.current?.contains(activeElement) &&
        Boolean(activeElement.closest('[role="dialog"][aria-modal="true"]'));
      if (focusIsInNestedModal) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (savedArtwork?.imageUrl) {
      setGeneratedArt(current => current?.imageUrl === savedArtwork.imageUrl ? current : {...savedArtwork, saveCapability: null});
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
    onGenerationOutcome?.("requested");

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
        onGenerationOutcome?.("failed");
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
          saveCapability: typeof data.saveCapability === 'string' ? data.saveCapability : null,
        };
        setGeneratedArt(artwork);
        onGenerationOutcome?.("completed");
        onArtworkGenerated?.(artwork);
        setSaveState('idle'); setSaveMessage('');
        setSaveRequestKey('');
      } else onGenerationOutcome?.("failed");
    } catch (err) {
      onGenerationOutcome?.("failed");
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

  const saveGeneratedArt = async () => {
    if (!generatedArt) return;
    if (!user) { setShowSaveSignIn(true); return; }
    if (!user.emailVerified) { setSaveState('error'); setSaveMessage('Verify your sign-in email before saving images. You can still use this front now.'); return; }
    if (!generatedArt.saveCapability) { setSaveState('error'); setSaveMessage('This result can no longer be saved. You can still use it now or create another front.'); return; }
    setSaveState('saving'); setSaveMessage('');
    try {
      const token = await user.getIdToken(); const requestKey = saveRequestKey || crypto.randomUUID(); if (!saveRequestKey) setSaveRequestKey(requestKey); const response = await fetch('/api/account/images/claim', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
        body: JSON.stringify({ capability: generatedArt.saveCapability, title: generatedArt.occasion }), cache: 'no-store',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Your image could not be saved. Please try again.');
      setSaveState('saved'); setSaveMessage('Saved to your images.');
    } catch (error) { setSaveState('error'); setSaveMessage(error instanceof Error ? error.message : 'Your image could not be saved. Please try again.'); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end overflow-hidden bg-[#222920]/55 backdrop-blur-[1px] animate-in fade-in duration-200"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="relative flex h-full h-[100dvh] w-full max-w-[456px] flex-col overflow-y-auto overscroll-contain border-l border-stone-200 bg-[#faf9f6] shadow-2xl animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-commission-title"
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
          <h2 id="ai-commission-title" className="font-serif text-2xl font-bold leading-tight tracking-tight text-stone-900">Create your cover</h2>
          <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700" aria-label="Close commission drawer">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed text-stone-800">Describe something they love. AI will turn your idea into cover art you can preview.</p>
          <div className="flex items-center gap-3.5 rounded-xl bg-[#ecf0e5] p-3">
            <div className="relative w-[58px] shrink-0 aspect-[17/22] rotate-[-4deg] border-2 border-white shadow-sm">
              <Image src="/sample-cat-cover.webp" alt="Watercolor of a sleeping orange cat on a kitchen windowsill" fill sizes="58px" className="object-cover" />
            </div>
            <div>
              <small className="text-xs text-stone-600">Example idea</small>
              <p className="mt-0.5 font-serif text-base italic leading-snug text-stone-900">“Her orange cat, asleep in the kitchen window.”</p>
            </div>
          </div>

          <label className="grid gap-1.5 text-[13px] font-semibold text-stone-800">
            Occasion
            <select
              value={occasion}
              onChange={(e) => { occasionEditedRef.current = true; setOccasion(e.target.value); }}
              className="min-h-11 w-full rounded-lg border border-[#babeb2] bg-white px-3 text-base font-normal focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700"
            >
              {OCCASIONS.map((occ) => <option key={occ} value={occ}>{occ}</option>)}
            </select>
          </label>

          <label className="grid gap-1.5 text-[13px] font-semibold text-stone-800">
            Your cover idea
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => { promptEditedRef.current = true; setPrompt(e.target.value); if (error) setError(null); }}
              placeholder="A favorite place, a pet, a memory you share..."
              className="min-h-[78px] w-full resize-y rounded-lg border border-[#babeb2] bg-white px-3 py-2.5 text-base font-normal text-stone-900 placeholder:text-stone-500 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700"
            />
          </label>

          <div>
            <button type="button" onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#095c46] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-[#e2e4da] disabled:text-stone-500">
              {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Creating your artwork…</span></> : <><Wand2 className="h-4 w-4" aria-hidden="true" /><span>Create artwork</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          </div>

          {/* Existing occasion ideas remain available as optional prompt starters. */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500">More ideas</span>
            {quickPicks.map((idea, idx) => (
              <button key={idx} type="button" onClick={() => { promptEditedRef.current = true; setPrompt(idea); if (error) setError(null); }} className="group flex w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-left text-xs text-stone-700 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-700">
                <span className="line-clamp-1">{idea}</span><span className="shrink-0 text-[10px] font-semibold uppercase text-emerald-800">Use</span>
              </button>
            ))}
          </div>

          {policyBlock && (
            <div role="alert" className="p-4 bg-amber-50/80 border border-amber-300 rounded-2xl space-y-2.5 text-xs text-amber-950">
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
            <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
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
                <span>Use this cover and write my note →</span>
              </button>
              <button type="button" onClick={() => void saveGeneratedArt()} disabled={saveState === 'saving' || saveState === 'saved'} className="w-full py-2.5 border border-stone-300 hover:bg-stone-50 disabled:opacity-60 rounded-xl text-sm font-medium transition">
                {saveState === 'saving' ? 'Saving to your images…' : saveState === 'saved' ? 'Saved to your images' : 'Save to my images'}
              </button>
              {saveMessage && <p role={saveState === 'error' ? 'alert' : 'status'} className={`text-xs ${saveState === 'error' ? 'text-rose-700' : 'text-emerald-800'}`}>{saveMessage}</p>}
            </div>
          )}
        </div>
      </div>
      <AuthModal isOpen={showSaveSignIn} onClose={() => setShowSaveSignIn(false)} onSuccess={() => setShowSaveSignIn(false)} title="Sign in to save this front" subtitle="Your artwork will stay here while you sign in. Saving is optional; you can still continue with this card." />
    </div>
  );
}
