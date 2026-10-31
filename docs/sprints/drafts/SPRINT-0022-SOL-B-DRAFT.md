# SPRINT-0022 — Private upload studio with expressive lettering (Sol B draft)

## Overview

Ship the approved upload studio as a coherent staging beta: a granted account uploads one reference image, directs a real image-edit request, adds exact optional cover words through a server compositor, reviews the final 17:22 front, and carries its immutable print master through the mounted `/new` builder to checkout. Founder manages grants and versioned card guidance at `/admin/uploads`. Public gallery and guest sending stay unchanged. Staging only; no production deployment, live payments, supplier calls, physical mail, or customer communications in this sprint.

The canonical baseline is zero independent paid customers; expressive lettering is a founder hypothesis, not a measured conversion result. A2 portrait is verified, but supplier bleed and safe-zone tolerances, reference-edit fidelity, and provider retention claims remain unverified. App margins are heuristics and privacy copy must state actual verified provider handling.

## Use cases and boundaries

1. A signed-out direct visitor sees sign-in, with a return to `/create/upload`; an ungranted account sees an invitation-only explanation. Neither can post bytes or access private previews. Entitled accounts see the entry in `/account`; owner sees it under admin Controls. No public gallery entry or sitemap indexing.
2. The founder looks up an existing Firebase UID or exact email, grants/revokes time-bound access with reason and quota, reviews usage, pauses new work, and publishes/restores an immutable creative-guidance plus enabled-lettering-treatment version. Access never conveys admin or comp rights.
3. A granted sender submits JPEG/PNG/WebP, exact optional words and a treatment, and optional creative direction. They can inspect original versus actual final crop, revise lettering without a new image generation when the common quiet region fits, generate another version from the normalized original, select a prior version, and explicitly accept a composed master.
4. Acceptance binds a private design ID and exact composition revision to an existing or new card draft, then enters `/new?step=note`. If an unfinished draft exists, the sender chooses replace-front-only or separate-card before mutation. Returning to “Change front” preserves note, address, attribution and offer state; new checkout pricing is recalculated.
5. Revocation or expiry blocks new upload actions, acceptance, and new checkout intents using upload art. A paid order already authorized remains pinned to its accepted master. A pause blocks only new upload/generation work; it does not invalidate an accepted front with an active grant.

## Current mounted seams

`app/new/page.tsx` mounts `EntryPrototypeClient` directly; `ExperienceRouter` is used by other entries and its `v3` switch is not the `/new` handoff. `EntryPrototypeClient` builds `currentCard` from `draft.selectedDesign`, sends `frontImageUrl` to `/api/checkout/create-intent`, and syncs URL `step` with browser history. `lib/draft/types.ts` has only `preset | custom`; `lib/draft/store.ts` rejects mismatched schema and `app/preview/entry/client.tsx` also has legacy local-draft hydration. `EntryCardStep` recognizes custom image URLs and must handle an upload selection without inserting it into the gallery. `create-intent` currently trusts a client `frontImageUrl` and optional `userId`; order processing later passes `order.frontImageUrl` to Handwrytten. `lib/handwrytten.ts` can fetch HTTPS/data/public images, so upload masters need a separate server-only resolution path. `lib/nano-banana.ts` sends text-only requests and its fallback cascade does not establish image-edit capability. `lib/image-optimizer.ts` may publish a cover and shrink it for Firestore; it must not be reused for private print masters.

## Architecture and exact contracts

### Shared contract frozen before parallel work

Lane A owns `lib/upload/contracts.ts` and exports these named discriminated shapes; all lanes import them, and main reviews the first contract commit before implementation fan-out. No source bytes, prompts, personal words, preview URLs, or bearer tokens enter telemetry or browser persistence.

```ts
type UploadErrorCode = 'AUTH_REQUIRED'|'GRANT_REQUIRED'|'GRANT_EXPIRED'|'GRANT_REVOKED'|'PAUSED'|'INVALID_IMAGE'|'QUALITY_TOO_LOW'|'QUOTA'|'CONFLICT'|'REFUSAL'|'PROVIDER_UNAVAILABLE'|'COMPOSITION_INVALID'|'NOT_FOUND';
type UploadAccess = { state:'active'|'expired'|'revoked'|'none'; expiresAt:string|null; usedToday:number; dailyLimit:number; resetAt:string; paused:boolean };
type UploadAsset = { assetId:string; width:number; height:number; mime:'image/jpeg'|'image/png'|'image/webp'; shortEdgeWarning:boolean; expiresAt:string };
type UploadGeneration = { generationId:string; assetId:string; state:'queued'|'running'|'ready'|'failed'|'unresolved'; standardsVersion:string; model:string|null; versions:Array<{generationId:string; compositionRevision:number}>; errorCode?:UploadErrorCode };
type UploadComposition = { designId:string; generationId:string; revision:number; exactText:string; treatmentId:'playful-stack'|'gentle-arch'|'classic-serif'; treatmentVersion:string; masterSha256:string; status:'pending'|'ready'|'invalid'|'accepted'; errorCode?:UploadErrorCode };
type UploadSelection = { source:'upload'; designId:string; revision:number; masterSha256:string; title:string; accepted:true }; // no client image URL authority
type UploadApiError = { error:string; code:UploadErrorCode; operationId?:string; resetAt?:string };
```

Every upload route verifies a Firebase ID token, derives UID from it, checks runtime-scoped grant and ownership server-side, enforces same-origin writes, and returns `Cache-Control: private, no-store`. Admin routes additionally verify existing signed admin session and explicit server-configured owner capabilities; never infer ownership from a client UID, email, admin role, query `environment`, or an unsigned cookie. Successful mutations accept `Idempotency-Key`, return stable resource IDs, and use expected revision/version on edits. Use a persistent transaction for a per-UID UTC-day allowance, one active generation, spend reservation and atomic audit/grant changes; a failed pre-provider validation spends no allowance. Define a distinct provider-cost record because timeout may have cost money. Do not auto-retry an unresolved provider operation.

| Route | Request → response / authority |
| --- | --- |
| `GET /api/upload/access` | Bearer token → `UploadAccess` for token UID. |
| `POST /api/upload/assets` | Multipart `file` ≤15 MB → `UploadAsset`; validation strips metadata and saves private normalized bytes. |
| `DELETE /api/upload/assets/:id` | Owner + idempotency → deletion state; reject if pinned to accepted order. |
| `POST /api/upload/generations` | `{assetId,imagePrompt,letteringRegion:'upper',operationId}` → `UploadGeneration`; immutable active standards selected server-side; one result per operation. |
| `GET /api/upload/generations/:id` | Owner → status and allowed versions; no private storage key. |
| `POST /api/upload/compositions` | `{generationId,exactText,treatmentId,expectedRevision}` → `UploadComposition`; free of image-generation allowance; conflicts return 409. |
| `POST /api/upload/designs/:id/accept` | `{revision,masterSha256,idempotencyKey}` → accepted `UploadSelection`; grants/revision rechecked. |
| `GET /api/upload/previews/:kind/:id` | Bearer token and ownership → bytes for `source`, `illustration`, or composed `master`; browser fetches authenticated blob and revokes object URL on account change/unmount. No public or signed long-lived URL. |
| `/api/admin/upload-access` and `/api/admin/upload-standards` | Owner-capability mutation, exact-account lookup, paginated grants/activity; guidance draft/test/publish/restore with optimistic version and audit event. |

Private object storage keys are environment/UID scoped and never returned to the client. Input: decode actual format and pixel count (≤40 MP), reject corrupt/animated formats, apply EXIF orientation, sRGB normalization, metadata removal and documented transparency flatten. Short edge <512 blocks; 512–999 warns. The normalized source is a creative reference, never the order front. Output: decoded, validated 17:22 1275×1650 master plus separate web rendition. Reject unintended text/mockup framing and unsafe crop with explicit visual review, recognizing semantic checks are fallible. Synthetic provider checks must verify actual reference bytes sent, no text-only downgrade, acceptable crop and private persistence. Provider adapter has a hard `generateWithReference({imageBytes,mime,lockedRules,creativeGuidance,senderDirection,region,operationId})` interface and returns `{bytes,mime,model,providerRequestId}` or a typed refusal/unavailable/unresolved outcome. Verify the current provider API and terms during implementation before the call is written; never infer support from the existing text-only path.

The compositor takes validated illustration bytes, exact Unicode text and allowlisted treatment/version. `composeFront({illustration,exactText,treatmentId,standardsVersion,expectedRevision})` returns master bytes, SHA-256 and immutable layout record with font file/version, glyph positions, color, bounds and region. Use licensed bundled fonts plus Unicode-aware shaping; preserve apostrophes, accents, case and intentional line breaks; unsupported glyphs fail. Templates make lettering prominent and image-aware (stack, arch, serif), sharing a quiet upper region for cheap revisions. Bounds, 5% application margin, contrast and meaningful-subject overlap are checked against flattened output. A treatment that needs another image region requires explicit new generation. Preview is derived from the same master; browser provisional text is never accepted.

Checkout accepts `uploadDesign: {designId,revision,masterSha256}` alongside legacy `frontImageUrl`, never both. For upload selection, `/api/checkout/create-intent` verifies token UID, active grant, accepted immutable revision and hash, and ignores client `userId` and `frontImageUrl` as authority. Persist `{source:'upload',designId,revision,masterSha256,ownerUid,privateMasterKey}` on the order with server-derived ownership, while using a safe sentinel `frontImageUrl` only if needed for legacy fields. `processPaidOrder` and its admin-comp path resolve this pinned private master to bytes immediately before the existing supplier upload, with no arbitrary URL fetch. Free order and paid intent paths share the check. The paid confirmation route reads the already pinned order; it does not reselect front art. Existing orders retain their old image URL path. Main owns these shared checkout/order changes and integration tests so lanes do not collide.

## Three disjoint Luna implementation lanes

| Lane | Exclusive files / deliverable | Handoff |
| --- | --- | --- |
| A — private backend and access | `lib/upload/contracts.ts`, `lib/upload/auth.ts`, `storage.ts`, `access.ts`, `standards.ts`, `quota.ts`, `assets.ts`; `app/api/upload/access`, `assets`, `previews`; `app/api/admin/upload-access`, `upload-standards`; focused auth/storage/admin tests. Private bucket, UID checks, account lookup, owner capabilities, audit, cleanup, immutable standards. | Export `requireUploadActor(req)`, `requireActiveGrant(uid,action)`, `getPrivateAsset(uid,id)`, `putPrivateAsset(uid,kind,bytes)`, `reserveGeneration(uid,operationId)`, `getActiveStandards()`, `putDesign(record)`, `getDesign(id)`, and `getPrivateMaster(key)`. Lane B imports these and owns no grant/storage implementation. |
| B — reference generation and lettering | `lib/upload/provider.ts`, `prompt.ts`, `generation.ts`, `composition.ts`, `fonts/**`, `treatments.ts`; `app/api/upload/generations`, `compositions`, `designs`; fixture tests. Verifies reference-image provider, locked instructions, bounded generation, output validation, three exact-text treatments, immutable accepted design. | Consumes A's service exports. Saves design records via A's `putDesign(record)` and exports `validateUploadCheckoutSelection(uid,selection)` and `readAcceptedMaster(designId,revision,hash)` for main, implemented using A's `getDesign(id)` and `getPrivateMaster(key)`. |
| C — mounted UI and draft integration | `app/create/upload/**`, `components/upload/**`, `app/account/page.tsx`, `app/admin/uploads/page.tsx`, `components/admin/UploadWorkspace.tsx`, `components/admin/ExecutiveShell.tsx`, `app/new/page.tsx`, `app/preview/entry/client.tsx`, `components/flow/EntryCardStep.tsx`, `lib/draft/**`; UI/component tests. Entitlement states, preview/revision UX, admin workspace, `/new` note handoff, schema migration and legacy hydration, change-front return. | Uses only route contracts. Persist `UploadSelection`, never blobs/URLs; image preview URL lives in memory. Exposes `getUploadCheckoutSelection(draft)` for main checkout adaptation. |

Main integration owner edits only `app/api/checkout/**`, `lib/order-processor.ts`, `lib/handwrytten.ts`, `lib/types.ts`, checkout shared contracts and deployment/config/test files, then resolves any contract mismatch with lane owners. Main also verifies hosted route and commit. No lane touches another lane's exclusive files.

## Implementation sequence

1. **Gate and contract:** Check staging runtime identity, storage bucket privacy, provider reference-image documentation and retention terms, font licenses/shaping path, current admin session and payment-mode safeguards. Freeze contracts and `Order.uploadDesign` shape. Fail closed if reference edits or private storage cannot be verified; do not misrepresent a text-only result as upload-based.
2. **Parallel build:** A implements secure data/access/standards, B builds reference pipeline and exact compositor on A's interfaces, C builds route and mounted `/new` handoff against mocked APIs. Main prepares checkout/order resolver and privacy copy using verified provider facts. Deploy no production config.
3. **Integrate:** Run focused route/security tests, compose fixtures for short/long/accented/line-broken text, ensure stale/revoked/cross-account selection cannot create paid or free intents, and verify preview hash equals accepted master hash. Exercise idempotent retries, refresh, quota, pause and account switching. Test desktop/mobile 320/390/768/1024 and keyboard/focus/live status on mounted UI.
4. **Stage:** Build/typecheck, run bounded synthetic reference edits (one or two), check private object access and no metadata leaks, deploy exact commit to `sendmynotes-staging`, inspect live runtime and browser route. Founder can grant an existing staging account and complete flow through checkout review using safe mock payment conditions. Do not invoke fulfillment scripts or supplier APIs as QA.

## Files summary

New: `lib/upload/**`, `app/api/upload/**`, admin upload APIs, `app/create/upload/**`, upload/admin components, bundled fonts and tests. Changed: account/admin navigation, mounted `/new` and `EntryPrototypeClient`, draft types/reducer/store and legacy hydration, `EntryCardStep`, checkout intent and order model/processor, supplier cover byte boundary, privacy page and staging config. Existing `lib/nano-banana.ts` and `lib/image-optimizer.ts` remain the public text-only path, with no upload reuse that can publish source imagery.

## Definition of done

- An eligible staging account can upload each supported format, obtain actual reference-based art, edit exact prominent wording in three tested treatments, accept the final composition, and retain the same accepted master through note, address, review and checkout intent.
- No guest, expired/revoked account, cross-UID caller, stale revision or arbitrary URL can access private bytes or order upload art. Owner-only admin mutations are environment-scoped, versioned, audited and idempotent. Grant does not grant admin or free cards.
- Checkout and later order processing use one immutable composition hash; no source image or text-only fallback is orderable. Front changes preserve draft content and invalidate/recalculate checkout offer/intent as needed.
- Focused tests, typecheck/build, real mounted browser checks, synthetic provider capability check, and hosted staging smoke pass. Staging serves the exact planned commit; production untouched. No physical mail, live charge, customer message or unsanitized image exposure.

## Risks, dependencies, open questions

- **Provider capability/cost/retention:** Verify the current image-input request and response against primary provider documentation and a bounded synthetic call. If unsupported, leave generation unavailable and do not release the studio as working. Document terms before privacy text or wider grants.
- **Typography:** Font license, shaping, arch layout and contrast are implementation gates; ship only treatments that pass fixture and human visual review. The three approved names must have real distinct layouts, including a prominent Thank You fixture.
- **Private storage and order bridge:** A usable private bucket and server-side byte resolver are mandatory. Existing `frontImageUrl` and Handwrytten URL code are unsafe authority for upload designs. No supplier call is a validation method.
- **Checkout timing:** Revocation should block creation of a new intent while leaving an already authorized order intact; define this boundary in tests. Payment retries must reuse the pinned design. The builder may have active legacy draft data; migrate it rather than clearing content.
- **Deferred polish:** Arbitrary source inspection by admins, custom hand lettering, arbitrary text placement, HEIC/animation, invitation email, and measured conversion claims are outside this coherent staging beta. Capture them as later work, not silent simulated behavior.
