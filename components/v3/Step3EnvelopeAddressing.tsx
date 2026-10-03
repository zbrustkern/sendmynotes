"use client";

import React, { useState } from "react";
import {
  Mail,
  Send,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Check,
  Building,
  Plus,
  MapPin,
  Lock,
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
}

interface Step3EnvelopeAddressingProps {
  recipient: AddressData;
  onChangeRecipient: (field: keyof AddressData, value: string) => void;
  sender: AddressData;
  onChangeSender: (field: keyof AddressData, value: string) => void;
  fontClass: string;
  onBack: () => void;
  onContinue: () => void;
}

export function Step3EnvelopeAddressing({
  recipient,
  onChangeRecipient,
  sender,
  onChangeSender,
  fontClass,
  onBack,
  onContinue,
}: Step3EnvelopeAddressingProps) {
  const [showAptSuite, setShowAptSuite] = useState(Boolean(recipient.street2));
  const [formError, setFormError] = useState<string | null>(null);

  // Validation before proceeding
  const handleProceed = () => {
    if (!recipient.fullName.trim()) {
      setFormError("Please provide the recipient's full name.");
      return;
    }
    if (!recipient.street1.trim()) {
      setFormError("Please provide the recipient's street address.");
      return;
    }
    if (!recipient.city.trim() || !recipient.state.trim() || !recipient.zip.trim()) {
      setFormError("Please complete the recipient's City, State, and ZIP code.");
      return;
    }
    if (!sender.fullName.trim() || !sender.city.trim() || !sender.state.trim()) {
      setFormError("Please provide your name, city, and state for your personal return address.");
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
            <span className="w-5 h-5 rounded-full bg-amber-800 text-white font-bold text-xs flex items-center justify-center">
              3
            </span>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Physical Envelope Addressing &amp; Return Address
            </h1>
          </div>
          <p className="text-xs text-stone-500">
            Penned directly on a 70 lb matching stationery envelope. Delivered via USPS First-Class Mail.
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="self-start sm:self-auto px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg shadow-2xs hover:bg-stone-50 transition flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit Note</span>
        </button>
      </div>

      {/* 2D PHYSICAL CREAM ENVELOPE RENDERING */}
      <div className="relative w-full max-w-2xl mx-auto rounded-2xl bg-[#FDFCF7] border-2 border-[#E7DFC6] p-5 sm:p-7 shadow-md overflow-hidden text-stone-800">
        {/* Subtle envelope texture and watermark */}
        <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(#E8E0CE_1px,transparent_1px)] [background-size:16px_16px]" />

        {/* TOP ROW: RETURN ADDRESS & STAMP */}
        <div className="relative z-10 flex items-start justify-between gap-4 mb-8 sm:mb-12">
          {/* Top-Left: Sender Personal Return Address (Crucial Authenticity Signal) */}
          <div className="max-w-[240px] sm:max-w-xs space-y-0.5">
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-amber-900">
              <span>Return Address (Sender)</span>
            </div>
            <div className="font-sans text-xs text-stone-800 leading-tight">
              <p className="font-semibold text-stone-900">
                {sender.fullName || "Your Full Name"}
              </p>
              <p>{sender.street1 || "Your Street Address"}</p>
              <p>
                {sender.city || "City"}, {sender.state || "ST"}{" "}
                {sender.zip || "ZIP"}
              </p>
            </div>
          </div>

          {/* Top-Right: USPS First-Class Stamp Artwork */}
          <div className="shrink-0 w-16 h-20 sm:w-20 sm:h-24 rounded border-2 border-dashed border-red-700/60 bg-gradient-to-b from-red-50 via-amber-50 to-blue-50 p-1 flex flex-col items-center justify-between text-center shadow-xs">
            <div className="text-[8px] sm:text-[9px] font-bold text-red-900 uppercase tracking-widest leading-none pt-0.5">
              USPS
            </div>
            <div className="my-auto text-amber-800">
              <Mail className="w-5 h-5 sm:w-6 sm:h-6 mx-auto stroke-1 text-red-800" />
            </div>
            <div className="text-[7px] sm:text-[8px] font-semibold text-stone-700 uppercase tracking-tighter leading-none pb-0.5">
              First-Class
            </div>
          </div>
        </div>

        {/* CENTER: RECIPIENT ADDRESS IN REAL HANDWRITING STYLING */}
        <div className="relative z-10 pl-6 sm:pl-16 pr-4 sm:pr-8 py-2 max-w-lg mx-auto text-center sm:text-left">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-stone-400 mb-1">
            Delivery Destination
          </div>
          <div className={`space-y-1 text-lg sm:text-xl text-stone-900 leading-tight ${fontClass}`}>
            <p className="font-semibold text-xl sm:text-2xl text-stone-950">
              {recipient.fullName || "Recipient Full Name"}
            </p>
            <p>
              {recipient.street1 || "123 Main Street"}
              {recipient.street2 ? `, ${recipient.street2}` : ""}
            </p>
            <p>
              {recipient.city || "City"},{" "}
              {recipient.state || "State"} {recipient.zip || "12345"}
            </p>
          </div>
        </div>

        {/* Envelope authenticity footer */}
        <div className="relative z-10 mt-6 pt-3 border-t border-[#E8E0CE] flex items-center justify-between text-[11px] text-stone-500">
          <span className="font-serif italic">Genuine USPS First-Class Postage</span>
          <span className="text-[10px] text-amber-800 font-semibold uppercase tracking-wider">
            Aster &amp; Blanche 70 lb Envelope
          </span>
        </div>
      </div>

      {/* EXPLANATORY CALLOUT */}
      <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-700 leading-relaxed">
          <strong className="font-semibold text-amber-950">High-Effort Personal Veneer:</strong>{" "}
          Penned on the envelope so your recipient knows this card was sent personally by you, and USPS can return it if undeliverable. We never print barcodes or corporate shipping labels on the outer envelope.
        </p>
      </div>

      {/* FORM SECTIONS (RECIPIENT & SENDER) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SECTION 1: DELIVERY DESTINATION (RECIPIENT) */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-stone-900 text-white font-bold text-xs flex items-center justify-center">
              A
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900">
              1. Where should we mail your card? (Recipient)
            </h2>
          </div>

          {/* Recipient Full Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
              Recipient Full Name
            </label>
            <input
              type="text"
              name="recipientName"
              autoComplete="shipping name"
              value={recipient.fullName}
              onChange={(e) => onChangeRecipient("fullName", e.target.value)}
              placeholder="e.g. Eleanor Vance"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
            />
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
              Street Address
            </label>
            <input
              type="text"
              name="shippingStreet1"
              autoComplete="shipping address-line1"
              value={recipient.street1}
              onChange={(e) => onChangeRecipient("street1", e.target.value)}
              placeholder="e.g. 456 Colorado Blvd"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
            />
          </div>

          {/* Apt/Suite Toggle */}
          {showAptSuite ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
                Apartment, Suite, Unit
              </label>
              <input
                type="text"
                name="shippingStreet2"
                autoComplete="shipping address-line2"
                value={recipient.street2 || ""}
                onChange={(e) => onChangeRecipient("street2", e.target.value)}
                placeholder="e.g. Apt 4B or Suite 200"
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAptSuite(true)}
              className="text-xs text-amber-800 hover:text-amber-950 font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Apartment / Suite / Unit</span>
            </button>
          )}

          {/* City, State, ZIP */}
          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                City
              </label>
              <input
                type="text"
                name="shippingCity"
                autoComplete="shipping address-level2"
                value={recipient.city}
                onChange={(e) => onChangeRecipient("city", e.target.value)}
                placeholder="Denver"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                State
              </label>
              <select
                name="shippingState"
                autoComplete="shipping address-level1"
                value={recipient.state}
                onChange={(e) => onChangeRecipient("state", e.target.value)}
                className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white font-medium"
              >
                <option value="">ST</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                ZIP
              </label>
              <input
                type="text"
                name="shippingZip"
                autoComplete="shipping postal-code"
                value={recipient.zip}
                onChange={(e) => onChangeRecipient("zip", e.target.value)}
                placeholder="80206"
                maxLength={10}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: SENDER RETURN ADDRESS */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
            <span className="w-5 h-5 rounded-full bg-stone-900 text-white font-bold text-xs flex items-center justify-center">
              B
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-900">
              2. Your Return Address (Sender)
            </h2>
          </div>

          {/* Sender Full Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
              Your Full Name
            </label>
            <input
              type="text"
              name="senderName"
              autoComplete="billing name"
              value={sender.fullName}
              onChange={(e) => onChangeSender("fullName", e.target.value)}
              placeholder="e.g. Thomas Miller"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
            />
          </div>

          {/* Street Address */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
              Your Street Address
            </label>
            <input
              type="text"
              name="billingStreet1"
              autoComplete="billing address-line1"
              value={sender.street1}
              onChange={(e) => onChangeSender("street1", e.target.value)}
              placeholder="e.g. 123 North Michigan Ave"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
            />
          </div>

          {/* City, State, ZIP */}
          <div className="grid grid-cols-6 gap-2">
            <div className="col-span-3">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                City
              </label>
              <input
                type="text"
                name="billingCity"
                autoComplete="billing address-level2"
                value={sender.city}
                onChange={(e) => onChangeSender("city", e.target.value)}
                placeholder="Chicago"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                State
              </label>
              <select
                name="billingState"
                autoComplete="billing address-level1"
                value={sender.state}
                onChange={(e) => onChangeSender("state", e.target.value)}
                className="w-full px-2 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white font-medium"
              >
                <option value="">ST</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-600 mb-1">
                ZIP
              </label>
              <input
                type="text"
                name="billingZip"
                autoComplete="billing postal-code"
                value={sender.zip}
                onChange={(e) => onChangeSender("zip", e.target.value)}
                placeholder="60601"
                maxLength={10}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="pt-2 text-[11px] text-stone-400">
            Standard Apple Keychain &amp; Chrome Autofill supported.
          </div>
        </div>
      </div>

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
          className="px-4 py-2.5 text-stone-600 hover:text-stone-900 text-sm font-semibold flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>← Back to Note</span>
        </button>

        <button
          type="button"
          onClick={handleProceed}
          className="px-6 py-3 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer"
        >
          <span>Review &amp; Pay ($9.00) →</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* MOBILE STICKY BOTTOM ACTION BAR */}
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
          className="px-5 py-2.5 bg-stone-900 hover:bg-black text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <span>Review &amp; Pay ($9.00) →</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
