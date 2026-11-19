import { createHash } from "node:crypto";
import { normalizeCountryCode, validateMailingAddress } from "../mailing-destinations";
import { canonicalFields, type FieldMapping, type ImportField, type ParsedWeddingSource, type WeddingImportPreview, type WeddingImportRow } from "./import-contract";

const aliases: Record<ImportField, string[]> = {
  sourceId: ["Household ID", "Family ID", "Guest ID"], firstName: ["First Name", "Given Name"],
  lastName: ["Last Name", "Surname", "Family Name"], additionalGuest: ["Additional Guest", "Partner", "Plus One"],
  envelopeName: ["Envelope Name", "Name", "Full Name","Addressee"], insideNames: ["Inside names", "Greeting","Salutation"],
  street1: ["Address", "Address Line 1", "Street Address", "Street", "Mailing Address"],
  street2: ["Address Line 2", "Apt", "Apt or Suite","Unit","Apartment"], city: ["City","Town"],
  state: ["State","Province","Region","State or Province"], zip: ["ZIP","Zip Code","Postal Code","Postcode"],
  country: ["Country","Country Code"], gift: ["Gift","Gift description","Gift name"], giver: ["Giver","Giver as entered"],
  giftId: ["Gift ID"], body: ["Message","Personal note","Thank-you message","Verbatim note"], status: ["Thank-you status","Thanked","Status"],
};
const key = (value: string) => value.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const byAlias = new Map(Object.entries(aliases).flatMap(([field, values]) => values.map(name => [key(name),field as ImportField] as const)));
export function inferredMapping(headers: string[]): FieldMapping {
  return Object.fromEntries(headers.flatMap(h => byAlias.has(key(h)) ? [[h, byAlias.get(key(h))]] : []));
}
function safeHeaders(cells: string[]): string[] {
  const seen = new Set<string>();
  return cells.map((value,index) => {
    const original = value.trim() || "Column " + (index + 1);
    if (original.length > 128) throw new Error("Shorten column headings to 128 characters.");
    let label = original, suffix = 1;
    while (seen.has(label) || ["__proto__","constructor","prototype"].includes(label)) label = original + " (" + ++suffix + ")";
    seen.add(label); return label;
  });
}
function resolveMapping(headers: string[], proposed?: unknown): FieldMapping {
  if (!proposed) return inferredMapping(headers);
  if (typeof proposed !== "object" || Array.isArray(proposed)) throw new Error("Choose column labels from this sheet.");
  const map: FieldMapping = Object.create(null);
  const assigned = new Set();
  for (const [name, field] of Object.entries(proposed)) {
    if (!headers.includes(name) || (field !== "" && !canonicalFields.includes(field as ImportField))) throw new Error("Choose a supported column mapping.");
    if (!field) continue;
    if (assigned.has(field)) throw new Error("Assign each destination field to a single column.");
    if (/ship.?to|shipping|delivery location/i.test(name) && ["street1","street2","city","state","zip","country"].includes(field)) {
      throw new Error("Registry shipping labels may belong to the couple. Enter the recipient’s mailing address separately.");
    }
    assigned.add(field); map[name] = field as ImportField;
  }
  return map;
}
const thanked = (status?: string) => /^(?:sent|mailed|yes|already thanked|thanked|done)$/i.test((status || "").trim());
export function inspectWeddingAddress(row: Pick<WeddingImportRow,"street1"|"city"|"state"|"zip"|"country">) {
  const result = validateMailingAddress({street1:row.street1,city:row.city,state:row.state,zip:row.zip,country:row.country});
  return { source: "structure" as const, complete: result.valid, issues: result.errors };
}
export function previewWeddingImport(parsed: ParsedWeddingSource, importId: string, overrides: Record<string, FieldMapping> = {}, selected?: string[]): WeddingImportPreview {
  const rows: WeddingImportRow[] = [], exceptions: WeddingImportPreview["exceptions"] = [];
  const gifts: {source: string; fields: Partial<Record<ImportField,string>>}[] = [];
  const sheets: WeddingImportPreview["sheets"] = [];
  const households = new Map<string,WeddingImportRow[]>();
  let sourceRows = parsed.excerpts.length;
  if (selected && (!Array.isArray(selected) || selected.some(n => !parsed.tables.some(t => t.name === n)))) throw new Error("Choose sheets from this workbook.");
  for (const table of parsed.tables) {
    const {name,records} = table;
    if (!records.length) { exceptions.push({source:name,reason:"Empty sheet."}); continue; }
    const headers = safeHeaders(records[0].cells), mapping = resolveMapping(headers, Object.hasOwn(overrides, name) ? overrides[name] : undefined);
    sheets.push({name,headers,mapping,example:records[1]?.cells || []});
    if (selected && !selected.includes(name)) continue;
    for (const record of records.slice(1)) {
      sourceRows++;
      const f: Partial<Record<ImportField,string>> = {};
      headers.forEach((h,i) => { const field = mapping[h]; if (field) f[field] = record.cells[i] || ""; });
      const source = name + " · " + record.line;
      if (Object.values(mapping).includes("giftId") || Object.values(mapping).includes("giver") && !Object.values(mapping).includes("envelopeName")) {
        gifts.push({source, fields:f}); continue;
      }
      const primary = [f.firstName, f.lastName].filter(Boolean).join(" ");
      const envelopeName = (f.envelopeName || [primary, f.additionalGuest].filter(Boolean).join(" & ")).trim();
      if (!envelopeName && !f.sourceId) { exceptions.push({source, reason:"Choose a name or household ID column, or add this household manually."}); continue; }
      const isSimple = !f.additionalGuest && (!f.envelopeName || f.envelopeName.trim() === primary);
      const row: WeddingImportRow = {
        sourceId:f.sourceId || "", id:"imp_" + createHash("sha256").update(importId + "\0" + source).digest("hex").slice(0,24),
        source,sources:[source],envelopeName,insideNames: f.insideNames || [f.firstName, f.additionalGuest].filter(Boolean).join(" and "),
        firstName: isSimple && f.firstName ? f.firstName : envelopeName, lastName: isSimple ? f.lastName || "" : "",
        street1:f.street1 || "",street2:f.street2 || "",city:f.city || "",state:f.state || "",zip:f.zip || "",
        country:normalizeCountryCode(f.country) || (f.country || ""),gift:f.gift || "",body:f.body || "",alreadyThanked:thanked(f.status),
        guestCount: f.additionalGuest ? 2 : 1, issues:[],
      };
      row.issues = inspectWeddingAddress(row).issues;
      if (!envelopeName) row.issues.push("Confirm the envelope name.");
      rows.push(row);
      if (row.sourceId) {
        const matches = households.get(row.sourceId) || [];
        matches.push(row); households.set(row.sourceId, matches);
      }
    }
  }
  for (const {source,fields} of gifts) {
    const matches = households.get(fields.sourceId || "") || [];
    if (matches.length !== 1) {
      const description = [fields.giftId,fields.gift].filter(Boolean).join(" · ");
      exceptions.push({source,gift:fields.gift || "",reason:(description ? description + " — " : "") + "Choose the giver before assigning this gift."}); continue;
    }
    const row = matches[0];
    row.gift = [row.gift, fields.gift].filter(Boolean).join("; ");
    row.alreadyThanked ||= thanked(fields.status); row.sources.push(source);
  }
  for (const [id, matches] of households) if (matches.length > 1) {
    exceptions.push({source:matches.map(r => r.source).join(", "),reason:"Several rows use household ID " + id + ". Check the separate records."});
  }
  return { importId,sheets,rows,exceptions,excerpts:parsed.excerpts,
    counts:{households:rows.length,guests:rows.reduce((sum,r)=>sum+r.guestCount,0),sourceRows,
      missingAddresses:rows.filter(r=>!inspectWeddingAddress(r).complete).length,alreadyThanked:rows.filter(r=>r.alreadyThanked).length} };
}
