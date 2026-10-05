export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "1773518093991339";

export interface MetaUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

/**
 * Safe invocation of window.fbq for client-side execution.
 */
function callFbq(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  const win = window as unknown as { fbq?: (...params: unknown[]) => void };
  if (typeof win.fbq === "function") {
    win.fbq(...args);
  }
}

/**
 * Configure user properties for Meta Advanced Matching.
 * Helps Meta match conversion events with high confidence, improving ROAS.
 */
export function setMetaUserData(userData: MetaUserData): void {
  if (typeof window === "undefined") return;
  const normalized: Record<string, string> = {};

  if (userData.email && userData.email.includes("@")) {
    normalized.em = userData.email.trim().toLowerCase();
  }
  if (userData.firstName) {
    normalized.fn = userData.firstName.trim().toLowerCase();
  }
  if (userData.lastName) {
    normalized.ln = userData.lastName.trim().toLowerCase();
  }
  if (userData.phone) {
    normalized.ph = userData.phone.replace(/[^0-9]/g, "");
  }
  if (userData.city) {
    normalized.ct = userData.city.trim().toLowerCase().replace(/[^a-z]/g, "");
  }
  if (userData.state) {
    normalized.st = userData.state.trim().toLowerCase().slice(0, 2);
  }
  if (userData.zip) {
    normalized.zp = userData.zip.trim().slice(0, 5);
  }
  if (userData.country) {
    normalized.country = userData.country.trim().toLowerCase().slice(0, 2);
  }

  if (Object.keys(normalized).length > 0) {
    callFbq("setUserProperties", normalized);
  }
}

/**
 * Fires a standard Meta PageView event.
 */
export function trackMetaPageView(): void {
  callFbq("track", "PageView");
}

/**
 * Fires a standard Meta ViewContent event (viewing a card or preset).
 */
export function trackMetaViewContent(params: {
  contentName: string;
  contentCategory?: string;
  contentId?: string;
  value?: number;
  currency?: string;
}): void {
  callFbq("track", "ViewContent", {
    content_name: params.contentName,
    content_category: params.contentCategory || "Handwritten Card",
    content_ids: params.contentId ? [params.contentId] : undefined,
    content_type: "product",
    value: params.value ?? 9.0,
    currency: params.currency || "USD",
  });
}

/**
 * Fires a standard Meta CustomizeProduct event (composing message or generating AI art).
 */
export function trackMetaCustomizeProduct(params: {
  customizationType: string;
  occasion?: string;
  contentName?: string;
}): void {
  callFbq("track", "CustomizeProduct", {
    content_name: params.contentName || params.customizationType,
    content_category: params.occasion || "Handwritten Card",
  });
}

/**
 * Fires a standard Meta InitiateCheckout event (reaching the address entry step).
 */
export function trackMetaInitiateCheckout(params: {
  contentName?: string;
  contentId?: string;
  value?: number;
  numItems?: number;
}): void {
  callFbq("track", "InitiateCheckout", {
    content_name: params.contentName || "Handwritten Greeting Card",
    content_ids: params.contentId ? [params.contentId] : undefined,
    content_type: "product",
    value: params.value ?? 9.0,
    currency: "USD",
    num_items: params.numItems ?? 1,
  });
}

/**
 * Fires a standard Meta AddPaymentInfo event (reaching payment method selection).
 */
export function trackMetaAddPaymentInfo(params: {
  contentName?: string;
  value?: number;
  paymentType?: string;
}): void {
  callFbq("track", "AddPaymentInfo", {
    content_name: params.contentName || "Handwritten Greeting Card",
    content_category: params.paymentType || "card",
    value: params.value ?? 9.0,
    currency: "USD",
  });
}

/**
 * Fires a standard Meta Purchase event with session-based deduplication and eventID.
 */
export function trackMetaPurchase(params: {
  orderId: string;
  value?: number;
  customerEmail?: string;
  customerName?: string;
  recipientCity?: string;
  recipientState?: string;
  recipientZip?: string;
  itemName?: string;
}): void {
  if (typeof window === "undefined") return;

  const convKey = `meta_conv_${params.orderId}`;
  if (sessionStorage.getItem(convKey)) {
    // Already tracked in this session to prevent duplicate attribution
    return;
  }
  sessionStorage.setItem(convKey, "true");

  // Advanced Matching enrichment
  if (params.customerEmail) {
    const parts = (params.customerName || "").trim().split(/\s+/);
    setMetaUserData({
      email: params.customerEmail,
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      city: params.recipientCity,
      state: params.recipientState,
      zip: params.recipientZip,
      country: "us",
    });
  }

  const purchaseValue = params.value ?? 9.0;

  callFbq(
    "track",
    "Purchase",
    {
      value: purchaseValue,
      currency: "USD",
      content_name: params.itemName || "Custom 5x7 Folded Handwritten Card",
      content_type: "product",
      content_ids: [params.orderId],
      num_items: 1,
    },
    { eventID: params.orderId } // Enables 1:1 deduplication with Conversions API (CAPI)
  );

  console.log("[Meta Pixel] Purchase conversion event recorded for order:", params.orderId);
}
