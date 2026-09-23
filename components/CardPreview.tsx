"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, Eye, BookOpen, PenTool, CheckCircle2, Feather } from "lucide-react";
import { FONT_OPTIONS } from "@/lib/card-presets";

interface CardPreviewProps {
  coverUrl: string;
  printedGreeting: string;
  handwrittenNote: string;
  fontStyleId: string;
  occasion?: string;
}

export function CardPreview({
  coverUrl,
  printedGreeting,
  handwrittenNote,
  fontStyleId,
  occasion = "Custom Card",
}: CardPreviewProps) {
  const [viewMode, setViewMode] = useState<"cover" | "rightPage" | "spread">("cover");

  const currentFont =
    FONT_OPTIONS.find((f) => f.handwryttenFontId === fontStyleId) || FONT_OPTIONS[0];

  return (
    <div className="flex flex-col items-center w-full">
      {/* View Switcher Controls */}
      <div className="flex items-center gap-1 mb-4 bg-stone-100 p-1 rounded-full border border-stone-200 shadow-sm max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setViewMode("cover")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            viewMode === "cover"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Front Cover (5×7)
        </button>
        <button
          type="button"
          onClick={() => setViewMode("rightPage")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            viewMode === "rightPage"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <PenTool className="w-3.5 h-3.5 text-indigo-600" />
          Inside Note (Focus)
        </button>
        <button
          type="button"
          onClick={() => setViewMode("spread")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
            viewMode === "spread"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-stone-600" />
          Full Spread (10×7)
        </button>
      </div>

      {/* 1. FRONT COVER VIEW: Standard Portrait 5" x 7" Greeting Card */}
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
              />
              {/* Natural Left Spine Fold Shadow */}
              <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-gradient-to-r from-black/35 via-black/10 to-transparent pointer-events-none" />

              {/* Occasion Badge */}
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase text-stone-700 shadow-sm border border-stone-200/50 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                {occasion}
              </div>

              {/* Physical Card Stock Badge */}
              <div className="absolute bottom-3 left-3 bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-medium text-white/90 tracking-wide">
                5&quot; × 7&quot; Heavy Cardstock
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. INSIDE NOTE (RIGHT PAGE FOCUS): Prominent Full 5×7 View with Left Spine Fold */}
      {viewMode === "rightPage" && (
        <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[5/7] transition-all duration-300">
          <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FDFCF7] paper-texture flex flex-col justify-between p-5 sm:p-6">
            {/* Realistic Left Spine Fold Shadow indicating this is the Right Leaf */}
            <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-stone-400/40 via-stone-300/15 to-transparent pointer-events-none" />

            {/* TOP: Printed Sentiment Header */}
            <div className="pt-2 pb-4 border-b border-dashed border-stone-200 text-center relative z-10 pl-2">
              <div className="text-[9px] uppercase tracking-widest text-stone-400 mb-1.5 font-semibold">
                Printed Sentiment • Top of Inside Leaf
              </div>
              <p className="font-serif text-sm sm:text-base md:text-lg text-stone-900 leading-snug tracking-tight font-medium italic">
                {printedGreeting || "Wishing you a wonderful celebration."}
              </p>
            </div>

            {/* LOWER: Real Pen Handwritten Note */}
            <div className="flex-1 flex flex-col justify-center py-4 pl-3 pr-1 relative z-10">
              <div className="text-[9px] uppercase tracking-widest text-indigo-700 font-semibold mb-2 flex items-center gap-1">
                <PenTool className="w-3 h-3 text-indigo-600" />
                <span>Real Ink Handwriting</span>
              </div>
              <p
                className={`text-[#1B3B6F] text-sm sm:text-base leading-relaxed whitespace-pre-line ${currentFont.fontClass}`}
              >
                {handwrittenNote || "Dear friend,\nSending you warmth and joy on this special day!"}
              </p>
            </div>

            {/* Bottom Status Chip */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-200 text-[10px] text-stone-500 pl-2">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Real Blue Ballpoint Ink
              </span>
              <span className="font-mono text-[9px] bg-stone-100 px-2 py-0.5 rounded text-stone-700 font-medium">
                {currentFont.name}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. FULL OPEN SPREAD: Panoramic 10×7 View Showing Both Leaves */}
      {viewMode === "spread" && (
        <div className="relative w-full max-w-full lg:max-w-[560px] aspect-[10/7] rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FDFCF7] paper-texture flex transition-all duration-300">
          {/* LEFT PAGE: Inside Left Page (Clean Minimalist Stationery Watermark) */}
          <div className="w-1/2 p-4 sm:p-6 flex flex-col justify-center items-center relative border-r border-stone-200/70 bg-[#FAF9F4]/40 select-none">
            {/* Subtle embossed stationery watermark logo */}
            <div className="text-center opacity-30 select-none">
              <div className="w-8 h-8 mx-auto mb-2 rounded-full border border-stone-400 flex items-center justify-center text-stone-500">
                <Feather className="w-4 h-4" />
              </div>
              <span className="font-serif text-xs italic tracking-wider text-stone-600 block">
                sendmynotes
              </span>
            </div>
          </div>

          {/* CENTER BOOK SPINE FOLD: Realistic vertical crease */}
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-4 pointer-events-none z-10 flex items-center justify-center">
            <div className="w-[1.5px] h-full bg-stone-300/80 shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
          </div>

          {/* RIGHT PAGE: Printed Header at Top + Real Ink Note Below */}
          <div className="w-1/2 p-3 sm:p-5 flex flex-col justify-between relative bg-white/70">
            {/* TOP OF RIGHT PAGE: Printed Sentiment */}
            <div className="pb-2 border-b border-dashed border-stone-200 text-center">
              <p className="font-serif text-xs sm:text-sm text-stone-800 leading-snug tracking-tight font-medium italic">
                {printedGreeting || "Wishing you a wonderful celebration."}
              </p>
            </div>

            {/* LOWER OF RIGHT PAGE: Real Ink Handwritten Note */}
            <div className="flex-1 flex flex-col justify-center py-2 px-1">
              <p
                className={`text-[#1B3B6F] text-xs sm:text-sm leading-relaxed whitespace-pre-line ${currentFont.fontClass}`}
              >
                {handwrittenNote || "Dear friend,\nSending you warmth and joy on this special day!"}
              </p>
            </div>

            {/* Handwriting status chip */}
            <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[8px] text-stone-400">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 className="w-2.5 h-2.5 inline" /> Real Blue Ink
              </span>
              <span className="font-mono text-[8px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-600">
                {currentFont.name}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Caption description */}
      <p className="text-center text-xs text-stone-500 mt-3 flex items-center gap-1.5">
        <span>
          {viewMode === "cover"
            ? "5×7 portrait front cover artwork."
            : viewMode === "rightPage"
            ? "Inside right leaf with printed sentiment above and real ink handwriting below."
            : "Panoramic 10×7 open card spread."}
        </span>
      </p>
    </div>
  );
}
