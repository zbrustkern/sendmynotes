# SPRINT-0023 intent — Optional account menu and clear private upload access

## Seed and authority
Founder approved docs/proposals/2026-10-31-optional-account-menu/DESIGN_SPEC.md and explicitly requested Sol sprint planning, Luna subagents for execution. Earlier authorization to push the completed upload work/fixes to staging continues. Guest sending must remain account-optional; user-facing Upload studio stays gated per verified account, while Upload administration separately delegates access. Domain email forwarding does not merge identities; zbrustkern and sentral remain separate Firebase accounts. Preserve approved upload mockups.

## Planning lanes
Two independent native Sol planning lanes, cross critique, coordinator merge; Luna execution. This explicit model choice overrides skill default Claude/Astra lanes and continues the authorized native subagent workflow. No Gemini. Native lanes have already completed authenticated work in this thread. Reuse them. Approved spec and ongoing user clarifications settle scope; do not reopen redundant approval/interview questions. Ask only genuinely unresolved requirements.

## Pyramid Index
- L0: Add optional account utilities to the existing menu without disrupting guest sending or exposing private uploads across accounts.
- L1: Account/auth states; UID-bound studio entitlement; distinct admin controls; nonblocking restored-note notice; staging evidence.
- L2: Approved spec, code surfaces below, SPRINT-0022 evidence and current follow-up diff.

## Orientation
SPRINT-0020 integrated envelope preview; 0021 refined sending/reset flow; 0022 shipped private upload studio and deterministic lettering. Staging remote is 04c8517. Local 4837b3f adds final receipts; current uncommitted changes fix reported admin/user confusion and reminder. Incorporate these rather than redo them. No chapter links or semantic index configured (docs/SEMANTIC-INDEX.md).

## Current work and division
Already in working tree: admin label/state cleanup; upload admin allowlist includes both canonical admins; shared requireUploadAdmin with separate 401/403; FlowHeader sign-in/account/sign-out and granted-only studio link; independent 4s inline reminder; consistent account-page Studio label; custom-domain checkout origin fix; signout clears admin cookie. Luna creative currently debugging new-tab accepted upload restoration in app/preview/entry/client.tsx (preserve their edits). Expanded check-ui passes existing refresh/fullflow/admin/entitlement/toast checks, but new-tab preview is a live unresolved gate; do not claim it passed.

Remaining approved-spec gaps to evaluate: explicit auth/entitlement loading/error states, refresh on menu open, keyboard/mobile focus, optional modal copy, UID transition private preview and pending-state safety, signout failure handling, guest path preservation. Avoid needless architecture changes or widening permissions. No automatic Studio grants to administrators. No real payment/fulfillment calls.

## Relevant surfaces
components/flow/FlowHeader.tsx; components/AuthModal.tsx; context/AuthContext.tsx; app/preview/entry/client.tsx; app/account/page.tsx; app/admin/uploads/page.tsx; app/admin/page.tsx; lib/upload/admin.ts and admin API routes; apphosting.staging.yaml. Existing tests/upload-*.test.ts, tests/draft.test.ts, docs/sprints/evidence/SPRINT-0022/check-ui.cjs.

## Success criteria
Implement complete approved menu state matrix; guest draft survives optional sign-in modal; granted-only link refreshes without previous UID leakage; user/admin signout both cleared or honest failure; private cover never reaches another account checkout; exact upload survives refresh/newtab; admin permissions actionable for both configured administrator identities; reminder dismisses after4s without overlay; 320/390/768/1024 layout and keyboard checks; focused tests/typecheck/build; staging custom-domain hosted check and exact release identity; production unchanged.
