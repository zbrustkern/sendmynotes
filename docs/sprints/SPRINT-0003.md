# SPRINT-0003: Instrument observed customer journeys and payment diagnostics

Status: planned. No implementation or production verification performed.

## Pyramid Index

- Outcome and boundaries: Objective and Scope.
- Execution: Ordered tasks, dependencies and ownership.
- Completion: Acceptance criteria, Validation and Evidence.
- Recovery: Risks and rollback.
- Program context: [orchestrator handoff](ADMIN_OVERHAUL_ORCHESTRATOR_HANDOFF.md); [ledger](ledger.json).

## Objective

Capture explicit customer intent, validated milestones and failure context across active routes without collecting personal message/address content.

## Scope and non-goals

Typed event v2, durable event acceptance, browser instrumentation, session/journey identity, safe transport and diagnostics. No customer funnel redesign.

All program preservation, safety, privacy, no-deployment and source-authority rules in the handoff apply. Discount capabilities must be preserved and strengthened; no unsupported business or supplier claim is introduced.

## Source context and entry gate

Depends on: SPRINT-0001. Read the canonical brief/specs and full overhaul spec listed in the handoff. Recheck source revision, actual consumers, ledger and evidence before work. Dependencies must be accepted, not merely merged.

Likely entry points (revalidate): lib/telemetry.ts; lib/telemetry-schema.ts; app/api/telemetry/route.ts; components/AttributionTracker.tsx; active builder and note/address/payment steps; draft modules.

## Ownership and coordination

Telemetry lane owns client emitters and collector. Financial authority comes only from 0002 contracts. Coordinate active builder/checkout edits with the offer lane rather than sharing those files concurrently.

## Ordered tasks

### SPRINT-0003-T01: Envelope and collector

After: none.

Implement runtime-validated allowlisted schemas, stable retry event IDs, trusted server environment/received time, build/experience context, durable dedupe and redacted rejection metrics. Sanitize before optional third-party forwarding as well as first-party storage. Honor applicable consent/privacy choices and GPC handling; a stored consent field alone is not enforcement. Do not widen tracking or export permissions.

### SPRINT-0003-T02: Visit and journey identity

After: T01.

Implement versioned inactivity sessions and resumable journey/draft correlation; classify founder/staff/synthetic/bot/unresolved separately from mode. Handle unavailable storage without breaking purchase; do not fingerprint or join by IP.

### SPRINT-0003-T03: Observed milestone emission

After: T02.

Instrument automatic cover/template load separately from deliberate engagement, selection and valid note confirmation. Preserve valid confirmed unedited notes. Capture sender/recipient validation categories and completed vs deferred address paths without raw values.

### SPRINT-0003-T04: Full payment and offer diagnostics

After: T03.

Emit checkout requested/created, payment UI ready/load failure, attempt/action required/failure/cancel/confirmation observed and wallet availability/selection. Wire offer exposure/application hooks to the shared offer contract. Link operation and request IDs; never emit authority from browser.

### SPRINT-0003-T05: Route coverage and transport resilience

After: T04.

Inventory every supported entry/alias and resume path, including in-app browser transitions. Exercise missing/duplicate/delayed events, storage denial and rate limits. Display capture coverage and safe failure counters, not silent zero-success states.

## Acceptance criteria

- SPRINT-0003-AC01: Opening a step, automatic cover selection and template load cannot imply note confirmation or address completion.
- SPRINT-0003-AC02: All active supported entries use one versioned contract; payment failures can be distinguished from form never loading, user cancel and server verification delay.
- SPRINT-0003-AC03: No note, address, email, bearer token, raw field value or unsafe URL is emitted to analytics/logs/optional forwarding; schema rejects prohibited payloads.
- SPRINT-0003-AC04: Retry identity is stable, duplicate acceptance is harmless, storage/transport failure never blocks sending, and session/journey correlation limitations are visible.

## Validation and evidence

Mock-browser and collector tests plus isolated entry-to-payment walkthroughs for normal, deferred and resumed journeys; safe fixture inspection for metadata/URL hygiene. Mark real Safari/Meta/wallet checks not run if unavailable.

Write `docs/sprints/evidence/SPRINT-0003/REPORT.md` with task/AC status, exact checks/results, integration revision, evidence paths, review outcome, migration/rollback notes, unresolved external checks and next action. Record not run distinctly from passed. Use synthetic/redacted evidence only.

The coordinator changes the ledger to active at start; complete only after acceptance evidence and reviewer verification. Record implementation completion separately from blocked external release gates.

## Risks, unresolved decisions and rollback

Old identifiers remain in stored history and active builders can be renamed by cleanup work. Preserve historical meaning and instrument active imports, not filenames that merely look current.

Version events and shadow consumers. Feature-disable v2 emission without deleting evidence; legacy aliases remain observational only and can never regain payment authority.

## Participants and review provenance

Plan prepared and locally reviewed in Codex. No Antigravity or independent reviewer has run. Execution owner/reviewer are assigned by the receiving orchestrator; actual review results must be recorded in the sprint evidence report.
