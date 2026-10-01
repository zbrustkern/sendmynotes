# Software Factory: Master Task & Milestone Tracker

> **Usage**: This file serves as the single source of truth for execution. You can check this file into git, check off items as they complete, and track progress across both Operator (Cloud/Infra) and Agent (AI Engineering) tracks.

---

## Progress Summary Table

| Sprint | Phase | Operator Tasks | Agent Tasks | Target Milestone | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sprint 0** | **Infra, Provisioning & Clean Clone** | 6 Tasks | 4 Tasks | Isolated v2 Cloud & Repo Live | `[ ] In Progress` |
| **Sprint 1** | **Decoupling & Dynamic Flow Engine** | 2 Tasks | 6 Tasks | Headless Universal Vending Machine | `[ ] Pending` |
| **Sprint 2** | **Multi-Tenancy & Multi-Brand Theming** | 2 Tasks | 4 Tasks | Multi-Domain Routing & Colophons | `[ ] Pending` |
| **Sprint 3** | **Pluggable Fulfillment Bus (Printful/Lob)** | 3 Tasks | 6 Tasks | 3 Pluggable Fulfillment Providers | `[ ] Pending` |
| **Sprint 4** | **Direct Ad API Trading Desk** | 4 Tasks | 4 Tasks | Google Ads API & Stop-Loss Desk | `[ ] Pending` |
| **Sprint 5** | **Staged Autonomy & Final Cutover** | 2 Tasks | 4 Tasks | 1-Click Launch & Production Cutover | `[ ] Pending` |
| **TOTAL** | **Full Platform Rollout** | **19 Tasks** | **28 Tasks** | **Autonomous Software Factory** | `0 / 47 Complete` |

---

## Detailed Task Checklist

### Sprint 0: Foundation, Infra Provisioning & Clean Clone (Days 1–3)

#### 🧑‍💻 Operator Track
- [ ] **Task `S0-OP-01`**: Create new GitHub repository `sendmynotes-v2` or `micro-commerce-factory`.
  - *Deliverable*: Empty remote repository URL with branch protection rules.
  - *Verification*: `git remote -v` successfully points to new origin.
- [ ] **Task `S0-OP-02`**: Clone/push `sendmynotes` main branch into the new repository.
  - *Deliverable*: Full codebase cloned to new repo; v1 production repo untouched.
  - *Verification*: `git log -n 1` matches current production HEAD.
- [ ] **Task `S0-OP-03`**: Provision new Google Cloud & Firebase project (`widget-factory-prod`).
  - *Deliverable*: Dedicated GCP Project with Firestore Native Mode enabled and Firebase App Hosting / Cloud Run provisioned.
  - *Verification*: `firebase projects:list` displays new project ID.
- [ ] **Task `S0-OP-04`**: Generate Stripe Restricted Key & register v2 webhook endpoint.
  - *Deliverable*: Stripe key with Charges/PaymentIntents Write; Webhook registered at `https://<v2-domain>/api/webhooks/stripe`.
  - *Verification*: Send test webhook ping from Stripe Dashboard $\rightarrow$ 200 OK.
- [ ] **Task `S0-OP-05`**: Set up Printful & Lob Developer Accounts.
  - *Deliverable*: Printful developer store & API key; Lob developer account & `test_` API key.
  - *Verification*: Test API ping via curl returns valid account info.
- [ ] **Task `S0-OP-06`**: Generate GCP Service Account key for runtime container.
  - *Deliverable*: Service account JSON with `roles/secretmanager.secretAccessor` and `roles/datastore.user`.
  - *Verification*: Secrets inject into container environment variables without errors.

#### 🤖 Agent Track
- [ ] **Task `S0-AG-01`**: Sanitize codebase and strip hardcoded project IDs.
  - *Deliverable*: All hardcoded references in `README.md`, `firebase.json`, and API routes replaced with environment variables.
  - *Verification*: `grep -rn "sendmynotes" app/ lib/` returns only abstract brand tokens.
- [ ] **Task `S0-AG-02`**: Update Environment Validator (`lib/env-validator.ts`).
  - *Deliverable*: Zod schemas validating Printful, Lob, and Google Ads credentials.
  - *Verification*: Missing production secret throws clean startup error in production mode.
- [ ] **Task `S0-AG-03`**: Configure CI/CD & build gates in `apphosting.yaml` and GitHub Actions.
  - *Deliverable*: Automated workflow running `npm run lint`, `npx tsc --noEmit`, and `npm test`.
  - *Verification*: Pull request triggers clean passing CI pipeline.
- [ ] **Task `S0-AG-04`**: Establish Factory directory structure.
  - *Deliverable*: Scaffolding created for `lib/factory/`, `lib/fulfillment/`, `components/funnel/`, `config/brands/`.
  - *Verification*: Directory layout conforms to master architecture document.

---

### Sprint 1: Decoupling, Parameterization & Dynamic Flow Engine (Week 1)

#### 🧑‍💻 Operator Track
- [ ] **Task `S1-OP-01`**: Confirm initial SKU Catalog specs & target unit economics.
  - *Deliverable*: Signed-off pricing and COGS sheet for A2 Cards ($9), Fine Art Prints ($28), and Keepsake Letters ($12).
  - *Verification*: Values documented in `config/products.json` or equivalent.
- [ ] **Task `S1-OP-02`**: Sign off on probe budgets and stop-loss ceilings.
  - *Deliverable*: Standardized $25–$35 probe budget per campaign with $30 stop-loss rule.
  - *Verification*: Approved parameters committed to `DEFAULT_ECONOMICS` config.

#### 🤖 Agent Track
- [ ] **Task `S1-AG-01`**: Finalize `WidgetManifest` contracts & schema validation.
  - *Deliverable*: [lib/factory/types.ts](file:///Users/zeke/code/sendmynotes/lib/factory/types.ts) with full validation logic.
  - *Verification*: `npx tsc --noEmit` compiles with 0 errors.
- [ ] **Task `S1-AG-02`**: Extract `VisualAssetStep` component primitive.
  - *Deliverable*: Reusable component supporting preset artwork, AI prompt generator, and user photo uploads.
  - *Verification*: Component renders cleanly in isolation with test props.
- [ ] **Task `S1-AG-03`**: Extract `CustomTextStep` component primitive.
  - *Deliverable*: Unified text composer with tone banks, character limit counters, and font selectors.
  - *Verification*: Message shuffles and font selections persist to parent state.
- [ ] **Task `S1-AG-04`**: Extract `ShippingAddressStep` with standard HTML5 autofill.
  - *Deliverable*: Standalone form with Keychain/browser 1-tap autofill and schema sanitization.
  - *Verification*: Browser autofills all fields in a single tap.
- [ ] **Task `S1-AG-05`**: Extract `UniversalCheckoutStep` (Stripe Elements / Apple Pay).
  - *Deliverable*: Reusable payment terminal supporting Apple Pay, Google Pay, and credit cards.
  - *Verification*: Test payment creates PaymentIntent and captures successfully in Stripe Test Mode.
- [ ] **Task `S1-AG-06`**: Build `DynamicFlowEngine` state machine.
  - *Deliverable*: Config-driven runner rendering arbitrary step sequences from a `WidgetManifest`.
  - *Verification*: Swapping step order in manifest alters user journey without code changes.

---

### Sprint 2: Multi-Tenancy Middleware & Multi-Brand Theming (Week 2)

#### 🧑‍💻 Operator Track
- [ ] **Task `S2-OP-01`**: Configure custom domain DNS & SSL certificates.
  - *Deliverable*: Hostnames routed to Firebase App Hosting / Cloud Run cluster.
  - *Verification*: `curl -I https://asterandblanche.com` returns 200 OK with valid SSL.
- [ ] **Task `S2-OP-02`**: Upload brand logos, colophons & styling tokens for test brands.
  - *Deliverable*: High-res vector marks, colophons, and hex color codes added to asset directory.
  - *Verification*: Image assets pass Sharp 300 DPI pre-flight check.

#### 🤖 Agent Track
- [ ] **Task `S2-AG-01`**: Implement Next.js Host Middleware (`middleware.ts`).
  - *Deliverable*: Middleware extracting `request.headers.get("host")` and rewriting to tenant route.
  - *Verification*: Visiting `asterandblanche.com` and `sendmynotes.com` loads distinct brand contexts.
- [ ] **Task `S2-AG-02`**: Dynamic Theme & Typography Injector.
  - *Deliverable*: Component injecting brand CSS custom properties and Google Fonts into `<head>`.
  - *Verification*: Primary brand colors and typography switch dynamically on host switch.
- [ ] **Task `S2-AG-03`**: Brand Colophon & Packaging Slip Engine.
  - *Deliverable*: Dynamic backplate generator producing brand-specific 300 DPI print marks.
  - *Verification*: Generated print backplates show matching brand colophon.
- [ ] **Task `S2-AG-04`**: Tenant Attribution & Conversion Pixel Isolation.
  - *Deliverable*: Per-brand tracking container ensuring separate Google Ads IDs and Meta Pixels.
  - *Verification*: Purchase event fires to Brand A's conversion ID without polluting Brand B.

---

### Sprint 3: Pluggable Fulfillment Bus (Printful + Lob + Handwrytten) (Week 3)

#### 🧑‍💻 Operator Track
- [ ] **Task `S3-OP-01`**: Add payment method to Printful Wallet and enable auto-fulfillment.
  - *Deliverable*: Active Printful payment profile with default payment card.
  - *Verification*: Printful dashboard indicates "Automatic fulfillment enabled".
- [ ] **Task `S3-OP-02`**: Fund Lob account balance and confirm rate tiers.
  - *Deliverable*: Lob account funded with active API credits.
  - *Verification*: Lob dashboard confirms live/test balance.
- [ ] **Task `S3-OP-03`**: Configure wallet low-balance email alerting.
  - *Deliverable*: Automated notifications when balance drops below $150.
  - *Verification*: Test alert email received successfully.

#### 🤖 Agent Track
- [ ] **Task `S3-AG-01`**: Build `FulfillmentAdapter` contract (`lib/fulfillment/types.ts`).
  - *Deliverable*: Universal interface: `submitOrder`, `checkOrderStatus`, `getBalance`, `validateAddress`.
  - *Verification*: TypeScript interface cleanly compiles and is covered by mock unit tests.
- [ ] **Task `S3-AG-02`**: Refactor Handwrytten client into `HandwryttenAdapter`.
  - *Deliverable*: Wraps [lib/handwrytten.ts](file:///Users/zeke/code/sendmynotes/lib/handwrytten.ts) into the `FulfillmentAdapter` contract.
  - *Verification*: Existing Handwrytten order creation tests pass with 100% parity.
- [ ] **Task `S3-AG-03`**: Build `PrintfulAdapter` (`lib/fulfillment/printful.ts`).
  - *Deliverable*: REST v2 client with sync/mock support and webhook listener for shipment events.
  - *Verification*: Test order submits to Printful mock API and returns tracking simulation.
- [ ] **Task `S3-AG-04`**: Build `LobAdapter` (`lib/fulfillment/lob.ts`).
  - *Deliverable*: Programmatic postcards and letters with native USPS CASS address verification.
  - *Verification*: Test postcard generates watermarked PDF preview and returns valid tracking ID.
- [ ] **Task `S3-AG-05`**: Pre-Flight Address Hygiene Validator.
  - *Deliverable*: CASS validator running prior to Stripe payment authorization.
  - *Verification*: Malformed addresses prompt the user with standardized suggestions before payment.
- [ ] **Task `S3-AG-06`**: Automated Wallet Health Pingers & Quarantine Queue.
  - *Deliverable*: Hourly cron checking balances across all configured suppliers.
  - *Verification*: Low balance flags order as `QUEUED_AWAITING_FUNDS` without dropping customer payment.

---

### Sprint 4: Direct Ad Platform API Trading Desk (Google Ads API) (Week 4)

#### 🧑‍💻 Operator Track
- [ ] **Task `S4-OP-01`**: Obtain Google Ads Developer Token.
  - *Deliverable*: Approved Developer Token in Google Ads Manager.
  - *Verification*: Token validates against Google Ads API test endpoints.
- [ ] **Task `S4-OP-02`**: Create GCP OAuth 2.0 Web Application Credentials.
  - *Deliverable*: Client ID & Client Secret configured with AdWords scopes.
  - *Verification*: OAuth consent screen displays correct project credentials.
- [ ] **Task `S4-OP-03`**: Generate persistent Google Ads Refresh Token.
  - *Deliverable*: Stored refresh token in Google Cloud Secret Manager.
  - *Verification*: Refresh token successfully exchanges for temporary access token.
- [ ] **Task `S4-OP-04`**: Set hard account-level monthly spend limit in Google Ads billing.
  - *Deliverable*: Hard billing limit configured in Google Ads account settings.
  - *Verification*: Account billing settings show active budget cap.

#### 🤖 Agent Track
- [ ] **Task `S4-AG-01`**: Build Google Ads API Client (`lib/trading/google-ads.ts`).
  - *Deliverable*: REST client handling authentication, campaign mutation, and reporting.
  - *Verification*: Test query successfully retrieves campaign impressions and spend.
- [ ] **Task `S4-AG-02`**: Build Offline Conversion Uploader for GCLID.
  - *Deliverable*: Background worker uploading verified order revenue directly to Google Ads.
  - *Verification*: Google Ads conversion actions log verified offline conversion uploads.
- [ ] **Task `S4-AG-03`**: Programmatic Probe Campaign Controller.
  - *Deliverable*: Engine creating Ad Groups and Responsive Search Ads with $20–$35 probe budget limits.
  - *Verification*: Script generates live test ad group with exact target keywords and UTMs.
- [ ] **Task `S4-AG-04`**: Automated Stop-Loss Kill Switch.
  - *Deliverable*: Hourly cron comparing campaign spend to conversion count.
  - *Verification*: Simulated $31 spend with 0 orders triggers automated `PAUSED` mutation.

---

### Sprint 5: Staged Autonomy & Final Cutover (Week 5)

#### 🧑‍💻 Operator Track
- [ ] **Task `S5-OP-01`**: Review Staged Campaigns in Admin Dashboard.
  - *Deliverable*: Test 1-click launch workflow on 2 micro-targeted niches.
  - *Verification*: Click "Authorize Probe ($25)" $\rightarrow$ campaign activates in Google Ads.
- [ ] **Task `S5-OP-02`**: Authorize final production DNS cutover to v2.
  - *Deliverable*: Apex A/CNAME records updated to point to the v2 platform.
  - *Verification*: Live traffic routes to v2 with zero downtime.

#### 🤖 Agent Track
- [ ] **Task `S5-AG-01`**: Build Admin Trading Desk UI (`components/admin/TradingDesk.tsx`).
  - *Deliverable*: Interactive dashboard displaying active trades, real-time PnL, and staging controls.
  - *Verification*: Dashboard renders real-time contribution margin and ROAS.
- [ ] **Task `S5-AG-02`**: Build Market Scout & Crafter Agent Subroutines.
  - *Deliverable*: Agent pipeline: keyword matrix $\rightarrow$ `WidgetManifest` $\rightarrow$ Gemini art $\rightarrow$ staged route.
  - *Verification*: Subagent command generates a complete, staged landing page within 3 minutes.
- [ ] **Task `S5-AG-03`**: Execute Backwards Compatibility Suite.
  - *Deliverable*: End-to-end regression tests verifying Aster & Blanche cards, fonts, and customer history.
  - *Verification*: 100% of existing tests pass on v2.
- [ ] **Task `S5-AG-04`**: Automated Cutover Health Checks & Telemetry Reconciliation.
  - *Deliverable*: Webhook integrity verification and live order reconciliation scripts.
  - *Verification*: First live customer orders process, charge, and dispatch with 0 manual interventions.
