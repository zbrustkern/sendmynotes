# Staging review follow-up — November 9, 2026

The founder authorized staging deployment after an independent review. This supersedes the earlier local-only execution boundary for staging, not production. Production activation and supplier/physical acceptance remain separate gates.

## Review disposition

- Account-level supplier failures pause the batch. A known pre-request failure leaves the child pending; an ambiguous provider outcome remains uncertain and cannot be automatically retried. Recovery preserves the dispatch fence and accepted siblings.
- Household confirmation is inline. It identifies all matching recipients, supports continued editing, and is invalidated by edits before saving.
- `/` and `/new` receive the server-loaded multi-send flag, matching the preview entry route.
- An additional staging acceptance fix records paid test/review batches as held and shows pending cards as **On hold**. Payment replay preserves advanced states.
- The review's session-storage secret and `SUPERSEDED` terminology did not match the implementation. Guest ownership uses an HttpOnly capability cookie; replaced unpaid snapshots use the existing `FAILED` state.

## Deployment boundary

Target: `sendmynotes-staging`, backend `sendmynotes-staging`, branch `staging`. The candidate includes the latest staging attribution fixes. `STAGING_REVIEW_ONLY=true`, `HANDWRYTTEN_TEST_MODE=true`, and public review-only advertising suppression remain enabled. Optional email delivery and enrollment remain disabled.

The staging dispatch and supplier lookup indexes are ready. Dedicated worker and webhook secrets are pinned to staging Secret Manager version 2 (ASCII authentication tokens), with staging backend access. No production secrets or configuration were changed.

## Evidence status

Deployed source: `23b49c7ff455c1c6e93ad894fb24ad0f54cc3774`, App Hosting `build-2026-11-09-002`. Build READY, rollout SUCCEEDED, 100% staging traffic. Multi-send is enabled for review at https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app/new.

[Machine-readable acceptance](staging-acceptance.json) records the hosted results. Detailed local logs, scripts, and synthetic screenshots are in `.delivery/runs/20261109-multi-send-staging/`. Local checks covered 17 relevant suites, type checking, a production build, and responsive browser acceptance. The exact deployed revision also passed the hosted production build.

- With the flag off, both `/` and `/new` retained the single-recipient screen; a valid multi-send checkout returned `503 MULTI_SEND_DISABLED`.
- With the flag on, hosted browser checks passed at 320/390/768/1280 pixels: add/cancel, greeting refresh, inherited/custom/blank greetings, household edit/reconfirmation, undo, 200% CSS zoom, and payment review. Zero page errors after correcting the synthetic test fixture to run only in the app frame and permitting required Stripe frame domains.
- A real **Stripe test-mode** capture verified $18 for two recipients. Exact retry reused the intent; greeting revision canceled the old unpaid intent. Omitted email was preserved. Confirmation and replay left the parent `MULTI_SEND_HELD`, with zero delivery children. Authorized views showed the frozen custom/blank messages and **On hold**; public views stayed redacted.
- Worker requests returned 401 without authorization and 202 `held_by_environment` with authorization, processing zero parents. Invalid supplier webhook tokens returned 401. No physical orders, live charges, refunds, or emails were initiated by these checks.
- The initial new secret versions contained binary bytes. They were replaced with ASCII tokens at version 2, verified in the deployed environment, and obsolete version 1 was disabled before final acceptance.

One agent's initial local test omitted the isolated mock directory and may have added synthetic records to ignored `.data/mock-firestore.json`; that existing file was preserved. Subsequent verification used isolated stores and denied external networking.

During this task, Zeke independently merged production PR #10 (`e43199a`, business-facts documentation). This task did not mutate production. Its runtime configuration, payment/advertising configuration, and Firestore rules remained unchanged against the starting fingerprints.

## Remaining production gates

Supplier error/status guarantees, physical greeting fit, multi-card economics and card reuse, Apple Pay/3DS, named operator/scheduler/alerts, commercial policy confirmation, and a controlled live pilot remain unverified. Staging test payments and held worker responses do not prove live fulfillment.

Stop new staging multi-send checkouts by disabling `system_config/feature_flags.flags.multiSendEnabled`; retain compatible readers for existing frozen orders. No multi-send production deployment was performed.
