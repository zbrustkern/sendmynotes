# Payment hotfix rollback

Production project/backend: sendmynotes-2a417 / sendmynotes, us-central1.
Recorded serving build: projects/sendmynotes-2a417/locations/us-central1/backends/sendmynotes/builds/build-2026-10-16-001 (equivalent numeric project resource in traffic snapshot).
Recorded revision: sendmynotes-build-2026-10-16-001, 100%.
Recorded source: b831eb07c034e4bba7d68cedac6315c53f24064e.

Abort production promotion for any failed required local/staging price or readiness test. Once promoted, roll back for wrong displayed/confirmed amount, wrong mode/order binding, unavailable normal checkout, new payment initialization failures attributable to this release or unanticipated supplier effects.

Use Firebase App Hosting Rollouts UI to roll back sendmynotes to the recorded READY build. The installed App Hosting SDK supports createRollout with an existing build reference; do not change secret/payment environment values or delete data. If selecting the existing build is unavailable, the verified installed CLI can rebuild the exact prior source:

firebase apphosting:rollouts:create sendmynotes --project sendmynotes-2a417 --location us-central1 --git-commit b831eb07c034e4bba7d68cedac6315c53f24064e --force

Verify rollout SUCCEEDED, old revision/build at 100%, and ordinary route/readiness checks. If a source-branch correction is needed to prevent future redeployment of the faulty commit, make an ordinary reviewed revert on main; never force-push. Retain orders, captures, redemptions, provider events and audit history. A rollback does not reverse already captured payments or accepted supplier work. Reconcile them before any refund or resend; those actions are outside this hotfix test scope.

Staging baseline is 7f6e3e5, revision sendmynotes-staging-build-2026-10-19-004; its review-only safeguards must remain enabled throughout.
