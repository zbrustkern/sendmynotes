# Sol A critique of Sol B draft

## Strengths to retain

- The draft correctly treats this as a small menu follow-up to SPRINT-0022. It protects guest sending, distinguishes the administrator cookie from the Firebase sender identity, and keeps Studio access tied to a verified UID rather than an admin email or forwarded inbox.
- Its explicit menu state machine, request sequencing, refresh-on-open, and error/retry behavior close the main gap in the current Boolean `uploadStudioAllowed` code. The keyboard and modal focus details are concrete enough to test.
- Exclusive file ownership is practical. Holding `app/preview/entry/client.tsx` until the ongoing restoration edit finishes avoids a real collision. Main ownership of the changing browser harness and staging release is appropriate.
- The test matrix covers both draft persistence paths, cross-account preview leakage, guest draft retention, failed sign-out, and admin capability separation.

## Corrections and gaps for the merge

1. **Update the baseline:** The latest mounted test has now passed refresh and new-tab restoration of the private preview and accepted tuple through checkout. This is no longer an unresolved current failure. Keep signed-out and cross-UID restoration as remaining gates, and rerun the passing path after integration only if the touched files could regress it.
2. **Clarify successful sign-out semantics:** The proposed `AuthContext.signOut` deletes the admin cookie first, then signs out Firebase. If Firebase sign-out fails after cookie deletion, the user may remain signed in as a sender. The UI must report partial failure accurately and retain the current Firebase email; it cannot claim both sessions cleared. Tests should cover both failure orders and a retry.
3. **Avoid implying the account page needs a second full state machine:** The approved spec requires no false grant promotion and distinct error versus inactive where status is shown. It does not require a persistent account-page access error panel. Reuse a small UID-safe entitlement hook or consistent request pattern if practical, rather than duplicating complex menu logic.
4. **Make private-draft recovery choice precise:** On UID change, clear private pixels, object URLs, upload selection and URL handoff immediately. Keep ordinary note/address data but prevent checkout until the sender explicitly selects a catalog front or starts a separate card. Do not silently replace the front with a default preset while retaining private-origin checkout fields. Restoring account A's server design requires A's fresh login and server validation.
5. **Define auth-loading menu behavior:** The draft says `Checking account…` while Firebase restores, but account actions should not briefly render from a stale `user` object. Tie both row visibility and pending fetch cancellation to the same UID and `AuthContext.loading`; test late grants arriving after a switch.
6. **Hosted test scope:** A safe hosted check should verify actual account and grant separation if usable staging credentials exist, plus commit/runtime identity. It must not use real payment or fulfillment. If real credentials are unavailable, record that limit and retain deterministic mounted cross-UID/API tests rather than making a generic hosted login an unbounded release blocker.

## Merge recommendation

Adopt Sol B's state machine and file boundaries. Revise the current-status paragraph to reflect the newly passing new-tab test, keep cross-UID/sign-out privacy as the main remaining proof, and specify exact partial sign-out and private-draft recovery behavior. The approved spec and staging authorization settle the product scope; no new approval question is needed.
