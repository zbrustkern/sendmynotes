# Intent: discount/payment binding hotfix

User requests an executable sprint plan and staging then production rollout once ready, preserving production payment acceptance. Canonical brief/specs read. No real payment, refund, email or supplier order is authorized as a test. No fulfillment script is permitted.

Confirmed source defect: Elements clientSecret is immutable but both forms reuse their provider after replacing a PaymentIntent. Discount handlers publish success before checkout initialization and swallow initialization failures. Production base origin/main b831eb0; staging 7f6e3e5 contains unrelated admin overhaul. Isolate the hotfix from production base; never merge staging wholesale into main. Current workspace has unrelated founder changes; preserve them.

Acceptance: undiscounted $9 checkout unchanged; fixed/percent/change/remove/free codes bind displayed total and active intent; no confirmation during repricing or after repricing failure; errors/retries recover; URL/resume do not jump to payment prematurely; test mode and server-calculated amounts/verification unchanged; staging evidence then production-only patch rollout with recorded rollback revision. Exact live founder transaction has not been reconciled.

App lanes: Codex has repository/CLI access. No verified Antigravity execution interface selected; single-app plan/self-review, alternate-review handoff retained. Production deploy authorized by current user only for this scoped fix after gates.
