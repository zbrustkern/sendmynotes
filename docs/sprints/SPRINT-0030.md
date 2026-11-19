# Sprint 0030 — Repeat buyers and observed customer value

## Pyramid Index

- L0. Give the founder a private, read-only view of how much contribution a customer cohort has earned by each age.
- L1. Reconcile independent live captures, match permitted checkout contacts, measure 30/60/90/180/365-day outcomes, and compare with fully loaded acquisition cost when coverage permits.
- L2. The [design](../proposals/2026-11-18-repeat-buyers/DESIGN_SPEC.md) defines the population and synthetic acceptance examples. The [staging review](evidence/SPRINT-0030/REVIEW.md) records verification.

## Design review

Approved for staging. Seven founder-reported orders are a reconciliation reference. Technical purchase eligibility, an email marketing choice, and the presence of a supplier invoice each answer different questions from commercial independence, permission to match receipts, and complete variable costs. Require affirmative evidence for each. Historical checkout describes receipts and mailing updates. Unknown permission must appear in identity coverage. Preserve the first acquisition when its payment is refunded.

## Implementation plan

1. Use two Luna coding lanes for the pure calculator and independent synthetic fixtures. The coordinator integrates the existing private order, attribution, financial, reconciliation and spend sources locally. No semantic index or linked chapter is configured.
2. Read a bounded all-history census in a single Firestore snapshot. Require a reviewed independent classification and bound positive live payment, with a separate exclusion for friends and family. Use only permitted, effective, unredacted checkout contacts. Never persist a derived reporting identity.
3. Reuse dated invoice and media ledger rows. Record positive evidence for complete acquisition period, pass-through taxes, actual costs and billing scope. Show why values are unavailable and keep negative contribution visible.
4. Ship an authenticated aggregate-only view under Measurement, with a separately labeled synthetic example available only on staging. Exercise successful and denied reads, cutoff and coverage cases. Verify the staging branch, hosted revision and route.

## Definition of done

Repeat counts and dollars agree with hand calculations, unknowns stay visible, filters preserve first acquisition, private data stays server-side, and the deployed staging site is available for founder review. A production spending ceiling requires actual cohort evidence.

## Founder clarification, November 18

The founder believes the only returning sender was a family member who sent two cards without paid acquisition. Treat this as a recollection pending private order-level reconciliation. If confirmed, both orders are friends-and-family exclusions and contribute zero independent repeat buyers. The seven-order reference does not establish a unique-buyer denominator. Link reviewed decisions to payment evidence and keep personal identifiers outside sprint records.
