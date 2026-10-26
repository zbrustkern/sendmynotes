import { NextRequest, NextResponse } from "next/server";

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  // Capability URLs are bearer credentials in the path.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = { matcher: ["/comp-payment/:path*"] };
