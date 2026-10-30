import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionSigningKey } from "@/lib/admin-auth";
import { getImageCachePoolCollection } from "@/lib/firebase-admin";
import { verifyArtworkRecoveryToken } from "@/lib/artwork-recovery";

export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  try {
    const token = req.nextUrl.searchParams.get("token") || req.cookies.get("smn_recovered_artwork")?.value || "";
    const cacheId = verifyArtworkRecoveryToken(token, getAdminSessionSigningKey());
    if (!cacheId) return NextResponse.json({ error: "This artwork link is invalid or has expired." }, { status: 404, headers });
    const snapshot = await getImageCachePoolCollection().doc(cacheId).get();
    const artwork = snapshot.data();
    if (!snapshot.exists || !artwork?.imageUrl || artwork.isGenerated !== true) {
      return NextResponse.json({ error: "This artwork is no longer available." }, { status: 404, headers });
    }
    if (req.nextUrl.searchParams.get("open") === "1") {
      // Exchange the private token before loading the page's analytics/scripts.
      // Cloud Run supplies an internal request origin (0.0.0.0:8080).
      // Redirect through the configured customer-facing origin, never that host.
      const publicOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
      if (!publicOrigin && process.env.NODE_ENV === "production") throw new Error("Public app origin unavailable");
      const destination = new URL("/new?recover_artwork=1", publicOrigin || req.url);
      const discount = req.nextUrl.searchParams.get("discount");
      if (discount && /^[A-Za-z0-9_-]{2,50}$/.test(discount)) destination.searchParams.set("discount", discount);
      const response = NextResponse.redirect(destination, 303);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      response.cookies.set("smn_recovered_artwork", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/artwork/recover", maxAge: 300 });
      return response;
    }
    const response = NextResponse.json({ imageUrl: artwork.imageUrl, occasion: artwork.occasion, title: "Recovered custom artwork" }, { headers });
    response.cookies.set("smn_recovered_artwork", "", { httpOnly: true, path: "/api/artwork/recover", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to recover the artwork right now. Please try again." }, { status: 503, headers });
  }
}
