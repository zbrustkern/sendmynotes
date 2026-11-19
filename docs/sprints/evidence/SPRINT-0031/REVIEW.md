# Wedding thank-you portal on staging

Open the [wedding portal](https://staging.sendmynotes.com/thank-you/wedding) and choose **Try a sample list** to work with 100 fictional households. **Start my thank-yous** opens an empty project. Both the staging homepage and the ordinary send flow link to thank-you projects. A private guest session is sufficient to try manual editing and recovery. An invited tester or a linked approved staging account can upload a guest list, upload a photo and use AI.

## What to try

1. Choose a photo, adjust its crop and inspect the finished front. Use **People** to import a list. The five [fictional input files and expected results](../../../proposals/2026-11-12-thank-you-portal/upload-fixtures/README.md) include a registry workbook and informal gift notes.
2. Confirm the names to write inside each card. Write one shared body and personalize two households. Approve the two personal cards individually and approve the remaining shared wording together. Incomplete addresses can wait while other households move ahead.
3. Review the per-envelope estimate, carry unfinished cards into the next purchase and reopen the tracker. One project holds up to 250 households. Each checkout accepts 1–100 ready cards. Several named guests can share one envelope.
4. A verified owner can grant a linked partner permission to pay, export, both or neither. Participants can also use single-use recovery and household-only address links. In staging, a verified operator can create an independent tester invitation under **Manage sharing, recovery and tracker**.

## Price and delivery

The pilot uses cumulative graduated rates. Cards 1–10 cost $9 each, 11–25 cost $7.50, 26–99 cost $7 and card 100 onward costs $6.50. Each supported international envelope adds $5. Displayed USD prices include tax, and checkout adds no tax. The versioned tax calculator stores per-card allocations and policy information with each settled purchase. Historical receipts remain readable when the configured policy changes.

| 100-envelope test | First 98 | Last two | Gross |
| --- | ---: | ---: | ---: |
| Domestic | $713.50 | $13.50 | $727.00 |
| Canada, UK and France plus 97 US envelopes | $723.50 | $18.50 | $742.00 |

H099’s frozen allocation was $7 for the card and $5 for international mailing. One $12 test refund left $730 before processing fees. The mixed project retained all 100 earned pricing positions. The final two cards reached held status with all clients limited to read-only status polling. [Stripe acceptance](hosted-finance.json)

Staging uses Stripe test mode and a supplier hold. The destination evidence includes the actual Handwrytten IDs and the USPS suspension table comparison. Postal ambiguity tests use controlled adapter results. Supplier delivery, physical fit and production availability require separate verification. [Destination receipt](destinations.json) · [USPS international service alerts](https://about.usps.com/newsroom/service-alerts/international/)

## Verification

| Sprint cases | Evidence and scope |
| --- | --- |
| V1 · Discovery and recovery | Hosted desktop and mobile journeys, fresh-device recovery, one-time invites, 250-household limit, partner edits, conflicting save, household-only address request and session revocation. [Browser checks](hosted-ui/writing-checks.json) · [Sharing checks](hosted-checkout-sharing.json) |
| V2 · Artwork | Real private staging upload, normalized 1,275 × 1,650 master, crop, lettering, acceptance and reload. Local regression tests cover revoked grants, cross-project access and private Studio/library transfers. A separate $9 test purchase retained the identical approved front bytes and personalized text after the project design changed. Another project owner received 404 for all private copies. [Import and artwork receipt](hosted-import.json) · [Frozen paid card](hosted-paid-cover.json) |
| V3–V4 · List and gift intake | Hosted CSV, TSV, vCard, XLSX and plain text. The 100-household file contained 160 guests and replay added zero households. Both workbook sheets reconciled. A sender-selected prose excerpt yielded a real provider suggestion. A malformed workbook preserved the prior accepted front and rows. [Hosted intake](hosted-import.json) · [Parser decisions and limits](IMPORT.md) |
| V5 · Writing | Hosted browser exercised two individually approved cards and 98 shared approvals. A shared edit reopened the 98 inheriting cards. Local regressions cover templates, approval fingerprints and unpublished AI suggestions. [Writing checks](hosted-ui/writing-checks.json) |
| V6, V8, V10 · Payments and international | The financial runner reconciles two independent 98+2 projects, card snapshots, cumulative ordinals, the mixed H099 refund, and settlement without a return browser. Local fault fixtures cover capture races, retry, inclusive/added tax adapters and fair scheduling. A one-card project completed in the first scheduler pass while a 100-card project had materialized 20 cards. [Financial acceptance procedure](FINANCIAL-ACCEPTANCE.md) |
| V7 · Access and compatibility | The hosted v1 transfer preserved a joint greeting, an explicitly blank greeting, the shared body and the original draft. Local regressions cover original checkout recovery and v1 checkout routes. [Transfer receipt](hosted-ui/transfer-checks.json) · [Local keyboard and magnification checks](local-ui/writing-checks.json) |
| V9 · Fit and privacy | Whole-note boundaries of 449, 450 and 451 UTF-16 units, private export, grant revocation and preservation of paid artwork. Staging Firestore denies browser access. The private bucket enforces public access prevention. Pending objects have a seven-day lifecycle backstop. Deleted objects have an additional seven-day operator recovery window under the bucket’s existing soft-delete policy. [Platform checks](platform.json) · [Bucket policy](bucket-retention.json) |
| V11 · AI and uploads | File submission and AI require a project-scoped pilot invite or a linked approved account. Local tests exercise hard parser limits, rejection, untrusted input, stale revisions, idempotency, uncertain provider calls and manual recovery. The first hosted checkpoint exposed a retired text model. The replacement completed real mapping and note generation on staging. The invited guest paused at five and resumed to 100 distinct, unapproved suggested bodies. An original illustration and a photo treatment both succeeded. A third image required sign-in before reserving cost. [First checkpoint](hosted-31a-import.json) · [Hosted intake](hosted-import.json) · [Bulk AI and images](hosted-bulk-ai.json) |
| V12 · Delegated permissions | Two disposable verified accounts exercised export-only, pay-only and combined grants. Owner/partner concurrent attempts produced one reservation. Removing the payer’s grant canceled an open Stripe test intent through scheduled reconciliation. The synthetic Firebase users were removed. [Hosted permission checks](hosted-checkout-sharing.json) |

The 100-draft job reached its terminal state in 191.579 seconds. Including both real image generations and the sign-in challenge, the test took 243.328 seconds. The project recorded $8 in conservative AI budget reservations against a $15 rolling 24-hour ceiling. Invoiced AI cost is unknown. Each 98-card financial manifest committed in five chunks of 20, 20, 20, 20 and 18. All four test batches finished materializing, with no remaining due time. [AI measurements](hosted-bulk-ai.json) · [Manifest timings](finance-timings.json)

The automated writing, import, private-storage and Stripe runs use only fictional data. Browser timings and screenshots describe automated journeys. The sprint calls for the founder and 3–5 testers to try a 100-household list on phone and laptop. No participant observations have been submitted. Usability acceptance remains open.

## Release and operations

The writing checkpoint and checkout checkpoint ran on the existing Firebase App Hosting staging backend. Only staging received the wedding release flags. The existing daily private-upload cleanup runs alongside a separate every-minute wedding reconciliation job. A 180-day draft window and a seven-day cleanup grace period apply to private project data. The cleanup verifies frozen purchases before retiring remaining unpaid drafts. It retains the identifiers required to reconcile an ambiguous provider invocation. No fulfillment script was run.

The pilot uses bounded parsing, type checks and photo normalization for accepted formats. It uses no custom antivirus scanner. The workbook parser changed to yauzl and saxes after the originally proposed reader returned zero rows for the supplied workbook. Spend figures from the app are conservative quota reservations; provider settlement or billing exports are needed for invoiced cost. [Local verification contract](CORE.md) · [31A deployment](hosted-31a-rollout.json) · [31B deployment](hosted-31b-rollout.json)
