export const GOOGLE_ADS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18474411963";

/**
 * Fires a Google Ads Purchase conversion event with transaction deduplication.
 */
export function trackGoogleAdsPurchase(params: {
  orderId: string;
  amountInCents?: number;
  customerEmail?: string;
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
    const conversionLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;
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
  }
}
