# Sprint 0024 intent — A complete personal account

## Pyramid Index
- L0: Implement the approved account design with reviewable history, reusable images, people/dates/reminders, settings and durable drafts.
- L1: Preserve current staging menu/upload/privacy behavior; define shared contracts before parallel Luna implementation; prove ownership, calendar and persistence invariants with safe tests.
- L2: Approved design, baseline, execution boundaries and success criteria below.

## Seed and authority
User: “This looks incredible can you craft a sprint plan and dispatch luna agents to complete?” This approves the account design in docs/proposals/2026-11-01-account/DESIGN_SPEC.md and authorizes implementation. Use native gpt-6-luna planning review and execution per the user's named team. The default Claude CLI planner is unavailable; this is a disclosed model/runtime adaptation, not a claimed Claude review. Coordinator synthesizes and integrates. No deployment, real email, payment or supplier fulfillment is required or authorized by this turn.

## Orientation
Clean task clone: /private/tmp/sendmynotes-account-20261101, branch codex/account-experience, baseline 027e75a (fresh origin/staging). Original checkout has unrelated uncommitted work and is stale; preserve it. Source facts in the Nov 1 design were collected from that older checkout and must be corrected against this baseline.
SPRINT-0021 polished envelope/checkout; SPRINT-0022 built private entitled Upload studio; SPRINT-0023 added authenticated account menu, UID-safe upload transitions and shared NoteInteriorPreview. Read these three sprint indexes and relevant detail. Reuse existing studio assets/designs and entry handoffs rather than building another image pipeline.
No semantic index is configured (docs/SEMANTIC-INDEX.md); no chapter link selected. Targeted source inspection provides prior art.

## Planning lanes
Two independent Luna planners write LUNA-A-DRAFT and LUNA-B-DRAFT, then cross-critique before coordinator merge. Exact model gpt-6-luna. Planning must define realistic implementation contracts and all pages, not defer entire requested features. Use isolated file ownership for execution lanes and a final independent review. Native runtime provides model availability; no CLI substitution is claimed.

## Scope and defaults
All approved surfaces: overview/history/detail; optional generated-front saving and reuse; Uploads backed by existing invited Studio; first-class contacts with multiple events and builder picker; 14-day per-event opt-in initially off; reliable reminder scheduler/outbox with global pause and safe unsubscribe; Settings personal return address; owner-scoped durable drafts and safe handoffs. Preserve immutable paid orders and guest sending. New contact can lack address. Canonical 17:22 fronts, no exact-delivery/preview guarantee.
Keep existing upload entitlement, lifetime and privacy constraints; extend retention only through intentional library saving with clear semantics. Worker should not run old reminders test if it sends a real email. Only fake transports/local synthetic fixtures. Expose operationally unconfigured reminders honestly; build dispatcher and runbook, don't imply live delivery is verified. No card auto-send.

## Likely code areas
app/account/**, components/account/**, components/flow/FlowHeader.tsx, context/AuthContext.tsx, app/api/account/**, lib/account/**, lib/upload/**, lib/draft/**, app/preview/entry/client.tsx, shared NoteInteriorPreview/CardPreview, reminder API and transactional email helpers. Parent owns shared contracts, builder integration, ledger and release evidence; planners recommend exact ownership.

## Success criteria
Concrete read/write user flows, no demo fixtures shipped, auth and owner checks server-side, bounded list reads, optimistic concurrency for edits, durable saves and meaningful failures, view/reuse of existing card snapshots, honest upload gating and history status. Calendar/date and duplicate dispatch safety proven under synthetic time/transport. Responsive UI matches approved mockup, typecheck/build and safe regression suites pass. Record blockers and limitations without claiming unavailable deployment/inbox verification. Complete all unblocked work.

## Questions for drafts
Choose contracts to prevent lane collision and duplication of existing Studio/order/draft infrastructure. Identify which external activation gates remain after a fully implemented local build. Make practical choices within approved defaults; do not reopen the approved product design with a generic interview.
