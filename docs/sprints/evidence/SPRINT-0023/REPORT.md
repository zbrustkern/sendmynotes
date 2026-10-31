# SPRINT-0023 delivery evidence

Status: implemented; local checks passed; staging rollout pending.

The founder approved Sol planning and Luna execution, then added shared note previews to the same sprint. Two Sol planning lanes produced the merged plan. Three Luna lanes handled account/menu UX, private draft ownership transitions, and shared previews. Main integrated the lanes, corrected discovered races and reference-layout issues, and owns release verification. The existing staging authorization covers this release; production is excluded.

## Delivered behavior

- The builder's top-right menu offers optional sign-in, actual account identity, account management and sign-out. Guest sending remains available. Upload studio appears only after the current UID's active grant is verified; checking, unavailable and retry states are explicit.
- Upload administration is separate from the user-facing Studio. Both founder-designated administrator emails can manage access, without receiving automatic Studio grants. Authentication failures and denied capabilities are distinguished. The shared sign-out operation reports partial failures accurately.
- Private front recovery is bound to its owner. Sign-out/account changes clear visible private pixels, selection and payment state; late asynchronous results cannot restore them. Safe note/address fields remain. Same-owner reload/new-tab recovery requires fresh server validation. The restored-note reminder is inline, dismissible and expires after four seconds.
- Admin, customer single-card, spread and composition interiors share the selected handwriting resolver and a literal 425 × 550 reference layout, scaled to available width. Bounded fitting waits for fonts, reports unsupported/unavailable fonts, and exposes the complete selectable message when the visual preview overflows. Empty saved messages stay empty. Admin and enlarged preview modals fit mobile viewports and support keyboard dismissal/focus.
- Preview copy describes an approximation. No supplier payload, handwriting submission mappings, physical settings, pricing or character limits changed. The custom-domain checkout origin check now uses the existing proxy-aware same-origin helper.

## Local verification

| Evidence | Result |
| --- | --- |
| `checks/menu/summary.json` | Guest continuity; account/grant states; refresh/retry; successful and failed sign-out; widths 320–1024. |
| `checks/privacy/summary.json` | Mocked complete upload-to-checkout path; reload/new-tab; accepted tuple and owner token; cross-UID clearing; late preview and checkout responses; same-owner recovery; admin 401/403. |
| `checks/previews/summary.json` | Actual admin and composition preview entry points; all five handwriting styles, legacy and unknown IDs, slow/failed fonts, empty/long text; 320/375/390/430/768/1280 layouts. |
| `checks/spread/summary.json` | Single/spread/enlarged A2 geometry and identical reference wrapping; edits/style changes; complete overflow text and final signature; viewport fit and Escape dismissal. Temporary fixture route removed. |
| Focused tests | Draft tests: 92 passed. Note-preview, optional-account-menu, upload-route security and upload-checkout checks passed. Greeting/body assembly matches unchanged fulfillment semantics. |
| Production build | `npm run build`, including TypeScript checks; final receipt recorded with release. |

Synthetic fixtures and mocked APIs were used for all mounted browser checks. Screenshots contain synthetic messages/accounts, not founder screenshots or customer data. Representative mobile/admin, signed-out private-draft and enlarged preview screenshots were visually inspected. Browser harnesses block external mutations; no order, payment or fulfillment was submitted.

WebKit is not installed in this environment, so Safari/iPhone rendering remains a manual spot-check. Local browser fit does not establish supplier wrapping or physical-card fit. Static external brand font resources are intercepted in the local harness; local handwriting assets are exercised, with deliberate failure and delayed-load cases.

## Release verification

Before snapshot: `checks/cloud-sprint23-before.json`. Production baseline source is `a298a1935e9560f5c53df5bcad02ecfc63e9bf44`; staging baseline source is `04c85179012913c174eec367d76a9f7509e069a8`.

The earlier staging Firebase referrer fix is documented separately in `../SPRINT-0022/admin-domain-fix/REPORT.md`. It preserves restrictions while allowing the staging custom domain. Actual personal Google login is not automated.

Final staging source/build, read-only hosted capability checks, unchanged production configuration and staging safety flags will be appended after rollout.
