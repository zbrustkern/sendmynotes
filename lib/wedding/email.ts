import { firestoreDb } from "../firebase-admin";
import { resend } from "../email/resend";

export interface WeddingEmailPayload {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export type WeddingEmailSender = (
  payload: WeddingEmailPayload,
) => Promise<{ data?: { id?: string | null } | null; error?: { message?: string } | null }>;

export interface WeddingEmailDeps {
  db?: FirebaseFirestore.Firestore;
  now?: () => number;
  sendEmail?: WeddingEmailSender;
  appUrl?: string;
}

export interface WeddingConfirmationEmailData {
  batchId: string;
  buyerEmail: string;
  cardCount: number;
  internationalCount: number;
  totalCents: number;
  recoveryUrl: string;
}

export function escapeWeddingEmailHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildWeddingConfirmationEmailContent(
  input: WeddingConfirmationEmailData,
): { subject: string; text: string; html: string } {
  const shortBatchId = input.batchId.replace(/^wb_/, "").slice(0, 8).toUpperCase();
  const cardLabel = `${input.cardCount} ${input.cardCount === 1 ? "card" : "cards"}`;
  const formattedTotal = `$${(input.totalCents / 100).toFixed(2)}`;
  const intlLine =
    input.internationalCount > 0
      ? `Includes ${input.internationalCount} international ${input.internationalCount === 1 ? "destination" : "destinations"} (international delivery timing varies by destination).`
      : "All cards are addressed to United States destinations.";

  const subject = `SendMyNotes Order Confirmed — ${cardLabel} (#${shortBatchId})`;

  const text = [
    "SendMyNotes — Wedding Thank-You Order Confirmation",
    "==================================================",
    `Order Reference: #${shortBatchId} (${input.batchId})`,
    `Cards Ordered: ${cardLabel}`,
    `Total Paid: ${formattedTotal} USD`,
    intlLine,
    "",
    "What happens next:",
    "- Each card is written with real pens, stamped, and mailed for you.",
    "- Preparation typically takes 1-2 business days, followed by 2-7 business days domestic transit via USPS First-Class (postmarked from Phoenix, AZ).",
    input.internationalCount > 0
      ? "- International delivery timing varies by destination."
      : "",
    "",
    "Track your batch or return to your wedding thank-you list:",
    input.recoveryUrl,
    "",
    "Thank you for trusting SendMyNotes with your notes.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const safeBatch = escapeWeddingEmailHtml(shortBatchId);
  const safeFullId = escapeWeddingEmailHtml(input.batchId);
  const safeCardLabel = escapeWeddingEmailHtml(cardLabel);
  const safeTotal = escapeWeddingEmailHtml(formattedTotal);
  const safeIntl = escapeWeddingEmailHtml(intlLine);
  const safeUrl = escapeWeddingEmailHtml(input.recoveryUrl);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F5; margin: 0; padding: 24px; color: #2D2823; }
    .card { background: #FFFFFF; border: 1px solid #E6E0D6; border-radius: 16px; max-width: 560px; margin: 0 auto; padding: 32px; }
    .badge { display: inline-block; background-color: #ECFDF5; color: #065F46; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; }
    .title { font-family: Georgia, serif; font-size: 22px; font-weight: 700; color: #1C1917; margin: 14px 0 8px 0; }
    .summary { background-color: #FAF8F5; border: 1px solid #EFEAE2; border-radius: 12px; padding: 16px; margin: 18px 0; font-size: 14px; line-height: 1.6; }
    .timing { background-color: #F7FAF8; border-left: 3px solid #1E4D3B; padding: 14px 16px; border-radius: 8px; margin: 18px 0; font-size: 14px; line-height: 1.55; color: #2D2823; }
    .btn { display: inline-block; background-color: #1E4D3B; color: #FFFFFF; font-weight: 600; font-size: 14px; padding: 12px 22px; border-radius: 10px; text-decoration: none; margin-top: 8px; }
    .footer { font-size: 12px; color: #78716C; margin-top: 28px; border-top: 1px solid #F0ECE4; padding-top: 16px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Order Confirmed</span>
    <h1 class="title">Your wedding thank-you batch is confirmed</h1>
    <p style="font-size: 14px; color: #57534E; line-height: 1.6;">
      We received your payment and locked in your cards. Each card will be written with real pens, stamped, and mailed for you.
    </p>
    <div class="summary">
      <div><strong>Order Reference:</strong> #${safeBatch} <span style="color: #78716C; font-size: 12px;">(${safeFullId})</span></div>
      <div><strong>Cards Ordered:</strong> ${safeCardLabel}</div>
      <div><strong>Total Paid:</strong> ${safeTotal} USD</div>
      <div style="margin-top: 6px; color: #57534E;">${safeIntl}</div>
    </div>
    <div class="timing">
      <strong>Preparation &amp; Delivery Timing:</strong><br />
      Preparation typically takes 1–2 business days, followed by 2–7 business days domestic transit via USPS First-Class (postmarked from Phoenix, AZ).${
        input.internationalCount > 0
          ? " International delivery timing varies by destination."
          : ""
      }
    </div>
    <a href="${safeUrl}" class="btn" style="color: #ffffff;">Open Wedding Portal &amp; Tracker &rarr;</a>
    <div class="footer">
      SendMyNotes &bull; Real pen handwritten cards, stamped &amp; mailed for you.
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

const defaultSendEmail: WeddingEmailSender = async (payload) =>
  (await resend.emails.send(payload as never)) as unknown as {
    data?: { id?: string | null } | null;
    error?: { message?: string } | null;
  };

export async function sendWeddingBatchConfirmationEmail(
  batchId: string,
  deps: WeddingEmailDeps = {},
): Promise<{ sent: boolean; skipped?: string; id?: string; error?: string }> {
  const db = deps.db || firestoreDb;
  const now = deps.now || Date.now;
  const batchRef = db.collection("weddingBatches").doc(batchId);

  const initialSnap = await batchRef.get();
  const initial = initialSnap.data() as
    | {
        id?: string;
        status?: string;
        buyerEmail?: string | null;
        capturedCents?: number;
        confirmationEmailSentAt?: number | null;
        quote?: { count?: number; totalCents?: number; lines?: Array<{ country?: string }> };
      }
    | undefined;

  if (!initial || initial.status !== "held") {
    return { sent: false, skipped: "batch_not_settled" };
  }
  const buyerEmail = typeof initial.buyerEmail === "string" ? initial.buyerEmail.trim() : "";
  if (!buyerEmail || !buyerEmail.includes("@")) {
    return { sent: false, skipped: "missing_buyer_email" };
  }
  if (initial.confirmationEmailSentAt) {
    return { sent: false, skipped: "already_sent" };
  }

  // Skip cleanly when Resend is disabled or in staging/test unless an explicit sender is injected.
  if (!deps.sendEmail) {
    if (process.env.STAGING_REVIEW_ONLY === "true") {
      return { sent: false, skipped: "staging_review_only" };
    }
    const hasKey = Boolean(
      process.env.RESEND_API_KEY ||
        process.env["resend-key"] ||
        process.env["resend-api-key"],
    );
    if (process.env.NODE_ENV === "test" || !hasKey) {
      return { sent: false, skipped: "resend_unavailable" };
    }
  }

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(batchRef);
    const current = snap.data() as
      | {
          confirmationEmailSentAt?: number | null;
          confirmationEmailStatus?: string;
          buyerEmail?: string | null;
        }
      | undefined;
    if (!current || current.confirmationEmailSentAt || current.confirmationEmailStatus === "sending") {
      return false;
    }
    tx.update(batchRef, {
      confirmationEmailStatus: "sending",
      confirmationEmailAttemptedAt: now(),
    });
    return true;
  });

  if (!claimed) {
    return { sent: false, skipped: "already_sent" };
  }

  try {
    const lines = Array.isArray(initial.quote?.lines) ? initial.quote!.lines! : [];
    const internationalCount = lines.filter((l) => l.country && l.country !== "US").length;
    const cardCount = Number(initial.quote?.count || lines.length || 0);
    const totalCents = Number(initial.capturedCents || initial.quote?.totalCents || 0);
    const appUrl = (deps.appUrl || process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com").replace(/\/$/, "");
    const recoveryUrl = `${appUrl}/thank-you/wedding`;

    const content = buildWeddingConfirmationEmailContent({
      batchId,
      buyerEmail,
      cardCount,
      internationalCount,
      totalCents,
      recoveryUrl,
    });

    const fromEmail = process.env.RESEND_FROM_EMAIL || "orders@sendmynotes.com";
    const sender = deps.sendEmail || defaultSendEmail;
    const result = await sender({
      from: `SendMyNotes <${fromEmail}>`,
      to: [buyerEmail],
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    if (result.error) {
      const errMsg = result.error.message || "Email provider error";
      await batchRef.update({
        confirmationEmailStatus: "failed",
        confirmationEmailError: errMsg,
      });
      return { sent: false, error: errMsg };
    }

    await batchRef.update({
      confirmationEmailStatus: "sent",
      confirmationEmailSentAt: now(),
      confirmationEmailId: result.data?.id || null,
      confirmationEmailError: null,
    });
    return { sent: true, id: result.data?.id || undefined };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await batchRef
      .update({
        confirmationEmailStatus: "failed",
        confirmationEmailError: errMsg,
      })
      .catch(() => {});
    return { sent: false, error: errMsg };
  }
}
