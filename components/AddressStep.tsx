"use client";
import React, { useMemo } from "react";
import { Mail, MapPin, Send, ShieldCheck, Calendar, BookOpen, BookmarkCheck, Clock } from "lucide-react";
import { MailingAddress, SavedAddress } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";

interface AddressStepProps {
  recipient: MailingAddress;
  onChangeRecipient: (field: keyof MailingAddress, value: string) => void;
  returnAddress: MailingAddress;
  onChangeReturnAddress: (field: keyof MailingAddress, value: string) => void;
  scheduledSendDate: string;
  onChangeScheduledSendDate: (date: string) => void;
  saveRecipientToAddressBook: boolean;
  onToggleSaveRecipient: (val: boolean) => void;
}

export function AddressStep({
  recipient,
  onChangeRecipient,
  returnAddress,
  onChangeReturnAddress,
  scheduledSendDate,
  onChangeScheduledSendDate,
  saveRecipientToAddressBook,
  onToggleSaveRecipient,
}: AddressStepProps) {
  const { user, account } = useAuth();

  const deliveryEstimate = useMemo(
    () => calculateDeliveryEstimate(scheduledSendDate),
    [scheduledSendDate]
  );

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  const handleSelectFromAddressBook = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId || !account) return;
    const found = account.savedAddresses.find((a) => a.id === selectedId);
    if (found) {
      onChangeRecipient("firstName", found.firstName);
      onChangeRecipient("lastName", found.lastName);
      onChangeRecipient("street1", found.street1);
      onChangeRecipient("street2", found.street2 || "");
      onChangeRecipient("city", found.city);
      onChangeRecipient("state", found.state);
      onChangeRecipient("zip", found.zip);
    }
  };

  const handleUseDefaultReturn = () => {
    if (!account?.defaultReturnAddress) return;
    const ret = account.defaultReturnAddress;
    onChangeReturnAddress("firstName", ret.firstName);
    onChangeReturnAddress("lastName", ret.lastName);
    onChangeReturnAddress("street1", ret.street1);
    onChangeReturnAddress("street2", ret.street2 || "");
    onChangeReturnAddress("city", ret.city);
    onChangeReturnAddress("state", ret.state);
    onChangeReturnAddress("zip", ret.zip);
  };

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

            {account && account.savedAddresses.length > 0 && (
              <div className="flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                <select
                  onChange={handleSelectFromAddressBook}
                  defaultValue=""
                  className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none"
                >
                  <option value="" disabled>
                    Saved Address...
                  </option>
                  {account.savedAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.label ? `${addr.label}: ` : ""}
                      {addr.firstName} {addr.lastName} ({addr.city})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                autoComplete="shipping given-name"
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
                autoComplete="shipping family-name"
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
              autoComplete="shipping address-line1"
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
              autoComplete="shipping address-line2"
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
                autoComplete="shipping address-level2"
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
                autoComplete="shipping address-level1"
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
                autoComplete="shipping postal-code"
                value={recipient.zip}
                onChange={(e) => onChangeRecipient("zip", e.target.value)}
                placeholder="78701"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {user && (
            <div className="pt-2 border-t border-stone-100">
              <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveRecipientToAddressBook}
                  onChange={(e) => onToggleSaveRecipient(e.target.checked)}
                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="flex items-center gap-1 font-medium">
                  <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
                  Save recipient to my Address Book
                </span>
              </label>
            </div>
          )}
        </div>

        {/* RETURN MAILING ADDRESS */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-stone-500" />
              Return Address (Sender)
            </h3>

            {account?.defaultReturnAddress && (
              <button
                type="button"
                onClick={handleUseDefaultReturn}
                className="text-[11px] text-amber-700 hover:text-amber-900 font-medium underline"
              >
                Use Saved Return
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Your First Name
              </label>
              <input
                type="text"
                required
                autoComplete="given-name"
                value={returnAddress.firstName}
                onChange={(e) => onChangeReturnAddress("firstName", e.target.value)}
                placeholder="Morgan"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Your Last Name
              </label>
              <input
                type="text"
                required
                autoComplete="family-name"
                value={returnAddress.lastName}
                onChange={(e) => onChangeReturnAddress("lastName", e.target.value)}
                placeholder="Lee"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Your Street Address
            </label>
            <input
              type="text"
              required
              autoComplete="address-line1"
              value={returnAddress.street1}
              onChange={(e) => onChangeReturnAddress("street1", e.target.value)}
              placeholder="452 Ocean Avenue"
              className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Apartment, Suite (Optional)
            </label>
            <input
              type="text"
              autoComplete="address-line2"
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
                autoComplete="address-level2"
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
                autoComplete="address-level1"
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
                autoComplete="postal-code"
                value={returnAddress.zip}
                onChange={(e) => onChangeReturnAddress("zip", e.target.value)}
                placeholder="90210"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* DELIVERY TIMING: SCHEDULED SEND OR IMMEDIATE */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-indigo-600" />
            Delivery Timing
          </h3>
          <span className="text-[10px] uppercase font-bold text-stone-400">
            USPS Postal Schedule
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeScheduledSendDate("")}
            className={`p-3.5 rounded-xl border text-left transition ${
              !scheduledSendDate
                ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20"
                : "border-stone-200 hover:border-stone-300 bg-stone-50/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-stone-900">Send Immediately</span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                Standard
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Inked & posted into USPS First Class mail stream within 24 hours.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!scheduledSendDate) {
                const d = new Date();
                d.setDate(d.getDate() + 7);
                onChangeScheduledSendDate(d.toISOString().split("T")[0]);
              }
            }}
            className={`p-3.5 rounded-xl border text-left transition ${
              scheduledSendDate
                ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                : "border-stone-200 hover:border-stone-300 bg-stone-50/50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-stone-900">Schedule Future Date</span>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                Reserved
              </span>
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Hold and pen for a milestone (birthday, anniversary, holiday).
            </p>
          </button>
        </div>

        {scheduledSendDate && (
          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
            <label className="block text-[11px] font-semibold text-indigo-900">
              Target Handwriting & Postmark Date:
            </label>
            <input
              type="date"
              min={tomorrowStr}
              value={scheduledSendDate}
              onChange={(e) => onChangeScheduledSendDate(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 text-sm bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-stone-800"
            />
            <p className="text-[10px] text-indigo-700/80">
              We hold this order in our studio queue and begin inking and mailing on this date.
            </p>
          </div>
        )}

        {/* Dynamic USPS Delivery Estimate Banner */}
        <div className="p-3 bg-stone-50 border border-stone-200/90 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100/90 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
              📬
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-500">
                Estimated USPS Delivery Window
              </span>
              <span className="text-xs sm:text-sm font-bold text-stone-900">
                {deliveryEstimate.earliestDate} – {deliveryEstimate.latestDate}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full shrink-0">
            {deliveryEstimate.isScheduled ? "Scheduled Hold" : "Dispatches Next Day"}
          </span>
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
