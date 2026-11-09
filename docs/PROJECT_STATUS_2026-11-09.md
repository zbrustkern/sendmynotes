# Project status — November 9, 2026

This dated record reconciles the founder's updates with release evidence. It does
not replace the canonical brief or product specifications. Later deployments
supersede the snapshots below.

## Business and economics

Six founder-confirmed purchases outside friends and family. The October 11 zero
baseline is historical. Undiscounted domestic single-card economics: $9 price,
$4.88 supplier charge, $0.56 Stripe fee, $3.56 remaining before advertising and
other operating costs. See [business evidence](evidence/business-facts-2026-11-09.md).

## Deployment facts

Read-only cloud inspection on November 9 confirms production source
`1a55f4fa234309a15e5b95d145762f38d7f82790`, build `build-2026-11-08-002`, READY,
rollout SUCCEEDED, 100% traffic, no reconciliation pending. Both attribution V2
flags are true. Thus attribution production promotion is **complete**; the older
November 8 staging-only release note is superseded for deployment status.

Holiday catalog expansion is in production (seven holiday designs, Halloween
hidden from active merchandising). Account/Studio improvements and post-purchase
tooling are also deployed. Post-purchase delivery, automatic enrollment and
account reminder delivery all remain false.

Multi-send is now deployed and enabled on staging (November 9, source
`23b49c7ff455c1c6e93ad894fb24ad0f54cc3774`). The owning “Design minimal multi-send
flow” chat completed hosted greeting/layout/retry checks and a Stripe test
payment. Physical fulfillment stays on hold. Multi-send is not released to production.

A separate manual follow-up implementation on `codex/manual-followup-20261109`
covers paid/unpaid order contacts, feedback-only contacts, and stored sender
account emails: generate a draft, preview/edit, then explicitly send one selected
message. Delivery remains disabled pending the full postal footer and reply-alias
verification. The production Resend delivery-status webhook is configured; its
signing-secret binding ships with the composer. The application key remains sending-only. Automated programs stay
off. Founder/family paid orders can be used for deliberate testing without
counting them as independent customer acquisition. No test email is sent by this
status update.

[Sanitized cloud evidence](evidence/deployment-status-2026-11-09.json).

## GTM evidence snapshot

Live Google Ads inspection November 9: “SMN · Search · Physical Mail · Replication
02” runs November 3–16 with a $150 total budget, US Google Search targeting,
Maximize clicks and the account Purchases goal. November 2–8 reports 347
impressions, 19 clicks, $41.84 cost and 3 conversions. The account's primary
“Purchase - Verified Payment” action reports 3 conversions / $27 value; the old
Purchase action remains secondary. Recording is active; enhanced conversions
needs attention. The campaign separately reports a maximum-bid constraint.
These are platform-attributed events, not the founder's all-channel six-purchase
count. Do not add the two counts or assume six unique buyers.

The inspected Meta “Everyday Personal Notes | $9 Mailed | Add Address Later” ad
is off; another selected ad is in draft. Its historical October 16–19 report has
two checkout initiations, not two purchases. This is not a current all-account
spend audit.

## Operational follow-up explained

These are specific verification/operations items carried from the account
release. They are not evidence that the deployed features are broken.

| Item | What it means | Practical next action / closure evidence |
| --- | --- | --- |
| Signed-in account and ownership acceptance | Prove saved art, drafts, people and history work for their owner and stay inaccessible to another user. | Controlled two-user staging walkthrough, including refresh, import, reuse and checkout reset; save redacted results. |
| Private-storage runtime checks | IAM configuration alone does not prove the running application can put/read/delete private objects correctly. | Disposable staging fixture using runtime identity, anonymous-denial check and indexed reads; no customer media. |
| Cleanup schedule | Staging has an enabled upload-cleanup job at 04:17 America/Chicago daily. Production Cloud Scheduler API is disabled. | Production scheduling remains open. Review bounded dry-run results and recovery before enabling cleanup; preserve saved/ordered artwork. No jobs were invoked by this audit. |
| Manual privacy requests | The admin queue records requests; it does not itself export or erase all data. | Zeke is operator. Set a review routine, secure export channel and backup; rehearse inventory/partial-failure handling with synthetic data. |
| Apple Pay and device acceptance | Card payments and simulated wallets do not prove Apple Pay through the real mobile journey. | A deliberate device payment check; record device/browser, observed wallet and payment result. No charge was made by this audit. |
| Reminder delivery | Saved dates/reminders are distinct from sending reminder email. | Leave off until an opted-in controlled inbox, timing/unsubscribe and operator monitoring are verified. |

Historical sprint-ledger entries retain open acceptance where evidence is still
missing. Production rollout does not imply every original acceptance test passed.
Known facts should be updated in canonical docs; old audit claims should not be
reopened without checking the current source and release evidence.

Read-only November 9 operations inspection confirms the operational-job, privacy-request, and reminder composite indexes are READY in both environments; index provisioning is closed. The staging scheduler has a recorded November 9 attempt, which alone does not prove successful cleanup. [Sanitized operations evidence](evidence/operations-status-2026-11-09.json).
