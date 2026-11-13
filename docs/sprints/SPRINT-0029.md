# SPRINT-0029 — Personal stationery cadence, greeting guardrails and multi-send preview parity

Status: implemented (local verification passed; ready for staging push) · November 12, 2026 · Local implementation & verification complete; no production activation or live supplier calls.

Governing sources: [Canonical project brief](../CANONICAL_PROJECT_BRIEF.md), [canonical product specifications](../CANONICAL_PRODUCT_SPECS.md), [multi-send design spec](../proposals/2026-11-06-multi-send/DESIGN_SPEC.md), [personal greetings spec](../proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md), [Sprint 0028](SPRINT-0028.md), and [planning notes](drafts/SPRINT-0029-PLANNING-NOTES.md).

---

## Pyramid Index

- **L0:** Ensure every single-send and multi-send card has natural handwritten letter spacing, two-line sign-off cadence, guardrails against accidentally sending Recipient 1's `"Dear [Name],"` to other recipients, and truthful per-recipient previews on Review & Pay.
- **L1:**
  - Normalize greeting (single-line, trimmed), body (trimmed, bounded paragraph breaks), and sign-off (supporting two-line valediction + signature `\n` cadence) in one shared composition contract across preview, validation, checkout snapshot, and Handwrytten payload.
  - Prevent accidental `"Dear Sarah,"` carryover to Recipient 2+ via inline mismatch detection and explicit personalize/keep actions, without silently rewriting the sender's words or auto-splitting address names.
  - Fix Step 2 multi-send helper copy and keep Step 4's **Preview this card** and desktop summary card on Step 4 with exact per-recipient greeting and inside-note rendering.
- **L2:** [Spacing & stationery cadence specification](#1-spacing-and-stationery-cadence-specification), [architecture & contracts](#2-architecture-and-contracts), [Hydrogen agent work packages](#3-hydrogen-agent-work-packages), [files summary](#4-files-summary), [acceptance matrix](#5-acceptance-matrix), [definition of done](#6-definition-of-done).

---

## 1. Spacing and Stationery Cadence Specification

To make every card look written by a thoughtful human rather than assembled by a mail-merge script, all previews, validations, frozen checkout snapshots, and supplier payloads must enforce one canonical letter structure:

```text
Dear Maya,
                                <-- 1 blank line (\n\n) between greeting and body
Thinking of you this season and hoping the new year brings warmth and peace to your home.
                                <-- 1 blank line (\n\n) between body and sign-off
Warmly,
Ezekiel                         <-- 0 blank lines (\n) between valediction and signature name
```

### Why this spacing is required

1. **Greeting → Body (`\n\n` — exactly 1 blank line):**
   - A single newline (`\n`) places the first body line at the same `1.55` vertical line pitch as wrapped body text, causing descenders (`y`, `g`, `,`) in `"Dear Maya,"` to collide visually with ascenders in the opening sentence.
   - Two or more blank lines (`\n\n\n+`) push the message body too far down the 4.25 × 5.5 in (`dimension_id: 4`) portrait leaf.
   - Trimming the greeting and collapsing any accidental line breaks within the greeting guarantees **exactly one blank line (`\n\n`)** between a non-empty greeting and the body, and **zero leading blank lines** when the greeting is intentionally omitted or whitespace-only.
2. **Body → Sign-Off (`\n\n` — 1 blank line) and Within Sign-Off (`\n` — consecutive line):**
   - Separating the body from the closing with one blank line (`\n\n`) while placing the sender's signature on the line immediately beneath the valediction (`"Warmly,\nEzekiel"`) reproduces authentic handwritten stationery cadence instead of a flat single-line web-form footer (`"Warmly, Ezekiel"`).

---

## 2. Architecture and Contracts

### 2.1 Shared Note Normalization & Composition Contract (`lib/multi-send/contracts.ts` & `lib/note-preview.ts`)

Define pure, deterministic helpers shared by Step 2, Step 3, Step 4, `/api/checkout/create-intent`, and `lib/handwrytten.ts`:

- `normalizeGreetingText(raw?: string | null): string`
  - Converts `\r\n` / `\r` / `\n` and consecutive whitespace into a single space, then `.trim()`s.
  - A whitespace-only string (`"   "`) normalizes to `""` (explicitly no greeting).
- `normalizeBodyText(raw?: string | null): string`
  - Normalizes `\r\n` / `\r` → `\n`, strips trailing whitespace on each line, collapses 3+ consecutive newlines (`\n{3,}`) to at most one blank line (`\n\n`), and `.trim()`s leading/trailing blank lines.
- `normalizeSignOffText(raw?: string | null): string`
  - Normalizes `\r\n` / `\r` → `\n`, trims each line, removes empty lines (`.split("\n").map(l => l.trim()).filter(Boolean)`), and joins with a single newline (`\n`)—allowing at most 2 lines (valediction line + signature line; if >2 lines are pasted, join remaining lines on line 2).
  - If the input is a single line beginning with a standard closing valediction followed by a comma and a name—matching `/^(warmly|with all our love|with love|lots of love|love always|much love|love|sincerely|warmest wishes|warm wishes|best wishes|best regards|kind regards|regards|all the best|best|cheers|yours truly|yours|affectionately|fondly|gratefully|with gratitude),\s+(.+)$/i`—and the remainder does not contain a comma-separated list of 3+ words that looks like a sentence, provide a clean helper or auto-format on blur/composition into `"$1,\n$2"` while preserving the sender's ability to edit the two lines directly in the 2-line Sign-Off control.
- `composeRecipientMessage(note, choice)` and `resolveStep2PreviewMessage(salutation, bodyNote, signOff)`:
  - Resolve `greeting = normalizeGreetingText(resolveGreeting(note.salutation || "", choice))`.
  - Resolve `body = normalizeBodyText(note.text)`.
  - Resolve `signOff = normalizeSignOffText(note.signOff || "")`.
  - Return `[greeting, body, signOff].filter(Boolean).join("\n\n")`.
  - **Invariant:** `composeRecipientMessage` and `resolveStep2PreviewMessage` must produce identical output for identical inputs, and `submitPreparedHandwryttenOrder` / `buildSingleStepOrderPayload` must send that exact normalized string.

### 2.2 Single-Name Carryover Guardrail (`lib/multi-send/greeting-guard.ts` & `MultiSendAddressEditor.tsx`)

Per [`PERSONAL_GREETINGS.md`](../proposals/2026-11-06-multi-send/PERSONAL_GREETINGS.md):
- **Never** silently replace the Note step's greeting with `"Dear friends,"` and **never** auto-generate a greeting by splitting a recipient's address-book name.
- However, detect when an **inherited** greeting on Recipient $k$ ($k \ge 2$, `greeting.mode === "inherit"`) appears to address **Recipient 1 by name**:
  - Using `extractRecipientName(defaultGreeting)`, check if the extracted name is non-empty, is not a generic collective greeting (`friends`, `family`, `everyone`, `all`, `you all`, `y'all`, `folks`, `neighbors`), matches Recipient 1's first name or full name (case-insensitive), and does **not** match Recipient $k$'s first name or full name.
  - When this mismatch is active on a saved recipient row:
    1. Render an inline amber callout inside that recipient's greeting section in [`MultiSendAddressEditor.tsx`](../../components/v3/MultiSendAddressEditor.tsx):
       > **Still says “{defaultGreeting}”** — This matches {Recipient 1}'s name. Personalize the greeting for {Recipient k}, or confirm keeping it.
    2. Offer two inline actions:
       - **Personalize greeting** — opens the inline greeting editor for Recipient $k$, pre-populating with the current text selected so they can type `"Dear [Name],"` in one keystroke.
       - **Keep “{defaultGreeting}” for {Recipient k}** — converts or acknowledges the choice (`greeting: { mode: "custom", text: normalizeGreetingText(defaultGreeting) }`) so intentional cases are never blocked.
    3. Guard **Review & pay** (`handleAddressSubmit` in [`app/preview/entry/client.tsx`](../../app/preview/entry/client.tsx) and server-side `/api/checkout/create-intent` or client preflight): if any recipient has an unacknowledged inherited greeting that matches Recipient 1's name instead of their own, scroll/focus that recipient row and show a clear validation message:
       > *"Check the inside greeting for {Recipient k} — it still uses {Recipient 1}'s name (“{defaultGreeting}”). Personalize their greeting or confirm keeping it before checkout."*

### 2.3 Step 2 & Step 3 Greeting Input Ergonomics

1. **Step 2 (`components/v3/Step2NoteComposition.tsx`):**
   - When `isMultiSend` is `true`:
     - Keep the label **Default greeting**.
     - Change placeholder from `"e.g. Dear Sarah,"` to `"e.g. Dear friends,"`.
     - Change helper text below the input from *"We'll automatically pre-fill this name into the recipient address step."* to:
       > *"Used for recipients without a personalized greeting. Personalized greetings stay unchanged."*
   - **Sign-Off control (`Step2NoteComposition.tsx`):**
     - Upgrade the Sign-Off input to a compact 2-line control (`<textarea rows={2}>` with max 1 newline `\n`) with placeholder `"e.g. Warmly,\nEzekiel"` and helper text:
       > *"Tip: Put your closing (like “Warmly,”) on the first line and your name below it for a natural handwritten sign-off."*
     - Update `extractSenderName` in [`components/v3/TargetPurchaseExperience.tsx`](../../components/v3/TargetPurchaseExperience.tsx) so two-line sign-offs (`"Warmly,\nEzekiel"` or `"With love,\nSarah & Tom"`) cleanly extract `"Ezekiel"` or `"Sarah & Tom"` for the return-address name prefill without including the closing phrase.
2. **Step 3 (`components/v3/MultiSendAddressEditor.tsx`):**
   - Change the per-recipient inline greeting override from `<textarea rows={2}>` to `<input type="text">` (`ref={greetingRef}`) so pressing `Enter` or pasting multiline text cannot inject extra line breaks between the greeting and the shared body.
   - Normalize the greeting via `normalizeGreetingText` when saving (`saveGreeting`).

### 2.4 Step 4 ("Review & Pay") Preview Parity (`Step4ReviewAndPayment.tsx` & `app/preview/entry/client.tsx`)

1. **Keep "Preview this card" on Step 4:**
   - In [`app/preview/entry/client.tsx`](../../app/preview/entry/client.tsx), change `onPreviewMultiRecipient` passed to `Step4ReviewAndPayment` so it updates `setMultiSendPreviewId(id)` **without** navigating back to `step = "address"`. (`onEditMultiGreeting` continues to navigate to Step 3 and open that recipient's inline greeting editor).
   - In [`Step4ReviewAndPayment.tsx`](../../components/v3/Step4ReviewAndPayment.tsx), clicking **Preview this card** on a recipient row selects that recipient (`onPreviewMultiRecipient?.(person.id)`) and opens the `CardPreview` sheet (`setIsPreviewOpen(true)`) defaulted to `initialView="rightPage"` (Inside Note) so the sender immediately inspects that recipient's exact handwritten interior.
2. **Truthful Desktop Summary Card Preview on Step 4:**
   - In [`Step4ReviewAndPayment.tsx`](../../components/v3/Step4ReviewAndPayment.tsx), update the left-column Order Review note preview box so:
     - In multi-send mode, it displays a header badge `Previewing card for {selectedMultiRecipient.name}` and renders that recipient's resolved greeting (`selectedMultiRecipient.greeting`) rather than always rendering the Step 2 `salutation`.
     - Greeting, body, and sign-off are rendered in uniform `#1B3B6F` ballpoint ink styling (`whitespace-pre-wrap`) with proportional spacing rather than styling greeting/sign-off as bold headers and body as `text-stone-800` gray text.

---

## 3. Hydrogen Agent Work Packages

Execute in an isolated worktree branched from current `HEAD` (`d656f3f`). Do not run live fulfillment scripts or mutate production.

### Lane A (Hydrogen Agent 1) — Composition, Spacing & Two-Line Sign-Off Contract
**Owned files:**
- `lib/multi-send/contracts.ts`
- `lib/multi-send/greeting-guard.ts` *(new)*
- `lib/note-preview.ts`
- `lib/handwrytten.ts`
- `components/v3/TargetPurchaseExperience.tsx` (`extractRecipientName`, `extractSenderName`)
- `tests/multi-send-contracts.test.ts`

**Tasks:**
1. Implement `normalizeGreetingText`, `normalizeBodyText`, and `normalizeSignOffText` in `lib/multi-send/contracts.ts` and wire them into `composeRecipientMessage` and `lib/note-preview.ts` (`resolveStep2PreviewMessage`, `resolvePreviewMessage`).
2. Ensure `buildSingleStepOrderPayload` in `lib/handwrytten.ts` preserves the exact normalized message (`\n\n` between sections, `\n` within two-line sign-off, zero leading/trailing blank lines when greeting is empty or whitespace-only).
3. Create `lib/multi-send/greeting-guard.ts` exporting `findInheritedGreetingNameMismatches(defaultGreeting, recipients)` using `extractRecipientName` to detect when Recipient 2+ inherits a greeting containing Recipient 1's specific name.
4. Update `extractSenderName` in `components/v3/TargetPurchaseExperience.tsx` to support both two-line (`"Warmly,\nEzekiel"`) and comma-separated (`"Warmly, Ezekiel"`) sign-offs cleanly.
5. Expand `tests/multi-send-contracts.test.ts` to cover:
   - Whitespace-only greetings (`"   "`) → omitted with zero leading blank lines.
   - Trailing newlines in greeting or body → normalized to exactly `\n\n` (never `\n\n\n`).
   - Two-line sign-offs (`"Warmly,\nEzekiel"` and `"Warmly, Ezekiel"`) → `\n\n` before sign-off and single `\n` between valediction and signature.
   - `findInheritedGreetingNameMismatches` positive cases (`"Dear Sarah,"` on Recipient 1 `"Sarah Lee"` inherited by Recipient 2 `"Uncle Bob"`) and negative cases (`"Dear friends,"`, `"Happy Holidays,"`, custom greeting on Recipient 2, or same first name).

### Lane B (Hydrogen Agent 2) — Step 2 & Step 3 Greeting Guardrails and Sign-Off UI
**Owned files:**
- `components/v3/Step2NoteComposition.tsx`
- `components/v3/MultiSendAddressEditor.tsx`
- `app/preview/entry/client.tsx`

**Tasks:**
1. In `components/v3/Step2NoteComposition.tsx`:
   - Update the greeting helper text and placeholder when `isMultiSend` is `true` (*"Used for recipients without a personalized greeting. Personalized greetings stay unchanged."*).
   - Upgrade the Sign-Off input to a 2-line `<textarea rows={2}>` (capping at 1 internal newline `\n`, auto-splitting known `"Warmly, Name"` on blur into `"Warmly,\nName"`, and using `resolveStep2PreviewMessage` for character count and preview).
2. In `components/v3/MultiSendAddressEditor.tsx`:
   - Change the inline greeting override from `<textarea>` to `<input type="text">` (`ref={greetingRef}`) and normalize on save.
   - Integrate `findInheritedGreetingNameMismatches`: when a saved recipient row has an inherited greeting matching Recipient 1's name, display the inline amber callout with **Personalize greeting** and **Keep “{defaultGreeting}”** actions.
3. In `app/preview/entry/client.tsx`:
   - In `handleAddressSubmit`, check `findInheritedGreetingNameMismatches` before advancing to checkout; if any mismatch is unresolved, set the validation error and focus/scroll to that recipient.
   - Update `multiSendCardPreview.message` and `fullHandwrittenMessage` to use the shared composition helper from `lib/multi-send/contracts.ts`.
   - Fix `onPreviewMultiRecipient` on `Step4ReviewAndPayment` so it sets `setMultiSendPreviewId(id)` without kicking the user back to `step = "address"`.

### Lane C (Hydrogen Agent 3) — Step 4 Review & Pay Preview Parity & Verification Suite
**Owned files:**
- `components/v3/Step4ReviewAndPayment.tsx`
- `tests/multi-send-presentation.test.ts`
- `docs/sprints/evidence/SPRINT-0029/browser-acceptance.cjs` *(or updated acceptance check)*

**Tasks:**
1. In `components/v3/Step4ReviewAndPayment.tsx`:
   - When **Preview this card** is clicked on a multi-send recipient row, select that recipient (`onPreviewMultiRecipient?.(person.id)`) and open the preview `Sheet` (`setIsPreviewOpen(true)`) with `initialView="rightPage"` so the inside handwritten note is shown immediately on Step 4.
   - In the desktop left-column Order Review preview box, display the active recipient's resolved message (`selectedMultiRecipient?.greeting ?? salutation`, `bodyNote`, `signOff` composed via the shared helper) in uniform `#1B3B6F` handwriting styling (`whitespace-pre-wrap`) with a `Previewing card for {selectedMultiRecipient.name}` indicator when in multi-send mode.
2. Add unit and browser verification in `tests/multi-send-presentation.test.ts` and `docs/sprints/evidence/SPRINT-0029/` verifying:
   - Exact `\n\n` greeting-to-body and body-to-sign-off spacing and single `\n` two-line sign-off cadence across Step 2, Step 3, Step 4, and supplier payload.
   - Inherited single-name greeting warning on Recipient 2+, resolution via Personalize or Keep, and Step 2 multi-send helper copy.
   - Step 4 **Preview this card** staying on Step 4 and opening the recipient's inside note preview.

---

## 4. Files Summary

| File | Role in Sprint 0029 |
| --- | --- |
| `lib/multi-send/contracts.ts` | Trim & normalize greeting, body, and 2-line sign-off in `composeRecipientMessage`. |
| `lib/multi-send/greeting-guard.ts` | Pure detector for inherited single-name greeting mismatches across recipients. |
| `lib/note-preview.ts` | Align `resolveStep2PreviewMessage` and `resolvePreviewMessage` with normalized composition. |
| `lib/handwrytten.ts` | Ensure `buildSingleStepOrderPayload` preserves normalized cadence without extra blank lines. |
| `components/v3/TargetPurchaseExperience.tsx` | Support 2-line sign-offs (`"Warmly,\nEzekiel"`) in `extractSenderName`. |
| `components/v3/Step2NoteComposition.tsx` | Multi-send default greeting helper copy + 2-line sign-off input and blur formatting. |
| `components/v3/MultiSendAddressEditor.tsx` | Single-line `<input>` for greeting override + inline inherited-name mismatch callout. |
| `components/v3/Step4ReviewAndPayment.tsx` | In-place **Preview this card** (`initialView="rightPage"`) + truthful desktop note preview. |
| `app/preview/entry/client.tsx` | Pre-checkout greeting mismatch guard + stay-on-Step-4 preview callback + shared composition. |
| `tests/multi-send-contracts.test.ts` | Unit tests for spacing normalization, 2-line sign-offs, and greeting mismatch guard. |

---

## 5. Acceptance Matrix

| Gate | Requirement | Verification |
| --- | --- | --- |
| **C1 — Greeting-to-body spacing** | Non-empty greeting is separated from body by exactly `\n\n` (1 blank line). Trailing newlines/spaces in greeting or body never produce `\n\n\n`. Empty or whitespace-only greeting produces zero leading newlines. | `tests/multi-send-contracts.test.ts` + `tests/handwrytten-batch-transport.test.ts` |
| **C2 — Two-line sign-off cadence** | Body is separated from sign-off by `\n\n`, while valediction and signature (`"Warmly,\nEzekiel"`) are separated by a single `\n`. `extractSenderName` extracts `"Ezekiel"` for the return address. | `tests/multi-send-contracts.test.ts` + Step 2 → Step 3 browser check |
| **C3 — Single-line greeting override** | Step 3 greeting override is an `<input type="text">`; pressing `Enter` or pasting newlines cannot insert blank lines into the greeting. | `MultiSendAddressEditor` DOM & interaction check |
| **C4 — Single-name carryover guard** | If Step 2 greeting is `"Dear Sarah,"` (matching Recipient 1) and Recipient 2 (`"Uncle Bob"`) is added with `mode: "inherit"`, an inline callout warns that Recipient 2's card still says `"Dear Sarah,"` and blocks Review & pay until personalized or explicitly kept. Generic greetings (`"Dear friends,"`) do not warn. | Unit tests + Step 3 browser interaction check |
| **C5 — Step 2 multi-send copy** | Returning to Step 2 while multi-send is active shows **Default greeting** with `placeholder="e.g. Dear friends,"` and explains that personalized greetings stay unchanged. | Step 2 multi-send render check |
| **C6 — Step 4 preview parity** | Clicking **Preview this card** on Step 4 stays on Step 4, selects that recipient in the desktop summary card, and opens the `CardPreview` sheet to `rightPage` with that recipient's exact composed note. | Step 4 browser interaction check |
| **R1 — Baseline & safety regression** | Single-card baseline when `multiSendEnabled=false` remains unchanged; all existing multi-send checkout, fulfillment, and staging safety suites pass with zero external network calls. | Full multi-send test suite + `next build` |

---

## 6. Definition of Done

- [x] Lane A, Lane B, and Lane C implemented and integrated cleanly.
- [x] `composeRecipientMessage` and `resolveStep2PreviewMessage` enforce identical trimmed `\n\n` section spacing and `\n` two-line sign-off cadence.
- [x] Step 3 greeting override uses `<input type="text">` and surfaces the inline carryover guard when an inherited greeting matches Recipient 1's name.
- [x] Step 4 **Preview this card** opens the selected recipient's inside note preview on Step 4 without navigating back to Step 3.
- [x] All unit, integration, and browser acceptance checks (`C1`–`C6`, `R1`), `tsc --noEmit`, and `npm run build` pass in isolated test stores (`NODE_ENV=test SMN_TEST_DATA_DIR=...`).
