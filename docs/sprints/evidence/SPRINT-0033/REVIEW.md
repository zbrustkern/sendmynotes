# Sprint 0033 staging verification

## Preflight

On November 19, 2026 at 14:22 UTC, the serving staging commit was `3d9d8ff47eb585c82c56e1d713b44bcecbd550e9`. A read-only inventory found three distinct legacy codes across three code records and three version records, no positive personal limits, zero recorded lifetime uses and zero recorded subsidy. The two legacy representations agreed. Three expired reservations still had frozen quotes and pending orders. Two had processor references and one had none. The outstanding promised discount amounts were $9.00, $2.00 and $1.80.

## Local verification

- A Firestore emulator run on November 19 verified contention for one use and the last $5, exact shared balances, migration replay, post-cutover personal counting, abandoned holds, overlapping recovery jobs and refund replay. Run `tests/promo33-settlement.test.ts` with a fresh emulator project.
- The isolated wedding checkout suite verified a 50-envelope $352.50 quote and two payments of $145.00 and $207.50. A mixed project with three international envelopes paid $698.50 and $18.50. Refunding envelope 99 returned $12.00 and preserved the purchased ordinal.
- Browser verification of the single-card sender flow at 320px showed a $9.00 base, $2.00 savings and $7.00 payable. Removing and reapplying the code preserved the draft.

## Hosted acceptance

The authenticated admin workspace published bounded multisend and Canadian postage campaigns. Its five-card preview returned $45.00 gross, $9.00 savings and $36.00 payable. Four cards produced zero savings. A Canadian single preview returned $14.00 gross and $11.00 payable. A separate wedding draft preview allocated $25.00 across 25 of 50 US envelopes for $352.50. Saving an edited draft now retains its custom preview basket.

- The November 19 cutover seeded three legacy codes, imported three active reservations, and found zero isolated codes. Replaying the import added zero entries. Personal counting began at 14:35:55.888 UTC. Staging checkout reopened, and the first authenticated scheduled run released the $12.80 in expired discount exposure. [Cutover receipt](cutover.json)
- Stripe test mode captured the five-card multisend at $36 and the Canadian single at $11. Replaying confirmation preserved one capture and redemption per order. A Canadian refund returned $11 once and preserved spent promotion usage. [Checkout receipt](hosted-checkout.json)
- Wedding checkout charged $145.00 and $207.50 for 20 and 30 domestic envelopes. The 98-plus-2 mixed cohort paid $698.50 and $18.50. Two identical refund requests for envelope 99 returned one $12.00 refund. The retained project total was $705.00. All 150 wedding envelopes remained held. [Wedding receipt](hosted-wedding.json)
- Application builds 016 and 017 served the staging tests. TypeScript, the local Next.js production build, the targeted promotion suites and all 10 isolated wedding test files passed. The broader test suite stopped on a pre-existing handwriting font-class assertion. The remaining auto-select suite reported eight existing failures. Both reproduced at the original staging commit with the same outcomes.

New private codes depend on the staging promotion key pinned to `promotion-private-key@1`. Preserve that version across deployments. The validation limiter uses a shared fallback of 60 attempts per minute until a trusted proxy hop and network-hashing secret are configured. Production activation and its own cutover are separate.
