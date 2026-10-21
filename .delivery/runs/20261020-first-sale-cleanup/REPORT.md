# SPRINT-0012 cleanup release evidence

Status: complete. Deployed and verified in staging, then production on October 20, 2026 America/Chicago (October 21 UTC). All six scoped acceptance criteria passed.

## Changes

The custom-art invitation now says “Create custom artwork / From a personal scene or memory,” wraps naturally, and has a short Create action. The existing chooser handler is unchanged. Existing product, catalog, policy, status and alternate-flow text now uses verified cardstock/envelope/real-pen wording, correct displayed folded A2 dimensions, estimated preparation/transit guidance and conditional mailing updates. Unsupported paper weights, cotton/archival/letterpress claims, matching-envelope promises and scoped 60-second promises were removed. Policy remedies and purchase conditions remain unchanged.

The production admin orders view gains a small dated founder report explaining that the purchases reviewed were founder tests and that paid totals/visit ratios alone do not establish independent customer demand. It does not recalculate metrics or hardcode a live customer count. Staging adds the same note while retaining its Oct 11 historical baseline.

Production patch: 18 files, 42 added / 39 removed lines, based on c7c127e; commit 0623a0a89b6d948b272f25ad8c9bfb4f4554962f. Staging integration: 17 files, 40 added / 37 removed lines, based on 844b2bf; commit f97f98f62d0fee461c236c597e33e9f54a7275d3. No broad staging-to-production merge. Payment/API/provider/hosting fingerprints are unchanged across 37 production and 47 staging critical files.

## Verification completed

- Luna alternate planning and independent implementation review were performed. Initial review caught residual claims; the second review confirmed all identified source findings closed. This is a Codex workflow with requested gpt-6-luna agents; no Antigravity review is claimed.
- Seven existing relevant regression suites passed per branch: target experience, staging polish, branch-appropriate ad entry, component rendering, drafts, ad routing and delivery estimates. Production initially attempted a staging-only test filename that does not exist on production; the runner was corrected to production's existing ad-entry suite and rerun. No product test failed.
- Both optimized Next builds passed, including TypeScript validation. Local builds suppressed advertising, removed inherited provider credentials, used clean checkouts without copied .env/customer data, and blocked external provider network access. Hosted builds use each environment's unchanged normal configuration.
- CUA browser checks at 320×844, 390×844 and 1280×900 show the full invitation and action, with button scrollWidth equal to clientWidth. Heights were 68.75, 54 and 54 pixels. Keyboard Enter and click open the existing custom-art chooser; closing preserves selection. Preset preview/selection, writing a synthetic note, and continuing to the address step worked. No artwork generation or checkout/payment was triggered.
- Conditional returned tracking-number rendering was reviewed in source and preserved. No individual order detail page was opened for this copy-only validation. The authorized production admin dashboard was viewed to verify the static notice; no customer content or admin screenshot was saved in the release artifacts.

Evidence: checks/*-regressions.json, checks/*-build.json and logs, checks/release-scope.json, checks/local-browser.json, luna-code-review.md, checks/*-commit.json.

## Hosted staging

Pushed f97f98f62d0fee461c236c597e33e9f54a7275d3 to staging. Project sendmynotes-staging, backend sendmynotes-staging, us-central1: automatic rollout-2026-10-21-001 SUCCEEDED, build-2026-10-21-001 READY, serving revision sendmynotes-staging-build-2026-10-21-001 at 100% traffic. The observed build source matches the pushed SHA.

Both review-only flags and HANDWRYTTEN_TEST_MODE=true remain in place. The payment configuration fingerprint is unchanged. Hosted root, /new and /privacy rendered correctly; the full artwork invitation was readable at 320px and 390px, and the chooser opened and closed without generation. No browser errors were captured. The short service error-log check since 03:16 UTC returned zero errors and zero payment-related errors.

Evidence: checks/staging-hosting-after.json, checks/staging-runtime-after.json, checks/staging-hosted-browser.json and checks/staging-mobile.jpg.

## Hosted production

After staging passed, pushed 0623a0a89b6d948b272f25ad8c9bfb4f4554962f to main. Project sendmynotes-2a417, backend sendmynotes, us-central1: automatic rollout-2026-10-21-001 SUCCEEDED, build-2026-10-21-001 READY, serving revision sendmynotes-build-2026-10-21-001 at 100% traffic. The observed build source matches the pushed SHA. Production retains its normal public URL, no staging review flag, and its unchanged payment configuration fingerprint.

Hosted root, /new and /privacy rendered correctly. The artwork invitation is fully readable at 320px and 390px; the chooser opens and closes. The signed-in admin dashboard displays the October 20 founder report and corrected cardstock description. No operational admin action, generation, checkout or payment was triggered. No browser errors were captured. The short service error-log check since 03:26 UTC returned zero errors and zero payment-related errors; this is a bounded deployment health check, not evidence of long-term reliability or successful payments.

Evidence: checks/production-hosting-after.json, checks/production-runtime-after.json, checks/production-hosted-browser.json, checks/production-health-after.json and checks/production-mobile.jpg. Prior production source c7c127e / build-2026-10-19-001 and the corresponding staging target are recorded in ROLLBACK.md. No rollback was needed.

## Acceptance evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| AC01: Readable invitation and preserved chooser | Passed | local-browser.json and both hosted-browser.json records; mobile screenshots |
| AC02: Scoped factual copy and preserved status behavior | Passed | reviewed source commits; luna-code-review.md; release-scope.json |
| AC03: Dated founder report separate from metrics | Passed | reviewed admin diff; production-hosted-browser.json |
| AC04: Regressions, builds and independent review | Passed | both branches' regressions/build JSON; Luna review; unchanged critical-file fingerprints |
| AC05: Staging before production with guards intact | Passed | staging hosting/runtime/browser evidence; deployment sequence |
| AC06: Correct production source, health and rollback | Passed | production hosting/runtime/browser/health evidence; ROLLBACK.md |

## Limits

This release does not establish customer demand, conversion uplift, CAC, LTV, actual supplier margins, Apple Pay behavior, or physical fulfillment. No live purchase, refund, supplier submission, email send, physical-mail test or new artwork generation is part of validation. The campaign configuration and unfinished admin-overhaul release gates are outside this sprint and unchanged.
