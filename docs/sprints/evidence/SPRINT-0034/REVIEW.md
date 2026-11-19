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
