import { OrderAttribution } from "@/lib/types";

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/[\r\n\0]/g, "");
  if (!clean || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(clean)) return undefined;
  return clean.slice(0, max);
}

function boundedClickId(value: unknown): string | undefined {
  const clean = boundedText(value, 255);
  return clean && /^[A-Za-z0-9._~-]+$/.test(clean) ? clean : undefined;
}

function safeReferrer(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return new URL(value).origin.slice(0, 300); } catch { return undefined; }
}

function safeLandingPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.split(/[?#]/, 1)[0];
  if (!path.startsWith("/") || path.length > 200 || path.includes("..")) return undefined;
  return path;
}

/** Allowlist and bound the browser-selected first touch frozen onto a checkout order. */
export function sanitizeOrderAttribution(raw: unknown, now = Date.now()): OrderAttribution | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const a = raw as Record<string, unknown>;
  const capturedAt = typeof a.capturedAt === "number" && Number.isFinite(a.capturedAt) ? a.capturedAt : now;
  const expiresAt = typeof a.expiresAt === "number" ? a.expiresAt : capturedAt + 90 * 24 * 60 * 60 * 1000;
  if (expiresAt <= now || capturedAt > now + 5 * 60 * 1000) return undefined;
  const result: OrderAttribution = {
    utmSource: boundedText(a.utmSource, 100),
    utmMedium: boundedText(a.utmMedium, 100),
    utmCampaign: boundedText(a.utmCampaign, 100),
    utmContent: boundedText(a.utmContent, 100),
    utmTerm: boundedText(a.utmTerm, 100),
    gclid: boundedClickId(a.gclid),
    wbraid: boundedClickId(a.wbraid),
    gbraid: boundedClickId(a.gbraid),
    fbclid: boundedText(a.fbclid, 255),
    fbp: boundedText(a.fbp, 255),
    fbc: boundedText(a.fbc, 255),
    referrer: safeReferrer(a.referrer),
    landingPath: safeLandingPath(a.landingPath),
    googleClientId: boundedText(a.googleClientId, 100),
    googleClientIdNormalized: boundedText(a.googleClientIdNormalized, 100),
    gpc: a.gpc === true,
    optOut: a.optOut === true,
    capturedAt,
    expiresAt,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined)) as OrderAttribution;
}

export function mayStoreGoogleClientId(
  globalPrivacyControl: boolean,
  attribution?: Pick<OrderAttribution, "gpc" | "optOut"> | null
): boolean {
  return !globalPrivacyControl && !attribution?.gpc && !attribution?.optOut;
}
