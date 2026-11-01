# SPRINT-0018: Admin comp experience and verified staging release

Status: active. Authorized October 26, 2026. Depends on SPRINT-0017 contracts; UI work may proceed concurrently after contract agreement.

## Pyramid Index
- L0: Ship the approved admin-only full-comp/item-adjustment flow to guarded staging and verify it for founder review.
- L1: New-card composition preserved; accessible quote/review/action flow; truthful held/payment states; independent checks; serialized staging deployment and rollback evidence.
- L2: UI → Architecture; ownership → Implementation Plan; evidence → Definition of Done; release boundaries → Risks.

## Overview / Use Cases
Follow SPRINT-0017 authority, canonical docs and current source baseline. The founder approved the interactive admin mockup at `/Users/zeke/.codex/visualizations/2026/10/23/01a16997-2350-7320-a44e-a38b9391f002/admin-complimentary-order.html`. Preserve current new-card compose controls rather than introduce an existing-order cloning requirement. Admin prepares recipient/message/cover, chooses full comp or item adjustments, supplies personal return address and reason, reviews all totals, and records a comp or creates a payment request.

## Architecture
Contained accessible dialog with editable composition/address details and pricing review. International recipient fields follow current country rules; personal sender is US. Full comp covers all server-returned eligible lines automatically. Per-line inputs express money exactly and never submit client prices. Quote refresh disables stale actions, ignores stale responses, preserves input on failure and invalidates review after edits. Stable request identity across retries prevents duplicates; new deliberate order requires a new identity.

Show original total, admin adjustment and customer due, with USD clear. Required reason plus optional bounded note; no hardcoded brand address or prewritten promotional note. Explicit review step; zero balance and pending-payment paths have different actions and outcomes. Staging displays hold/no physical mail and never claims payment or dispatch. Payment requests use trusted environment origin and opaque authorization, never an arbitrary query host. No real future add-on is invented for this release.

## Implementation Plan
- T01: UI Luna updates `StudioCompModal.tsx`, minimal existing caller labels, new payment-request page only if backend contract needs it; no broad admin/reporting redesign.
- T02: Add meaningful mounted/interaction checks and a safe local fixture using fictional data; coordinator visually checks desktop/mobile, focus, stale response/review/back, amount changes and held result.
- T03: Audit Luna reviews completed backend/UI diff and tests independently; authors resolve blockers, coordinator reruns affected checks.
- T04: Coordinator runs TypeScript, focused regression/security tests and production build with network denied. Record exact source/test evidence and provider limitations.
- T05: Reread remote refs and hosting baseline, ensure no concurrent staging rollout, fast-forward only the reviewed commit to staging. Wait for App Hosting READY/SUCCEEDED and source SHA/100% traffic. Preserve runtime payment/supplier flags and production fingerprint.
- T06: Verify hosted health, unauthenticated admin boundaries and authenticated UI when available. Use side-effect-free quote/preview/held controls only; no real payment/email/mail. Record screenshots and exact limitations, source/build/URL/rollback and test checklist. Update both sprint ledger entries without overwriting concurrent reporting work.

## Files Summary
UI worker owns modal, minimal entry labels and payment-request client surface; backend worker owns API/types. Auditor owns independent review and baseline inspection helper. Coordinator owns run report, docs/ledger integration, test command scripts and releases.

## Definition of Done
Full comp and individual adjustments visibly follow approved design; existing card composition works; international fields and personal US sender validated; required reason; stable review/back state; loading/error/retry and quote races; correct full/partial/held outcomes; no bogus add-on; keyboard and narrow layout checked. New foundation gates pass. Hosting serves exact candidate in staging, production remains unchanged, guards/fingerprint match expected values. Concrete remaining live-payment and supplier validation gates disclosed.

## Risks & Mitigations / Dependencies
Only staging is authorized. Keep review-only flags and provider test controls. No forced push or wholesale staging-to-production merge. If remote changes, integrate/review and repeat relevant checks before release. Old READY staging build/source is rollback target; do not initiate rollback speculatively. Do not equate mocked UI/tests with successful real payment or physical mail. Other reporting and artwork work stays independently owned. No chapter/semantic index configured; no further user approval needed for the authorized staging release.
