"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Mail, CheckCircle2, ArrowRight, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { US_STATES } from "@/components/v3/Step3EnvelopeAddressing";

function CompleteAddressPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderId = params?.id as string;
  const token = searchParams.get("token") || "";

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [street1, setStreet1] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    fetch(`/api/orders/${orderId}?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load your order. Please check your link.");
        return res.json();
      })
      .then((data) => {
        setOrder(data.order);
        if (data.order?.recipientAddress) {
          if (data.order.recipientAddress.street1 && data.order.recipientAddress.street1 !== "••••••••") {
            setStreet1(data.order.recipientAddress.street1);
          }
          if (data.order.recipientAddress.street2) {
            setStreet2(data.order.recipientAddress.street2);
          }
          if (data.order.recipientAddress.city) {
            setCity(data.order.recipientAddress.city);
          }
          if (data.order.recipientAddress.state) {
            setState(data.order.recipientAddress.state);
          }
          if (data.order.recipientAddress.zip && data.order.recipientAddress.zip !== "•••••") {
            setZip(data.order.recipientAddress.zip);
          }
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load order.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orderId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!street1.trim()) {
      setSubmitError("Please enter a street address.");
      return;
    }
    if (!city.trim()) {
      setSubmitError("Please enter a city.");
      return;
    }
    if (!state.trim()) {
      setSubmitError("Please select a state.");
      return;
    }
    if (!zip.trim() || zip.trim().length < 5) {
      setSubmitError("Please enter a valid 5-digit ZIP code.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/orders/${orderId}/complete-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          street1,
          street2,
          city,
          state,
          zip,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save address.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message || "Unable to save address. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const recipientFullName = order?.recipientAddress
    ? `${order.recipientAddress.firstName || ""} ${order.recipientAddress.lastName || ""}`.trim()
    : "Recipient";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6 text-stone-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-700" />
          <p className="text-xs uppercase tracking-widest font-semibold">Loading your card details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-stone-200 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-lg font-serif font-bold text-stone-900">Unable to Open Order</h1>
          <p className="text-xs text-stone-600 leading-relaxed">
            {error || "This link may have expired or requires a valid security token."}
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs font-semibold hover:bg-stone-800 transition"
          >
            Return to SendMyNotes Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 antialiased py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <header className="text-center space-y-2">
          <Link href="/" className="inline-block font-serif text-2xl font-bold tracking-tight text-stone-900">
            SendMyNotes
          </Link>
          <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/70 rounded-full px-3 py-1 w-fit mx-auto">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            <span>Card Reserved &bull; Ready to Pen &amp; Mail</span>
          </div>
        </header>

        {isSuccess ? (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm text-center space-y-4 animate-in fade-in">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-700">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-stone-900">
              Mailing Address Confirmed!
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-md mx-auto">
              Your card for <strong>{recipientFullName}</strong> is now in our production queue. Our robotic pens will ink your handwritten note in real ballpoint pen and mail it directly to their address via USPS First-Class.
            </p>
            <div className="pt-2">
              <Link
                href={`/order/${orderId}?token=${encodeURIComponent(token)}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-xl shadow-xs transition"
              >
                <span>Track Order Status</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
            {/* Card Summary Banner */}
            <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
              {order.frontImageUrl && (
                <div className="relative w-16 h-20 rounded-lg overflow-hidden shrink-0 border border-stone-200 shadow-2xs">
                  <Image
                    src={order.frontImageUrl}
                    alt="Card Cover"
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              )}
              <div className="min-w-0 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                  Sending To
                </span>
                <h3 className="font-serif text-base font-bold text-stone-900 truncate">
                  {recipientFullName}
                </h3>
                <p className="text-xs text-stone-500">
                  Written in real ballpoint ink &bull; Stamped &amp; mailed for you
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="font-serif text-xl font-bold text-stone-900">
                Where should we mail {recipientFullName}&apos;s card?
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed">
                Enter their street address below. We&apos;ll immediately dispatch your card to our robotic pens and post it via USPS First-Class.
              </p>
            </div>

            {submitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium animate-in fade-in flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="street1" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                  Street address
                </label>
                <input
                  id="street1"
                  type="text"
                  required
                  autoComplete="shipping address-line1"
                  placeholder="Street address (e.g. 456 Colorado Blvd)"
                  value={street1}
                  onChange={(e) => setStreet1(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="street2" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                  Apartment, Suite, Unit <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <input
                  id="street2"
                  type="text"
                  autoComplete="shipping address-line2"
                  placeholder="Apt, Suite, Unit"
                  value={street2}
                  onChange={(e) => setStreet2(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="city" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    required
                    autoComplete="shipping address-level2"
                    placeholder="City (e.g. Denver)"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="state" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                      State
                    </label>
                    <select
                      id="state"
                      required
                      autoComplete="shipping address-level1"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="zip" className="block text-xs font-semibold text-stone-700 mb-1 cursor-pointer">
                      ZIP Code
                    </label>
                    <input
                      id="zip"
                      type="text"
                      required
                      inputMode="numeric"
                      autoComplete="shipping postal-code"
                      placeholder="80206"
                      maxLength={10}
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-semibold rounded-xl text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving address &amp; queueing dispatch...</span>
                    </>
                  ) : (
                    <>
                      <span>Dispatch My Card to {recipientFullName} &rarr;</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        <footer className="text-center text-[11px] text-stone-400">
          SendMyNotes &bull; Real ballpoint pen handwritten cards, stamped &amp; mailed for you.
        </footer>
      </div>
    </div>
  );
}

export default function CompleteAddressPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="flex items-center gap-2 text-stone-600 font-medium text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Loading address confirmation...</span>
          </div>
        </div>
      }
    >
      <CompleteAddressPageContent />
    </React.Suspense>
  );
}

