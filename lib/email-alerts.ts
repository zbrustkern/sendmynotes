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
