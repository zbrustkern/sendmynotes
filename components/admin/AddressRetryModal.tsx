"use client";

import React, { useState } from "react";
import { X, RefreshCw, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { Order, MailingAddress } from "@/lib/types";

interface AddressRetryModalProps {
  order: Order;
  incidentId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddressRetryModal({
  order,
  incidentId,
  onClose,
  onSuccess,
}: AddressRetryModalProps) {
  const [address, setAddress] = useState<MailingAddress>({
    firstName: order.recipientAddress.firstName || "",
    lastName: order.recipientAddress.lastName || "",
    street1: order.recipientAddress.street1 || "",
    street2: order.recipientAddress.street2 || "",
    city: order.recipientAddress.city || "",
    state: order.recipientAddress.state || "",
    zip: order.recipientAddress.zip || "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.street1 || !address.city || !address.state || !address.zip) {
      setError("Please fill out complete street address, city, state, and zip.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/retry-fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          updatedRecipientAddress: address,
          incidentId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Fulfillment retry failed. Check address validity.");
      } else {
        alert(`Order successfully dispatched to Handwrytten! HW Order ID: ${data.handwryttenOrderId}`);
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(`Error executing retry: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-stone-200">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-stone-900">
                Correct Address &amp; Retry Inking
              </h3>
              <p className="text-xs text-stone-400 font-mono">{order.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                First Name
              </label>
              <input
                type="text"
                value={address.firstName}
                onChange={(e) => setAddress({ ...address, firstName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={address.lastName}
                onChange={(e) => setAddress({ ...address, lastName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
              Street Address
            </label>
            <input
              type="text"
              value={address.street1}
              onChange={(e) => setAddress({ ...address, street1: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
              Apartment, Suite, Unit (Optional)
            </label>
            <input
              type="text"
              value={address.street2 || ""}
              onChange={(e) => setAddress({ ...address, street2: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
            />
          </div>

          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                City
              </label>
              <input
                type="text"
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                State
              </label>
              <input
                type="text"
                maxLength={2}
                value={address.state}
                onChange={(e) => setAddress({ ...address, state: e.target.value.toUpperCase() })}
                className="w-full px-2 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500 text-center font-mono uppercase"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                ZIP Code
              </label>
              <input
                type="text"
                value={address.zip}
                onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500 font-mono"
              />
            </div>
          </div>

          <p className="text-[11px] text-stone-400">
            Updating will write the corrected address to the database and re-dispatch the physical card order to Handwrytten.
          </p>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl text-stone-600 hover:bg-stone-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-stone-900 hover:bg-black text-white transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Dispatching..." : "Update & Retry Inking"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
