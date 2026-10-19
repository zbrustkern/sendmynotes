export const RELIABILITY_RETENTION_POLICY = {
  version: 1,
  productionTtlActive: false,
  access: "admin_only",
  windowsDays: { events: 365, diagnostics: 90, exports: 30 },
  deletionPropagation: ["raw_event", "projection", "derived_export"],
  accountingRecordsExcluded: true,
} as const;

export type RetainedRecordKind = keyof typeof RELIABILITY_RETENTION_POLICY.windowsDays;

export function evaluateRetentionFixture(input: {
  kind: RetainedRecordKind;
  createdAt: number;
  nowMs: number;
}) {
  const retentionMs = RELIABILITY_RETENTION_POLICY.windowsDays[input.kind] * 24 * 60 * 60 * 1000;
  const ageMs = Math.max(0, input.nowMs - input.createdAt);
  return {
    kind: input.kind,
    ageMs,
    retentionMs,
    expired: ageMs >= retentionMs,
    productionTtlActive: RELIABILITY_RETENTION_POLICY.productionTtlActive,
  };
}
