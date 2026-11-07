import type { FollowupStep, PostPurchasePublishedVersion } from "../post-purchase/contracts";

export interface FollowupRenderValues {
  greeting?: string; cardPhrase: string; offerAmount?: string; offerCode?: string; offerUrl?: string; expiryDisplay?: string;
  unsubscribeUrl: string; businessPostalAddress: string; multiRecipient?: boolean;
}
export interface RenderedFollowup { subject: string; previewText: string; html: string; text: string; headers: Record<string, string>; templateVersion: string }
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function replace(text: string, values: FollowupRenderValues): string {
  const map: Record<string, string> = { greeting: values.greeting || "Hi there,", cardPhrase: values.cardPhrase,
    offerAmount: values.offerAmount || "$1", offerCode: values.offerCode || "EXAMPLE-NOT-A-REAL-CODE", offerUrl: values.offerUrl || "https://sendmynotes.com/new",
    expiryDisplay: values.expiryDisplay || "the date shown in your offer", unsubscribeUrl: values.unsubscribeUrl, businessPostalAddress: values.businessPostalAddress };
  return text.replace(/{{([a-zA-Z]+)}}/g, (_m, key) => { if (!(key in map)) throw new Error(`Unsupported follow-up variable: ${key}`); return map[key]; });
}
export function renderPostPurchaseEmail(version: PostPurchasePublishedVersion, step: FollowupStep, values: FollowupRenderValues): RenderedFollowup {
  const config = version.steps[step];
  const subject = replace(config.subject, values); const previewText = replace(config.previewText, values);
  const paragraphs = config.paragraphs.map(p => replace(p, values));
  const signoff = replace(config.signoff, values);
  const foot = ["You're receiving this because you chose SendMyNotes follow-ups and offers.", `Stop follow-ups and offers: ${values.unsubscribeUrl}`, "Order receipts and necessary order updates will continue.", `SendMyNotes · ${values.businessPostalAddress}`];
  const body = [values.greeting || "Hi there,", ...paragraphs, signoff];
  if (step === "offer") body.push(`Your code: ${values.offerCode || "EXAMPLE-NOT-A-REAL-CODE"}. Use it yourself or pass the code to a friend.`, `One redemption total through ${values.expiryDisplay || "the date shown in your offer"}. Cannot be combined with another offer.`);
  const text = [...body, ...(step === "offer" ? [`${config.buttonLabel || "Send another card"}: ${values.offerUrl || "https://sendmynotes.com/new"}`] : []), ...foot].join("\n\n");
  const button = step === "offer" && config.buttonLabel ? `<p><a href="${escapeHtml(values.offerUrl || "https://sendmynotes.com/new")}" style="display:inline-block;background:#233c32;color:#fff;padding:14px 20px;border-radius:4px;text-decoration:none">${escapeHtml(config.buttonLabel)}</a></p>` : "";
  const footerHtml = foot.map((p, i) => i === 1 ? `<p><a href="${escapeHtml(values.unsubscribeUrl)}">Stop follow-ups and offers</a></p>` : `<p>${escapeHtml(p)}</p>`).join("");
  const preheader = `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(previewText)}</span>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f7f5ef;color:#25251f;font-family:Arial,sans-serif">${preheader}<div style="max-width:560px;margin:0 auto;padding:28px 22px;background:#fff"><div style="margin-bottom:24px;color:#233c32;font-family:Georgia,serif;font-size:20px">SendMyNotes</div><div style="font-size:15px;line-height:1.65">${body.map(p => `<p>${escapeHtml(p).replace(/\n/g,"<br>")}</p>`).join("")}${button}</div><hr style="border:0;border-top:1px solid #ddd;margin:28px 0"><div style="font-size:12px;line-height:1.55;color:#595959">${footerHtml}</div></div></body></html>`;
  return { subject, previewText, html, text, headers: { "List-Unsubscribe": `<${values.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, templateVersion: version.versionId };
}
