import crypto from "node:crypto";

const CACHE_ID = /^cache_[0-9]{13}_[a-z0-9]{5}$/;
export const ARTWORK_RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Grants access to one cover only; never grants access to a customer's draft/order. */
export function createArtworkRecoveryToken(cacheId: string, secret: string, now = Date.now()): string {
  if (!CACHE_ID.test(cacheId) || !secret) throw new Error("Invalid artwork recovery configuration");
  const payload = `${cacheId}.${now + ARTWORK_RECOVERY_TTL_MS}`;
  const signature = crypto.createHmac("sha256", secret).update(`artwork-recovery-v1:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyArtworkRecoveryToken(token: string, secret: string, now = Date.now()): string | null {
  if (!secret || token.length > 200) return null;
  const [cacheId, expires, signature, extra] = token.split(".");
  if (extra !== undefined || !CACHE_ID.test(cacheId || "") || !/^[0-9]{13}$/.test(expires || "") || !/^[a-f0-9]{64}$/.test(signature || "")) return null;
  const expiry = Number(expires);
  if (expiry <= now || expiry > now + ARTWORK_RECOVERY_TTL_MS + 60000) return null;
  const expected = crypto.createHmac("sha256", secret).update(`artwork-recovery-v1:${cacheId}.${expires}`).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex")) ? cacheId : null;
}
