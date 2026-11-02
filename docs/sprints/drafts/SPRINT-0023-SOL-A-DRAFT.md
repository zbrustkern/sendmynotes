# SPRINT-0023 Sol A draft: Optional account menu and private upload access

## Pyramid Index

- L0: Make account utilities easy to find in the existing card menu while keeping guest sending seamless and private upload designs bound to their owner.
- L1: Explicit auth/entitlement states; safe sign-out and account switching; draft and upload restoration; admin identity clarity; mounted staging proof.
- L2: Approved `docs/proposals/2026-10-31-optional-account-menu/DESIGN_SPEC.md`, the implementation and verification sections below.

## Overview

The founder approved a small menu design, not a global navigation redesign. A guest can still complete `/new` without an account. The top-right menu quietly offers `Sign in`, or the active account email, `My account`, a granted-only `Upload studio` link, and `Sign out`. `Start a new card` stays separate and retains its discard confirmation. `Upload administration` at `/admin/uploads` remains a distinct capability surface; `zbrustkern@gmail.com` and `sentral@gmail.com` can each be authorized administrators, but only the specifically granted Firebase UID may use the sender Studio. Email forwarding grants no shared identity.

This candidate already contains follow-up work: menu basics, account/admin labels and 401/403 handling, admin-cookie clearing during sign-out, a short restored-note notice, and checkout-origin fixes. Preserve and verify those edits. The new-tab accepted-upload restoration in `app/preview/entry/client.tsx` is still an unresolved gate; do not claim it passes. Staging remote is `04c8517` and local base is `4837b3f` per intent; inspect current release identity before staging. No production, real payment, supplier order, physical mail, or customer communication.

## Use Cases

1. Signed-out sender opens the menu, optionally opens/closes `AuthModal`, and continues the same guest card with note, addresses, and quoted total intact.
2. Signed-in sender sees the actual Firebase email. A verified UID with an active grant sees `Upload studio`; pending checks show a status, not a false denial; expired/revoked/unverified accounts see no link; a failed access check says it is unavailable and offers retry without blocking ordinary sending.
3. Founder switches between the two authorized admin emails deliberately. The sender Studio follows the active UID's explicit grant, not admin status or forwarded mail. The interface distinguishes `Upload administration` from `Upload studio` and shows which account is active.
4. When a sender signs out or switches accounts, private preview pixels and upload selection vanish from the other account's visible draft and checkout. A normal guest/catalog draft remains recoverable. The original owner may restore a private design only after fresh authentication and ownership verification.
5. A sender restores an accepted upload front in the builder after refresh or a new tab, sees its actual private preview, and continues to note/address/review. A brief restored-note notice dismisses after about four seconds without covering controls.

## Architecture

Use `AuthContext.loading` plus `user.uid` as the UI identity boundary. Keep a distinct entitlement state of `checking | active | inactive | error`, never a Boolean default that treats network failure as no grant. Clear the prior UID's allowed state synchronously on auth change; fetch `/api/upload/access` with the current ID token, and ignore late replies unless the captured UID and request sequence still match. Refresh when opening the menu, on focus, and after returning from grant/revoke. Server routes remain the authority for upload reads, acceptance, and checkout; the menu link grants no access.

The menu uses the approved state matrix: auth resolving → `Checking account…`; signed out → `Sign in`; signed in/checking → email, `My account`, `Checking studio access…`, `Sign out`; active grant adds `Upload studio`; inactive/expired/revoked/unverified omits it; access error shows `Studio access unavailable` and retry. `Start a new card` sits below a separator where available. Status rows are not keyboard menu actions. The existing trigger stays top-right, at least about 44 px, with email legible or inspectable at 320 px. The sign-in modal stays dismissible and may say once, “You can send a card without an account.”

Sign-out is a coordinated state transition: clear the separate administrator session before reporting completion of Firebase sign-out. If admin-cookie deletion fails, show retry and do not claim the user switched. `app/admin/uploads/page.tsx` should use the same path and not duplicate cookie deletion. On the sender side, revoke blob/object URLs, clear in-memory preview/selection and UID-specific pending upload state on identity change. Do not delete the original owner's private server objects. Retain note/address fields only where they can safely continue with a catalog front; make that choice explicit when a private front becomes inaccessible. Never revive an upload selection from local/session storage without matching UID and a fresh `/api/upload/designs/:id` result, then fetch its preview through authenticated bytes. Checkout remains blocked until this check succeeds. The current `app/preview/entry/client.tsx` has both current and legacy local-draft hydration; test both, including new-tab behavior. Do not store private preview URLs in browser persistence.

Keep `Upload administration` and Studio language consistent in account/admin surfaces. Do not automatically grant Studio access to either administrator. The short restored-note notice is informational, nonblocking, and dismisses independently of auth or grant state. Preserve the approved Upload studio mockups and public gallery.

## Implementation plan and exclusive Luna lanes

Freeze the state matrix and identity-transition contract before parallel edits. Existing in-progress diff is an input to review, not work to redo. Main coordinates merges and owns the staging release. Three Luna lanes can work in isolated worktrees or on exclusive files; agree on exported behavior first.

| Lane | Exclusive files and tasks | Required evidence |
| --- | --- | --- |
| A — menu/auth | `components/flow/FlowHeader.tsx`, `components/AuthModal.tsx`, `context/AuthContext.tsx`, focused menu/auth tests. Complete loading/error/refresh-on-open states, focus/keyboard/mobile behavior, optional modal copy, honest sign-out failure. Expose a single sign-out operation that clears admin session before Firebase state. | State-matrix tests, focus and failure tests, guest draft unaffected by opening modal. |
| B — draft/private boundary | `app/preview/entry/client.tsx`, `lib/draft/**`, `components/upload/UploadStudio.tsx`, focused draft/restoration tests. Finish in-progress new-tab restoration; discard prior UID's private visible state and blob URLs; verify owner-bound accepted design before displaying or sending to checkout; preserve safe guest/catalog fields and nonblocking restored-note notice. | Same UID refresh/new-tab success; cross-UID, sign-out, stale grant and failed preview rejection; guest note/address retention. |
| C — labels/admin/account | `app/account/page.tsx`, `app/admin/uploads/page.tsx`, `app/admin/page.tsx`, `lib/upload/admin.ts`, admin upload API routes, focused admin/entitlement tests. Confirm two configured administrators, independent Studio grants, 401 versus 403, account-switch state and consistent labels. Do not broaden capabilities. | Both admin identities can enter admin; only explicitly granted UID sees/uses Studio; failed switch remains honest. |

Main owns shared integration tests, `docs/sprints/evidence/SPRINT-0023/**`, staging configuration/release, and any cross-lane corrections after review. It should inspect the existing SPRINT-0022 UI harness before extending it so proof covers current behavior without duplicating an already passing check. The checkout-origin fix is verified during integration rather than redesigned here.

## Files Summary

Likely modified: `components/flow/FlowHeader.tsx`, `components/AuthModal.tsx`, `context/AuthContext.tsx`, `app/preview/entry/client.tsx`, `lib/draft/**`, `components/upload/UploadStudio.tsx`, `app/account/page.tsx`, `app/admin/uploads/page.tsx`, `app/admin/page.tsx`, upload admin auth/routes and focused tests. New evidence lives under `docs/sprints/evidence/SPRINT-0023/`. No new public route or account-first checkout flow.

## Definition of Done

- The full menu state matrix matches the approved spec, including auth loading, grant loading, grant error/retry, verified active grant, inactive/expired/revoked and unverified states. A grant for UID A never flashes or appears for UID B after switching.
- Guest sending remains complete without sign-in. Opening, canceling or completing optional sign-in does not erase a guest-selected cover, note, addresses or quote; no login modal appears during ordinary checkout.
- Sign-out and admin switch clear both relevant sessions or show an actionable failure. Private upload preview/object URLs and selection cannot appear for another UID or reach checkout. Same-owner private front restores after refresh/new tab only after server validation; legacy hydration is covered.
- `Upload administration` and `Upload studio` labels and roles are distinct. Both configured administrator identities are accepted as admin where authorized, and each still needs its own explicit Studio grant. No public upload promotion or automatic grant.
- `Start a new card` retains its independent confirmation. The restored-note notice expires after about four seconds without intercepting controls or affecting payment state.
- Mounted 320/390/768/1024 browser checks cover touch target, viewport fit, email inspection, keyboard arrows/Tab/Escape, focus return and screen-reader status. Focused security/draft/menu tests, typecheck and build pass.
- Staging serves the exact intended commit on its hosted/custom-domain route; a safe hosted smoke covers guest, signed-in/granted, no-grant, account switch and new-tab restoration. Production stays untouched; no live payment or fulfillment check occurs.

## Risks and mitigations

- **Two auth mechanisms:** Firebase user and admin cookie can diverge. Centralize sign-out ordering and show failure; confirm admin `GET` after switching rather than trusting labels.
- **Legacy draft and async races:** local storage and pending fetches can revive another UID's private selection. Carry owner UID, invalidate on identity change, sequence async replies, and require server verification before preview/checkout.
- **Guest-flow regression:** sign-in must stay optional and cancelable; test ordinary sending with no account through review and safe checkout mock.
- **Entitlement staleness:** menu is discoverability only; refresh on open/focus and rely on server checks at every private operation. Treat access errors separately from true denial.
- **Live release mismatch:** check deployed commit and auth domain on staging after release; existing local evidence alone is insufficient. Do not use a supplier or real payment to prove UI behavior.

## Dependencies and open questions

Dependencies are the existing Firebase auth and upload access endpoint, accepted-design resolver, SPRINT-0022 test fixtures, and staging hosting access. The intended UX and authorization are settled by the approved spec. Implementation may choose whether the small menu retry is an inline button or a re-open refresh, provided access failure is clearly distinguished and recoverable. Any remaining new-tab restoration defect or inability to clear the admin cookie is a release blocker, not a reason to silently weaken privacy behavior.
