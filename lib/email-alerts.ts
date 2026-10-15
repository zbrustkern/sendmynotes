import { SystemIncident } from "./types";

export interface SendAlertEmailParams {
  incident: SystemIncident;
  toEmail: string;
}

/**
 * Dispatches an automated incident alert email to the studio operator.
 * Supports Resend API (default modern standard) with zero extra npm dependencies,
 * and falls back cleanly to development console auditing if RESEND_API_KEY is not yet set.
 */
export async function sendIncidentAlertEmail({
  incident,
  toEmail,
}: SendAlertEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!toEmail || !toEmail.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com";
  const adminUrl = `${appUrl}/admin`;

  const subject = `🚨 [Aster & Blanche Alert] ${incident.type}: ${incident.summary}`;

  const textBody = `
Aster & Blanche System Incident Alert
=====================================
Type: ${incident.type}
Severity: ${incident.severity.toUpperCase()}
Incident ID: ${incident.id}
Time: ${new Date(incident.createdAt).toLocaleString()}

Summary:
${incident.summary}

Technical Details:
${incident.technicalDetails || "No additional technical details recorded."}

Resolve Incident:
${adminUrl}
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 12px; max-width: 600px; margin: 0 auto; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
    .header { border-bottom: 1px solid #EFEAE2; padding-bottom: 16px; margin-bottom: 24px; }
    .badge { display: inline-block; background-color: #FEE2E2; color: #991B1B; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .title { font-size: 20px; font-weight: 700; color: #1C1917; margin: 12px 0 6px 0; }
    .meta { font-size: 13px; color: #78716C; }
    .section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #57534E; margin-top: 24px; margin-bottom: 8px; }
    .summary-box { background-color: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 16px; font-size: 15px; font-weight: 500; color: #991B1B; border-radius: 4px; }
    pre { background-color: #1C1917; color: #E7E5E4; padding: 14px; border-radius: 8px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, Menlo, monospace; }
    .btn { display: inline-block; background-color: #D97706; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 24px; }
    .footer { font-size: 12px; color: #A8A29E; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="badge">${incident.severity} • ${incident.type}</span>
      <h1 class="title">Studio Incident Alert</h1>
      <div class="meta">ID: <code>${incident.id}</code> &bull; ${new Date(incident.createdAt).toLocaleString()}</div>
    </div>

    <div class="section-title">Incident Summary</div>
    <div class="summary-box">${escapeHtml(incident.summary)}</div>

    ${
      incident.technicalDetails
        ? `
      <div class="section-title">Technical Diagnostics</div>
      <pre>${escapeHtml(String(incident.technicalDetails))}</pre>
    `
        : ""
    }

    <a href="${adminUrl}" class="btn" style="color: #ffffff;">Open Admin Incident Feed &rarr;</a>
  </div>
  <div class="footer">
    Aster & Blanche Atelier Alerts &bull; Sent automatically from sendmynotes system monitor
  </div>
</body>
</html>
`.trim();

  // 1. Resend API Dispatch
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "alerts@sendmynotes.com";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Aster & Blanche Alerts <${fromEmail}>`,
          to: [toEmail],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("[Email Alert] Resend API error:", data);
        return { success: false, error: data.message || "Resend error" };
      }

      console.log(`[Email Alert] Sent successfully to ${toEmail} via Resend. ID: ${data.id}`);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Email Alert] Exception sending email:", msg);
      return { success: false, error: msg };
    }
  }

  // 2. Fallback: Log email ready in development/mock mode
  console.log(`[Email Alert Sim] (RESEND_API_KEY not configured) -> Would send to: ${toEmail}\nSubject: ${subject}\n${textBody}`);
  return {
    success: true,
    error: "RESEND_API_KEY not set in environment; alert logged to console.",
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface SendReminderEmailParams {
  toEmail: string;
  recipientName: string;
  occasionTitle: string;
  occasionDateFormatted: string;
  daysRemaining: number;
  sendCardUrl: string;
}

/**
 * Dispatches an automated, tasteful occasion milestone reminder email.
 */
export async function sendOccasionReminderEmail({
  toEmail,
  recipientName,
  occasionTitle,
  occasionDateFormatted,
  daysRemaining,
  sendCardUrl,
}: SendReminderEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!toEmail || !toEmail.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const subject = `💌 Reminder: ${occasionTitle} is in ${daysRemaining} days (${occasionDateFormatted})`;

  const textBody = `
SendMyNotes Occasion Reminder
=============================
Just a friendly heads-up: ${occasionTitle} is coming up on ${occasionDateFormatted} (in ${daysRemaining} days).

Physical cards written with real ballpoint pen ink typically take 1–2 business days to prepare and 2–7 business days to deliver via USPS First-Class. 
Sending your card now gives it plenty of time to arrive before the date!

Send a card now:
${sendCardUrl}

Warm regards,
SendMyNotes | sendmynotes.com
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 16px; max-width: 560px; margin: 0 auto; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
    .badge { display: inline-block; background-color: #FEF3C7; color: #92400E; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .title { font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #1C1917; margin: 14px 0 8px 0; }
    .content { font-size: 14px; line-height: 1.6; color: #57534E; margin: 16px 0; }
    .highlight-box { background-color: #FAF8F5; border-left: 3px solid #D97706; padding: 14px 18px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #44403C; }
    .btn { display: inline-block; background-color: #1C1917; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 12px; text-decoration: none; margin-top: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    .footer { font-size: 11px; color: #A8A29E; margin-top: 32px; border-top: 1px solid #F5F0E6; padding-top: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Milestone Reminder</span>
    <h1 class="title">${escapeHtml(occasionTitle)} is in ${daysRemaining} days</h1>
    
    <div class="content">
      <p>Hello,</p>
      <p>This is your friendly reminder that <strong>${escapeHtml(recipientName)}</strong> has a milestone coming up on <strong>${escapeHtml(occasionDateFormatted)}</strong>.</p>
      
      <div class="highlight-box">
        <strong>📮 Delivery Timing:</strong> Real ballpoint pen inking typically takes 1–2 business days, followed by 2–7 business days USPS First-Class transit. Sending your card this week gives it plenty of time to arrive before the big day.
      </div>
      
      <a href="${escapeHtml(sendCardUrl)}" class="btn">Pick a Card for ${escapeHtml(recipientName)} &rarr;</a>
    </div>

    <div class="footer">
      You are receiving this because you opted in to milestone reminders on <a href="https://sendmynotes.com" style="color: #78716C;">sendmynotes.com</a>.
      <br/>SendMyNotes &bull; Real pen handwritten cards, stamped & mailed for you.
    </div>
  </div>
</body>
</html>
`.trim();

  const resendApiKey =
    process.env.RESEND_API_KEY ||
    process.env["RESEND_API_KEY"] ||
    process.env["resend-api-key"];

  if (resendApiKey) {
    try {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "reminders@sendmynotes.com";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `SendMyNotes Reminders <${fromEmail}>`,
          to: [toEmail],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || "Resend error" };
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Development simulation
  console.log(`[Reminder Email Sim] (RESEND_API_KEY not configured) -> Would send reminder to: ${toEmail} for ${occasionTitle} (${occasionDateFormatted})`);
  return { success: true };
}

export interface SendAddressDeferredEmailParams {
  to: string;
  orderId: string;
  viewToken: string;
  recipientName: string;
}

/**
 * Dispatches an automated transactional email with a magic link to complete a deferred recipient address.
 */
export async function sendAddressDeferredEmail({
  to,
  orderId,
  viewToken,
  recipientName,
}: SendAddressDeferredEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!to || !to.includes("@")) {
    return { success: false, error: "Invalid recipient email address" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com";
  const completeUrl = `${appUrl}/orders/${orderId}/complete-address?token=${encodeURIComponent(viewToken)}`;

  const subject = `📬 Action needed: Add the mailing address for your card to ${recipientName}`;

  const textBody = `
SendMyNotes - Add Recipient Address
====================================
Your card for ${recipientName} is reserved and confirmed!

Whenever you're ready, simply click the secure link below to enter their street address. 
As soon as you enter it, our robotic pens will pen your handwritten note in real ballpoint ink and mail it via USPS First-Class.

Add address now:
${completeUrl}

Order ID: ${orderId}

Warm regards,
SendMyNotes Studio
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 16px; max-width: 560px; margin: 0 auto; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
    .badge { display: inline-block; background-color: #ECFDF5; color: #065F46; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .title { font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #1C1917; margin: 14px 0 8px 0; }
    .content { font-size: 14px; line-height: 1.6; color: #57534E; margin: 16px 0; }
    .highlight-box { background-color: #FAF8F5; border-left: 3px solid #059669; padding: 14px 18px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #44403C; }
    .btn { display: inline-block; background-color: #047857; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 12px; text-decoration: none; margin-top: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    .footer { font-size: 11px; color: #A8A29E; margin-top: 32px; border-top: 1px solid #F5F0E6; padding-top: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Order Confirmed</span>
    <h1 class="title">Your card for ${escapeHtml(recipientName)} is reserved</h1>
    
    <div class="content">
      <p>Hello,</p>
      <p>Thank you for your order! Your card and custom handwritten note for <strong>${escapeHtml(recipientName)}</strong> are locked in.</p>
      
      <div class="highlight-box">
        <strong>📮 Next Step:</strong> Whenever you have their mailing address handy, click the button below to add it. We&apos;ll immediately ink your card in real ballpoint pen and dispatch it via USPS First-Class Mail.
      </div>
      
      <a href="${escapeHtml(completeUrl)}" class="btn" style="color: #ffffff;">Add Recipient Address &rarr;</a>
    </div>

    <div class="footer">
      Order ID: <code>${escapeHtml(orderId)}</code>
      <br/>SendMyNotes &bull; Real ballpoint pen handwritten cards, stamped & mailed for you.
    </div>
  </div>
</body>
</html>
`.trim();

  const resendApiKey =
    process.env.RESEND_API_KEY ||
    process.env["RESEND_API_KEY"] ||
    process.env["resend-api-key"];

  if (resendApiKey) {
    try {
      const fromEmail =
        process.env.RESEND_FROM_EMAIL || "orders@sendmynotes.com";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `SendMyNotes <${fromEmail}>`,
          to: [to],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || "Resend error" };
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  console.log(`[Address Deferred Email Sim] (RESEND_API_KEY not configured) -> Would send magic link to: ${to} for order ${orderId}`);
  return { success: true };
}
