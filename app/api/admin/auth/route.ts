import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassphrase,
  generateAdminSessionToken,
  isValidAdminSessionToken,
  ADMIN_COOKIE_NAME,
} from "@/lib/admin-auth";

// Check session
export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthenticated = sessionCookie ? isValidAdminSessionToken(sessionCookie) : false;
  return NextResponse.json({ authenticated: isAuthenticated });
}

// Log in
export async function POST(req: NextRequest) {
  try {
    const { passphrase } = await req.json();

    if (!passphrase || !verifyAdminPassphrase(passphrase)) {
      return NextResponse.json({ error: "Invalid admin passphrase" }, { status: 401 });
    }

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
