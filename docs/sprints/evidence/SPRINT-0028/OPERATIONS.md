# Multi-send operations and release gates

## Local execution boundary

Implementation started from `8940401` in `/private/tmp/sendmynotes-sprint0028-8940401`. Three `gpt-6-luna` agents handled editor/draft, checkout, and fulfillment; the parent reviewed their changes and integrated customer/support views. The source checkout was not used for tests or fulfillment. Local tests deny external HTTP and SDK sockets, use isolated mock Firestore stores, synthetic payment facts and injected supplier/refund adapters. No staging or production release is authorized by this packet.

## Before any staged release

- Record the reviewed implementation commit and its build/test evidence. Deploy a compatible reader/worker together; keep `system_config/feature_flags.flags.multiSendEnabled` false until the release decision.
- Deploy the checked-in Firestore index for `orders.fulfillmentStatus ASC, updatedAt ASC` and the delivery collection-group `supplierOrderId` index. Browser Firestore access remains denied by the existing recursive rule; checkout groups and delivery children are server-only.
- Assign an operator and scheduler owner. Configure an authenticated POST trigger for `/api/cron/multi-send-dispatch` with the dedicated worker secret, bounded invocation size and no overlapping scheduler jobs. Prove authorization denial and successful authenticated invocation in the intended environment.
- In staging, retain `STAGING_REVIEW_ONLY=true` and supplier test guards. Test UI/read paths using isolated records. Live payment, email, refund and supplier tests require separate authorization; local fake-provider evidence is not hosted integration evidence.
- Prove browser closure and repeated payment webhook recovery: one captured parent remains queued and is eventually seen by the worker. Prove missing indexes, invalid credentials and worker failures produce an operator-visible signal. No hosted monitoring or scheduler has been installed by this sprint execution.
- Confirm the proposed commercial defaults (2–25 complete US recipients, immediate sending, $9/card, one eligible single-card offer benefit once), refund policy and named support owner before exposure.
- Confirm supplier card reuse/environment identity, account-specific cost, safe concurrency and reliable rejection/status meanings. Supplier idempotency, physical handwriting fit and holiday arrival remain unverified. Apple Pay end-to-end remains unverified.

## Support procedure

Open the parent in the Orders investigation drawer. Review each child status independently. Reveal private content through the existing audited PII action with an operational reason. The purchased greeting/message is immutable; an address correction must preserve that text.

- **Being prepared / accepted:** do not send again. A recorded supplier ID permits a read-only status check. Acceptance is not evidence of mailing.
- **Needs attention · not sent:** after confirming rejection, either correct this child's address with a reason and explicit billable-dispatch consent, or refund its allocated payment. State/version and idempotency checks reject stale or conflicting actions. Never retry the whole parent.
- **Checking this card:** hold all resend/correction actions for that child. Read a recorded supplier ID where available. If no reliable supplier correlation exists, escalate to the supplier/operator investigation; uncertainty is not evidence of non-acceptance.
- **Refund being checked:** keep its allocation reserved. Use the read-only refund reconciliation action; an unknown result must not trigger another refund create request. Verify provider ID, parent payment, currency, mode and amount before recording a result. Do not manually reset a child to pending.
- **Held parent:** resolve the operational/environment/capture problem, then use **Resume pending cards** with a reason. The route verifies live capture and allocations, requires dispatch to be unpaused, preserves accepted/uncertain child states, and refuses ambiguous shared-art preparation. It never resets a whole batch to pending.
- **Preparation uncertain:** hold shared artwork recreation. Investigate provider correlation before deciding a safe recovery. A process crash cannot prove artwork was never created.

Review queued/held parents and failed worker responses. Alert requirements before live use: oldest paid unprocessed order, preparation uncertainty, dispatch uncertainty, refund uncertainty, missing worker heartbeat, index/query failure and repeated authentication/billing failures. Record thresholds and escalation owner in the environment's deployment packet; these are launch requirements, not claims that alerts exist.

## Stop and rollback

Turn off the multi-send acceptance flag to stop new purchases. Existing paid parents must retain compatible readers, payment webhooks, reconciliation and workers. Separately pause physical fulfillment when supplier behavior is unsafe; acceptance shutdown alone must not strand paid cards.

Inventory unpaid parent intents and cancel or settle them with verified provider state before claiming sales have stopped. Late capture remains a paid immutable parent requiring fulfillment or reconciliation. Do not delete parents, children, capture facts or refund facts. Do not roll back to an older binary that only understands single-card orders.

## Evidence to add before sign-off

The execution summary must link implemented 320/390/768/1280 px screenshots, keyboard/unsaved-editor checks, focused state/race/privacy tests, relevant regressions, typecheck and production build. Every unmet acceptance-matrix item stays open; disabled-by-default is not a substitute for completing required scope.
