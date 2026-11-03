# Release inventory for Sprint 0026 — November 3, 2026

Read-only inventory requested alongside Sprint 0026 work. This report separates live deployments from Git branch pointers and implementation worktrees. No deployment, fulfillment, email, payment, or checkout mutation was performed for this audit.

## Live release baseline

A read-only Firebase App Hosting and Cloud Run API query verified the serving builds on November 3. It returned source hashes, READY state, traffic allocation, latest rollout, and selected safe runtime flags only; secret values were neither queried nor printed.

| Environment | Serving source | Build | Rollout / traffic | Safe runtime facts |
| --- | --- | --- | --- | --- |
| Staging | `0cd82d898e1e232762c61a91544fa3ba8ad99bc4` | `build-2026-11-02-002`, READY | SUCCEEDED, 100%, no reconciliation | Review-only true, Handwrytten test mode true, international preview true, reminders false |
| Production | `257b2a9f920f7fcaae30350bc7971c36f7a4c1f2` | `build-2026-11-02-004`, READY | 100%, no reconciliation | Public app URL is `https://sendmynotes.com`, reminders false |

The staging and production SHA values differ, but their Git trees are exactly identical: `65b9bfb3c118d3630a55c2889f2817516e144f34`. Thus the current staging and production application source is identical. The staging environment retains the intended review/test flags; those are environment settings, not missing feature code.

The source hashes also match current fetched refs: staging serves `origin/codex/sitelink-staging-fix` (`0cd82d8`), while production serves `origin/main` (`257b2a9`). GitHub read-only metadata confirms PR #6 merged to `main` at `257b2a9` on November 2 at 23:00:26 UTC. PR #6's rollout has therefore completed to both environments: App Hosting shows the staging build sourced from `0cd82d8` and production build sourced from merge commit `257b2a9`, with both trees equal. This resolves the earlier deployment uncertainty.

## Branch pointer drift

The local root is on `staging` at `ae7f77e`; it is **23 commits behind** fetched `origin/staging` at `00852e7` (`git rev-list --left-right --count HEAD...origin/staging` = `0 23`). The fetched `origin/staging` ref itself is old relative to the live staging release. Do not use either the local root branch or `origin/staging` alone as the current deployment baseline. The live staging source is `0cd82d8`, whose tree is identical to production's live source.

The dedicated `codex/sitelink-staging-fix` commit (`0cd82d8`) has been deployed on staging. Its production counterpart is included in merged PR #6 (`f49117e` / merge `257b2a9`). The commits differ because of their base histories, but their deployed trees are identical. It is not unpushed or staging-only feature work.

## Other branches and implementation worktrees

- Account/Studio fixes were released through PR #5. The November 2 release record reports staging build `build-2026-11-02-001` at `593914e` and production build `build-2026-11-02-003` at `d215f3d`, with the same tree. PR #6 then advanced both to the exact same new tree. Account history thumbnails, collapsed builder save controls, and pre-generation Exact Lettering are live.
- `origin/codex/account-studio-polish` and `origin/codex/production-readiness` are ancestors of the current release history. They have no unique implementation commits pending. The local `codex/account-experience` checkout at `d3066e0` differs from current `main` only by staging evidence/report/ledger additions; account implementation is already shipped.
- Discount-payment, attribution, first-sale-cleanup, and the older `cr/S0-*`, `cr/S1-proto`, and routing branches have no unique patch commits relative to current `origin/main` under `git log --cherry-pick --right-only`. Their reviewed/selected changes are already represented in current release history.
- The `.delivery/runs/20261101-readiness/checkout` worktree has eight local modifications, including thumbnail display and collapsed account builder tools. Those implementation hunks duplicate the already-deployed Account/Studio fixes; the rest updates Sprint 0025 release evidence/ledger. It is not new unshipped functionality.
- `.delivery/runs/20261103-post-purchase/checkout` is at `257b2a9`, the current live production source. Its untracked additions are Sprint 0026 planning/templates and a proposal mockup, not implementation code. Other inspected delivery clones were clean at their historical commits or contained no unique implementation changes. The root checkout itself has numerous untracked planning/evidence files and the dirty ledger, but this audit found no additional uncommitted product implementation there.

## Operational gates that remain inactive

Sprint 0025 records that reminder delivery stays off and manual privacy requests remain operator-reviewed. Production Scheduler access was unavailable in prior readiness evidence; cleanup scheduling and account-library/reminder jobs remain inactive. These are deliberate operational gates rather than code waiting for a push. Separate acceptance work remains: signed-in/two-user account ownership checks, private-storage runtime fixture proof, responsive/keyboard review, and manual privacy-processing rehearsal. Apple Pay remains untested. The canonical brief still sets the commercial baseline at zero independent customer conversions.

## Sprint 0026 implication

Use the live source SHA/tree above as the deployment baseline. There is no distinct feature implementation currently live only in staging and missing from production: both now run the same Git tree. The recent account/Studio and sitelink changes have shipped to both. Continue to treat the account/privacy/cleanup verification gates and reminder activation as open operational/acceptance work, and use Sprint 0026 for the post-purchase scope currently being developed.
