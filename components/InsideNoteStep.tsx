"use client";

import React from "react";
import { PenTool, Type, Sparkles, Check } from "lucide-react";
import { FONT_OPTIONS } from "@/lib/card-presets";

interface InsideNoteStepProps {
  printedGreeting: string;
  onChangePrintedGreeting: (text: string) => void;
  handwrittenNote: string;
  onChangeHandwrittenNote: (text: string) => void;
  fontStyleId: string;
  onChangeFontStyleId: (id: string) => void;
}

export function InsideNoteStep({
  printedGreeting,
  onChangePrintedGreeting,
  handwrittenNote,
  onChangeHandwrittenNote,
  fontStyleId,
  onChangeFontStyleId,
}: InsideNoteStepProps) {
  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            2
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            Inside Note (Dual-Panel)
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          The top panel is printed in a clean commercial serif. The bottom panel is written with a real robotic ballpoint pen in real blue ink.
        </p>
      </div>

      {/* Top Panel: Printed Greeting */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-stone-500" />
            Top Panel: Printed Greeting (Commercial Press)
          </label>
          <span className="text-[11px] text-stone-400">Centered Serif font</span>
        </div>

        <input
          type="text"
          value={printedGreeting}
          onChange={(e) => onChangePrintedGreeting(e.target.value)}
          placeholder="e.g. Wishing you the happiest of birthdays!"
          maxLength={120}
          className="w-full px-3.5 py-2.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-serif italic text-stone-800 transition"
        />

        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span>Appears on inside upper fold</span>
          <span>{printedGreeting.length}/120 characters</span>
        </div>
      </div>

      {/* Font Style Picker for Real-Pen Robot */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <PenTool className="w-3.5 h-3.5 text-indigo-600" />
            Robotic Pen Handwriting Style
          </label>
          <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full">
            Real Pen-on-Paper
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {FONT_OPTIONS.map((font) => {
            const isSelected = fontStyleId === font.handwryttenFontId;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => onChangeFontStyleId(font.handwryttenFontId)}
                className={`p-3 text-left rounded-xl border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-500/20"
                    : "border-stone-200 hover:border-stone-300 bg-stone-50/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-800">{font.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 stroke-[3]" />}
                  </div>
                  <p className={`text-base text-[#1B3B6F] my-1 ${font.fontClass}`}>
                    Warmest wishes
                  </p>
                </div>
                <p className="text-[10px] text-stone-500 leading-tight mt-1">{font.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Panel: Handwritten Message Text Area */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Bottom Panel: Personal Note (Robotic Inking)
          </label>
          <span className="text-[11px] text-stone-400">Up to 500 characters</span>
        </div>

        <textarea
          rows={5}
          value={handwrittenNote}
          onChange={(e) => onChangeHandwrittenNote(e.target.value)}
          placeholder="Dear Friend,&#10;&#10;So excited to celebrate your special moment! Thinking of you..."
          maxLength={500}
          className="w-full p-3.5 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-stone-900 transition leading-relaxed"
        />

        <div className="flex items-center justify-between text-[11px] text-stone-400">
          <span className="text-indigo-600 font-medium">Physically inked by robotic plotter</span>
          <span>{handwrittenNote.length}/500 characters</span>
        </div>
      </div>
    </div>
  );
}
