# SPRINT-0020 delivery evidence

## Scope and authorization

The founder authorized Luna agents to implement the photographic envelope preview and push it to staging on October 27, 2026. Three `gpt-6-luna` agents handled UI, image assets, and independent review. The coordinator integrated, inspected browser output, and owns release verification. No production deployment or live transaction was requested or performed.

Implementation began in an isolated clone at staging `1aab44707b90e626bdb6698098d8e01a21642eaf`. The original dirty checkout was preserved. The feature changes only the extracted envelope component, its address-step wrapper, two static assets, and associated tests/documentation. No new dependencies or runtime generation are introduced.

## Result

- Photographic white paper and separate illustrative postage replace the cream rectangle and gradient stamp. Fine grain, crisp edges and a restrained CSS contact shadow follow the approved concept.
- Actual addresses remain selectable DOM text, with separate apartment lines, blue bundled handwriting, wrapping and vertical growth for long content.
- The redundant outer card/badge and large return-address callout are simplified. Country display names now arrive through the existing country catalog.
- International postage remains neutral. The caption identifies the preview as illustrative. No price, customer address or fulfillment guarantee is baked into assets.
- Optimized assets total **48,074 bytes**. See [asset provenance](ASSETS.md) for prompts, export dimensions and privacy review.

## Validation

All nine focused suites pass: envelope preview, SPRINT-0019 UX, international addressing, international pricing, draft, scenario draft seeding, staging polish, render auto-select, and staging review safety. The production build passes with external Node networking denied and mock provider configuration; TypeScript also passes (checks/typecheck-results.json).

Browser checks use the actual application plus a standalone fixture mounting the production component. Fixture code is documentation-only and never included in the customer flow. Fictional test addresses are used throughout.

- Seven address scenarios at 320, 390, 768 and 1280 CSS pixels: 28 cases with no horizontal page or address-region overflow (checks/responsive-matrix.json).
- All five existing handwriting classes verified at 320px with long Unicode/apartment text; screenshots confirm vertical growth and preserved content (checks/font-matrix.json).
- Actual address form viewed at 390px and 1280px. Sender and recipient field edits appear immediately and exactly in the preview, including leading-zero postal codes.
- Actual Note → Address progression followed by browser Back and Forward preserves the note, selected cover and addresses. A fresh direct link has no earlier flow-history entry; browser Back correctly exits that entry.
- Production component accessibility markup exposes one labeled sender and recipient region, with decorative images hidden. Manual accessibility-tree inspection confirms their text is present once.
- Genuine paper-only, stamp-only, fonts-only and combined resource failures were exercised in the browser. The final combined-failure DOM contains no images; the white surface, neutral postage and fallback text remain usable (checks/fallback-results.json and fallback-all-320.jpg).
- With every asset failed, long Unicode/apartment text at 320px and doubled address font sizes (40px sender, 54px recipient) expands vertically without horizontal page/region overflow (checks/text-scale-200.json and fallback-200-text-320.jpg). This is a controlled text-size stress test, not full browser zoom.

### Coverage limits

No physical iPhone/iOS Safari, VoiceOver, or mobile on-screen keyboard was available. Responsive desktop-browser testing is not represented as device certification. Full browser zoom and real slow-network font timing are not verified; the fixture text-scale result is recorded separately above. Existing custom-art/discount behavior is covered by focused regression/source boundaries, not a new live purchase. No payment, email, fulfillment submission or physical mail was created.

## Release

Pending exact hosted staging source/build verification. Production baseline is `5d008dd82f078002926de7e03a87a34e89ae1741`, serving App Hosting build `build-2026-10-26-002`. Staging baseline is `1aab44707b90e626bdb6698098d8e01a21642eaf`, build `build-2026-10-27-002`.

Rollback: revert the scoped preview commit or restore the compatible previous staging build. No schema or stored draft migration is involved.
