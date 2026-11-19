# Recipient addresses copied into the founder’s address book

**November 19, 2026 · Open.** Production logs show four successful contact saves from four tracker pages. All four correlate with unedited entries in the founder’s book. Two streets matched the source exactly, one contained the tracker mask, and a subsequent read-only check resolved the fourth match after whitespace normalization. The investigation found no evidence that another account received those contacts. The initial local patch passed its original checks. Guest recovery, passive purchase tracking, and cleanup have additional release criteria in [Sprint 0034](sprints/SPRINT-0034.md).

## Root cause

The admin dashboard opens the same single-card tracker that customers use. When a signed-in viewer opened an order, or signed in while viewing one, the page automatically called the address-book save function with the recipient details on screen. It never asked the viewer to save the recipient or checked whether the viewer had placed the order.

The address-book API authenticated that request and filed the contact under the viewer’s account. This explains how reviewing an order with admin access could put its recipient in the founder’s personal address book. It also explains why account-isolation tests passed. Those tests checked who could read a saved contact. They missed the earlier step where viewing an order created the contact in the first place.

One saved entry contained the tracker’s masked street placeholder. A signed-in viewer could receive a redacted order, and the placeholder still satisfied the page’s check for a nonempty street. That explains how even a redacted view could create a contact.

## Production evidence and limits

| Question | Finding |
| --- | --- |
| Who had an account? | Three registered accounts, including the founder. One of the other two used the project’s second admin address. |
| Who had saved recipients? | All nine active address-book contacts belonged to the founder. Eight had a populated street field, including one masked value. The founder also had five entries in the legacy saved-address array. All five map to separate migrated records and none overlaps the four tracker candidates. The other two accounts had zero saved recipients in both stores. |
| How strong is the evidence for each contact? | Each tracker save correlated with one unedited contact by creation time and label. Two streets matched their source orders and one contained the tracker mask. On the initial exact comparison the fourth street match was inconclusive. The follow-up check matched all seven compared address fields after normalizing whitespace. Legacy checkout used the same automatic label. The four source orders lacked a buyer account ID or email that could establish who placed them. |
| Could someone read another account’s book? | The account API scopes contact reads to the authenticated user. Deployed Firestore rules deny direct browser reads and writes. The available logs cannot identify every past viewer or rule out all historical exposure. |

## Separate finding on tracker privacy

The single-card tracker also allowed a visitor with the order link to reveal private order details using the buyer’s email address or the delivery ZIP. Even before unlocking, the public response retained some personal information, including names and location fields. The production request logs reviewed from October 20 through the November 19 audit showed zero requests to the email-or-ZIP unlock endpoint. Ordinary tracker views use a different request, and their audience remains unknown.

Code review also found that a passive admin visit to an eligible customer order can call Meta Purchase and supply the buyer’s email, sender name, and recipient locality to the browser pixel. The existing tracker browser test stubbed that call. Actual transmission during the four visits remains unverified.

Review of the staging release also found that the separate checkout confirmation handler could process an order reference and return the checkout credential. A zero-cost checkout with a missing legacy credential also lacked a reliable authorization check. The staging changes require matching order-specific checkout credentials before payment, receipt or fulfillment processing. Both payment confirmation response paths omit the checkout credential. This finding comes from source review. Historical use of these paths to obtain someone else’s details remains unverified.

## Proposed resolution

1. **Make passive viewing read-only.** The local patch removes the automatic contact write. Complete the checkout-proof check for Meta, verify account switches, and make deliberate saves safe to retry.
2. **Preserve access to the sender’s own orders.** Signed-in senders already have authenticated card history. For guests, add a read-only private link to standard receipts and a saveable link at confirmation, including for guests who omit email. Support payment returns after browser storage is lost. Today a copied address-bar URL can lose its token, standard receipts contain only the order ID, and payment returns depend on browser storage. Show safe public status when private access is unavailable and stop automatic polling there. Keep email-or-ZIP unlocking retired in the release candidate.
3. **Repair only verified records.** The read-only reconciliation found four unchanged version-1 candidates, no overlap with the five legacy entries, and no linked occasions or pending reminders. Review the three street matches and the masked entry individually before any approved cleanup. Any approved cleanup must account for linked dates, versioned soft deletion, and pending reminder cancellation.

The production build and TypeScript check passed locally. Browser tests covered opening a tracker, polling, signing out, and signing in as another user. Account and tracker tests covered contact isolation, public redaction, denial of the retired unlock, and private checkout-link access.

**Closure criteria.** Pass the sprint’s owner, guest, public, and admin access checks using synthetic records. Verify the deployed fix and record cleanup disposition per candidate. An unresolved candidate stays on hold. Production release and data changes each require approval.
