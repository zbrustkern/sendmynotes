# SPRINT-0022 — Private upload studio and expressive cover lettering

Status: completed. Staging beta deployed and verified; production release excluded.

## Pyramid Index
- L0: Turn a personal image into a card front with prominent, exact lettering, then continue into the existing note builder.
- L1: Private access and media; reference-based generation and typography; mounted builder/admin UX; checkout integrity and staging validation.
- L2: Architecture and contracts below; independent Sol drafts and critiques in `drafts/`; evidence in `evidence/SPRINT-0022/`.

## Overview and use cases
The founder opens `/admin/uploads`, grants an existing verified account access (30 days and 20 generations/day by default), and can revoke access or pause new work. An entitled sender opens `/create/upload`, uploads a personal JPEG/PNG/WebP, describes the desired illustration, optionally adds exact words such as **Thank You**, chooses Playful stack, Gentle arch or Classic serif, previews the flattened result, and accepts it into `/new`. Uploads are not added to the public gallery or advertised in the public funnel. Signed-in account navigation reveals the alternative only to entitled accounts.

## Authority and scope
The approved [design](../proposals/2026-10-30-upload-card-front/DESIGN_SPEC.md), canonical brief/specs, and founder's implementation/staging authorization govern. Founder explicitly selected **Sol planning lanes and Luna execution**, overriding the skill's Claude/Astra lane and CLI defaults. Both independent Sol drafts and cross critiques have completed. This sprint incorporates their security and mounted-path corrections without reopening approved product questions. No chapter or semantic index is configured. Baseline `origin/staging` is `d9a89297fa08e32088e01409e1e62b5770f78a47`.

## Architecture and frozen contracts
`lib/upload/contracts.ts` defines shared records and public types. All upload APIs verify Firebase bearer ID tokens with revocation checks; request UID never establishes ownership. Writes require same-origin. All media responses are private/no-store, with authenticated fetch-to-blob UI previews held only in memory. Admin endpoints use existing verified admin sessions plus owner capability allowlist. Storage is a separate private bucket with uniform access and public-access prevention; never existing public image optimizer. Firestore collections must reject browser writes.

Every composition creates a new immutable design ID with revision 1. Acceptance marks that exact ID/hash accepted; editing creates a different design, leaving prior masters immutable. This deliberately avoids mutable revision races. `UploadSelection` is `{source:'upload',designId,revision,masterSha256,title,accepted:true}`. No image URL is persisted for upload drafts. `/new?uploadDesign=<id>` fetches the UID-bound accepted record before moving to the note step. Refresh revalidates stored selection; an opaque ID alone grants no access. No separate expiring single-use token is needed because authenticated acceptance is durable and idempotent.

HTTP contract (errors always `{error,code}`):
- `GET /api/upload/access` → `UploadAccess`.
- `POST /api/upload/assets` multipart `file` → `{asset:{id,width,height,mimeType,expiresAt},warning?}`. Actual decode, orientation, metadata strip; 15MB/40MP/512px limits. `DELETE /api/upload/assets/:id` removes source and derived unordered content.
- `POST /api/upload/generations`, header `Idempotency-Key`, body `{assetId,imagePrompt}` → `{generation:{id,status,standardsVersion,error?}}`; GET `/:id` same shape. Atomic quota reservation and same-key/same-request replay, one pending job/account, unresolved jobs never automatically resubmitted. One provider invocation, no text-only/source fallback.
- `POST /api/upload/compositions`, body `{generationId,exactText,treatmentId}` → `{design:{designId,revision,masterSha256,exactText,treatmentId,accepted:false}}`. All three treatments, max 40 graphemes/3 lines; unsupported glyphs fail visibly. Recomposition uses existing illustration and no model call.
- `POST /api/upload/designs/:id/accept`, body `{revision,masterSha256}` → `{selection:UploadSelection}`. `GET /api/upload/designs/:id` → `{selection}` for accepted owner-visible designs, validates active grant.
- `GET /api/upload/previews/:kind/:id` where kind asset/generation/design → owner/grant validated PNG bytes. No keys/URLs in public JSON.
- `GET /api/admin/upload-access` → `{grants}`; POST `{email,expiresAt?,dailyLimit?}` resolves existing verified Firebase account; PATCH `{uid,revoked?,expiresAt?,dailyLimit?}`. Owner sessions only, audit all mutations.
- `GET /api/admin/upload-standards` → `{standards}`; POST `{expectedVersion,creativeGuidance,enabledTreatments,defaultTreatment,paused,reviewConfirmed}` publishes an immutable new version with audit and explicit human review acknowledgement. Locked print rules cannot be edited. Test previews use current guidance; richer draft/testing workflow remains a documented beta follow-up, not a false automatic visual certification.

Service exports owned by access lane: `requireUploadActor(req):{uid,email?}`, `requireActiveGrant(uid,action:'work'|'read'|'checkout')`, `getUploadAccess(uid)`, `getPrivateAsset(uid,id)`, `putPrivateAsset(uid,kind,bytes):key`, `readPrivateAsset(key):Buffer`, `getActiveStandards()`, `getDesign(id)`, `putDesign(record)`, `getGeneration(id)`, `putGeneration(record)`, `reserveGeneration(uid,operationId,requestHash,assetId,standardsVersion):{generation,replay}`, `finishGeneration(generation)` and `uploadErrorResponse(error)`. Access owns persistence/atomic state; generation owns invocation and composition. Read/checkout remain available during new-work pause if grant active. Quota counts provider attempts including unresolved failures, not invalid uploads; retries reuse reservation.

Generation exports `validateUploadCheckoutSelection(uid,selection):UploadDesign` and `readAcceptedMaster(master:UploadOrderMaster):Buffer`. Main pins a separate immutable order copy before offer/Stripe side effects and uses verified UID, not client userId. Checkout upload payload is `{uploadDesign:UploadSelection}` with no frontImageUrl; mixed input rejected. Legacy covers keep existing field. Order carries private `uploadMaster`; only server resolves bytes. Paid/free/admin-comp paths use pinned bytes without revalidating mutable grant after payment. Private keys never appear in public order APIs. No fulfillment invocation in QA.

Provider: documented Gemini `generateContent` image input with normalized PNG `inlineData` plus locked server harness and user prompt. Default configurable image-capable model, no inference that text-only adapter suffices. Output becomes portrait 1275×1650 illustration. Exact lettering is server-rendered with bundled licensed fonts into the same immutable master shown and later ordered. Prompt reserves upper quiet region; subject preservation and stray text need visual review, not a claimed automated guarantee.

Retention: source and unaccepted artifacts expire after seven days; accepted unordered masters after thirty days. API denies expired reads immediately. Scheduled/operational cleanup deletes expired bytes; storage lifecycle is a secondary backstop. Ordered private copies remain for order support under existing order-retention policy, never deleted by source deletion. Account deletion and automated cleanup must be documented and exercised before wider access. No raw quarantine persistence is necessary: validate bytes in memory before private write.

## Implementation plan and exclusive ownership
1. Main freezes contracts and release plan (this document), keeps integration/deploy ownership.
2. Luna access: `lib/upload/{auth,access,storage,assets,standards,quota,repository,http}.ts`, upload access/assets/previews routes, admin upload-access/upload-standards routes, cleanup endpoint/script and backend tests. No edits to contracts or generation files without coordinating.
3. Luna creative: `lib/upload/{provider,prompt,generation,composition,treatments}.ts`, fonts/license, generation/composition/design routes, generator/compositor tests. Can add font parser dependency via main coordination. No edits to access or UI files.
4. Luna experience: `app/create/upload/**`, `components/upload/**`, admin uploads workspace/page/navigation, account link, `app/new/page.tsx`, `app/preview/entry/client.tsx`, `components/flow/EntryCardStep.tsx`, `lib/draft/**`, draft/UI tests. Other front render components only as needed, report files. Send uploadDesign+bearer checkout payload; maintain local blob preview separately.
5. Main: checkout routes, `lib/order-processor.ts`, `lib/handwrytten.ts`, `lib/types.ts`, public order serialization/privacy, infrastructure, cross-lane review, testing, commit and staging rollout.

## Files summary
Three focused upload modules/API/UI groups above; existing mounted builder and checkout adapt via the discriminated selection. Docs/evidence record plan, model override, tests, deployment identity and remaining beta limitations. No changes to production hosting configuration.

## Definition of done and validation
- Owner can grant/revoke verified accounts; unauthorized/cross-owner/expired/revoked requests fail, same-origin and private-storage gates enforced.
- Real reference image reaches provider; captured contract test and bounded synthetic live call; refusal/unavailability visible without fallback.
- Three distinct exact-text treatments render at print dimensions with safe bounds and font support tests. Inspect Thank You master and mobile/desktop UI.
- Upload selection survives `/new` note/address/review/refresh; preview uses the same hashed bytes pinned for order. Mixed URL, stale hash, foreign UID and revoked selection rejected before payment side effects. Paid/free/comp use shared private bytes.
- Focused security/draft/checkout tests, typecheck and production build pass; browser checks cover mounted route and admin forms. No supplier calls, physical mail or live payment during testing.
- Deploy only staging, verify exact Git commit at 100% traffic, current test/review-only flags and production unchanged. Final report gives studio/admin links and honest limitations.

## Risks, dependencies and open items
Private bucket/service IAM and staging Firestore rules are release gates. Fonts must be bundled and licensed; generated image quality/subject fidelity need founder evaluation. Provider account capability is proven by bounded synthetic generation, privacy terms described accurately before broad access. Staging remains review-only so founder can test builder without mail. The baseline hosting audit found no deployed staging Firestore rules release, so secure it before enabling account grants. Scope is one coherent beta, not a general design editor or public launch.

## Delivery receipt
Commit `04c85179012913c174eec367d76a9f7509e069a8`, staging build `build-2026-10-31-002`, serves 100% of traffic. Real hosted synthetic generation, all three compositions, acceptance/hash checks, grant/revoke and authenticated browser refresh passed. Production build and runtime configuration match baseline. Founder email has no staging Firebase account yet: sign in once, then grant that verified account in `/admin/uploads`. See [delivery evidence](evidence/SPRINT-0022/REPORT.md).
