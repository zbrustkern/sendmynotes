import { NextRequest } from "next/server";
import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "smn_admin_session";

/**
 * Verified user accounts authorized to access the SendMyNotes admin portal.
 */
export const AUTHORIZED_ADMIN_EMAILS: string[] = [
  "zbrustkern@gmail.com",
  "sentral@gmail.com",
];

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  const configuredEmails = process.env.ADMIN_AUTHORIZED_EMAILS
    ? process.env.ADMIN_AUTHORIZED_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];
  const allowed = new Set([
    ...AUTHORIZED_ADMIN_EMAILS.map((e) => e.toLowerCase()),
    ...configuredEmails,
  ]);
  return allowed.has(cleanEmail);
}

/**
 * Resolves the admin secret key from the environment.
 * In production, fails closed (returns null) if no secret is configured.
 * In non-production/test environments, falls back to a development key.
 */
export function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET_KEY || process.env["admin-secret-key"];
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  if (process.env.NODE_ENV !== "production") {
    return "sendmynotes2026";
  }
  console.error("[AdminAuth] ERROR: ADMIN_SECRET_KEY is not configured in production environment.");
  return null;
}

/**
 * Secret key used to sign and verify HMAC session cookies.
 */
export function getAdminSessionSigningKey(): string {
  const independentKey = process.env.ADMIN_SESSION_SIGNING_KEY?.trim();
  if (independentKey) return independentKey;
  const secret = getAdminSecret();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "smn_internal_admin_session_key_2026";
  throw new Error("Admin session signing key is not configured in production.");
}

/**
 * Creates a signed session token derived from the signing key and current timestamp.
 */
export function generateAdminSessionToken(adminEmail: string): string {
  const signingKey = getAdminSessionSigningKey();
  const timestamp = Date.now();
  const userTag = adminEmail
    ? `_${Buffer.from(adminEmail.toLowerCase().trim()).toString("hex")}`
    : "";
  const payload = `smn_admin_google_${timestamp}${userTag}`;
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Validates the admin session token from the cookie or header.
 * Enforces payload format, server-side timestamp expiration (8 hours max),
 * and safe constant-time HMAC signature verification.
 */
export function isValidAdminSessionToken(token: string): boolean {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  let signingKey: string;
  try {
    signingKey = getAdminSessionSigningKey();
  } catch {
    return false;
  }

  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;
  const payload = token.substring(0, lastDot);
  const signature = token.substring(lastDot + 1);
  if (!payload || !signature) return false;

  // Enforce payload format and timestamp expiration (allowing optional user tag)
  const match = payload.match(/^smn_admin_google_(\d+)_[0-9a-fA-F]+$/);
  if (!match) return false;

  const timestamp = parseInt(match[1], 10);
  const now = Date.now();
  const maxAgeMs = 8 * 60 * 60 * 1000; // 8 hours server lifetime

  if (isNaN(timestamp) || now - timestamp > maxAgeMs || timestamp > now + 60000) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", signingKey)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  // Guard against length mismatch to prevent ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH uncaught exceptions
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Safely extracts the email embedded in a valid session token (if present).
 */
export function getAdminSessionEmail(token: string): string | null {
  if (!isValidAdminSessionToken(token)) return null;
  const lastDot = token.lastIndexOf(".");
  const payload = token.substring(0, lastDot);
  const match = payload.match(/^smn_admin_google_\d+_(.+)$/);
  if (!match) return null;
  const rawTag = match[1];
  if (/^[0-9a-fA-F]+$/.test(rawTag)) {
    try {
      return Buffer.from(rawTag, "hex").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(rawTag);
  } catch {
    return rawTag;
  }
}

/**
 * Validates an account-bound, authorized admin session. Shared keys and anonymous legacy sessions are rejected.
 */
export function verifyAdminAuth(req: NextRequest): boolean {
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  const email = getAdminSessionEmail(token);
  return isAuthorizedAdminEmail(email);
}

/** Resolve audit identity from verified credentials, never from request body labels. */
export function getAuthenticatedAdminActor(req: NextRequest): string | null {
  if (!verifyAdminAuth(req)) return null;
  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return token ? getAdminSessionEmail(token) : null;
}
