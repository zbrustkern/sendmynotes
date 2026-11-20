# Sprint 0034 staging verification

## Review scope

The staging candidate starts at `6cd2f17bb00b7c8e030329d40569b80493d8c035`. Firebase App Hosting was serving that revision at 100% of staging traffic before the release. The checkout preserves the promotion and wedding work already on staging. Luna implemented tracking credentials, guest recovery and the order UI. SOL independently covered consent, access boundaries, hosted verification, and a read-only review of cleanup candidates.

## Founder cleanup inventory

A read-only check on November 19 found four unchanged, version-1 contacts associated with four tracker saves. Two streets matched their source orders exactly. One contained the tracker’s masked value. The fourth matched all seven compared address fields after whitespace normalization. Its retained order and request history showed no evidence of an intervening address correction or a deliberate contact save. Buyer identity remains unattributed on those source orders.

The founder’s five legacy entries map to five separate canonical migrated contacts. The migration marker records five contacts and zero occasions. None of the four candidates overlaps those legacy entries. No founder occasions or pending reminders were found. The proposed disposition is individually approved, version-checked soft deletion of the four canonical contacts. All four remain in production pending that decision. Order records and legacy addresses require no changes.

## Local acceptance

| Check | Result |
| --- | --- |
| Account access | Owner history and detail, explicit owner precedence, verified-email fallback, foreign-account isolation and history eligibility passed. The authenticated tracker uses the same ownership and eligibility checks as Card history. |
| Guest access | The real tracker API returned a restricted private projection for one order. Invalid, expired and cross-order credentials returned public status. The read-only credential was rejected by checkout and address mutation paths. Reopening a return ticket from separate browser contexts and refreshing the cleaned URL preserved private access. |
| Receipts and payment returns | Captured HTML and text receipts for single, batch and deferred orders contain a durable private link. Three simulated Stripe submissions reached their first-party ticket URLs. No wallet payment or customer email was sent. |
| Passive views | An actual mock admin login and the tracker API authorized a private browser view through polling and account changes. Public, receipt, legacy and admin revisits with stale checkout proof produced zero contact writes, payment confirmations, Google or Meta conversions, or Meta matching calls. |
| Submitted checkout | One synthetic eligible payment with order-bound proof queued exactly one Google Ads conversion, one GA4 purchase and one Meta purchase. Tests intercepted destination calls. |
| Intentional contact saves | A new checkout started unchecked. Consent cleared across account switches. A deliberately repeated save created one contact and linked occasion. |
| Checkout authority | Missing and incorrect checkout credentials were rejected before payment processing, including legacy tokenless free orders. The paid success responses omit the checkout secret. |

The local regression run used isolated mock data and network-denied server tests. Browser tests intercepted external requests. Firebase staging rollout and hosted results are recorded independently of local acceptance.


## Hosted acceptance

Firebase App Hosting build and rollout 019 served commit `ea792e72914bc9e0fb22518908ebd64860d5cb06` at 100% of staging traffic. The independent browser and API run passed 138 checks. It removed all 16 synthetic identities, orders and delivery documents it created. [Sanitized check results](hosted-acceptance.json)

- Both test senders could open their own eligible orders in Card history. A second account could neither list nor open another account’s explicitly owned single or batch order, even with a matching verified email. A verified email opened eligible guest orders with no owner UID. An unverified email match alone granted no access.
- A visitor with a bare reference received the allowlisted status payload and private cache headers. Public polling stopped. Private link holders could open their order in a clean browser, copy its link with storage blocked, or use a selectable fallback when clipboard access failed.
- The browser opened the links in captured HTML and text receipts from the deployed revision’s template. Fresh and repeated payment returns recovered private access and retained it on refresh. Invalid and expired tickets revealed only public information.

Staging disables advertising. The positive admin-session and purchase-tag checks used a synthetic local admin login, actual tracker and tag code, and intercepted destinations. No live wallet payment or supplier dispatch was part of acceptance. Production rollout and any repair of the four corroborated contacts require separate approval.

A wedding transfer page left open from the prior release may need a refresh to recognize the new private URL format. Previously issued checkout and deferred-address links continue to open. Earlier receipt messages that contain only an order ID cannot be retrofitted with a private link.


## Production release preparation

The founder approved releasing the address-book and tracker privacy fixes and reversibly hiding the four verified tracker saves. The production port starts from `3bb821c4a7f2b4bdbca21927e5a47f9b7c2398ae` and includes the privacy changes verified on staging. Existing production pricing and fulfillment paths use their production implementations. An old checkout tab that omits its checkout credential may need a refresh.

Six isolated browser suites passed on the production port, including active and passive purchase behavior, owner-bound address saving, private-link recovery, all three simulated Stripe returns, deferred addresses, and discounted checkout. The production build passed. The four production contact candidates were still version 1 at preflight, with five separate legacy contacts and no linked occasions or reminder occurrences.
