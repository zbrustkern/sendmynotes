"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Sparkles, Eye, RotateCw, PenTool, CheckCircle2 } from "lucide-react";
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
  const [activeSide, setActiveSide] = useState<"front" | "inside">("front");

  const currentFont =
    FONT_OPTIONS.find((f) => f.handwryttenFontId === fontStyleId) || FONT_OPTIONS[0];

  return (
    <div className="flex flex-col items-center w-full">
      {/* View Switcher Controls */}
      <div className="flex items-center gap-2 mb-4 bg-stone-100 p-1 rounded-full border border-stone-200 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveSide("front")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            activeSide === "front"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Front Cover (5×7)
        </button>
        <button
          type="button"
          onClick={() => setActiveSide("inside")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all ${
            activeSide === "inside"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" />
          Inside Note (Dual-Panel)
        </button>
      </div>

      {/* Card Canvas Container */}
      <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-[5/7] transition-all duration-300">
        {activeSide === "front" ? (
          /* FRONT COVER VIEW */
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
              {/* Subtle card fold highlight line on left spine */}
              <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/25 via-black/10 to-transparent pointer-events-none" />

              {/* Physical card tag */}
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase text-stone-700 shadow-sm border border-stone-200/50 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                {occasion}
              </div>

              {/* Physical card stock watermark badge */}
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-medium text-white/90 tracking-wide">
                5&quot; × 7&quot; Folded Linen Card
              </div>
            </div>
          </div>
        ) : (
          /* INSIDE OPEN CARD VIEW (Dual Panel) */
          <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-[#FDFCF7] flex flex-col paper-texture">
            {/* Left spine fold shadow */}
            <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/20 via-black/5 to-transparent z-10 pointer-events-none" />

            {/* TOP PANEL: Printed Greeting (Commercial Serif) */}
            <div className="h-1/2 p-6 flex flex-col items-center justify-center text-center relative border-b border-dashed border-stone-300/80 bg-[#FFFDF9]/60">
              <div className="absolute top-2.5 left-4 text-[9px] uppercase tracking-widest text-stone-400 font-semibold flex items-center gap-1">
                <span>Top Panel</span>
                <span className="text-stone-300">•</span>
                <span>Commercial Print</span>
              </div>

              <div className="max-w-[85%]">
                <p className="font-serif text-lg sm:text-xl text-stone-800 leading-snug tracking-tight font-medium italic">
                  {printedGreeting || "Wishing you a wonderful celebration."}
                </p>
              </div>
            </div>

            {/* MIDDLE CREASE DIVIDER */}
            <div className="h-[2px] bg-gradient-to-r from-stone-200 via-stone-400/40 to-stone-200 w-full relative">
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 bg-stone-100 text-stone-400 text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-stone-200">
                Fold Crease
              </div>
            </div>

            {/* BOTTOM PANEL: Handwritten Robotic Pen Message */}
            <div className="h-1/2 p-6 flex flex-col justify-between relative bg-white/70">
              <div className="absolute top-2.5 left-4 text-[9px] uppercase tracking-widest text-indigo-500 font-semibold flex items-center gap-1">
                <PenTool className="w-2.5 h-2.5" />
                <span>Bottom Panel</span>
                <span className="text-stone-300">•</span>
                <span>Robotic Pen Inking</span>
              </div>

              <div className="pt-4 flex-1 flex flex-col justify-center">
                <p
                  className={`text-stone-900 leading-relaxed text-base sm:text-lg whitespace-pre-line text-[#1B3B6F] ${currentFont.fontClass}`}
                >
                  {handwrittenNote || "Dear friend,\nSending you warmth and joy on this special day!"}
                </p>
              </div>

              {/* Pen Style indicator */}
              <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[10px] text-stone-400">
                <span className="italic flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 inline" /> Real Blue Ink
                </span>
                <span className="font-mono text-[9px] bg-stone-100 px-1.5 py-0.5 rounded">
                  Font: {currentFont.name}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-stone-400 mt-3 flex items-center gap-1.5">
        <span>Click the buttons above to preview the front cover vs. inside handwritten note</span>
      </p>
    </div>
  );
}
