import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassphrase,
  generateAdminSessionToken,
  isValidAdminSessionToken,
  ADMIN_COOKIE_NAME,
} from "@/lib/admin-auth";
import {
  getClientIp,
  checkAdminRateLimit,
  recordAdminFailedAttempt,
  clearAdminFailedAttempts,
} from "@/lib/admin-rate-limit";

// Check session and lockout status
export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthenticated = sessionCookie ? isValidAdminSessionToken(sessionCookie) : false;

  const clientIp = getClientIp(req);
  const rateLimit = await checkAdminRateLimit(clientIp);

  return NextResponse.json({
    authenticated: isAuthenticated,
    locked: rateLimit.locked,
    retryAfterSeconds: rateLimit.retryAfterSeconds,
    remainingAttempts: rateLimit.remainingAttempts,
  });
}

// Log in with retry limit enforcement
export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || undefined;

    // 1. Check if IP is currently locked out
    const rateLimit = await checkAdminRateLimit(clientIp);
    if (!rateLimit.allowed) {
      const minutes = Math.ceil((rateLimit.retryAfterSeconds || 60) / 60);
      return NextResponse.json(
        {
          error: `Too many failed attempts. Admin portal is locked for this IP. Please try again in ${minutes} minute${
            minutes === 1 ? "" : "s"
          }.`,
          locked: true,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 900),
          },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const passphrase = body?.passphrase;

    // 2. Validate passphrase
    if (!passphrase || !verifyAdminPassphrase(passphrase)) {
      const failureResult = await recordAdminFailedAttempt(clientIp, userAgent);

      if (failureResult.locked) {
        return NextResponse.json(
          {
            error: "Too many failed attempts. Admin access has been locked for 15 minutes.",
            locked: true,
            retryAfterSeconds: failureResult.retryAfterSeconds,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(failureResult.retryAfterSeconds || 900),
            },
          }
        );
      }

      return NextResponse.json(
        {
          error: `Invalid admin passphrase. ${failureResult.remainingAttempts} attempt${
            failureResult.remainingAttempts === 1 ? "" : "s"
          } remaining before lockout.`,
          remainingAttempts: failureResult.remainingAttempts,
          locked: false,
        },
        { status: 401 }
      );
    }

    // 3. Clear failed attempts on successful login
    await clearAdminFailedAttempts(clientIp);

    const token = generateAdminSessionToken();
    const response = NextResponse.json({ success: true });

    // Set secure httpOnly cookie (valid for 8 hours)
    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error verifying admin auth";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Log out
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
