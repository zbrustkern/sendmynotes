import { resend } from "./resend";
import { Order, MailingAddress } from "@/lib/types";
import { calculateDeliveryEstimate } from "@/lib/delivery-estimate";

const SENDER_IDENTITY = "SendMyNotes Studio <orders@sendmynotes.com>";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNoteHtml(text: string): string {
  if (!text || !text.trim()) {
    return "<em>(Blank inside note)</em>";
  }
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

function formatAddressHtml(address?: Partial<MailingAddress> | null): string {
  if (!address) {
    return "<em>Mailing address pending</em>";
  }
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const street = [address.street1, address.street2].filter(Boolean).join(", ");
  const cityStateZip = `${address.city || ""}, ${address.state || ""} ${address.zip || ""}`.trim();
  const country = address.country && address.country !== "USA" && address.country !== "US" ? address.country : "";

  const lines = [name, street, cityStateZip, country].filter(Boolean);
  if (lines.length === 0) {
    return "<em>Mailing address pending</em>";
  }
  return lines.map((l) => escapeHtml(l)).join("<br/>");
}

function formatAddressText(address?: Partial<MailingAddress> | null): string {
  if (!address) return "Mailing address pending";
  const name = [address.firstName, address.lastName].filter(Boolean).join(" ");
  const street = [address.street1, address.street2].filter(Boolean).join(", ");
  const cityStateZip = `${address.city || ""}, ${address.state || ""} ${address.zip || ""}`.trim();
  const country = address.country && address.country !== "USA" && address.country !== "US" ? address.country : "";
  return [name, street, cityStateZip, country].filter(Boolean).join("\n");
}

function orderMailingDetails(order: Order) {
  const isInternational = Boolean(order.quote?.countryCode && order.quote.countryCode !== "US");
  const amountCents = order.quote?.totalCents ?? order.finalAmountInCents ?? order.amountInCents ?? 900;
  return {
    isInternational,
    formattedAmount: `$${(amountCents / 100).toFixed(2)}`,
    postageDescription: isInternational ? "international mailing" : "USPS First-Class postage",
    deliveryText: isInternational
      ? "Delivery timing varies by destination. Preparation and transit are separate."
      : "Typically 1–2 business days to prepare and 2–7 business days to deliver via USPS First-Class (postmarked from Phoenix, AZ).",
  };
}

export interface SendDeferredAddressReceiptParams {
  order: Order;
  customerEmail: string;
}

/**
 * Scenario A: Automated receipt sent when a user locks in their card without an address (`address_deferred === true`).
 * Confirms payment, displays the personal note text, and provides a direct magic link to complete the recipient address.
 */
export async function sendDeferredAddressReceiptEmail({
  order,
  customerEmail,
}: SendDeferredAddressReceiptParams): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!customerEmail || !customerEmail.includes("@")) {
    return { success: false, error: "Invalid customer email address" };
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com").replace(/\/$/, "");
  const orderId = order.id;
  const shortOrderId = orderId.replace(/^order_/, "").slice(0, 8).toUpperCase();
  const addressToken = order.viewToken || "";
  const completeAddressUrl = `${appUrl}/orders/${orderId}/complete-address?token=${encodeURIComponent(addressToken)}`;

  const recipientName =
    [order.recipientAddress?.firstName, order.recipientAddress?.lastName].filter(Boolean).join(" ").trim() ||
    (order as any).recipientName ||
    "your recipient";

  const noteText = order.handwrittenNote || order.printedMessage || "";
  const mailingDetails = orderMailingDetails(order);
  const formattedAmount = mailingDetails.formattedAmount;

  const subject = `Your card for ${recipientName} is reserved — add their mailing address whenever you're ready`;

  const textBody = `
SendMyNotes Studio — Order Confirmation & Receipt
=================================================
Receipt #${shortOrderId}
Total Paid: ${formattedAmount} (All-in, including real pen inking & ${mailingDetails.postageDescription})

Hello,

Thank you for your order! Your card for ${recipientName} is reserved and confirmed.

YOUR HANDWRITTEN NOTE:
-------------------------------------------------
${noteText || "(Blank inside note)"}
-------------------------------------------------

NEXT STEP — ADD MAILING ADDRESS:
Whenever you have ${recipientName}'s mailing address handy, click the secure link below to enter it:
${completeAddressUrl}

As soon as you add the address, our robotic pens will ink your words in real ballpoint pen and mail your card${mailingDetails.isInternational ? " internationally" : " via USPS First-Class Mail"}.

Order ID: ${orderId}

Warm regards,
SendMyNotes Studio
https://sendmynotes.com
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; -webkit-font-smoothing: antialiased; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 16px; max-width: 580px; margin: 0 auto; padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
    .brand-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #78716C; margin-bottom: 8px; }
    .title { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 700; color: #1C1917; margin: 0 0 16px 0; line-height: 1.3; }
    .badge-row { margin-bottom: 24px; }
    .badge { display: inline-block; background-color: #ECFDF5; color: #065F46; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .intro { font-size: 15px; line-height: 1.6; color: #44403C; margin: 16px 0; }
    .receipt-box { background-color: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 12px; padding: 18px 20px; margin: 24px 0; }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #57534E; }
    .receipt-total { display: flex; justify-content: space-between; border-top: 1px solid #E7E5E4; padding-top: 10px; margin-top: 10px; font-weight: 700; font-size: 16px; color: #1C1917; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #78716C; margin-top: 24px; margin-bottom: 8px; }
    .note-container { background: #FFFDF9; border: 1px dashed #D6CEC3; border-radius: 12px; padding: 20px 22px; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.65; color: #1C1917; margin-bottom: 24px; }
    .cta-container { text-align: center; margin: 32px 0 24px 0; }
    .cta-button { display: inline-block; background-color: #1C1917; color: #FFFFFF !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 12px; box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
    .step-guidance { background-color: #FEF3C7; border-left: 4px solid #D97706; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #78350F; line-height: 1.5; margin: 20px 0; }
    .footer { font-size: 12px; color: #A8A29E; text-align: center; margin-top: 32px; border-top: 1px solid #F5F0E6; padding-top: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-eyebrow">SendMyNotes Studio</div>
    <div class="badge-row">
      <span class="badge">Payment Confirmed • Card Reserved</span>
    </div>
    <h1 class="title">Your card for ${escapeHtml(recipientName)} is reserved</h1>
    
    <p class="intro">
      Thank you for your order! Your ${formattedAmount} payment has been received and your custom card is locked in.
    </p>

    <!-- Receipt Breakdown -->
    <div class="receipt-box">
      <div class="receipt-row">
        <span>Custom Folded A2 Card (Real Ballpoint Pen Inking)</span>
        <span>${formattedAmount}</span>
      </div>
      <div class="receipt-row">
        <span>${mailingDetails.isInternational ? "International Mailing" : "USPS First-Class Postage & Delivery"}</span>
        <span style="color: #059669; font-weight: 600;">Included</span>
      </div>
      <div class="receipt-total">
        <span>Total Paid</span>
        <span>${formattedAmount}</span>
      </div>
    </div>

    <!-- Note Preview -->
    <div class="section-label">Your Note (To Be Penned in Real Ink)</div>
    <div class="note-container">
      ${formatNoteHtml(noteText)}
    </div>

    <!-- Prominent Call to Action -->
    <div class="step-guidance">
      <strong>📮 Next Step:</strong> Whenever you're ready, add ${escapeHtml(recipientName)}'s mailing address using the button below. Once entered, our robotic pens will immediately write your note in real ink and dispatch your card.
    </div>

    <div class="cta-container">
      <a href="${escapeHtml(completeAddressUrl)}" class="cta-button">
        Add Mailing Address Whenever You're Ready &rarr;
      </a>
    </div>

    <div class="footer">
      Receipt #${escapeHtml(shortOrderId)} &bull; Order ID: <code>${escapeHtml(orderId)}</code><br/>
      SendMyNotes Studio &bull; Real pen handwritten cards, stamped & mailed for you.<br/>
      Need to make a change or have a question? Simply reply to this email.
    </div>
  </div>
</body>
</html>
`.trim();

  try {
    const res = await resend.emails.send({
      from: SENDER_IDENTITY,
      to: [customerEmail],
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (res.error) {
      console.error("[Email] Error dispatching Scenario A email via Resend:", res.error);
      return { success: false, error: res.error.message };
    }

    console.log(`[Email] Scenario A receipt email dispatched to ${customerEmail}. ID: ${res.data?.id}`);
    return { success: true, id: res.data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Email Exception] Failed to send Scenario A receipt:", msg);
    return { success: false, error: msg };
  }
}

export interface SendOrderPenningReceiptParams {
  order: Order;
  customerEmail: string;
}

/**
 * Scenario B: Automated receipt sent when an order has a completed address (`address_deferred === false` or address later completed).
 * Confirms $9.00 payment, recipient address, note text, and estimated USPS First-Class arrival.
 */
export async function sendOrderPenningReceiptEmail({
  order,
  customerEmail,
}: SendOrderPenningReceiptParams): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!customerEmail || !customerEmail.includes("@")) {
    return { success: false, error: "Invalid customer email address" };
  }

  const orderId = order.id;
  const shortOrderId = orderId.replace(/^order_/, "").slice(0, 8).toUpperCase();

  const recipientName =
    [order.recipientAddress?.firstName, order.recipientAddress?.lastName].filter(Boolean).join(" ").trim() ||
    (order as any).recipientName ||
    "your recipient";

  const noteText = order.handwrittenNote || order.printedMessage || "";
  const mailingDetails = orderMailingDetails(order);
  const formattedAmount = mailingDetails.formattedAmount;

  // Delivery timing calculation via canonical specifications
  const deliveryEstimate = calculateDeliveryEstimate(order.scheduledSendDate);
  const estimatedArrivalText = mailingDetails.isInternational ? "Varies by destination" : `${deliveryEstimate.formattedRange} (Estimated)`;

  const subject = `We're penning your card to ${recipientName}! (Receipt #${shortOrderId})`;

  const textBody = `
SendMyNotes Studio — Order Confirmation & Receipt
=================================================
Receipt #${shortOrderId}
Total Paid: ${formattedAmount} (All-in, including real ballpoint inking & ${mailingDetails.postageDescription})

Hello,

Good news! We are preparing your handwritten card for ${recipientName}.
Our robotic equipment is queuing your personal words to be written in real ballpoint pen ink.

ESTIMATED DELIVERY TIMING:
-------------------------------------------------
${mailingDetails.isInternational ? "Estimated Delivery" : "USPS First-Class Arrival"}: ${estimatedArrivalText}
Timing: ${mailingDetails.deliveryText}

MAILING TO:
-------------------------------------------------
${formatAddressText(order.recipientAddress)}

YOUR HANDWRITTEN NOTE:
-------------------------------------------------
${noteText || "(Blank inside note)"}
-------------------------------------------------

Order ID: ${orderId}

Warm regards,
SendMyNotes Studio
https://sendmynotes.com
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; -webkit-font-smoothing: antialiased; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 16px; max-width: 580px; margin: 0 auto; padding: 36px 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
    .brand-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #78716C; margin-bottom: 8px; }
    .title { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 700; color: #1C1917; margin: 0 0 16px 0; line-height: 1.3; }
    .badge-row { margin-bottom: 24px; }
    .badge { display: inline-block; background-color: #FEF3C7; color: #92400E; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .intro { font-size: 15px; line-height: 1.6; color: #44403C; margin: 16px 0; }
    .receipt-box { background-color: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 12px; padding: 18px 20px; margin: 24px 0; }
    .receipt-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #57534E; }
    .receipt-total { display: flex; justify-content: space-between; border-top: 1px solid #E7E5E4; padding-top: 10px; margin-top: 10px; font-weight: 700; font-size: 16px; color: #1C1917; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #78716C; margin-top: 24px; margin-bottom: 8px; }
    .delivery-box { background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 16px 18px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #1E3A8A; line-height: 1.5; }
    .delivery-range { font-size: 16px; font-weight: 700; color: #1E40AF; margin-bottom: 4px; }
    .address-box { background-color: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 10px; padding: 16px 18px; font-size: 14px; line-height: 1.6; color: #1C1917; margin-bottom: 20px; }
    .note-container { background: #FFFDF9; border: 1px dashed #D6CEC3; border-radius: 12px; padding: 20px 22px; font-family: Georgia, 'Times New Roman', serif; font-size: 15px; line-height: 1.65; color: #1C1917; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #A8A29E; text-align: center; margin-top: 32px; border-top: 1px solid #F5F0E6; padding-top: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-eyebrow">SendMyNotes Studio</div>
    <div class="badge-row">
      <span class="badge">In Studio Penning Queue</span>
    </div>
    <h1 class="title">We're penning your card to ${escapeHtml(recipientName)}!</h1>
    
    <p class="intro">
      Thank you for your order! Your ${formattedAmount} payment has been received and our robotic equipment is preparing to ink your card in real ballpoint pen.
    </p>

    <!-- Receipt Breakdown -->
    <div class="receipt-box">
      <div class="receipt-row">
        <span>Custom Folded A2 Card (Real Ballpoint Pen Inking)</span>
        <span>${formattedAmount}</span>
      </div>
      <div class="receipt-row">
        <span>${mailingDetails.isInternational ? "International Mailing" : "USPS First-Class Postage & Delivery"}</span>
        <span style="color: #059669; font-weight: 600;">Included</span>
      </div>
      <div class="receipt-total">
        <span>Total Paid</span>
        <span>${formattedAmount}</span>
      </div>
    </div>

    <!-- Estimated delivery -->
    <div class="delivery-box">
      <div class="delivery-range">📮 ${mailingDetails.isInternational ? "Estimated Delivery" : "Estimated USPS First-Class Arrival"}: ${escapeHtml(estimatedArrivalText)}</div>
      <div>${escapeHtml(mailingDetails.deliveryText)}</div>
    </div>

    <!-- Recipient Address -->
    <div class="section-label">Mailing Address</div>
    <div class="address-box">
      ${formatAddressHtml(order.recipientAddress)}
    </div>

    <!-- Note Preview -->
    <div class="section-label">Your Note (Being Inked in Real Ballpoint Pen)</div>
    <div class="note-container">
      ${formatNoteHtml(noteText)}
    </div>

    <div class="footer">
      Receipt #${escapeHtml(shortOrderId)} &bull; Order ID: <code>${escapeHtml(orderId)}</code><br/>
      SendMyNotes Studio &bull; Real pen handwritten cards, stamped & mailed for you.<br/>
      Need to make a change or have a question? Simply reply to this email.
    </div>
  </div>
</body>
</html>
`.trim();

  try {
    const res = await resend.emails.send({
      from: SENDER_IDENTITY,
      to: [customerEmail],
      subject,
      text: textBody,
      html: htmlBody,
    });

    if (res.error) {
      console.error("[Email] Error dispatching Scenario B email via Resend:", res.error);
      return { success: false, error: res.error.message };
    }

    console.log(`[Email] Scenario B receipt email dispatched to ${customerEmail}. ID: ${res.data?.id}`);
    return { success: true, id: res.data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Email Exception] Failed to send Scenario B receipt:", msg);
    return { success: false, error: msg };
  }
}
