# Sprint 0024 — Lane 2 library and drafts evidence

## Delivered

- Added owner-scoped private account image records and bucket objects under a per-environment, hashed-owner prefix. The bucket adapter verifies uniform bucket access and public-access prevention; media endpoints require the Firebase actor, return private/no-store bytes, and verify the saved SHA-256 before use.
- Added generated-result save capabilities. A short-lived, one-claim token binds a guest result to one verified account and idempotency key; it does not alter guest generation or expose private storage keys. Saved generated fronts remain reusable without an Upload grant.
- Added Studio source and accepted-front saves, from-order saves for verified owners, library browse/detail/rename/delete, and a fresh authorized Studio source handoff. Source images are copied into durable private storage so Studio expiry does not remove the library copy.
- Added versioned, allowlisted account drafts with owner-validated contact, occasion, and image references, 90-day inactivity expiry, conflict checks, bounded item quota, and cleanup of expired records. Preset fronts must match the current catalog. Custom/generated artwork must first be saved in My images. Resume always resets front acceptance.
- Image and draft list APIs scan at most 400 records per request to skip tombstones while avoiding unbounded reads; cursors continue past the last scanned record even when a page has no live results.
- Added private `accountImage` order-master pinning with stale hash/version validation and an exclusive-cover guard against mixed account, Upload-design, and public-front selections. Original Upload designs retain their grant requirement through order masters and history copies; ordinary generated fronts do not acquire one. Historical saves use the paid/accepted history status allowlist and verified legacy email fallback only when the order has no explicit UID owner. The account media endpoint is also rejected from the public-front path.
- Added private image previews, image library/detail and draft list/detail UI, optional generated-result save, and Upload Studio save-source/save-front actions.

## Validation

- `NODE_ENV=test node --import tsx tests/account-library-drafts.test.ts` — passed. Covers owner-prefix isolation, private reads, idempotent writes, conflicting overwrite rejection, generated-claim retry, quota exhaustion, owner isolation, versioned image/draft reads and updates, stale-version rejection, delete dependency handling, quota release, paginated reads beyond expired/deleted rows, and cleanup of 100 old draft tombstones without double-decrementing quota. It also checks preset allowlisting, unsafe URL rejection, resetting acceptance on draft resume, verified-email legacy ownership, explicit-UID ownership, accepted-history status gating, and Upload-grant preservation for historical uploaded artwork.
- `npx tsc --noEmit --pretty false` — passed.

## Operational notes

- Private bucket configuration is fail-closed: `UPLOAD_PRIVATE_BUCKET` must be configured with uniform bucket-level access and public access prevention enforced.
- `POST /api/cron/account-library-cleanup` uses `UPLOAD_CLEANUP_SECRET` and retries abandoned private-object deletion and pending image reservations; expired draft cleanup runs through the same authenticated endpoint.
- No provider delivery, payment, fulfillment, or production side effects were invoked.
