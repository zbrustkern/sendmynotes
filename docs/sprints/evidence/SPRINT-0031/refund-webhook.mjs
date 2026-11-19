// Operates on a verified, already-refunded staging cohort.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const EVENTS = ["refund.created", "refund.updated"];
const URLS = new Set([
  "https://staging.sendmynotes.com/api/webhooks/stripe",
  "https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app/api/webhooks/stripe",
]);

function check(value, error) {
  if (!value) throw Object.assign(new Error(error), { code: error });
}

export function selectEndpoint(endpoints) {
  const matching = endpoints.filter(endpoint => URLS.has(endpoint.url));
  const [endpoint] = matching;
  check(matching.length === 1 && endpoint.livemode === false &&
    endpoint.status === "enabled" && /^we_[A-Za-z0-9]+$/.test(endpoint.id),
    "unique_enabled_staging_test_endpoint");
  return endpoint;
}

export function targetRefundEvents(events, job, intent) {
  return events.filter(event => {
    const refund = event.data?.object;
    return event.livemode === false && !event.account && EVENTS.includes(event.type) &&
      /^evt_[A-Za-z0-9]+$/.test(event.id) && refund?.id === job.providerId &&
      refund.payment_intent === intent.id && refund.amount === 1200 &&
      refund.currency === "usd" && refund.metadata?.weddingRefundId === job.id &&
      refund.metadata?.weddingBatchId === job.batchId;
  });
}

function enabledSet(endpoint) {
  return [...new Set(endpoint.enabled_events)].sort();
}

function immutableConfiguration(endpoint) {
  return JSON.stringify([endpoint.id, endpoint.url, endpoint.status, endpoint.application,
    endpoint.api_version, endpoint.created, endpoint.description, endpoint.livemode,
    Object.entries(endpoint.metadata || {}).sort()]);
}

function resend(key, endpoint, event, attempt) {
  const runner = spawnSync("stripe", [
    "events", "resend", event.id, "--webhook-endpoint=" + endpoint.id,
    "--idempotency=sprint0031-h099-" + event.id + "-" + attempt,
    "--confirm", "--color=off",
  ], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, STRIPE_API_KEY: key, STRIPE_CLI_TELEMETRY_OPTOUT: "1" },
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 50000, maxBuffer: 65536,
  });
  const standard = String(runner.stdout || "").trim();
  let apiError;
  try { apiError = JSON.parse(standard.slice(standard.indexOf("{"))).error; } catch {}
  if (runner.status === 0 && !apiError) return { ok: true };

  // Only a bounded error code and category may leave the provider subprocess.
  const low = [apiError?.message, runner.stderr, standard].join(" ").toLowerCase();
  const code = String(apiError?.code || low.match(/"code"\s*:\s*"([a-z0-9_]{1,45})"/)?.[1] || "");
  const reasons = [
    [/previously.*(?:deliver|sent|attempt)|never.*(?:deliver|sent|attempt)|original.*(?:endpoint|deliver)|before.*subscrib|not (?:eligible|configured).*resend/, "no_original_delivery"],
    [/already/, "already_delivered"], [/permission|privilege/, "provider_permission"],
    [/subscribe|not enabled/, "event_precedes_subscription"], [/unknown flag/, "unsupported_cli_flag"],
    [/cannot|could not|unable to|not found|does not exist/, "provider_declined"],
    [/authentication|api key/, "provider_authentication"],
  ];
  const reason = reasons.find(([pattern]) => pattern.test(low))?.[1] || "provider_cli_unavailable";
  return { ok: false, reason, ...(/^[a-z0-9_]{1,45}$/.test(code) ? {providerCode: code} : {}) };
}

async function checkInbox(db, event, intent, prior) {
  const ref = db.collection("provider_webhook_inbox").doc("inbox_stripe_" + event.id);
  for (let attempt = 0; attempt < 18; attempt++) {
    const row = (await ref.get()).data();
    const summary = row?.payloadSummary;
    if (row?.status === "processed" && row.provider === "stripe" && row.providerEventId === event.id &&
        row.eventType === event.type && summary?.signatureVerified === true && summary.livemode === false &&
        summary.paymentIntentId === intent.id && summary.objectId === event.data.object.id &&
        summary.eventId === event.id && summary.type === event.type &&
        (!prior || (row.processedAt === prior.processedAt && row.attempts === prior.attempts))) return row;
    if (attempt < 17) await delay(2500);
  }
  return null;
}

async function duplicateLog(token, event, since) {
  const needle = "Duplicate Stripe webhook " + event.id + " (" + event.type + ")";
  const filter = [
    'resource.type="cloud_run_revision"', 'resource.labels.service_name="sendmynotes-staging"',
    'timestamp>="' + new Date(since - 2000).toISOString() + '"',
    '(textPayload:' + JSON.stringify(needle) + ' OR jsonPayload.message:' + JSON.stringify(needle) + ')',
  ].join(" AND ");
  for (let attempt = 0; attempt < 18; attempt++) {
    const response = await fetch("https://logging.googleapis.com/v2/entries:list", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: {authorization: "Bearer " + token, "content-type": "application/json", "x-goog-user-project": "sendmynotes-staging"},
      body: JSON.stringify({resourceNames: ["projects/sendmynotes-staging"], filter, pageSize: 5}),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result.entries?.some(entry => (entry.textPayload || entry.jsonPayload?.message || "").includes(needle))) return true;
    if (attempt < 17) await delay(2500);
  }
  return false;
}

async function verifyDelivery({db, intent, token, stripeKey, endpoint, event}) {
  const result = {
    type: event.type, eventFingerprint: createHash("sha256").update(event.id).digest("hex").slice(0, 16),
    outcome: "pending", signedInbox: false, duplicateVerified: false,
  };
  const initial = resend(stripeKey, endpoint, event, "initial");
  if (!initial.ok) return {...result, outcome: initial.reason, providerCode: initial.providerCode};
  const accepted = await checkInbox(db, event, intent);
  if (!accepted) return {...result, outcome: "provider_accepted_inbox_pending"};
  Object.assign(result, {signedInbox: true, signatureVerified: true, providerEventIdMatched: true});
  const since = Date.now();
  const duplicate = resend(stripeKey, endpoint, event, "replay");
  if (!duplicate.ok) return {...result, outcome: duplicate.reason, providerCode: duplicate.providerCode};
  result.duplicateVerified = Boolean(await duplicateLog(token, event, since) && await checkInbox(db, event, intent, accepted));
  result.outcome = result.duplicateVerified ? "signed_and_deduplicated" : "duplicate_receipt_unverified";
  return result;
}

export async function wireAndReplay({sdk, db, job, pi, token, stripeKey, lastRef, pRef, subscribeOnly}) {
  check(job?.status === "succeeded" && job.cents === 1200 && job.paymentIntentId === pi.id &&
    /^re_[A-Za-z0-9]+$/.test(job.providerId) && pi.livemode === false &&
    pi.latest_charge.amount_refunded === 1200 && /^(?:rk|sk)_test_/.test(stripeKey), "existing_test_refund_required");

  const endpoints = [];
  for await (const found of sdk.webhookEndpoints.list({limit: 100})) endpoints.push(found);
  const selected = selectEndpoint(endpoints);
  const endpoint = await sdk.webhookEndpoints.retrieve(selected.id);
  const original = enabledSet(endpoint);
  const union = [...new Set([...original, ...EVENTS])].sort();
  check(immutableConfiguration(endpoint) === immutableConfiguration(selected) &&
    JSON.stringify(original) === JSON.stringify(enabledSet(selected)), "endpoint_changed_before_update");
  check(!original.includes("*"), "explicit_selected_events_required");
  check(subscribeOnly || original.length === union.length, "subscription_required");
  if (subscribeOnly && original.length !== union.length) {
    const digest = createHash("sha256").update(endpoint.id + JSON.stringify(union)).digest("hex");
    await sdk.webhookEndpoints.update(endpoint.id, {enabled_events: union}, {idempotencyKey: "sprint0031-refund-events-" + digest});
  }
  const saved = await sdk.webhookEndpoints.retrieve(endpoint.id);
  check(immutableConfiguration(saved) === immutableConfiguration(endpoint) &&
    JSON.stringify(enabledSet(saved)) === JSON.stringify(union), "verified_subscription_union");
  const receipt = {
    checkedAt: new Date().toISOString(), livemode: false, endpoint: saved.url, subscriptionUnionVerified: true,
    preservedPriorEventCount: original.filter(type => !EVENTS.includes(type)).length,
    subscribedRefundEvents: EVENTS, persistedEvents: enabledSet(saved), eventDeliveries: [], configuration: "enabled",
  };
  if (subscribeOnly) return receipt;

  const candidates = [];
  const created = {gte: Math.floor(job.createdAt / 1000) - 60, lte: Math.floor(Date.now() / 1000) + 1};
  for await (const event of sdk.events.list({types: EVENTS, created, limit: 100})) {
    if (targetRefundEvents([event], job, pi).length) candidates.push(event);
  }
  for (const type of EVENTS) check(candidates.filter(event => event.type === type).length <= 1, "multiple_matching_events_require_review");
  for (const type of EVENTS) {
    const event = candidates.find(candidate => candidate.type === type);
    receipt.eventDeliveries.push(event
      ? await verifyDelivery({db, intent: pi, token, stripeKey, endpoint, event})
      : {type, outcome: "no_existing_provider_event"});
  }
  const [batchDoc, projectDoc, after, refunds] = await Promise.all([lastRef.get(), pRef.get(),
    sdk.paymentIntents.retrieve(pi.id, {expand: ["latest_charge"]}), sdk.refunds.list({payment_intent: pi.id, limit: 2})]);
  const batch = batchDoc.data();
  const project = projectDoc.data();
  check(batch?.refundedCents === 1200 && batch.refundReservedCents === 0 && project?.purchasedCount === 100 &&
    after.livemode === false && after.latest_charge?.amount_refunded === 1200 && refunds.data.length === 1 &&
    refunds.data[0].id === job.providerId && !refunds.has_more, "unchanged_single_refund");
  return {...receipt, refundedCents: 1200, refundCount: 1, retainedBeforeFeesCents: 73000, purchasedOrdinals: 100};
}
