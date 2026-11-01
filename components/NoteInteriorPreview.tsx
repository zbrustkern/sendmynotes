"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { resolveHandwritingStyle } from "@/lib/note-preview";

type Props = {
  message: string;
  fontStyleId?: string | number | null;
  emptyPlaceholder?: string;
  className?: string;
  showSpineShadow?: boolean;
  showMetadata?: boolean;
  showFullText?: boolean;
  onOverflowChange?: (overflow: boolean) => void;
  onFontStateChange?: (state: string) => void;
};

/** A measured, intentionally approximate A2 right-leaf rendering. */
export function NoteInteriorPreview({
  message,
  fontStyleId,
  emptyPlaceholder = "Your note will appear here.",
  className = "",
  showSpineShadow = false,
  showMetadata = true,
  showFullText = true,
  onOverflowChange,
  onFontStateChange,
}: Props) {
  const resolved = useMemo(() => resolveHandwritingStyle(fontStyleId), [fontStyleId]);
  const leafRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [fontState, setFontState] = useState<"loading" | "ready" | "fallback" | "unavailable">(resolved.available ? "loading" : "unavailable");
  const [overflow, setOverflow] = useState(false);
  const [fontSize, setFontSize] = useState(22);
  const [displayScale, setDisplayScale] = useState(1);

  useEffect(() => {
    let canceled = false;
    if (!resolved.available) {
      setFontState("unavailable");
      return () => { canceled = true; };
    }
    setFontState("loading");
    const loadFont = async () => {
      const probe = document.createElement("span");
      probe.style.fontFamily = resolved.fontFamily;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      document.body.appendChild(probe);
      const actualFamily = getComputedStyle(probe).fontFamily;
      try {
        if (!document.fonts) throw new Error("Font loading API unavailable");
        const faces = await document.fonts.load(`22px ${actualFamily}`);
        await document.fonts.ready;
        if (!canceled) setFontState(faces.length > 0 ? "ready" : "fallback");
      } catch {
        if (!canceled) setFontState("fallback");
      } finally {
        probe.remove();
      }
    };
    void loadFont();
    return () => { canceled = true; };
  }, [resolved]);

  useLayoutEffect(() => {
    const leaf = leafRef.current;
    const text = textRef.current;
    if (!leaf || !text) return;
    let canceled = false;
    const measure = () => {
      if (canceled || !leaf.clientWidth || !leaf.clientHeight) return;
      // Fit once in reference coordinates; viewport scaling never changes wrapping.
      // Keeping scrollbars out of this frame also avoids losing a different
      // fraction of the writing width on narrow screens.
      setDisplayScale(leaf.clientWidth / 425);
      const floor = 16;
      const start = 22;
      let size = start;
      text.style.fontSize = `${size}px`;
      while (size > floor && (text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1)) {
        size = Math.max(floor, size - 0.5);
        text.style.fontSize = `${size}px`;
      }
      setFontSize(size);
      setOverflow(text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1);
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(leaf);
    observer?.observe(text);
    measure();
    window.addEventListener("resize", measure);
    return () => { canceled = true; observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [message, resolved, emptyPlaceholder, fontState]);

  const visibleFontState = resolved.available ? fontState : "unavailable";
  const fallbackStyle = visibleFontState === "fallback" || !resolved.available;
  const displayedMessage = message || emptyPlaceholder;
  useEffect(() => { onOverflowChange?.(overflow); }, [onOverflowChange, overflow]);
  useEffect(() => { onFontStateChange?.(visibleFontState); }, [onFontStateChange, visibleFontState]);
  return (
    <div
      data-note-interior-preview
      data-font-id={resolved.id}
      data-reference-width="425"
      data-font-available={resolved.available ? "true" : "false"}
      data-font-state={visibleFontState}
      data-overflow={overflow ? "true" : "false"}
      data-preview-empty={message ? "false" : "true"}
      className={`flex min-w-0 flex-col ${className}`}
    >
      <div
        ref={leafRef}
        data-note-preview-leaf
        className="relative aspect-[17/22] w-full shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-[#FDFCF7] paper-texture"
      >
        <div data-note-reference-layout style={{ position: "absolute", left: 0, top: 0, width: 425, height: 550, transform: `scale(${displayScale})`, transformOrigin: "top left" }}>
        {showSpineShadow && <div aria-hidden="true" className="absolute inset-y-0 left-0 z-10 w-[4%] bg-gradient-to-r from-stone-400/25 via-stone-300/10 to-transparent" />}
        <div className="pointer-events-none absolute inset-[3.5%] rounded-[2.5%] border border-stone-300/35" />
        <div
          ref={textRef}
          data-note-preview-text
          role="region"
          aria-label="Complete note preview text"
          tabIndex={0}
          className={`absolute left-[9.5%] right-[9.5%] top-[15%] bottom-[12%] overflow-hidden whitespace-pre-wrap break-words text-[#1B3B6F] ${message ? "" : "italic opacity-60"}`}
          style={{ fontFamily: fallbackStyle ? "system-ui, sans-serif" : resolved.fontFamily, fontSize, lineHeight: 1.55 }}
        >
          {displayedMessage}
        </div>
        </div>
      </div>
      {showMetadata && <div data-note-preview-meta className="flex min-h-6 flex-col items-start gap-1 px-1 pt-2 text-xs text-stone-500">
        <span>Approximate preview. Handwriting spacing and line breaks may vary.</span>
        <span className="font-medium text-stone-600">{!resolved.available ? "Handwriting style unavailable" : `${resolved.label}${visibleFontState === "loading" ? " · loading font" : visibleFontState === "fallback" ? " · readable fallback" : ""}`}</span>
      </div>}
      {showFullText && <NotePreviewFullText message={message} overflow={overflow} styleId={resolved.id} fontState={visibleFontState} />}
    </div>
  );
}


export function NotePreviewFullText({
  message,
  overflow,
  styleId,
  fontState,
  includeMetadata = false,
}: {
  message: string;
  overflow: boolean;
  styleId?: string;
  fontState?: string;
  includeMetadata?: boolean;
}) {
  const style = resolveHandwritingStyle(styleId);
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-1 pt-1 text-xs text-amber-900">
      {includeMetadata && <div data-note-preview-meta className="flex min-h-6 w-full flex-col items-start gap-1 text-xs text-stone-500">
        <span>Approximate preview. Handwriting spacing and line breaks may vary.</span>
        <span className="font-medium text-stone-600">{!style.available ? "Handwriting style unavailable" : style.label}{fontState === "fallback" ? " · readable fallback" : fontState === "loading" ? " · loading font" : ""}</span>
      </div>}
      {overflow && <p role="status" className="font-medium">Some text extends beyond this visual approximation.</p>}
      <details className="min-w-0 flex-1 basis-full rounded-md border border-amber-200 bg-amber-50 p-2 sm:basis-auto">
        <summary className="cursor-pointer font-semibold">Read complete note</summary>
        <div role="region" aria-label="Complete note text" tabIndex={0} className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-left font-sans text-base leading-relaxed text-stone-900">
          {message || "No note text was saved."}
        </div>
      </details>
    </div>
  );
}
