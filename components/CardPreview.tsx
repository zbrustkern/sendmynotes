"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Eye, BookOpen, PenTool, Feather, ArrowRight, ArrowLeft, Maximize2, X } from "lucide-react";
import { FONT_OPTIONS, FontOption } from "@/lib/card-presets";

interface CardPreviewProps {
  coverUrl: string;
  printedGreeting: string;
  handwrittenNote: string;
  fontStyleId: string;
  occasion?: string;
  currentStep?: number;
  onNextStep?: () => void;
  onPreviousStep?: () => void;
}

/**
 * Canonical Inside Right Leaf component.
 * Uses CSS Container Queries (inline-size) with `cqw` units so that
 * font sizes, line wrapping, line heights, and margins scale in 100% exact
 * mathematical proportion across both single-page focus and panoramic spread views.
 */
function InsideRightLeaf({
  printedGreeting,
  handwrittenNote,
  currentFont,
  showSpineShadow = false,
}: {
  printedGreeting: string;
  handwrittenNote: string;
  currentFont: FontOption;
  showSpineShadow?: boolean;
}) {
  const fullMessage = printedGreeting?.trim()
    ? `${printedGreeting.trim()}\n\n${handwrittenNote.trim()}`
    : (handwrittenNote?.trim() || "Dear friend,\n\nSending you warmth and joy on this special day!");

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="relative w-full h-full bg-[#FDFCF7] paper-texture flex flex-col select-none overflow-hidden"
    >
      {/* Blind-Deboss Inset Micro-Rule (Traditional Letterpress Border, scaled in cqw) */}
      <div
        style={{
          position: "absolute",
          inset: "3.5cqw",
          borderRadius: "2.5cqw",
          border: "1px solid rgba(120, 113, 108, 0.22)",
          pointerEvents: "none",
        }}
      />

      {/* Realistic Left Spine Fold Shadow indicating the bound hinge */}
      {showSpineShadow && (
        <div className="absolute left-0 top-0 bottom-0 w-[4%] bg-gradient-to-r from-stone-400/30 via-stone-300/10 to-transparent pointer-events-none z-10" />
      )}

      {/* Physical Robotic Pen Inking Layout */}
      <div
        style={{
          paddingTop: printedGreeting?.trim() ? "14cqw" : "16cqw",
          paddingLeft: "8.5cqw",
          paddingRight: "8.5cqw",
          paddingBottom: "10cqw",
        }}
        className="relative z-10 w-full h-full flex flex-col justify-start"
      >
        <p
          style={{
            fontFamily: currentFont.fontFamily,
            fontSize: "4.5cqw",
            lineHeight: 1.55,
          }}
          className={`text-[#1B3B6F] whitespace-pre-line ${currentFont.fontClass}`}
        >
          {fullMessage}
        </p>
      </div>
    </div>
  );
}

export function CardPreview({
  coverUrl,
  printedGreeting,
  handwrittenNote,
  fontStyleId,
  occasion = "Custom Card",
  currentStep = 1,
  onNextStep,
  onPreviousStep,
}: CardPreviewProps) {
  const [viewMode, setViewMode] = useState<"cover" | "rightPage" | "spread" | "back">("cover");
  const [isSpreadModalOpen, setIsSpreadModalOpen] = useState(false);

  // Automatically focus on cover for Step 1, inside note for Step 2
  useEffect(() => {
    if (currentStep === 1) {
      setViewMode("cover");
    } else if (currentStep === 2) {
      setViewMode("rightPage");
    }
  }, [currentStep]);

  const currentFont =
    FONT_OPTIONS.find(
      (f) => f.handwryttenFontId === fontStyleId || f.id === fontStyleId
    ) || FONT_OPTIONS[0];

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

      {/* 1. FRONT COVER VIEW: Standard Portrait 5" x 7" Greeting Card (Pure Artwork Only) */}
      {viewMode === "cover" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[5/7] transition-all duration-300">
          <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-white flex flex-col group">
            <div className="relative w-full h-full">
              <Image
                src={coverUrl}
                alt="Card Cover Art"
                fill
                sizes="(max-width: 768px) 100vw, 400px"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                priority
                unoptimized
              />
              {/* Natural Left Spine Fold Shadow */}
              <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-gradient-to-r from-black/30 via-black/10 to-transparent pointer-events-none" />

              {/* Blind-Deboss Inset Micro-Rule (Letterpress Effect) */}
              <div className="absolute inset-2 sm:inset-2.5 border border-white/35 rounded-xl pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* 2. INSIDE NOTE (RIGHT PAGE FOCUS): Prominent Full 5×7 View with Left Spine Fold */}
      {viewMode === "rightPage" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[5/7] rounded-2xl overflow-hidden shadow-2xl border-4 border-white transition-all duration-300">
          <InsideRightLeaf
            printedGreeting={printedGreeting}
            handwrittenNote={handwrittenNote}
            currentFont={currentFont}
            showSpineShadow={true}
          />
        </div>
      )}

      {/* 3. FULL OPEN SPREAD: Panoramic 10×7 View Showing Both Leaves with 100% Proportional Fidelity */}
      {viewMode === "spread" && (
        <div className="relative w-full max-w-full lg:max-w-[560px] aspect-[10/7] rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FDFCF7] paper-texture flex transition-all duration-300 group">
          {/* LEFT PAGE: Inside Left Page (Pristine Unprinted Archival Cardstock) */}
          <div
            style={{ containerType: "inline-size" }}
            className="w-1/2 relative bg-[#FDFCF7] paper-texture border-r border-stone-200/70 select-none overflow-hidden"
          >
            {/* Blind-Deboss Inset Micro-Rule (Traditional Letterpress Border, scaled in cqw) */}
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

          {/* RIGHT PAGE: Uses the exact same InsideRightLeaf component */}
          <div className="w-1/2 relative">
            <InsideRightLeaf
              printedGreeting={printedGreeting}
              handwrittenNote={handwrittenNote}
              currentFont={currentFont}
              showSpineShadow={false}
            />
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
      )}

      {/* 4. CARD BACK VIEW: Aster & Blanche Press Colophon Only */}
      {viewMode === "back" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[5/7] transition-all duration-300">
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

      {/* Clean external indicator OUTSIDE the card confirming exact 1:1 print reproduction */}
      <div className="w-full max-w-[380px] mt-3 px-1 flex items-center justify-between text-xs text-stone-500">
        <span className="font-medium text-stone-700">
          {viewMode === "cover" && "Front Cover Art"}
          {viewMode === "rightPage" && "Inside Right Page (1:1 Detail)"}
          {viewMode === "spread" && "Open Card Spread (Both Leaves)"}
          {viewMode === "back" && "Card Back Colophon"}
        </span>
        <span className="text-[11px] text-stone-400">
          Exact physical print preview
        </span>
      </div>

      {/* FULL OPEN SPREAD ENLARGED INSPECTION MODAL */}
      {isSpreadModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setIsSpreadModalOpen(false)}
        >
          <div
            className="relative bg-white rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-stone-700" />
                  Full Open Card Spread (10&quot; × 7&quot; Open Panoramic)
                </h3>
                <p className="text-xs text-stone-500">
                  Exact 1:1 physical proportion of inside left page and handwritten inside right page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSpreadModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full aspect-[10/7] rounded-2xl overflow-hidden shadow-xl border-4 border-white bg-[#FDFCF7] paper-texture flex">
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
                <InsideRightLeaf
                  printedGreeting={printedGreeting}
                  handwrittenNote={handwrittenNote}
                  currentFont={currentFont}
                  showSpineShadow={false}
                />
              </div>
            </div>
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
