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
  externalId?: string;
}

export interface MetaContentItem {
  id: string;
  quantity: number;
  item_price?: number;
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
 * Read a Meta first-party cookie (_fbp or _fbc) set by Pixel or script.
 */
export function getMetaBrowserCookie(name: "_fbp" | "_fbc"): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Construct or retrieve the standard _fbc cookie string:
 * Format: fb.1.{creationTimeInMs}.{fbclid}
 */
export function buildMetaFbcString(fbclid?: string): string | null {
  if (!fbclid && typeof window !== "undefined") {
    const existing = getMetaBrowserCookie("_fbc");
    if (existing) return existing;
    const urlParams = new URLSearchParams(window.location.search);
    fbclid = urlParams.get("fbclid") || undefined;
  }
  if (!fbclid) return null;
  return `fb.1.${Date.now()}.${fbclid}`;
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
  if (userData.externalId) {
    normalized.external_id = userData.externalId.trim();
  }

  if (Object.keys(normalized).length > 0) {
    callFbq("setUserProperties", normalized);
  }
}

/**
 * Fires a standard Meta PageView event.
 */
export function trackMetaPageView(eventID?: string): void {
  if (eventID) {
    callFbq("track", "PageView", {}, { eventID });
  } else {
    callFbq("track", "PageView");
  }
}

/**
 * Fires a standard Meta ViewContent event (viewing a card, scenario, or preset).
 */
export function trackMetaViewContent(params: {
  contentName: string;
  contentCategory?: string;
  contentId?: string;
  value?: number;
  currency?: string;
  eventID?: string;
}): void {
  const value = params.value ?? 9.0;
  const currency = params.currency || "USD";
  const contentIds = params.contentId ? [params.contentId] : undefined;

  const payload: Record<string, unknown> = {
    content_name: params.contentName,
    content_category: params.contentCategory || "Handwritten Card",
    content_type: "product",
    value,
    currency,
  };

  if (contentIds) {
    payload.content_ids = contentIds;
    payload.contents = [{ id: params.contentId!, quantity: 1, item_price: value }];
  }

  if (params.eventID) {
    callFbq("track", "ViewContent", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "ViewContent", payload);
  }
}

/**
 * Fires a standard Meta AddToCart event (choosing a card to personalize).
 */
export function trackMetaAddToCart(params: {
  contentName: string;
  contentCategory?: string;
  contentId?: string;
  value?: number;
  currency?: string;
  eventID?: string;
}): void {
  const value = params.value ?? 9.0;
  const currency = params.currency || "USD";
  const contentIds = params.contentId ? [params.contentId] : undefined;

  const payload: Record<string, unknown> = {
    content_name: params.contentName,
    content_category: params.contentCategory || "Handwritten Card",
    content_type: "product",
    value,
    currency,
  };

  if (contentIds) {
    payload.content_ids = contentIds;
    payload.contents = [{ id: params.contentId!, quantity: 1, item_price: value }];
  }

  if (params.eventID) {
    callFbq("track", "AddToCart", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "AddToCart", payload);
  }
}

/**
 * Fires a standard Meta CustomizeProduct event (composing message or generating AI art).
 */
export function trackMetaCustomizeProduct(params: {
  customizationType: string;
  occasion?: string;
  contentName?: string;
  value?: number;
  currency?: string;
  eventID?: string;
}): void {
  const payload: Record<string, unknown> = {
    content_name: params.contentName || params.customizationType,
    content_category: params.occasion || "Handwritten Card",
    value: params.value ?? 9.0,
    currency: params.currency || "USD",
  };

  if (params.eventID) {
    callFbq("track", "CustomizeProduct", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "CustomizeProduct", payload);
  }
}

/**
 * Fires a standard Meta InitiateCheckout event (reaching the address entry step).
 */
export function trackMetaInitiateCheckout(params: {
  contentName?: string;
  contentCategory?: string;
  contentId?: string;
  value?: number;
  numItems?: number;
  currency?: string;
  eventID?: string;
}): void {
  const value = params.value ?? 9.0;
  const currency = params.currency || "USD";
  const contentIds = params.contentId ? [params.contentId] : undefined;

  const payload: Record<string, unknown> = {
    content_name: params.contentName || "Handwritten Greeting Card",
    content_category: params.contentCategory || "Handwritten Card",
    content_type: "product",
    value,
    currency,
    num_items: params.numItems ?? 1,
  };

  if (contentIds) {
    payload.content_ids = contentIds;
    payload.contents = [{ id: params.contentId!, quantity: 1, item_price: value }];
  }

  if (params.eventID) {
    callFbq("track", "InitiateCheckout", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "InitiateCheckout", payload);
  }
}

/**
 * Fires a standard Meta AddPaymentInfo event (reaching payment method selection).
 */
export function trackMetaAddPaymentInfo(params: {
  contentName?: string;
  contentCategory?: string;
  value?: number;
  paymentType?: string;
  currency?: string;
  eventID?: string;
}): void {
  const payload: Record<string, unknown> = {
    content_name: params.contentName || "Handwritten Greeting Card",
    content_category: params.paymentType || "card",
    value: params.value ?? 9.0,
    currency: params.currency || "USD",
  };

  if (params.eventID) {
    callFbq("track", "AddPaymentInfo", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "AddPaymentInfo", payload);
  }
}

/**
 * Fires a standard Meta Purchase event with session-based deduplication and eventID.
 * The eventID is passed to enable 1:1 deduplication with Meta Conversions API (CAPI).
 */
export function trackMetaPurchase(params: {
  orderId: string;
  value?: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  recipientCity?: string;
  recipientState?: string;
  recipientZip?: string;
  itemName?: string;
  eventID?: string;
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
      externalId: params.orderId,
    });
  }

  const purchaseValue = params.value ?? 9.0;
  const currency = params.currency || "USD";
  const eventId = params.eventID || params.orderId;

  callFbq(
    "track",
    "Purchase",
    {
      value: purchaseValue,
      currency,
      content_name: params.itemName || "Custom 5x7 Folded Handwritten Card",
      content_type: "product",
      content_ids: [params.orderId],
      contents: [
        {
          id: params.orderId,
          quantity: 1,
          item_price: purchaseValue,
        },
      ],
      num_items: 1,
    },
    { eventID: eventId } // Enables 1:1 deduplication with Conversions API (CAPI)
  );

  console.log("[Meta Pixel] Purchase conversion event recorded for order:", params.orderId, "with eventID:", eventId);
}

/**
 * Fires a standard Meta Lead event (for email captures or reminder opt-ins).
 */
export function trackMetaLead(params: {
  contentName?: string;
  value?: number;
  currency?: string;
  eventID?: string;
}): void {
  const payload: Record<string, unknown> = {
    content_name: params.contentName || "Occasion Reminder Opt-In",
    value: params.value ?? 0,
    currency: params.currency || "USD",
  };

  if (params.eventID) {
    callFbq("track", "Lead", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "Lead", payload);
  }
}

/**
 * Fires a standard Meta Search event (for searching or filtering cards).
 */
export function trackMetaSearch(params: {
  searchString: string;
  contentCategory?: string;
  eventID?: string;
}): void {
  const payload: Record<string, unknown> = {
    search_string: params.searchString,
    content_category: params.contentCategory,
  };

  if (params.eventID) {
    callFbq("track", "Search", payload, { eventID: params.eventID });
  } else {
    callFbq("track", "Search", payload);
  }
}

/**
 * Fires a custom Meta event.
 */
export function trackMetaCustomEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventID?: string
): void {
  if (eventID) {
    callFbq("trackCustom", eventName, params || {}, { eventID });
  } else {
    callFbq("trackCustom", eventName, params || {});
  }
}
