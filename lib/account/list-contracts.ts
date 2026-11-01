import type { AccountList, AccountOccasion } from './contracts';

export function requireAccountList<T>(value: unknown, message = 'This account list could not be read. Please retry.'): AccountList<T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const candidate = value as { data?: unknown; nextCursor?: unknown };
  if (!Array.isArray(candidate.data) || !(candidate.nextCursor === null || typeof candidate.nextCursor === 'string')) throw new Error(message);
  return candidate as AccountList<T>;
}

export async function fetchAllAccountPages<T>(fetchPage: (cursor?: string) => Promise<unknown>): Promise<T[]> {
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageCount = 0; pageCount < 500; pageCount += 1) {
    const page = requireAccountList<T>(await fetchPage(cursor));
    rows.push(...page.data);
    if (page.nextCursor === null) return rows;
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) throw new Error('This account list could not be paged safely. Please retry.');
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new Error('This account list has too many pages to load safely. Please retry.');
}

export function upcomingAccountOccasions(occasions: AccountOccasion[]): AccountOccasion[] {
  return occasions
    .filter(item => typeof item.nextOccurrence === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.nextOccurrence))
    .slice()
    .sort((a, b) => a.nextOccurrence!.localeCompare(b.nextOccurrence!) || a.id.localeCompare(b.id));
}
