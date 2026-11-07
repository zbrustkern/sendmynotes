# SPRINT-0028 planning notes

## Method and authorization

User request: integrate attached review feedback, then write a sprint plan. The df-sprint-plan preflight found Codex CLI available and `claude` absent from PATH. The required CLI workflow was halted. The user then explicitly selected **“Write the sprint plan directly.”** This overrides the skill's dual-lane draft/critique/interview workflow for this run. No independent reviewer, Claude/Astra draft, Gemini run, supplier test, product implementation or deployment is claimed.

The orchestration checklist for the authorized direct workflow is: read feedback and source; update prototype/spec; render and exercise feedback scenarios; inspect recent sprint and ledger context; write the sprint; reconcile ledger; verify artifact links and recorded scope.

## Orientation

Inspected local HEAD: `2acfd47cdfa0581b46a802236fc1a2a5b77a2425`. This identifies the local source review, not the release target or deployed production.

- Existing active path: `ExperienceRouter` mounts `EntryPrototypeClient`, which uses v3 Address/Pay components. Legacy parallel paths are not the target by default. The canonical brief/specs remain authoritative.
- Source verifies singular draft recipient, separate note fields, one flat-rate checkout, combined supplier preparation/dispatch, financial facts, and an outbox with reusable transactional enqueue/leases but unbounded candidate scanning and generic expired-lease retries.
- The singular admin retry route mutates addresses before its gate; status sync heuristics can infer mailing/date too broadly. Batch routes must be explicit and fail closed before mutation/provider work.
- Recent 0025: production/account integration, owned artwork and worker/privacy reliability. 0026: planned optional follow-ups/one-card offers; receipt vs marketing boundaries and parent purchase identity matter here. 0027: active holiday catalog work, with dirty catalog files in the shared checkout; preserve it.
- `docs/SEMANTIC-INDEX.md` says Not configured. No chapter ledger is present. Planning used bounded repository reads, no external token cache or chapter link.
- Ledger reality: this repo uses `docs/sprints/ledger.json`. The installed helper defaults to YAML/TSV and reported zero sprints; that is a format mismatch, not an empty project. Preserve the JSON convention and append only SPRINT-0028 after checking the current contents. Do not create a competing YAML ledger or normalize unrelated statuses.

## Feedback disposition

| Item | Integrated resolution | Local prototype evidence |
| --- | --- | --- |
| Column swap / right sub-grid | Same 5/7 workbench; baseline two inner columns; multi recipient list spans right with sender below | Before/after bounding-box x/width check and screenshots |
| Flattened note | Separate greeting, message and sign-off; visible greeting callout; compose only for preview/snapshot | Greeting-only edit keeps body/sign-off unchanged |
| Different controls | US_STATES copied from current component for mockup; select, apartment disclosure, City then State/ZIP | Native select assertion; toggle/edited unit flow |
| Same household | Exact duplicate blocked; different name/same address requires separate-card confirmation | Count unchanged before acknowledgment, increment after; cancel retains text |
| Deferred entry | Prompt first; Keep one retains deferred state; acceptance completes first recipient before second | Missing-address fixture tested through both branches |
| Rejected vs uncertain | Separate review scenes and enums/copy/actions | Rejected shows support; uncertain says checking and has no retry/support-correction action |
| Mobile footer | One fixed action bar, committed totals, unsaved-editor focus/error | 390 px focus remains above bar; correct subsequent payment amount |

## Verification and limits

`docs/proposals/2026-11-06-multi-send/check-mockups.cjs` blocks all HTTP requests, renders 8 scenes at 4 widths, and exercises 9 local interaction groups. Results live in `assets/review-checks.json`. Images were inspected for baseline, multi-address, conflict and mobile editor layout. These are design-artifact checks, not implementation, integration, deployment, financial, physical-card or wallet evidence.

The current-screen PDF remains private; examples are fictional. The source baseline has additional address-book, international and account controls not fully simulated by the drawing. The final plan expressly preserves them in the actual product.

## Decisions and synthesis

The founder's minimal-impact requirement takes precedence over prototype simplifications. Keep the original single-send render branch. Add a distinct multi-send parent/child contract and dedicated worker handlers while retaining existing singleton contracts. Reuse outbox infrastructure but do not rely on a lease as provider deduplication. Keep payment verification, immutable snapshot, per-child uncertainty and refund safeguards in the critical path; they are not later polish.

Use the design's proposed cap/pricing/offer scope as explicit implementation defaults, with commercial and supplier confirmation required before live enablement. Avoid another interview about already-settled minimal UI scope. A feature flag allows implementation to proceed without falsely treating unresolved release facts as verified.

No app source files are intentionally modified by this planning task. The only product-like code changed is the standalone HTML design prototype and its review harness. SPRINT-0028 remains planned / not started.

## Approved greeting integration — November 6, 2026

The founder approved the personal-greeting mockups and explicitly requested their integration into this sprint. Continue the previously authorized direct planning workflow; no new CLI fan-out or independent review is claimed. Recipient-specific opening greetings are now required scope, not a proposed follow-on. Cover, body, sign-off, handwriting and sender remain shared; the single-card baseline remains unchanged.

Integrated explicit inherit/custom/blank state and migration in W1; inline editor and synchronized recipient preview in W2; every greeting visible at payment, complete-note validation and same-price revision invalidation in W3; immutable child messages and retry-safe text identity in W4/W5; G1–G5 evidence in W6 and the definition of done. Updated the main design, greeting detail and ledger to remove the superseded shared-greeting-only scope. A staged base-only release does not complete this sprint or permit discarding persisted custom greetings.

Existing greeting mockup evidence: 12 responsive scenes at four widths and 11 interaction behaviors in `assets/greeting-checks.json`. These results predate this documentation integration and remain local prototype evidence only. Draft persistence, lossless single-recipient collapse/Undo, server validation, intent races and provider payload identity must be verified by implementation tests; none is claimed from mockups.
