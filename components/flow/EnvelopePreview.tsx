"use client";

import React from "react";

export interface AddressDraftLike {
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface EnvelopePreviewProps {
  sender: AddressDraftLike;
  recipient: AddressDraftLike;
  fontClass?: string;
  isAddressDeferred?: boolean;
  isInternational?: boolean;
  countryName?: string;
  className?: string;
}

export function isNonUS(country?: string): boolean {
  if (!country?.trim()) return false;
  const upper = country.trim().toUpperCase();
  return !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(upper);
}

export function EnvelopePreview({
  sender,
  recipient,
  fontClass = "font-hwDavid",
  isAddressDeferred = false,
  isInternational = false,
  countryName,
  className = "",
}: EnvelopePreviewProps) {
  const isInternationalDest = isInternational || isNonUS(recipient.country);
  const displayCountry =
    countryName ||
    (recipient.country && isNonUS(recipient.country) ? recipient.country : "");

  return (
    <div className={`w-full ${className}`}>
      {/* Physical Envelope Surface (Optical ratio ~1.4:1 on desktop, min-h-[210px] on mobile) */}
      <div className="relative w-full rounded-[4px] bg-[#FAF9F6] border border-stone-200/90 shadow-sm p-4 sm:p-5 flex flex-col justify-between min-h-[210px] sm:aspect-[1.4/1] text-stone-900 select-none overflow-hidden">
        {/* Top Row: Sender Address (Top-Left) + Stamp Box (Top-Right) */}
        <div className="flex items-start justify-between gap-3 mb-2">
          {/* Top-Left: SENDER RETURN ADDRESS IN ROYAL BLUE PEN INK */}
          <div
            className={`max-w-[180px] sm:max-w-[210px] text-[#1E3A8A] text-xs sm:text-[13px] leading-tight select-none ${fontClass}`}
          >
            <p className="font-medium">{sender.fullName || "Your Name"}</p>
            <p>{sender.street1 || "Street Address"}</p>
            {sender.street2 && <p>{sender.street2}</p>}
            <p>
              {sender.city || "City"}, {sender.state || "ST"}{" "}
              {sender.zip || "ZIP"}
            </p>
          </div>

          {/* Top-Right: RESERVED STAMP COLUMN */}
          <div className="shrink-0 select-none pl-2">
            <div className="relative w-12 h-14 bg-white rounded-[2px] border border-dashed border-stone-300 shadow-2xs p-1 flex flex-col justify-between overflow-hidden">
              {isInternationalDest ? (
                <div className="h-full w-full bg-stone-50 border border-stone-200 rounded-[2px] p-0.5 flex flex-col items-center justify-center text-center">
                  <span className="text-[6px] font-bold text-stone-500 uppercase tracking-wider block">
                    Postage
                  </span>
                  <span className="text-[7.5px] font-black text-emerald-900 leading-tight block">
                    International
                    <br />
                    Postage
                  </span>
                  <span className="text-[5.5px] font-mono text-stone-400 mt-0.5 block">
                    AIRMAIL
                  </span>
                </div>
              ) : (
                <div className="h-full w-full bg-gradient-to-b from-[#1e3a8a] via-[#f8fafc] to-[#991b1b] rounded-[2px] p-1 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between text-white text-[7px] font-sans font-bold leading-none tracking-widest">
                    <span>USA</span>
                    <span className="text-[6px]">★</span>
                  </div>
                  <div className="text-center py-0.5">
                    <span className="text-[8px] font-serif font-black tracking-wider text-white drop-shadow-xs">
                      FOREVER
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-white/90 text-[6px] font-mono leading-none">
                    <span>USPS</span>
                    <span>2026</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center / Center-Right: RECIPIENT MAILING BLOCK */}
        <div className="flex justify-end sm:justify-center sm:pl-16 px-2 py-3 select-none my-auto">
          <div
            className={`w-fit min-w-[180px] max-w-xs text-left space-y-0.5 text-base sm:text-[17px] text-[#1E3A8A] leading-snug ${fontClass}`}
          >
            <p className="font-semibold text-[17px] sm:text-lg text-[#1E3A8A]">
              {recipient.fullName || "Recipient Name"}
            </p>
            {isAddressDeferred ? (
              <p className="text-xs text-stone-500 italic mt-1 font-sans">
                [ Street address to be added via link after checkout ]
              </p>
            ) : (
              <>
                <p>
                  {recipient.street1 || "Street Address"}
                  {recipient.street2 ? `, ${recipient.street2}` : ""}
                </p>
                <p>
                  {recipient.city || "City"}
                  {recipient.state ? `, ${recipient.state}` : !isInternationalDest ? ", State" : ""}{" "}
                  {recipient.zip || (!isInternationalDest ? "ZIP" : "")}
                </p>
                {isInternationalDest && displayCountry && (
                  <p className="font-bold uppercase tracking-wider text-xs sm:text-sm mt-0.5">
                    {displayCountry.toUpperCase()}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Caption below the envelope */}
      <p className="text-[11px] text-stone-500 text-center mt-2.5">
        Illustrative preview · Postage design may vary.
      </p>
    </div>
  );
}
