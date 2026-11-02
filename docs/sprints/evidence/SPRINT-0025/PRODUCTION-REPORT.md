# Sprint 0025 production rollout

## Authorization and scope

On November 2, 2026 the founder explicitly requested production promotion to use uploads for real cards. Prior recovery links, admin-comp links and admin sessions may expire. Manual privacy requests are retained; reminders remain disabled. Broader signed-in acceptance and cleanup scheduling remain open follow-up work, as recorded in RELEASE-GATES.md. Deployment is not evidence that those checks passed.

## Candidate and rollback

The application code is identical to staging commit `8373cb3c529ae726ca8c22ee5976364d311e4b35`; subsequent changes are release documentation/evidence only. Before deployment, production serves `a298a1935e9560f5c53df5bcad02ecfc63e9bf44`, build `build-2026-10-30-005`, revision `sendmynotes-build-2026-10-30-005`. The previous production build is the rollback target. Preserve additive storage, indexes, secrets and new account data.

## Final preflight

- All 21 production Firestore indexes are READY.
- Private bucket has uniform access, public-access prevention, no public principals and runtime object permissions.
- All three new secret containers exist; the production manifest binds version 1.
- Existing production has not yet loaded the new account/upload environment; the application rollout supplies it.
- Fresh staging probes passed all 21 page-shell/auth/cache checks.
- Fresh isolated upload creative, upload checkout, upload security, history list contract and payment-mode suites passed. No real payments, provider image generations, supplier orders or emails were created by validation.
- Production Scheduler inventory returns 403. Cleanup activation and fixture rehearsal remain outstanding.

## Rollout result

Pending; exact deployed source, build, traffic and hosted checks will be recorded after promotion.
