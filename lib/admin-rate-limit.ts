import { NextRequest } from "next/server";
import {
  getAdminAuthAttemptsCollection,
  recordSystemIncident,
} from "./firebase-admin";

export const MAX_ADMIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes in seconds
export const WINDOW_DURATION_MS = 15 * 60 * 1000; // 15 minutes window

export interface AdminAuthAttemptRecord {
  ip: string;
  failedAttempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lockedUntil: number; // ms timestamp; 0 if not locked
  userAgent?: string;
}

/**
 * Derives a valid Firestore document ID from an IP address.
 */
function getIpDocId(ip: string): string {
  return `ip_${Buffer.from(ip).toString("hex")}`;
}

/**
 * Extracts client IP address reliably from Next.js request headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();
  return "127.0.0.1";
}

/**
 * Checks whether an IP is currently locked out or how many attempts remain.
 */
export async function checkAdminRateLimit(ip: string): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
  remainingAttempts: number;
  locked: boolean;
}> {
  try {
    const docId = getIpDocId(ip);
    const doc = await getAdminAuthAttemptsCollection().doc(docId).get();

    if (!doc.exists) {
      return { allowed: true, remainingAttempts: MAX_ADMIN_ATTEMPTS, locked: false };
    }

    const data = doc.data() as AdminAuthAttemptRecord;
    const now = Date.now();

    // Check if actively locked out
    if (data.lockedUntil && data.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((data.lockedUntil - now) / 1000);
      return {
        allowed: false,
        retryAfterSeconds,
        remainingAttempts: 0,
        locked: true,
      };
    }

    // Check if rolling window expired
    if (data.firstAttemptAt && now - data.firstAttemptAt > WINDOW_DURATION_MS) {
      return { allowed: true, remainingAttempts: MAX_ADMIN_ATTEMPTS, locked: false };
    }

    const failed = data.failedAttempts || 0;
    const remaining = Math.max(0, MAX_ADMIN_ATTEMPTS - failed);

    return {
      allowed: true,
      remainingAttempts: remaining,
      locked: false,
    };
  } catch (err) {
    console.error("[checkAdminRateLimit] Error checking rate limit:", err);
    // Fail open if database is momentarily unreachable to not block legitimate admins
    return { allowed: true, remainingAttempts: MAX_ADMIN_ATTEMPTS, locked: false };
  }
}

/**
 * Records a failed passphrase attempt. If the attempt reaches the threshold,
 * initiates a 15-minute lockout and registers a security incident.
 */
export async function recordAdminFailedAttempt(
  ip: string,
  userAgent?: string
): Promise<{
  locked: boolean;
  retryAfterSeconds?: number;
  remainingAttempts: number;
}> {
  try {
    const docId = getIpDocId(ip);
    const docRef = getAdminAuthAttemptsCollection().doc(docId);
    const doc = await docRef.get();
    const now = Date.now();

    let attempts = 1;
    let firstAttemptAt = now;

    if (doc.exists) {
      const data = doc.data() as AdminAuthAttemptRecord;
      // If previous window expired or lockout expired, start a fresh window
      if (
        (data.lockedUntil && data.lockedUntil <= now) ||
        (data.firstAttemptAt && now - data.firstAttemptAt > WINDOW_DURATION_MS)
      ) {
        attempts = 1;
        firstAttemptAt = now;
      } else {
        attempts = (data.failedAttempts || 0) + 1;
        firstAttemptAt = data.firstAttemptAt || now;
      }
    }

    if (attempts >= MAX_ADMIN_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_DURATION_SECONDS * 1000;
      await docRef.set({
        ip,
        failedAttempts: attempts,
        firstAttemptAt,
        lastAttemptAt: now,
        lockedUntil,
        userAgent: userAgent || "unknown",
      });

      // Register high-severity security incident for brute-force attempt
      await recordSystemIncident({
        type: "SECURITY",
        severity: "error",
        summary: `Admin portal locked down: ${MAX_ADMIN_ATTEMPTS} failed passphrase attempts from IP ${ip}`,
        technicalDetails: `Exceeded threshold of ${MAX_ADMIN_ATTEMPTS} failed attempts within ${Math.round(
          WINDOW_DURATION_MS / 60000
        )} minutes. Locked out until ${new Date(lockedUntil).toISOString()}. User-Agent: ${
          userAgent || "unknown"
        }`,
        metadata: {
          ip,
          userAgent,
          failedAttempts: attempts,
          lockedUntil,
        },
      });

      return {
        locked: true,
        retryAfterSeconds: LOCKOUT_DURATION_SECONDS,
        remainingAttempts: 0,
      };
    }

    await docRef.set({
      ip,
      failedAttempts: attempts,
      firstAttemptAt,
      lastAttemptAt: now,
      lockedUntil: 0,
      userAgent: userAgent || "unknown",
    });

    const remainingAttempts = Math.max(0, MAX_ADMIN_ATTEMPTS - attempts);
    return {
      locked: false,
      remainingAttempts,
    };
  } catch (err) {
    console.error("[recordAdminFailedAttempt] Error recording failure:", err);
    return {
      locked: false,
      remainingAttempts: 1,
    };
  }
}

/**
 * Resets failed attempts after a verified successful passphrase entry.
 */
export async function clearAdminFailedAttempts(ip: string): Promise<void> {
  try {
    const docId = getIpDocId(ip);
    await getAdminAuthAttemptsCollection().doc(docId).delete();
  } catch (err) {
    console.warn("[clearAdminFailedAttempts] Notice resetting rate limit:", err);
  }
}
