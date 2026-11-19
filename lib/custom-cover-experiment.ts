/**
 * Picker-level custom cover experiment and bounded first-party diagnostics.
 * The assignment is deterministic for a session; assignment and impression
 * event IDs are deterministic too, so collector deduplication makes them
 * session-once across remounts and reloads.
 */

import { assignStableJourneyVariant } from "./experiment-assignment";
import { getSessionId, trackEventV2 } from "./telemetry";
import { stableMilestoneEventId } from "./telemetry-milestones";

export const CUSTOM_COVER_EXPERIMENT_ID = "custom-cover-picker";
export const CUSTOM_COVER_EXPERIMENT_VERSION = "v1";

export type CustomCoverVariant = "control" | "treatment";
export type CustomCoverEntrySource = "top_shortcut" | "grid_tile";

export interface CustomCoverAssignment {
  experimentId: typeof CUSTOM_COVER_EXPERIMENT_ID;
  version: typeof CUSTOM_COVER_EXPERIMENT_VERSION;
  sessionId: string;
  assignmentId: string;
  variant: CustomCoverVariant;
}

export type CustomCoverAssignmentResult =
  | { eligible: true; assignment: CustomCoverAssignment }
  | { eligible: false; reason: "missing_session" | "disabled" | "invalid_config" };

/** Code-based configuration: no remote flags or runtime configuration. */
const EXPERIMENT_ENABLED = true;
const ALLOCATION = [
  { id: "control", weightBasisPoints: 5_000 },
  { id: "treatment", weightBasisPoints: 5_000 },
] as const;

export function getCustomCoverAssignment(sessionId: string): CustomCoverAssignmentResult {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!normalizedSessionId) return { eligible: false, reason: "missing_session" };
  const result = assignStableJourneyVariant({
    journeyId: normalizedSessionId,
    experimentId: CUSTOM_COVER_EXPERIMENT_ID,
    version: CUSTOM_COVER_EXPERIMENT_VERSION,
    enabled: EXPERIMENT_ENABLED,
    variants: [...ALLOCATION],
    // Assignment timestamps are not part of this client-facing contract.
    nowMs: 0,
  });
  if (!result.eligible) return { eligible: false, reason: result.reason === "missing_journey" ? "missing_session" : result.reason };
  const variant = result.assignment.variantId;
  if (variant !== "control" && variant !== "treatment") return { eligible: false, reason: "invalid_config" };
  return {
    eligible: true,
    assignment: {
      experimentId: CUSTOM_COVER_EXPERIMENT_ID,
      version: CUSTOM_COVER_EXPERIMENT_VERSION,
      sessionId: normalizedSessionId,
      assignmentId: result.assignment.assignmentId,
      variant,
    },
  };
}

type CoverEvent =
  | "custom_cover_assigned"
  | "custom_cover_tile_impression"
  | "custom_cover_drawer_opened"
  | "custom_cover_generation_requested"
  | "custom_cover_generation_completed"
  | "custom_cover_generation_failed"
  | "custom_cover_accepted";

/** Record only bounded categories on the active first-party session. Both
 * variants enter the denominator on assignment, before any tile exposure. */
export function recordCustomCoverEvent(
  assignment: CustomCoverAssignment | null,
  event: CoverEvent,
  entrySource?: CustomCoverEntrySource,
): void {
  if (!assignment || getSessionId() !== assignment.sessionId) return;
  const once = event === "custom_cover_assigned" || event === "custom_cover_tile_impression";
  const eventId = once ? stableMilestoneEventId(event, assignment.assignmentId) : undefined;
  void trackEventV2(event, {
    experimentId: assignment.experimentId,
    experimentVersion: assignment.version,
    variantId: assignment.variant,
    ...(entrySource ? { entrySource } : {}),
  }, { eventId });
}
