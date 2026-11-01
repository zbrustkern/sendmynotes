# Sprint 0024 — account implementation report

## Outcome

Three native Luna agents implemented the approved account experience. Two independent Luna plans and cross-critiques preceded the three implementation lanes; the coordinator integrated the builder, checkout ownership, shared contracts, and review fixes.

The local review branch is `codex/account-experience`, based on `027e75a` from staging. The durable checkout is `/Users/zeke/code/sendmynotes/.delivery/runs/20261101-account/checkout`. The original working checkout and unrelated edits were preserved. This is local implementation evidence, not deployment or full visual acceptance.

## Implemented

- Main-menu Account and Address book access; authenticated overview and responsive account navigation.
- History with immutable front, inside and address snapshots; safe owner-scoped reads, filters, pagination and make-similar drafts.
- Saved generated fronts, uploaded sources and composed fronts with private durable storage, explicit save/reuse, quota handling and upload-grant enforcement.
- First-class people with optional mailing addresses, multiple birthdays/anniversaries/other dates, versioned edits, import and retryable legacy migration.
- Optional 14-calendar-day email reminders at 9 a.m. in the confirmed account time zone, explicit late-reminder choice, pause/unsubscribe, exact-event accepted-order suppression and annual continuation. Production transport is default-disabled.
- Durable account drafts with explicit builder restore, version-conflict recovery and 90-day inactivity retention; private references and account changes cannot reuse stale checkout state.
- Settings for personal return address, profile, time zone and reminder pause. Privacy export/deletion requests persist for manual review.
- Legacy post-order reminder controls now link to Dates; they do not falsely promise that email was scheduled.

## Validation

**Passed:** all 13 guarded suites, `npx tsc --noEmit --pretty false`, the production `npm run build`, and `git diff --check`. The final check outputs are in `checks/`. `npm run test:account` runs 13 isolated suites with external networking denied: builder, order association, route security, preferences, privacy requests, history, legacy reminder retirement, library/drafts, people/reminders, existing device drafts, upload checkout, upload route security and optional account menu. Storage fixtures and message transports are synthetic. TypeScript, the production build and whitespace validation are separate checks.

Review covered owner boundaries, raw-order projection, version conflicts, private-byte provenance, identity changes during checkout, asset cleanup races, Firestore callback retries, date/DST/leap-year calculations and provider uncertainty. See [review disposition](REVIEW.md) and the three domain reports for details.

## Remaining acceptance and activation gates

Signed-out layout checks passed at 320 and 390 pixels. Signed-in responsive visual acceptance remains **unverified**: a synthetic component fixture was prepared, but browser policy rejected its URL and explicitly prohibited a workaround. Approved design mockups are design references, not implementation screenshots. Keyboard and full signed-in 320/390/768/1024 review remain open.

No deployment, real email, new payment or physical fulfillment was performed. Keep reminder delivery inactive until the scheduler, verified sender, credentials, live account isolation and controlled inbox/unsubscribe checks pass. Confirm private-bucket access, deploy and verify Firestore indexes/rules, and schedule guarded retention cleanup before release. Privacy requests need an operational manual-review owner. See [release gates](RELEASE-GATES.md).

Sprint status remains active for the open visual and hosted acceptance gates. Code implementation and the recorded local checks are complete.
