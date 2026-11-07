import type { MailingAddress } from "../types";

export type RecipientGreetingChoice =
  | { mode: "inherit" }
  | { mode: "custom"; text: string };

export interface MultiSendRecipientInput {
  id: string;
  address: MailingAddress;
  greeting: RecipientGreetingChoice;
  householdAcknowledgedWith?: Array<{ id: string; addressKey: string }>;
}

export interface MultiSendCheckoutInput {
  version: 1;
  checkoutId: string;
  recipients: MultiSendRecipientInput[];
  note: { salutation?: string; text: string; signOff?: string; style: string };
}

export interface MultiSendParentSnapshot {
  version: 1;
  kind: "parent";
  checkoutId: string;
  recipients: Array<MultiSendRecipientInput & {
    resolvedGreeting: string;
    printedMessage: string;
    amountInCents: number;
  }>;
  shared: {
    frontImageUrl: string;
    note: { salutation?: string; text: string; signOff?: string; style: string };
    fontStyleId: string;
    returnAddress: MailingAddress;
  };
  quote: {
    version: string;
    countryCode: string;
    basePriceCents: number;
    discountCents: number;
    internationalSurchargeCents: number;
    totalCents: number;
    currency: "USD";
  };
  contentRevision: string;
  manifestComplete: boolean;
  preparationState: string;
  preparedCardId?: string;
  preparationEnvironment?: string;
}

/** Resolve the greeting without changing its text or interpreting recipient names. */
export function resolveGreeting(defaultGreeting: string, choice: RecipientGreetingChoice): string {
  return choice.mode === "inherit" ? defaultGreeting : choice.text;
}

/** Shared preview/checkout/fulfillment composition rule. */
export function composeRecipientMessage(
  note: { salutation?: string; text: string; signOff?: string; style: string },
  choice: RecipientGreetingChoice,
): string {
  const greeting = resolveGreeting(note.salutation || "", choice);
  return [greeting, note.text, note.signOff || ""].filter(Boolean).join("\n\n");
}

export function validateMultiSendInput(value: unknown): value is MultiSendCheckoutInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MultiSendCheckoutInput>;
  if (candidate.version !== 1 || typeof candidate.checkoutId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.checkoutId) || !Array.isArray(candidate.recipients)) return false;
  if (!candidate.note || typeof candidate.note.text !== "string" || !candidate.note.text.trim() || typeof candidate.note.style !== "string" || !candidate.note.style.trim()) return false;
  if (candidate.note.salutation !== undefined && typeof candidate.note.salutation !== "string") return false;
  if (candidate.note.signOff !== undefined && typeof candidate.note.signOff !== "string") return false;
  if (candidate.recipients.length < 2 || candidate.recipients.length > 25) return false;
  const ids = new Set<string>();
  return candidate.recipients.every((recipient) => {
    if (!recipient || typeof recipient !== "object" || typeof recipient.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(recipient.id) || ids.has(recipient.id)) return false;
    ids.add(recipient.id);
    if (!recipient.address || typeof recipient.address !== "object") return false;
    if (recipient.greeting?.mode === "inherit") return true;
    return recipient.greeting?.mode === "custom" && typeof recipient.greeting.text === "string";
  });
}

export function normalizedMailingAddressKey(address: MailingAddress): string {
  return [address.street1, address.street2 || "", address.city, address.state, address.zip, address.country || "US"]
    .map((part) => part.trim().toLocaleLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function quoteMultiSend(count: number, discountCents = 0, unitPriceCents = 900): { basePriceCents: number; discountCents: number; totalCents: number } {
  if (!Number.isInteger(count) || count < 2 || count > 25) throw new Error("Multi-send requires 2–25 recipients.");
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isInteger(discountCents) || discountCents < 0) throw new Error("Quote values must be non-negative integer cents.");
  const basePriceCents = count * unitPriceCents;
  const appliedDiscount = Math.min(discountCents, unitPriceCents, basePriceCents);
  return { basePriceCents, discountCents: appliedDiscount, totalCents: basePriceCents - appliedDiscount };
}

/** Convert the single-card offer preview into its one-time benefit on a batch quote. */
export function expectedMultiSendTotal(count: number, singleCardFinalAmountCents = 900): number {
  const boundedSingleCardAmount = Math.max(0, Math.min(900, Math.trunc(singleCardFinalAmountCents)));
  // Drafts can temporarily have a single opted-in recipient; server checkout validation still requires 2–25.
  if (count === 1) return boundedSingleCardAmount;
  return quoteMultiSend(count, 900 - boundedSingleCardAmount).totalCents;
}

/** Largest-remainder split: integer-cent allocations always sum to the parent amount. */
export function allocateTotalCents(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0 || !Number.isInteger(count) || count < 1) throw new Error("Invalid cent allocation.");
  const each = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => each + (index < remainder ? 1 : 0));
}
