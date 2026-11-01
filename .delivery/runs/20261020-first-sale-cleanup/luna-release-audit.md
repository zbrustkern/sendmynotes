# Luna release audit — first-sale cleanup

Audit scope: release procedures, CLI support, source-branch boundaries, and safe local verification recommendations. Read the canonical brief/specs and the previous discount/payment release report and rollback notes. No source code, deployment, runtime configuration, purchase, fulfillment, email, or provider action was performed.

## Baseline and source boundaries

The freshly checked refs are `origin/main` at `c7c127e3e184252d0c727df715dd18e8e30129f6` and `origin/staging` at `2723ea1bc1291d801386124781442a7eeda74ada`. The coordinator's sanitized read-only App Hosting snapshot reports production rollout `rollout-2026-10-19-001` / build `build-2026-10-19-001` READY at 100% for the main SHA, and staging rollout `rollout-2026-10-19-004` / build `build-2026-10-19-005` READY at 100% for the staging SHA. This is coordinator-provided evidence; I could not independently read cloud metadata because the local CLI request was blocked by network restrictions and the escalation attempt was interrupted.

The `origin/main` to `origin/staging` diff includes a large admin overhaul plus numerous API, checkout, telemetry, and payment-related changes. The two refs also diverge in public entry files (`app/page.tsx`, `app/send/page.tsx`) and in `components/AttributionTracker.tsx`, `CheckoutStep.tsx`, `ExperienceRouter.tsx`, and `VendingMachineBuilder.tsx`. Apply only reviewed cleanup hunks to staging and production-based source; a wholesale staging merge risks promoting unrelated admin and server work. The staging branch also has its own `apphosting.staging.yaml` and hosted review/payment safeguards, which must remain intact.

The canonical brief/specs remain the authority for customer wording: personal senders, thoughtful gesture, real-pen message, $9 including mailing, personal return address, and no unsupported stock/envelope or blanket tracking claims. An admin founder-test clarification, if retained, should be dated testimony and should not present a stale hardcoded current conversion count. Do not claim independent conversions, Apple Pay success, supplier stock details, tracked delivery, or commercial lift.

## CLI and rollback facts

The installed Firebase CLI exposes `apphosting:backends:get` and `apphosting:rollouts:create`. Its local help confirms `backends:get` accepts a backend and location. The prior release rollback notes document both the preferred recovery path (roll back in the Firebase App Hosting UI to a recorded READY build) and a CLI rebuild fallback:

```sh
firebase apphosting:rollouts:create sendmynotes --project sendmynotes-2a417 --location us-central1 --git-commit b831eb07c034e4bba7d68cedac6315c53f24064e --force
```

For this cleanup, record the immediately preceding READY production build/source before promotion and use that exact known-good build as rollback. The `--git-commit` command rebuilds source; prefer selecting the existing READY build when supported. Never alter secrets/payment environment values or use force-push. Production baseline rollback details should be refreshed in the run's ROLLBACK.md after the new staged candidate is known.

Automatic App Hosting rollout trigger behavior was not independently verified in this audit. Before pushing, inspect the configured backend branch and current rollout policy using the already-approved sanitized hosting snapshot helper. After each push, watch for a rollout tied to the exact pushed SHA and correct project/backend; do not create a duplicate manual rollout if that push already started the intended rollout. If no automatic rollout starts, the known CLI supports explicitly pinning a commit with `--git-commit <sha>`; verify actual command options against `firebase apphosting:rollouts:create --help` before use.

## Safe verification sequence

Run only from clean, pinned source copies so unrelated dirty delivery documents are not staged. First review the exact diff against each target base and confirm payment, pricing, checkout APIs, Handwrytten integration, email, secrets/configuration, and campaign routing remain unchanged. Exercise the custom-art invitation at 320 px, 390 px, and desktop widths; open/close its chooser without triggering generation. Check affected policy/customer surfaces for factual substitutions and unchanged policy meaning. If an admin note is included, verify it clearly distinguishes dated founder testimony from computed analytics.

Recommended local checks are the repository's read-only relevant existing suites plus typecheck and optimized builds:

```sh
npm run test:staging-polish
npm run test:root-auto-select
npx tsc --noEmit
npm run build
```

Select any additional existing suite from the final diff (for example sender validation or delivery estimate) rather than running fulfillment, email-send, artwork-generation, payment-provider, or supplier scripts. No live charge or provider/API call is required. For staging, promote only the scoped integration, explicitly pin the SHA if automatic rollout is absent, preserve staging safeguards, then verify rollout/build READY, serving revision/traffic at 100%, route HTTP 200, visible copy and navigation, and no client page errors with provider/tracking/API mutation requests blocked. For production, start from production SHA, apply only the same reviewed hunks after staging passes, pin/deploy the exact SHA, verify READY serving revision/traffic, root and sending route health, visible copy, and zero unexpected errors. Keep a short health/log observation bounded and label it as such, not as evidence of sales or load capacity.

## Gaps and recommendation

I did not independently confirm current runtime feature flags, configuration hashes, branch auto-rollout policy, exact public copy strings, or current production rollback build through cloud metadata. The coordinator has the baseline source/rollout/build facts above; use the approved sanitized helper to record flags/hashes and trigger policy before release. No deploy should be treated as verified until the exact SHA, serving build/revision, route health, and rollback target are recorded. The current evidence supports a carefully scoped staging-first release only after local checks and independent diff review pass.
