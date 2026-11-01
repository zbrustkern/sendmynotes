# Production Readiness Audit: Account Experience & Upload Studio
**Date:** November 1, 2026  
**Target:** Production Rollout Readiness Evaluation (`sendmynotes-2a417`)  
**Staging Baseline:** Build `build-2026-11-01-001` (Commit `00852e7` on `origin/staging`, review checkout `codex/account-experience` at `d3066e0`)  
**Product Baseline:** [Canonical Project Brief](file:///Users/zeke/code/sendmynotes/docs/CANONICAL_PROJECT_BRIEF.md), [Canonical Product Specs](file:///Users/zeke/code/sendmynotes/docs/CANONICAL_PRODUCT_SPECS.md), [Upload Studio Spec](file:///Users/zeke/code/sendmynotes/docs/proposals/2026-10-30-upload-card-front/DESIGN_SPEC.md), [Account Spec](file:///Users/zeke/code/sendmynotes/docs/proposals/2026-11-01-account/DESIGN_SPEC.md)

---

## Executive Summary & Rollout Verdict

**ROLLOUT DECISION: 🛑 BLOCKED — DO NOT DEPLOY TO PRODUCTION YET**

While the account management and Upload Studio features have made substantial progress on staging, they are **not ready for production**. Promoting the current staging build to production (`sendmynotes-2a417`) will immediately cause:
1. **Critical 503 backend crashes** on any photo upload or saved image library access due to missing production environment variables.
2. **Database query failures** (`FAILED_PRECONDITION`) on customer account pages due to 17 undeployed Firestore composite indexes.
3. **Total user lockout** for anyone signing up via email/password due to missing email verification flows.
4. **Broken order history and repeat orders** for all custom AI artwork cards.
5. **Code regressions** against recent fixes already merged into `origin/main` (PRs #1, #2, #3 for custom artwork recovery).

Below is the structured breakdown of findings and action items, separated for **Builder Agents (Engineering/Infra)** and **Design Agents (UX/Interaction)**.

---

## Part 1: For the Builder Agent (Infra & Technical Blockers)

### 1. Hard Infrastructure Blockers

#### 1.1 `apphosting.yaml` (Production) Missing All Required Upload & Account Configuration
* **Files:** [`apphosting.yaml`](file:///Users/zeke/code/sendmynotes/apphosting.yaml) vs [`apphosting.staging.yaml`](file:///Users/zeke/code/sendmynotes/apphosting.staging.yaml)
* **Problem:** `apphosting.staging.yaml` defines environment variables and secret references that are **completely omitted** from production `apphosting.yaml`:
  * `UPLOAD_PRIVATE_BUCKET` (Secret: `upload-private-bucket-staging`)
  * `UPLOAD_IMAGE_MODEL`
  * `UPLOAD_ADMIN_EMAILS`
  * `UPLOAD_CLEANUP_SECRET` (Secret: `upload-cleanup-secret-staging`)
  * `ADMIN_SESSION_SIGNING_KEY` (Secret: `admin-session-signing-key-staging`)
  * `ACCOUNT_REMINDER_DELIVERY_ACTIVE`
  * `REMINDER_WORKER_SECRET` (Secret: `reminder-worker-secret-staging`)
  * `REMINDER_FROM_EMAIL`
* **Root Cause & Impact:** In [`lib/upload/access.ts#L61`](file:///Users/zeke/code/sendmynotes/lib/upload/access.ts#L61) and [`lib/account/library-storage.ts#L22`](file:///Users/zeke/code/sendmynotes/lib/account/library-storage.ts#L22), the backend verifies `process.env.UPLOAD_PRIVATE_BUCKET`. If empty, it throws a `503 Service Unavailable` with `storage_bucket_unconfigured`. In production, every upload creation, generation, and library fetch will crash.
* **Builder Task:**
  1. Provision a dedicated production private storage bucket with uniform bucket-level access and public access prevention (e.g., `sendmynotes-production-private-uploads`).
  2. Create production secrets in Google Cloud Secret Manager (`upload-private-bucket`, `upload-cleanup-secret`, `admin-session-signing-key`, `reminder-worker-secret`).
  3. Mirror the environment and secret bindings into `apphosting.yaml` targeting production resources.

#### 1.2 17 Production Firestore Composite Indexes Are Missing
* **Files:** [`firestore.indexes.json`](file:///Users/zeke/code/sendmynotes/firestore.indexes.json)
* **Problem:** Sprint 0022 and Sprint 0024 added 17 composite indexes covering collections: `account_images`, `account_drafts`, `account_people`, `account_occasions`, `account_events`, `account_privacy_requests`, and `upload_jobs`. While provisioned on the staging project (`sendmynotes-staging`), they have **not** been deployed to production (`sendmynotes-2a417`).
* **Root Cause & Impact:** Compound queries (e.g. `where('ownerUid', '==', uid).where('pinned', '==', true).orderBy('pinnedAt', 'desc')`) will throw `FAILED_PRECONDITION: The query requires an index`. Account history, image library, and drafts will show database error states.
* **Builder Task:**
  * Run `firebase deploy --only firestore:indexes --project sendmynotes-2a417` and verify their status in the Firebase Console before initiating rollout.

#### 1.3 Git Branch Divergence & Merge Hazard with `origin/main`
* **Branches:** `origin/main` vs `origin/staging` (`codex/account-experience`)
* **Problem:** `origin/main` contains recent critical commits (`e34e52b`, `989a958`, `a298a19`) resolving custom artwork recovery in the cart/checkout flow. `origin/staging` branched from `b831eb0` and diverged. There are **38 conflicting files** between the branch and `origin/main`.
* **Builder Task:**
  * Do NOT perform a fast-forward or blind promotion of staging to main.
  * Merge `origin/main` into the release branch, resolve conflicts with test verification (`npm test`), and confirm that custom artwork recovery works alongside the new account tools.

#### 1.4 Background Automation Crons Are Not Triggered
* **Files:** [`app/api/cron/upload-cleanup/route.ts`](file:///Users/zeke/code/sendmynotes/app/api/cron/upload-cleanup/route.ts), [`app/api/cron/account-library-cleanup/route.ts`](file:///Users/zeke/code/sendmynotes/app/api/cron/account-library-cleanup/route.ts), [`app/api/cron/reminder-dispatch/route.ts`](file:///Users/zeke/code/sendmynotes/app/api/cron/reminder-dispatch/route.ts)
* **Problem:** These endpoints require authenticated POST requests with bearer secrets (`UPLOAD_CLEANUP_SECRET`, `REMINDER_WORKER_SECRET`). No Google Cloud Scheduler jobs or GitHub Actions triggers have been configured in production.
* **Impact:** Unpinned library images and temporary upload drafts will never be pruned, leaking cloud storage costs. Occasion reminders will never be evaluated or dispatched.
* **Builder Task:**
  * Configure Cloud Scheduler jobs targeting `/api/cron/upload-cleanup` and `/api/cron/reminder-dispatch` with the authorized bearer header.

---

### 2. Critical Code & Logic Defects

#### 2.1 The Email/Password Verification Lockout Trap
* **Files:** [`components/AuthModal.tsx#L140`](file:///Users/zeke/code/sendmynotes/components/AuthModal.tsx#L140), [`lib/upload/access.ts#L31`](file:///Users/zeke/code/sendmynotes/lib/upload/access.ts#L31), [`lib/account/images.ts#L209`](file:///Users/zeke/code/sendmynotes/lib/account/images.ts#L209), [`lib/reminders-v2/engine.ts`](file:///Users/zeke/code/sendmynotes/lib/reminders-v2/engine.ts)
* **Problem:** When users sign up via email and password, Firebase Auth creates an account with `emailVerified: false`. However, all account upload endpoints, library pinning/saves, and reminder engine subscriptions strictly enforce `emailVerified === true` and return `403 email_unverified`.
* **Defect:** There is **no mechanism** in the frontend or backend that calls `sendEmailVerification`, prompts the user to check their email, or allows them to resend a verification link.
* **Builder Task:**
  * In `AuthModal.tsx` on successful email/password creation, call `sendEmailVerification(user)`.
  * In the account shell / profile header, show a clear banner: *"Please verify your email address to unlock upload features and occasion reminders"*, with a "Resend verification email" action button.

#### 2.2 Custom AI Artwork Broken in Order History & "Make a Similar Card"
* **Files:** [`lib/account/history.ts#L52`](file:///Users/zeke/code/sendmynotes/lib/account/history.ts#L52), [`lib/account/history.ts#L131`](file:///Users/zeke/code/sendmynotes/lib/account/history.ts#L131), [`app/api/account/history/[id]/media/route.ts`](file:///Users/zeke/code/sendmynotes/app/api/account/history/[id]/media/route.ts)
* **Problem:** The helper determining if artwork is available hardcodes:
  ```typescript
  const frontAvailable = Boolean(order.uploadMaster || (order.frontImageUrl && order.frontImageUrl.startsWith('/presets/')));
  ```
* **Impact:** Custom AI artwork cards store Firebase Storage URLs (e.g. `https://firebasestorage.googleapis.com/...`). For all customers who created cards with custom AI artwork:
  1. Order history marks the card as `"Front artwork unavailable"`.
  2. The media endpoint `/api/account/history/[id]/media` returns a 404.
  3. The "Make a similar card" repeat purchase CTA is permanently disabled.
* **Builder Task:**
  * Update `frontAvailable` to recognize valid Firebase Storage custom artwork URLs.
  * In `media/route.ts`, allow streaming or signed URL redirection for custom artwork stored in the card images bucket, matching how presets and upload masters are handled.

#### 2.3 Contact Import Ignores the "Opt in to Reminders" Checkbox
* **Files:** [`components/account/ContactImportModal.tsx#L326`](file:///Users/zeke/code/sendmynotes/components/account/ContactImportModal.tsx#L326) vs [`app/api/account/people/import/route.ts#L106`](file:///Users/zeke/code/sendmynotes/app/api/account/people/import/route.ts#L106)
* **Problem:** In `ContactImportModal.tsx`, the UI presents a checkbox: *"Opt in to reminders for imported birthdays & anniversaries"* (defaulted to checked). However, the API route completely ignores the submitted flag and hardcodes `reminderEnabled: false`.
* **Builder Task:**
  * Update `app/api/account/people/import/route.ts` to accept `reminderOptIn: boolean` from the request body and apply it to each imported contact's occasion records.

#### 2.4 Resuming Saved Drafts Resets the Builder Step to Step 1
* **Files:** [`components/account/DraftsList.tsx`](file:///Users/zeke/code/sendmynotes/components/account/DraftsList.tsx), [`app/preview/entry/client.tsx#L254-L270`](file:///Users/zeke/code/sendmynotes/app/preview/entry/client.tsx#L254-L270)
* **Problem:** When a user clicks "Resume draft" from `/account/drafts`, the builder populates the message, front image, and recipient, but unconditionally resets the flow navigation to Step 1 (`card`), even if the user had already reached Step 2 (Message) or Step 3 (Recipient).
* **Builder Task:**
  * If a draft has recipient details or message text, restore the user to the furthest completed step (e.g. Step 2 or Step 3) rather than forcing them to re-step from the beginning.

#### 2.5 Privacy Requests Queue (GDPR / CCPA) Has No Monitoring or Notification
* **Files:** [`app/api/account/privacy-requests/route.ts`](file:///Users/zeke/code/sendmynotes/app/api/account/privacy-requests/route.ts)
* **Problem:** Submissions to `/api/account/privacy-requests` write a document to `account_privacy_requests` with `status: 'manual_review'`. There is no notification sent to the team, no webhook, and no admin portal view.
* **Builder Task:**
  * Add an email notification to the founders / support inbox via Resend or log an alert to the admin portal so requests are not silently lost.

---

## Part 2: For the Design Agent (UX & Interaction Gaps)

### 1. Upload Studio UX Deficiencies

#### 1.1 Missing 3-Version Generation History & Comparison
* **Spec Requirement:** Section 3.3 of `2026-10-30-upload-card-front`: The studio must maintain a small session tray holding up to 3 generation attempts, allowing the sender to compare options side-by-side or toggle between "Original Photo" and "Card Result".
* **Current Implementation:** Only 1 `generationId` is held in state. Generating a new variation overwrites the current result.
* **Design & UX Action:**
  * Add a 3-slot version filmstrip underneath the card preview.
  * Include a quick toggle/press-and-hold button for "View Original Photo" vs "View Card Front".

#### 1.2 Missing Prompt-to-Lettering Conflict Detection
* **Spec Requirement:** Section 2.1 of `2026-10-30-upload-card-front`: Personal senders frequently type instructions like *"write Happy Birthday Mom on it"* into the artwork prompt. The spec requires detecting phrases asking for text in the prompt field and showing an inline helper: *"For crisp, printed typography, put your text in the Exact Lettering field below."*
* **Current Implementation:** No prompt inspection or helper exists.
* **Design & UX Action:**
  * Provide an inline validation hint when keywords (`"write"`, `"say"`, `"text"`, `"words"`, `"put ... on it"`) are detected in the visual prompt input.

#### 1.3 Missing Starter Lettering Chips
* **Spec Requirement:** Fast one-tap chips for common personal sentiments: `"Thank You"`, `"Happy Birthday"`, `"Thinking of You"`, `"Congratulations"`, `"You're Wonderful"`.
* **Current Implementation:** The input hardcodes `'Thank You'` as the initial text; no starter chips exist.
* **Design & UX Action:**
  * Add horizontal scrollable quick chips above the lettering text input so mobile users can tap rather than type.

#### 1.4 Back Navigation Drops User into Preset Gallery
* **Problem:** When an uploaded card is in the builder, clicking "Change front" navigates backward to `step = "card"`. This step is the preset template gallery. The user's uploaded card is unselected and there is no direct link to return to the Upload Studio to re-edit crop or lettering.
* **Design & UX Action:**
  * In the Step 1 card gallery, when a custom upload master exists, show a "Custom Upload" card card-tile with an "Edit in Studio" button, or make the "Change front" action prompt: *"Edit current upload" vs "Choose a different card"*.

#### 1.5 iPhone HEIC Photo Uploads Fail Without Guidance
* **Problem:** Over 70% of personal senders use iPhones which capture photos in `.heic` format by default. Uploading an HEIC photo causes an immediate server `415 unsupported_type` error.
* **Design & UX Action:**
  * Provide client-side conversion (e.g. `heic2any`) or clear copy: *"Please select a JPG or PNG photo (or convert from iPhone Settings > Camera > Formats > Most Compatible)"*.

#### 1.6 Mobile Layout: Preview Hidden Below the Fold
* **Problem:** On mobile screens, the card preview component is placed after all form inputs in the DOM. As the user tweaks lettering text, font styles, and treatments, they cannot see the card preview update without scrolling down the page.
* **Design & UX Action:**
  * On mobile screens (< 768px), stick a compact 160px card preview at the top of the viewport (or dock it as an expandable bar) so the user gets real-time visual feedback as they adjust inputs.

---

### 2. Account Experience UX Deficiencies

#### 2.1 Address Book Disconnected from Step 3 (Recipient / Envelope)
* **Spec Requirement:** Section 4.2 of `2026-11-01-account`: When the sender reaches Step 3 (Recipient Envelope), a prominent `"Choose from address book"` button should appear next to the recipient address inputs.
* **Current Implementation:** An [`AccountBuilderTools`](file:///Users/zeke/code/sendmynotes/components/account/AccountBuilderTools.tsx) toolbar is rendered outside the builder container at the top of the page. The envelope form itself has no address book action.
* **Design & UX Action:**
  * Move or add a secondary `"Select Saved Recipient"` button directly above the "Recipient Name" input in the Step 3 envelope form. Clicking it opens a drawer or modal to select a contact, immediately populating name, street, city, state, and ZIP.

#### 2.2 Saved Images Library Shows Broken "Upload an Image" CTA to Non-Granted Users
* **Problem:** In `/account/images`, a persistent `"Upload an image"` button is shown in the header. If a standard user without an Upload Studio grant clicks it, they are sent to `/create/upload`, which immediately greets them with an Access Denied / Request Invitation screen.
* **Design & UX Action:**
  * Check the user's `canUpload` capability flag. If false, show an informational banner: *"Upload Studio is currently in private preview. Request an invite to use custom photos on your cards."* instead of an active primary action button.

#### 2.3 Drafts List Missing Card Front Thumbnails
* **Problem:** In `/account/drafts`, saved drafts are displayed as text cards with title, recipient, and date. Because personal senders choose cards visually, identifying which draft is which without seeing the artwork is cumbersome.
* **Design & UX Action:**
  * Include a 60x84px thumbnail of the card front on each draft row in [`DraftsList.tsx`](file:///Users/zeke/code/sendmynotes/components/account/DraftsList.tsx).

#### 2.4 Overview Page Upcoming Occasions Missing Quick "Start a Card" CTA
* **Spec Requirement:** The Overview screen lists upcoming birthdays/anniversaries. Each item should have a direct `"Send note"` button that launches the builder with the recipient and occasion pre-selected.
* **Current Implementation:** It only displays the date and contact name as static text.
* **Design & UX Action:**
  * Add a compact `"Send Card"` action button next to each upcoming occasion that routes to `/create?personId=...`.

---

## Part 3: Pre-Rollout Action Checklist

### Phase 1: Deployability Gates (Mandatory Before Any Production Push)
- [ ] **1. Cloud Storage:** Provision production private bucket `sendmynotes-production-private-uploads` with uniform access and public access prevention.
- [ ] **2. Production Secrets:** Add production secrets to Secret Manager and map them in `apphosting.yaml`.
- [ ] **3. Firestore Indexes:** Run `firebase deploy --only firestore:indexes --project sendmynotes-2a417` and verify all 17 indexes show "Enabled".
- [ ] **4. Branch Integration:** Merge `origin/main` into the release branch, resolve the 38 conflicting files, and verify custom artwork recovery still functions.
- [ ] **5. Email Verification:** Implement `sendEmailVerification` and add an unverified account notification banner in the auth modal/account header.
- [ ] **6. History Artwork Fix:** Fix `frontAvailable` in `lib/account/history.ts` so custom AI cards display their front image and enable "Make a similar card".
- [ ] **7. Contact Import Reminders:** Honor the `reminderOptIn` payload in `app/api/account/people/import/route.ts`.

### Phase 2: UX & Experience Gates (Recommended for Senders)
- [ ] **8. Step 3 Address Book Button:** Embed `"Choose from address book"` directly on the recipient envelope form in Step 3.
- [ ] **9. Draft Resume Step:** Resume drafts at the furthest completed step rather than resetting to Step 1.
- [ ] **10. Draft Thumbnails:** Add artwork previews to `/account/drafts`.
- [ ] **11. Mobile Upload Studio:** Dock or elevate the card preview on mobile so lettering edits are visible without scrolling.
- [ ] **12. Cloud Scheduler:** Set up Cloud Scheduler jobs with bearer authorization for `/api/cron/upload-cleanup` and `/api/cron/reminder-dispatch`.
