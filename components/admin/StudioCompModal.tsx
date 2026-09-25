"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Sparkles, PenTool, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { MailingAddress } from "@/lib/types";

interface StudioCompModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const PRESET_COVERS = [
  {
    title: "Golden Hour Balloons",
    url: "/presets/birthday-balloons.jpg",
  },
  {
    title: "Wildflower Meadow",
    url: "/presets/thank-you-botanical.jpg",
  },
  {
    title: "Quiet Morning Breeze",
    url: "/presets/thinking-of-you-coffee.jpg",
  },
  {
    title: "Celebration Starlight",
    url: "/presets/congrats-champagne.jpg",
  },
  {
    title: "Evergreen Botanicals",
    url: "/presets/anniversary-monstera.jpg",
  },
  {
    title: "Velvet Blossoms",
    url: "/presets/love-roses.jpg",
  },
];

export function StudioCompModal({ onClose, onSuccess }: StudioCompModalProps) {
  const [coverUrl, setCoverUrl] = useState(PRESET_COVERS[0].url);
  const [customCover, setCustomCover] = useState("");
  const [fontStyleId, setFontStyleId] = useState("hwDavid");
  const [printedGreeting, setPrintedGreeting] = useState("");
  const [handwrittenNote, setHandwrittenNote] = useState(
    "Dear Friend,\n\nSending our warmest wishes and warmest greetings from Aster & Blanche Press in Lake Forest. We are so honored to share our handcrafted stationery with you!\n\nWarmly,\nThe Atelier Team"
  );
  const [compReason, setCompReason] = useState("Studio VIP / Press");

  const [recipient, setRecipient] = useState<MailingAddress>({
    firstName: "",
    lastName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
  });

  const [returnAddress, setReturnAddress] = useState<MailingAddress>({
    firstName: "Aster & Blanche",
    lastName: "Press",
    street1: "1339 Lawrence Ave",
    street2: "Suite 2",
    city: "Lake Forest",
    state: "IL",
    zip: "60045",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCover = customCover.trim() || coverUrl;

    if (!finalCover) {
      setError("Please select or provide a card cover image.");
      return;
    }
    if (!recipient.firstName || !recipient.street1 || !recipient.city || !recipient.state || !recipient.zip) {
      setError("Please fill out complete recipient mailing address.");
      return;
    }
    if (!handwrittenNote.trim()) {
      setError("Please provide a handwritten message.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/dispatch-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontImageUrl: finalCover,
          printedMessage: printedGreeting,
          handwrittenNote,
          fontStyleId,
          recipientAddress: recipient,
          returnAddress,
          compReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to dispatch comp card.");
      } else {
        alert(`Studio Comp Card successfully dispatched to Handwrytten! Order: ${data.orderId}`);
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(`Error dispatching comp card: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-stone-200">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base text-stone-900">
                Dispatch Complimentary Studio Card
              </h3>
              <p className="text-xs text-stone-400">
                Bypass Stripe payment and send a physical card via Handwrytten on the house.
              </p>
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Cover Selection */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-2">
              1. Card Cover Selection
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {PRESET_COVERS.map((preset, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    setCoverUrl(preset.url);
                    setCustomCover("");
                  }}
                  className={`relative aspect-[4.25/5.5] rounded-xl overflow-hidden border-2 transition ${
                    coverUrl === preset.url && !customCover
                      ? "border-stone-900 shadow-md ring-2 ring-stone-900/20"
                      : "border-stone-200 opacity-70 hover:opacity-100"
                  }`}
                >
                  <Image
                    src={preset.url}
                    alt={preset.title}
                    fill
                    sizes="120px"
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-stone-900/70 p-1 text-[9px] text-white font-medium text-center truncate">
                    {preset.title}
                  </div>
                </button>
              ))}
            </div>
            <input
              type="url"
              value={customCover}
              onChange={(e) => setCustomCover(e.target.value)}
              placeholder="Or enter custom image URL (https://...)"
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
            />
          </div>

          {/* 2. Handwriting Font */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                2. Handwriting Font
              </label>
              <select
                value={fontStyleId}
                onChange={(e) => setFontStyleId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
              >
                <option value="hwDavid">Casual David (Default &bull; Natural Hand)</option>
                <option value="hwChase">Charming Chase (Flowing Script)</option>
                <option value="hwKate">Carefree Kate (Playful)</option>
                <option value="hwAdam">Executive Adam (Clean Print)</option>
                <option value="hwWill">Dapper Will (Refined Architect)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
                Comp Reason / Reference
              </label>
              <input
                type="text"
                value={compReason}
                onChange={(e) => setCompReason(e.target.value)}
                placeholder="e.g. VIP Influencer, Sample for mom"
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
          </div>

          {/* 3. Message */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-1">
              3. Inside Handwritten Note
            </label>
            <textarea
              rows={4}
              value={handwrittenNote}
              onChange={(e) => setHandwrittenNote(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-stone-500 font-mono leading-relaxed"
            />
          </div>

          {/* 4. Recipient Address */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase mb-2">
              4. Recipient Mailing Address
            </label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <input
                type="text"
                placeholder="First Name *"
                value={recipient.firstName}
                onChange={(e) => setRecipient({ ...recipient, firstName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl"
              />
              <input
                type="text"
                placeholder="Last Name"
                value={recipient.lastName}
                onChange={(e) => setRecipient({ ...recipient, lastName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Street Address *"
                value={recipient.street1}
                onChange={(e) => setRecipient({ ...recipient, street1: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl"
              />
              <div className="grid grid-cols-6 gap-2">
                <input
                  type="text"
                  placeholder="City *"
                  value={recipient.city}
                  onChange={(e) => setRecipient({ ...recipient, city: e.target.value })}
                  className="col-span-3 px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="State *"
                  maxLength={2}
                  value={recipient.state}
                  onChange={(e) => setRecipient({ ...recipient, state: e.target.value.toUpperCase() })}
                  className="col-span-1 px-2 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl text-center uppercase"
                />
                <input
                  type="text"
                  placeholder="ZIP *"
                  value={recipient.zip}
                  onChange={(e) => setRecipient({ ...recipient, zip: e.target.value })}
                  className="col-span-2 px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl font-mono"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-stone-500">
            <strong>Return Address:</strong> Aster & Blanche Press, 1339 Lawrence Ave, Lake Forest, IL 60045 &bull; Handwrytten Backplate ID: 751314
          </div>

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
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Send className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Dispatching to Plotter..." : "Dispatch Studio Card ($0.00)"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
