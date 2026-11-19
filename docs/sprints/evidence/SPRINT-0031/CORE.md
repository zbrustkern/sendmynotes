# Sprint 0031 core lifecycle evidence

November 18, 2026. Scoped implementation in the shared integration checkout, based on staging `88d0194`. The sprint Pyramid Index and both canonical documents were read before implementation. Semantic index: not configured. Chapter: none. This file records local evidence; it does not close the hosted sprint gates.

## Implemented contract

- `lib/wedding/domain.ts`: project/household/actor types, exact composed text, portable SHA-256 wording fingerprints, independent address readiness, 450 UTF-16-unit application limit, and the purchased-row ledger fence.
- `lib/wedding/server.ts`: same-origin mutations, server-backed opaque HttpOnly sessions, current project/member/session checks usable inside payment transactions, verified Firebase identity, recent authentication for grants, staging-only production gate, and record-backed pilot authorization.
- `/api/wedding/project`: named create/save/import/approve/invite/redeem/claim/grant/revoke/extend/export/address-review actions. Shared edits increment affected unpaid row revisions; personal overrides and purchased records remain intact. Client authority, prices, payment flags and private artwork keys are rejected. Cover URLs are resolved on the server, and uploads require a validated private master plus a transactional metadata recheck.
- `/api/wedding/identity`: claim an already-authorized membership, list currently linked memberships, and resume an account-bound project on a new device. Account sign-in cannot independently acquire a project role. Invalid or unverified optional account authentication leaves the private guest writing session usable; sensitive actions still require verified identity.
- `/api/wedding/address`: single-use fragment exchange to a household-only session. Recipients can submit an address, never wording, permissions or a payment. The sender explicitly accepts the pending address.
- `/api/wedding/pilot`: recent verified admin identity issues/revokes expiring records. Invitations bind to a project on one-time redemption; no public/static pilot password exists. Server `WEDDING_PILOT_UIDS` also supports verified pilot membership.
- Device and partner revocation recheck current membership, revoke the relevant capabilities, and retain an active payment reservation with `paymentReconciliationRequired` / `checkoutRevocationRequestedFor`. The finance lane uses `assertWeddingActorInTransaction` and reconciles the frozen batch before releasing the reservation. No role can edit a paid row or purchase it again.
- Private CSV is generated only after a fresh export authorization inside its read transaction. It omits addresses, message text, tokens and URLs; gifts are opt-in, and formula-leading cells are neutralized.

The integration supplement was published early at `/private/tmp/smn-wedding-0031-core-api.txt` and updated with artwork, import, finance, account recovery, and device interfaces.

## Retention and storage

Drafts expire after 180 days from meaningful project activity. An explicit extension renews that period. Expired drafts remain readable during a seven-day cleanup grace period. Device sessions last 30 days; account-based resume can restore a claimed project after a device session expires.

`POST /api/cron/wedding-cleanup` uses the existing `UPLOAD_CLEANUP_SECRET` authorization pattern. Its bounded, rotating sweep tombstones expired unpaid/unreserved projects, deletes their household drafts and source records, and drains a durable normalized-artwork cleanup queue. Deletion checks the exact project-hash prefix and cannot touch `wedding-paid-retained`. For projects with prior purchases the sweep verifies the order, capture, ordinals and protected master before retiring editable data. It preserves paid rows, snapshots and tier history, and holds inconsistent evidence and active reservations for review. A bounded sweep also retires expired AI drafts and short-lived network signals. Records needed to resolve an uncertain model invocation keep their reconciliation identifiers. Invalid storage metadata is held for operator review. The existing daily private-upload cleanup job also calls the wedding cleanup routines.

Existing Firestore rules deny all browser reads and writes, including all wedding collections. Core queries use single-field indexes; no new composite index or rule deployment is needed for these endpoints. Finance, importer and artwork retain their own index requirements.

## Local verification

- `node scripts/wedding/run-core-tests.mjs`: 23 checks passed, using a fresh temporary database and an external-network-denying preload.
- `npm run test:wedding`: the seven wedding test files available at this checkpoint passed, including core, importer, artwork, AI, checkout/refund, scheduler and transfer fixtures.
- `npx tsc --noEmit --incremental false`: passed.

Core checks cover 250-row import and pagination, duplicate replay with sender corrections retained, one-time token races, same-field conflicts, inherited versus overridden wording, template revisions, exact 449/450/451 counts with emoji, wrong-account and stale-auth rejection, separate payment/export grants, revoked downloads and devices, household address review, pilot scope/revocation, paid-row immutability, expiry, account recovery, and cleanup preserving paid masters. Artwork and financial tests use their synthetic adapters; these are not supplier or processor production evidence.

No deployment, commit, external message, customer-data fixture, or live fulfillment operation was performed by the core lane. Hosted phone/desktop acceptance, production-shaped Firebase verification, actual private bucket policy, the deployed rule/index state, cleanup scheduling and Stripe-test reconciliation remain the orchestrator's release checks.
