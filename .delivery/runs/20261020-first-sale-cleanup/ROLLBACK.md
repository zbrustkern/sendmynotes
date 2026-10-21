# Rollback targets recorded before cleanup

Read-only App Hosting and Cloud Run inspection confirmed these successful baselines before the cleanup on 2026-10-21 UTC (Oct 20 local):

| Environment | Project/backend | Previous source | Previous READY build / serving revision |
| --- | --- | --- | --- |
| Production | sendmynotes-2a417 / sendmynotes | c7c127e3e184252d0c727df715dd18e8e30129f6 | build-2026-10-19-001 / sendmynotes-build-2026-10-19-001 |
| Staging | sendmynotes-staging / sendmynotes-staging | 2723ea1bc1291d801386124781442a7eeda74ada | build-2026-10-19-005 / sendmynotes-staging-build-2026-10-19-005 |

Both served 100% of traffic at baseline capture. Region: us-central1. Successful baseline rollout IDs were rollout-2026-10-19-001 (production) and rollout-2026-10-19-004 (staging). Runtime flags and payment configuration hashes are retained in checks/production-runtime-before.json and checks/staging-runtime-before.json. Production has the normal sendmynotes.com URL and no staging review flag; staging has both review-only flags and HANDWRYTTEN_TEST_MODE=true. The completed cleanup now serves build-2026-10-21-001 in each backend; the targets above remain the rollback candidates. No rollback was needed.

Preferred rollback: in the existing Firebase App Hosting backend, create a rollout targeting the already READY build named above. Full build name follows projects/<project>/locations/us-central1/backends/<backend>/builds/<build>. Installed Firebase SDK helper createRollout(projectId, location, backendId, rolloutId, { build: fullBuildName }) supports targeting an existing build; use a fresh rollout ID and verify SUCCEEDED plus serving traffic. This helper signature was inspected in the installed firebase-tools gcp/apphosting.js, not executed.

If an existing-build rollback is unavailable, the verified CLI can rebuild the pinned previous source:

```sh
firebase apphosting:rollouts:create sendmynotes --project sendmynotes-2a417 --location us-central1 --git-commit c7c127e3e184252d0c727df715dd18e8e30129f6 --force
```

Use the corresponding staging project/backend and previous staging SHA to recover staging. Reverify build success, served revision, public UI and configuration fingerprints. Do not force-push or delete orders/financial facts. Application rollback cannot reverse a charge, email or supplier submission. This cleanup validation must create none of those effects.

Rollout policies point to main and staging respectively. Release strategy is fast-forward, scoped commits; watch the exact pushed SHA for automatic rollout and only invoke pinned CLI deployment if no matching rollout has started. Production push follows successful staging verification. No change to rollout policy is needed.
