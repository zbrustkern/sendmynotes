# Sprint 0028 local implementation review

Three user-requested `gpt-6-luna` agents implemented the UI/draft, checkout, and fulfillment lanes. The parent reviewed the combined changes, fixed integration issues, and ran local verification. The starting revision is `8940401`; the final local implementation commit is recorded in Git history. No remote push, deployment, live payment, customer email, refund or physical mailing was performed.

## Implemented

- Existing single-card Address screen retained, with one opt-in text action when the server flag is enabled. The flag defaults to false. The preview route reads the flag dynamically.
- One buffered recipient editor, 2–25 complete US addresses, matching address controls, duplicate/household confirmation, explicit address-later conversion, and remove/undo.
- Inherited, custom and intentionally blank greetings. Shared body/sign-off remain unchanged. Unsaved greeting/address buffers survive a same-session reload and are separate from committed counts. Preview and Pay review follow the selected recipient.
- One quantity-aware payment, one eligible single-card discount benefit, immutable per-recipient messages, authenticated/capability-bound checkout revisions, canceled-intent replacement, limited-offer hold transfer, expired/released-hold rejection, and original-order recovery for late payments.
- Durable paid parent queue, shared artwork preparation, fenced child submissions, independent rejection/uncertainty, audited correction/refund/reconciliation/resume, and protected customer/account/admin views. Parent purchase measurement carries quantity.

## Local evidence

Focused executable tests cover contracts, checkout routes/races/offer holds, payment-to-queue convergence, preparation/dispatch/refund fences, supplier webhook authentication/status mapping, and customer/admin privacy. Draft tests pass 106/106. The relevant existing offer-engine suite passes 65/65. Other relevant regression suites cover transaction/payment safety, flags, sender/international addressing, emails, account draft/history, private uploaded artwork, contact policy, supplier sync and purchase measurement. `verification.txt` records commands and final outcomes; the safe runner blocks external HTTP and SDK sockets and gives every test a fresh mock database.

Implemented browser checks use fictional addresses and block requests outside localhost. They verify opt-in/cancel, saved count, inherited/custom/blank greetings, unsaved navigation focus, refresh recovery, preview identity, exact Pay greetings, household confirmation for three people, remove/undo, and deferral conversion/cancel/collapse. Screenshots at 320/390/768/1280 CSS pixels have no horizontal overflow. Focus remains visible at 200% CSS layout zoom. This is desktop Chrome automation, not a claim of native iOS keyboard, wallet or browser-zoom testing.

- [Baseline, 1280px](baseline-address-1280.png) and [feature off, 1280px](implementation-off-address-1280.png): pixel-identical baseline captures at 768/1280px. Mobile captures have the same dimensions; small development-overlay/render differences were not treated as product redesign.
- [Enabled baseline, 390px](implementation-on-address-390.png)
- [Recipient editor, 390px](implemented-multi-address-390.png) and [1280px](implemented-multi-address-1280.png)
- [Payment review, 390px](implemented-multi-pay-390.png)
- [Greeting focus at 200% layout zoom](implemented-greeting-zoom200.png)
- [Browser acceptance script](browser-acceptance.cjs) and [deferral script](browser-deferral.cjs)

Full-page captures include the fixed footer at the viewport boundary; that is one footer, not a second bar in the page. All images contain synthetic test content.

## Acceptance boundary

Local implementation and the listed mock/browser checks are complete. Sprint acceptance remains open for environment-dependent release evidence: hosted account/auth and 3DS/wallet round trips, native mobile keyboard checks, deployed worker/index/scheduler authorization and monitoring, and supplier reuse/status/cost/concurrency confirmation. The local fake Stripe webhook test exercises the signature-verification seam; it is not evidence of a real Stripe delivery. No physical handwriting fit, holiday arrival or Apple Pay claim is made.

The feature remains disabled by default. Confirm the commercial defaults and named support/worker owners, then follow [OPERATIONS.md](OPERATIONS.md) for staging, rollback and a separately authorized live pilot. Do not enable customer traffic solely from these local tests.
