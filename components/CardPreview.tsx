"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Eye, BookOpen, PenTool, Feather, ArrowRight, ArrowLeft, Maximize2, X } from "lucide-react";
import { resolvePreviewMessage } from "@/lib/note-preview";
import { NoteInteriorPreview, NotePreviewFullText } from "./NoteInteriorPreview";
import { CardFrontPreview } from "./CardFrontPreview";

interface CardPreviewProps {
  coverUrl: string;
  printedGreeting: string;
  handwrittenNote: string;
  fontStyleId: string;
  occasion?: string;
  currentStep?: number;
  initialView?: "cover" | "rightPage" | "spread" | "back";
  onNextStep?: () => void;
  onPreviousStep?: () => void;
}


export function CardPreview({
  coverUrl,
  printedGreeting,
  handwrittenNote,
  fontStyleId,
  occasion = "Custom Card",
  currentStep = 1,
  initialView,
  onNextStep,
  onPreviousStep,
}: CardPreviewProps) {
  const [viewMode, setViewMode] = useState<"cover" | "rightPage" | "spread" | "back">(
    initialView || (currentStep === 2 ? "rightPage" : "cover")
  );
  const [isSpreadModalOpen, setIsSpreadModalOpen] = useState(false);
  const spreadDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSpreadModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    spreadDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setIsSpreadModalOpen(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(spreadDialogRef.current?.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [isSpreadModalOpen]);
  const [spreadOverflow, setSpreadOverflow] = useState(false);
  const [modalSpreadOverflow, setModalSpreadOverflow] = useState(false);
  const [spreadFontState, setSpreadFontState] = useState("loading");
  const [modalSpreadFontState, setModalSpreadFontState] = useState("loading");

  // Automatically focus on cover for Step 1, inside note for Step 2 (unless caller specified initialView)
  useEffect(() => {
    if (initialView) {
      setViewMode(initialView);
    } else if (currentStep === 1) {
      setViewMode("cover");
    } else if (currentStep === 2) {
      setViewMode("rightPage");
    }
  }, [currentStep, initialView]);

  const previewMessage = resolvePreviewMessage(printedGreeting, handwrittenNote);

  return (
    <div className="flex flex-col items-center w-full">
      {/* View Switcher Controls (Outside the Card) */}
      <div className="flex items-center gap-1 mb-4 bg-stone-100 p-1 rounded-full border border-stone-200 shadow-sm max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setViewMode("cover")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
            viewMode === "cover"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Front Cover
        </button>
        <button
          type="button"
          onClick={() => setViewMode("rightPage")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
            viewMode === "rightPage"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <PenTool className="w-3.5 h-3.5 text-indigo-600" />
          Inside Note
        </button>
        <button
          type="button"
          onClick={() => setViewMode("spread")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
            viewMode === "spread"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-stone-600" />
          Open Spread
        </button>
        <button
          type="button"
          onClick={() => setViewMode("back")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap cursor-pointer ${
            viewMode === "back"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Feather className="w-3.5 h-3.5 text-amber-700" />
          Card Back
        </button>
      </div>

      {/* 1. FRONT COVER VIEW: Folded A2 Portrait 4.25" x 5.5" Greeting Card (17:22 Aspect Ratio) */}
      {viewMode === "cover" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[17/22] transition-all duration-300">
          <CardFrontPreview
            artworkUrl={coverUrl}
            title="Card front preview"
            sizes="(max-width: 768px) 100vw, 400px"
            priority
            unoptimized={Boolean(coverUrl?.startsWith("data:"))}
          />
        </div>
      )}

      {/* 2. INSIDE NOTE (RIGHT PAGE FOCUS): Prominent Full A2 View with Left Spine Fold */}
      {viewMode === "rightPage" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] transition-all duration-300">
          <NoteInteriorPreview message={previewMessage} fontStyleId={fontStyleId} showSpineShadow />
        </div>
      )}

      {/* 3. FULL OPEN SPREAD: Panoramic 8.5×5.5 View (17:11) Showing Both Leaves with proportional layout */}
      {viewMode === "spread" && (
        <>
        <div className="relative w-full max-w-full lg:max-w-[560px] aspect-[17/11] rounded-2xl shadow-2xl border-4 border-white bg-[#FDFCF7] paper-texture flex transition-all duration-300 group">
          {/* LEFT PAGE: Inside left page */}
          <div
            style={{ containerType: "inline-size" }}
            className="w-1/2 relative bg-[#FDFCF7] paper-texture border-r border-stone-200/70 select-none overflow-hidden"
          >
            {/* Inset border */}
            <div
              style={{
                position: "absolute",
                inset: "3.5cqw",
                borderRadius: "2.5cqw",
                border: "1px solid rgba(120, 113, 108, 0.25)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* CENTER BOOK SPINE FOLD: Realistic vertical crease */}
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-4 pointer-events-none z-20 flex items-center justify-center">
            <div className="w-[1.5px] h-full bg-stone-300/80 shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
          </div>

          {/* RIGHT PAGE: Uses the shared approximate note renderer */}
          <div className="w-1/2 relative">
            <NoteInteriorPreview message={previewMessage} fontStyleId={fontStyleId} className="h-full" showMetadata={false} showFullText={false} onOverflowChange={setSpreadOverflow} onFontStateChange={setSpreadFontState} />
          </div>

          {/* Expand Full Spread Button (Overlaid in bottom right corner) */}
          <button
            type="button"
            onClick={() => setIsSpreadModalOpen(true)}
            className="absolute bottom-2.5 right-2.5 z-30 px-2.5 py-1.5 bg-stone-900/80 hover:bg-stone-900 text-white text-[11px] font-semibold rounded-lg shadow-md flex items-center gap-1.5 backdrop-blur-xs transition cursor-pointer"
            title="Inspect Full Size Spread"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Inspect Full Spread</span>
          </button>
        </div>
        <NotePreviewFullText message={previewMessage} overflow={spreadOverflow} styleId={fontStyleId} fontState={spreadFontState} includeMetadata />
        </>
      )}

      {/* 4. CARD BACK VIEW: Colophon Only */}
      {viewMode === "back" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[17/22] transition-all duration-300">
          <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FCFAF7] paper-texture flex flex-col justify-center items-center group p-2">
            <Image
              src="/aster-blanche-backplate.png"
              alt="Aster & Blanche Press Card Back Colophon"
              fill
              sizes="(max-width: 768px) 100vw, 400px"
              className="object-contain p-2"
              priority
            />
            {/* Natural Right Spine Fold Shadow indicating this is the Back of Card */}
            <div className="absolute right-0 top-0 bottom-0 w-3.5 bg-gradient-to-l from-black/25 via-black/5 to-transparent pointer-events-none" />
          </div>
        </div>
      )}

      {/* Preview label outside the card */}
      <div className="w-full max-w-[380px] mt-3 px-1 flex flex-col items-start gap-1 text-xs text-stone-500">
        <span className="font-medium text-stone-700">
          {viewMode === "cover" && "Front Cover Art"}
          {viewMode === "rightPage" && "Inside Note"}
          {viewMode === "spread" && "Open Card Spread (Both Leaves)"}
          {viewMode === "back" && "Card Back Colophon"}
        </span>
        <span className="text-[11px] text-stone-400">
          Approximate preview. Handwriting spacing and line breaks may vary.
        </span>
      </div>

      {/* FULL OPEN SPREAD ENLARGED INSPECTION MODAL */}
      {isSpreadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged card preview"
          className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsSpreadModalOpen(false)}
        >
          <div
            ref={spreadDialogRef}
            className="relative max-h-[calc(100dvh-3rem)] overflow-y-auto bg-white rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-stone-700" />
                  Open card spread
                </h3>
                <p className="text-xs text-stone-500">
                  Approximate preview. Handwriting spacing and line breaks may vary.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSpreadModalOpen(false)}
                aria-label="Close enlarged card preview"
                className="shrink-0 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full aspect-[17/11] rounded-2xl shadow-xl border-4 border-white bg-[#FDFCF7] paper-texture flex">
              {/* Left page */}
              <div
                style={{ containerType: "inline-size" }}
                className="w-1/2 relative bg-[#FDFCF7] paper-texture border-r border-stone-200/70 select-none overflow-hidden"
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "3.5cqw",
                    borderRadius: "2.5cqw",
                    border: "1px solid rgba(120, 113, 108, 0.25)",
                    pointerEvents: "none",
                  }}
                />
              </div>

              {/* Center spine crease */}
              <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-4 pointer-events-none z-20 flex items-center justify-center">
                <div className="w-[1.5px] h-full bg-stone-300/80 shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
              </div>

              {/* Right page */}
              <div className="w-1/2 relative">
                <NoteInteriorPreview message={previewMessage} fontStyleId={fontStyleId} className="h-full" showMetadata={false} showFullText={false} onOverflowChange={setModalSpreadOverflow} onFontStateChange={setModalSpreadFontState} />
              </div>
            </div>
            <NotePreviewFullText message={previewMessage} overflow={modalSpreadOverflow} styleId={fontStyleId} fontState={modalSpreadFontState} includeMetadata />
          </div>
        </div>
      )}

      {/* DIRECT STEP PROGRESSION BUTTON: Move forward from here */}
      {onNextStep && (
        <div className="w-full mt-4 pt-3.5 border-t border-stone-200/60 flex items-center justify-between gap-3">
          {onPreviousStep && currentStep > 1 ? (
            <button
              type="button"
              onClick={onPreviousStep}
              className="px-3 py-2 rounded-xl border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onNextStep}
            className="px-4 py-2 bg-stone-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer ml-auto"
          >
            <span>
              {currentStep === 1
                ? "Next: Write Inside Note"
                : currentStep === 2
                ? "Next: Add Mailing Address"
                : currentStep === 3
                ? "Next: Review & Payment"
                : "Complete Order"}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
