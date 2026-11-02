/**
 * Small browser-safe guard for logical journey facts. It suppresses duplicate
 * calls within a mounted flow and creates stable IDs so collector retries and
 * reloads of the same persisted draft are idempotent too.
 */

export interface MilestoneEnvelopeOptions {
  eventId: string;
  draftId?: string;
  orderId?: string;
  paymentAttemptId?: string;
}

export interface MilestoneOptions {
  /** Stable internal scope: session + draft, order, or payment attempt. */
  scope: string;
  /** Lets mutually exclusive outcomes share one idempotency slot (address path). */
  dedupeKey?: string;
  draftId?: string;
  orderId?: string;
  paymentAttemptId?: string;
}

export type MilestoneSender = (
  eventName: string,
  properties: Record<string, unknown>,
  options: MilestoneEnvelopeOptions,
) => unknown;

function shortHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

/** Stable, opaque ID that contains no note, address, email, or other user text. */
export function stableMilestoneEventId(eventName: string, scope: string): string {
  const safeName = eventName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 48) || "event";
  return `smn_${safeName}_${shortHash(`${eventName}\u0000${scope}`)}`;
}

/** Returns true only for the first logical fact in this scope. */
export function emitMilestoneOnce(
  seen: Set<string>,
  send: MilestoneSender,
  eventName: string,
  properties: Record<string, unknown>,
  options: MilestoneOptions,
): boolean {
  const semanticName = options.dedupeKey || eventName;
  const logicalKey = `${semanticName}\u0000${options.scope}`;
  if (seen.has(logicalKey)) return false;
  seen.add(logicalKey);

  send(eventName, properties, {
    eventId: stableMilestoneEventId(semanticName, options.scope),
    ...(options.draftId ? { draftId: options.draftId } : {}),
    ...(options.orderId ? { orderId: options.orderId } : {}),
    ...(options.paymentAttemptId ? { paymentAttemptId: options.paymentAttemptId } : {}),
  });
  return true;
}
