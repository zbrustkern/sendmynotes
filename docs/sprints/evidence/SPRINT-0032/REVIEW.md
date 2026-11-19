# Sprint 0032 review

Three GPT-6-Luna workers prepared the picker and drawer, experiment and collector tests, and browser acceptance harness in isolated worktrees. The coordinator integrated the builder onto the production baseline, verified the visual and interactions, and kept the prepared artwork in the proposal and production sample byte-identical.

The experiment uses the existing session ID to assign eligible pickers 50/50 before scrolling. In first-party V2 telemetry, use distinct session IDs from `custom_cover_assigned` for the denominator in each arm of `custom-cover-picker`, version `v1`. Count distinct assigned sessions with an independent live paid order via the existing server-authoritative payment and order records. Exclude founder, friends and family, synthetic or otherwise ineligible traffic, and free orders. Deduplicate orders, report refunds separately, and report missing assignment or purchase-link coverage separately. Include ready-made and custom purchases. Opening the drawer, seeing the tile, and generating artwork are diagnostic events.

A visible treatment tile emits `custom_cover_tile_impression` after continuous half visibility for a foreground second. An accepted newly generated cover has a separate diagnostic event so an earlier ready-made selection cannot hide acceptance. Existing `cover_selected` semantics still govern the common selection milestone. Restored art and preview-only or preset fallback selections do not count as newly generated acceptance. Inputs and URLs are absent from the feature’s diagnostic fields.

Local browser checks used 320, 390 and 1200 px widths, real session assignment, interactive picker and drawer, and an intercepted generation failure followed by an explicit successful retry. The report covers the initial grid, short filter, source, selection, focus and scroll on cancel, saved artwork, acceptance into the note step and zero payment, order or fulfillment requests. The collector test exercises persistence through the local V2 POST route. TypeScript and the Next production build passed. An existing desktop address-button assertion failed on the untouched production baseline. React separates dynamic price text with hydration comments in its server HTML. The visual-text fixture now uses static markup and all 30 assertions pass.

The hosted harness can be rerun with a Playwright module and Chrome installed. Supply the environment URL and an output directory. To target known synthetic assignments, pass `--control-session sess_sprint0031_2 --treatment-session sess_sprint0031_0`. Automated traffic intercepts telemetry and third-party analytics and substitutes an in-memory artwork response. Cloud traffic and the served Git commit should be verified independently before promotion.

## Combined release verification

The November 18 production candidate combines the cover experiment, reuse of unchanged pending checkouts and bounded Stripe validation codes, independent envelope names, and the authenticated repeat-buyer report. It was assembled on the current production line. The multi-send and wedding projects have separate rollout plans.

The production build, type check, checkout concurrency and ownership tests, 37 repeat-buyer tests, four related measurement suites and the event collector test passed locally. Chrome verified both supported note editors, guest and account envelope names, and a resumed draft with corrected addresses beside its original card message. The checkout response for the browser scenario was simulated locally. The note editor no longer promises to fill mailing names automatically.

The broader regression suite stops on an existing handwriting preview font-class assertion in `tests/staging-polish.test.tsx`. The same assertion fails on the prior production revision `2dfaca1`. The remaining root-entry suite passed separately.

Staging build `build-2026-11-19-007` served revision `da3095b` at 100% of traffic on November 18. Both gallery assignments passed 16 browser checks at staging.sendmynotes.com. A second browser session verified the corrected saved-draft flow and confirmed the obsolete note-editor hints were absent. The public artwork returned HTTP 200 and signed-out access to the private report returned HTTP 401.

The production gallery, saved-draft flow, public artwork and private report access all passed on `2a9a891`. Both environments served their verified builds at 100% of traffic. [Hosted verification record](RELEASE.json)
