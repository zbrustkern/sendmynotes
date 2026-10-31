"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal, PenTool } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";
import { useUploadStudioAccess } from "@/lib/upload/useUploadStudioAccess";

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
  const [showSignIn, setShowSignIn] = useState(false);
  const [accountError, setAccountError] = useState("");
  const { user, signOut, loading: authLoading } = useAuth();
  const { state: studioAccess, refresh: refreshStudioAccess } = useUploadStudioAccess(user, authLoading);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (menuOpen) {
      void refreshStudioAccess();
      const firstItem = optionsRef.current?.parentElement?.querySelector<HTMLElement>("[role='menuitem']");
      firstItem?.focus();
    }
  }, [menuOpen, refreshStudioAccess]);

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
      else {
        const firstItem = optionsRef.current?.parentElement?.querySelector<HTMLElement>("[role='menuitem']");
        firstItem?.focus();
      }
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = Array.from(event.currentTarget.closest("[role='menu']")?.querySelectorAll<HTMLElement>("[role='menuitem']") || []);
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
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
            <div className="relative">
                <button
                  ref={optionsRef}
                  type="button"
                  aria-label="Account and card options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  onKeyDown={handleOptionsKeyDown}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div role="menu" aria-label="Account and card options" className="absolute right-0 top-12 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
                    {accountError && <p role="alert" className="px-3 py-2 text-xs text-rose-800">{accountError}</p>}
                    {authLoading ? <p role="status" className="px-3 py-2 text-sm text-stone-500">Checking account…</p> : user ? (
                      <>
                        {user.email && <div className="overflow-hidden px-3 py-2 text-xs text-stone-500" title={user.email}><span className="sr-only">Signed in as </span><span className="block truncate">{user.email}</span></div>}
                        <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)} onKeyDown={handleMenuKeyDown} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-stone-800 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600">
                          My account
                        </Link>
                        {studioAccess === "checking" || studioAccess === "resolving" ? <div role="status" className="px-3 py-2 text-sm text-stone-500">Checking studio access…</div> : null}
                        {studioAccess === "active" && <Link href="/create/upload" role="menuitem" onClick={() => setMenuOpen(false)} onKeyDown={handleMenuKeyDown} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-stone-800 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600">Upload studio</Link>}
                        {studioAccess === "error" && <div className="flex items-center justify-between gap-2 px-3 py-2"><span role="status" className="text-xs text-stone-600">Studio access unavailable</span><button type="button" role="menuitem" onKeyDown={handleMenuKeyDown} onClick={() => void refreshStudioAccess()} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50">Retry</button></div>}
                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void signOut().then(() => setAccountError("")).catch((error: unknown) => { setAccountError(error instanceof Error ? error.message : "Could not complete sign out. Your current account is still shown."); setMenuOpen(true); }); }} onKeyDown={handleMenuKeyDown} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-stone-600 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600">Sign out</button>
                      </>
                    ) : (
                      <>
                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setShowSignIn(true); }} onKeyDown={handleMenuKeyDown} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-stone-800 hover:bg-stone-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600">Sign in</button>
                      </>
                    )}
                    {showClearDraft && onClearDraft && <>
                      <div role="separator" className="my-1 border-t border-stone-100" />
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
                    </>}
                  </div>
                )}
            </div>
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
      <AuthModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} title="Sign in to SendMyNotes" />
    </>
  );
}
