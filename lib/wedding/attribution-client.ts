"use client";

import { getStoredAttribution } from "@/components/AttributionTracker";
import {
  GOOGLE_ADS_CONVERSION_LABEL,
  GOOGLE_ADS_ID,
} from "@/lib/google-ads";
import { resolveConsentState } from "@/lib/journey-identity";
import { trackMetaPurchase } from "@/lib/meta-ads";
import { trackEvent } from "@/lib/telemetry";

export type WeddingFunnelEventName =
  | "wedding_landing_viewed"
  | "wedding_project_started"
  | "wedding_sample_started"
  | "wedding_cover_saved"
  | "wedding_list_imported"
  | "wedding_checkout_started"
  | "wedding_purchase_completed"
  | "wedding_payment_confirmed";

const firedBrowserPurchases = new Set<string>();

export function trackWeddingFunnelEvent(
  eventName: WeddingFunnelEventName,
  payload?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    void trackEvent(eventName, undefined, payload);
  } catch {
    // Telemetry must never block wedding workflows.
  }
}

export function readWeddingAttributionPayload(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = getStoredAttribution();
    if (!stored || typeof stored !== "object") return null;
    return JSON.parse(JSON.stringify(stored)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function fireWeddingBrowserPurchase(params: {
  batchId: string;
  totalCents: number;
  count: number;
  stagingReviewOnly?: boolean;
}): { fired: boolean; reason?: string } {
  if (typeof window === "undefined") {
    return { fired: false, reason: "non_browser" };
  }
  if (
    params.stagingReviewOnly ||
    process.env.NEXT_PUBLIC_STAGING_REVIEW_ONLY === "true"
  ) {
    return { fired: false, reason: "staging_suppressed" };
  }
  if (
    !params.batchId ||
    !Number.isFinite(params.totalCents) ||
    params.totalCents <= 0 ||
    !Number.isFinite(params.count) ||
    params.count <= 0
  ) {
    return { fired: false, reason: "invalid_payload" };
  }

  const consentState = resolveConsentState();
  const stored = getStoredAttribution();
  if (
    consentState === "denied" ||
    consentState === "gpc_restricted" ||
    stored?.optOut === true ||
    stored?.gpc === true
  ) {
    return { fired: false, reason: "consent_suppressed" };
  }

  const storageKey = `smn_wedding_purchase_${params.batchId}`;
  if (firedBrowserPurchases.has(params.batchId)) {
    return { fired: false, reason: "duplicate_suppressed" };
  }
  try {
    if (window.sessionStorage?.getItem(storageKey) === "1") {
      return { fired: false, reason: "duplicate_suppressed" };
    }
  } catch {
    // Memory deduplication stays active if sessionStorage is restricted.
  }

  firedBrowserPurchases.add(params.batchId);
  try {
    window.sessionStorage?.setItem(storageKey, "1");
  } catch {
    // Ignore storage denial.
  }

  const value = Number((params.totalCents / 100).toFixed(2));
  const unitPrice = Number((value / params.count).toFixed(2));

  trackMetaPurchase({
    orderId: params.batchId,
    value,
    itemCount: params.count,
    currency: "USD",
    itemName: "Wedding Thank-You Cards",
    eventID: params.batchId,
  });

  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
      value,
      currency: "USD",
      transaction_id: params.batchId,
    });
    win.gtag("event", "purchase", {
      transaction_id: params.batchId,
      value,
      currency: "USD",
      items: [
        {
          item_id: params.batchId,
          item_name: "Wedding Thank-You Cards",
          price: unitPrice,
          quantity: params.count,
          item_category: "Handwritten Card",
        },
      ],
    });
  }

  return { fired: true };
}
