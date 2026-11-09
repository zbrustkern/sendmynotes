# Manual order email — November 9, 2026

The founder requested individual, deliberate admin follow-ups, including founder/family paid orders, with no automatic sends and sensitivity to sympathy occasions. This implementation is separate from the existing optional two-message sequence.

## Operator experience

Open Admin → Orders → an order → Personal email from you. **Generate personal note** creates or restores one draft for that captured sender email. It never overwrites edits, sends an email, creates an offer, changes purchase classification, or enrolls automation. Edit the subject and note, save changes, expand the email preview, and explicitly choose **Send this email now**. Founder/test orders also require acknowledgment that this is an intentional email test.

Unknown marketing permission permits a personal service note about this card or sending experience. Promotional messages require the operator to select the promotional purpose and a recorded opt-in. Unsubscribed, bounced, complained, or explicitly denied contacts are suppressed. No permission is manufactured by manual sending. The operator must classify added sales copy honestly; this is not a content-classification model.

The default sympathy/loss note is quiet, offers help, and says there is no need to reply. No draft assumes delivery, an independent purchase, or an occasion recipient's name. Only structured occasion metadata and sender first name are used; private card text is not sent to a model. Draft generation is deterministic and incurs no AI-provider call.

One message per order is supported in this version. Accepted messages cannot be edited or sent again. Additional conversations can continue through the reply mailbox. A declined/ambiguous transport outcome is held for reconciliation, never blindly retried. The signed Resend webhook can establish acceptance and delivery outcomes after an interrupted request. Provider acceptance is shown distinctly from inbox delivery.

## Runtime configuration

The production and staging manifests default `MANUAL_FOLLOWUP_DELIVERY_ACTIVE=false`. Manual sending has its own flag; keep `POST_PURCHASE_DELIVERY_ACTIVE=false` and `POST_PURCHASE_AUTO_ENROLL_ACTIVE=false` and account reminders disabled.

Before enabling manual production sending:

- Bind the existing production-specific `POST_PURCHASE_SENDER_HMAC_KEY` and `POST_PURCHASE_UNSUBSCRIBE_SECRET` (32+ characters).
- Set the approved `POST_PURCHASE_SENDER_EMAIL`, `POST_PURCHASE_REPLY_TO`, and exact `POST_PURCHASE_BUSINESS_POSTAL_ADDRESS`. The receipt identity `orders@sendmynotes.com` is a compatibility fallback, not approval to use it instead of the founder's selected personal mailbox. The founder selected `zeke@sendmynotes.com`; verify it receives/forwards replies before activation.
- Reuse the existing live `RESEND_API_KEY`/`resend-key`; mock or absent credentials fail closed.
- Bind `RESEND_WEBHOOK_SECRET` and verify the Resend subscription targets `/api/webhooks/resend` for sent/delivered/delayed/bounced/complained/suppressed/failed events. Merely setting a secret does not create a provider webhook.
- Keep `NEXT_PUBLIC_APP_URL` on the public HTTPS production origin. Existing unsubscribe routes handle visible and one-click opt-out.
- Activate only the manual flag after setup; the first controlled inbox send is a separately performed operational check. No email was sent during implementation.

No new Firestore composite index is needed: one deterministic document per order in `manual_followup_messages`, existing default single-field `resendId` lookup, and server-only rules already deny all browser collection access. No cron or automatic queue reads this collection. Durable documents include authenticated operator identity, revision, frozen destination/payload hash, provider key and outcome. Preserve them on rollback.

## Validation

- Isolated fake-provider suite exercises generation/edit preservation, sympathy copy, stale revisions, double-click concurrency, immutable accepted state, unknown-permission service sends, promotional opt-in, founder acknowledgment, disabled production/staging flags, changed destinations, unsubscribe suppression, ambiguous outcomes, signed webhook recovery/bounce suppression, authorization, cross-origin rejection, masking, and unchanged acquisition/automation records. A component harness proves old-order generate/save responses cannot replace the new order after A→B navigation. Concurrent signed complaint/delivery events accumulate facts without losing the negative outcome.
- Existing post-purchase operator, dispatch, signed Resend webhook and CLI suites pass in fresh mock stores with external network blocked.
- TypeScript check and the final production build pass on the integrated e43199a baseline (including canonical facts PR #10). The build used external transport denial; no live database/provider request or email was used.
- Browser check used the actual React composer with an isolated synthetic fetch fixture. Verified generation, edit/save, exact copy preview, required acknowledgments and locked provider-accepted state. `synthetic-accepted.jpg` contains fictional data. This proves UI behavior, not real inbox delivery or hosted authenticated integration.

## Recovery

For `dispatching` or `uncertain`, inspect the existing provider history and signed webhook evidence against the stored message ID/idempotency key. Do not regenerate/delete the record or dispatch another message to clear a hold. This version deliberately exposes no force-resend button. If the provider outcome cannot be proven, leave it held. Unsubscribe/suppression endpoints and provider webhooks must remain active when new manual sends are disabled.

## Deployment handoff

Parent verified production sender/opt-out secrets exist and granted the backend access. The production manifest binds `post-purchase-sender-hmac-key@1` and `post-purchase-unsubscribe-secret@1`, and selects `zeke@sendmynotes.com` for sender/reply-to. All delivery/automatic flags remain false. No personal street address or city-only substitute is inserted.

Activation remains blocked by the exact postal footer, confirmed receiving/forwarding for the reply mailbox, and Resend webhook setup. The existing Resend runtime key is sending-only: read-only domain/webhook inventory returned 401 `restricted_api_key`; the browser dashboard was not signed in. An authenticated dashboard or appropriate operator credential is needed to configure the subscription and obtain its signing secret. No nonexistent webhook secret is bound by this change. These setup gaps do not prevent drafting/editing/preview in the deployed admin.
