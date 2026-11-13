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

const TWO_LINE_VALEDICTION_RE =
  /^(warmly|with all our love|with love|lots of love|love always|much love|love|sincerely|warmest wishes|warm wishes|best wishes|best regards|kind regards|regards|all the best|best|cheers|yours truly|yours|affectionately|fondly|gratefully|with gratitude),\s+(.+)$/i;

/** Collapse newlines/whitespace in a greeting to a single trimmed line; whitespace-only becomes "". */
export function normalizeGreetingText(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/[\r\n\s]+/g, " ").trim();
}

/** Normalize body line endings, strip trailing line spaces, cap consecutive blank lines at 1 (\n\n), and trim outer blank lines. */
export function normalizeBodyText(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Normalize sign-off to at most 2 consecutive non-empty lines separated by a single \n. */
export function normalizeSignOffText(raw?: string | null): string {
  if (!raw) return "";
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  return `${lines[0]}\n${lines.slice(1).join(" ")}`;
}

/** Format a single-line "Warmly, Name" closing into a 2-line "Warmly,\nName" sign-off when applicable. */
export function formatTwoLineSignOff(raw?: string | null): string {
  const normalized = normalizeSignOffText(raw);
  if (!normalized || normalized.includes("\n")) return normalized;
  const match = normalized.match(TWO_LINE_VALEDICTION_RE);
  if (!match) return normalized;
  const [, closing, signature] = match;
  const cleanSignature = signature.trim();
  if (!cleanSignature) return normalized;
  return `${closing},\n${cleanSignature}`;
}

/** Resolve the greeting without changing its text or interpreting recipient names. */
export function resolveGreeting(defaultGreeting: string, choice: RecipientGreetingChoice): string {
  return normalizeGreetingText(choice.mode === "inherit" ? defaultGreeting : choice.text);
}

/** Shared preview/checkout/fulfillment composition rule. */
export function composeRecipientMessage(
  note: { salutation?: string; text: string; signOff?: string; style: string },
  choice: RecipientGreetingChoice,
): string {
  const greeting = resolveGreeting(note.salutation || "", choice);
  const body = normalizeBodyText(note.text);
  const signOff = normalizeSignOffText(note.signOff || "");
  return [greeting, body, signOff].filter(Boolean).join("\n\n");
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
