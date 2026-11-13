# SPRINT-0029 Verification Report

**Date:** November 12, 2026  
**Sprint:** [SPRINT-0029 — Personal stationery cadence, greeting guardrails and multi-send preview parity](../../SPRINT-0029.md)  
**Baseline Commit:** `d656f3f` (`codex/multi-send-staging-20261109`)

---

## 1. Execution Summary (Three Hydrogen Lanes)

- **Lane A (Composition, Spacing & Two-Line Sign-Off Contract):**
  - Implemented `normalizeGreetingText`, `normalizeBodyText`, `normalizeSignOffText`, and `formatTwoLineSignOff` in [`lib/multi-send/contracts.ts`](../../../lib/multi-send/contracts.ts).
  - Updated `resolveGreeting`, `composeRecipientMessage`, [`lib/note-preview.ts`](../../../lib/note-preview.ts) (`resolveStep2PreviewMessage`, `resolvePreviewMessage`), [`lib/handwrytten.ts`](../../../lib/handwrytten.ts) (`buildSingleStepOrderPayload`), and [`app/api/checkout/create-intent/route.ts`](../../../app/api/checkout/create-intent/route.ts) so previews, character counts, frozen checkout snapshots, and supplier payloads share the exact same trimmed spacing contract (`\n\n` between greeting, body, and sign-off; single `\n` between valediction and signature in two-line sign-offs; zero leading blank lines when greeting is omitted or whitespace-only).
  - Created [`lib/multi-send/greeting-guard.ts`](../../../lib/multi-send/greeting-guard.ts) (`findInheritedGreetingNameMismatches`, `extractGreetingTargetName`) to detect when Recipient 2+ inherits a greeting containing Recipient 1's specific name without silently rewriting the sender's words or splitting recipient names.
  - Updated `extractSenderName` in [`components/v3/TargetPurchaseExperience.tsx`](../../../components/v3/TargetPurchaseExperience.tsx) to extract the sender's name cleanly from both two-line (`"Warmly,\nEzekiel"`) and single-line (`"Warmly, Ezekiel"`) sign-offs.
- **Lane B (Step 2 & Step 3 Greeting Guardrails and Sign-Off UI):**
  - Updated [`components/v3/Step2NoteComposition.tsx`](../../../components/v3/Step2NoteComposition.tsx):
    - In multi-send mode (`isMultiSend === true`), updated the **Default greeting** placeholder to `"e.g. Dear friends,"` and helper text to *"Used for recipients without a personalized greeting. Personalized greetings stay unchanged."*
    - Upgraded the Sign-Off field to a compact 2-line `<textarea rows={2} data-testid="note-signoff-input">` (`placeholder="e.g. Warmly,\nEzekiel"`), capping internal newlines at 1 and auto-formatting standard single-line valedictions (`"Warmly, Ezekiel"` → `"Warmly,\nEzekiel"`) on blur via `formatTwoLineSignOff`.
  - Updated [`components/v3/MultiSendAddressEditor.tsx`](../../../components/v3/MultiSendAddressEditor.tsx):
    - Replaced the per-recipient greeting override `<textarea>` with a single-line `<input type="text">` and normalized on save via `normalizeGreetingText`.
    - Integrated `findInheritedGreetingNameMismatches` to display an inline amber callout (`data-testid="multi-send-greeting-mismatch-{index}"`) on Recipient 2+ when an inherited greeting matches Recipient 1's name, with 1-tap **Personalize greeting** and **Keep “{defaultGreeting}”** actions.
  - Updated [`app/preview/entry/client.tsx`](../../../app/preview/entry/client.tsx):
    - Added pre-checkout validation in `handleAddressSubmit` blocking transition to Step 4 if any recipient has an unacknowledged inherited greeting matching Recipient 1's name, scrolling to the affected row with a clear alert message.
    - Updated `onPreviewMultiRecipient` on `Step4ReviewAndPayment` so clicking **Preview this card** stays on Step 4 instead of navigating back to Step 3.
- **Lane C (Step 4 Review & Pay Preview Parity & Verification Suite):**
  - Updated [`components/v3/Step4ReviewAndPayment.tsx`](../../../components/v3/Step4ReviewAndPayment.tsx):
    - Clicking **Preview this card** (`data-testid="step4-preview-recipient-{index}"`) selects that recipient and immediately opens the `CardPreview` sheet on Step 4 to `initialView="rightPage"` (Inside Note).
    - Updated the desktop left-column Order Review summary card note preview box to show `Previewing card for {selectedMultiRecipient.name}` (`data-testid="step4-active-recipient-preview-label"`) and render the active recipient's resolved note (`combinedPreviewMessage`) in uniform `#1B3B6F` ballpoint pen-ink styling (`whitespace-pre-wrap`, `data-testid="step4-note-preview-text"`).

---

## 2. Acceptance Matrix Verification Results

| Gate | Status | Evidence |
| --- | --- | --- |
| **C1 — Greeting-to-body spacing** | PASS | Verified in `tests/multi-send-contracts.test.ts`: non-empty greeting is separated from body by `\n\n`; trailing newlines/spaces in greeting or body never produce `\n\n\n`; whitespace-only greeting (`"   \n  "`) produces zero leading newlines. |
| **C2 — Two-line sign-off cadence** | PASS | Verified in `tests/multi-send-contracts.test.ts` and `tests/multi-send-presentation.test.ts`: body is separated from sign-off by `\n\n`, valediction and signature (`"Warmly,\nEzekiel"`) are separated by a single `\n`, and `extractSenderName("Warmly,\nEzekiel")` returns `"Ezekiel"`. |
| **C3 — Single-line greeting override** | PASS | Verified in `components/v3/MultiSendAddressEditor.tsx` and `tests/multi-send-presentation.test.ts`: inline greeting editor uses `<input type="text">`, strips `\r\n`, and normalizes via `normalizeGreetingText`. |
| **C4 — Single-name carryover guard** | PASS | Verified in `tests/multi-send-contracts.test.ts` and `tests/multi-send-presentation.test.ts`: `"Dear Sarah,"` on Recipient 1 (`Sarah Lee`) flags Recipient 2 (`Uncle Bob`, `mode: "inherit"`) with `multi-send-greeting-mismatch-1` and blocks checkout until personalized or kept; generic greetings (`"Dear friends,"`, `"Happy Holidays,"`) and matching first names do not warn. |
| **C5 — Step 2 multi-send copy** | PASS | Verified in `tests/multi-send-presentation.test.ts`: `Step2NoteComposition` with `isMultiSend={true}` renders `Default greeting`, `placeholder="e.g. Dear friends,"`, and *"Used for recipients without a personalized greeting. Personalized greetings stay unchanged."* |
| **C6 — Step 4 preview parity** | PASS | Verified in `tests/multi-send-presentation.test.ts` and `components/v3/Step4ReviewAndPayment.tsx`: **Preview this card** stays on Step 4, opens `CardPreview` to `initialView="rightPage"`, and the desktop summary box renders `Previewing card for Uncle Bob` with `"Dear Uncle Bob,\n\nThinking of you this season.\n\nWarmly,\nEzekiel"` in `#1B3B6F` ink. |
| **R1 — Baseline & safety regression** | PASS | `npx tsc --noEmit`, `npm run build` (125/125 routes), `tests/multi-send-contracts.test.ts`, `tests/multi-send-presentation.test.ts`, `tests/handwrytten-batch-transport.test.ts`, `tests/multi-send-checkout-route.test.ts`, `tests/multi-send-payment-pipeline.test.ts`, `tests/multi-send-fulfillment.test.ts`, `tests/multi-send-staging-safety.test.ts`, and `tests/target-experience.test.ts` (50/50) all passed with zero external network calls. |
