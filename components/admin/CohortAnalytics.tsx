"use client";

import React from "react";
import { PenTool, HeartHandshake, Sparkles, TrendingUp } from "lucide-react";
import { AdminMetrics } from "@/lib/types";

interface CohortAnalyticsProps {
  metrics: AdminMetrics | null;
}

export function CohortAnalytics({ metrics }: CohortAnalyticsProps) {
  if (!metrics) return null;

  const fontPopularity = metrics.fontPopularity || [
    { fontId: "hwDavid", fontName: "Casual David", count: 1, percentage: 100 },
  ];

  const occasionPopularity = metrics.occasionPopularity || [
    { occasion: "Birthday", count: 1, percentage: 100 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 1. Handwriting Font Adoption */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-indigo-600" />
              Handwriting Style Adoption
            </h3>
            <p className="text-xs text-stone-400">
              Customer preference across curated ballpoint pen scripts.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
            A/B Cohort
          </span>
        </div>

        {fontPopularity.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">No font orders recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {fontPopularity.map((f, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-stone-800 font-semibold">{f.fontName}</span>
                  <span className="text-stone-500 font-mono">
                    {f.count} orders ({f.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(f.percentage, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Occasion & Sentiment Demand */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <HeartHandshake className="w-4 h-4 text-amber-600" />
              Occasion &amp; Sentiment Popularity
            </h3>
            <p className="text-xs text-stone-400">
              Top card occasions driving physical inking orders.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            Occasion Mix
          </span>
        </div>

        {occasionPopularity.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">No occasion data recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {occasionPopularity.map((occ, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-stone-800 font-semibold">{occ.occasion}</span>
                  <span className="text-stone-500 font-mono">
                    {occ.count} ({occ.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(occ.percentage, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
