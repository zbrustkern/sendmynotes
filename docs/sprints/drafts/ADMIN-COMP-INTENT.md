# Admin complimentary orders — execution intent

The founder approved the interactive admin mockup and requested Luna agents to execute in sprints and deploy staging for testing/review. This authorizes implementation and staging deployment. Production release, live payments, emails and billable fulfillment are not included.

## Approved behavior
- Existing admin-only domestic fully complimentary cards remain available; extend to eligible international destinations and future catalog add-ons.
- Fully complimentary covers every current order item. Individual adjustments can waive integer-cent amounts per eligible line; remaining balance must be collected before dispatch.
- Server-authoritative, versioned line-item quote with trusted catalog IDs/prices, immutable accepted order snapshot, required reason, durable actor/time audit; reject client prices, excessive/negative/fractional adjustments, stale quotes and unsupported destinations.
- Public discounts stay distinct, retain current domestic $9 copy and international $5 surcharge. No example add-on is shipped as a purchasable product; extensibility proven with injected test catalog.
- Admin access is server enforced. Full comp is recorded separately from customer sale; all admin-created tests/comps are excluded from independent conversion measurement. Supplier charges remain real/unknown.
- Personal US sender return address is required; no hardcoded studio return address.
- Staging may support a clearly labelled side-effect-free preview or held test order. Keep review-only guards, Handwrytten test mode, and suppression of payment/email/fulfillment as appropriate. No staging action may physically dispatch.
- Preserve existing payment amount/metadata binding, webhook idempotency, receipt authorization and Google attribution fixes. Positive balances need an admin-generated payment request/checkout flow with server-owned immutable quote and fulfillment only after verified payment. Never grant public clients admin pricing authority.
- Match approved mockup: contained modal, Full comp / Individual adjustments, item/price/comp columns, total/customer-pays, reason, review, clear pending payment or held staging state. Accessible, mobile usable, honest outcomes and retry handling.

## Orientation
Isolated candidate /private/tmp/sendmynotes-admin-comp-20261026 from current staging 0a4d08205b8077303fe88fd578ecd0397f94b3ab; main baseline 0ebfd958c6854623abab177ebeab2754c242f20c. Dirty original checkout and attached earlier international worktree must remain untouched.
Recent sprints: 0013 international preview is staged; 0014 discount links/artwork planned in another thread; 0015 Google purchase attribution released. Another active thread is planning reporting accuracy; coordinator is reserving 0017 and 0018 for this task and coordinating IDs. No semantic index or chapter configured. Canonical October 11 brief is historical baseline; later founder reported one external sale.

## Execution model / workflow
Resolver main=inherit; explicit founder Luna request overrides default Claude/Astra lanes. Native existing Luna workers do independent drafts, peer critique, implementation and independent release review. Luna CLI authentication preflight passed. Approved mockup and explicit execute request supply design/permission decisions; do not re-interview or wait for duplicate approval. Coordinator integrates plans and owns release/ledger/shared files.

## Planning lanes
Backend and UI independently draft short architecture/acceptance plans, then cross-critique. Auditor independently checks security/payment/staging risks. Coordinator synthesizes two sprints: 0017 pricing/admin order lifecycle foundation; 0018 UI/integration/review/staging. Shared API contract must be agreed before parallel edits. Each agent owns disjoint files. No production or remote provider calls in tests; use mocked network/storage with deny-network assertions.

## Design reference
/Users/zeke/.codex/visualizations/2026/10/23/01a16997-2350-7320-a44e-a38b9391f002/admin-complimentary-order.html
