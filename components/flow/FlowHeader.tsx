"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PenTool, AlertTriangle } from "lucide-react";

interface FlowHeaderProps {
  showClearDraft?: boolean;
  onClearDraft?: () => void;
  orderTotalCents?: number;
}

export function FlowHeader({ showClearDraft = false, onClearDraft, orderTotalCents }: FlowHeaderProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleStartOverClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmReset = () => {
    setShowConfirm(false);
    if (onClearDraft) {
      onClearDraft();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-6xl lg:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 text-stone-900 group focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md py-1 px-1.5 -ml-1.5"
            aria-label="SendMyNotes Home"
          >
            <span className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <PenTool className="w-4 h-4 text-emerald-50" aria-hidden="true" />
            </span>
            <span className="font-serif font-bold text-lg tracking-tight text-stone-900">
              SendMyNotes
            </span>
          </Link>

          {/* Action or reassurance pill */}
          <div className="flex items-center gap-3">
            {showClearDraft && onClearDraft && (
              <button
                type="button"
                onClick={handleStartOverClick}
                className="text-xs text-stone-600 hover:text-stone-900 underline underline-offset-2 min-h-[44px] flex items-center px-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md cursor-pointer"
              >
                Start over
              </button>
            )}
            <span className="hidden md:inline-flex items-center text-xs font-medium text-stone-700 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
              {orderTotalCents !== undefined ? `$${(orderTotalCents / 100).toFixed(2)} Total • International mailing` : "$9.00 All-In • Written in Real Ballpoint Ink • Free First-Class Stamp Included"}
            </span>
            <span className="inline-flex md:hidden items-center text-[11px] font-medium text-stone-700 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
              {orderTotalCents !== undefined ? `$${(orderTotalCents / 100).toFixed(2)} Total • International` : "$9.00 All-In • Real Ink • Stamp Included"}
            </span>
          </div>
        </div>
      </header>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center gap-2.5 text-stone-900">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <h3 className="font-serif font-bold text-base text-stone-900">
                Start over?
              </h3>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              This will clear your chosen card, written message, and entered addresses.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 transition cursor-pointer"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition cursor-pointer"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
