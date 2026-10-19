# Luna implementation review

Date: October 19, 2026

## Scope

Implemented and reviewed the scoped discount/payment fix on production-based branch `codex/discount-payment-fix` from `origin/main` (`b831eb0`), then ported it to staging-based branch `codex/discount-payment-staging` from `origin/staging` (`7f6e3e5`). No commits or deployments were made.

Changed only these five source files in each execution checkout:

- `app/preview/entry/client.tsx`
- `components/CheckoutStep.tsx`
- `components/VendingMachineBuilder.tsx`
- `components/v3/Step4ReviewAndPayment.tsx`
- `components/v3/TargetPurchaseExperience.tsx`

## Review findings and repairs

- Stripe Elements now remounts when its client secret changes. Checkout replacement masks payment controls until the new intent succeeds; errors expose a retry action.
- Discount and checkout requests use synchronous refs to reject overlapping actions. Initial checkout cannot race an active pre-pay code validation; only the explicit validated apply/remove operation can initialize during that lock.
- Accepted discount state and displayed totals update only after checkout initialization succeeds and the server amount matches the validated amount. Zero is preserved with nullish fallbacks.
- Card, wallet, promo, removal, and navigation handlers guard against same-tick interaction during payment or repricing. Payment entry points are disabled while repricing is pending.
- Production draft resume reads `draft.discountCode`, validates it before intent creation, and commits the returned terms only after the server amount matches. Definitive invalid responses clear the saved code; transport, malformed-response, and server failures retain it for retry.
- Staging preserves its `appliedOffer` metadata and telemetry. Replacing or removing an accepted offer releases the previous order reservation only after the replacement checkout initializes successfully.
- Auto-resume observes restored discount changes and stops after a free order has an order ID, preventing repeated free-order initialization.

## Validation

- `git diff --check` passed in both execution checkouts.
- Staging and production `./node_modules/.bin/tsc --noEmit --pretty false` both passed with exit code 0 after the test lane corrected its fetch stub. The staging checkout uses a `node_modules` symlink to the original project's installed dependencies.
- The installed `@stripe/react-stripe-js` source confirms `useStripe` and `useElements` throw when no Elements provider exists. Both wrappers now provide an Elements context with `stripe={null}` for free, mock, or unavailable-provider fallbacks, while paid providers remain keyed by client secret.
- The isolated Playwright parent-flow harness `tests/payment-checkout-parent.test.mjs` passed against both production and staging source roots. It verified failed repricing remains uncommitted and visible, restored free-code validation precedes exactly one intent, and pre-pay URL code validation does not create an intent.
- I did not run provider calls or fulfillment scripts. The coordinator owns final build and release gates; the test agent owns the mounted payment-component regression suite.
- No provider configuration, server code, environment files, customer data, or staging admin/server files were changed by this implementation.
