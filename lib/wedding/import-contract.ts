export const canonicalFields = [
  "sourceId", "firstName", "lastName", "additionalGuest", "envelopeName", "insideNames",
  "street1", "street2", "city", "state", "zip", "country", "gift", "giver", "giftId",
  "body", "status",
] as const;
export type ImportField = typeof canonicalFields[number];
export type FieldMapping = Partial<Record<string, ImportField>>;
export type ImportFormat = "csv" | "tsv" | "vcf" | "xlsx" | "txt";
export type SourceTable = { name: string; records: { line: number; cells: string[] }[] };
export interface ParsedWeddingSource { tables: SourceTable[]; excerpts: string[] }
export interface WeddingImportRow {
  id: string; source: string; sourceId: string; sources: string[];
  envelopeName: string; insideNames: string; firstName: string; lastName: string;
  street1: string; street2: string; city: string; state: string; zip: string; country: string;
  gift: string; body: string; memory?: string; alreadyThanked: boolean; guestCount: number; issues: string[];
}
export interface WeddingImportPreview {
  importId: string;
  sheets: { name: string; headers: string[]; example: string[]; mapping: FieldMapping }[];
  rows: WeddingImportRow[];
  exceptions: { source: string; reason: string; gift?: string }[];
  excerpts: string[];
  counts: { households: number; guests: number; sourceRows: number; missingAddresses: number; alreadyThanked: number };
}
export const maxWeddingFileBytes = 5 * 1024 * 1024;
