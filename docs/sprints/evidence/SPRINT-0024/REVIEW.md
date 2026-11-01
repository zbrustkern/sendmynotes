# Sprint 0024 — review disposition

Native Luna agents reviewed each other's domain code, and the coordinator reviewed the builder, order association, service boundaries, and reminder schedule. This is a code/synthetic-test review, not a hosted release approval.

Resolved findings:

- Checkout no longer trusts a submitted `userId`; bearer identity supplies ownership, including catalog orders. Occasion links are resolved under that owner before payment initialization. Accepted-order markers are written only at verified payment/promo acceptance.
- Account changes invalidate pending builder checkout work, including changes during token acquisition. Private previews, saved-draft handoffs and asynchronous account results are identity scoped. Resume resets acceptance, payment, discounts and scheduling.
- History and from-order image saves treat an explicit order owner as authoritative. Verified-email recovery is limited to ownerless legacy orders. A preassigned PaymentIntent does not prove a failed order was paid.
- Upload provenance survives copying an order front into the library. Uploaded fronts still need the existing Studio grant when reused; generated fronts remain usable without that grant.
- List pagination handles equal timestamps and scans tombstones without hiding older live records. Cleanup reclaims expired drafts and deleted private objects without reusing quota or repeatedly blocking later records.
- Reminder occurrences keep their civil due date. A late reminder does not perpetually move to tomorrow, and the bounded catch-up window also works for a normal 14-day reminder. Provider idempotency is an HTTP SDK option. Uncertain delivery is held rather than blindly repeated.
- Time-zone confirmation is an explicit UI choice, separate from saving a profile or address. Individual date consent and global pause are rechecked before dispatch. New legacy migrations do not inherit old reminder checkbox consent.
- The legacy account response now projects safe history fields rather than raw order records. The retired reminder endpoint requires authentication and returns an honest migration response; post-order screens link to Dates without claiming an email was scheduled.
- Migration failures remain retryable. Firestore retry callbacks do not retain success flags from aborted attempts, and concurrent library cleanup cannot resurrect a deleted image.
- Temporarily ineligible reminder rows now receive a separate retry time, so a paused/unverified backlog cannot monopolize every batch. A regression with more than 50 skipped rows proves later eligible work progresses; original due dates and the catch-up limit remain intact.
- Signed-out small-screen overflow checks passed. Signed-in responsive visual acceptance remains unverified after the browser's explicit URL-policy rejection; no workaround was used.

See the domain reports, final `REPORT.md`, and `RELEASE-GATES.md` for evidence and operational limits. All provider tests used synthetic fixtures and fake transports with external networking denied.
