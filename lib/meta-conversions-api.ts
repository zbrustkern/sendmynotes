import crypto from "crypto";
import { Order } from "./types";

export const META_PIXEL_ID =
  process.env.META_PIXEL_ID ||
  process.env.NEXT_PUBLIC_META_PIXEL_ID ||
  "1773518093991339";

export const META_GRAPH_API_VERSION = "v19.0";

/**
 * Retrieves the Conversions API System User access token from environment or secrets.
 */
export function getMetaAccessToken(): string | undefined {
  return (
    process.env.META_CONVERSIONS_API_ACCESS_TOKEN ||
    process.env["meta-conversions-api-access-token"] ||
    process.env.META_ACCESS_TOKEN ||
    undefined
  );
}

/**
 * Retrieves optional test event code for real-time verification in Meta Events Manager.
 */
export function getMetaTestEventCode(): string | undefined {
  return process.env.META_TEST_EVENT_CODE || undefined;
}

/**
 * Hash a string using SHA-256 as required by Meta Conversions API.
 */
export function hashSha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Standardize and hash an email address.
 */
export function hashEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return undefined;
  return hashSha256(normalized);
}

/**
 * Standardize and hash a phone number (digits only).
 */
export function hashPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  return hashSha256(digits);
}

/**
 * Standardize and hash first or last name.
 */
export function hashName(name?: string | null): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase().replace(/[\d\W_]+/g, "");
  if (!normalized) return undefined;
  return hashSha256(normalized);
}

/**
 * Standardize and hash city.
 */
export function hashCity(city?: string | null): string | undefined {
  if (!city) return undefined;
  const normalized = city.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return undefined;
  return hashSha256(normalized);
}

/**
 * Standardize and hash state (2-character lowercase code).
 */
export function hashState(state?: string | null): string | undefined {
  if (!state) return undefined;
  const normalized = state.trim().toLowerCase().slice(0, 2);
  if (!normalized) return undefined;
  return hashSha256(normalized);
}

/**
 * Standardize and hash postal/zip code (first 5 digits).
 */
export function hashZip(zip?: string | null): string | undefined {
  if (!zip) return undefined;
  const normalized = zip.trim().toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 5);
  if (!normalized) return undefined;
  return hashSha256(normalized);
}

/**
 * Standardize and hash country code (2-character lowercase ISO).
 */
export function hashCountry(country?: string | null): string | undefined {
  const norm = (country || "us").trim().toLowerCase().slice(0, 2);
  return hashSha256(norm);
}

export interface MetaCapiUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
  externalId?: string;
}

export interface MetaCapiCustomData {
  currency?: string;
  value?: number;
  content_name?: string;
  content_category?: string;
  content_type?: string;
  content_ids?: string[];
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
  order_id?: string;
  num_items?: number;
  [key: string]: unknown;
}

export interface MetaCapiEventPayload {
  event_name: string;
  event_time?: number; // Unix timestamp in seconds
  event_id: string; // Crucial for 1:1 deduplication with browser pixel
  event_source_url?: string;
  action_source: "website" | "app" | "physical_store" | "system_generated" | "other";
  user_data: MetaCapiUserData;
  custom_data?: MetaCapiCustomData;
  opt_out?: boolean;
}

export interface MetaCapiResult {
  success: boolean;
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Send one or more events to the Meta Conversions API.
 */
export async function sendMetaCapiEvents(
  events: MetaCapiEventPayload[],
  testEventCodeOverride?: string
): Promise<MetaCapiResult> {
  const token = getMetaAccessToken();
  const pixelId = META_PIXEL_ID;

  if (!token) {
    console.warn(
      "[Meta CAPI Notice] META_CONVERSIONS_API_ACCESS_TOKEN is not configured. Server-side event skipped safely."
    );
    return {
      success: false,
      skipped: true,
      error: "META_CONVERSIONS_API_ACCESS_TOKEN not configured",
    };
  }

  if (!pixelId) {
    return {
      success: false,
      skipped: true,
      error: "META_PIXEL_ID not configured",
    };
  }

  const testEventCode = testEventCodeOverride || getMetaTestEventCode();

  // Normalize user_data for each event
  const formattedEvents = events.map((event) => {
    const u = event.user_data;

    const formattedUserData: Record<string, unknown> = {};

    const emHash = hashEmail(u.email);
    if (emHash) formattedUserData.em = [emHash];

    const phHash = hashPhone(u.phone);
    if (phHash) formattedUserData.ph = [phHash];

    const fnHash = hashName(u.firstName);
    if (fnHash) formattedUserData.fn = [fnHash];

    const lnHash = hashName(u.lastName);
    if (lnHash) formattedUserData.ln = [lnHash];

    const ctHash = hashCity(u.city);
    if (ctHash) formattedUserData.ct = [ctHash];

    const stHash = hashState(u.state);
    if (stHash) formattedUserData.st = [stHash];

    const zpHash = hashZip(u.zip);
    if (zpHash) formattedUserData.zp = [zpHash];

    const countryHash = hashCountry(u.country);
    if (countryHash) formattedUserData.country = [countryHash];

    if (u.externalId) {
      formattedUserData.external_id = [hashSha256(u.externalId.trim())];
    }

    // Unhashed browser / network properties
    if (u.clientIpAddress) {
      formattedUserData.client_ip_address = u.clientIpAddress;
    }
    if (u.clientUserAgent) {
      formattedUserData.client_user_agent = u.clientUserAgent;
    }
    if (u.fbp) {
      formattedUserData.fbp = u.fbp;
    }
    if (u.fbc) {
      formattedUserData.fbc = u.fbc;
    }

    const singleEvent: Record<string, unknown> = {
      event_name: event.event_name,
      event_time: event.event_time || Math.floor(Date.now() / 1000),
      event_id: event.event_id,
      event_source_url: event.event_source_url || "https://sendmynotes.com",
      action_source: event.action_source || "website",
      user_data: formattedUserData,
      custom_data: event.custom_data || {},
    };

    if (event.opt_out) {
      singleEvent.opt_out = true;
      singleEvent.data_processing_options = ["LDU"];
      singleEvent.data_processing_options_country = 1;
      singleEvent.data_processing_options_state = 1000;
    }

    return singleEvent;
  });

  const requestBody: Record<string, unknown> = {
    data: formattedEvents,
  };

  if (testEventCode) {
    requestBody.test_event_code = testEventCode;
  }

  const endpoint = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(
    token
  )}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const resJson = await res.json();

    if (!res.ok) {
      const errMsg =
        resJson.error?.message ||
        `Meta Conversions API returned HTTP ${res.status}`;
      console.error("[Meta CAPI Error]", errMsg, resJson.error);
      return {
        success: false,
        error: errMsg,
        fbtraceId: resJson.error?.fbtrace_id,
      };
    }

    console.log(
      `[Meta CAPI Success] Dispatched ${formattedEvents.length} event(s) to Pixel ${pixelId}. Events received:`,
      resJson.events_received,
      testEventCode ? `(Test Code: ${testEventCode})` : ""
    );

    return {
      success: true,
      eventsReceived: resJson.events_received,
      fbtraceId: resJson.fbtrace_id,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown Meta CAPI network error";
    console.error("[Meta CAPI Exception]", errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Dispatches a server-side Purchase conversion event for a completed order.
 * Uses order.id as event_id for 1:1 deduplication with the browser Meta Pixel.
 */
export async function sendMetaCapiPurchaseEvent(params: {
  order: Order;
  clientIp?: string;
  userAgent?: string;
  testEventCode?: string;
}): Promise<MetaCapiResult> {
  const { order, clientIp, userAgent, testEventCode } = params;

  const valueInDollars =
    typeof order.amountInCents === "number" && order.amountInCents >= 0
      ? order.amountInCents / 100
      : 9.0;

  // Extract customer name
  const senderName = order.returnAddress?.firstName
    ? `${order.returnAddress.firstName} ${order.returnAddress.lastName || ""}`.trim()
    : undefined;
  const nameParts = senderName ? senderName.split(/\s+/) : [];
  const firstName = nameParts[0] || undefined;
  const lastName = nameParts.slice(1).join(" ") || undefined;

  // Resolve FBC: format standard string if fbclid is present
  let resolvedFbc = order.attribution?.fbc;
  if (!resolvedFbc && order.attribution?.fbclid) {
    resolvedFbc = `fb.1.${Date.now()}.${order.attribution.fbclid}`;
  }

  const isOptedOut = Boolean(
    order.attribution?.optOut || order.attribution?.gpc
  );

  // Payload minimization & privacy compliance:
  // Only purchaser/sender address fields (from returnAddress) are used for customer matching.
  // Recipient address information and card correspondence are strictly excluded from all advertising payloads.
  const userData: MetaCapiUserData = {
    email: order.customerEmail || undefined,
    firstName,
    lastName,
    city: order.returnAddress?.city,
    state: order.returnAddress?.state,
    zip: order.returnAddress?.zip,
    country: "us",
    clientIpAddress: clientIp || order.attribution?.clientIp,
    clientUserAgent: userAgent || order.attribution?.userAgent,
    fbp: order.attribution?.fbp,
    fbc: resolvedFbc,
    externalId: order.id,
  };

  const customData: MetaCapiCustomData = {
    currency: "USD",
    value: valueInDollars,
    content_name: order.occasion ? `${order.occasion} Card` : "Custom Handwritten Card",
    content_type: "product",
    content_ids: [order.id],
    contents: [
      {
        id: order.id,
        quantity: 1,
        item_price: valueInDollars,
      },
    ],
    order_id: order.id,
    num_items: 1,
  };

  return sendMetaCapiEvents(
    [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: order.id, // Exact match with browser pixel trackMetaPurchase { eventID: order.id }
        event_source_url: `https://sendmynotes.com/order/${order.id}`,
        action_source: "website",
        user_data: userData,
        custom_data: customData,
        opt_out: isOptedOut,
      },
    ],
    testEventCode
  );
}
