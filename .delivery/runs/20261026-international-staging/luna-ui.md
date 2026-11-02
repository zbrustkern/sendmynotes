# International mailing UI implementation

Date: 2026-10-26. Scope: customer-facing UI and draft handling in the isolated candidate checkout. No commit, deployment, live charge, fulfillment action, email send, or supplier request was made.

## Changes

- Wired the active `/new` `EntryPrototypeClient` flow and the alternate `/send` `TargetPurchaseExperience` flow to the server-owned `/api/mailing-options` catalog. The UI shows the international editor only when `previewAvailable` or `enabled` is returned; it does not hardcode a three-country list. Catalog options are alphabetized, required region/postal fields follow server metadata, and postal values remain text.
- Added an “International? +$5” address sheet with country first, explicit total, a US return address, preview-only messaging, and save/cancel behavior. Domestic and international recipient drafts are kept separately so switching destinations and returning to the editor restores the respective address. The sheet supports Escape, traps keyboard focus, and restores focus to its trigger.
- Prevented address deferral for international recipients and preserved legacy US aliases as domestic. Saved country and alphanumeric postal data survive draft serialization and are included in checkout recipient requests.
- Threaded server quote totals and destination identity into payment review, confirmation, order detail, selected-order headers/action bars, and transactional receipt copy. Domestic $9 marketing copy is unchanged. Full base discounts still leave the $5 international surcharge payable.
- Preserved the Stripe Elements `clientSecret` keyed remount and cleared the prior payment snapshot/secret when a destination changes. Address revisions are guarded during intent creation, and address callbacks/navigation are blocked while the request is pending. The backend remains the authority for checkout totals and availability.

## Validation

- `./node_modules/.bin/tsc --noEmit` — passed after the final UI changes.
- `node --import ./node_modules/tsx/dist/loader.mjs tests/international-addressing-ui.test.tsx` — passed. Covers default-off rendering, server-enabled entry, domestic/international display, US alias classification, and no USPS claim for the international envelope preview.
- `node --import ./node_modules/tsx/dist/loader.mjs tests/draft.test.ts` — passed 71/71, including country and alphanumeric postal persistence.
- `node --import ./node_modules/tsx/dist/loader.mjs tests/international-pricing.test.ts` — passed.
- Added `tests/international-addressing-browser.test.mjs` and included it in `run-candidate.sh`. It mounts the editor and checks pending-state disabling, $14 save, cancel without changing committed recipient, switching between separate US/international drafts, focus restoration, and $5 due after a full base discount. Release audit reported an initial selector/sequence issue; the test was corrected and rerun was requested. My direct Chrome launch in this sandbox failed with `SIGABRT/EPERM`; the configured candidate runner is the intended browser validation path.

## Follow-up

Preview orders are held before fulfillment by the server. Because the deployed staging options now report `enabled: true`, both confirmation and order-detail views identify the test as held, state that no real charge, receipt email, printing, fulfillment, or mailing occurred, and suppress purchase telemetry and ordinary fulfillment claims. The options page and editor distinguish preview availability from test-payment availability. Production activation still depends on server-side mapping/configuration and separate supplier-cost and delivery validation.

Follow-up validation: `node --import ./node_modules/tsx/dist/loader.mjs tests/international-addressing-ui.test.tsx` passed with server-rendered preview-hold assertions and order-page source guards; `npx tsc --noEmit` passed. The normal non-hold confirmation string was also corrected to use an ampersand rather than a literal `&amp;` entity.
