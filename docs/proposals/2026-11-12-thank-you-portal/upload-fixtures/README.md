# Wedding upload test files

All people, addresses, gifts and notes are fictional. The street and city combinations are deliberate test values. “Complete” below means that the current contact parser found the required fields. A postal service has not verified these addresses.

## Current address book

Use **Account → Address book → Import a contact file** to preview the CSV, TSV or vCard. The current importer extracts contacts with field rules. It does not keep gift details, relationships between spreadsheet rows, additional guests, or thank-you status as wedding records.

| File | What to expect in the contact preview | What the wedding importer should eventually preserve |
| --- | --- | --- |
| [100-household CSV](01-households-100.csv) | 100 complete primary contacts, exactly one import request’s capacity. ZIP `02108` retains its leading zero. | 160 named guests across 100 intended envelopes, 60 joint envelopes, 100 gift descriptions. |
| [Planner’s TSV](02-planner-exceptions.tsv) | 8 contacts parsed, 6 complete. T04 has no street and T05 has no ZIP. | Keep the two people called Mira Quill distinct. T01 and T03 share an address and have different gifts. Suggest excluding T06, already thanked. T07 needs general wording or a supplied gift. With that wording and sender confirmation, five have complete address fields and are still owed a note. |
| [Phone contacts vCard](03-phone-contacts.vcf) | 4 contacts parsed, 3 complete, including two Mira Quills. The final contact lacks a street. | Keep independent records for the sender to review. No gift or household assignment is available from this file. |

## Proposed wedding importer

| File | Acceptance criteria |
| --- | --- |
| [Registry and address workbook](04-registry-and-addresses.xlsx) | Read both sheets. Reconcile 10 household rows and 12 gift rows. Join 11 gifts by household ID, suggest one note for H002’s two gifts, ask who gave G12, hold H005 for a missing street, and propose excluding H007 as already thanked. Use the mailing sheet for envelopes. Every registry shipping label is the couple’s address. |
| [Family’s free-form notes](05-family-notes.txt) | Extract one joint envelope and one verbatim message for Noor and Kit. Hold Anaïs for a new address, mark Robin as already thanked, and ask who “M.” is. Never substitute the couple’s shipping address or decide which M. gave the vase. |

The workbook tests the proposed structured import. The text file tests an optional assisted mapping path. Dropping prose or an Excel workbook into the current contact upload control does not exercise those capabilities.
