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
  const [viewMode, setViewMode] = useState<"cover" | "inside">("cover");

  const currentFont =
    FONT_OPTIONS.find((f) => f.handwryttenFontId === fontStyleId) || FONT_OPTIONS[0];

  return (
    <div className="flex flex-col items-center w-full">
      {/* View Switcher Controls */}
      <div className="flex items-center gap-1.5 mb-4 bg-stone-100 p-1 rounded-full border border-stone-200 shadow-sm">
        <button
          type="button"
          onClick={() => setViewMode("cover")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
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
          onClick={() => setViewMode("inside")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            viewMode === "inside"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
          Inside Open Card (10×7 Spread)
        </button>
      </div>

      {/* Card Display Area */}
      {viewMode === "cover" ? (
        /* 1. FRONT COVER VIEW: Standard Portrait 5" x 7" Greeting Card */
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
              <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/30 via-black/10 to-transparent pointer-events-none" />

              {/* Occasion Badge */}
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase text-stone-700 shadow-sm border border-stone-200/50 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                {occasion}
              </div>

              {/* Physical Card Stock Badge */}
              <div className="absolute bottom-3 left-3 bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-medium text-white/90 tracking-wide">
                5&quot; × 7&quot; Heavy Linen Cardstock
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 2. INSIDE VIEW: Authentic Open 2-Page Greeting Card Spread (10" wide x 7" tall) */
        <div className="relative w-full max-w-full lg:max-w-[560px] aspect-[10/7] rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FDFCF7] paper-texture flex transition-all duration-300">
          {/* LEFT PAGE: Inside Left Page (Traditional Minimalist Stationery Leaf) */}
          <div className="w-1/2 p-4 sm:p-6 flex flex-col justify-between relative border-r border-stone-200/70 bg-[#FAF9F4]/40">
            <div className="text-[9px] uppercase tracking-widest text-stone-400 font-semibold flex items-center gap-1">
              <span>Left Page</span>
              <span className="text-stone-300">•</span>
              <span>Inside Cover</span>
            </div>

            {/* Subtle embossed stationery watermark in center of left leaf */}
            <div className="my-auto text-center opacity-40 select-none">
              <div className="w-8 h-8 mx-auto mb-1.5 rounded-full border border-stone-300 flex items-center justify-center text-stone-400">
                <Feather className="w-3.5 h-3.5" />
              </div>
              <span className="font-serif text-xs italic tracking-wider text-stone-500 block">
                sendmynotes
              </span>
              <span className="text-[8px] uppercase tracking-widest text-stone-400">
                Fine Heavy Linen
              </span>
            </div>

            <div className="text-[9px] text-stone-400 text-center italic">
              Blank cardstock leaf
            </div>
          </div>

          {/* CENTER BOOK SPINE FOLD: Realistic vertical crease */}
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-4 pointer-events-none z-10 flex items-center justify-center">
            <div className="w-[1.5px] h-full bg-stone-300/80 shadow-[0_0_8px_rgba(0,0,0,0.15)]" />
          </div>

          {/* RIGHT PAGE: Traditional Greeting Destination (Printed Header at Top + Robot Pen Note Below) */}
          <div className="w-1/2 p-3 sm:p-5 flex flex-col justify-between relative bg-white/70">
            {/* TOP OF RIGHT PAGE: Printed Sentiment */}
            <div className="pb-2.5 border-b border-dashed border-stone-200 text-center">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-widest text-stone-400 mb-1">
                <span>Printed Press</span>
                <span className="text-stone-300">•</span>
                <span>Right Page Top</span>
              </div>
              <p className="font-serif text-xs sm:text-sm md:text-base text-stone-800 leading-snug tracking-tight font-medium italic">
                {printedGreeting || "Wishing you a wonderful celebration."}
              </p>
            </div>

            {/* LOWER OF RIGHT PAGE: Robotic Pen Handwritten Note */}
            <div className="flex-1 flex flex-col justify-center py-2 px-1">
              <div className="text-[8px] uppercase tracking-widest text-indigo-600 font-semibold mb-1 flex items-center gap-1">
                <PenTool className="w-2.5 h-2.5" />
                <span>Robotic Pen Inking</span>
              </div>
              <p
                className={`text-[#1B3B6F] text-xs sm:text-sm md:text-base leading-relaxed whitespace-pre-line ${currentFont.fontClass}`}
              >
                {handwrittenNote || "Dear friend,\nSending you warmth and joy on this special day!"}
              </p>
            </div>

            {/* Handwriting status chip */}
            <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[9px] text-stone-400">
              <span className="italic flex items-center gap-1 text-emerald-600 font-medium">
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
            ? "5×7 portrait front cover. Click 'Inside Open Card' to see the open two-page spread."
            : "Traditional greeting card layout: printed sentiment at the top of the right page, followed by robotic pen inking."}
        </span>
      </p>
    </div>
  );
}
