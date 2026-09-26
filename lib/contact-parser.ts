import { SavedAddress, OccasionType } from "./types";
import { MONTH_NAMES, MONTH_SHORT_NAMES } from "./reminder-utils";

export interface ParsedContact {
  firstName: string;
  lastName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  label?: string;
  occasionType?: OccasionType;
  occasionTitle?: string;
  occasionMonth?: number;
  occasionDay?: number;
  occasionYear?: number;
  remindMe?: boolean;
  isValid: boolean;
  validationError?: string;
}

/**
 * Parses dates in various formats:
 * - "1990-04-18" or "04/18/1990" or "4/18/90"
 * - "04/18" or "4/18"
 * - "April 18" or "Apr 18" or "Apr 18, 1990"
 */
export function parseOccasionDate(dateStr: string): {
  month?: number;
  day?: number;
  year?: number;
} {
  if (!dateStr || typeof dateStr !== "string") return {};
  const cleaned = dateStr.trim();
  if (!cleaned) return {};

  // 1. Try ISO: YYYY-MM-DD or --MM-DD
  const isoMatch = cleaned.match(/^(\d{4})?-?(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1] ? parseInt(isoMatch[1], 10) : undefined;
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day, year };
    }
  }

  // 2. Try MM/DD/YYYY or M/D or MM/DD
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : undefined;
    if (year && year < 100) {
      year = year > 30 ? 1900 + year : 2000 + year;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { month, day, year };
    }
  }

  // 3. Try Word month: "April 18, 1990" or "Apr 18"
  const wordMatch = cleaned.match(
    /^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i
  );
  if (wordMatch) {
    const monthStr = wordMatch[1].toLowerCase();
    const day = parseInt(wordMatch[2], 10);
    const year = wordMatch[3] ? parseInt(wordMatch[3], 10) : undefined;

    let month: number | undefined;
    const fullIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(monthStr));
    if (fullIdx >= 0) {
      month = fullIdx + 1;
    } else {
      const shortIdx = MONTH_SHORT_NAMES.findIndex((m) => m.toLowerCase() === monthStr);
      if (shortIdx >= 0) month = shortIdx + 1;
    }

    if (month && day >= 1 && day <= 31) {
      return { month, day, year };
    }
  }

  return {};
}

/**
 * Splits CSV / TSV lines respecting quoted values with commas or quotes.
 */
function splitDelimitedLine(line: string, delimiter: string = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detects whether content is CSV or TSV (tab separated).
 */
function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

/**
 * Normalizes header names to known standard contact fields.
 */
function mapHeaderIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  headers.forEach((h, idx) => {
    const clean = h.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (["firstname", "first", "givenname", "fname"].includes(clean)) {
      map.firstName = idx;
    } else if (["lastname", "last", "familyname", "surname", "lname"].includes(clean)) {
      map.lastName = idx;
    } else if (["name", "fullname", "contactname", "recipient"].includes(clean)) {
      map.fullName = idx;
    } else if (
      [
        "streetaddress",
        "address",
        "address1",
        "street",
        "street1",
        "addressline1",
        "mailingaddress",
        "deliveryaddress",
      ].includes(clean)
    ) {
      map.street1 = idx;
    } else if (
      ["apt", "suite", "unit", "address2", "street2", "addressline2", "apartment"].includes(clean)
    ) {
      map.street2 = idx;
    } else if (["city", "town", "locality"].includes(clean)) {
      map.city = idx;
    } else if (["state", "province", "region", "st"].includes(clean)) {
      map.state = idx;
    } else if (["zip", "zipcode", "postalcode", "postcode", "zip5"].includes(clean)) {
      map.zip = idx;
    } else if (["country", "nation"].includes(clean)) {
      map.country = idx;
    } else if (["relationship", "label", "group", "tag", "category"].includes(clean)) {
      map.label = idx;
    } else if (
      ["birthday", "bday", "birthdate", "dob", "birthdaydate"].some((k) => clean.includes(k))
    ) {
      map.birthday = idx;
    } else if (["anniversary", "wedding"].some((k) => clean.includes(k))) {
      map.anniversary = idx;
    } else if (
      ["occasiontype", "eventtype"].some((k) => clean.includes(k)) ||
      clean === "occasion" ||
      clean === "event" ||
      clean === "milestone"
    ) {
      map.occasionType = idx;
    } else if (
      ["occasiondate", "eventdate", "celebrationdate"].some((k) => clean.includes(k)) ||
      clean === "date" ||
      (clean.includes("occasion") && clean.includes("date"))
    ) {
      map.occasionDate = idx;
    }
  });

  return map;
}

/**
 * Parses raw CSV or TSV text into an array of structured ParsedContact objects.
 */
export function parseContactsCsv(content: string): ParsedContact[] {
  if (!content || !content.trim()) return [];

  const rawLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return [];

  const delimiter = detectDelimiter(rawLines[0]);
  const headerTokens = splitDelimitedLine(rawLines[0], delimiter);
  const headerMap = mapHeaderIndex(headerTokens);

  // If no identifiable headers, check if row 1 is raw data
  const hasRecognizedHeaders =
    headerMap.firstName !== undefined ||
    headerMap.fullName !== undefined ||
    headerMap.street1 !== undefined;

  const dataLines = hasRecognizedHeaders ? rawLines.slice(1) : rawLines;
  const effectiveMap = hasRecognizedHeaders
    ? headerMap
    : {
        // Fallback default order: First, Last, Street1, Street2, City, State, ZIP
        firstName: 0,
        lastName: 1,
        street1: 2,
        street2: 3,
        city: 4,
        state: 5,
        zip: 6,
      };

  const contacts: ParsedContact[] = [];

  for (const line of dataLines) {
    const tokens = splitDelimitedLine(line, delimiter);
    if (tokens.every((t) => !t)) continue; // skip blank line

    let firstName = "";
    let lastName = "";

    if (effectiveMap.fullName !== undefined && tokens[effectiveMap.fullName]) {
      const full = tokens[effectiveMap.fullName].trim();
      const parts = full.split(/\s+/);
      if (parts.length === 1) {
        firstName = parts[0];
        lastName = "";
      } else {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
    }

    if (effectiveMap.firstName !== undefined && tokens[effectiveMap.firstName]) {
      firstName = tokens[effectiveMap.firstName].trim();
    }
    if (effectiveMap.lastName !== undefined && tokens[effectiveMap.lastName]) {
      lastName = tokens[effectiveMap.lastName].trim();
    }

    const street1 = effectiveMap.street1 !== undefined ? tokens[effectiveMap.street1] || "" : "";
    const street2 = effectiveMap.street2 !== undefined ? tokens[effectiveMap.street2] || "" : "";
    const city = effectiveMap.city !== undefined ? tokens[effectiveMap.city] || "" : "";
    let state = effectiveMap.state !== undefined ? tokens[effectiveMap.state] || "" : "";
    if (state.length > 2) {
      state = state.trim().slice(0, 2).toUpperCase();
    } else {
      state = state.trim().toUpperCase();
    }

    let zip = effectiveMap.zip !== undefined ? tokens[effectiveMap.zip] || "" : "";
    // Clean ZIP if it includes trailing hyphen or formatting
    zip = zip.trim();
    if (zip.length > 5 && zip.includes("-")) {
      zip = zip.split("-")[0];
    }

    const country =
      effectiveMap.country !== undefined && tokens[effectiveMap.country]
        ? tokens[effectiveMap.country].trim()
        : "USA";

    const label =
      effectiveMap.label !== undefined && tokens[effectiveMap.label]
        ? tokens[effectiveMap.label].trim()
        : "Friend";

    // Occasions & Dates
    let occasionType: OccasionType = "birthday";
    let occasionMonth: number | undefined;
    let occasionDay: number | undefined;
    let occasionYear: number | undefined;

    if (effectiveMap.birthday !== undefined && tokens[effectiveMap.birthday]) {
      const parsedBday = parseOccasionDate(tokens[effectiveMap.birthday]);
      if (parsedBday.month && parsedBday.day) {
        occasionType = "birthday";
        occasionMonth = parsedBday.month;
        occasionDay = parsedBday.day;
        occasionYear = parsedBday.year;
      }
    } else if (effectiveMap.anniversary !== undefined && tokens[effectiveMap.anniversary]) {
      const parsedAnniv = parseOccasionDate(tokens[effectiveMap.anniversary]);
      if (parsedAnniv.month && parsedAnniv.day) {
        occasionType = "anniversary";
        occasionMonth = parsedAnniv.month;
        occasionDay = parsedAnniv.day;
        occasionYear = parsedAnniv.year;
      }
    } else if (effectiveMap.occasionDate !== undefined && tokens[effectiveMap.occasionDate]) {
      const parsedDate = parseOccasionDate(tokens[effectiveMap.occasionDate]);
      if (parsedDate.month && parsedDate.day) {
        if (effectiveMap.occasionType !== undefined && tokens[effectiveMap.occasionType]) {
          const rawType = tokens[effectiveMap.occasionType].toLowerCase();
          if (["anniversary", "wedding"].some((s) => rawType.includes(s))) occasionType = "anniversary";
          else if (["holiday", "christmas"].some((s) => rawType.includes(s))) occasionType = "holiday";
          else if (["milestone", "grad"].some((s) => rawType.includes(s))) occasionType = "milestone";
          else occasionType = "birthday";
        }
        occasionMonth = parsedDate.month;
        occasionDay = parsedDate.day;
        occasionYear = parsedDate.year;
      }
    }

    // Validation
    const hasName = Boolean(firstName || lastName);
    const hasStreet = Boolean(street1);
    const hasCity = Boolean(city);
    const hasState = Boolean(state);
    const hasZip = Boolean(zip);

    const isValid = hasName && hasStreet && hasCity && hasState && hasZip;
    let validationError: string | undefined;

    if (!hasName) validationError = "Missing name";
    else if (!hasStreet) validationError = "Missing street address";
    else if (!hasCity || !hasState || !hasZip) validationError = "Incomplete city, state, or ZIP";

    contacts.push({
      firstName: firstName || "Friend",
      lastName,
      street1,
      street2,
      city,
      state,
      zip,
      country,
      label,
      occasionType,
      occasionTitle: `${firstName || "Contact"}'s ${occasionType === "birthday" ? "Birthday" : "Special Day"}`,
      occasionMonth,
      occasionDay,
      occasionYear,
      remindMe: Boolean(occasionMonth && occasionDay),
      isValid,
      validationError,
    });
  }

  return contacts;
}

/**
 * Parses vCard (.vcf) formatted strings (Apple Contacts / Google Contacts export).
 */
export function parseContactsVcard(vcfContent: string): ParsedContact[] {
  if (!vcfContent || !vcfContent.includes("BEGIN:VCARD")) return [];

  const cards = vcfContent.split(/BEGIN:VCARD/i).slice(1);
  const contacts: ParsedContact[] = [];

  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let firstName = "";
    let lastName = "";
    let street1 = "";
    let street2 = "";
    let city = "";
    let state = "";
    let zip = "";
    let country = "USA";
    let bdayStr = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // N:LastName;FirstName;Middle;Prefix;Suffix
      if (trimmed.startsWith("N:") || trimmed.startsWith("N;")) {
        const parts = trimmed.replace(/^N[^:]*:/, "").split(";");
        lastName = parts[0]?.trim() || "";
        firstName = parts[1]?.trim() || "";
      }
      // FN:FullName
      else if ((trimmed.startsWith("FN:") || trimmed.startsWith("FN;")) && !firstName) {
        const fullName = trimmed.replace(/^FN[^:]*:/, "").trim();
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || "";
      }
      // ADR:;;Street;City;State;ZIP;Country
      else if (trimmed.startsWith("ADR:") || trimmed.startsWith("ADR;")) {
        const parts = trimmed.replace(/^ADR[^:]*:/, "").split(";");
        // standard format: po_box; extended_addr; street; city; state; zip; country
        street2 = parts[1]?.trim() || "";
        street1 = parts[2]?.trim() || "";
        city = parts[3]?.trim() || "";
        state = (parts[4]?.trim() || "").slice(0, 2).toUpperCase();
        zip = parts[5]?.trim() || "";
        country = parts[6]?.trim() || "USA";
      }
      // BDAY:YYYY-MM-DD
      else if (trimmed.startsWith("BDAY:") || trimmed.startsWith("BDAY;")) {
        bdayStr = trimmed.replace(/^BDAY[^:]*:/, "").trim();
      }
    }

    const dateResult = bdayStr ? parseOccasionDate(bdayStr) : {};

    const hasName = Boolean(firstName || lastName);
    const hasStreet = Boolean(street1);
    const hasCity = Boolean(city);
    const hasState = Boolean(state);
    const hasZip = Boolean(zip);

    const isValid = hasName && hasStreet && hasCity && hasState && hasZip;
    let validationError: string | undefined;

    if (!hasName) validationError = "Missing name";
    else if (!hasStreet) validationError = "Missing street address";
    else if (!hasCity || !hasState || !hasZip) validationError = "Incomplete address details";

    if (hasName || hasStreet) {
      contacts.push({
        firstName: firstName || "Friend",
        lastName,
        street1,
        street2,
        city,
        state,
        zip,
        country,
        label: "Contact",
        occasionType: "birthday",
        occasionTitle: `${firstName || "Friend"}'s Birthday`,
        occasionMonth: dateResult.month,
        occasionDay: dateResult.day,
        occasionYear: dateResult.year,
        remindMe: Boolean(dateResult.month && dateResult.day),
        isValid,
        validationError,
      });
    }
  }

  return contacts;
}

/**
 * Universal contact list parser: handles CSV, TSV, or vCard.
 */
export function parseContactData(raw: string): ParsedContact[] {
  if (raw.includes("BEGIN:VCARD")) {
    return parseContactsVcard(raw);
  }
  return parseContactsCsv(raw);
}

/**
 * Downloadable Sample CSV Template
 */
export const SAMPLE_CONTACTS_CSV = `First Name,Last Name,Street Address,Apt or Suite,City,State,ZIP Code,Relationship,Occasion Type,Occasion Date (MM/DD)
Sarah,Jenkins,742 Evergreen Terrace,,Springfield,OR,97477,Mom,Birthday,04/18
Michael,Brooks,1200 Grand Avenue,Suite 300,Chicago,IL,60611,Client,Anniversary,06/22
Emma,Watson,350 Fifth Ave,Apt 14B,New York,NY,10118,Best Friend,Birthday,10/05`;
