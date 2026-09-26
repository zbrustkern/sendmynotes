import assert from "assert";
import {
  parseContactData,
  parseContactsCsv,
  parseContactsVcard,
  parseOccasionDate,
  SAMPLE_CONTACTS_CSV,
} from "../lib/contact-parser";

async function runParserTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING CONTACT LIST PARSER & IMPORT TESTS");
  console.log("=================================================\n");

  // 1. Test Date Parsing Variations
  console.log("--- 1. Testing Occasion Date Parser ---");
  const isoDate = parseOccasionDate("1985-04-18");
  assert.strictEqual(isoDate.month, 4);
  assert.strictEqual(isoDate.day, 18);
  assert.strictEqual(isoDate.year, 1985);
  console.log("✅ PASS: ISO format '1985-04-18' parsed: Month 4, Day 18, Year 1985");

  const slashDate = parseOccasionDate("12/25/1990");
  assert.strictEqual(slashDate.month, 12);
  assert.strictEqual(slashDate.day, 25);
  assert.strictEqual(slashDate.year, 1990);
  console.log("✅ PASS: Slash format '12/25/1990' parsed: Month 12, Day 25, Year 1990");

  const shortDate = parseOccasionDate("6/22");
  assert.strictEqual(shortDate.month, 6);
  assert.strictEqual(shortDate.day, 22);
  assert.strictEqual(shortDate.year, undefined);
  console.log("✅ PASS: Short format '6/22' parsed: Month 6, Day 22");

  const wordDate = parseOccasionDate("October 5th, 1978");
  assert.strictEqual(wordDate.month, 10);
  assert.strictEqual(wordDate.day, 5);
  assert.strictEqual(wordDate.year, 1978);
  console.log("✅ PASS: Word format 'October 5th, 1978' parsed: Month 10, Day 5, Year 1978");

  // 2. Test Sample CSV Parsing
  console.log("\n--- 2. Testing Sample CSV Template Parsing ---");
  const parsedSample = parseContactsCsv(SAMPLE_CONTACTS_CSV);
  assert.strictEqual(parsedSample.length, 3);
  assert.strictEqual(parsedSample[0].firstName, "Sarah");
  assert.strictEqual(parsedSample[0].lastName, "Jenkins");
  assert.strictEqual(parsedSample[0].street1, "742 Evergreen Terrace");
  assert.strictEqual(parsedSample[0].city, "Springfield");
  assert.strictEqual(parsedSample[0].state, "OR");
  assert.strictEqual(parsedSample[0].zip, "97477");
  assert.strictEqual(parsedSample[0].occasionMonth, 4);
  assert.strictEqual(parsedSample[0].occasionDay, 18);
  assert.strictEqual(parsedSample[0].isValid, true);
  console.log("✅ PASS: Sample CSV parsed 3 contacts with 100% address & occasion fidelity");

  // 3. Test Quoted CSV Values (commas in addresses)
  console.log("\n--- 3. Testing Quoted CSV Values ---");
  const quotedCsv = `First,Last,Address,City,State,ZIP
"Eleanor","Vance","1200 Beacon St, Apt 4B","Brookline","MA","02446"`;
  const parsedQuoted = parseContactsCsv(quotedCsv);
  assert.strictEqual(parsedQuoted.length, 1);
  assert.strictEqual(parsedQuoted[0].firstName, "Eleanor");
  assert.strictEqual(parsedQuoted[0].street1, "1200 Beacon St, Apt 4B");
  assert.strictEqual(parsedQuoted[0].city, "Brookline");
  assert.strictEqual(parsedQuoted[0].state, "MA");
  assert.strictEqual(parsedQuoted[0].zip, "02446");
  assert.strictEqual(parsedQuoted[0].isValid, true);
  console.log("✅ PASS: Commas inside quoted addresses handled cleanly without column shift");

  // 4. Test Excel / Google Sheets Pasted TSV (Tab-separated)
  console.log("\n--- 4. Testing Excel / Google Sheets Pasted TSV ---");
  const tsvPasted = `First Name\tLast Name\tStreet Address\tCity\tState\tZIP\tBirthday
Alexander\tHamilton\t57 Maiden Lane\tNew York\tNY\t10038\t01/11/1757`;
  const parsedTsv = parseContactData(tsvPasted);
  assert.strictEqual(parsedTsv.length, 1);
  assert.strictEqual(parsedTsv[0].firstName, "Alexander");
  assert.strictEqual(parsedTsv[0].lastName, "Hamilton");
  assert.strictEqual(parsedTsv[0].city, "New York");
  assert.strictEqual(parsedTsv[0].state, "NY");
  assert.strictEqual(parsedTsv[0].zip, "10038");
  assert.strictEqual(parsedTsv[0].occasionMonth, 1);
  assert.strictEqual(parsedTsv[0].occasionDay, 11);
  console.log("✅ PASS: Tab-delimited spreadsheet paste recognized and parsed automatically");

  // 5. Test Apple Contacts / Google Contacts vCard (.vcf)
  console.log("\n--- 5. Testing Apple / Google Contacts vCard (.vcf) ---");
  const vcfData = `BEGIN:VCARD
VERSION:3.0
N:Swift;Taylor;;;
FN:Taylor Swift
ADR;TYPE=HOME:;;1540 Broadway;New York;NY;10036;USA
BDAY:1989-12-13
END:VCARD`;
  const parsedVcf = parseContactsVcard(vcfData);
  assert.strictEqual(parsedVcf.length, 1);
  assert.strictEqual(parsedVcf[0].firstName, "Taylor");
  assert.strictEqual(parsedVcf[0].lastName, "Swift");
  assert.strictEqual(parsedVcf[0].street1, "1540 Broadway");
  assert.strictEqual(parsedVcf[0].city, "New York");
  assert.strictEqual(parsedVcf[0].state, "NY");
  assert.strictEqual(parsedVcf[0].zip, "10036");
  assert.strictEqual(parsedVcf[0].occasionMonth, 12);
  assert.strictEqual(parsedVcf[0].occasionDay, 13);
  assert.strictEqual(parsedVcf[0].isValid, true);
  console.log("✅ PASS: vCard (.vcf) parsed from standard Apple/Google Contacts export format");

  // 6. Test Incomplete Address Flagging
  console.log("\n--- 6. Testing Incomplete Address Detection ---");
  const invalidCsv = `Name,Address,City,State,ZIP
Jane Doe,,Chicago,IL,`;
  const parsedInvalid = parseContactsCsv(invalidCsv);
  assert.strictEqual(parsedInvalid.length, 1);
  assert.strictEqual(parsedInvalid[0].isValid, false);
  assert.ok(parsedInvalid[0].validationError?.includes("street address"));
  console.log("✅ PASS: Incomplete records gracefully flagged with clear validation errors");

  console.log("\n=================================================");
  console.log("All Contact List Parser Tests Passed! 📁✨");
  console.log("=================================================\n");
}

runParserTests().catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
