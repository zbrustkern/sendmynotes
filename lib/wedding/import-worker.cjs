"use strict";
// Runs in a bounded worker thread. Only validated table data crosses the boundary.
const { parentPort, workerData } = require("node:worker_threads");
const { TextDecoder } = require("node:util");
const { parse } = require("csv-parse/sync");
const yauzl = require("yauzl");
const { SaxesParser } = require("saxes");
const { posix } = require("node:path");
const LIMIT = { bytes: 5 * 1024 ** 2, inflated: 25 * 1024 ** 2, parts: 150, sheets: 10, rows: 2000, columns: 64, cell: 16384 };
class FileCheckError extends Error {}
function invalid(message) { throw new FileCheckError(message); }
function plainText(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { invalid("Save the file as UTF-8 text, or export your list as CSV."); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) invalid("The file contains unsupported binary data. Export a plain CSV.");
  return text;
}
function checkCells(cells) {
  if (cells.length > LIMIT.columns || cells.some(cell => Buffer.byteLength(cell) > LIMIT.cell))
    invalid("Keep at most 64 columns and 16 KiB per cell, then try the list again.");
  return cells;
}
const addressFields = ["First Name", "Last Name", "Envelope name", "Address line 1", "Address line 2", "City", "State", "ZIP", "Country"];
function parseContacts(input) {
  const records = [{ line: 0, cells: addressFields }];
  let values;
  const text = input.replace(/\r?\n[ \t]/g, "");
  const split = value => value.split(/(?<!\\);/g).map(v => v.replace(/\\([nN,;\\])/g, (_, x) => /n/i.test(x) ? "\n" : x));
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      if (values) invalid("This vCard has an incomplete contact.");
      values = { line: index + 1, cells: Array(9).fill(""), addr: false }; continue;
    }
    if (!values) invalid("Choose a vCard file or export your contacts as CSV.");
    if (/^END:VCARD$/i.test(line)) {
      records.push({ line: values.line, cells: checkCells(values.cells) }); values = null;
      if (records.length > LIMIT.rows + 1) invalid("Split the file into lists of at most 2,000 rows.");
      continue;
    }
    const key = line.indexOf(":");
    if (key < 1) invalid("A vCard property is incomplete.");
    const property = line.slice(0, key).split(";")[0].split(".").pop().toUpperCase();
    const val = line.slice(key + 1);
    if (property === "N") { const [last, first] = split(val); values.cells[0] = first || ""; values.cells[1] = last || ""; }
    if (property === "FN") values.cells[2] = split(val).join(";");
    if (property === "ADR" && (!values.addr || /(?:^|[;,=])PREF(?:$|[;,=:])/i.test(line.slice(0, key)))) {
      const fields = split(val);
      values.cells.splice(3, 6, fields[2] || "", fields[1] || "", fields[3] || "", fields[4] || "", fields[5] || "", fields[6] || ""); values.addr = true;
    }
  }
  if (values || records.length < 2) invalid("This vCard is incomplete. Export the contacts again.");
  return records;
}
function parseDelimited(text, delimiter) {
  const records = [];
  try {
    parse(text, { delimiter, bom: true, skip_empty_lines: true, max_record_size: 128 * 1024,
      on_record(cells, info) {
        checkCells(cells); records.push({ line: info.lines, cells });
        if (records.length > LIMIT.rows + 1) invalid("Split the file into lists of at most 2,000 rows.");
        return null;
      },
    });
  } catch (err) { if (String(err.code || "").startsWith("CSV_")) invalid("The columns or quotation marks are inconsistent. Export a fresh CSV or TSV."); throw err; }
  if (records.length < 2) invalid("Include a header row and at least one guest or gift row.");
  return records;
}
const sheetNS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const utf = () => new TextDecoder("utf-8", { fatal: true });
function openArchive(bytes) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true }, (err, zip) => err ? reject(err) : resolve(zip)));
}
const allowedPart = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|xl\/(?:workbook|styles|sharedStrings|calcChain|metadata)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/theme\/theme\d+\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/worksheets\/_rels\/sheet\d+\.xml\.rels)$/;
function streamFor(zip, entry) {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (err, stream) => err ? reject(err) : resolve(stream)));
}
function columnIndex(ref) {
  const match = /^([A-Z]{1,3})[1-9][0-9]{0,6}$/.exec(ref || "");
  if (!match) invalid("A workbook cell has an invalid position.");
  let n = 0;
  for (const c of match[1]) n = n * 26 + c.charCodeAt(0) - 64;
  if (n > LIMIT.columns) invalid("Reduce the sheet to at most 64 columns.");
  return n - 1;
}
async function parseWorkbook(bytes, limits = LIMIT) {
  if (bytes.readUInt32LE(0) !== 0x04034b50) invalid("Choose a plain .xlsx workbook or export a CSV.");
  const zip = await openArchive(bytes);
  if (zip.entryCount > limits.parts) { zip.close(); invalid("This workbook has too many parts. Export the mailing sheet as CSV."); }
  const entries = new Map();
  try {
    let declared = 0;
    await new Promise((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", entry => {
        try {
          if (/\/$/.test(entry.fileName) && !entry.uncompressedSize) { zip.readEntry(); return; }
          if (!allowedPart.test(entry.fileName) || entries.has(entry.fileName) || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod))
            invalid("Use a plain workbook without embedded content, encryption or external links, or export a CSV.");
          declared += entry.uncompressedSize;
          if (declared > limits.inflated) invalid("This workbook expands beyond 25 MiB. Export or split the mailing sheet.");
          entries.set(entry.fileName, entry); zip.readEntry();
        } catch (e) { reject(e); }
      });
      zip.readEntry();
    });
    const actualSheets = [...entries.keys()].filter(x => /^xl\/worksheets\/sheet\d+\.xml$/.test(x));
    if (!actualSheets.length || actualSheets.length > limits.sheets) invalid("Choose a workbook with one to ten sheets.");
    const strings = [], definitions = [], relationships = new Map(), sheetParts = new Map();
    const numberFormats = new Map(), styles = [];
    let inflated = 0, rows = 0, workbookOverride, defaultXml;
    const mainType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
    for (const key of ["[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "_rels/.rels"]) {
      if (!entries.has(key)) invalid("The workbook structure is incomplete. Export a fresh file.");
    }
    const ordered = [...entries.keys()].sort((a,b) => Number(actualSheets.includes(a)) - Number(actualSheets.includes(b)));
    for (const name of ordered) {
      const isSheet = actualSheets.includes(name), isShared = name === "xl/sharedStrings.xml", records = [];
      const parser = new SaxesParser({ xmlns: true });
      let row, line, cell, capture, str, depth = 0, seen = new Set(), inCellFormats = false;
      parser.on("doctype", () => invalid("Unsupported workbook declaration. Export a plain CSV."));
      parser.on("opentag", t => {
        if (++depth > 64) invalid("The workbook structure is too deep.");
        const tag = t.local, attrs = Object.values(t.attributes);
        const attr = (name, ns) => attrs.find(a => a.local === name && (ns === undefined || a.uri === ns))?.value || "";
        if (name.endsWith(".rels") && tag === "Relationship") {
          const target = attr("Target");
          if (/external/i.test(attr("TargetMode")) || /^[A-Za-z][\w+.-]*:|^\/\/|\\/.test(target)) invalid("This workbook links to an external resource. Export the mailing sheet as CSV.");
          if (name === "xl/_rels/workbook.xml.rels" && attr("Type") === relNS + "/worksheet") {
            const path = target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join("xl", target));
            const id = attr("Id"); if (relationships.has(id)) invalid("Duplicate workbook relationship.");
            relationships.set(id, path);
          }
        }
        if (name === "[Content_Types].xml") {
          const type = attr("ContentType");
          if (/macro|vba|oleObject|externalLink|activeX/i.test(type)) invalid("Export a workbook without active or embedded content.");
          if (tag === "Override" && attr("PartName") === "/xl/workbook.xml") workbookOverride = type;
          if (tag === "Default" && attr("Extension") === "xml") defaultXml = type;
        }
        if (t.uri !== sheetNS) return;
        if (name === "xl/workbook.xml" && tag === "sheet") {
          if (definitions.length >= limits.sheets) invalid("Choose up to ten sheets.");
          definitions.push({ name: attr("name"), rid: attr("id", relNS) });
        }
        if (name === "xl/styles.xml") {
          if (tag === "numFmt") { if (numberFormats.size >= 2048) invalid("Too many number formats."); numberFormats.set(attr("numFmtId"), attr("formatCode")); }
          if (tag === "cellXfs") inCellFormats = true;
          if (inCellFormats && tag === "xf") { if (styles.length >= 8192) invalid("Too many cell styles."); styles.push(attr("numFmtId")); }
        }
        if (isShared && tag === "si") { if (strings.length >= 128000) invalid("Too many workbook strings."); str = ""; }
        if (isShared && str !== undefined && tag === "t") capture = "string";
        if (!isSheet) return;
        if (tag === "row") {
          if (++rows > limits.rows + actualSheets.length) invalid("Split the workbook into at most 2,000 data rows.");
          row = []; seen = new Set(); line = Number(attr("r")) || records.length + 1;
        }
        if (tag === "c" && row) {
          let col = attr("r") ? columnIndex(attr("r")) : row.length;
          if (col >= limits.columns || seen.has(col)) invalid("Invalid or repeated column in the workbook.");
          seen.add(col); cell = { col, type: attr("t"), style: attr("s"), value: "" };
        }
        if (tag === "f" && cell) invalid("This workbook contains formulas. Paste values into a new sheet or export a CSV.");
        if (cell && (tag === "v" || tag === "t")) capture = "cell";
      });
      parser.on("text", v => {
        if (capture === "cell") { cell.value += v; if (cell.value.length > limits.cell) invalid("A cell exceeds 16 KiB."); }
        if (capture === "string") { str += v; if (str.length > limits.cell) invalid("A shared string exceeds 16 KiB."); }
      });
      parser.on("closetag", t => {
        depth--; if (t.uri !== sheetNS) return;
        if (t.local === "cellXfs") inCellFormats = false;
        if (["t","v"].includes(t.local)) capture = undefined;
        if (isShared && t.local === "si") { if (Buffer.byteLength(str) > limits.cell) invalid("A shared string exceeds 16 KiB."); strings.push(str); str = undefined; }
        if (isSheet && t.local === "c" && cell) {
          let value = cell.value;
          if (cell.type === "s") {
            if (!/^\d+$/.test(value) || strings[Number(value)] === undefined) invalid("Unresolved shared string in the workbook.");
            value = strings[Number(value)];
          } else if ((!cell.type || cell.type === "n") && /^\d+$/.test(value)) {
            const mask = numberFormats.get(styles[Number(cell.style)]);
            if (mask && /^0{2,20}$/.test(mask)) value = value.padStart(mask.length, "0");
          }
          row[cell.col] = value; cell = undefined;
        }
        if (isSheet && t.local === "row" && row) {
          const cells = checkCells(Array.from(row, v => v || ""));
          if (cells.some(Boolean)) records.push({line, cells}); row = undefined;
        }
      });
      const decoder = utf(), stream = await streamFor(zip, entries.get(name));
      for await (const chunk of stream) {
        inflated += chunk.length;
        if (inflated > limits.inflated) invalid("This workbook expands beyond 25 MiB. Export or split the mailing sheet.");
        parser.write(decoder.decode(chunk, { stream: true }));
      }
      parser.write(decoder.decode()).close();
      if (isSheet) sheetParts.set(name, records);
    }
    if ((workbookOverride || defaultXml) !== mainType || !definitions.length) invalid("This is not a plain XLSX workbook.");
    const names = new Set(), used = new Set();
    const tables = definitions.map(def => {
      const part = relationships.get(def.rid);
      if (!def.name || def.name.length > 128 || names.has(def.name) || !sheetParts.has(part) || used.has(part))
        invalid("The workbook has an unreadable sheet. Export it as CSV.");
      names.add(def.name); used.add(part);
      return { name: def.name, records: sheetParts.get(part) };
    });
    if (used.size !== sheetParts.size) invalid("The workbook sheet list is inconsistent.");
    return tables;
  } finally { zip.close(); }
}
async function parseInput(buffer, format) {
  if (!buffer.length || buffer.length > LIMIT.bytes) invalid("Choose a list of up to 5 MiB.");
  if (format === "xlsx") {
    try { return { tables: await parseWorkbook(buffer), excerpts: [] }; }
    catch (err) { if (!(err instanceof FileCheckError))
      invalid("This workbook could not be read. Export a plain XLSX or CSV."); throw err; }
  }
  const text = plainText(buffer);
  if (format === "txt") {
    if (/^\s*(?:<|PK|%PDF|\{\\rtf)/i.test(text)) invalid("Choose a plain UTF-8 text note.");
    const excerpts = text.split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!excerpts.length || excerpts.length > LIMIT.rows || excerpts.some(s => Buffer.byteLength(s) > LIMIT.cell)) invalid("Split the notes into shorter passages, up to 16 KiB each.");
    return { tables: [], excerpts };
  }
  if (!["vcf","csv","tsv"].includes(format)) invalid("Unsupported list format.");
  return { tables: [{ name: format === "vcf" ? "Contacts" : "Guest list", records: format === "vcf" ? parseContacts(text) : parseDelimited(text, format === "csv" ? "," : "\t") }], excerpts: [] };
}
if (parentPort) parseInput(Buffer.from(workerData.bytes), workerData.format)
  .then(data => parentPort.postMessage({ data }), error => parentPort.postMessage({ error: String(error.message || "").slice(0,220) }));
module.exports = { parseInput, parseWorkbook, limits: Object.freeze(LIMIT) };
