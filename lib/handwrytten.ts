import { HandwryttenOrderParams, HandwryttenOrderResult } from "./types";

/**
 * Handwrytten API v2 Client for robotic pen-on-paper card fulfillment.
 * Executes the 3-step pipeline:
 * 1. Upload custom Nano Banana cover image
 * 2. Create custom folded card with printed sentiment header
 * 3. Dispatch single-step robotic pen order with recipient & return addresses
 */
export async function fulfillHandwryttenOrder(
  params: HandwryttenOrderParams
): Promise<HandwryttenOrderResult> {
  const apiKey = process.env.HANDWRYTTEN_API_KEY;

  if (!apiKey) {
    console.log("[MOCK] Simulating Handwrytten Order Submission with robotic pen:", {
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
        cardType: "A2 Folded Custom Card (5x7 equivalent)",
        robotPenStatus: "queued_for_writing",
      },
    };
  }

  const headers = {
    Authorization: apiKey, // Handwrytten does NOT use "Bearer "
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    // 1. Upload the custom Nano Banana image
    const imgUploadRes = await fetch("https://api.handwrytten.com/v2/cards/uploadCustomImage", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_url: params.imageUrl,
        image_type: "cover",
      }),
    });

    if (!imgUploadRes.ok) {
      const errText = await imgUploadRes.text();
      console.error("[Handwrytten] Failed to upload custom image:", errText);
      return { success: false, error: `Image upload failed: ${errText}` };
    }

    const imgData = await imgUploadRes.json();
    const coverId = imgData.image_id;

    // 2. Create the custom card (Folded)
    // dimension_id 2 corresponds to Folded Portrait Card
    const cardRes = await fetch("https://api.handwrytten.com/v2/cards/createCustomCard", {
      method: "POST",
      headers,
      body: JSON.stringify({
        dimension_id: 2,
        cover_id: coverId,
        header_text: params.printedGreeting || "",
        header_align: "center",
        header_font_size: 16,
      }),
    });

    if (!cardRes.ok) {
      const errText = await cardRes.text();
      console.error("[Handwrytten] Failed to create custom card:", errText);
      return { success: false, error: `Card creation failed: ${errText}` };
    }

    const cardData = await cardRes.json();
    const customCardId = cardData.card_id;

    // 3. Dispatch the order
    const orderRes = await fetch("https://api.handwrytten.com/v2/orders/singleStepOrder", {
      method: "POST",
      headers,
      body: JSON.stringify({
        card_id: customCardId,
        font_id: params.fontId || "1",
        message: params.handwrittenMessage,
        recipient: {
          first_name: params.recipient.firstName,
          last_name: params.recipient.lastName,
          address1: params.recipient.street1,
          address2: params.recipient.street2 || "",
          city: params.recipient.city,
          state: params.recipient.state,
          zip: params.recipient.zip,
        },
        return_address: {
          first_name: params.returnAddress.firstName,
          last_name: params.returnAddress.lastName,
          address1: params.returnAddress.street1,
          address2: params.returnAddress.street2 || "",
          city: params.returnAddress.city,
          state: params.returnAddress.state,
          zip: params.returnAddress.zip,
        },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok || orderData.error) {
      console.error("[Handwrytten] Order dispatch error:", orderData);
      return {
        success: false,
        error: orderData.message || orderData.error || "Order dispatch failed",
        details: orderData,
      };
    }

    return {
      success: true,
      order_id: orderData.order_id || orderData.id || String(orderData.data?.order_id),
      details: orderData,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Handwrytten] Request exception:", message);
    return { success: false, error: message };
  }
}
