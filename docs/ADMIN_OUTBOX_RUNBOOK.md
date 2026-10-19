# Admin outbox runbook

The authenticated reconciliation endpoint supports `drain_analytics` only. It writes idempotent, PII-minimized records to `analytics_order_projections` and retries failures through the durable outbox lease/backoff state.

`transactional_email`, `email_receipt`, `fulfillment_dispatch`, `fulfillment_submission`, and `reconciliation_check` have no registered production outbox handlers. They must remain pending/retryable or be surfaced for manual reconciliation; do not use a generic drain, replay, or lease-reset operation for these topics. Existing email and supplier work remains synchronous at its current call sites and is not made asynchronous by the outbox. An uncertain supplier submission requires provider lookup/operator evidence before any retry; never resubmit based only on lease expiry.
