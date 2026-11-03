import { NextRequest, NextResponse } from "next/server";
import { recordFollowupLinkObservation, resolveFollowupLink } from "@/lib/post-purchase/links";

const privateHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const invalid = () => NextResponse.json({ error: "Link unavailable." }, { status: 404, headers: privateHeaders });

/** Safe GET validation/redirect only. Mail scanners do not record an observation. */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference") || "";
  const resolved = await resolveFollowupLink(reference);
  if (!resolved) return invalid();
  const target = new URL("/new", req.url);
  target.searchParams.set("followupRef", reference);
  return NextResponse.redirect(target, { status: 302, headers: privateHeaders });
}

/** Records a browser observation only when the client reports analytics consent and GPC is absent. */
export async function POST(req: NextRequest) {
  if (req.headers.get("sec-gpc") === "1") return NextResponse.json({ ok: true, observed: false }, { headers: privateHeaders });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return invalid(); }
  if (body.analyticsAllowed !== true || typeof body.reference !== "string") return NextResponse.json({ ok: true, observed: false }, { headers: privateHeaders });
  try {
    const result = await recordFollowupLinkObservation(body.reference);
    return result ? NextResponse.json({ ok: true, observed: true, ...result }, { headers: privateHeaders }) : invalid();
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: privateHeaders });
  }
}
