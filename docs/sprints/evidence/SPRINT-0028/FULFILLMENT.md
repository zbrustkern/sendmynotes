# Sprint 0028 fulfillment and recovery evidence

## Implemented locally

- `processPaidOrder` treats a frozen multi-send parent as a paid batch, verifies PaymentIntent content revision and item count, records the Stripe payment mode, and queues the parent without invoking the singular provider flow.
- `POST /api/cron/multi-send-dispatch` is an authenticated, bounded worker (`MULTI_SEND_WORKER_SECRET`). It scans up to 25 rows per eligible status, sorts the bounded union by update time, and processes at most one batch per run so a busy queue state cannot starve older partial/checking work. Ineligible payment captures and operational/environment pauses become explicit `MULTI_SEND_HELD` states, so they leave the active queue rather than repeatedly occupying its first slot. The real `feature_flags.flags.multiSendEnabled` setting gates new checkout acceptance; already paid batches remain eligible for recovery when that flag is off.
- `lib/multi-send/orders.ts` creates one prepared shared custom card, then transactionally materializes every immutable child at `orders/{parentId}/deliveries/{recipientId}` before dispatch. Each child uses its frozen full message and address. The payload builder preserves that message exactly.
- Child dispatch requires a live Stripe capture fact whose PaymentIntent, order, USD currency, amount, parent quote and sum of child allocations match. Claims carry a state version and attempt ID. Results and stale-attempt holds are compare-and-set updates; accepted and unknown outcomes never get resent. A thrown request becomes uncertain, while unrelated pending siblings can still progress. The global service lease is checked and renewed before each child submission; loss of lease stops further submissions. Supplier 401/403 or missing credentials pauses fulfillment globally and stops sibling dispatch.
- A Handwrytten webhook and authenticated admin status sync update only a matching child with a recorded supplier ID. Only exact known mailed status values advance a child to `MAILED`; unknown values remain accepted/checking. An uncertain child with no supplier ID stays held for manual provider investigation.
- Legacy free-order, deferred-address, singular admin retry/correction, status sync and proof paths reject batch parents before singular side effects. Customer receipt email remains one per parent and describes quantity without listing all addresses or messages.
- Admin correction is limited to a known rejected child, requires actor, reason, version, idempotency key and explicit billable-dispatch consent, and stores the correction separately from the purchased snapshot. Correcting a child also transitions the parent from complete to partial/queued so the corrected delivery can be picked up. Refund reservation is per child and is bounded by the verified parent capture and child allocation. Refund facts link to Stripe IDs; ambiguous/no-ID results remain reserved and use read-only lookup by payment intent and child metadata. Reconciliation validates USD/live mode and uses a state-version transaction before persisting the matched refund ID and state.
- Held parents can be re-entered only through authenticated `POST /api/admin/multi-send/resume` with `{orderId, reason, idempotencyKey}`; actor is taken from admin auth. Resume revalidates the live USD capture and frozen allocations, requires the global fulfillment pause to be cleared and live supplier safeguards to be satisfied, and records a private idempotent admin action. It preserves all child states, queues only existing `PENDING` work, and allows pending siblings to continue while another child remains uncertain. `preparing` or `uncertain` shared-card preparation is a hard hold: resume never recreates the artifact automatically.
- Batch Handwrytten webhook status updates require a configured `HANDWRYTTEN_WEBHOOK_SECRET`; absent configuration fails closed for batch child matches while preserving legacy single-order webhook behavior. Child lookup uses the collection-group `deliveries.supplierOrderId` index.
- Firestore client rules already deny all direct access. Added the `orders.fulfillmentStatus + updatedAt` worker query index.

## Local verification

Ran through the network-denying local runner:

```text
python /private/tmp/smn28-tests.py \
  tests/multi-send-payment-pipeline.test.ts \
  tests/multi-send-fulfillment.test.ts \
  tests/multi-send-webhook.test.ts \
  tests/ordinary-quote-dispatch-safety.test.ts \
  tests/handwrytten-sync.test.ts \
  tests/free-order-safety.test.ts
```

All passed. The payment-pipeline test uses a synthetic verified PaymentIntent and fake signed webhook seam to prove capture recording, durable queueing while the actual checkout feature flag is off, three inherited/custom/blank greeting message snapshots, one capture fact across confirmation plus webhook replay, and preservation of progressed parent/child status. The fulfillment test uses injected fake preparation, dispatch, refund and reconciliation adapters and covers lost, thrown and systemic provider outcomes, preparation retry fencing, concurrent worker fencing, late result fencing, capture mismatch being held out of the queue, correcting a previously completed parent's rejected child, pause/resume while preserving uncertain and pending children, concurrent refund reservation, mismatched refund evidence, and read-only no-ID refund lookup with currency/mode validation and persisted refund ID. The webhook test covers missing-secret fail-closed batch handling, invalid token rejection, strict mailed mapping, and legacy fallback. No provider, Stripe, mail or customer traffic was sent.

## Remaining operational limits

- No live provider or Stripe test was run. Local fake-provider success does not establish supplier idempotency, artifact reuse policy, billing behavior or message acceptance.
- A supplier submission with no recorded ID cannot currently be reconciled automatically through the supported provider API call. Its child remains `DISPATCH_UNCERTAIN`; operator investigation must establish provider disposition before correction or resend.
- A refund with no returned refund ID is held. The admin read-only reconciliation checks provider refunds for the exact PaymentIntent and child metadata; if no match is visible, it remains unresolved and is never resubmitted automatically.
- Environment, capture-integrity, and operational-control holds require an operator or configuration correction before re-entry into the active queue. Supplier authentication failure pauses fulfillment globally; an operator must verify credentials/provider access and resume the operational control.
- After resolving a hold and clearing the operational fulfillment pause, an authenticated admin must call `POST /api/admin/multi-send/resume` with an actor-authenticated request and unique idempotency key. Resume is not available for an uncertain shared-card preparation; that requires manual provider/artifact investigation.
- The worker route is implemented but no scheduler/secret deployment is configured or exercised here. Deployment must provide `MULTI_SEND_WORKER_SECRET`, a recurring trigger, the new index and alerting for backlog age. Feature activation remains a separate release decision.
- No admin drawer interaction, production browser behavior, deployment, or live fulfillment evidence is claimed in this file.
