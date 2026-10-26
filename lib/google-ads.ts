export const GOOGLE_TAG_ID =
  process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "GT-TNPN256B";

export const GOOGLE_ADS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18474411963";

export const GOOGLE_ADS_CONVERSION_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || "RAmzCLzyvKodELvPpOlE";

export const GA4_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "G-5DV25FZ7Q8";

import { PurchaseMeasurementSnapshot } from "@/lib/types";

const checkoutKey = (orderId: string) => `smn_checkout_active_${orderId}`;
const adsKey = (orderId: string) => `smn_ads_purchase_${GOOGLE_ADS_ID}_${GOOGLE_ADS_CONVERSION_LABEL}_${orderId}`;
const gaKey = (orderId: string) => `smn_ga_purchase_${orderId}`;
const inFlight = new Set<string>();
const adsTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
const memorySent = new Set<string>();
const retryDelays = [1000, 2000, 4000, 8000, 15000];
const gaTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
const gaInFlight = new Set<string>();

function destinationAllowed(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "sendmynotes.com" || host === "www.sendmynotes.com";
}

function consentAllowed(consent?: { gpc?: boolean; optOut?: boolean }): boolean {
  const currentGpc = typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  return !consent?.gpc && !consent?.optOut && !currentGpc && destinationAllowed();
}

/** Mark only a checkout actively submitted in this tab. Storage denial is tolerated. */
export function markGoogleAdsCheckoutActive(orderId: string, viewToken?: string | null): void {
  if (typeof window === "undefined") return;
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  try { window.sessionStorage.setItem(checkoutKey(orderId), String(expiry)); } catch { /* memory fallback is the current tab */ }
  if (viewToken) {
    try { window.sessionStorage.setItem(`order_token_${orderId}`, viewToken); } catch { /* redirect attribution may not resume without storage */ }
  }
  activeCheckoutMemory.set(orderId, expiry);
}

export function clearGoogleAdsCheckoutActive(orderId: string): void {
  activeCheckoutMemory.delete(orderId);
  try { window.sessionStorage.removeItem(checkoutKey(orderId)); } catch { /* best effort */ }
}

const activeCheckoutMemory = new Map<string, number>();

export function hasGoogleAdsCheckoutProof(orderId: string): boolean {
  if (typeof window === "undefined") return false;
  const memoryExpiry = activeCheckoutMemory.get(orderId);
  if (memoryExpiry) {
    if (memoryExpiry > Date.now()) return true;
    activeCheckoutMemory.delete(orderId);
  }
  try {
    const expiresAt = Number(window.sessionStorage.getItem(checkoutKey(orderId)));
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
    if (expiresAt) window.sessionStorage.removeItem(checkoutKey(orderId));
  } catch { return false; }
  return false;
}

export function cancelGoogleAdsPurchaseRetries(orderId: string): void {
  const key = adsKey(orderId);
  (adsTimers.get(key) || []).forEach(clearTimeout);
  adsTimers.delete(key);
  const gaTimersForOrder = gaTimers.get(gaKey(orderId)) || [];
  gaTimersForOrder.forEach(clearTimeout);
  gaTimers.delete(gaKey(orderId));
  gaInFlight.delete(gaKey(orderId));
  inFlight.delete(key);
}


/**
 * Fires a standard GA4 view_item event
 */
export function trackGA4ViewItem(item: {
  itemId: string;
  itemName: string;
  price?: number;
  itemCategory?: string;
}): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", "view_item", {
      currency: "USD",
      value: item.price ?? 9.0,
      items: [
        {
          item_id: item.itemId,
          item_name: item.itemName,
          price: item.price ?? 9.0,
          item_category: item.itemCategory || "Handwritten Card",
        },
      ],
    });
  }
}

/**
 * Fires a standard GA4 begin_checkout event
 */
export function trackGA4BeginCheckout(item: {
  itemId: string;
  itemName: string;
  price?: number;
}): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", "begin_checkout", {
      currency: "USD",
      value: item.price ?? 9.0,
      items: [
        {
          item_id: item.itemId,
          item_name: item.itemName,
          price: item.price ?? 9.0,
          item_category: "Handwritten Card",
        },
      ],
    });
  }
}

/**
 * Fires a standard GA4 add_shipping_info event
 */
export function trackGA4AddShippingInfo(item: {
  itemId: string;
  itemName: string;
  price?: number;
  shippingTier?: string;
}): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", "add_shipping_info", {
      currency: "USD",
      value: item.price ?? 9.0,
      shipping_tier: item.shippingTier || "USPS First Class",
      items: [
        {
          item_id: item.itemId,
          item_name: item.itemName,
          price: item.price ?? 9.0,
          item_category: "Handwritten Card",
        },
      ],
    });
  }
}

/**
 * Fires a standard GA4 add_payment_info event
 */
export function trackGA4AddPaymentInfo(item: {
  itemId: string;
  itemName: string;
  price?: number;
  paymentType?: string;
}): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", "add_payment_info", {
      currency: "USD",
      value: item.price ?? 9.0,
      payment_type: item.paymentType || "card",
      items: [
        {
          item_id: item.itemId,
          item_name: item.itemName,
          price: item.price ?? 9.0,
          item_category: "Handwritten Card",
        },
      ],
    });
  }
}

/**
 * Fires a custom GA4 event (e.g. ai_cover_generated, handwriting_style_selected)
 */
export function trackGA4CustomEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    win.gtag("event", eventName, params || {});
  }
}

/**
 * Fires a standard GA4 purchase event
 */
export function trackGA4Purchase(params: {
  orderId: string;
  amountInCents?: number;
  itemName?: string;
}): void {
  if (typeof window === "undefined") return;
  if (!Number.isInteger(params.amountInCents) || (params.amountInCents as number) <= 0) return;
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    const value = (params.amountInCents as number) / 100;
    win.gtag("event", "purchase", {
      transaction_id: params.orderId,
      value,
      currency: "USD",
      items: [
        {
          item_id: params.orderId,
          item_name: params.itemName || "Custom Folded Handwritten Card",
          price: value,
          item_category: "Handwritten Card",
        },
      ],
    });
  }
}

/**
 * Fires a Google Ads Purchase conversion event with transaction deduplication.
 */
export function trackGoogleAdsPurchase(params: {
  measurement?: PurchaseMeasurementSnapshot;
  orderId: string;
  consent?: { gpc?: boolean; optOut?: boolean };
}): "queued" | "retrying" | "suppressed" | "not_observed" {
  if (typeof window === "undefined") return "not_observed";
  const measurement = params.measurement;
  if (!measurement || !measurement.eligible || measurement.transactionId !== params.orderId ||
      !Number.isInteger(measurement.amountInCents) || measurement.amountInCents <= 0 ||
      measurement.currency !== "USD" || !hasGoogleAdsCheckoutProof(params.orderId) ||
      !consentAllowed(params.consent)) {
    return "suppressed";
  }

  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  const key = adsKey(params.orderId);
  let alreadySent = memorySent.has(key);
  try { alreadySent ||= window.sessionStorage.getItem(key) === "sent"; } catch { /* in-memory dedup remains */ }
  // GA4 is independent and must resume even when Ads was already accepted in an earlier mount.
  queueGA4Purchase(params.orderId, measurement.amountInCents, params.consent, 0);
  if (alreadySent || inFlight.has(key)) return "suppressed";
  inFlight.add(key);

  const send = (attempt: number) => {
    if (!consentAllowed(params.consent) || !hasGoogleAdsCheckoutProof(params.orderId)) {
      inFlight.delete(key);
      return false;
    }
    try {
      if (typeof win.gtag !== "function") throw new Error("tag_unavailable");
      const sendTo = `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`;
      win.gtag("event", "conversion", {
        send_to: sendTo,
        value: measurement.amountInCents / 100,
        currency: measurement.currency,
        transaction_id: measurement.transactionId,
      });
      memorySent.add(key);
      try { window.sessionStorage.setItem(key, "sent"); } catch { /* Google transaction ID remains the cross-navigation dedup key */ }
      inFlight.delete(key);
      const timers = adsTimers.get(key) || [];
      timers.forEach(clearTimeout);
      adsTimers.delete(key);
      console.info("[Google Ads] Purchase queued");
      observeQueue(params.orderId, "google_ads", "queued");
      return true;
    } catch {
      if (attempt >= retryDelays.length) {
        inFlight.delete(key);
        console.info("[Google Ads] Purchase retry_exhausted");
        observeQueue(params.orderId, "google_ads", "retry_exhausted");
        return false;
      }
      const timer = setTimeout(() => send(attempt + 1), retryDelays[attempt]);
      adsTimers.set(key, [...(adsTimers.get(key) || []), timer]);
      return false;
    }
  };
  observeQueue(params.orderId, "google_ads", "retrying");
  return send(0) ? "queued" : "retrying";
}

function observeQueue(orderId: string, destination: "google_ads" | "ga4", state: "queued" | "retrying" | "retry_exhausted" | "suppressed"): void {
  void fetch("/api/telemetry/conversion-queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, destination, state, timestamp: Date.now() }),
    keepalive: true,
  }).catch(() => {});
}

function queueGA4Purchase(orderId: string, amountInCents: number, consent?: { gpc?: boolean; optOut?: boolean }, attempt = 0): void {
  const key = gaKey(orderId);
  if (memorySent.has(key)) return;
  try { if (window.sessionStorage.getItem(key) === "sent") return; } catch { /* memory fallback */ }
  if (attempt === 0) {
    if (gaInFlight.has(key)) return;
    gaInFlight.add(key);
  }
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (!consentAllowed(consent)) { gaInFlight.delete(key); observeQueue(orderId, "ga4", "suppressed"); return; }
  try {
    if (typeof win.gtag !== "function") throw new Error("tag_unavailable");
    win.gtag("event", "purchase", { transaction_id: orderId, value: amountInCents / 100, currency: "USD", items: [{ item_id: "sendmynotes-card", item_name: "Custom Folded Handwritten Card", price: amountInCents / 100, item_category: "Handwritten Card" }] });
    memorySent.add(key);
    gaInFlight.delete(key);
    (gaTimers.get(key) || []).forEach(clearTimeout);
    gaTimers.delete(key);
    try { window.sessionStorage.setItem(key, "sent"); } catch { /* best effort */ }
    observeQueue(orderId, "ga4", "queued");
  } catch { /* independent destination */ }
  if (!memorySent.has(key) && attempt < retryDelays.length) {
    if (attempt === 0) observeQueue(orderId, "ga4", "retrying");
    const timer = setTimeout(() => queueGA4Purchase(orderId, amountInCents, consent, attempt + 1), retryDelays[attempt]);
    gaTimers.set(key, [...(gaTimers.get(key) || []), timer]);
  } else if (!memorySent.has(key)) {
    gaInFlight.delete(key);
    observeQueue(orderId, "ga4", "retry_exhausted");
  }
}
