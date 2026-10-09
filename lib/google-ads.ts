export const GOOGLE_TAG_ID =
  process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "GT-TNPN256B";

export const GOOGLE_ADS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18474411963";

export const GOOGLE_ADS_CONVERSION_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || "ZzzVCMqAjoUdELvPpOlE";

export const GA4_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "G-5DV25FZ7Q8";


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
  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    const value = params.amountInCents ? params.amountInCents / 100 : 9.0;
    win.gtag("event", "purchase", {
      transaction_id: params.orderId,
      value,
      currency: "USD",
      items: [
        {
          item_id: params.orderId,
          item_name: params.itemName || "Custom 5x7 Folded Handwritten Card",
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
  orderId: string;
  amountInCents?: number;
  customerEmail?: string;
  itemName?: string;
}): void {
  if (typeof window === "undefined") return;

  const convKey = `gads_conv_${params.orderId}`;
  if (sessionStorage.getItem(convKey)) {
    // Already tracked in this session to prevent duplicate attribution
    return;
  }
  sessionStorage.setItem(convKey, "true");

  const win = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof win.gtag === "function") {
    const conversionLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || GOOGLE_ADS_CONVERSION_LABEL;
    const sendTo = conversionLabel
      ? `${GOOGLE_ADS_ID}/${conversionLabel}`
      : GOOGLE_ADS_ID;

    // Set user data for Google Enhanced Conversions if customer email is available
    if (params.customerEmail && params.customerEmail.includes("@")) {
      win.gtag("set", "user_data", {
        email: params.customerEmail.trim().toLowerCase(),
      });
    }

    win.gtag("event", "conversion", {
      send_to: sendTo,
      value: params.amountInCents ? params.amountInCents / 100 : 9.0,
      currency: "USD",
      transaction_id: params.orderId,
    });

    console.log("[Google Ads] Purchase conversion event recorded for order:", params.orderId);

    // Also fire standard GA4 purchase
    trackGA4Purchase(params);
  }
}
