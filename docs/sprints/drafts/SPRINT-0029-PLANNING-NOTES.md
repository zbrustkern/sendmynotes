# SPRINT-0029 Planning Notes

## Method and Authorization

User request (November 12, 2026): analyze the spacing of the `"Dear…"` greeting and sign-off lines so multi-send cards look deeply personal rather than machine-driven, identify any implementation or design gaps, determine whether greeting-to-body spacing is appropriate, and craft a sprint plan for Hydrogen agents to execute.

Preflight check confirmed `claude` and `codex` CLIs are not on `PATH` in this environment. Following the established direct-planning convention from `SPRINT-0027` and `SPRINT-0028`, this is a repository-backed single-author sprint plan structured for multi-agent Hydrogen execution. No external model fan-out, supplier API call, or deployment is claimed.

## Orientation & Inspected Source (`d656f3f`)

- **Governing documents:** [`docs/CANONICAL_PROJECT_BRIEF.md`](../../CANONICAL_PROJECT_BRIEF.md), [`docs/CANONICAL_PRODUCT_SPECS.md`](../../CANONICAL_PRODUCT_SPECS.md), [`docs/proposals/2026-11-06-multi-send/DESIGN_SPEC.md`](../../proposals/2026-11-06-multi-send/DESIGN_SPEC.md), [`docs/proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md`](../../proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md), and [`docs/sprints/SPRINT-0028.md`](../SPRINT-0028.md).
- **Semantic Index:** [`docs/SEMANTIC-INDEX.md`](../../SEMANTIC-INDEX.md) is `Not configured`. No chapter ledger is configured.
- **Current multi-send baseline:** `SPRINT-0028` is deployed and verified in guarded staging (`23b49c7` / `d656f3f`).

## Spacing Determination & Gap Analysis

1. **Greeting-to-body spacing (`\n\n` — one blank line): Appropriate when trimmed.**
   - On Handwrytten's pen plotters and in [`NoteInteriorPreview.tsx`](../../../components/NoteInteriorPreview.tsx), a single newline (`\n`) places the first body line immediately underneath `"Dear Maya,"` at the same vertical line pitch (`lineHeight: 1.55`) as wrapped body text, causing descenders (`y`, `g`, `,`) in the greeting to crowd ascenders in the first sentence.
   - Two blank lines (`\n\n\n`) push the body too low on the 4.25 × 5.5 in portrait leaf.
   - **One blank line (`\n\n`)** after a single-line trimmed greeting is the right stationery proportion.
2. **Implementation Gap 1 — Untrimmed segments & `<textarea>` greeting override:**
   - [`composeRecipientMessage`](../../../lib/multi-send/contracts.ts) currently runs `[greeting, note.text, note.signOff || ""].filter(Boolean).join("\n\n")` without `.trim()` on each part.
   - [`MultiSendAddressEditor.tsx`](../../../components/v3/MultiSendAddressEditor.tsx) renders the per-recipient greeting override as a `<textarea rows={2}>`. Pressing `Enter` at the end of a custom greeting or leaving trailing newlines in `note.text` creates `\n\n\n` or `\n\n\n\n` (2–3 blank lines), which [`submitPreparedHandwryttenOrder`](../../../lib/handwrytten.ts) sends verbatim (`exactMessage: true`).
   - Whitespace-only greetings (`"   "`) pass `.filter(Boolean)` and prepend two blank lines to the top of the card instead of omitting the greeting.
3. **Implementation Gap 2 — Single-line Sign-Off (`"Warmly, Ezekiel"` vs. two-line valediction + signature):**
   - [`Step2NoteComposition.tsx`](../../../components/v3/Step2NoteComposition.tsx) uses a single-line `<input type="text">` for `signOff` (`placeholder="e.g. Warmly, Ezekiel"`), preventing a traditional two-line handwritten closing (`"Warmly,\nEzekiel"` where the valediction sits above the signature separated by `\n`, while separated from the body by `\n\n`).
4. **Design & UX Gap 3 — Carryover single-name greeting trap in Multi-Send:**
   - In Step 2, senders are prompted with `placeholder="e.g. Dear Sarah,"` and helper text *"We'll automatically pre-fill this name into the recipient address step."*
   - When opting into multi-send on Step 3 and adding Recipient 2 (`"Uncle Bob"`), Recipient 2 defaults to `greeting: { mode: "inherit" }` and silently inherits `"Dear Sarah,"`.
   - Furthermore, when returning to Step 2 with `isMultiSend: true`, [`Step2NoteComposition.tsx`](../../../components/v3/Step2NoteComposition.tsx) changes the label to `"Default greeting"` but still renders the single-card helper text instead of explaining inheritance as required by [`PERSONAL_GREETINGS.md`](../../proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md).
5. **Implementation & UX Gap 4 — Step 4 ("Review & Pay") preview behavior & visual cadence:**
   - In [`app/preview/entry/client.tsx`](../../../app/preview/entry/client.tsx), `onPreviewMultiRecipient` navigates back to Step 3 (`setStep("address")`) instead of previewing that recipient's card on Step 4 (`initialView="rightPage"`).
   - In [`Step4ReviewAndPayment.tsx`](../../../components/v3/Step4ReviewAndPayment.tsx), the desktop Order Review summary card hardcodes `{salutation}` (ignoring `selectedMultiRecipient?.greeting`) and styles greeting/sign-off as bold blue headers (`font-semibold mb-1`) with gray `11px` body text instead of uniform ballpoint ink with truthful paragraph spacing.
