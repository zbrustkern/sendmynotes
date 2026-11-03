# SPRINT-0026 — Planning notes

Date: November 3, 2026. Deliverable: a lean repository-backed implementation plan and exact email copy; no application implementation or live messaging.

## Seed and authorization

The founder requested admin controls through confirmed orders, scripts using Resend, the recommended thank-you/check-in/repeat-offer templates, unsubscribe where necessary, a discount-code pipeline, and inexpensive order attribution foundations. Keep guest checkout and draw on Klaviyo best practices. Founder reported three Google-driven sales, two with emails.

The default df-sprint-plan model resolver returned main=inherit, Claude=claude-fable-5-1, Codex=gpt-6-astra, Gemini disabled. Claude was absent from PATH; Codex CLI was present. After the required halt, the founder explicitly authorized a direct Codex plan instead. This overrides the competing Claude/Codex draft/critique workflow for this run. No independent review or unrun model is represented as completed. The founder subsequently answered the interview: reviewed enrollment initially, with a switch to auto and lightweight control of content, timing and enabled state; both existing emails are receipt-only / marketing permission unknown.

## Orientation

- Read canonical brief/specifications in the conversation and AGENTS.md; inspected recent sprints 0022, 0024, 0025 and current ledger. No semantic index or chapter configured.
- Local checkout inspected at ae7f77e. Ledger documents later production/account deployments, so execution must orient against the actual current deployment branch before changing code.
- Existing Orders UI, audited PII reveal, promotions engine, auto-apply links, capture/redemption records, Resend and acquisition data provide most foundations.
- Critical gaps: proxy simulations can appear successful; SDK send options are discarded; Resend inbox provider is cast to Handwrytten; receipt totals hard-code $9; legacy mailing date can be synthesized; offer create is not an atomic grant issuer.
- Current official Resend documents support API-based promotional sends with consent, self-managed visible/header unsubscribe, signature verification and a 24-hour provider idempotency window. Klaviyo guidance supports separate transactional/post-purchase flows and coordinated timing/frequency. Sources are linked next to claims in the plan.

## Decisions and scope discipline

Two optional emails and improved existing receipts; reviewed first-purchase enrollment; one $1/60-day/single-use shareable offer; exact copy in a companion file; one CLI and one dispatcher; manual reply recording; no new vendor, account requirement, open pixels, visual campaign builder, referral rewards or membership work. Keep original Google evidence separate from retention association. Unknown permission is an explicit operational hold, not assumed opt-in.

Interview refinement: a small settings panel edits the two fixed optional steps, with draft/preview/publish, future-only automatic enrollment, and per-step timing/enabled controls. Publish pins a version for each enrollment; explicit selected-pending migration is required to change reviewed copy/dates. Operational pauses and live step holds apply immediately at the send boundary. Re-enabling never blasts overdue jobs. An offer cannot silently skip a disabled/failed check-in dependency; mailing-based timing is an explicit alternative. Mandatory footer/offer terms and receipt behavior are protected. This is added planning scope, not authorization to implement or send email.

The bundled ledger helper reads YAML/TSV and reports zero sprints here because this repository uses `docs/sprints/ledger.json`. Do not create a competing ledger or overwrite current entries. Append only SPRINT-0026 to the existing JSON with status planned, preserving every prior record.

## Antigravity tooling observation

The founder separately noted Antigravity CLI should be usable. Neither `agy` nor `antigravity` resolved on this task's PATH. Both `/Applications/Antigravity.app` and `/Applications/Antigravity IDE.app` exist. The IDE includes `/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide`; inspection shows an Electron IDE launcher. This does not establish availability/authentication of the headless `agy -p` planning CLI. No install, PATH change, authentication attempt or Gemini inference was performed. Current planning remains Codex-only as authorized.

## Validation

Documentation changes only. Check local Markdown references, required sections and JSON validity; preserve existing dirty work. Production tests, real emails, live discount creation, supplier calls and deployment are outside this planning turn.

## Interface review — November 3

Founder requested mockups before approval. Created an interactive conversation preview covering confirmed-order follow-ups (eligible, receipt-only and missing-email examples), flow settings, per-step email editing/preview, offer details, checkout opt-in, and unsubscribe form/confirmation. Uses fictional records only and makes no network/provider calls. Visual styling follows the existing warm neutral Orders admin. Preview is stored in the chat-owned visualization directory as `sendmynotes-follow-ups.html`.

Verified JavaScript syntax and rendered the mockup in the browser at desktop and 390px iframe widths. Checked the permission hold disables scheduling, disabling the check-in blocks an offer that depends on it, editing a subject updates the email preview, and no-login unsubscribe transitions to confirmation. These are mock interactions, not implementation tests or live consent changes. UI approval remains pending; no campaign, code issuance or deployment is authorized by viewing the mockup.
