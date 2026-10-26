# Founder event testing: staged candidate

Prepared October 26, 2026. Founder event: Saturday, October 31, 2026. Requested scope: broad supplier-supported international destinations. This checklist is preparation, not a record of tests performed.

## Environments

- Staging: https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app . Review-only; outbound email and physical fulfillment remain blocked. Existing live Stripe keys, if present, remain blocked. International editor can be reviewed independently of payment readiness.
- A Stripe **test-mode** staging payment, when configured and verified, is not a live payment or physical-mail test.
- Production: unchanged by this sprint. A later production candidate must be derived selectively from the production base; do not merge all staging history to prepare the event.

## Before event live testing

1. Record the exact candidate revision and enabled destinations, final total, discount behavior and rollback target. Review local and staging evidence and all unresolved findings.
2. Confirm actual custom A2 supplier charges and destination requirements. Country catalog delivery_cost is not full order COGS. Confirm the $14 price/promotion disclosure before charging customers for international orders.
3. Agree whether each founder test should actually send a physical card, and to which consented address. A successful charge without dispatch and an actual mailed order are different outcomes.
4. Use explicit authorization for the selected production/live-payment environment. Do not remove staging safety guards to make a live test work. Keep test credentials separate from live credentials.
5. Preserve the previous production revision and compatible country/quote readers for outstanding orders. Feature-off is a new-sales control, not a deletion of accepted commitments.

## Founder walkthrough

- Domestic full-price card: expected $9 USD, correct personal return/recipient addresses, one charge, one receipt, one order.
- Domestic valid discount and free offer: total, UI, receipt and recorded order agree; a zero order does not enter paid checkout.
- International supported address: clear upgrade and complete total, country visible at review, applicable postal/region fields, no domestic transit promise.
- Change destination and promo before paying: final visible total matches the final payment form; canceling the address modal changes nothing.
- Close/reopen/reload and return from review: note/art/address persist; no stale price or duplicate charge.
- Card payment; Apple Pay/Safari and other desired wallet/device combinations separately. Record which were actually exercised, never infer wallet readiness from a normal card success.
- Confirmation and receipt: actual paid amount/country. Physical supplier acceptance and later delivery are separate evidence; record supplier order ID privately, never in public screenshots.

Do not deliberately create duplicate live charges to test idempotency. Automated replay/failure cases belong in isolated fake/test environments. Stop for mismatched amount, uncertain payment result, duplicated order, unsupported country or unexpected physical dispatch; reconcile the existing payment before retrying. Refunds are separate explicit actions.

## What to record

Revision, environment, date/time, scenario, destination country, expected/actual amount, payment method/device, result, whether email/physical dispatch was expected, and a redacted reference. Keep addresses, notes, receipts and payment identifiers private. Label founder transactions as tests rather than independent customer conversions.
