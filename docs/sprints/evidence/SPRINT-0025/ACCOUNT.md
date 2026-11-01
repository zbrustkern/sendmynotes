# Account work (W1–W4)

Implemented account verification, trusted order-front/history handling, resilient contact/date import, and private account-builder resume/recipient helpers for Sprint 0025.

## Delivered

- W1: signup sends Firebase verification; AccountShell offers resend with cooldown and refresh; `/account/verify` handles custom action links and Firebase hosted continuation without claiming success while signed out or unverified. The public continuation route bypasses the ordinary signed-in shell gate.
- W2: historical fronts resolve only from owner-checked orders and trusted preset/generated/upload sources. Generated order pinning preserves original bytes and detected PNG/JPEG/WebP MIME; immutable history remains viewable after Studio grant expiry, while save/reuse of upload-derived artwork requires an active grant. Private image responses preserve stored MIME.
- W3: contact import is opt-in for reminders, stable-key retry safe, duplicate aware, and row-partial. A retry with changed reminder consent/date data is not treated as a successful prior import.
- W4: restored drafts resume at the note/envelope step only when note content exists; initial restore remains on card and front acceptance stays separate. Recipient picker is signed-in, identity-scoped, disclosure-based, keyboard/focus aware, paginated, and accepts international address shapes. Saved-image account CTA reflects current verified Upload access; draft cards use private thumbnails; account privacy-request rows display the server status/version/assignment projection and retain idempotency keys for retries.

## Validation

All checks below used `NODE_ENV=test` and the external-network deny hook; no live email, provider, payment, fulfillment, or deployment calls were made.

- `tests/account-builder.test.ts` — passed (resume authority, private persistence, identity reset, catalog recovery).
- `tests/account-history.test.ts` — passed (synthetic storage and trusted history checks).
- `tests/account-library-drafts.test.ts` — passed (owner isolation, durable draft allowlist, grant enforcement).
- `tests/account-routes-security.test.ts` — passed using an isolated mock Firestore directory (auth, CSRF, ownership, conflict, contact import retry/consent checks).
- `tests/account-list-contract.test.ts` — passed (empty and populated history response shape, overview-sized result, cursor pagination, safe rejection of double-wrapped payloads, and an upcoming occasion beyond the first 50 creation-ordered rows).

Follow-up route audit found the history GET route was double-wrapping the service pagination object, unlike people, occasions, images, and drafts list routes. It now returns the flat `{data,nextCursor}` envelope with private no-store headers. Both history consumers validate the runtime list shape and show their existing recoverable error UI for malformed payloads. The overview now loads all occasion pages and sorts computed upcoming dates before selecting the nearest three. The contract regression is registered in `scripts/account/run-tests.mjs`.

The coordinator owns final typecheck/build. No build was run here. UI browser QA and production Firebase action-link configuration remain integration/release checks.

## Integration notes and gates

- Coordinator integrated detected MIME propagation through `pinGeneratedOrderMaster` and saved-image order masters; generated-source pinning intentionally does not trust a client UID or require an oversized inline-data Firestore equality lookup.
- Verification delivery requires configured Firebase email action URL/domain. User verification remains an explicit provider setup gate; reminder and other external send transports remain disabled/fake-only in this sprint.
- Do not enable real reminder delivery until consent, confirmed timezone, unsubscribe, dispatch idempotency, and operational recovery gates are independently verified.
