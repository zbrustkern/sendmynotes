# Sprint 0013 backend implementation report

Implemented international mailing pricing, destination validation, checkout snapshots, payment verification, supplier payload construction, and staging review protections in the isolated clone.

- Added server-owned dynamic destination mapping from the verified Handwrytten country catalog. ISO2 and recognized aliases normalize to canonical codes (including `UK` → `GB`); unsupported, ambiguous, and USPS-suspended destinations fail closed. Historical `USA` and missing country remain domestic only at legacy migration callers.
- Added pure versioned quotes: USD 900¢ base, discounts apply only to that base, and international mailing adds 500¢. Create-intent stores the immutable total/base/discount/surcharge/country quote and verified supplier country ID/name, returns the quote to the client, and marks all international preview orders for hold.
- Added `/api/mailing-options`. Staging/local preview can display the editor without enabling payment; international checkout requires exact staging review with Stripe test mode or explicit nonproduction local fake adapters. Default is off. Deferred international addresses and foreign/unknown return addresses are rejected.
- Payment confirmation validates the order quote, supplier-country binding, Stripe amount/country/version metadata, and payment identity. Confirm and webhook flows hold international preview orders before supplier dispatch and suppress transactional email. Both payment-completion paths redeem bound promotions idempotently; redemption failure is explicitly marked for reconciliation and logged rather than silently treated as consumed. Free completion cannot bypass a positive international upgrade. Deferred-address completion is token-first, limited to an awaiting domestic order, and rejects explicit country changes.
- Added verified country IDs/names to the Handwrytten v2 single-step payload, with a pure payload builder for safe tests. This does not perform a real supplier POST. Staging preview remains held; no physical mail was requested or sent.
- Fixed promotion redemption for international discounts: authoritative offer quote compares against base payable, order snapshot binds the full charged total and surcharge, capture binds to full amount, and redemption records the base payable. Thus a 100% base discount still charges 500¢ internationally and redeems with zero base payable.

## Validation

Run from an isolated temporary working directory with `TSX_TSCONFIG_PATH` pointing to the clone config so the mock Firestore store is isolated and no environment files are loaded.

- `npx tsc --noEmit --pretty false` — passed.
- `tests/international-pricing.test.ts` — passed.
- `tests/international-checkout.integration.test.ts` — passed. Exercises create-intent at 1400¢, 200¢ discount at 1200¢, 100% base discount at 500¢, confirm- and webhook-only redemption records (including idempotent webhook replay), unsupported/suspended/deferred/live-Stripe-mode rejection, free-route bypass rejection, tampered country and PaymentIntent identity rejection, webhook-first preview hold and replay idempotency, and no blocked external calls.
- `tests/sprint-0005-offer-engine.test.ts` — passed 65/65 from a fresh isolated mock store.

No test used network access, real supplier/payment/email adapters, or production credentials. Authenticated supplier country IDs/catalog are verified source data, but full custom-SKU costs and physical international fulfillment have not been independently tested. Production enablement remains off pending the sprint's physical-mail and pricing validations.
