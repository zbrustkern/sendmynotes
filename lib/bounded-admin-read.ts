/**
 * Hard read budget for admin evidence views. The extra sentinel document tells
 * callers that the displayed slice is incomplete; totals from this slice must
 * never be presented as complete.
 */
export const ADMIN_EVIDENCE_READ_LIMIT = 2_000;

export interface BoundedSnapshot<T = unknown> {
  docs: any[];
  size: number;
  empty: boolean;
  truncated: boolean;
  readLimit: number;
  forEach(callback: (doc: any) => void): void;
}

export async function readBoundedQuery<T = unknown>(
  query: { limit(count: number): { get(): Promise<{ docs: any[] }> } },
  readLimit = ADMIN_EVIDENCE_READ_LIMIT,
): Promise<BoundedSnapshot<T>> {
  const safeLimit = Math.min(10_000, Math.max(1, Math.floor(readLimit)));
  const snapshot = await query.limit(safeLimit + 1).get();
  const truncated = snapshot.docs.length > safeLimit;
  if (truncated) throw new Error(`Admin evidence read budget exceeded (${safeLimit} records). This report is unavailable until an indexed continuation or warehouse is configured; no sampled total is being presented as complete.`);
  const docs = snapshot.docs.slice(0, safeLimit);
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    truncated,
    readLimit: safeLimit,
    forEach(callback) { docs.forEach(callback); },
  };
}

export async function readBoundedCollection<T = unknown>(
  collection: { limit(count: number): { get(): Promise<{ docs: any[] }> } },
  readLimit = ADMIN_EVIDENCE_READ_LIMIT,
): Promise<BoundedSnapshot<T>> {
  return readBoundedQuery<T>(collection, readLimit);
}

export function boundedCoverage(...snapshots: Array<Pick<BoundedSnapshot, "truncated" | "readLimit" | "size">>) {
  const truncated = snapshots.some((snapshot) => snapshot.truncated);
  return {
    complete: !truncated,
    status: truncated ? "partial" as const : "complete" as const,
    readLimit: Math.min(...snapshots.map((snapshot) => snapshot.readLimit)),
    observedCount: snapshots.reduce((total, snapshot) => total + snapshot.size, 0),
    limitation: truncated
      ? "One or more source collections exceeded the admin read budget. Counts and totals are partial; full cross-source aggregation requires indexed continuation or a warehouse."
      : undefined,
  };
}
