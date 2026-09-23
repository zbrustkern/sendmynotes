"use client";

import React from "react";
import { Mail, MapPin, Send, ShieldCheck } from "lucide-react";
import { MailingAddress } from "@/lib/types";

interface AddressStepProps {
  recipient: MailingAddress;
  onChangeRecipient: (field: keyof MailingAddress, value: string) => void;
  returnAddress: MailingAddress;
  onChangeReturnAddress: (field: keyof MailingAddress, value: string) => void;
}

export function AddressStep({
  recipient,
  onChangeRecipient,
  returnAddress,
  onChangeReturnAddress,
}: AddressStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center">
            3
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            Physical Delivery Addresses
          </h2>
        </div>
        <p className="text-sm text-stone-500">
          We ink, package, stamp, and mail this physical card via USPS First Class Mail. Postage is 100% included in the $9.00 flat fee.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* RECIPIENT MAILING ADDRESS */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Send className="w-4 h-4 text-amber-500" />
              Recipient (Send To)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={recipient.firstName}
                onChange={(e) => onChangeRecipient("firstName", e.target.value)}
                placeholder="Jane"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={recipient.lastName}
                onChange={(e) => onChangeRecipient("lastName", e.target.value)}
                placeholder="Doe"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Street Address
            </label>
            <input
              type="text"
              required
              value={recipient.street1}
              onChange={(e) => onChangeRecipient("street1", e.target.value)}
              placeholder="123 Main Street"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Apartment, Suite, Unit (Optional)
            </label>
            <input
              type="text"
              value={recipient.street2 || ""}
              onChange={(e) => onChangeRecipient("street2", e.target.value)}
              placeholder="Apt 4B"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">City</label>
              <input
                type="text"
                required
                value={recipient.city}
                onChange={(e) => onChangeRecipient("city", e.target.value)}
                placeholder="Austin"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">State</label>
              <input
                type="text"
                required
                maxLength={2}
                value={recipient.state}
                onChange={(e) => onChangeRecipient("state", e.target.value.toUpperCase())}
                placeholder="TX"
                className="w-full px-2 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-center uppercase"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">ZIP Code</label>
              <input
                type="text"
                required
                maxLength={10}
                value={recipient.zip}
                onChange={(e) => onChangeRecipient("zip", e.target.value)}
                placeholder="78701"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* SENDER RETURN ADDRESS */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-stone-500" />
              Sender (Return Address)
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={returnAddress.firstName}
                onChange={(e) => onChangeReturnAddress("firstName", e.target.value)}
                placeholder="Your Name"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={returnAddress.lastName}
                onChange={(e) => onChangeReturnAddress("lastName", e.target.value)}
                placeholder="Your Last"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Street Address
            </label>
            <input
              type="text"
              required
              value={returnAddress.street1}
              onChange={(e) => onChangeReturnAddress("street1", e.target.value)}
              placeholder="Your Street Address"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Apartment, Suite (Optional)
            </label>
            <input
              type="text"
              value={returnAddress.street2 || ""}
              onChange={(e) => onChangeReturnAddress("street2", e.target.value)}
              placeholder="Apt 2"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">City</label>
              <input
                type="text"
                required
                value={returnAddress.city}
                onChange={(e) => onChangeReturnAddress("city", e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">State</label>
              <input
                type="text"
                required
                maxLength={2}
                value={returnAddress.state}
                onChange={(e) => onChangeReturnAddress("state", e.target.value.toUpperCase())}
                placeholder="CA"
                className="w-full px-2 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-center uppercase"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">ZIP Code</label>
              <input
                type="text"
                required
                maxLength={10}
                value={returnAddress.zip}
                onChange={(e) => onChangeReturnAddress("zip", e.target.value)}
                placeholder="90210"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* USPS Postage Included Badge */}
      <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span>
            <strong>USPS First Class Physical Stamp</strong> affixed to genuine heavy cardstock envelope.
          </span>
        </div>
        <div className="flex items-center gap-1 font-semibold text-amber-800 text-[11px] whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
          Included in $9.00
        </div>
      </div>
    </div>
  );
}
