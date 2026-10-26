# Admin complimentary orders — backend architecture draft

## Scope and current state

This is a backend contract proposal for the approved admin-created card flow. The existing `StudioCompModal` composes a new card from a selected/custom cover, note, recipient and return address; it does not clone an existing order. Keep that compose capability. The client selects content and canonical catalog IDs, but the server owns all prices, comp eligibility, quote versions, adjustments and payment amounts.

Current `/api/admin/dispatch-comp` is not a safe lifecycle spine: it accepts a client cover URL, logs a free-form reason without persisting it, saves a zero amount with `STUDIO_COMP`, and calls Handwrytten directly. It blocks entirely in `STAGING_REVIEW_ONLY`. Replace this behavior with quote → accepted immutable order → optional balance payment → verified paid-ready/held state. No staging route may submit to the supplier, create email, or accidentally invoke normal customer checkout.

Canonical product docs preserve the $9 domestic base and $5 international upgrade; full custom-SKU supplier charges remain unknown. A comp affects customer balance, not supplier cost. Full comps and partial admin-adjusted orders must remain excluded from independent customer purchase measurement. Do not hardcode or expose the personal sender address: require the admin to enter/confirm the personal US return address.

## Shared server contract

Use a separate `adminCompQuote` snapshot on `Order`; do not overload current `Order.quote`, which is the fixed domestic/international checkout quote. Use integer cents and immutable catalog snapshots. Suggested types:

```ts
type OrderOrigin = "CUSTOMER_CHECKOUT" | "ADMIN_COMP";
type AdminCompMode = "full_comp" | "individual_adjustments";
type AdminCompLifecycle =
  | "review_only_held" | "payment_pending" | "paid_ready" | "fulfilled";

interface AdminCompQuoteLine {
  lineId: string;             // stable server catalog ID
  catalogVersion: string;
  description: string;
  quantity: number;           // positive safe integer; current card is fixed at 1
  unitPriceCents: number;
  grossCents: number;
  adjustmentEligible: boolean;
  waivedCents: number;
  dueCents: number;
}

interface AdminCompQuoteSnapshot {
  quoteId: string;
  version: "admin-comp-v1";
  catalogVersion: string;
  currency: "USD";
  destinationCountryCode: string;
  lines: readonly AdminCompQuoteLine[];
  grossCents: number;
  waivedCents: number;
  customerPayableCents: number;
  mode: AdminCompMode;
  reason: string;
  issuedToActor: string;
  issuedAt: number;
  expiresAt: number;
}

interface AdminCompAuditEvent {
  eventId: string;
  orderId: string;
  event: "quote_accepted" | "payment_request_created" | "payment_verified" | "held_for_review" | "fulfillment_completed";
  actor: string;              // verified admin email or trusted system actor
  reason: string;
  occurredAt: number;
  quoteId: string;
  idempotencyKey: string;
  details?: Record<string, unknown>;
}
```

Current production catalog has only the current card product and the applicable international mailing line (900¢ base + 500¢ upgrade under current approved pricing). Covers and messages are order content, not purchasable lines. There must be no real-catalog add-on example. Prove extensibility with an injected fake catalog fixture that cannot be loaded in deployed environments. A catalog line includes its canonical ID, description, unit cents, destination eligibility and adjustment eligibility. Full comp waives the full amount of every included eligible line; individual mode accepts only `lineId` and integer `waivedCents` values from 0 through that line's server-computed gross. Non-adjustable lines stay due. Validate line IDs, destination, quantities, arithmetic safety, and a nonblank bounded reason on the server.

### Endpoints

- `GET /api/admin/comp/catalog?country=CA` — requires `verifyAdminAuth`; returns server-selected lines, prices, eligibility, address requirements, quote version, catalog version and staging/payment/fulfillment capability flags. The client never sends or edits a price.
- `POST /api/admin/comp/quotes` — admin only. Body: `{ mode, destinationCountryCode, lineItems: [{ lineId, quantity?, waivedCents? }], reason }`. Returns the persisted quote snapshot. Current card quantity is fixed at one; future quantities/lines require an explicit server catalog rule. `full_comp` takes no client adjustments; server waives every included eligible line. Quote is bound to actor, destination and catalog version, short-lived, and single-use. Requote on catalog/price change; reject stale or actor-mismatched quote.
- `POST /api/admin/comp/orders` — admin only. Body contains `{ quoteId, idempotencyKey, frontImageAssetId, printedMessage, handwrittenNote, fontStyleId, recipientAddress, returnAddress, customerEmail?, scheduledSendDate? }`. Server revalidates quote and address country, requires a complete personal US return address, and transactionally consumes the quote/idempotency key. Server snapshots content, addresses, quote, mode, required reason, actor and audit event. Cover input should be a selected app-owned preset or an uploaded asset ID; do not let this flow trigger server fetches of arbitrary client URLs. Existing Handwrytten URL validation blocks common private hosts but does not establish an allowlist for arbitrary public hosts. Return `{ orderId, origin: "ADMIN_COMP", lifecycleStatus, quote, paymentRequest }`.
- `POST /api/admin/comp/orders/{id}/payment-request` — admin only, idempotent. For a positive balance, creates/returns one active capability bound to that order and exact immutable quote. Staging review mode returns a conspicuous held preview (`review_only_held`) with no payable URL or Stripe request. A staging test-payment request may be issued only with exact review-only staging configuration and Stripe test credentials; it must never resolve to live mode.
- `GET /api/admin/comp/orders/{id}` — admin-only status lookup for quote/order/payment/hold state. It is the retry/status path after an ambiguous admin request and returns no mutable pricing controls.
- `GET /api/comp-payment/{capability}` and `POST /api/comp-payment/{capability}/payment-intent` — public customer capability routes, not admin routes. The opaque high-entropy capability is stored hashed, expires/revokes, and authorizes only viewing a minimal payment summary and creating/retrieving one idempotent payment intent for the server-stored positive balance. It cannot edit order fields, quote, destination, adjustment, reason, payment mode, or fulfillment state, and cannot read full recipient/sender PII. No supplied order ID or amount is trusted. Persist and reuse one PI ID under a transaction/Stripe idempotency key. The Stripe intent metadata binds `orderId`, `quoteId`, quote version, destination and exact total. No live key is accepted for this admin-origin flow in staging.
- Existing confirm/webhook order processors remain the sole payment authority: verify captured PI identity, amount, currency, order ID, quote ID/version and destination, then record payment and advance to `paid_ready` or `review_only_held`. Webhook replay remains idempotent. Never fulfill an admin-origin order from link creation, client confirmation alone, a zero balance, or a public request. Supplier dispatch is an explicit later server action gated by verified payment and non-review staging policy.

`verifyAdminAuth(req)` is required on catalog, quote, order and payment-request creation; resolve audit actor with `getAuthenticatedAdminActor(req)`, never `actorEmail` from request JSON. Public capability routes do not grant admin rights. Store append-only audit events in a dedicated collection or the existing audited event mechanism; order snapshots are immutable after acceptance except for lifecycle/provider facts.

Suggested response shapes: quote is `{ quote: AdminCompQuoteSnapshot }`; accepted order is `{ orderId, origin: "ADMIN_COMP", lifecycleStatus, quote, paymentRequest: { status: "not_needed" | "review_only_held" | "payment_pending", requestId?, capabilityUrl?, expiresAt? } }`; payment-request creation is `{ requestId, status, amountCents, capabilityUrl?, expiresAt? }`; admin and capability status lookup returns `{ orderId, lifecycleStatus, paymentStatus, amountDueCents, paymentRequestStatus }`. The public status response contains no address or note fields.

## Order provenance and lifecycle

Add `origin: OrderOrigin` (legacy records without it mean customer checkout) and `adminCompQuote?: AdminCompQuoteSnapshot`; `isComp: true` only when an admin-origin order has zero customer balance, including a fully waived zero-total individual adjustment. A positive partial-adjustment order keeps `origin: "ADMIN_COMP"` and `isComp: false`, with paid amount and waived amount separated. Add an explicit ledger classification such as `admin_comp_balance` for a positive capture from an admin-origin order; do not misclassify it as an independent customer sale or as a wholly free comp. `projectPurchaseMeasurementForOrder`, metrics/cohort filters, ledger/reconciliation and reports must exclude all `origin === "ADMIN_COMP"` from independent customer conversion, even when the partial balance is paid in live production later.

In review-only staging, zero and positive balance orders are `review_only_held`; create no Stripe intent, supplier request, or email. A later explicitly authorized staging payment test may use Stripe test mode but retains the same supplier/email hold. No automated test may contact Stripe, Handwrytten, or email. Normal production comp fulfillment is outside this staging authorization; keep it feature-off/gated until a separate release decision.

## Smallest safe commerce spine and ownership proposal

Backend lane: add catalog/quote service and types, admin quote/order/payment-request APIs, restricted public payment-capability route, immutable order/audit persistence, order/payment/webhook integration, classification exclusions, and backend security/integration tests. Smallest required touchpoints: `lib/types.ts`, new `lib/admin-comp-pricing.ts` (or equivalent isolated service), `lib/financial-ledger.ts` / `lib/contracts/admin-overhaul.ts`, `lib/purchase-measurement.ts`, `lib/metrics-rollup.ts`, `lib/order-processor.ts`, `lib/stripe.ts`, replacement `app/api/admin/dispatch-comp/route.ts` or new versioned admin routes, and the existing confirm/webhook route handlers.

UI lane: `components/admin/StudioCompModal.tsx`, the existing caller pages only if needed for context/refresh, and a narrow public payment page for capability URLs if this is the selected payment UX. UI consumes the server catalog and returned quote; it never computes final price authority.

Acceptance tests should inject a fake catalog and use safe storage/Stripe/supplier/email adapters with deny-network assertions. Cover auth before data disclosure; exact actor/reason audit; current domestic and international totals; injected extra line; full and partial per-line adjustments; negative/fractional/excess/unknown item rejection; stale and cross-actor quotes; idempotent quote/order/payment request; zero-balance no-PI lifecycle; positive balance fixed-amount payment request; forged/tampered PI/order/quote/destination rejection; webhook-first/replay; no dispatch/email in review-only staging; and exclusion of both full and partially paid admin-origin records from customer purchase/conversion counts. Do not run fulfillment scripts or call real providers.

## Open design points for coordinator synthesis

1. Confirm the content context: current modal creates a new card, so preserve preset/custom cover composition rather than requiring an existing customer order. Prices still come exclusively from server catalog IDs.
2. Choose staging positive-balance behavior: safest initial review is a nonpayable held preview; if interactive payment needs a test-mode request, require an explicit staging flag, Stripe test key, and normal amount-bound webhook verification. Either path keeps supplier and email disabled.
3. Decide whether the payment request is an app capability URL with a server-created PaymentIntent on customer visit, or a hosted Stripe Checkout URL. Current code has PaymentIntent support, but no admin-comp payment-request contract; capability URL is the smallest spine and must be scoped strictly to one exact immutable balance.
4. Production comp dispatch, live balance collection, and email remain outside this staging authorization.
