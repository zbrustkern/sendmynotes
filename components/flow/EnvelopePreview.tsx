"use client";

import React, { useState } from "react";

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

function AddressLine({ children }: { children: React.ReactNode }) {
  return <p className="break-words [overflow-wrap:anywhere]">{children}</p>;
}

function localityLine(address: AddressDraftLike, useDomesticPlaceholders: boolean): string {
  if (useDomesticPlaceholders && !address.city && !address.state && !address.zip) return "City, State ZIP";
  const city = address.city || (useDomesticPlaceholders ? "City" : "");
  const regionPostal = [address.state, address.zip].filter(Boolean).join(" ");
  return [city, regionPostal].filter(Boolean).join(", ");
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
  const [paperImageFailed, setPaperImageFailed] = useState(false);
  const [stampImageFailed, setStampImageFailed] = useState(false);
  const isInternationalDest = isInternational || isNonUS(recipient.country);
  const displayCountry = countryName || (recipient.country && isNonUS(recipient.country) ? recipient.country : "");

  return (
    <figure className={`w-full min-w-0 ${className}`}>
      <div
        className="relative isolate grid w-full grid-cols-[minmax(0,1fr)_3.5rem] grid-rows-[auto_1fr] gap-x-3 gap-y-5 overflow-visible rounded-[3px] border border-stone-200 bg-white px-4 py-4 shadow-[0_16px_28px_-18px_rgba(41,37,36,0.55)] sm:grid-cols-[minmax(0,1fr)_4rem] sm:px-6 sm:py-5"
        style={{ aspectRatio: "5 / 3" }}
        aria-label="Illustrative envelope preview"
      >
        {!paperImageFailed && (
          <img
            src="/images/envelope-preview/envelope-paper.webp"
            alt=""
            aria-hidden="true"
            onError={() => setPaperImageFailed(true)}
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full rounded-[inherit] object-cover"
          />
        )}
        <section aria-label="Sender address" className="relative min-w-0 self-start text-[20px] leading-[1.08] text-blue-900 sm:text-[20px]">
          <div className={`${fontClass} break-words [overflow-wrap:anywhere]`}>
            <AddressLine>{sender.fullName || "Your name"}</AddressLine>
            <AddressLine>{sender.street1 || "Street address"}</AddressLine>
            {sender.street2 ? <AddressLine>{sender.street2}</AddressLine> : null}
            <AddressLine>{localityLine(sender, true)}</AddressLine>
          </div>
        </section>

        <div className="relative flex min-h-[3.75rem] w-full items-start justify-end" aria-hidden="true">
          {!isInternationalDest && !stampImageFailed ? (
            <img
              src="/images/envelope-preview/postage-domestic.webp"
              alt=""
              onError={() => setStampImageFailed(true)}
              className="h-[3.75rem] w-12 object-contain sm:h-[4.5rem] sm:w-14"
            />
          ) : (
            <div className="flex h-[3.75rem] w-12 items-center justify-center border border-stone-300 bg-white/80 text-center text-[9px] leading-tight text-stone-600 sm:h-[4.5rem] sm:w-14">
              Postage
            </div>
          )}
        </div>

        <section aria-label="Recipient address" className="col-span-2 col-start-1 row-start-2 ml-[20%] min-w-0 self-center px-1 py-2 sm:ml-[22%] sm:w-[72%] sm:px-0">
          <div className={`${fontClass} min-w-0 text-[27px] leading-[1.12] text-blue-900 sm:text-[27px]`}>
            <AddressLine>{recipient.fullName || "Recipient name"}</AddressLine>
            {isAddressDeferred ? (
              <AddressLine><span className="font-sans text-xs italic text-stone-600">Street address to be added later</span></AddressLine>
            ) : (
              <>
                <AddressLine>{recipient.street1 || "Street address"}</AddressLine>
                {recipient.street2 ? <AddressLine>{recipient.street2}</AddressLine> : null}
                <AddressLine>{localityLine(recipient, !isInternationalDest)}</AddressLine>
                {isInternationalDest && displayCountry ? <AddressLine>{displayCountry}</AddressLine> : null}
              </>
            )}
          </div>
        </section>
      </div>
      <figcaption className="mt-2.5 text-center text-[11px] text-stone-500">
        Illustrative preview · Postage design may vary.
      </figcaption>
    </figure>
  );
}
