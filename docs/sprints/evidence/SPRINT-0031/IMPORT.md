# Wedding list intake

The local fixture run uses synthetic families, a disk-backed Firestore adapter and private temporary objects. Run `npm run test:wedding` to include these checks. The hosted runner is `hosted-import.mjs`. Its output records which hosted checks actually passed.

| Fixture | Observed local result |
| --- | --- |
| 100-household CSV | 160 named guests, 100 households, no missing address fields. ZIP 02108 is preserved. |
| Planner TSV | Eight households, two incomplete addresses, one already thanked. Matching names and shared addresses remain separate. |
| Contacts vCard | Four households, three structurally complete addresses. |
| Registry and mailing workbook | Both sheets and all 22 source records reconciled. The two gifts for H002 are attached to one household. G12 stays unresolved and H007 is marked for exclusion. Shipping labels do not enter the mailing fields. |
| Free-form family notes | Five original passages available for private review. The sender chooses an excerpt or enters the household manually. No automatic provider request. |

**Workbook implementation.** ExcelJS 4.4.0’s streaming reader returned one anonymous worksheet with zero rows for the sprint’s two-sheet namespace-prefixed XLSX. The implementation instead reads the allowed Office Open XML parts directly with yauzl 3.4.0 and saxes 6.0.0. CSV and TSV use csv-parse 7.0.3. The dependency advisory query on November 18, 2026 returned no advisories for these three packages or their pend and xmlchars dependencies. The application dependency tree has separate existing advisories, including Next.js. This check covers the pinned intake dependency versions on that date.

**Checks and exposure.** Text is decoded as UTF-8, records preserve embedded newlines, and spreadsheets retain shared strings and simple zero-padded numerical postal codes. The parser rejects unsupported workbook parts, formula cells, external relationships and encrypted entries. A separate worker thread enforces a 15-second parsing deadline and heap limits on the app runtime. It receives file bytes with an empty environment. The input is capped at 5 MiB, with 25 MiB of actual inflated XML, 10 worksheets, 2,000 data rows, 64 columns and 16 KiB per cell. Small test budgets exercise the same workbook limits against the normal fixture. The intake API requires a current pilot entitlement and a project session. Reservations limit concurrent imports to two per project, six across instances and two active parses per process.

An immutable private object holds the pending file while it is checked. After processing, the raw object is deleted. The normalized review copy can be reopened for seven days. Scheduled upload cleanup removes expired copies and abandoned pending objects. No original file download endpoint exists. No malware scanner ran in these checks.
