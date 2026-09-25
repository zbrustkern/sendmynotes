import fs from "fs";
import path from "path";
import { HandwryttenOrderParams, HandwryttenOrderResult } from "./types";
import { getSystemConfig, setSystemConfig } from "./firebase-admin";

const FONT_MAP: Record<string, string> = {
  "1": "Casual David",
  "2": "Charming Chase",
  "3": "Carefree Kate",
  "4": "Executive Adam",
  "5": "Dapper Will",
  "hwDavid": "Casual David",
  "hwChase": "Charming Chase",
  "hwKate": "Carefree Kate",
  "hwAdam": "Executive Adam",
  "hwWill": "Dapper Will",
  "hwCharity": "Casual David",
  "font-casual": "Casual David",
  "font-calligraphy": "Charming Chase",
  "font-classic": "Executive Adam",
};

/**
 * Ensures the Aster & Blanche Press backplate image is uploaded to Handwrytten.
 * Resolves from:
 * 1. Process environment (HANDWRYTTEN_BACKPLATE_IMAGE_ID)
 * 2. Firestore system settings (system_config/handwrytten)
 * 3. Uploading public/aster-blanche-backplate.png to Handwrytten and caching the ID.
 */
export async function getOrCreateBackplateImageId(apiKey: string): Promise<number | null> {
  // 1. Environment Variable check
  const envBackplateId = process.env.HANDWRYTTEN_BACKPLATE_IMAGE_ID;
  if (envBackplateId) {
    const parsed = parseInt(envBackplateId, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // 2. Firestore persistent system configuration check
  try {
    const config = await getSystemConfig<{ backplateImageId?: number }>("handwrytten");
    if (config?.backplateImageId) {
      return config.backplateImageId;
    }
  } catch (err) {
    console.warn("[Handwrytten] Failed to read backplate ID from Firestore config:", err);
  }

  // 3. Upload backplate image asset
  try {
    const backplatePath = path.join(process.cwd(), "public", "aster-blanche-backplate.png");
    if (!fs.existsSync(backplatePath)) {
      console.warn("[Handwrytten] Backplate PNG asset missing at:", backplatePath);
      return null;
    }

    console.log("[Handwrytten] Uploading Aster & Blanche Press backplate to Handwrytten...");
    const fileBytes = fs.readFileSync(backplatePath);
    const formData = new FormData();
    const blob = new Blob([fileBytes], { type: "image/png" });
    formData.append("file", blob, "aster-blanche-backplate.png");
    formData.append("type", "logo"); // Handwrytten accepts 'logo' or 'cover' for custom card art uploads

    const res = await fetch("https://api.handwrytten.com/v2/cards/uploadCustomLogo", {
      method: "POST",
      headers: { Authorization: apiKey },
      body: formData,
    });

    const data = await res.json();
    if (res.ok && data.status === "ok" && data.id) {
      const backplateId = Number(data.id);
      console.log(`[Handwrytten] Backplate uploaded successfully. Image ID: ${backplateId}`);

      // Persist in Firestore for subsequent runs
      try {
        await setSystemConfig("handwrytten", {
          backplateImageId: backplateId,
          updatedAt: Date.now(),
        });
      } catch (saveErr) {
        console.warn("[Handwrytten] Failed to cache backplate ID in Firestore:", saveErr);
      }

      return backplateId;
    } else {
      console.error("[Handwrytten] Backplate upload failed:", data);
      return null;
    }
  } catch (err) {
    console.error("[Handwrytten] Exception uploading backplate:", err);
    return null;
  }
}

/**
 * Handwrytten API v2 Client for real ink card fulfillment.
 * Executes the 3-step pipeline:
 * 1. Upload custom cover image via /cards/uploadCustomLogo
 * 2. Upload/Retrieve Aster & Blanche backplate
 * 3. Create custom folded portrait card (dimension_id: 4, cover_id, back_id, header_text)
 * 4. Dispatch singleStepOrder with flat recipient & sender fields
 */
export async function fulfillHandwryttenOrder(
  params: HandwryttenOrderParams
): Promise<HandwryttenOrderResult> {
  const apiKey =
    process.env.HANDWRYTTEN_API_KEY || process.env["handwrytten-api-key"];

  if (!apiKey) {
    console.log("[MOCK] Simulating Handwrytten Order Submission with real ink pen:", {
      recipient: `${params.recipient.firstName} ${params.recipient.lastName}, ${params.recipient.city}, ${params.recipient.state}`,
      returnAddress: `${params.returnAddress.firstName} ${params.returnAddress.lastName}, ${params.returnAddress.city}, ${params.returnAddress.state}`,
      fontId: params.fontId || "1",
      hasPrintedGreeting: !!params.printedGreeting,
      handwrittenLength: params.handwrittenMessage.length,
    });
    return {
      success: true,
      order_id: `mock_hw_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      details: {
        mode: "mock_simulation",
        cardType: "A2 Folded Portrait Custom Card (5x7 equivalent)",
        robotPenStatus: "queued_for_writing",
      },
    };
  }

  try {
    // 1. Fetch cover image bytes and upload via uploadCustomLogo
    let imgBuffer: ArrayBuffer;
    let mimeType = "image/jpeg";
    let fileName = "cover.jpg";

    if (params.imageUrl.startsWith("data:")) {
      console.log("[Handwrytten] Extracting cover image from base64 data URI...");
      const matches = params.imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches[2]) {
        mimeType = matches[1] || "image/jpeg";
        fileName = mimeType.includes("png") ? "cover.png" : "cover.jpg";
        const buffer = Buffer.from(matches[2], "base64");
        imgBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      } else {
        throw new Error("Invalid base64 data URI for card cover art");
      }
    } else if (params.imageUrl.startsWith("/") && !params.imageUrl.startsWith("//")) {
      // Local public asset (e.g. /presets/birthday-balloons.jpg)
      const localFilePath = path.join(process.cwd(), "public", params.imageUrl);
      if (fs.existsSync(localFilePath)) {
        console.log("[Handwrytten] Reading cover image from local public directory:", localFilePath);
        const fileBuffer = fs.readFileSync(localFilePath);
        imgBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
        mimeType = localFilePath.endsWith(".png") ? "image/png" : "image/jpeg";
        fileName = path.basename(localFilePath);
      } else {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com";
        const fullUrl = `${baseUrl.replace(/\/$/, "")}${params.imageUrl}`;
        console.log("[Handwrytten] Fetching cover image from reconstructed URL:", fullUrl);
        const imgRes = await fetch(fullUrl);
        if (!imgRes.ok) {
          throw new Error(`Failed to download cover image (${imgRes.status}): ${imgRes.statusText}`);
        }
        imgBuffer = await imgRes.arrayBuffer();
      }
    } else {
      console.log("[Handwrytten] Fetching cover image from URL:", params.imageUrl);
      const imgRes = await fetch(params.imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to download cover image (${imgRes.status}): ${imgRes.statusText}`);
      }
      imgBuffer = await imgRes.arrayBuffer();
    }

    const formData = new FormData();
    const blob = new Blob([imgBuffer], { type: mimeType });
    formData.append("file", blob, fileName);
    formData.append("type", "cover");

    console.log("[Handwrytten] Uploading cover image to /v2/cards/uploadCustomLogo...");
    const uploadRes = await fetch("https://api.handwrytten.com/v2/cards/uploadCustomLogo", {
      method: "POST",
      headers: {
        Authorization: apiKey,
      },
      body: formData,
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || uploadData.status !== "ok" || !uploadData.id) {
      console.error("[Handwrytten] Image upload failed:", uploadData);
      return {
        success: false,
        error: uploadData.message || "Failed to upload custom card cover to Handwrytten",
        details: uploadData,
      };
    }

    const coverId = uploadData.id;
    console.log(`[Handwrytten] Cover uploaded successfully. Cover ID: ${coverId}`);

    // 2. Resolve Aster & Blanche backplate ID
    const backId = await getOrCreateBackplateImageId(apiKey);
    console.log(`[Handwrytten] Using backplate ID: ${backId || "(none)"}`);

    // 3. Create Custom Folded Portrait Card (dimension_id: 4, A2 Folded Portrait)
    // Note: Handwrytten expects back_type: "logo" and back_logo_id for backplates
    console.log("[Handwrytten] Creating custom card via /v2/cards/createCustomCard...");
    const cardPayload: Record<string, unknown> = {
      dimension_id: 4, // A2 Folded Portrait (4.25 x 5.5)
      name: `SendMyNotes-${Date.now()}`,
      back_type: "logo",
      cover_id: coverId,
      ...(backId ? { back_logo_id: backId } : {}),
    };

    const cardRes = await fetch("https://api.handwrytten.com/v2/cards/createCustomCard", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(cardPayload),
    });

    const cardData = await cardRes.json();
    if (!cardRes.ok || cardData.status !== "ok" || !cardData.card_id) {
      console.error("[Handwrytten] Card creation failed:", cardData);
      return {
        success: false,
        error: cardData.message || "Failed to create custom card in Handwrytten",
        details: cardData,
      };
    }

    const customCardId = cardData.card_id;
    console.log(`[Handwrytten] Custom card created. Card ID: ${customCardId}`);

    // 3. Dispatch Single-Step Order with real ink
    const fontLabel = FONT_MAP[params.fontId || "1"] || "Executive Adam";
    console.log(`[Handwrytten] Dispatching singleStepOrder with font "${fontLabel}"...`);

    // Combine printed greeting and handwritten message so everything is written in genuine pen ink
    // This avoids Handwrytten's rigid 0.75" single-line Arial header clipping
    const fullMessage = params.printedGreeting?.trim()
      ? `${params.printedGreeting.trim()}\n\n${params.handwrittenMessage.trim()}`
      : params.handwrittenMessage.trim();

    const isTestMode = process.env.HANDWRYTTEN_TEST_MODE === "true";

    const orderRes = await fetch("https://api.handwrytten.com/v2/orders/singleStepOrder", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        card_id: customCardId,
        font_label: fontLabel,
        message: fullMessage,
        ...(isTestMode ? { test_mode: 1 } : {}),
        ...(params.scheduledSendDate ? { date_send: params.scheduledSendDate } : {}),
        recipient_first_name: (params.recipient.firstName || "Friend").trim(),
        recipient_last_name: (params.recipient.lastName || "").trim(),
        recipient_address1: params.recipient.street1.trim(),
        recipient_address2: (params.recipient.street2 || "").trim(),
        recipient_city: params.recipient.city.trim(),
        recipient_state: params.recipient.state.trim().toUpperCase(),
        recipient_zip: params.recipient.zip.trim(),
        sender_first_name: (params.returnAddress.firstName || "Aster & Blanche").trim(),
        sender_last_name: (params.returnAddress.lastName || "Press").trim(),
        sender_address1: params.returnAddress.street1.trim(),
        sender_address2: (params.returnAddress.street2 || "").trim(),
        sender_city: params.returnAddress.city.trim(),
        sender_state: params.returnAddress.state.trim().toUpperCase(),
        sender_zip: params.returnAddress.zip.trim(),
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok || orderData.status === "error" || !orderData.order_id) {
      console.error("[Handwrytten] Order dispatch error:", orderData);
      return {
        success: false,
        error: orderData.message || "Order dispatch to Handwrytten failed",
        details: orderData,
      };
    }

    console.log(`[Handwrytten] Order successfully submitted! HW Order ID: ${orderData.order_id}`);
    return {
      success: true,
      order_id: String(orderData.order_id),
      details: orderData,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Handwrytten] Request exception:", message);
    return { success: false, error: message };
  }
}

export interface HandwryttenStatusResult {
  success: boolean;
  status?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  dateSent?: string;
  raw?: unknown;
  error?: string;
}

/**
 * Queries live status from Handwrytten API v2 via /orders/view
 */
export async function fetchHandwryttenOrderStatus(
  orderId: string
): Promise<HandwryttenStatusResult> {
  const apiKey =
    process.env.HANDWRYTTEN_API_KEY || process.env["handwrytten-api-key"];

  if (!apiKey || orderId.startsWith("mock_hw_")) {
    return {
      success: true,
      status: "processing",
      raw: { mode: "mock" },
    };
  }

  try {
    const res = await fetch(
      `https://api.handwrytten.com/v2/orders/view?order_id=${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: apiKey,
          Accept: "application/json",
        },
      }
    );

    const data = await res.json();
    if (!res.ok || data.status === "error") {
      return {
        success: false,
        error: data.message || `Failed to fetch order status (${res.status})`,
      };
    }

    const orderData = data.order || data.data || data;
    const status =
      orderData.status || orderData.order_status || data.order_status || "processing";
    const trackingNumber =
      orderData.tracking_number || orderData.tracking || null;
    const trackingUrl = orderData.tracking_url || null;
    const dateSent =
      orderData.date_sent || orderData.mailed_date || orderData.completed_at || null;

    return {
      success: true,
      status: String(status),
      trackingNumber: trackingNumber ? String(trackingNumber) : undefined,
      trackingUrl: trackingUrl ? String(trackingUrl) : undefined,
      dateSent: dateSent ? String(dateSent) : undefined,
      raw: data,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

