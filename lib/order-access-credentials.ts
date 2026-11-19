import { createHmac, timingSafeEqual } from "node:crypto";

/** Return tickets keep a payment redirect useful without becoming a durable checkout credential. */
export const ORDER_RETURN_TICKET_TTL_MS = 2 * 60 * 60 * 1000;

const MAX_TOKEN_LENGTH = 1024;
const READ_TOKEN_PREFIX = "or1_";
const RETURN_TICKET_PREFIX = "ort1.";

function validInputs(orderId: unknown, viewToken: unknown): orderId is string {
  return typeof orderId === "string" && orderId.length > 0 && orderId.length <= 256 &&
    typeof viewToken === "string" && viewToken.length > 0 && viewToken.length <= MAX_TOKEN_LENGTH;
}

function mac(viewToken: string, message: string): string {
  return createHmac("sha256", viewToken).update(message, "utf8").digest("base64url");
}

/** Safe for arbitrary request strings, including unequal lengths. */
export function constantTimeStringEqual(candidate: unknown, expected: unknown): boolean {
  if (typeof candidate !== "string" || typeof expected !== "string" ||
      candidate.length > MAX_TOKEN_LENGTH || expected.length > MAX_TOKEN_LENGTH) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  const width = Math.max(a.length, b.length, 1);
  const paddedA = Buffer.alloc(width);
  const paddedB = Buffer.alloc(width);
  a.copy(paddedA);
  b.copy(paddedB);
  const equal = timingSafeEqual(paddedA, paddedB);
  return equal && a.length === b.length;
}

/** Deterministic and order-scoped. The legacy checkout token is the only signing key. */
export function createOrderReadToken(orderId: string, viewToken: string): string | null {
  if (!validInputs(orderId, viewToken)) return null;
  return `${READ_TOKEN_PREFIX}${mac(viewToken, `sendmynotes:order-read:v1\0${orderId}`)}`;
}

export function verifyOrderReadToken(orderId: string, viewToken: string, candidate: unknown): boolean {
  if (!validInputs(orderId, viewToken) || typeof candidate !== "string" ||
      !/^or1_[A-Za-z0-9_-]{43}$/.test(candidate)) return false;
  const expected = createOrderReadToken(orderId, viewToken);
  return expected !== null && constantTimeStringEqual(candidate, expected);
}

export function createOrderReturnTicket(
  orderId: string,
  viewToken: string,
  now = Date.now(),
): string | null {
  if (!validInputs(orderId, viewToken) || !Number.isSafeInteger(now) || now < 0) return null;
  const expiresAt = now + ORDER_RETURN_TICKET_TTL_MS;
  if (!Number.isSafeInteger(expiresAt)) return null;
  const signature = mac(viewToken, `sendmynotes:order-return:v1\0${orderId}\0${expiresAt}`);
  return `${RETURN_TICKET_PREFIX}${expiresAt}.${signature}`;
}

export function verifyOrderReturnTicket(
  orderId: string,
  viewToken: string,
  candidate: unknown,
  now = Date.now(),
): boolean {
  if (!validInputs(orderId, viewToken) || typeof candidate !== "string" ||
      candidate.length > 128 || !Number.isSafeInteger(now) || now < 0) return false;
  const match = /^ort1\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/.exec(candidate);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + ORDER_RETURN_TICKET_TTL_MS) return false;
  const expected = mac(viewToken, `sendmynotes:order-return:v1\0${orderId}\0${expiresAt}`);
  return constantTimeStringEqual(match[2], expected);
}
