import type { Order } from "../types";

const SENSITIVE_OCCASION_PATTERN = /sympathy|condolence|bereavement|funeral|(?:^|[^a-z])loss(?:$|[^a-z])/i;

/**
 * Identifies sympathy, bereavement, or loss cards from structured metadata and
 * preset/artwork URLs without reading private customer message content.
 */
export function isSensitiveOccasionOrder(order: Partial<Order> | null | undefined): boolean {
  if (!order) return false;
  const candidates = [
    order.occasion,
    order.recipientOccasion?.occasionType,
    order.recipientOccasion?.occasionTitle,
    order.frontImageUrl,
  ];
  return candidates.some((value) => typeof value === "string" && SENSITIVE_OCCASION_PATTERN.test(value));
}
