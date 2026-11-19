# Hosted wedding promotion acceptance

This runner is pinned to the SPRINT-0031 staging App Hosting origin and its fictional household CSV. It creates two synthetic wedding projects, publishes project-scoped synthetic codes, and makes four real Stripe **test-mode** captures. The batch rows must remain held for review. The runner never calls fulfillment or production routes.

Run only from this checkout after the SPRINT-0033 wedding-promotion release is serving in staging. The runner requires both explicit flags and checks the staging preview capability, wedding checkout response, Stripe `pk_test_` key, test-mode PaymentIntent, and held final state. A missing feature gate or authorization is reported as `UNAVAILABLE`; a cent or state mismatch is `FAIL`.

## Existing staging admin session

Put an already-authorized staging admin cookie pair (`smn_admin_session=...`) in a regular file outside the repository with owner-only permissions (`0600`). Do not put the value in a shell command or the recovery file. Then run:

```sh
WEDDING_ADMIN_COOKIE_FILE=/private/tmp/smn-staging-admin.private \
  node --import tsx docs/sprints/evidence/SPRINT-0033/hosted-promo.mjs \
  --staging-test --allow-test-captures
```

The session is used for the campaign draft/publish APIs and, when authorized, the existing `/api/admin/wedding/refund` route. A 0600 private recovery file is created at `/private/tmp/smn-wedding-0033-promo-private.json`; set `WEDDING_PROMO_STATE` to another `/private/tmp/smn-wedding-0033-promo-*.json` path to run a separate cohort. Reuse the same path to resume. It contains synthetic project sessions and private synthetic codes, but no Stripe client secret or payment credential.

## Coordinator campaign setup module

If the coordinator uses an already-authenticated local staging IAM workflow instead of an admin session, set `WEDDING_PROMO_SETUP_MODULE` to a local `.mjs` module. The runner imports and calls it only after the relevant synthetic project exists. Export `setupCampaign(context)` (or a default function); it receives:

```js
{
  origin, scenario, projectId, runId, syntheticCode,
  policy, budgetCents, maxUses, previewScenario, expectedPreview
}
```

Create and publish the supplied synthetic, project-scoped wedding policy using the coordinator's existing authenticated staging IAM path, then return `{ campaignId, code: syntheticCode }`. Return `{ available: false }` if that path or staging readiness is unavailable. Keep the operation idempotent for a repeated `projectId` and `syntheticCode`. Do not mint credentials or return secrets. Example invocation:

```sh
FIREBASE_PROJECT_ID=sendmynotes-staging GOOGLE_CLOUD_PROJECT=sendmynotes-staging \
WEDDING_PROMO_SETUP_MODULE="$PWD/docs/sprints/evidence/SPRINT-0033/staging-fixture-operator.mjs" \
  node --import tsx docs/sprints/evidence/SPRINT-0033/hosted-promo.mjs \
  --staging-test --allow-test-captures
```

The bundled staging operator checks the serving revision, its test-only payment configuration, the synthetic project and both captured amounts before calling the same wedding refund service as the admin endpoint. A custom setup module can omit `refundFixture`, in which case the refund check reports `UNAVAILABLE`.

## Expected evidence

The synthetic domestic project applies $1 to each of its first 25 card bases: 20 cards capture **$145.00**, then 30 capture **$207.50**. The mixed project captures **$698.50** for ordinals 1–98 and **$18.50** for ordinals 99–100. Position 99 is H099, France, and its frozen line is **$12.00**; the safe admin refund route is replayed with one stable idempotency key and must leave the $6.50 position-100 line intact.

The final JSON reports per-check `PASS`, `UNAVAILABLE`, or `FAIL`, amounts in USD cents, held row counts, and `fulfillment: "not_called"`. Do not use a SPRINT-0031 recovery file for this run.
