import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const capability = request.nextUrl.pathname.startsWith("/comp-payment/") || ["discount", "code", "promo"].some((parameter) => request.nextUrl.searchParams.has(parameter));
  if (!capability) return response;
  // Capability URLs have strict cache and referrer headers.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = { matcher: ["/", "/new", "/preview/:path*", "/send/:path*", "/comp-payment/:path*"] };
