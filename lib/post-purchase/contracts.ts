/** Server-owned contracts for the two-step optional post-purchase flow. */
export const POST_PURCHASE_PROGRAM_ID = "post_purchase_v1" as const;
export type FollowupStep = "check_in" | "offer";
export type EnrollmentMode = "review" | "auto";
export type ScheduleAnchor = "mailing_business_days" | "accepted_check_in";
export type FollowupState = "draft" | "scheduled" | "claimed" | "dispatching" | "accepted" | "cancelled" | "held" | "failed" | "uncertain";
export type PermissionState = "unknown" | "granted" | "denied" | "unsubscribed" | "bounced" | "complained";

export interface FollowupStepConfig {
  enabled: boolean;
  delayDays: number;
  subject: string;
  previewText: string;
  paragraphs: string[];
  signoff: string;
  buttonLabel?: string;
}
export interface PostPurchaseConfig {
  schemaVersion: 1;
  revision: number;
  mode: EnrollmentMode;
  globalPaused: boolean;
  sendHourLocal: number;
  timezone: "America/Chicago";
  anchor: ScheduleAnchor;
  autoActivatedAt?: number;
  resumedAt?: number;
  stepResumedAt?: Partial<Record<FollowupStep, number>>;
  steps: Record<FollowupStep, FollowupStepConfig>;
  offer: { amountCents: number; maxUses: 1; validDays: number };
  updatedAt: number;
  updatedBy: string;
}
export interface PostPurchasePublishedVersion extends PostPurchaseConfig {
  versionId: string;
  publishedAt: number;
  publishedBy: string;
}
export interface PostPurchaseEligibility {
  eligible: boolean;
  reason: "ready" | "waiting_for_mailing" | "missing_email" | "permission_unknown" | "unsubscribed" | "paused_for_support" | "already_enrolled" | "purchased_again" | "excluded_test_comp_refund" | "payment_unverified" | "address_pending" | "mailing_unknown";
}
export interface PostPurchaseEnrollment {
  id: string;
  programId: typeof POST_PURCHASE_PROGRAM_ID;
  versionId: string;
  sourceOrderId: string;
  senderKey: string;
  permissionState: PermissionState;
  permissionEvidence?: { disclosureVersion: string; source: string; acceptedAt: number };
  mode: EnrollmentMode;
  stage: FollowupStep | "complete";
  state: "review" | "active" | "paused" | "cancelled" | "complete";
  eligibility: PostPurchaseEligibility;
  mailingEvidence?: { kind: "provider_status" | "verified_date"; mailedAt: number; source: string };
  nextDueAt?: number;
  offerGrantId?: string;
  createdAt: number;
  updatedAt: number;
}
export interface PostPurchaseMessage {
  id: string;
  enrollmentId: string;
  sourceOrderId: string;
  step: FollowupStep;
  versionId: string;
  state: FollowupState;
  dueAt: number;
  leaseUntil?: number;
  dispatchAttemptedAt?: number;
  dispatchPayload?: Record<string, unknown>;
  resendId?: string;
  idempotencyKey?: string;
  payloadHash?: string;
  acceptedAt?: number;
  deliveryFacts?: Record<string, number>;
  suppressionReason?: string;
}
export interface EmailPreference {
  senderKey: string;
  schemaVersion: 1;
  state: PermissionState;
  disclosureVersion?: string;
  source?: string;
  acceptedAt?: number;
  unsubscribedAt?: number;
  suppressedAt?: number;
  updatedAt: number;
}
export interface PostPurchaseAdminQueueRow {
  orderId: string;
  maskedEmail?: string;
  paymentEvidence: "verified" | "unverified";
  mailingEvidence?: string;
  permissionState: PermissionState;
  eligibility: PostPurchaseEligibility;
  stage?: FollowupStep | "complete";
  dueAt?: number;
  state?: FollowupState | "review" | "active" | "paused" | "cancelled" | "complete";
  offerStatus?: string;
}
export interface PostPurchaseAdminResponse<T = unknown> { data: T }
export type PostPurchaseAdminAction =
  | { action: "save_draft"; config: Partial<PostPurchaseConfig>; expectedRevision: number }
  | { action: "publish"; expectedRevision: number }
  | { action: "preview"; orderId?: string; step: FollowupStep }
  | { action: "enroll"; orderId: string }
  | { action: "approve"; enrollmentId: string }
  | { action: "pause" | "cancel" | "resume"; enrollmentId: string; reason: string }
  | { action: "reschedule"; enrollmentId: string; dueAt: number; reason: string }
  | { action: "record_reply"; enrollmentId: string; repliedAt: number; hasIssue?: boolean };

export interface RecordPostPurchaseConsentInput {
  orderId: string;
  email: string;
  optedIn?: boolean;
  disclosureVersion?: string;
  source?: string;
  at?: number;
}
