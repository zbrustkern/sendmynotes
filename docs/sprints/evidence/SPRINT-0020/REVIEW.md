# SPRINT-0020 independent review

**Review result: approved for the scoped staging release.** Reviewed against the approved envelope concept, SPRINT-0020 design contract, and canonical project/product documents. Source base: `1aab44707b90e626bdb6698098d8e01a21642eaf`.

The implementation reuses the existing `EnvelopePreview` and address-step wrapper. It keeps entered address content as selectable DOM text, separates apartment lines, preserves Unicode and leading-zero postal values, passes the catalog country name, and wraps long strings. The deferred state names the missing street address without showing placeholder mailing lines. The parent’s nested card, badge, and large return-address callout are removed; surrounding form and navigation code remain scoped. Domestic postage is illustrative, international postage is neutral, and the caption avoids a supplier-accuracy claim.

Both production assets were visually inspected at full resolution. The blank paper and postage images total 48,074 bytes and contain no personal data, barcode, denomination, cancellation mark, or embedded address text. Sharp metadata inspection found no EXIF, ICC, IPTC, or XMP payload. The component has no provider, payment, order, email, fulfillment, or image-generation calls; the isolated fixture uses local state and fictional addresses.

Independent checks passed: `node --import tsx tests/envelope-preview.test.tsx` (13 cases) and `node --import tsx tests/sprint-0019-ux.test.ts` (28 cases). The final regression set, TypeScript check, and production build results are recorded in [delivery evidence](REPORT.md) and its `checks/` files.

Browser evidence supports the responsive and failure-state claims:

- Seven address scenarios at 320, 390, 768, and 1280 CSS pixels had no horizontal page or address-region overflow. Long Unicode and unbroken strings remained visible, with the preview growing vertically where needed.
- The actual address step was viewed at 390px and 1280px. Editing sender and recipient values updated the preview exactly. Browser Back and Forward after Note → Address preserved the note, selected cover, and addresses.
- All five supported handwriting classes rendered in the 320px long-address case. Paper, postage, font-only, and all-assets-failed modes were exercised in the isolated fixture. With all assets failed, no image remained, the white surface and neutral postage fallback remained, and address text stayed readable.
- At 200% fixture text scaling with long Unicode content and all images/fonts failed, the 320px page and address regions had no horizontal overflow. Content expanded substantially in height, preserving the text rather than clipping it.

One initial fixture version did not propagate its failure mode to asset requests; this review found that gap before accepting the fallback evidence. The fixture was corrected to produce actual failed asset responses, and the resulting screenshots and measurements are recorded in `checks/fallback-results.json`, `checks/fallback-all-320.jpg`, and `checks/text-scale-200.json`.

Coverage remains limited to desktop-browser emulation and the local isolated fixture. Physical iOS Safari, VoiceOver, the mobile on-screen keyboard, full browser zoom, and real slow-network font timing were unavailable. Those limits are disclosed in [delivery evidence](REPORT.md). This review does not certify a hosted deployment; exact staging build verification remains the release owner’s step.
