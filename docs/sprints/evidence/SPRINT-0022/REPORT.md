# SPRINT-0022 delivery evidence

## Delivered behavior
Private account-gated upload studio at `/create/upload`; owner grant/revoke, expiry, quota, standards versions and pause controls at `/admin/uploads`. Reference-image generation uses the mandatory card harness and sender direction. Three deterministic licensed-font treatments add exact lettering. A flattened 1275×1650 accepted master passes through the existing note/address/review flow and is pinned separately for order processing.

Two independent Sol planning lanes and cross critiques preceded three Luna implementation lanes. Founder explicitly selected these models and approved staging deployment. No production release is included.

## Local evidence
- Upload access, route security, generation/composition, checkout integrity and draft tests pass.
- Payment-mode regression: 26/26; transaction security: 10/10; draft: 74/74.
- Mounted desktop/mobile browser flow passes upload → illustration → lettering → acceptance → `/new` → refresh → note → address → review. Captured checkout sends bearer authentication and the accepted design tuple with no image URL. Browser APIs are mocked here; hosted checks are recorded separately.
- Browser testing caught and fixed an auth-restoration race that cleared the saved upload on refresh.
- All three full-resolution lettering masters were visually reviewed. A paired synthetic provider test selected Nano Banana 2.1 at 2K; see MODEL_DECISION.md. This is a qualitative sample, not a broad benchmark.
- TypeScript and production build checked before rollout; logs and screenshots live under `checks/`.

## Infrastructure and retention
Staging uses a dedicated uniform-access bucket with public-access prevention, deny-all browser Firestore rules, runtime-only IAM access, and a bearer-protected daily cleanup job. Sources and unaccepted artifacts expire after seven days; accepted unordered masters after thirty days. Source deletion removes unordered derivatives. Ordered copies use a separate immutable namespace and survive source deletion. Abandoned order pins are cleaned only if no order exists. Cleanup does not delete existing ordered copies.

## Beta limits
Staging remains review-only with test-mode fulfillment. No live payment or physical order was used for QA. Public/gallery entry remains unchanged. Exact lettering supports the glyphs in the bundled licensed fonts; unsupported text fails visibly. Prompt standards publication requires explicit human acknowledgement; a richer draft-and-test publishing workflow is deferred. Image quality, likeness and any stray generated text still require visual review. Account access control does not imply the image provider never receives the image. Wider rollout needs additional personal-card fixtures, account-deletion operations and provider-policy review.

## Release receipt
Staging commit `04c85179012913c174eec367d76a9f7509e069a8`, build `build-2026-10-31-002`, serves 100% traffic with the intended review-only/test flags. One real hosted synthetic generation completed with Nano Banana 2.1. Three compositions, private-preview hashes, acceptance, stale-hash rejection, 30-day accepted retention, revocation and authenticated browser refresh passed. Receipts: `checks/cloud-final.json`, `checks/hosted-smoke.json`, `checks/hosted-browser.json`. Production build, config hash, payment config and advertising config are unchanged from baseline.

Founder access setup remains user-driven: `zbrustkern@gmail.com` has no account in staging Firebase, so the existing-account grant endpoint correctly returned `account_not_found`. Sign in once on staging, then grant that verified account from `/admin/uploads`. No founder account was provisioned or modified. Synthetic fixture cleanup is recorded separately.

Final receipts and completed ledger are retained locally after deployment; the deployed implementation commit contains the original pre-rollout evidence.
