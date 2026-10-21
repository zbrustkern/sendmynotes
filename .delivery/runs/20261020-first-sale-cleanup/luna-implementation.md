# Luna implementation handoff

## Delivery

The production-based managed worktree at `/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes` was readable but rejected source writes with a filesystem permission error. No production source file was changed by this worker. The bounded, assertion-checked edit script is [`luna-cleanup.py`](luna-cleanup.py); it targets only that managed worktree and stops unless each expected old copy fragment occurs exactly once. The coordinator must apply it with the required write authorization, then inspect the resulting diff.

## Intended scope

The script edits `components/flow/EntryCardStep.tsx`, the V3 note, envelope, payment, and purchase components, `components/VendingMachineBuilder.tsx`, `components/admin/HandwryttenStatusWidget.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/return-policy/page.tsx`, `app/send/page.tsx`, `app/send/[occasion]/page.tsx`, `app/order/[id]/page.tsx`, `app/admin/page.tsx`, and `lib/product-facts.ts`.

It replaces the clipped custom-art invitation with naturally wrapping personal-scene copy and a short action while leaving its click handler untouched; removes unverified stock, archival, cotton, heavyweight, matching-envelope, and blanket tracking claims; replaces scoped 60-second and 2–4-day text with canonical wording; updates the displayed Vending Machine card dimensions to the verified folded A2 size; and adds a dated static founder report above admin totals. Existing order tracking-number rendering, policy commitments, pricing, and behavior are not changed.

## Checks and gaps

Commands run: source reads and scoped `rg` inspection in the assigned managed worktree; Python `ast.parse` confirmed the edit script is syntactically valid. `git apply --check` was attempted on an intermediate hand-authored patch and exposed two context mismatches, so that artifact was removed in favor of the guarded edit script. No tests, typecheck, build, browser check, supplier/payment/fulfillment request, or source write was performed. The coordinator owns applying the script, reviewing the actual diff, and running release validation.
