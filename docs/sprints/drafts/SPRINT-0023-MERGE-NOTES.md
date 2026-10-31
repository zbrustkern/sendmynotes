# SPRINT-0023 merge notes

## Planning lanes and authority

Two independent native Sol drafts and reciprocal critiques were completed. The founder approved the optional account menu design, requested Sol planning and Luna execution, and then explicitly expanded this sprint to a shared interior note preview. Staging rollout is already authorized; production, real payment and supplier submission remain excluded. No extra approval interview is required. No chapter or semantic index is configured.

## Draft strengths retained

- **Sol A:** explicit menu state matrix, UID-bound async access checks, two draft hydration paths, distinct admin session handling, and separate Luna file ownership.
- **Sol B:** precise mounted UI and keyboard details, narrow identity-transition rule, honest partial sign-out states, and concrete cross-UID browser scenario.
- **Both:** guest checkout stays account-optional; admin permission and Studio grants remain separate; existing work is verified rather than redone.

## Critiques accepted and baseline correction

- Current mounted refresh and new-tab tests passed private preview restoration and accepted tuple through checkout. The remaining privacy gate is signed-out/cross-UID behavior, including late async responses.
- On UID change, immediately hide old private art, revoke blob URLs, ignore late responses and block checkout. Retain safe note/address data, then require an explicit catalog-front or separate-card choice. Same UID can restore after server validation.
- Sign-out must report partial failure: admin-cookie deletion failure leaves Firebase signed in; Firebase failure after cookie deletion may leave the sender signed in. Neither can be reported as complete.
- Keep account-page logic small and avoid broad admin rework. Verify the already edited 401/403 and two-admin behavior.

## Added shared-preview scope and decisions

The new request adds one `NoteInteriorPreview` renderer and a shared font resolver across admin `ProofInspectorModal`, `CardPreview` inside single/spread views, and the Step 2 note interiors. Existing copies use a fixed Caveat-like admin script or separate layout rules; `CardPreview` also says “Exact physical print preview,” which is unsupported. Use the verified 17:22 A2 folded-leaf ratio as geometry, measure loaded font text within bounded preview dimensions, and show an overflow warning without truncating the sender's words. Preserve the full text in an accessible reading region. Map stored legacy numeric/string font IDs through one resolver to the five supported supplier labels; unknown IDs show preview unavailable. The existing supplier payload defaults unset IDs to David and unknown IDs to Adam, which this sprint does not change. Preview the same trimmed greeting-plus-note joining convention used by `buildSingleStepOrderPayload`; leave its order message and font payload unchanged. A preview is approximate because physical line wrapping and trim tolerance are unverified. Test all styles and unknown, slow and failed fonts at 320/375/390/430, tablet and desktop; use WebKit if available. Admin modal must reflow and keep controls/content reachable.

## Final lane ownership

1. Luna menu/auth/account: `FlowHeader`, `AuthModal`, `AuthContext`, account page and focused tests. State matrix, refresh and two-session sign-out.
2. Luna private UID transitions: mounted builder, draft stores and narrowly necessary UploadStudio state; focused privacy/restoration tests. Preserve already passing new-tab behavior.
3. Luna shared previews: shared renderer/font resolver, `CardPreview`, `Step2NoteComposition`, `ProofInspectorModal` and preview fixtures. No fulfillment, checkout, payment or supplier request edits.

Main owns upload-admin/backend verification, cross-lane integration, shared browser/build checks, staging deployment and exact-commit proof. This avoids competing edits to the same preview and auth files. If a lane finds a necessary cross-owner edit, it reports the seam to main.

## Scope boundary

No new public upload entry, forced account step, generalized card editor, provider regeneration, supplier print guarantee, live order, or production release. The added preview task improves consistency and honesty of the visual estimate; it does not change what Handwrytten receives.
