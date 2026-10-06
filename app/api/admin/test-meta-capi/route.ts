import { NextRequest, NextResponse } from "next/server";
import {
  META_PIXEL_ID,
  getMetaAccessToken,
  getMetaTestEventCode,
  sendMetaCapiEvents,
} from "@/lib/meta-conversions-api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const testCode = body.testEventCode || getMetaTestEventCode();
    const token = getMetaAccessToken();

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            "META_CONVERSIONS_API_ACCESS_TOKEN is not configured in your environment or Secret Manager.",
          pixelId: META_PIXEL_ID,
        },
        { status: 400 }
      );
    }

    const testOrderId = `test_${Date.now()}`;

    // Send a test Purchase event to verify end-to-end Meta CAPI connection
    const result = await sendMetaCapiEvents(
      [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: testOrderId,
          event_source_url: "https://sendmynotes.com/order/test-verification",
          action_source: "website",
          user_data: {
            email: "test_verification@sendmynotes.com",
            firstName: "Test",
            lastName: "Tester",
            city: "Lake Forest",
            state: "IL",
            zip: "60045",
            country: "us",
            clientIpAddress:
              req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
            clientUserAgent:
              req.headers.get("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          custom_data: {
            currency: "USD",
            value: 9.0,
            content_name: "Test Verification Card",
            content_type: "product",
            content_ids: [testOrderId],
            contents: [
              {
                id: testOrderId,
                quantity: 1,
                item_price: 9.0,
              },
            ],
            order_id: testOrderId,
            num_items: 1,
          },
        },
      ],
      testCode
    );

    return NextResponse.json({
      success: result.success,
      pixelId: META_PIXEL_ID,
      testEventCode: testCode || null,
      eventsReceived: result.eventsReceived,
      fbtraceId: result.fbtraceId,
      error: result.error,
      testOrderId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error testing Meta CAPI";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
