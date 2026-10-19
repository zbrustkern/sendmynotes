# Google-only admin authentication repair

The staging deployment was current; the inherited login screen still exposed the old passphrase form. Google sign-in failed because the staging Firebase browser key allowed only unrelated Docketstamp referrers. Firebase's authorized-domain list already included staging and Google was enabled.

Removed the form, server passphrase exchange, shared-key API shortcut, legacy order-detail shared-key reveal, and unused passphrase lockout module. New sessions require a verified Google provider identity and an allowed administrator email. A versioned account-bound signature invalidates every older session. Production mock identity acceptance now fails closed even if storage initialization falls back to mock mode.

Added only the exact staging hosted origin and its existing Firebase OAuth handler origin to the staging key's allowed referrers, preserving existing website and API restrictions. Read-only Firebase project-config probes return 200 for both required origins and 403 for an unrelated origin. No OAuth client secret, browser key value, session signing value or user ID token is recorded in evidence.

Isolated checks: 14 scoped suites pass; dedicated Google-only regression passes; security remediation suite passes 39/39; feature flag suite passes with account-bound cookies. The legacy free-order security fixture was updated to include checkout's required authoritative quote/reservation rather than bypassing that binding. TypeScript passes. The optimized staging build passes. Redeployment is in progress. Real signed-in browser completion remains a separate check, requiring the administrator's Google account.

Staging's review-only transaction/email/physical-fulfillment guards are preserved. Production configuration is unchanged.
