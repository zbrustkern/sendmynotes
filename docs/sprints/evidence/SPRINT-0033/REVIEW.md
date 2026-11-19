# Sprint 0033 staging verification

## Preflight

On November 19, 2026 at 14:22 UTC, the serving staging commit was `3d9d8ff47eb585c82c56e1d713b44bcecbd550e9`. A read-only inventory found three distinct legacy codes across three code records and three version records, no positive personal limits, zero recorded lifetime uses and zero recorded subsidy. The two legacy representations agreed. Three expired reservations still had frozen quotes and pending orders. Two had processor references and one had none. The outstanding promised discount amounts were $9.00, $2.00 and $1.80.

## Local verification

- A Firestore emulator run on November 19 verified contention for one use and the last $5, exact shared balances, migration replay, post-cutover personal counting, abandoned holds, overlapping recovery jobs and refund replay. Run `tests/promo33-settlement.test.ts` with a fresh emulator project.
- The isolated wedding checkout suite verified a 50-envelope $352.50 quote and two payments of $145.00 and $207.50. A mixed project with three international envelopes paid $698.50 and $18.50. Refunding envelope 99 returned $12.00 and preserved the purchased ordinal.
- Browser verification of the single-card sender flow at 320px showed a $9.00 base, $2.00 savings and $7.00 payable. Removing and reapplying the code preserved the draft.
