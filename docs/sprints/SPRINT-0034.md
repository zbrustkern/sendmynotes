# Sprint 0034 — Private order tracking and address-book repair

**Planned November 19, 2026.** Release to staging for verification. Production rollout and founder-account cleanup are separate approval decisions. The November 19 incident identified unintended contact saves during order review. The initial patch removes those writes and restricts the public response. This sprint completes sender access and closes the gaps found in review. [Incident RCA](../ADDRESS_BOOK_PRIVACY_RCA_2026-11-19.md)

## Pyramid Index

- **L0.** A sender can reopen their order, and viewing it never adds a contact or reports a new purchase.
- **L1.** Preserve account history, give guests a durable private link, isolate purchase reporting from passive views, and repair only corroborated contacts.
- **L2.** [Access contract](#order-access-contract) · [Implementation](#implementation) · [Acceptance](#release-acceptance) · [Cleanup](#founder-address-book-cleanup).

## Order access contract

| Viewer | How they reopen the order | What they see |
| --- | --- | --- |
| Signed-in sender | **My Account → Card history → Order**. From the public tracker, offer the corresponding history detail page through sign-in. | Existing eligible paid-order details, including multi-send deliveries. An explicit order owner UID takes precedence. For an order with no owner UID, retain the existing verified matching receipt-email rule. |
| Guest who provided email | **View my order** in the standard receipt, or **Copy private order link** at confirmation or on the private tracker. | Private details for that one order, even in a fresh browser. Preserve the separate address-completion action on deferred orders. |
| Guest who omitted email | Copy the private link at confirmation or on the private tracker. Offer a selectable link if clipboard access fails. Explain that anyone holding it can view the order and that this is how the guest can return. | The same private order view. A guest who loses every copy and has no linked identity can still see public status with the order reference. |
| Visitor with only an order reference | Open the bare tracker URL. | Safe customer-facing status and a route to account history. A foreign or unverified account cannot obtain private details by entering an email or ZIP. |
| Authorized admin | Open a tracker from the admin order list or proof inspector. | Operational order detail. Opening, refreshing, or polling this view produces no contact save, payment confirmation, or browser purchase event. |

## Implementation

### 1. Eliminate passive side effects and duplicate saves

- Keep the tracker’s automatic contact write removed. In the legacy builder, start saving unchecked, clear consent across sign-out or UID changes (including A → B → A), and bind an explicit save to the initiating account and recipient. Reuse a stable idempotency key for that save across checkout retries. Cover any linked occasion created by the same action. Preserve the current builder’s explicit save button.
- Gate the tracker’s Meta Purchase call, including advanced matching, on the same order-specific active checkout proof used for Google Purchase and payment confirmation. Preserve existing purchase eligibility, consent handling, and deduplication. Receipt access, Firebase sign-in, and an admin cookie each authorize a different action from actively submitting checkout. Check restored confirmations in `Step5Confirmation` for the same passive-view path.
- Keep an authorized active checkout able to reconcile a pending payment and report an eligible purchase once. A storage-free guest return must still show the order when browser purchase proof is absent. Authoritative payment processing remains server-side.

### 2. Make private links durable and keep public status useful

- Introduce an order-scoped, read-only credential for durable links. The existing checkout token can also complete a deferred address. A response to the new read-only credential must omit that token, address-completion links carrying it, payment secrets, and other credentials. Preserve valid existing checkout and deferred-address links. Compare secrets in constant time, handling absent or unequal-length inputs safely.
- Require the order’s checkout credential before paid or free checkout confirmation performs work. Exercise rejection of missing, expired, wrong-order and read-only proof before any payment or supplier operation. Paid confirmation responses omit checkout credentials.
- Build links in one place. Add **View my order** to both HTML and text in the active standard transactional receipt, including batch receipts. Add **Copy private order link** to single-card and batch confirmations and the private tracker, including omitted-email checkout. Keep deferred-address completion visibly distinct. Offer the copy action only with authority for that order. Existing receipt emails cannot be retroactively updated.
- Keep private link credentials out of analytics, referrers, and request logs. A URL fragment exchanged via an authorization header is one option for guest links. Capture the credential before removing it from the displayed URL and keep it usable in memory when storage is blocked. Copy must reconstruct the private link after URL cleanup. Use an explicit private-link action wherever copying the address bar would give only public status.
- Carry an order-bound return credential through all three Stripe `return_url` call sites in the legacy and current payment forms. Use a first-party return endpoint with a short-lived opaque ticket that restores read-only order access. Handle refresh and duplicate callbacks safely. Test the return in a fresh browser context with no original session storage. A payment return must never by itself mark an order paid.
- Keep the public API allowlist for `id`, `status`, optional `origin`, and optional redacted multi-send summary (quantity and empty deliveries). Retain private/no-store caching and the retired unlock’s `403`. Render a safe label for the returned status, including pending payment, address needed, processing, mailed, and an appropriate unknown-state fallback. Stop automatic polling after a redacted response. Use one public rendering path for single and multi-send trackers.

**Primary implementation files.** Tracker API and page under `app/api/orders/[id]` and `app/order/[id]`, account history routes and `lib/account/history.ts`, `components/VendingMachineBuilder.tsx`, `context/AuthContext.tsx`, `components/CheckoutStep.tsx`, `components/v3/Step4ReviewAndPayment.tsx`, `components/v3/Step5Confirmation.tsx`, `components/multi-send/MultiSendOrderStatus.tsx`, and `lib/email/transactional.ts`. Verify receipt call sites import the edited template.

## Release acceptance

| Check | Required evidence |
| --- | --- |
| Account ownership | With synthetic accounts A and B, A opens its own order from history and the tracker handoff. B cannot list or open A’s private detail. An unverified email match alone grants no access. A verified email can open an eligible guest order only when it has no explicit owner. Cover both single and multi-send orders. |
| Guest recovery | Render the standard receipt in HTML and text. Open its private link in a clean browser and verify the expected order. Repeat from copied confirmation links for email-omitted and batch guests, after URL scrubbing and with storage blocked. Check existing private links and deferred-address completion independently. The read-only credential and its response confer no write authority. |
| Payment return | Exercise the legacy card form and both current payment return paths with a simulated Stripe redirect, storage cleared, repeated callback, and invalid or expired ticket. The legitimate buyer regains private access. A bare reference exposes only public status. Record simulated redirect coverage separately from any real wallet verification. |
| Passive views and active purchase | Replace the browser test’s no-op Meta mock with a recording spy, and observe the pixel/advanced-matching boundary with synthetic data. Admin opens, guest receipt revisits, polling, and account changes produce zero contact writes, confirmations, Meta/Google purchase calls, or matching-data submissions. A synthetic active checkout with valid proof still reports one eligible event per destination across repeated renders. |
| Public view | Assert exact allowed keys and values, including comp origin and batch quantity. Check the displayed status and private cache headers. Advance the browser clock beyond multiple poll intervals and verify no further requests. An invalid credential, email, or ZIP reveals no additional fields. |
| Intentional saving | Verify unchecked default and UID transitions. One deliberate save creates one contact in the initiating book. Retry the same checkout and confirm contact and occasion counts stay stable. A subsequent distinct recipient save still succeeds. |

Extend the account history, account-route, multi-send presentation, legacy builder, receipt, payment-return, and tracker browser tests. Run TypeScript and a production build from a clean checkout. The earlier passing tests cover the initial patch only. Staging acceptance uses synthetic fixtures and captured test mail. Use no live fulfillment or customer email as a test.

## Founder address-book cleanup

1. Produce a read-only inventory of the four candidates. Reconcile all five founder legacy entries with canonical contacts, migration markers, contact versions, linked occasions, and pending reminders. Two candidates have exact source streets and one has the tracker mask. For the fourth, check for a later address correction or deferral and any independent evidence of deliberate saving. The legacy checkout used the same contact label. Keep ambiguous or recently edited records on hold.
2. Present the proposed disposition of each candidate privately for approval. Record aggregate counts in the sprint evidence. Preserve a restricted pre-change snapshot sufficient to reverse approved changes. Keep order and fulfillment addresses intact.
3. Use the existing owner-scoped `deleteContact` behavior with an expected version. Set deletion timestamps, increment contact and linked occasion versions, disable the associated reminders, and run `cancelStaleOccurrences`. Verify cancellation completed even if a previous attempt stopped after the transaction. Check that migration cannot repopulate hidden entries. Any necessary change to the legacy array requires its own identified match and inclusion in the approved scope.
4. Verify the founder’s visible book, other accounts’ isolation, reminder state, and order history. Record counts hidden, held, and restored if applicable. An inconclusive fourth candidate may remain on hold when the code fix ships.

## Release and rollback

Build the release from a clean checkout of the intended base. Review the exact diff and commit list for the tested revision. Carry only approved privacy and order-access work. The unrelated Sprint 0033 ledger edit, wedding files, ad assets, and workspace changes belong to their own releases. Verify the access matrix on staging before seeking production approval. After rollout, verify the deployed revision and the public, owner, guest, and admin paths using controlled fixtures. If a guest-return path fails, pause rollout or repair that path while keeping the tracker auto-save and email-or-ZIP unlock disabled. Cleanup is separately reversible.
