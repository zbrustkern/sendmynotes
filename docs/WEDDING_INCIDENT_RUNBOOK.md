# Wedding Thank-You Portal — Operator Incident Runbook

**Primary Operator:** Zeke (`zeke@sendmynotes.com`)  
**Production Dispatch Mode:** `WEDDING_DISPATCH_MODE="auto"` (fenced per-envelope Handwrytten dispatch)

---

## Important Distinction: Stopping New Sales vs Pausing Active Dispatch

- Setting `WEDDING_CHECKOUT_ENABLED="false"` in `apphosting.yaml` **only stops new purchases**. Already-paid wedding batches continue dispatching automatically unless dispatch itself is paused.
- To immediately halt fulfillment of already-paid pending envelopes, use the **Pause Dispatch** control in `/admin` (Wedding Batches panel) or set `WEDDING_DISPATCH_MODE="manual_release"`.

---

## Incident Playbook

### 1. Partial Batch Failure or Systemic Supplier Error
1. **Pause active dispatch:** Open `/admin` → Wedding Batches and click **Pause Dispatch** on the affected batch (or globally pause wedding dispatch) so remaining `PENDING` envelopes do not keep retrying into a supplier outage.
2. **Inspect per-envelope states:** Review each household envelope inside `/admin`:
   - `ACCEPTED` / `MAILED`: Already submitted to Handwrytten with a supplier order ID — **never resubmit**.
   - `PENDING`: Not yet sent to Handwrytten; safe to release later once the supplier or address issue is resolved.
   - `REJECTED`: Handwrytten rejected the address/payload; fix the address with the buyer or issue a partial refund for that card.
   - `DISPATCH_UNCERTAIN` / `DISPATCHING`: Supplier response timed out or failed ambiguously — **do not blindly resend**.
3. **Contact the buyer (`zeke@sendmynotes.com`):** Notify the buyer email recorded on the batch with the exact count of cards accepted/mailed vs paused, and provide their project recovery link so they can view live per-card status.

### 2. Uncertain Supplier Outcome (`DISPATCH_UNCERTAIN`)
1. Check Handwrytten’s dashboard/orders using the batch’s deterministic client reference / recipient name & date to verify whether Handwrytten actually created the card.
2. **If Handwrytten accepted it:** Record the confirmed supplier order ID via the admin reconciliation control so the envelope transitions to `ACCEPTED` without duplicate mailing.
3. **If Handwrytten has no record of it:** Re-queue only that envelope once confirmed absent, or refund that single envelope.

### 3. Single-Card or Partial-Batch Refund
1. Use the signed admin refund endpoint (`POST /api/admin/wedding/refund` or the `/admin` Wedding Batches refund control) with a deterministic `idempotencyKey`.
2. Verify the refunded envelope moves to `REFUNDED` while all other accepted/pending envelopes and purchased tier ordinals remain intact.
3. Confirm Stripe issued the exact frozen line amount (including any $5 international surcharge on an international envelope) and notify the buyer.

---

## Production Cron Authentication Map

| Job | Endpoint | Auth Mechanism |
| :--- | :--- | :--- |
| Wedding payment/dispatch reconciler | `POST /api/cron/wedding-reconcile` | OIDC (`wedding-reconciler@sendmynotes-2a417.iam.gserviceaccount.com`) |
| Wedding draft & artwork cleanup | `POST /api/cron/wedding-cleanup` | Shared header/bearer secret (`UPLOAD_CLEANUP_SECRET`) |
| Shared upload + wedding daily cleanup | `POST /api/cron/upload-cleanup` | Shared header/bearer secret (`UPLOAD_CLEANUP_SECRET`) |
