import { normalizeGreetingText, type MultiSendRecipientInput } from "./contracts";

const COLLECTIVE_GREETING_TARGETS = new Set([
  "friends",
  "my friends",
  "dear friends",
  "our friends",
  "family",
  "our family",
  "my family",
  "everyone",
  "everybody",
  "all",
  "you all",
  "y'all",
  "yall",
  "folks",
  "neighbors",
  "team",
  "gang",
  "crew",
  "both of you",
  "you two",
  "you both",
]);

export interface InheritedGreetingMismatch {
  recipientId: string;
  recipientIndex: number;
  recipientDisplayName: string;
  matchedRecipientDisplayName: string;
  defaultGreeting: string;
  extractedName: string;
}

/**
 * Pure name extraction matching Step 2/3 greeting prefill rules without importing client components.
 */
export function extractGreetingTargetName(salutation?: string | null): string {
  const trimmed = normalizeGreetingText(salutation);
  if (!trimmed) return "";
  if (/^(d|de|dea|dear|dearest|to|hello|hi|hey|happy|merry|season'?s|warm|warmest)$/i.test(trimmed)) {
    return "";
  }
  if (!/^(dear|dearest|to|hello|hi|hey)\b/i.test(trimmed)) {
    return "";
  }
  let cleaned = trimmed.replace(/^(dear|dearest|to|hello|hi|hey)[:,\s]+\s*/i, "");
  cleaned = cleaned.replace(/[,!.:;]+$/, "").trim();
  cleaned = cleaned.replace(/^\[.*\]$/, "").trim();
  if (cleaned.length < 2 || /^(dear|dearest|to|hello|hi|hey)$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function normalizePersonToken(value?: string | null): string {
  return (value || "")
    .trim()
    .replace(/[,!.:;]+$/, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function recipientMatchesExtractedName(
  recipient: MultiSendRecipientInput,
  extractedNorm: string,
): boolean {
  const first = normalizePersonToken(recipient.address.firstName);
  const last = normalizePersonToken(recipient.address.lastName);
  const full = normalizePersonToken(`${recipient.address.firstName || ""} ${recipient.address.lastName || ""}`);
  if (!first && !full) return false;
  if (extractedNorm === first || extractedNorm === full) return true;
  // Also match when firstName has multiple words (e.g. "Sarah & Tom" or "Aunt Sarah") and one side matches
  const firstTokens = first.split(/\s+/).filter(Boolean);
  if (firstTokens.length > 0 && extractedNorm === firstTokens[0]) return true;
  return false;
}

function formatRecipientDisplayName(recipient: MultiSendRecipientInput, index: number): string {
  const full = `${recipient.address.firstName || ""} ${recipient.address.lastName || ""}`.trim().replace(/\s+/g, " ");
  return full || `Recipient ${index + 1}`;
}

/**
 * Detects when the Note step's default greeting addresses Recipient 1 by name (e.g. "Dear Sarah,")
 * and subsequent recipients (Recipient 2+) still have `greeting.mode === "inherit"` with a different name.
 * Never rewrites greetings or splits recipient names automatically.
 */
export function findInheritedGreetingNameMismatches(
  defaultGreeting: string | undefined | null,
  recipients: MultiSendRecipientInput[],
): InheritedGreetingMismatch[] {
  if (!Array.isArray(recipients) || recipients.length < 2) return [];
  const cleanDefaultGreeting = normalizeGreetingText(defaultGreeting);
  if (!cleanDefaultGreeting) return [];

  const extractedName = extractGreetingTargetName(cleanDefaultGreeting);
  if (!extractedName) return [];

  const extractedNorm = normalizePersonToken(extractedName);
  if (!extractedNorm || COLLECTIVE_GREETING_TARGETS.has(extractedNorm)) {
    return [];
  }

  const firstRecipient = recipients[0];
  if (!recipientMatchesExtractedName(firstRecipient, extractedNorm)) {
    return [];
  }

  const matchedRecipientDisplayName = formatRecipientDisplayName(firstRecipient, 0);
  const mismatches: InheritedGreetingMismatch[] = [];

  for (let i = 1; i < recipients.length; i += 1) {
    const recipient = recipients[i];
    if (!recipient || recipient.greeting?.mode !== "inherit") continue;
    // Skip blank/unsaved placeholder rows that don't have a recipient name yet
    const hasName = Boolean((recipient.address?.firstName || "").trim() || (recipient.address?.lastName || "").trim());
    if (!hasName) continue;
    if (recipientMatchesExtractedName(recipient, extractedNorm)) continue;

    mismatches.push({
      recipientId: recipient.id,
      recipientIndex: i,
      recipientDisplayName: formatRecipientDisplayName(recipient, i),
      matchedRecipientDisplayName,
      defaultGreeting: cleanDefaultGreeting,
      extractedName,
    });
  }

  return mismatches;
}
