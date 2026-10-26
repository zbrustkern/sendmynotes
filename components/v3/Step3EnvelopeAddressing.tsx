"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Plus,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export interface AddressData {
  fullName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface MailingOption {
  countryCode: string;
  countryName: string;
  postalCodeRequired: boolean;
  regionRequired: boolean;
  available: boolean;
}

export function isInternationalCountry(country?: string): boolean {
  if (!country?.trim()) return false;
  return !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(country.trim().toUpperCase());
}

interface Step3EnvelopeAddressingProps {
  recipient: AddressData;
  onChangeRecipient: (field: keyof AddressData, value: string) => void;
  sender: AddressData;
  onChangeSender: (field: keyof AddressData, value: string) => void;
  fontClass: string;
  onBack: () => void;
  onContinue: () => void;
  hideFixedActionBar?: boolean;
  isAddressDeferred?: boolean;
  onChangeAddressDeferred?: (deferred: boolean) => void;
  onValidationError?: (error: string) => void;
  mailingOptions?: { destinations: MailingOption[]; enabled: boolean; previewAvailable?: boolean } | null;
  isBusy?: boolean;
  isInternational?: boolean;
  onSaveInternational?: (address: AddressData) => void;
  savedInternationalRecipient?: AddressData | null;
  onUseUSAddress?: () => void;
  displayTotalCents?: number;
}

interface LiveEnvelopeCardProps {
  sender: AddressData;
  recipient: AddressData;
  fontClass: string;
  isAddressDeferred?: boolean;
  isInternational?: boolean;
}

class OptionalInternationalEditorBoundary extends React.Component<{
  onClose: () => void;
  children: React.ReactNode;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-4" role="alert">
        <section className="w-full sm:max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-3">
          <h2 className="font-serif text-lg font-bold text-stone-900">International address editor unavailable</h2>
          <p className="text-sm text-stone-600">Your saved recipient address is unchanged. Close this editor and retry, or continue with a US address.</p>
          <button type="button" onClick={this.props.onClose} className="rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white">Close editor</button>
        </section>
      </div>
    );
  }
}

function LiveEnvelopeCard({
  sender,
  recipient,
  fontClass,
  isAddressDeferred,
  isInternational = false,
}: LiveEnvelopeCardProps) {
  return (
    <div className="bg-[#FAF8F5] rounded-3xl p-4 sm:p-5 border border-stone-200/90 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-stone-200/70 pb-2.5">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-800" />
          <h3 className="font-serif font-bold text-sm text-stone-900">
            Live Envelope Preview
          </h3>
        </div>
        <span className="text-[10px] font-semibold text-emerald-800 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-full">
          {isInternational ? "Real Blue Ink • International destination" : "Real Blue Ink • USPS Forever Stamp"}
        </span>
      </div>

      {/* PHYSICAL ENVELOPE (A2 FORMAT: 4.375" x 5.75", ratio ~1.31) */}
      <div className="relative w-full rounded-2xl bg-[#FCFAF7] border border-[#E6DFD5] p-4 sm:p-5 shadow-md overflow-hidden text-stone-900 select-none">
        {/* TOP ROW: HANDWRITTEN RETURN ADDRESS + POSTMARK & FOREVER STAMP */}
        <div className="flex items-start justify-between gap-2 mb-5">
          {/* Top-Left: SENDER RETURN ADDRESS IN REAL BLUE PEN INK */}
          <div
            className={`max-w-[170px] text-[#1e3a8a] text-xs leading-tight select-none ${fontClass}`}
          >
            <p className="font-medium">{sender.fullName || "Your Name"}</p>
            <p>{sender.street1 || "Street Address"}</p>
            {sender.street2 && <p>{sender.street2}</p>}
            <p>
              {sender.city || "City"}, {sender.state || "ST"}{" "}
              {sender.zip || "ZIP"}
            </p>
          </div>

          {/* Top-Right: REALISTIC POSTMARK & USPS FOREVER STAMP */}
          <div className="flex items-start shrink-0 select-none">
            {isInternational ? <span className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-[9px] text-stone-600">International
              <br />Mailing
            </span> : <>
            {/* Cancellation postmark (Phoenix, AZ hub per supplier specs) */}
            <div className="hidden sm:flex flex-col items-end justify-center mr-1 mt-1 text-stone-600/70 text-[9px] font-mono leading-none tracking-tight text-right">
              <span>PHOENIX AZ 852</span>
              <span className="text-[8px] text-stone-500/80 my-0.5">
                FIRST-CLASS
              </span>
              {/* Wavy cancellation ink lines */}
              <svg
                viewBox="0 0 48 16"
                className="w-10 h-3 text-stone-600/60 stroke-current fill-none"
              >
                <path
                  d="M0,4 Q6,0 12,4 T24,4 T36,4 T48,4"
                  strokeWidth="1.2"
                />
                <path
                  d="M0,8 Q6,4 12,8 T24,8 T36,8 T48,8"
                  strokeWidth="1.2"
                />
                <path
                  d="M0,12 Q6,8 12,12 T24,12 T36,12 T48,12"
                  strokeWidth="1.2"
                />
              </svg>
            </div>

            {/* USPS FOREVER STAMP (AUTHENTIC PERFORATED POSTAGE STAMP) */}
            <div className="relative w-12 h-16 sm:w-14 sm:h-18 bg-white rounded-xs border border-stone-300 shadow-xs p-1 flex flex-col justify-between overflow-hidden">
              {/* Perforated scalloped stamp edges */}
              <div className="absolute inset-0 border border-dashed border-stone-400/40 pointer-events-none" />

              {/* Stamp artwork: Flag / USA Forever */}
              <div className="h-full w-full bg-gradient-to-b from-[#1e3a8a] via-[#f8fafc] to-[#991b1b] rounded-[2px] p-1 flex flex-col justify-between relative overflow-hidden">
                {/* Flag stars header */}
                <div className="flex items-center justify-between text-white text-[7px] font-sans font-bold leading-none tracking-widest">
                  <span>USA</span>
                  <span className="text-[6px] font-serif">★</span>
                </div>
                {/* Center emblem */}
                <div className="text-center py-0.5">
                  <span className="text-[9px] sm:text-[10px] font-serif font-black tracking-wider text-white drop-shadow-xs">
                    FOREVER
                  </span>
                </div>
                {/* Bottom value */}
                <div className="flex items-center justify-between text-white/90 text-[6px] font-mono leading-none">
                  <span>USPS</span>
                  <span>2026</span>
                </div>
                {/* Cancellation wavy line crossing stamp */}
                <svg
                  viewBox="0 0 60 40"
                  className="absolute inset-0 w-full h-full text-stone-800/40 stroke-current fill-none pointer-events-none"
                >
                  <path
                    d="M-10,10 Q10,5 30,12 T70,10"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M-10,22 Q10,17 30,24 T70,22"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
            </div>
            </>}
          </div>
        </div>

        {/* CENTER: MAILING RECIPIENT IN AUTHENTIC BLUE PEN INK */}
        <div className="flex justify-center px-2 py-2 sm:py-3 select-none">
          <div
            className={`w-fit min-w-[180px] max-w-xs text-left space-y-0.5 text-base sm:text-lg text-[#1e3a8a] leading-snug ${fontClass}`}
          >
            <p className="font-semibold text-lg sm:text-xl text-[#1e3a8a]">
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
                  {recipient.city || "City"}{recipient.state ? `, ${recipient.state}` : !isInternational ? ", State" : ""} {recipient.zip || (!isInternational ? "ZIP" : "")}
                </p>
                {isInternational && <p>{recipient.country}</p>}
              </>
            )}
          </div>
        </div>

        {/* Domestic visual only; international postage treatment is not represented as verified. */}
        {!isInternational && <div className="mt-4 pt-2 flex flex-col items-center justify-center select-none">
          <svg
            viewBox="0 0 240 14"
            className="w-44 sm:w-56 h-3 text-stone-800/70 fill-current opacity-80"
          >
            <rect x="0" y="2" width="2" height="10" />
            <rect x="4" y="2" width="2" height="6" />
            <rect x="8" y="2" width="2" height="10" />
            <rect x="12" y="5" width="2" height="7" />
            <rect x="16" y="2" width="2" height="10" />
            <rect x="20" y="2" width="2" height="10" />
            <rect x="24" y="5" width="2" height="4" />
            <rect x="28" y="2" width="2" height="10" />
            <rect x="32" y="2" width="2" height="7" />
            <rect x="36" y="5" width="2" height="7" />
            <rect x="40" y="2" width="2" height="10" />
            <rect x="44" y="5" width="2" height="4" />
            <rect x="48" y="2" width="2" height="10" />
            <rect x="52" y="2" width="2" height="7" />
            <rect x="56" y="2" width="2" height="10" />
            <rect x="60" y="5" width="2" height="7" />
            <rect x="64" y="2" width="2" height="10" />
            <rect x="68" y="2" width="2" height="10" />
            <rect x="72" y="5" width="2" height="4" />
            <rect x="76" y="2" width="2" height="7" />
            <rect x="80" y="2" width="2" height="10" />
            <rect x="84" y="5" width="2" height="7" />
            <rect x="88" y="2" width="2" height="10" />
            <rect x="92" y="2" width="2" height="10" />
            <rect x="96" y="5" width="2" height="4" />
            <rect x="100" y="2" width="2" height="10" />
            <rect x="104" y="2" width="2" height="7" />
            <rect x="108" y="5" width="2" height="7" />
            <rect x="112" y="2" width="2" height="10" />
            <rect x="116" y="5" width="2" height="4" />
            <rect x="120" y="2" width="2" height="10" />
            <rect x="124" y="2" width="2" height="7" />
            <rect x="128" y="2" width="2" height="10" />
            <rect x="132" y="5" width="2" height="7" />
            <rect x="136" y="2" width="2" height="10" />
            <rect x="140" y="2" width="2" height="10" />
            <rect x="144" y="5" width="2" height="4" />
            <rect x="148" y="2" width="2" height="7" />
            <rect x="152" y="2" width="2" height="10" />
            <rect x="156" y="5" width="2" height="7" />
            <rect x="160" y="2" width="2" height="10" />
            <rect x="164" y="2" width="2" height="10" />
            <rect x="168" y="5" width="2" height="4" />
            <rect x="172" y="2" width="2" height="10" />
            <rect x="176" y="2" width="2" height="7" />
            <rect x="180" y="5" width="2" height="7" />
            <rect x="184" y="2" width="2" height="10" />
            <rect x="188" y="5" width="2" height="4" />
            <rect x="192" y="2" width="2" height="10" />
            <rect x="196" y="2" width="2" height="7" />
            <rect x="200" y="2" width="2" height="10" />
            <rect x="204" y="5" width="2" height="7" />
            <rect x="208" y="2" width="2" height="10" />
            <rect x="212" y="2" width="2" height="10" />
            <rect x="216" y="5" width="2" height="4" />
            <rect x="220" y="2" width="2" height="7" />
            <rect x="224" y="2" width="2" height="10" />
            <rect x="228" y="5" width="2" height="7" />
            <rect x="232" y="2" width="2" height="10" />
            <rect x="236" y="2" width="2" height="10" />
          </svg>
        </div>}
      </div>

      <p className="text-[11px] text-stone-500 text-center">
        {isInternational ? "International mailing destination preview." : "Mailed in an envelope directly to your recipient via USPS First-Class."}
      </p>
    </div>
  );
}

export function Step3EnvelopeAddressing({
  recipient,
  onChangeRecipient,
  sender,
  onChangeSender,
  fontClass,
  onBack,
  onContinue,
  hideFixedActionBar = false,
  isAddressDeferred = false,
  onChangeAddressDeferred,
  onValidationError,
  mailingOptions,
  isBusy = false,
  isInternational = false,
  onSaveInternational,
  savedInternationalRecipient,
  onUseUSAddress,
  displayTotalCents = 900,
}: Step3EnvelopeAddressingProps) {
  const [showRecipientApt, setShowRecipientApt] = useState(Boolean(recipient.street2));
  const [showSenderApt, setShowSenderApt] = useState(Boolean(sender.street2));
  const [showEnvelopePreview, setShowEnvelopePreview] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isInternationalEditorOpen, setIsInternationalEditorOpen] = useState(false);
  const [internationalDraft, setInternationalDraft] = useState<AddressData>(recipient);
  const internationalTriggerRef = useRef<HTMLButtonElement>(null);
  const internationalDialogRef = useRef<HTMLElement>(null);
  const canPreviewInternational = Boolean(mailingOptions?.enabled || mailingOptions?.previewAvailable);
  const countries = (mailingOptions?.destinations || [])
    .filter((item) => item.available || mailingOptions?.previewAvailable)
    .sort((a, b) => a.countryName.localeCompare(b.countryName));
  const internationalTotalCents = isInternational ? displayTotalCents : displayTotalCents + 500;
  const internationalTotalLabel = `$${(internationalTotalCents / 100).toFixed(2)}`;

  useEffect(() => {
    if (!isInternationalEditorOpen) return;
    const dialog = internationalDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []);
    focusable()[0]?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsInternationalEditorOpen(false);
      if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      internationalTriggerRef.current?.focus();
    };
  }, [isInternationalEditorOpen]);

  const openInternationalEditor = () => {
    setInternationalDraft(isInternationalCountry(recipient.country)
      ? recipient
      : savedInternationalRecipient || { ...recipient, country: "" });
    setIsInternationalEditorOpen(true);
  };
  const saveInternationalAddress = () => {
    if (isBusy) return;
    if (!internationalDraft.country) return;
    const selected = countries.find((item) => item.countryCode === internationalDraft.country);
    if (!selected) return;
    if (!internationalDraft.fullName.trim() || !internationalDraft.street1.trim() || !internationalDraft.city.trim() || (selected.regionRequired && !internationalDraft.state.trim()) || (selected.postalCodeRequired && !internationalDraft.zip.trim())) return;
    onSaveInternational?.(internationalDraft);
    setIsInternationalEditorOpen(false);
  };

  // Validation before proceeding
  const handleProceed = () => {
    if (!recipient.fullName.trim()) {
      const err = "Please provide the recipient's full name.";
      setFormError(err);
      onValidationError?.(err);
      return;
    }
    if (!isAddressDeferred) {
      if (!recipient.street1.trim()) {
        const err = "Please provide the recipient's street address.";
        setFormError(err);
        onValidationError?.(err);
        return;
      }
      const countryRule = countries.find((item) => item.countryCode === recipient.country);
      if (!recipient.city.trim() || (isInternational && countryRule?.regionRequired && !recipient.state.trim()) || (isInternational && countryRule?.postalCodeRequired && !recipient.zip.trim()) || (!isInternational && (!recipient.state.trim() || !recipient.zip.trim()))) {
        const err = "Please complete the recipient's City, State, and ZIP code.";
        setFormError(err);
        onValidationError?.(err);
        return;
      }
    }
    if (!sender.fullName.trim()) {
      const err = "Please provide your name for your return address.";
      setFormError(err);
      onValidationError?.(err);
      return;
    }
    if (!isAddressDeferred && (!sender.city.trim() || !sender.state.trim())) {
      const err = "Please provide your city and state for your return address.";
      setFormError(err);
      onValidationError?.(err);
      return;
    }

    setFormError(null);
    onContinue();
  };

  return (
    <div className="space-y-6 pb-28 md:pb-12">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200/80 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
              3
            </span>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Where should we mail it?
            </h1>
          </div>
          <p className="text-xs text-stone-600">
            {isInternational ? "Your selected destination is shown below. Delivery timing varies by destination." : "Mailed directly to your recipient via USPS First-Class Mail."}
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit note</span>
        </button>
      </div>

      {/* TWO-COLUMN SPLIT-SCREEN WORKBENCH (lg:grid-cols-12) */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 lg:items-start space-y-6 lg:space-y-0">
        {/* LEFT COLUMN: lg:col-span-5 lg:sticky lg:top-6 — Live Envelope & Deferral */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
          {/* 1. TOP UNMISTAKABLE ADDRESS DEFERRAL CARD */}
          {!isInternational && <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50/70 rounded-2xl border-2 border-amber-300 shadow-xs space-y-2.5">
            <div className="flex items-start gap-3">
              <input
                id="defer-address-toggle"
                type="checkbox"
                checked={isAddressDeferred}
                onChange={(e) => onChangeAddressDeferred?.(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-amber-400 text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0"
              />
              <label htmlFor="defer-address-toggle" className="text-xs sm:text-sm text-stone-900 cursor-pointer select-none">
                <strong className="block text-amber-950 font-bold text-sm mb-0.5">
                  Don&apos;t have their street address handy? Lock in your card now &amp; add address later
                </strong>
                <span className="text-stone-700 block text-xs leading-relaxed">
                  We&apos;ll hold your card in queue and immediately email you a magic link (and display it on your confirmation page) to enter the mailing address whenever you&apos;re ready.
                </span>
              </label>
            </div>
            {isAddressDeferred && (
              <div className="p-2.5 bg-amber-100/80 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium flex items-center gap-2">
                <span>✨ Address deferred! You only need to provide recipient &amp; sender names to proceed. Postal dispatch is held until you submit the recipient address via magic link.</span>
              </div>
            )}
          </div>}

          {/* 2. STICKY LIVE ENVELOPE PREVIEW */}
          <LiveEnvelopeCard
            sender={sender}
            recipient={recipient}
            fontClass={fontClass}
            isAddressDeferred={isAddressDeferred}
            isInternational={isInternational}
          />

          {/* EXPLANATORY CALLOUT */}
          <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200/70 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <p className="text-xs text-stone-700 leading-relaxed">
              <strong className="font-semibold text-emerald-950">Return Address:</strong>{" "}
              Your name and US return address appear on the envelope, and your recipient knows who it&apos;s from.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN: lg:col-span-7 — Sub-Grid (Send to & From you) */}
        <div className="lg:col-span-7 space-y-4">
          {/* FORM SECTIONS: RECIPIENT ("Send to") & SENDER ("From you") LEAD FIRST */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SECTION 1: RECIPIENT ("Send to") */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
            <h2 className="text-sm font-bold text-stone-900">
              Send to
            </h2>
            {canPreviewInternational && !isInternational && (
              <button ref={internationalTriggerRef} type="button" disabled={isBusy} onClick={openInternationalEditor} className="text-xs font-semibold text-emerald-800 underline underline-offset-2 disabled:opacity-50">
                International? +$5
              </button>
            )}
          </div>

          {isInternational ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{recipient.fullName}</p>
                  <p className="text-sm text-stone-700">{recipient.street1}{recipient.street2 ? `, ${recipient.street2}` : ""}</p>
                  <p className="text-sm text-stone-700">{[recipient.city, recipient.state, recipient.zip].filter(Boolean).join(", ")}</p>
                  <p className="text-sm font-medium text-stone-800">{countries.find((item) => item.countryCode === recipient.country)?.countryName || recipient.country}</p>
                  {mailingOptions?.previewAvailable && !mailingOptions.enabled && <p className="mt-2 text-xs text-amber-800">Preview only. International checkout is not enabled.</p>}
                </div>
                <button ref={internationalTriggerRef} type="button" disabled={isBusy} onClick={openInternationalEditor} className="text-xs font-semibold text-emerald-800 underline underline-offset-2 disabled:opacity-50">Edit</button>
              </div>
              <button type="button" disabled={isBusy} onClick={onUseUSAddress} className="text-xs font-semibold text-stone-700 underline underline-offset-2 disabled:opacity-50">Use a US address instead</button>
            </div>
          ) : (
          <>

          {/* Recipient Full Name */}
          <div>
            <label htmlFor="shipping-name" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
              Recipient name
            </label>
            <input
              id="shipping-name"
              type="text"
              name="recipientName"
              autoComplete="shipping name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              value={recipient.fullName}
              onChange={(e) => onChangeRecipient("fullName", e.target.value)}
              placeholder="First and last name"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
            />
          </div>

          {/* Recipient Street Fields (Hidden/Collapsed if Address is Deferred) */}
          {!isAddressDeferred ? (
            <>
              {/* Street Address */}
              <div>
                <label htmlFor="shipping-street1" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                  Street address
                </label>
                <input
                  id="shipping-street1"
                  type="text"
                  name="shippingStreet1"
                  autoComplete="shipping address-line1"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  value={recipient.street1}
                  onChange={(e) => onChangeRecipient("street1", e.target.value)}
                  placeholder="Street address (e.g. 456 Colorado Blvd)"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
                />
              </div>

              {/* Apt/Suite Toggle & Field */}
              {showRecipientApt ? (
                <div>
                  <label htmlFor="shipping-street2" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                    Apartment, Suite, Unit
                  </label>
                  <input
                    id="shipping-street2"
                    type="text"
                    name="shippingStreet2"
                    autoComplete="shipping address-line2"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    value={recipient.street2 || ""}
                    onChange={(e) => onChangeRecipient("street2", e.target.value)}
                    placeholder="Apt, Suite, Unit (optional)"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRecipientApt(true)}
                  className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Apt / Suite / Unit</span>
                </button>
              )}

              {/* Responsive City, State, ZIP Layout: City full width, State & ZIP below */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="shipping-city" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                    City
                  </label>
                  <input
                    id="shipping-city"
                    type="text"
                    name="shippingCity"
                    autoComplete="shipping address-level2"
                    autoCapitalize="words"
                    autoCorrect="off"
                    spellCheck={false}
                    value={recipient.city}
                    onChange={(e) => onChangeRecipient("city", e.target.value)}
                    placeholder="City (e.g. Denver)"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="shipping-state" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                      State
                    </label>
                    <select
                      id="shipping-state"
                      name="shippingState"
                      autoComplete="shipping address-level1"
                      value={recipient.state}
                      onChange={(e) => onChangeRecipient("state", e.target.value)}
                      className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-medium"
                    >
                      <option value="">Select</option>
                      {US_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="shipping-zip" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                      ZIP Code
                    </label>
                    <input
                      id="shipping-zip"
                      type="text"
                      name="shippingZip"
                      autoComplete="shipping postal-code"
                      inputMode="numeric"
                      autoCorrect="off"
                      spellCheck={false}
                      value={recipient.zip}
                      onChange={(e) => onChangeRecipient("zip", e.target.value)}
                      placeholder="80206"
                      maxLength={10}
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>Street address will be entered via your magic link (displayed on confirmation &amp; emailed) before postal dispatch.</span>
            </div>
          )}
          </>
          )}
        </div>

        {/* SECTION 2: SENDER ("From you") */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
            <h2 className="text-sm font-bold text-stone-900">
              From you
            </h2>
          </div>

          {/* Sender Full Name */}
          <div>
            <label htmlFor="billing-name" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
              Your name
            </label>
            <input
              id="billing-name"
              type="text"
              name="senderName"
              autoComplete="billing name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              value={sender.fullName}
              onChange={(e) => onChangeSender("fullName", e.target.value)}
              placeholder="Your first and last name"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
            />
          </div>

          {/* Street Address */}
          <div>
            <label htmlFor="billing-street1" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
              Your street address
            </label>
            <input
              id="billing-street1"
              type="text"
              name="billingStreet1"
              autoComplete="billing address-line1"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              value={sender.street1}
              onChange={(e) => onChangeSender("street1", e.target.value)}
              placeholder="Your street address"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
            />
          </div>

          {/* Sender Apt/Suite Toggle & Field */}
          {showSenderApt ? (
            <div>
              <label htmlFor="billing-street2" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                Apartment, Suite, Unit
              </label>
              <input
                id="billing-street2"
                type="text"
                name="billingStreet2"
                autoComplete="billing address-line2"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                value={sender.street2 || ""}
                onChange={(e) => onChangeSender("street2", e.target.value)}
                placeholder="Apt, Suite, Unit (optional)"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSenderApt(true)}
              className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Apt / Suite / Unit</span>
            </button>
          )}

          {/* Responsive City, State, ZIP Layout */}
          <div className="space-y-3">
            <div>
              <label htmlFor="billing-city" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                City
              </label>
              <input
                id="billing-city"
                type="text"
                name="billingCity"
                autoComplete="billing address-level2"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                value={sender.city}
                onChange={(e) => onChangeSender("city", e.target.value)}
                placeholder="City (e.g. Chicago)"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="billing-state" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                  State
                </label>
                <select
                  id="billing-state"
                  name="billingState"
                  autoComplete="billing address-level1"
                  value={sender.state}
                  onChange={(e) => onChangeSender("state", e.target.value)}
                  className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-medium"
                >
                  <option value="">Select</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="billing-zip" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                  ZIP Code
                </label>
                <input
                  id="billing-zip"
                  type="text"
                  name="billingZip"
                  autoComplete="billing postal-code"
                  inputMode="numeric"
                  autoCorrect="off"
                  spellCheck={false}
                  value={sender.zip}
                  onChange={(e) => onChangeSender("zip", e.target.value)}
                  placeholder="60601"
                  maxLength={10}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-base text-stone-900 placeholder:text-stone-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {isInternationalEditorOpen && canPreviewInternational && (
        <OptionalInternationalEditorBoundary onClose={() => setIsInternationalEditorOpen(false)}>
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsInternationalEditorOpen(false); }}>
          <section ref={internationalDialogRef} role="dialog" aria-modal="true" aria-labelledby="international-address-title" className="w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div>
              <h2 id="international-address-title" className="font-serif text-xl font-bold text-stone-900">Send internationally</h2>
              <p className="mt-1 text-sm text-stone-600">{internationalTotalLabel} total, including international mailing. Your US return address stays on the envelope.</p>
              {mailingOptions?.previewAvailable && !mailingOptions.enabled && <p className="mt-2 text-xs text-amber-800">Staging preview only. You can save this address to review the flow; checkout remains unavailable.</p>}
            </div>
            <label className="block text-xs font-semibold text-stone-700">Country or region
              <select autoFocus disabled={isBusy} value={internationalDraft.country || ""} onChange={(event) => setInternationalDraft({ ...internationalDraft, country: event.target.value, state: "", zip: "" })} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base">
                <option value="">Choose a country</option>
                {countries.map((country) => <option key={country.countryCode} value={country.countryCode}>{country.countryName}{!country.available ? " — preview" : ""}</option>)}
              </select>
            </label>
            {internationalDraft.country && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  ["fullName", "Recipient name", true], ["street1", "Street address", true], ["street2", "Address line 2", false], ["city", "City or locality", true], ["state", "State, province or region", Boolean(countries.find((item) => item.countryCode === internationalDraft.country)?.regionRequired)], ["zip", "Postal code", Boolean(countries.find((item) => item.countryCode === internationalDraft.country)?.postalCodeRequired)],
                ] as const).map(([field, label, required]) => <label key={field} className={`block text-xs font-semibold text-stone-700 ${field === "street1" || field === "street2" ? "sm:col-span-2" : ""}`}>{label}{required ? " *" : ""}<input disabled={isBusy} value={internationalDraft[field] || ""} required={required} onChange={(event) => setInternationalDraft({ ...internationalDraft, [field]: event.target.value })} className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base" autoComplete={field === "fullName" ? "shipping name" : undefined} /></label>)}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={isBusy} onClick={() => setIsInternationalEditorOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-stone-700 border border-stone-300 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={saveInternationalAddress} disabled={isBusy || !internationalDraft.country || !internationalDraft.fullName.trim() || !internationalDraft.street1.trim() || !internationalDraft.city.trim() || Boolean(countries.find((item) => item.countryCode === internationalDraft.country)?.regionRequired && !internationalDraft.state.trim()) || Boolean(countries.find((item) => item.countryCode === internationalDraft.country)?.postalCodeRequired && !internationalDraft.zip.trim())} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-800 disabled:opacity-40">Save address · {internationalTotalLabel} total</button>
            </div>
          </section>
        </div>
        </OptionalInternationalEditorBoundary>
      )}

          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium animate-in fade-in">
              {formError}
            </div>
          )}

          {/* DESKTOP ADVANCE BAR */}
          <div className="hidden md:flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>← Back to note</span>
            </button>

            <button
              type="button"
              onClick={handleProceed}
              className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span>Review &amp; pay (${(displayTotalCents / 100).toFixed(2)}) →</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
      {!hideFixedActionBar && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 p-3 shadow-lg flex items-center justify-between gap-3 safe-area-inset-bottom">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-2 text-stone-600 hover:text-stone-900 text-xs font-semibold flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>

          <button
            type="button"
            onClick={handleProceed}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span>Review &amp; pay (${(displayTotalCents / 100).toFixed(2)}) →</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
