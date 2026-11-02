# Coordinator review notes

## Baseline
Fresh remote staging0a4d082 and main0ebfd95. Independent read-only hosting snapshot confirms both READY/100%; staging review/supplier flags true. Related reporting chat reserves0016, docs-only, no concurrent deployment; this work owns0017/18.

Network-denied isolated-cwd tests passed: international-pricing, international-checkout.integration, google-purchase-measurement. Initial transaction-security had one pre-existing stale expectation (missing untrusted PI ID should leave PENDING_PAYMENT unchanged); independent reviewer corrected it and all10 pass. These baseline runs precede final integration and are not final release acceptance.

## Design/code review fixes requested
- Public private quote DTO must not contain reason/actor; UI quoteFresh must use local fingerprint instead of missing reason property. Persist internal note rather than showing unsaved details.
- Deterministic quote math over injected trusted catalog; one shared base/surcharge config, no fake deployed add-on.
- Idempotent accepted-order recovery before quote expiration/catalog checks; explicit malformed recipient country rejected; all required PI metadata checked including missingfields.
- Admin origin for full and partial orders; zero/nonzero classification honest; browser+server Meta and Google purchase suppression.
- Complete sender/recipient review addresses; plain handwriting labels, no implementation jargon; greeting accurately described as pen-written in supplier payload.
- Private payment capability path cannot enter marketing/PageView/attribution; no-referrer/noindex/no-store. Avoid global root headers() dynamic-rendering regression.
- Existing fullcomp dispatch outside review mode retains lock/gates; legacy endpoint cannot bypass audit/reason/idempotency; international activation gate unchanged.
- Fixed balance payment UI must match amountCents/status DTO, handle missing key/secret, failed promises and pending webhook status.

## First mounted CUA pass
Actual modal at localhost4173 with fictional Alex/Sam Example addresses and no external network. Full UK comp14->0 rendered, individual waiver9->5 rendered and review reached. First fixture had no Tailwind CSS and brokenimages; requested accurate styled fixture. Initial fixture /orders returned a hardcoded fullcomp quote even for partialreview; resultsemantic validation not counted and fix requested. No hosted order or provider action performed by these checks.

## Final integration review
The styled actual-component fixture confirmed $14 → $0 and $14 less $9 → $5; accepted partial held result preserved $5. Complete addresses and reason appeared in review. At390px the page had no overflow and last-button Tab wrapped to modal close. Catalog401 disabled continuation. Hosted staging admin requires Google sign-in, so no hosted authenticated action was attempted.

Additional fixes: immutable positive-order holds stop before PI retrieval/capture/request mutation; zero-order hold validation precedes operational pause. Public receipt sanitizer preserves non-sensitive origin so partial ADMIN_COMP orders remain excluded from browser purchases, with actual GET-route regression. Independent audit cleared these final fixes.
