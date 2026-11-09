import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { firestoreDb } from "@/lib/firebase-admin";
import { normalizeCheckoutEmail } from "@/lib/checkout-contact-policy";
import { maskEmail } from "@/lib/post-purchase/preferences";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Masked, bounded captured contact inbox. No raw feedback, browser metadata or email is returned. */
export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return json({ error: "Unauthorized" }, 401);
  const sourceType = req.nextUrl.searchParams.get("sourceType") || "feedback";
  if (!["feedback", "account"].includes(sourceType)) return json({ error: "Unknown contact source." }, 400);
  const cursor = req.nextUrl.searchParams.get("cursor") || "";
  if (cursor.length > 160 || cursor.includes("/")) return json({ error: "Invalid page reference." }, 400);
  try {
    let query = firestoreDb.collection(sourceType === "feedback" ? "user_feedback" : "users").orderBy("__name__", "desc");
    if (cursor) query = query.startAfter(cursor);
    const result = await query.limit(26).get();
    const page = result.docs.slice(0,25);
    return json({ items: page.map((doc: any) => {
      const data = doc.data(); const email = normalizeCheckoutEmail(data.email);
      return { id: doc.id, createdAt: typeof data.createdAt === "number" && Number.isFinite(data.createdAt) ? data.createdAt : null,
        maskedEmail: email ? maskEmail(email) : null };
    }), nextCursor: result.docs.length > 25 ? page[page.length - 1].id : null });
  } catch { return json({ error: "Could not load contacts. Please retry." }, 503); }
}
