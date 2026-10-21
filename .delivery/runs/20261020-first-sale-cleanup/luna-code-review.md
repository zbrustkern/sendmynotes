# Luna independent code review — SPRINT-0012

Reviewed the actual 15-file working-tree patch in /Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes, based on production SHA c7c127e3e184252d0c727df715dd18e8e30129f6, against SPRINT-0012 and the canonical brief/specifications. This is a source review only; I did not run browser/visual checks or cloud calls.

## Findings

**Release-blocking: unsupported claims remain in the sender flow.** The patch updates the V3 email label/help and review delivery copy, but the legacy checkout still says it only sends “USPS tracking updates” in [CheckoutStep.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/components/CheckoutStep.tsx:279). ExperienceRouter still allows that flow when ?v3=0. V3 also retains a blanket tracking reference in its invalid-email error at [Step4ReviewAndPayment.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/components/v3/Step4ReviewAndPayment.tsx:266). This conflicts with AC02 and the canonical rule that tracking depends on service and returned data. Use receipt and available mailing updates wording in both places.

**Release-blocking: unconfirmed material and manufacture claims remain on active surfaces.** The edited legacy builder still calls the product “Heavy Cardstock” at [VendingMachineBuilder.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/components/VendingMachineBuilder.tsx:1084), and /send page metadata still describes “heavy cardstock” at [page.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/app/send/page.tsx:24). The V3 review panel calls it a “Folded Letterpress Card” at [Step4ReviewAndPayment.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/components/v3/Step4ReviewAndPayment.tsx:537). Weight is unconfirmed; product-facts explicitly rules out asserting weight, and the canonical specs say to use “cardstock.” Letterpress manufacture is unsupported. Replace with folded cardstock wording, without changing geometry or fulfillment.

**Release-blocking: matching envelope remains promised in the confirmation flow.** [Step5Confirmation.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/components/v3/Step5Confirmation.tsx:397) says “Enclosed in a matching envelope.” Envelope matching is unresolved in the canonical specs and the sprint explicitly calls for removing that claim. Use “Enclosed in an envelope.”

**Small scope cleanup recommended:** the changed admin cost description removes “120 lb” but still says “envelope inking” at [app/admin/page.tsx](/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes/app/admin/page.tsx:2334). The confirmed integration describes addressing; the exact envelope finish/process is unresolved. “Envelope addressing” matches the verified request behavior.

## Review passed

The diff is limited to the 15 intended UI/content files. It contains no API, payment, price, fulfillment, provider, package, hosting, or secret/configuration edits. The admin notice is static, dated, and attributed as founder report; it does not change computed metrics or claim a live zero. The custom-art invitation removes truncation on the title and subtitle and keeps the action badge visible in the existing chooser button; the click handler and chooser behavior are unchanged. The order-status copy continues to render returned tracking details conditionally and uses the canonical domestic transit estimate when no tracking number exists.

Source structure supports natural wrapping at narrow widths (min-w-0, block text spans without truncate, and a shrink-resistant action badge), but that does not prove rendering at 320px or 390px. Coordinator still needs the sprint's visual/mobile and interaction checks before release. After the listed copy corrections, rerun the existing scoped regression/build checks already selected by the coordinator; no new copy-mirror test is warranted.

**Disposition: changes are text/layout-only and well-contained, but the three release-blocking residual-claim findings should be corrected before staging promotion.**

## Iteration 2 resolution

Rechecked the repaired production candidate (base c7c127e3e184252d0c727df715dd18e8e30129f6) and staging candidate (base 844b2bfe4c06e9fd617288bcfa1f4f8fdce7bbd3).

The prior findings are closed in both candidates:

- Legacy and V3 checkout text now promises receipts and available mailing updates; the V3 delivery line says tracking details appear when the mail service provides them.
- The legacy builder and /send metadata use “cardstock”; the V3 review panel says “Folded Cardstock Card.”
- The confirmation says “an envelope” without promising a matching envelope.
- The admin cost description now says “envelope addressing.”

A scoped residual search across the public app/components found only development comments and product-facts guardrail text for archival, letterpress, and related terms; no remaining visible claim in the reviewed checkout, catalog, order status, policy, or admin surfaces. Returned tracking details remain conditional in the order status and V3 text.

Production contains 18 changed files (42 insertions, 39 deletions); staging contains 17 changed files (40 insertions, 37 deletions). Staging has the same customer-facing hunks and the dated admin note plus the staging-specific admin copy correction. Its Handwrytten status widget was already on the canonical wording, so it is unchanged. Production's corresponding widget correction is a text-only hunk. The staging admin note is confined to the orders workspace and does not edit analytics calculations or records.

The changed path lists contain no API routes, payment/fulfillment/provider implementation, package, Firebase/App Hosting, or secret configuration paths. Source inspection shows no behavior change; CTA text can wrap, the existing chooser action/handler remains, and order tracking rendering stays conditional. No release-blocking source-review findings remain.

Coordinator still owns builds, regression checks, and browser visual/interaction checks. This source review does not verify 320px/390px rendering or hosted behavior.
