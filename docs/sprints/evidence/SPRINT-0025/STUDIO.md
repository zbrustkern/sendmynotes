# Sprint 0025 W5 — Upload Studio evidence

## Implemented

- Added owner/source-scoped Studio session metadata with a hard three-successful-version tray. Session records contain only source/design/generation IDs and editable prompt, exact lettering, treatment, checksum and acceptance metadata; no private object key, URL, token or preview blob is persisted.
- Composition records a version only after a successful design is stored. Tray selection is a server-validated pointer update and returns private metadata; it does not generate or overwrite a design. A failed generation never records a version or removes existing versions; beginning a new candidate clears only its generation ID/status and keeps the previous accepted design and tray selection available. A fourth success evicts the oldest unaccepted/unordered design by tombstoning it and deleting its temporary object; cleanup retries failures. Accepted or ordered masters are not evicted.
- Added authenticated routes to list/select the tray and open an accepted design for editing. Edit context requires the active owner grant and an unexpired private source, and exposes no storage key. Expired-source guidance links to Saved images only as a recovery location; it does not claim a saved copy exists.
- Preserved generation prompts with the server-side generation record so a refreshed Studio can restore the editable prompt. The existing upload-design ID remains the builder handoff; Studio accepts `editDesign` and returns through `/new?uploadDesign=…&uploadEdit=1` only after the revised front is explicitly accepted. Cancel restores the old tray pointer when possible and uses browser history only for a same-origin builder referrer; copied edit links fall back to `/new`.
- Studio now shows up to three versions, Original/Result comparison, blank exact lettering with five opt-in starter chips, a confirmation before replacing entered words, prompt-text conflict guidance, HEIC/HEIF export guidance, and an expandable sticky mobile preview. The source preview uses `contain`; final artwork keeps the 17:22 crop.
- Temporary tray documents expire with the temporary source; upload cleanup skips accepted/ordered designs, and explicit temporary-source deletion preserves accepted/ordered design masters so source expiry cannot break an already accepted cover.

## Focused verification

Passed:

- `NODE_ENV=test node --import tsx tests/upload-creative.test.ts`
- `NODE_ENV=test node --import tsx tests/upload-access.test.ts`
- `NODE_ENV=test node --import tsx tests/upload-routes-security.test.ts`
- `NODE_ENV=test node --import tsx tests/upload-studio-session.test.ts`

Coverage includes likely text-request detection without flagging an ordinary “person writing a letter” scene, HEIC guidance matching, five starter choices, safe edit-cancel navigation, preservation of the selected accepted front when beginning another generation, four successful compositions bounded to three owner/source entries, accepted-version availability after a failed attempt, refresh and persisted selection, rejection of cross-origin selection and foreign owners, grant revocation, explicit expired-source recovery messaging, edit context excluding private master keys, selecting a version without a generation request, and preserving accepted design masters after temporary source deletion.

## Integration and remaining evidence

The builder entry tile and shared `EntryCardStep` edit action remain coordinator-owned. The requested seam is `/create/upload?editDesign=<designId>&returnTo=builder`; cancel uses browser history, while accepted output uses the established `uploadDesign` query contract and adds `uploadEdit=1` for the coordinator to invalidate stale acceptance/quote state only when the selected front changed. No builder/shared order-master files were edited.

No build or TypeScript run was performed, per lane instructions. No image-generation provider, external email, payment, fulfillment or external mutation was invoked. Real iPhone capture, responsive browser review, keyboard/screen-reader review and the complete Studio → builder → Studio path remain for coordinator staging acceptance; this report does not claim those gates passed.

