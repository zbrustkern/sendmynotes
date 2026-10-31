# SPRINT-0022 intent: Private upload studio with expressive lettering

## Seed and authorization

Founder approved `docs/proposals/2026-10-30-upload-card-front/DESIGN_SPEC.md` and its mockups, including prominent creatively arranged exact lettering, and requested a sprint plan, Luna implementation agents, and staging deployment to try it. Production deployment, physical mail, live payments and customer communications are not authorized.

Founder explicitly overrode unavailable Claude/Astra skill lanes: **Sol for planning lanes; Luna for execution.** Use native `gpt-6-sol` planning workers with independent draft and cross-critique, then `gpt-6-luna` implementation workers. Main orchestration is inherited. No Gemini lane. This is an explicit session override of skill model/CLI defaults; do not halt for missing Claude or recursively reselect models. The approved design and explicit execution/deployment request supply scope approval; ask only if a genuine unresolved product blocker remains.

## Pyramid Index

- L0: Deliver an authenticated upload-to-card funnel with private imagery, exact expressive lettering and founder-managed access on staging.
- L1: Access controls and private assets; real image-reference generation; deterministic print composition; builder handoff and checkout integrity; tested staging release.
- L2: See approved DESIGN_SPEC, Context, Constraints, Success criteria and Planning output below.

## Context

- Isolated candidate is cloned from freshly fetched staging `d9a8929`; work only in this candidate. Original checkout `/Users/zeke/code/sendmynotes` is older and dirty and must remain intact.
- Latest staging incorporates admin simplification, international preview, checkout changes and telemetry reliability. Read mounted paths; do not implement against old proposal file assumptions.
- Canonical project brief/product specs and AGENTS.md apply. 17:22 A2 portrait, flat artwork, no unsupported supplier claims; no fulfillment scripts as checks.
- SPRINT-0019 addresses cover preservation/navigation, 0020 envelope photographic rendering, 0021 checkout/contact polish and staging runtime parity. Preserve them.
- Hosting backend/project `sendmynotes-staging`, us-central1. Target URL `https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app`. Inspect fresh runtime before release; don't assume older review-only flags still apply.
- No semantic index/token cache configured (`docs/SEMANTIC-INDEX.md`). No chapter selected/configured.
- Original inspection found text-only `lib/nano-banana.ts`, potentially-public `lib/image-optimizer.ts`, draft and legacy hydration in `app/preview/entry/client.tsx`, authenticated admin patterns in `lib/admin-auth.ts`. Verify against fresh candidate.

## Constraints

Separate `/create/upload` funnel, initially discoverable in admin and entitled accounts only. Admin grants by real existing account UID, expiry/revoke/audit; no admin privileges conveyed. Mandatory server card standards plus user image prompt, exact optional cover text and tested typography templates. Reference image must actually reach image provider. Never substitute text-only output or source image as success on failure. Private input/output storage with UID checks, safe decode/metadata stripping, no public URLs or image/prompt leakage into analytics. Read-only locked print rules, versioned creative guidance, and controlled lettering treatment activation.

Complete the smallest coherent staging beta of the approved design without stubbing essential paths. Detail reasonable implementation decisions and honestly label any deferred design extras. No arbitrary spending caps/format restrictions that silently narrow approved functionality. Existing spec defaults may be adjusted with rationale for safety/feasibility. Inspect provider documentation if needed; do not infer current API contracts. One or two bounded synthetic image generations for capability validation are within the requested implementation/testing scope; no personal image or supplier call.

## Success criteria

Founder can sign in on staging, open studio, grant an existing account, upload JPEG/PNG/WebP, enter instructions and Thank You lettering, generate actual reference-based illustration, inspect/adjust composed front, accept it into the existing builder, and preserve it through note/address/review. Server prevents unauthorized, cross-account, stale and revoked operations. Exact typography is part of immutable print master and checkout verifies identity; no raw-original or arbitrary URL bypass. Private files remain private and deletable. Admin standards changes are audited and versioned. Public gallery unchanged. Automated focused/security tests, typecheck/build and real component/browser checks pass; staging serves exact commit, production untouched.

## Planning output

Independently write your assigned Sol draft with Overview, Use Cases, Architecture, Implementation Plan (phases/tasks/files), Files Summary, Definition of Done, Risks, Dependencies and Open Questions. Include precise API/types contracts and split implementation into three nonconflicting Luna lanes (private backend/access, generation/lettering, UI/builder integration); main owns integration/release. Identify checkout/fulfillment touchpoints and response/request shapes early. Do not implement application code or deploy during planning.
