export interface VariantAllocation {
  id: string;
  weightBasisPoints: number;
}
export interface StableJourneyAssignment {
  experimentId: string;
  version: string;
  journeyId: string;
  assignmentId: string;
  variantId: string;
  assignedAt: number;
}
export type AssignmentResult =
  | { eligible: false; reason: "disabled" | "invalid_config" | "missing_journey" }
  | { eligible: true; assignment: StableJourneyAssignment };

/** Browser/server safe deterministic hash; never uses PII or runtime randomness. */
export function stableBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 10_000;
}

export function stableIdFragment(key: string): string {
  return ["", "|2", "|3", "|4"].map((suffix) => stableBucket(`${key}${suffix}`).toString(36).padStart(3, "0")).join("");
}

/**
 * Assigns only when an explicitly enabled experiment config is supplied. This
 * helper does not activate experiments or set rollout percentages by itself.
 */
export function assignStableJourneyVariant(input: {
  journeyId?: string;
  experimentId: string;
  version: string;
  enabled?: boolean;
  variants: VariantAllocation[];
  nowMs?: number;
}): AssignmentResult {
  if (!input.enabled) return { eligible: false, reason: "disabled" };
  if (!input.journeyId?.trim()) return { eligible: false, reason: "missing_journey" };
  if (!/^[a-zA-Z0-9_-]{2,50}$/.test(input.experimentId) || !/^[a-zA-Z0-9._-]{1,40}$/.test(input.version) || input.variants.length < 2 || input.variants.length > 8) {
    return { eligible: false, reason: "invalid_config" };
  }
  const seen = new Set<string>();
  let total = 0;
  for (const variant of input.variants) {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(variant.id) || seen.has(variant.id) || !Number.isInteger(variant.weightBasisPoints) || variant.weightBasisPoints < 0) {
      return { eligible: false, reason: "invalid_config" };
    }
    seen.add(variant.id);
    total += variant.weightBasisPoints;
  }
  if (total !== 10_000) return { eligible: false, reason: "invalid_config" };
  const journeyId = input.journeyId.trim();
  const bucket = stableBucket(`${input.experimentId}|${input.version}|${journeyId}`);
  let cumulative = 0;
  const selected = input.variants.find((variant) => {
    cumulative += variant.weightBasisPoints;
    return bucket < cumulative;
  }) || input.variants[input.variants.length - 1];
  const assignmentKey = `${input.experimentId}|${input.version}|${journeyId}|${selected.id}`;
  return {
    eligible: true,
    assignment: {
      experimentId: input.experimentId,
      version: input.version,
      journeyId,
      assignmentId: `asg_${stableIdFragment(assignmentKey)}`,
      variantId: selected.id,
      assignedAt: input.nowMs ?? Date.now(),
    },
  };
}
