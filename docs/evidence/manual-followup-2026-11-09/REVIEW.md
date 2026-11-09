# Manual individual email — November 9, 2026

The founder requested individual, deliberate admin follow-ups, including founder/family paid orders, with no automatic sends and sensitivity to sympathy occasions. This implementation is separate from the existing optional two-message sequence.

## Operator experience

Open Admin → Orders → an order → Personal email from you. **Generate personal note** creates or restores one draft for that captured sender email. It never overwrites edits, sends an email, creates an offer, changes purchase classification, or enrolls automation. Edit the subject and note, save changes, expand the email preview, and explicitly choose **Send this email now**. Founder/test orders also require acknowledgment that this is an intentional email test.

Unknown marketing permission permits a personal service note about the selected card, sending experience, submitted feedback, or account. Promotional messages require the operator to select the promotional purpose and a recorded opt-in. Unsubscribed, bounced, complained, or explicitly denied contacts are suppressed. No permission is manufactured by manual sending. The operator must classify added sales copy honestly; this is not a content-classification model.

The default sympathy/loss note is quiet, offers help, and says there is no need to reply. No draft assumes delivery, an independent purchase, or an occasion recipient's name. Only structured occasion metadata and sender first name are used; private card text is not sent to a model. Draft generation is deterministic and incurs no AI-provider call.

One message per selected source record (order, feedback, or account) is supported in this version. Accepted messages cannot be edited or sent again. Additional conversations can continue through the reply mailbox. A declined/ambiguous transport outcome is held for reconciliation, never blindly retried. The signed Resend webhook can establish acceptance and delivery outcomes after an interrupted request. Provider acceptance is shown distinctly from inbox delivery.

## Runtime configuration

The production and staging manifests default `MANUAL_FOLLOWUP_DELIVERY_ACTIVE=false`. Manual sending has its own flag; keep `POST_PURCHASE_DELIVERY_ACTIVE=false` and `POST_PURCHASE_AUTO_ENROLL_ACTIVE=false` and account reminders disabled.

Before enabling manual production sending:

- Bind the existing production-specific `POST_PURCHASE_SENDER_HMAC_KEY` and `POST_PURCHASE_UNSUBSCRIBE_SECRET` (32+ characters).
- Set the approved `POST_PURCHASE_SENDER_EMAIL`, `POST_PURCHASE_REPLY_TO`, and exact `POST_PURCHASE_BUSINESS_POSTAL_ADDRESS`. The receipt identity `orders@sendmynotes.com` is a compatibility fallback, not approval to use it instead of the founder's selected personal mailbox. The founder selected `zeke@sendmynotes.com`; verify it receives/forwards replies before activation.
- Reuse the existing live `RESEND_API_KEY`/`resend-key`; mock or absent credentials fail closed.
- Bind `RESEND_WEBHOOK_SECRET` and verify the Resend subscription targets `/api/webhooks/resend` for sent/delivered/delayed/bounced/complained/suppressed/failed events. Merely setting a secret does not create a provider webhook.
- Keep `NEXT_PUBLIC_APP_URL` on the public HTTPS production origin. Existing unsubscribe routes handle visible and one-click opt-out.
- Activate only the manual flag after setup; the first controlled inbox send is a separately performed operational check. No email was sent during implementation.

The contact list requires a `COLLECTION`-scope index containing only `__name__ DESCENDING` for **both `user_feedback` and `users`**. Deploy the entries in `firestore.indexes.json` and wait for READY before checking the authenticated list. The initial local mock tests did not exercise Firestore's index requirement; production authenticated verification returned 503, and read-only live structured queries identified `FAILED_PRECONDITION` for these missing indexes. The Firestore API accepted their additive creation in production and staging on November 9. The readiness matcher now preserves direction for name-only indexes, rather than stripping the only field as if it were an implicit composite tiebreaker. Production/staging READY and hosted UI verification are recorded separately by the deployment operator.

Draft lookup uses one deterministic document per source record in `manual_followup_messages`; provider reconciliation uses the existing default single-field `resendId` index. Server-only rules deny all browser collection access. No cron or automatic queue reads this collection. Durable documents include authenticated operator identity, revision, frozen destination/payload hash, provider key and outcome. Preserve them on rollback.

## Validation

- Isolated fake-provider suite exercises generation/edit preservation, sympathy copy, stale revisions, double-click concurrency, immutable accepted state, unknown-permission service sends, promotional opt-in, founder acknowledgment, disabled production/staging flags, changed destinations, unsubscribe suppression, ambiguous outcomes, signed webhook recovery/bounce suppression, authorization, cross-origin rejection, masking, and unchanged acquisition/automation records. A component harness proves old-order generate/save responses cannot replace the new order after A→B navigation. Concurrent signed complaint/delivery events accumulate facts without losing the negative outcome.
- Existing post-purchase operator, dispatch, signed Resend webhook and CLI suites pass in fresh mock stores with external network blocked.
- TypeScript check and the final production build pass on the integrated e43199a baseline (including canonical facts PR #10). The build used external transport denial; no live database/provider request or email was used.
- Browser check used the actual React composer with an isolated synthetic fetch fixture. Verified generation, edit/save, exact copy preview, required acknowledgments and locked provider-accepted state. `synthetic-accepted.jpg` contains fictional data. This proves UI behavior, not real inbox delivery or hosted authenticated integration.

## Recovery

For `dispatching` or `uncertain`, inspect the existing provider history and signed webhook evidence against the stored message ID/idempotency key. Do not regenerate/delete the record or dispatch another message to clear a hold. This version deliberately exposes no force-resend button. If the provider outcome cannot be proven, leave it held. Unsubscribe/suppression endpoints and provider webhooks must remain active when new manual sends are disabled.

## Deployment handoff

Parent verified production sender/opt-out secrets exist and granted the backend access. The production manifest binds `post-purchase-sender-hmac-key@1` and `post-purchase-unsubscribe-secret@1`, and selects `zeke@sendmynotes.com` for sender/reply-to. All delivery/automatic flags remain false. No personal street address or city-only substitute is inserted.

Activation remains blocked by the exact postal footer and confirmed receiving/forwarding for the selected reply mailbox. Initially the sending-only runtime API key could not list domains/webhooks. The parent subsequently created the Resend subscription through the authenticated dashboard: `4eebae63-ec3d-4341-a7fb-575687348559`, targeting `https://sendmynotes.com/api/webhooks/resend` for sent, delivered, delivery_delayed, failed, bounced, complained and suppressed events. The parent also verified `sendmynotes.com` is verified in Resend. Because the provider account serves another product, signed events with an explicit sender outside `@sendmynotes.com` are ignored before inbox persistence; legacy events without a sender remain compatible and message IDs still resolve only to known local records. Production `resend-webhook-secret@1` is bound in this manifest; no secret value is recorded here. An independent unused random secret with the same resource name/version exists in staging solely for manifest compatibility. No subscription targets staging and the production signing secret was not copied. These changes do not enable sending; no live email or real webhook delivery test was performed.


## Captured-email coverage

The composer supports all persisted orders with a usable sender email, including unpaid/abandoned checkout orders; no paid-status gate is applied. In Orders, use **Unpaid / In Cart**, open the order journey, then generate a personal email. The service regression explicitly verifies an unpaid, unknown-permission order can be manually sent using a synthetic transport without changing payment state or creating marketing permission. Checkout contact capture writes to the order before payment. The existing contact policy continues to honor an explicitly cleared/no-email choice.

Admin → **Other contacts** covers feedback-only contacts in `user_feedback` and account-only sender emails in `users`, using a source selector and a bounded, paginated, masked list. Opening a feedback contact shows up to 5,000 characters of submitted feedback, an 80-character category and valid 0–5 rating privately to authenticated admins as plain JSX text; browser metadata and unrelated record fields are not exposed. Feedback context is never inserted into generated email or sent to a model. Account contacts expose no saved addresses, address book, or private profile fields. Both use neutral source-specific support copy and server-resolved destinations. Source type and source ID together define draft identity, preventing collisions across collections. The destination is rechecked in the claim transaction, and all sources share existing email suppression.

No separate lead/newsletter capture collection was found. Coverage is persisted **sender/contact** emails in orders, feedback and account profiles, not recipient/address-book contacts or raw Firebase Auth identities without an application record. No source record, purchase classification, automation enrollment or marketing permission is modified by this workflow.

Parent also provisioned independent signing/opt-out secrets with the same resource names and version in `sendmynotes-staging` and granted its backend access, so inherited production manifest bindings will resolve on future merges. No staging deployment or sending was performed by this patch.


## Final expanded validation

The final regression run covers order/feedback/account source isolation, unpaid service follow-ups, changed destinations, feedback suppression, marketing opt-in, untouched source records, bounded/private contact pagination, safe feedback rendering, cross-source stale response races, and mounting the correct composer from both contact-list sources. Existing operator, dispatch, signed webhook and CLI suites pass. The production build also passes after the source extension. All provider activity in tests used fake transports with external network denial. `synthetic-feedback.jpg` verifies a fictional feedback contact, private context, neutral draft/preview and disabled sending in the actual React components; it does not demonstrate hosted authentication or inbox delivery.


## Production verification and contact-index repair

The parent verified production source `2e44b6a` is READY with 100% traffic. Anonymous admin endpoints return 401, unsigned webhook calls return 400, and a signed synthetic webhook for a nonexistent message returns 200 without sending mail. All sending flags remain false. See `production-rollout.json` and `production-smoke.json` for sanitized evidence.

Authenticated contact-list verification exposed the missing descending name-only indexes described above. Their creation was accepted in both projects; at this handoff they are CREATING and the successful hosted contact-list UI recheck is still pending. The repair commit changes only the index manifest, readiness matching/tests, and evidence; it does not require an application runtime change. The offline readiness contract test passes (`contact-index-contract.txt`).
