import { NextRequest } from "next/server";
import crypto from "crypto";

const ADMIN_SECRET =
  process.env.ADMIN_SECRET_KEY ||
  process.env["admin-secret-key"] ||
  "sendmynotes2026";

export const ADMIN_COOKIE_NAME = "smn_admin_session";

/**
 * Creates a signed session token derived from the secret key and date.
 */
export function generateAdminSessionToken(): string {
  const payload = `smn_admin_${Date.now()}`;
  const signature = crypto
    .createHmac("sha256", ADMIN_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Validates the admin session token from the cookie or header.
 */
export function isValidAdminSessionToken(token: string): boolean {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", ADMIN_SECRET)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Validates incoming admin request from cookie or x-admin-key header.
 */
export function verifyAdminAuth(req: NextRequest): boolean {
  // 1. Direct header check
  const headerKey = req.headers.get("x-admin-key");
  if (headerKey && headerKey === ADMIN_SECRET) {
    return true;
  }

  // 2. Cookie session check
  const sessionCookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (sessionCookie && isValidAdminSessionToken(sessionCookie)) {
    return true;
  }

  return false;
}

export function verifyAdminPassphrase(passphrase: string): boolean {
  return passphrase === ADMIN_SECRET;
}
