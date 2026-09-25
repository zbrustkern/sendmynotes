"use client";

import React, { useEffect, useState } from "react";
import { PenTool, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";

interface HandwryttenAccountData {
  connected: boolean;
  isTestMode: boolean;
  backplateImageId: number | null;
  credits: number | null;
  cardsRemaining: number | null;
  lowBalanceWarning: boolean;
  accountEmail: string | null;
  modeLabel: string;
}

export function HandwryttenStatusWidget() {
  const [data, setData] = useState<HandwryttenAccountData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/handwrytten-balance");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Error fetching Handwrytten balance:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  if (!data) return null;

  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          data.isTestMode ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
        }`}>
          <PenTool className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-stone-900">Handwrytten Fulfillment API</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                data.isTestMode
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-emerald-50 text-emerald-800 border-emerald-300"
              }`}
            >
              {data.isTestMode ? "Test Mode (Zero Cost)" : "Live Production Inking"}
            </span>
            {data.backplateImageId && (
              <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Backplate ID: {data.backplateImageId}
              </span>
            )}
          </div>
          <p className="text-[11px] text-stone-500 mt-0.5">
            {data.isTestMode
              ? "Orders generate digital proofs without deducting credits or plotting physical envelopes."
              : "Orders are physically penned by robotic arms on 100 lb cardstock and dispatched via USPS."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 self-end md:self-auto">
        {data.credits !== null ? (
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-xs font-semibold text-stone-500">Credits:</span>
              <span className="font-serif font-bold text-stone-900 text-sm">
                ${data.credits.toFixed(2)}
              </span>
              {data.cardsRemaining !== null && (
                <span className="text-[11px] text-stone-400">
                  (~{data.cardsRemaining} cards)
                </span>
              )}
            </div>
            {data.lowBalanceWarning && (
              <p className="text-[10px] text-rose-600 font-semibold flex items-center gap-1 justify-end">
                <AlertTriangle className="w-3 h-3" /> Low Balance Alert
              </p>
            )}
          </div>
        ) : (
          <div className="text-right">
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
              Card on File Active
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={fetchBalance}
          disabled={loading}
          className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition cursor-pointer"
          title="Refresh Handwrytten Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        <a
          href="https://app.handwrytten.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1 bg-stone-100 hover:bg-stone-200 px-2.5 py-1.5 rounded-lg transition"
        >
          <span>Portal</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
