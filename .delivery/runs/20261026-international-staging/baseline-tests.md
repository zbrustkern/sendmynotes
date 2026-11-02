# SPRINT-0013 pre-change test baseline

Captured 2026-10-26 before international mailing implementation changes. Baseline: isolated shared clone `/private/tmp/sendmynotes-international-baseline-20261026`, branch `staging`, commit `ae7f77e3038e027ad9fd9734a054e56bab4921e`. This is the documentation-only SPRINT-0012 evidence commit; application source matches deployed staging source `f97f98f62d0fee461c236c597e33e9f54a7275d3`. Clone began clean, with no `.env*` or `.data`, and a symlink to already-installed repository `node_modules`. No install or baseline source change was made.

Reusable gate: [`run-baseline.sh`](/Users/zeke/code/sendmynotes/.delivery/runs/20261026-international-staging/run-baseline.sh). It runs suites in isolated temporary working directories with `env -i`, `NODE_ENV=test`, and the existing `deny-network.cjs` preload. It cleans `.baseline-tmp` and the checkout's browser artifact directory on exit. Mounted browser tests used the already-bundled Playwright module and installed Chrome; no dependency was installed. Chrome could not launch in the default sandbox, so the local test runner was invoked with an approved elevated launch. Network was still blocked by the preload. Browser tests use mocked payment/supplier adapters; no provider effects occurred.

## Results

- Mounted checkout repricing, `tests/payment-checkout-parent.test.mjs`: **passed**. Evidence: `PASS parent checkout: repricing failure, free-code resume once, pre-pay URL offer timing`.
- Mounted checkout repricing, `tests/payment-discount-browser.test.mjs`: **passed** for legacy and v3 flows, including provider rebind, pending/error, remove, free, and retry states.
- Payment-mode safety: **25 passed, 1 inherited stale-fixture assertion**. The only failing assertion expects a webhook fixture order to be labelled `isTest` with a Handwrytten ID, but its simulated PaymentIntent lacks the `status: "succeeded"` field required by `verifyPaymentIntentForOrder`; the webhook correctly records reconciliation and does not dispatch. Neighboring assertions passed, including test webhook handling and confirmation that the live Handwrytten API was not called. The exact known failure was present on the pre-change staging commit.
- Sender validation: **16 passed, 1 inherited stale-fixture assertion**. The free-order fixture lacks authoritative offer `quoteId`/reservation binding; `complete-free-order` correctly rejects before reaching sender validation. The test expects a queued sender-validation result. Other sender and mocked supplier assertions passed. This exact known failure was present before implementation.
- Offer engine/pricing integrity: **65/65 passed**.
- Transaction security: **10/10 passed**.

Runner exit status: **0**, with both inherited fixture failures printed and narrowly allowlisted by their exact assertion text (one `❌ FAIL:` each). No failing assertion was treated as a pass. The harness-isolation hypothesis is ruled out: both failures reproduce against the pristine pre-change staging application commit, in isolated temporary working directories, and are explained by missing test fixture prerequisites. They are inherited fixture/test drift, not evidence of new product defects. Do not broaden scope with unrelated changes; either update those fixtures when directly necessary or retain them as explicit baseline failures for comparison.

The runner checks out no product files and removes its runtime temporary artifacts. Browser test logs and exact observed output are in the terminal record from the run; running the script again reproduces the gate.
