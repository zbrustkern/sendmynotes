import {
  getMetaAccessToken,
  getMetaTestEventCode,
  hashEmail,
  hashSha256,
  META_GRAPH_API_VERSION,
  META_PIXEL_ID,
} from "../meta-conversions-api";

export interface SendWeddingPurchaseConversionParams {
  batchId: string;
  capturedCents: number;
  count: number;
  buyerEmail?: string | null;
  attribution?: Record<string, unknown> | null;
  livemode: boolean;
  fetchImpl?: typeof fetch;
}

export interface SendWeddingPurchaseConversionResult {
  sent: boolean;
  reason?:
    | "staging_or_test_suppressed"
    | "consent_suppressed"
    | "invalid_payload"
    | "api_error"
    | "network_error";
  eventsReceived?: number;
  fbtraceId?: string;
  error?: string;
}

function isAttributionConsentRestricted(
  attribution?: Record<string, unknown> | null,
): boolean {
  if (!attribution || typeof attribution !== "object") return false;
  if (attribution.optOut === true || attribution.gpc === true) return true;
  const v2 = attribution.attributionV2;
  if (v2 && typeof v2 === "object") {
    const consentState = (v2 as Record<string, unknown>).consentState;
    if (consentState === "denied" || consentState === "gpc_restricted") {
      return true;
    }
  }
  return false;
}

function readStringField(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Dispatches a server-side Meta Conversions API Purchase event for a settled
 * live wedding batch, deduplicated via event_id = batchId.
 */
export async function sendWeddingPurchaseConversion(
  params: SendWeddingPurchaseConversionParams,
): Promise<SendWeddingPurchaseConversionResult> {
  if (process.env.STAGING_REVIEW_ONLY === "true" || !params.livemode) {
    return { sent: false, reason: "staging_or_test_suppressed" };
  }

  if (isAttributionConsentRestricted(params.attribution)) {
    return { sent: false, reason: "consent_suppressed" };
  }

  const token = getMetaAccessToken();
  const pixelId = META_PIXEL_ID;
  if (!token || !pixelId) {
    return { sent: false, reason: "staging_or_test_suppressed" };
  }

  if (
    !params.batchId ||
    !Number.isFinite(params.capturedCents) ||
    params.capturedCents < 0 ||
    !Number.isFinite(params.count) ||
    params.count <= 0
  ) {
    return { sent: false, reason: "invalid_payload" };
  }

  const value = Number((params.capturedCents / 100).toFixed(2));
  const userData: Record<string, unknown> = {
    external_id: [hashSha256(params.batchId)],
  };

  const emHash = hashEmail(params.buyerEmail);
  if (emHash) userData.em = [emHash];

  const fbp = readStringField(params.attribution, "fbp");
  if (fbp) userData.fbp = fbp;

  let fbc = readStringField(params.attribution, "fbc");
  if (!fbc) {
    const fbclid = readStringField(params.attribution, "fbclid");
    if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  if (fbc) userData.fbc = fbc;

  const clientIp = readStringField(params.attribution, "clientIp");
  if (clientIp) userData.client_ip_address = clientIp;

  const userAgent = readStringField(params.attribution, "userAgent");
  if (userAgent) userData.client_user_agent = userAgent;

  const unitPrice = Number((value / params.count).toFixed(2));
  const eventPayload = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: params.batchId,
    event_source_url: "https://sendmynotes.com/thank-you/wedding",
    action_source: "website",
    user_data: userData,
    custom_data: {
      currency: "USD",
      value,
      content_type: "product",
      content_name: "Wedding Thank-You Cards",
      content_ids: [params.batchId],
      contents: [
        {
          id: params.batchId,
          quantity: params.count,
          item_price: unitPrice,
        },
      ],
      order_id: params.batchId,
      num_items: params.count,
    },
  };

  const requestBody: Record<string, unknown> = {
    data: [eventPayload],
  };
  const testEventCode = getMetaTestEventCode();
  if (testEventCode) requestBody.test_event_code = testEventCode;

  const endpoint = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const fetcher = params.fetchImpl || fetch;

  try {
    const res = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const resJson = (await res.json().catch(() => ({}))) as {
      events_received?: number;
      fbtrace_id?: string;
      error?: { message?: string; fbtrace_id?: string };
    };
    if (!res.ok) {
      return {
        sent: false,
        reason: "api_error",
        fbtraceId: resJson.error?.fbtrace_id,
        error:
          resJson.error?.message ||
          `Meta Conversions API returned HTTP ${res.status}`,
      };
    }
    return {
      sent: true,
      eventsReceived: resJson.events_received,
      fbtraceId: resJson.fbtrace_id,
    };
  } catch (err) {
    return {
      sent: false,
      reason: "network_error",
      error: err instanceof Error ? err.message : "Unknown Meta CAPI error",
    };
  }
}
