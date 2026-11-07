# SPRINT-0026 — Confirmed-order follow-ups and second-purchase offers

Status: planned · November 3, 2026 · Planning only; no campaign activated.

## Pyramid Index

- L0: Let Zeke review and schedule two Resend follow-ups from confirmed orders, issue one shareable discount, and trace resulting purchases without requiring accounts.
- L1: Reuse Orders and Promotions; separate receipts from optional messages; make delivery and discounts retry-safe; preserve acquisition evidence; start with reviewed enrollment.
- L2: Operator experience; Templates and timing; Eligibility and unsubscribe; Architecture; Discount pipeline; Attribution; Implementation plan; Definition of done.

## Overview

The founder reports three Google-driven sales, two with email addresses, on November 3. This is new founder-reported evidence after the October 11 canonical baseline, not a database audit or a measured retention result. Canonical product claims and personal-sender positioning still govern. Do not edit the historical baseline to imply these sales were known on October 11.

Deliver one small post-purchase flow inside the existing admin Orders workspace, using Resend and the existing offer engine. The purpose is to learn whether the first experience worked and encourage a second paid order or a shared-code purchase. No account, subscription, points system, visual campaign builder, CRM migration, or Klaviyo subscription is required.

User authorized a direct Codex planning workflow after the default skill's Claude CLI preflight failed. No Claude draft, independent cross-review, or Gemini run is claimed. Antigravity availability is a separate tooling observation, not a dependency. See [planning notes](drafts/SPRINT-0026-PLANNING-NOTES.md).

## Repository findings and implementation baseline

Inspected local checkout `ae7f77e`. The working tree contains substantial existing changes; preserve them. The sprint ledger reports newer production/account work, so execution must first identify the actual target branch and compare these seams there. Local findings are not claims about deployed behavior.

| Reuse / inspect | Observed implementation and required change |
| --- | --- |
| `app/admin/orders/page.tsx`, `components/admin/OrdersInvestigationWorkspace.tsx`, `OrderJourneyDrawer.tsx` | Existing scoped orders, masked email, audited PII reveal and order history. Add follow-up controls here, not a parallel admin app. |
| `lib/email/transactional.ts` | Existing immediate receipts. Both receipt functions hard-code `$9.00`; discount-aware receipts must use verified captured totals. Remove unsupported immediate dispatch wording in touched receipt copy. |
| `lib/email/resend.ts` | Existing client/secret integration. Proxy accepts only the payload, dropping a second SDK options argument, and can return simulated success without credentials. Follow-up transport must fail closed and pass idempotency options. Preserve review-only protection. |
| `lib/offer-engine.ts`, `lib/promotions-and-growth-service.ts`, `lib/offer-url.ts` | Offers, quotes, reservations, redemptions, audited mutations, auto-apply URLs already exist. Add a small atomic issuance adapter; current create mutation is read-then-write, not an idempotent create-only grant primitive. |
| `lib/webhook-inbox.ts`, `lib/contracts/admin-overhaul.ts` | Inbox accepts `resend` but persists it as `handwrytten`; contract provider union lacks Resend. Fix without breaking existing provider replay. |
| Handwrytten webhook, order sync, `handwryttenMailedDate` | Some broad statuses map to MAILED and missing dates are filled from processing time. Do not assume every legacy date is independently verified mailing evidence. |
| `components/AttributionTracker.tsx`, checkout routes, `Order.attribution` | Existing acquisition data and consent/GPC signals. Add a separate retention association; never replace original order acquisition with email attribution. |
| `/new` → `app/preview/entry/client.tsx` | This is the mounted builder in this checkout. Verify the target revision; changing only the older v3 payment component would miss this path. |

Recent sprints cover private Upload (0022), optional accounts/reminders (0024), and production readiness (0025). Their account reminder consent is not marketing consent. No semantic index or chapter is configured. Reuse shared reminder primitives only if present and suitable in the target revision; do not make guest follow-ups depend on account work.

## Operator experience and use cases

1. Open **Admin → Orders → a confirmed paid customer order → Follow-up**. Show masked destination, payment evidence, mailing evidence/date, permission state, current stage, due date, offer and related purchases. Full destination uses existing audited reveal behavior.
2. Show a specific eligibility reason: `Ready`, `Waiting for mailing`, `Missing email`, `Permission unknown`, `Unsubscribed`, `Paused for support`, `Already enrolled`, `Purchased again`, or `Excluded test/comp/refund`. A UI status alone never establishes verified payment.
3. **Preview** displays exact subject, HTML/text, recipient, date, footer and offer terms. **Send test to me** uses synthetic content and a test-only discount fixture; never sends to the customer or creates a production redeemable code. Test mode is visibly labeled and excluded from reporting.
4. **Schedule follow-ups** creates one durable enrollment after server-side revalidation and approval of its previewed published flow version. Founder selected reviewed enrollment initially, with a flag to enable automatic enrollment for future eligible first purchases after initial pilot validation. Enrollment mode never silently backfills historical orders, establishes consent, or changes already-approved content.
5. Permit **Pause**, **Cancel**, **Reschedule**, and **Record reply / issue resolved**. Recording a support issue pauses the offer. Replies go to Zeke's verified monitored inbox; manual recording is sufficient in v1. No inbound-email parser is needed.
6. A compact queue/filter within Orders shows upcoming, held, failed/uncertain and completed follow-ups. Optional selection of up to 25 explicit orders shows individual eligibility before scheduling; no blanket enrollment of every visible or historical order.
7. Show offer usage and the resulting paid order in the same drawer. Show refunds separately and distinguish an observed repeat buyer from a different-email redemption or unknown identity.

No admin action sends or retries physical fulfillment. Exclude fulfillment controls and imports from these scripts entirely.

### Small flow-settings panel

Add **Follow-up settings** within Orders. One fixed post-purchase sequence with two optional steps is sufficient; no drag-and-drop canvas, branching rules, arbitrary new steps or custom template language. Configuration is modest additional scope because the dispatcher and templates already need these inputs. The essential extra work is defining what edits do to queued messages.

| Control | Initial setting / behavior |
| --- | --- |
| Enrollment mode | **Review first**; selectable **Automatic for future eligible buyers**. Review first approves a customer's whole displayed sequence, not a fresh approval prompt for every scheduled step. |
| Pause all optional delivery | Separate operational switch; stops queued dispatch as well as new automatic enrollment, while retaining unsubscribe/webhook processing. Turning auto-enrollment off alone does not cancel approved schedules. |
| Step enabled | Independent check-in / offer switches, initially on in the draft configuration. Neither can send until program delivery is activated and recipient eligibility passes. |
| Email content | Editable subject, preview text, greeting/body paragraphs and sign-off; offer button label editable. Allowlisted variable chips and a fixed layout; no arbitrary HTML, script, URL or code editing. |
| Timing | Check-in delay in business days after evidenced mailing (default 10, minimum 10); offer delay in calendar days after accepted check-in (default 7, minimum 7); shared send hour (9 a.m.–5 p.m., default 10 a.m.) in America/Chicago. Bound inputs to 90 days and show concrete sample dates. Delivery-trigger timing remains deferred. |
| Offer without a check-in | Explicit timing choice **After mailing**, default 15 business days, minimum 10. If check-in is disabled while offer still depends on it, block publication until offer is disabled or its anchor is changed. A failed or suppressed check-in never silently switches anchors. |
| Save draft / Preview / Publish | Preview synthetic HTML/text and dates; publish a version after server validation, showing a before/after summary. Record actor and time; reject concurrent stale edits. |

Keep unsubscribe, business address, reason-for-email, required offer terms, actual amount/expiry and destination generation outside editable body text. Missing required offer variables fail validation; the rendered terms and button always use the persisted grant. Receipt copy remains a maintained transactional template in this sprint, outside these optional-flow controls; receipt delivery cannot be disabled or delayed by a marketing setting.

Persist immutable flow versions and a current published pointer. Every enrollment snapshots its version (copy, enabled steps, timing and offer defaults); changes apply to **new enrollments only**. Preview and approval identify that version, preventing an edit between review and scheduling from changing approved content. Existing unsent enrollments can adopt a newer version only through an explicit **Update selected pending follow-ups** preview showing recipient count, exact content and dates. Never alter accepted or uncertain dispatch payloads, promised coupon terms, or create new stage IDs to resend a completed step. Changing reviewed enrollment to auto does not migrate old candidates or enrollments.

Operational pause and live step-disable controls are exceptions to version pinning: they take effect at the final dispatch check even for an older queued version. Disabled steps are held, never treated as sent. Re-enabling does not release a backlog: already-due held jobs require reviewed rescheduling, future jobs resume only if their pinned step was enabled and still eligible. Enabling a step does not add it to an older version that excluded it. Display dependent offer holds clearly. Pause/disable can prevent the next provider call but cannot recall an in-flight email.

## Templates and timing

Exact proposed copy and rendering rules are in [the template pack](SPRINT-0026-EMAIL-TEMPLATES.md). These are implementation-ready copy specifications, not a claim that runnable email templates have been deployed.

| Stage | Trigger / default | Classification and behavior |
| --- | --- | --- |
| Receipt / thank-you | Verified payment capture; existing deferred-address variant when needed | Necessary transaction message, no discount or marketing unsubscribe. Improve existing receipt; do not add another immediate email. Never resend old receipts as campaign backfill. |
| `experience_check_v1` | 10 business days after evidenced domestic mailing, at 10 a.m. America/Chicago | Optional follow-up with unsubscribe and recorded permission. Ask about the recipient's reaction and sending experience; do not assert delivery. |
| `next_card_offer_v1` | Seven calendar days after the check-in was accepted by Resend; explicitly configurable mailing-based alternative above | Marketing, same permission/suppression rules; one $1 offer, one CTA, optional sharing line. Stop if a new paid order or unresolved issue exists. |

Timing is a product hypothesis, not a proven optimum. Business days exclude US federal postal holidays and weekends; use an explicit calendar and injected clock. No sender timezone is inferred from the recipient's address. If trustworthy delivery evidence exists later, a configurable two-day-after-delivery alternative can replace the estimate; actual delivery integration is deferred.

Pending address, supplier acceptance, scheduled future mailing, unknown mailing date and international mail do not start the default clock. For missing/ambiguous legacy evidence or international mail, allow an admin-selected due date with recorded rationale, visibly labeled manual estimate. Preserve timing provenance (`supplier_mailed`, `manual_estimate`) and do not silently upgrade a heuristic to fact. A correction to mailing time recalculates only unsent work and is audited.

One active enrollment per normalized sender email for this first-purchase program; multiple cards/orders do not produce stacked messages. A new verified paid purchase cancels remaining first-purchase messages where the sender can be matched. One optional message per sender per seven days across this flow, with the second step never advanced by retries. Existing chosen occasion reminders remain a separate topic; coordinate cadence if their dispatcher exists, without silently canceling a date-sensitive reminder. Receipts bypass promotional frequency limits.

Due jobs older than 48 hours become **Needs review**, not an automatic backlog blast. A reschedule generates a fresh reviewed date, not a duplicate message identity. For an offer anchored to check-in acceptance, a failed, suppressed or uncertain check-in does not start its clock. A separately published mailing-anchored offer still honors all sender-level suppression and issue holds.

## Eligibility, consent and unsubscribe

Resend explicitly permits promotional use of `/emails` but requires consent and application-managed unsubscribe. Using an API named transactional does not change message classification. [Resend guidance](https://resend.com/pricing)

- Separate `customerEmail` from permission. For this flow, permission is `unknown | subscribed | unsubscribed`, with source, timestamp, exact disclosure version and evidence reference. Existing receipt emails import as unknown. Billing, account creation, analytics consent and occasion-reminder opt-in never establish marketing permission.
- Add an unchecked optional checkbox beside the sender email on the mounted checkout: **“Email me a follow-up about my card and occasional SendMyNotes offers.”** Purchasing remains possible without opting in or creating an account. Persist the exact checkbox state server-side, bind it to the submitted email and order, and never infer consent from an omitted field.
- Record consent at checkout only with the appropriate explicit user action; failed payment does not enroll anyone. Changing the email invalidates the prior address's consent assertion unless reconfirmed. Omitted/unchecked input does not reverse an existing global opt-out or erase an unrelated prior explicit subscription. Re-subscription requires a new explicit, evidenced action.
- Permit admin recording of actual prior consent with dated evidence, not an unrestricted “override consent” switch. For the current two customers, unknown permission means promotional enrollment is held. A requested customer-service reply can still be handled as support; do not disguise the automated series or a permission solicitation as a mandatory order notice.
- Both optional emails include visible unsubscribe, valid business postal address, accurate sender and monitored reply-to. The offer is visibly identified as promotional. Necessary receipts remain separate. This follows the [FTC distinction between commercial and transaction messages](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- `GET /email/unsubscribe?token=…` shows a minimal form; a scanner's GET has no side effect. A button POST unsubscribes without login. The same HTTPS URL accepts RFC 8058 one-click POST from mailbox providers with `List-Unsubscribe=One-Click`, without cookies, login or a confirmation step; authenticate by the opaque unguessable token. Use `List-Unsubscribe` and `List-Unsubscribe-Post` headers. [Resend implementation guidance](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)
- Store only a hash of the unsubscribe token; it is purpose-bound to optional-message suppression and grants no order/account access. Keep it usable for the lifetime of the sent email record, at least the regulatory minimum; expiration must not prevent a reasonable opt-out. Token leaks allow opting out only. Do not reuse order-view or address-completion tokens.
- Unsubscribe immediately persists email-wide marketing suppression and cancels queued optional work; every dispatch rechecks it. Offer redemption remains valid after unsubscribe. Explain that receipts and order updates continue; separately requested occasion reminders have separate preferences. Complaints/permanent bounces/provider suppression block further automated follow-up attempts and require resolution, not automatic re-enrollment.

## Architecture

Use Firestore, existing admin authentication/audit patterns, the Resend SDK, and one bounded scheduler endpoint. Keep scheduling in the application so last-minute unsubscribe, refunds and purchases can cancel work before submission. Do not schedule weeks of uncancellable copies at the email provider.

### Minimal durable records

| Record | Minimum fields / invariant |
| --- | --- |
| `post_purchase_programs` and immutable version records | Published pointer, review/auto enrollment mode, delivery pause and live step holds; validated versioned copy/timing/step configuration. Optimistic revision check for admin edits; server-owned, no arbitrary executable templates. |
| `email_preferences/{senderKey}` | Restricted normalized email; versioned HMAC senderKey; permission/evidence; unsubscribe, bounce/complaint suppression; last optional acceptedAt. Stable across guest sessions. No Gmail-dot or plus-address stripping. HMAC secret rotation must preserve matchability via version/migration. |
| `post_purchase_enrollments/{id}` | Program/version, sourceOrderId, senderKey, source acquisition snapshot reference, enrollment actor/time, mode, mailing basis, stage, issue hold, next dueAt, offer grant ID. Atomic per-sender/program uniqueness. |
| `post_purchase_messages/{id}` | Deterministic enrollment+stage ID; templateVersion; dueAt; lease; state; immutable dispatch payload/hash; attempt timestamps; Resend ID; delivery facts; suppression reason. Draft edits allowed before dispatch; a changed template does not create another stage. |
| Existing offer version plus issuance mapping | Private `grantId → enrollmentId/sourceOrderId/messageId/offerId` association, campaignId, terms, expiry. One grant per enrollment; existing redemption records remain authoritative. |
| Existing webhook inbox and admin audit | Verified provider events, deduplication, actor/reason and state transitions. Minimal payload summaries; never full email bodies, notes or addresses. |

All new records are server-owned and unavailable to browser Firestore reads/writes. Use existing admin authorization, server-derived actor, environment scope and same-origin/CSRF protections for admin mutations. Do not trust operator IDs, eligibility, source-order IDs or consent supplied by clients without authorization and validation.

No client-facing API may return sender keys, private source-order associations or recipient information. Required Firestore indexes cover due-state/time, sender/program, and grant/order lookups; paginate with a stable cursor. Every query and script is bounded and environment-specific.

### Dispatch and webhook reliability

`draft → scheduled → claimed → dispatching → accepted`, with `cancelled`, `held`, `failed`, `uncertain` branches. Delivery outcomes are separate facts (`delivered_to_server`, delayed, bounced, complained, suppressed); later events must not erase complaints or revive cancelled work.

1. Claim a due job with a transaction and expiring lease, then recheck email permission, sender/program lock, live program/step holds, pinned version, source/refund/support status, subsequent paid orders, cadence and environment immediately before dispatch. Eligibility changes committed before this final send boundary cancel or hold the attempt; in-flight provider requests cannot be recalled.
2. Freeze the rendered payload, destination, token, discount terms and stable Resend idempotency key before invoking the provider. Use an injected transport in tests and a strict production adapter using `getResendClient()`. Missing credentials, staging-review mode and mock keys are blocked states, never accepted sends.
3. Resend retains idempotency keys for 24 hours. Retry the exact request with the same key only within that window, using a safety margin. Application records provide durable deduplication beyond it. A timeout/crash after an attempted send is uncertain; an expired lease does not prove it failed. After the provider window, hold for reconciliation instead of issuing a new key. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
4. POST `/api/webhooks/resend` verifies the raw body and Svix headers with the endpoint secret before accepting events. Use provider-namespaced inbox identity and a backwards-compatible lookup for old provider records; fix the current Resend-to-Handwrytten cast. Duplicate, out-of-order and pre-acceptance webhook events must be safe. Attach an opaque message ID tag, and reconcile only to a known dispatch attempt. [Signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
5. Record accepted and delivered-to-recipient-server separately; neither proves inbox placement, reading, or physical-card delivery. Ingest sent/delivered/delayed/failed/bounced/complained/suppressed events. Permanent negative events win over later/older success events. [Resend events](https://resend.com/docs/webhooks/event-types)
6. One dispatch function serves admin send-now, scheduler and CLI. Send-now still enforces timing/permission gates unless a documented manual due-date adjustment was made. Failed local persistence after provider acceptance cannot cause an unguarded resend.

Use an hourly bounded scheduler that processes only due jobs at the configured America/Chicago send hour (default 10 a.m.), with a bounded batch size, and visible last-run/oldest-due/uncertain counts in the Orders queue. A global pause stops new optional sends but leaves unsubscribe/webhooks operational. No general workflow engine, new queue vendor, or separate campaign microservice.

## Discount pipeline

- Proposed v1 terms: **$1 off one card, one redemption total, 60 days, use yourself or share, no account, no stacking**. Confirm actual variable costs before enabling live issuance; unknown contribution stays unknown. Timing and amount remain configurable program defaults, snapshotted per grant.
- Preview uses a clearly non-redeemable placeholder. At the first eligible offer dispatch, atomically create or retrieve one grant and random collision-resistant code (`THANKS-` plus at least 12 cryptographically random characters). Link it privately to the source order/enrollment; never embed customer names or order IDs in the code.
- Create the existing offer version and grant association with create-only/transaction semantics. Preserve audited actor/system attribution. If retry finds the grant, reuse its exact code and terms; a collision with an unrelated offer retries generation rather than overwriting it.
- Set `FIXED_AMOUNT`, value 100 cents, `maxUses: 1`, discount budget 100 cents, `stackingAllowed: false`, `campaignId: post_purchase_v1`, destination `/new`. Fix `startsAt/endsAt` at preparation for the first dispatch (60 calendar days), render that exact expiration in both text and HTML, and freeze it on retries. Do not roll expiry forward on every attempt.
- Check the code is active, unexpired and unused immediately before dispatch. A definitive non-send can pause an unused code; an uncertain send preserves the code until reconciled. Once accepted, do not revoke it for unsubscribe or a later unrelated purchase. A discovered issue pauses future email, not an already-promised offer without explanation.
- Generate `/new?discount=<code>` using the existing destination-link helper, with campaign-level UTMs and an opaque follow-up reference. Auto-apply must work for guests, refresh and manual code entry. Show expiry/exhaustion/invalid-state messages and allow normal purchase without the offer.
- Checkout reservations/verified-payment redemption remain in the existing offer engine. Two simultaneous buyers sharing one code can yield only one redemption; a failed payment releases or expires its reservation. Refunds keep existing no-usage-restoration policy, and reporting shows refunded revenue separately. Manual typed code still resolves the private grant association without browser tracking.

## Attribution worth adding now

Store identity and provenance while they are available; defer speculative analytics.

1. At verified capture, persist a private normalized-email HMAC `senderKey` and schema version for sender matching. Bind to the actual captured order email; later edited receipt destinations must not silently rewrite historical buyer identity. Optional verified account UID can strengthen the match, but no account is required. Missing email yields unknown identity. Matching is for operational/reporting association, not proof of identity or a basis for granting account access.
2. Preserve the source order's acquisition snapshot, including existing Google evidence. Store a separate `retentionAttribution` on later orders: validated campaignId, enrollment/message/grant reference, association method (`redeemed_code` or `observed_link`), observed time and sourceOrderId. The source order's Google acquisition and the later order's own acquisition are immutable historical facts, not rewritten channel labels.
3. Prefer redeemed-code association: it is deterministic for the code and survives forwarding/manual entry/cross-device use. It does not prove that the email caused the purchase. Same observed sender key = **observed repeat buyer**; a different key = **different-email redemption / possible referral**; no email = **buyer identity unknown**. Do not assert a new customer or a friend solely from a different email.
4. For no-code returns, use a random purpose-bound public reference resolving to a message/grant, never an order-view token. Validate it server-side, scope it to this environment/program, reject arbitrary order IDs, and keep it separate from identity. Seven-day last-observed valid follow-up link association; clear expired state and preserve original acquisition fields. A code redemption wins for offer association if it conflicts with a link; retain the link observation separately.
5. Honor existing analytics consent/GPC for optional link persistence and events. Without analytics permission, purchase and discount redemption still work and their operational association remains; omit behavioral tracking. Strip follow-up and unsubscribe tokens from GA/Meta, referrers and application logs. No email, sender key, source order ID, card message, address or customer-specific coupon in third-party analytics/UTMs.
6. At verified payment completion, idempotently attach the association and financial outcome once, whether confirm-order or Stripe webhook runs first. No conversion on click, quote, abandoned checkout, test payment, free order or founder comp. Partial/full refunds update net revenue without erasing the original purchase fact.
7. Admin counts: eligible / permission-unknown / enrolled; accepted; delivered-to-server; replies manually recorded; opt-outs/bounces/complaints; code redemptions; observed repeat/possible referral/unknown; net paid revenue, discounts and known variable costs. Show cohort counts, observation windows and incomplete follow-up time. Report 30/60-day repeat counts only with mature-cohort denominators. Do not call attributed revenue incremental lift or profit.

No open pixels are needed. Do not make purchase attribution depend on Resend click tracking; automated scanners can open links. No A/B tests, referral rewards, predictive lifetime value or Google offline-conversion upload changes in v1.

## Implementation plan

| Package | Work and likely files | Acceptance |
| --- | --- | --- |
| W0 — Target baseline and contracts | Reconcile current production/account branch; `lib/types.ts`, `lib/contracts/admin-overhaul.ts`, new `lib/post-purchase/contracts.ts`; capture permission/sender/mailing data inventory with masked fixtures | Mounted builder and all payment capture paths identified; no old checkout overwrite; unresolved live config listed |
| W1 — Permission and preferences | Mounted `app/preview/entry/client.tsx` and shared email step; checkout payloads; `lib/post-purchase/preferences.ts`; unsubscribe route/page; server-only rules/indexes | Guest can buy without consent; evidence persists; unknown historical emails held; no-login normal and RFC 8058 opt-out cancel pending jobs |
| W2 — Templates, configuration and enrollment | New `lib/email/post-purchase.ts`; fix relevant receipt fields in `transactional.ts`; `lib/post-purchase/config.ts`, `enrollment.ts` and `schedule.ts` | Seed template pack renders in HTML/text; structured copy/variable validation; immutable published versions; correct captured amounts; explicit timing anchors; per-sender dedup; auto-enroll remains off initially |
| W3 — Grant and attribution | `lib/post-purchase/offers.ts`, `attribution.ts`; extend existing offer/audit engine; `AttributionTracker.tsx`, mounted builder, create-intent, confirm-order and Stripe webhook paths | One immutable grant; $1 cap; guest auto-apply/manual redemption; original acquisition preserved; verified paid order associated once |
| W4 — Reliable delivery | `lib/post-purchase/dispatch.ts`, strict Resend adapter; `app/api/cron/post-purchase/route.ts`; Resend webhook and inbox contract fix | Fake-provider failure/retry tests; idempotency window and crash recovery; verified webhook suppression; disabled configuration fails truthfully |
| W5 — Admin and scripts | `components/admin/OrderFollowupPanel.tsx`, `PostPurchaseSettingsPanel.tsx`; Orders workspace/drawer integration; `app/api/admin/post-purchase/route.ts`; `scripts/post-purchase.ts` | Masked queue, real preview, synthetic test, schedule/pause/reschedule/reply; draft/preview/publish content and timing; per-step controls; reviewed/auto mode; audited actions; CLI and admin share services |
| W6 — Acceptance and pilot | Tests, runbook, synthetic browser/email previews; configured test inbox after authorization; reviewed enrollment of eligible existing orders | All functional gates below pass; readiness is distinct from activation; no old backlog sends |

### Script interface to implement

One TypeScript CLI, no bespoke one-off sending scripts:

```text
post-purchase preview --order <id> --stage check-in|offer --environment <env>
post-purchase candidates --environment <env> --limit 25
post-purchase enroll --order <id> --environment <env> [--apply]
post-purchase dispatch --environment <env> --limit 25 [--apply]
post-purchase reconcile --message <id> --environment <env>
```

Default preview/dry-run; mutations require `--apply`, an authenticated authorized operator/service identity, explicit environment and the same eligibility checks as admin. No arbitrary `--to` override on a real job. Test delivery uses a separately configured allowlisted operator inbox and synthetic record. Reconcile is read-only unless an explicit audited resolution is submitted; never “mark sent” on a guess. Dry-run calls no email/Stripe/supplier endpoints and creates no active codes. Return bounded redacted JSON and meaningful failure exit codes.

## Definition of done

- Synthetic guest order → explicit consent → evidenced mailing → reviewed enrollment → due check-in → offer → second verified payment is exercised end to end, including admin UI. No account is required at any point.
- Unknown permission, missing email, unsubscribed, bounced/complained, foreign environment, unverified payment, free/comp/founder order, refunded order, address pending, unknown mailing and support-hold cases show accurate reasons and never send. Partial refunds enter review rather than silently continuing.
- Multiple cards/orders/email case variants, concurrent workers/admin clicks, reordered webhooks, duplicate Stripe confirmation, missed schedules, provider timeout and >24-hour retry cannot produce duplicate messages or discount grants.
- Settings tests cover invalid variables/HTML/timing, stale concurrent publication, preview-to-enrollment version races, review-to-auto future-only cutoff, per-step dependency validation, immutable queued copy, explicit pending-version migration, pause/disable during dispatch, re-enable without backlog, and completed/uncertain messages never recreated. Marketing settings cannot disable necessary receipts or bypass consent.
- GET scanners cannot unsubscribe, consume a code, create an enrollment or claim a human click. Header one-click POST and visible-button POST work without login; invalid tokens do not expose email. Opt-out before dispatch wins; in-flight boundary is documented.
- Coupon final-slot race, reservation expiry, failed payment, refund, expired/exhausted code, manual entry, forwarded link and no-email buyer work with truthful attribution. Retries never alter existing offer terms or reset redemption usage.
- Safe rendering escapes injected names/content, handles no name and multiple cards, contains no private card/recipient data in follow-ups, and includes working text/HTML links and accessible mobile layout. Receipt amount comes from verified financial facts. Test synthetic HTML at narrow/desktop widths and inspect actual controlled-inbox rendering before activation.
- Admin authentication/CSRF/environment scope, server-only Firestore rules, raw-body webhook signatures/replay, redacted logs and query-string scrubbing pass focused tests. Existing order proof/PII controls remain intact.
- Run appropriate email, offer-engine, payment/financial truth, admin and attribution regression suites with fake transport, plus typecheck and build on the final revision. Audit test entrypoints before execution; never run a fulfillment script as a check.
- Runbook records verified sender/domain SPF/DKIM/DMARC, monitored reply-to, valid footer address, secrets, scheduler identity, indexes, pause/resume and uncertainty resolution. None of these live facts is assumed from code alone.
- Rollback disables new enrollment/dispatch while leaving unsubscribe, suppression and webhook processing alive; preserve offers already promised and durable send/redemption history.

## Dependencies, risks and open decisions

Founder-confirmed decisions (November 3): review initially, with a later switch to automatic enrollment; include lightweight per-step content, timing and enabled controls. The two existing customers' emails were receipt-only / marketing permission unknown, so they remain held from optional enrollment. No additional interview is needed to plan these choices. Proposed remaining defaults: $1 / one use / 60 days; two optional follow-ups; US domestic evidenced mailing clock.

Before live activation resolve: recorded affirmative permission for any intended optional-email recipients (the two historical addresses currently lack this); verified mailing evidence and destinations; real contribution after $1 discount; working reply mailbox; business postal address; exact deployed baseline and runtime Resend/domain settings. The founder need not settle these to review or implement the code with synthetic tests.

Primary risks are emailing without permission, confusing estimated mailing with delivery, duplicating sends after ambiguous provider responses, reissuing coupons, and overwriting acquisition data. The contracts above address those directly. Scheduling and offer issuance are lean, but their durable state and suppression checks are essential, not optional polish.

This document authorizes no customer message, live discount, physical order, deployment or automation activation. The requested deliverable is a plan. Implementation and an initial reviewed live batch can be approved from this concrete scope.

## Best practices adopted

Keep transactional receipts separate; distinguish first-time and repeat customers; time messages around fulfillment; coordinate frequency; make one next step clear; stop the first-purchase sequence when someone buys again. These are adapted from [Klaviyo's post-purchase guidance](https://help.klaviyo.com/hc/en-us/articles/360028872611). Exact delays, $1 value and pilot mode are SendMyNotes proposals, not Klaviyo benchmark claims. The immediate goal is useful feedback and a profitable second purchase; membership and broader automation remain later decisions.
