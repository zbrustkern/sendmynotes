"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, PenTool } from "lucide-react";

interface FlowHeaderProps {
  showClearDraft?: boolean;
  onClearDraft?: () => void;
  /** Server-quoted payable total. Omit it while no current quote is available. */
  orderTotalCents?: number;
  /** Prevent discarding while an order is being submitted or reconciled. */
  resetDisabled?: boolean;
}

export function FlowHeader({
  showClearDraft = false,
  onClearDraft,
  orderTotalCents,
  resetDisabled = false,
}: FlowHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (menuOpen) menuItemRef.current?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (showConfirm) cancelRef.current?.focus();
  }, [showConfirm]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !optionsRef.current?.parentElement?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        optionsRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (resetDisabled) {
      setMenuOpen(false);
      setShowConfirm(false);
    }
  }, [resetDisabled]);

  const closeDialog = () => {
    setShowConfirm(false);
    optionsRef.current?.focus();
  };

  const keepFocusInDialog = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])"),
    );
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirmReset = () => {
    if (resetDisabled) return;
    setShowConfirm(false);
    onClearDraft?.();
  };

  const handleOptionsKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!menuOpen) setMenuOpen(true);
      else menuItemRef.current?.focus();
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") setMenuOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // The menu currently has one action; keep focus on that action.
      menuItemRef.current?.focus();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full border-b border-stone-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 lg:max-w-7xl lg:px-8">
          <Link
            href="/"
            className="group -ml-1.5 flex min-w-0 shrink items-center gap-2 rounded-md px-1.5 py-1 text-stone-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
            aria-label="SendMyNotes Home"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-xs">
              <PenTool className="h-4 w-4 text-emerald-50" aria-hidden="true" />
            </span>
            <span className="whitespace-nowrap font-serif text-base font-bold tracking-tight text-stone-900 sm:text-lg">
              SendMyNotes
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {orderTotalCents !== undefined && (
              <span className="whitespace-nowrap rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700 sm:px-3 sm:text-xs">
                ${((orderTotalCents || 0) / 100).toFixed(2)} total
              </span>
            )}
            {showClearDraft && onClearDraft && (
              <div className="relative">
                <button
                  ref={optionsRef}
                  type="button"
                  disabled={resetDisabled}
                  aria-label="Card options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  onKeyDown={handleOptionsKeyDown}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div role="menu" aria-label="Card options" className="absolute right-0 top-12 z-40 min-w-48 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
                    <button
                      ref={menuItemRef}
                      type="button"
                      role="menuitem"
                      disabled={resetDisabled}
                      onClick={() => { setMenuOpen(false); setShowConfirm(true); }}
                      onKeyDown={handleMenuKeyDown}
                      className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-rose-800 hover:bg-rose-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Start a new card
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            aria-describedby="reset-description"
            className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
            onKeyDown={keepFocusInDialog}
          >
            <h2 id="reset-title" className="font-serif text-lg font-bold text-stone-900">Start a new card?</h2>
            <p id="reset-description" className="text-sm leading-relaxed text-stone-600">
              This will discard your chosen cover, message, and address details.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button ref={cancelRef} type="button" onClick={closeDialog} className="min-h-11 rounded-xl px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600">
                Keep editing
              </button>
              <button type="button" disabled={resetDisabled} onClick={confirmReset} className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                Discard &amp; start new
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
