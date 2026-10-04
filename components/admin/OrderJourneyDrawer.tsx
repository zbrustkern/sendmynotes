"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Globe,
  MapPin,
  TrendingUp,
  DollarSign,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Eye,
  PenTool,
  Mail,
  ShieldCheck,
  Tag,
  Sparkles,
} from "lucide-react";
import { Order } from "@/lib/types";

interface OrderJourneyDrawerProps {
  order: Order;
  onInspectProof?: (orderId: string) => void;
  onRetryAddress?: (order: Order) => void;
}

export function OrderJourneyDrawer({
  order,
  onInspectProof,
  onRetryAddress,
}: OrderJourneyDrawerProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (fieldKey: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const attr = order.attribution;
  const isGoogleAds = Boolean(attr?.gclid || attr?.utmSource === "google" || attr?.utmMedium === "cpc");
  const channelName = isGoogleAds
    ? "Google Ads"
    : attr?.utmMedium === "organic"
    ? "Organic Search"
    : attr?.utmMedium === "social"
    ? "Social Media"
    : attr?.utmSource || "Direct / Organic";

  // Financial unit calculation
  const grossDollars = (order.amountInCents || 900) / 100;
  const stripeFeeDollars = Number((grossDollars * 0.029 + 0.3).toFixed(2));
  const handwryttenCogs = 4.88;
  const netMarginDollars = Number((grossDollars - stripeFeeDollars - handwryttenCogs).toFixed(2));
  const marginPercent = grossDollars > 0 ? Math.round((netMarginDollars / grossDollars) * 100) : 0;

  return (
    <div className="bg-stone-50/70 border-t border-b border-stone-200 p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
            360° Customer Journey
          </span>
          <span className="text-xs font-semibold text-stone-700">
            Order #{order.id}
          </span>
          {order.customerEmail && (
            <span className="text-xs text-stone-500 font-mono">
              ({order.customerEmail})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onInspectProof && (
            <button
              type="button"
              onClick={() => onInspectProof(order.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-xs font-semibold text-stone-700 shadow-2xs transition"
            >
              <Eye className="w-3.5 h-3.5 text-amber-600" />
              <span>Inspect Proof</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 COLUMNS OF DETAILED JOURNEY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. MARKETING ATTRIBUTION & AD TRACKING */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-600" />
              Ad &amp; Marketing Origin
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isGoogleAds
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : "bg-stone-100 text-stone-700 border border-stone-200"
              }`}
            >
              {channelName}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[10px] text-stone-400 block font-medium">Campaign</span>
              <p className="font-semibold text-stone-800 truncate" title={attr?.utmCampaign}>
                {attr?.utmCampaign || "Direct Entry"}
              </p>
            </div>

            {attr?.gclid && (
              <div>
                <span className="text-[10px] text-stone-400 block font-medium">Google Click ID (GCLID)</span>
                <div className="flex items-center justify-between gap-1 bg-stone-50 p-1.5 rounded-lg border border-stone-200/60 font-mono text-[10px] text-stone-600">
                  <span className="truncate max-w-[130px]">{attr.gclid}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("gclid", attr.gclid!)}
                    className="text-stone-400 hover:text-stone-700 p-0.5"
                    title="Copy GCLID"
                  >
                    {copiedField === "gclid" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}

            {attr?.googleClientId && (
              <div>
                <span className="text-[10px] text-stone-400 block font-medium">GA4 Client ID</span>
                <div className="flex items-center justify-between gap-1 bg-stone-50 p-1.5 rounded-lg border border-stone-200/60 font-mono text-[10px] text-stone-600">
                  <span className="truncate max-w-[130px]">{attr.googleClientId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy("gaId", attr.googleClientId!)}
                    className="text-stone-400 hover:text-stone-700 p-0.5"
                    title="Copy GA4 ID"
                  >
                    {copiedField === "gaId" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <span className="text-[10px] text-stone-400 block font-medium">Landing Page</span>
              <span className="text-stone-600 font-mono text-[11px] truncate block" title={attr?.landingPath}>
                {attr?.landingPath || "/"}
              </span>
            </div>
          </div>
        </div>

        {/* 2. CREATIVE CHOICES & CARD MESSAGE */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Card Creative &amp; Note
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 capitalize">
              {order.occasion || "Greeting"}
            </span>
          </div>

          <div className="flex gap-3 items-start">
            {order.frontImageUrl && (
              <div className="relative w-14 h-20 bg-stone-100 rounded-lg overflow-hidden border border-stone-200 shrink-0">
                <Image
                  src={order.frontImageUrl}
                  alt="Card Cover"
                  fill
                  sizes="60px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}

            <div className="space-y-1 text-xs min-w-0 flex-1">
              <span className="text-[10px] text-stone-400 block font-medium">Handwriting Style</span>
              <p className="font-semibold text-stone-800 text-xs">
                {order.fontStyleId || "hwDavid"}
              </p>
              {order.printedMessage && (
                <p className="text-[10px] text-stone-500 italic truncate" title={order.printedMessage}>
                  &ldquo;{order.printedMessage}&rdquo;
                </p>
              )}
            </div>
          </div>

          {order.handwrittenNote && (
            <div className="bg-amber-50/40 p-2.5 rounded-xl border border-amber-200/50 text-[11px] text-stone-700 max-h-24 overflow-y-auto leading-relaxed whitespace-pre-wrap font-serif">
              {order.handwrittenNote}
            </div>
          )}
        </div>

        {/* 3. UNIT FINANCIALS & MARGINS */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              Order Financials
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                netMarginDollars > 0
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              +{marginPercent}% Margin
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-stone-600">
              <span>Customer Paid</span>
              <span className="font-bold text-stone-900">${grossDollars.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span>Stripe Processing</span>
              <span className="text-rose-600">-${stripeFeeDollars.toFixed(2)}</span>
            </div>

            <div className="flex items-center justify-between text-stone-500 text-[11px]">
              <span>Handwrytten Pen COGS</span>
              <span className="text-indigo-600">-${handwryttenCogs.toFixed(2)}</span>
            </div>

            {order.discountCode && (
              <div className="flex items-center justify-between text-amber-700 text-[11px]">
                <span>Discount ({order.discountCode})</span>
                <span>-${((order.discountAmountInCents || 0) / 100).toFixed(2)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-stone-100 flex items-center justify-between font-bold">
              <span className="text-stone-800">Net Studio Margin</span>
              <span className="text-emerald-700 text-sm">
                +${netMarginDollars.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 4. PHYSICAL FULFILLMENT & POSTAL DISPATCH */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-stone-600" />
              Physical Dispatch
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                order.status === "MAILED"
                  ? "bg-purple-50 text-purple-800 border border-purple-200"
                  : order.status === "PROCESSING_HANDWRYTTEN" || order.status === "DISPATCHING"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : order.status === "QUEUED_FOR_FULFILLMENT" || order.status === "PAYMENT_RECEIVED"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}
            >
              {order.status}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {order.handwryttenOrderId ? (
              <div className="flex items-center justify-between bg-stone-50 p-2 rounded-xl border border-stone-200">
                <div>
                  <span className="text-[10px] text-stone-400 block font-medium">Handwrytten ID</span>
                  <span className="font-mono font-bold text-stone-900 text-xs">#{order.handwryttenOrderId}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 font-semibold uppercase">
                  {order.handwryttenStatus || "Writing"}
                </span>
              </div>
            ) : (
              <div className="bg-amber-50 p-2 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                Pending dispatch to robot pen queue
              </div>
            )}

            <div>
              <span className="text-[10px] text-stone-400 block font-medium">Delivery Destination</span>
              <p className="font-semibold text-stone-800 text-xs">
                {order.recipientAddress?.firstName} {order.recipientAddress?.lastName}
              </p>
              <p className="text-[11px] text-stone-600 truncate">
                {order.recipientAddress?.city}, {order.recipientAddress?.state} {order.recipientAddress?.zip}
              </p>
            </div>

            <div className="flex items-center gap-1 text-[11px] text-stone-500 pt-1">
              <Mail className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>USPS First Class Mail</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
