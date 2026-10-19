import { NextRequest, NextResponse } from "next/server";
import {
  generateAdminSessionToken,
  verifyAdminAuth,
  getAdminSessionEmail,
  isAuthorizedAdminEmail,
  ADMIN_COOKIE_NAME,
} from "@/lib/admin-auth";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
// Check the account-bound session.
export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthenticated = verifyAdminAuth(req);
  const email = isAuthenticated && sessionCookie ? getAdminSessionEmail(sessionCookie) : null;

  return NextResponse.json({
    authenticated: isAuthenticated,
    email,
  });
}

// Exchange a verified Google administrator identity for a signed session.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization");
    const idToken =
      body?.idToken ||
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);

    // 1. Firebase ID Token Auth: Account-bound to authorized emails (zbrustkern@gmail.com, sentral@gmail.com)
    if (idToken) {
      const decoded = await verifyFirebaseIdToken(idToken);
      if (!decoded) {
        return NextResponse.json(
          { error: "Invalid or expired Firebase authentication token." },
          { status: 401 }
        );
      }

      if (!decoded.email || !decoded.email_verified || decoded.firebase?.sign_in_provider !== "google.com" || !isAuthorizedAdminEmail(decoded.email)) {
        console.warn(`[AdminAuth] Access denied for user: ${decoded.email || decoded.uid}`);
        return NextResponse.json(
          {
            error: `Access denied. The account (${decoded.email || decoded.uid}) is not authorized for administrator access.`,
          },
          { status: 403 }
        );
      }

      // Successful verified admin user
      const token = generateAdminSessionToken(decoded.email);
      const response = NextResponse.json({
        success: true,
        email: decoded.email,
        authType: "firebase_user",
      });

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
    }

    return NextResponse.json({ error: "Sign in with an authorized Google administrator account." }, { status: 401 });
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
