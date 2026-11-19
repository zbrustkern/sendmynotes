/** Local staging-IAM operator used only by hosted-finance.mjs. No HTTP admin surface. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const project = "sendmynotes-staging";
const service =
  "projects/" + project + "/locations/us-central1/services/" + project;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const batchPattern = new RegExp("^wb_" + uuid + "$");
function check(value, reason) {
  if (!value) throw new OperatorRefusal(reason);
}
class OperatorRefusal extends Error {}
export function verifyOperatorInput(input) {
  check(
    input &&
      new RegExp("^wp_" + uuid + "$").test(input.projectId) &&
      batchPattern.test(input.firstId) &&
      batchPattern.test(input.lastId) &&
      input.firstId !== input.lastId &&
      /^wh_[a-f0-9]{32}$/.test(input.householdId) &&
      new RegExp("^" + uuid + "$").test(input.runId),
    "fixture_identity",
  );
}
export function boundStripeVersion(revision, projectNumber) {
  check(/^\d+$/.test(projectNumber), "staging_project_number");
  const env = new Map(
    (revision.containers?.[0]?.env || []).map((e) => [e.name, e]),
  );
  for (const [name, value] of Object.entries({
    STAGING_REVIEW_ONLY: "true",
    HANDWRYTTEN_TEST_MODE: "true",
    WEDDING_CHECKOUT_ENABLED: "true",
    FIREBASE_PROJECT_ID: project,
  })) {
    check(env.get(name)?.value === value, "serving_revision_flags");
  }
  check(
    env.get("STRIPE_PUBLISHABLE_KEY")?.value?.startsWith("pk_test_"),
    "test_publishable_key",
  );
  const ref = env.get("STRIPE_SECRET_KEY")?.valueSource?.secretKeyRef;
  check(
    ref &&
      [
        "stripe-secret-key",
        "projects/" + project + "/secrets/stripe-secret-key",
        "projects/" + projectNumber + "/secrets/stripe-secret-key",
      ].includes(ref.secret) &&
      /^(?:[1-9]\d*|latest)$/.test(ref.version),
    "explicit_staging_secret_binding",
  );
  return (
    "projects/" + project + "/secrets/stripe-secret-key/versions/" + ref.version
  );
}
export function verifySyntheticRefund(input, docs, now = Date.now()) {
  verifyOperatorInput(input);
  const { p, first, last, row, child, existing } = docs;
  check(
    p?.id === input.projectId &&
      p.createdAt > now - 86400000 &&
      p.createdAt <= now + 60000 &&
      !p.claimedAt &&
      !p.deletedAt &&
      p.purchasedCount === 100 &&
      p.householdCount === 100 &&
      !p.activeBatchId &&
      Object.keys(p.paidHouseholds || {}).length === 100,
    "synthetic_project",
  );
  check(
    p.sharedBody ===
      "Thank you for your thoughtful wedding gift. We appreciate you thinking of us." &&
      p.returnAddress?.address1 === "5000 Fictional Wedding Lane" &&
      p.returnAddress.firstName === "Alex Patel & Jamie Kim",
    "synthetic_sender",
  );
  for (const [b, id, n, total, previous, mail] of [
    [first, input.firstId, 98, 72350, 0, 1000],
    [last, input.lastId, 2, 1850, 98, 500],
  ]) {
    check(
      b?.id === id &&
        b.projectId === p.id &&
        b.status === "held" &&
        b.capturedCents === total &&
        b.quote?.count === n &&
        b.quote.totalCents === total &&
        b.quote.mailingCents === mail &&
        b.quote.currency === "USD" &&
        b.quote.previouslyPurchased === previous &&
        b.quote.tax?.mode === "inclusive" &&
        b.quote.addedTaxCents === 0 &&
        b.quote.lines?.length === n &&
        b.quote.lines.every((l) => p.paidHouseholds[l.householdId] === id) &&
        b.settledAt >= p.createdAt &&
        /^pi_[A-Za-z0-9]+$/.test(b.paymentIntentId || ""),
      "two_verified_captures",
    );
  }
  check(
    first.refundReservedCents === 0 &&
      first.refundedCents === 0 &&
      last.completedCount === 2,
    "settled_reconciliation",
  );
  check(
    row?.id === input.householdId &&
      row.sourceHouseholdId === "H099" &&
      row.paidBatchId === last.id &&
      row.address?.country === "FR" &&
      row.address.zip === "69001" &&
      row.provenance?.some(
        (v) => v.importId === "finance_" + input.runId + "_75",
      ),
    "this_run_household",
  );
  const l = last.quote.lines[0];
  check(
    l.householdId === row.id &&
      l.ordinal === 99 &&
      l.country === "FR" &&
      l.baseCents === 700 &&
      l.mailingCents === 500 &&
      l.totalCents === 1200 &&
      child?.card?.householdId === row.id &&
      child.card.recipient?.address?.country === "FR" &&
      child.line?.contentHash === l.contentHash &&
      child.line?.totalCents === 1200 &&
      last.quote.lines[1]?.ordinal === 100 &&
      last.quote.lines[1].totalCents === 650,
    "frozen_refund_amount",
  );
  if (child.refundRequestId) {
    check(
      existing?.id === child.refundRequestId &&
        existing.batchId === last.id &&
        existing.householdId === row.id &&
        existing.paymentIntentId === last.paymentIntentId &&
        existing.cents === 1200 &&
        ["reserved", "pending", "succeeded"].includes(existing.status),
      "same_refund_only",
    );
    const done = existing.status === "succeeded";
    check(
      last.refundedCents === (done ? 1200 : 0) &&
        last.refundReservedCents === (done ? 0 : 1200),
      "replayed_allocation",
    );
  } else
    check(
      !existing && last.refundedCents === 0 && last.refundReservedCents === 0,
      "unrefunded_card",
    );
}
async function cloudJSON(token, url, body) {
  const parsed = new URL(url);
  check(
    parsed.protocol === "https:" &&
      [
        "run.googleapis.com",
        "cloudresourcemanager.googleapis.com",
        "secretmanager.googleapis.com",
        "www.googleapis.com",
      ].includes(parsed.hostname),
    "google_api_only",
  );
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + token,
      "x-goog-user-project": project,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  check(res.ok, "google_iam_http_" + res.status);
  return res.json();
}
async function boundedInput() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk.toString();
    check(text.length < 2048, "fixture_input_size");
  }
  return JSON.parse(text);
}
async function main() {
  check(
    process.argv.length === 3 && process.argv[2] === "--staging-iam-refund",
    "operator_flag",
  );
  check(
    !process.env.FIRESTORE_EMULATOR_HOST &&
      !process.env.FIREBASE_AUTH_EMULATOR_HOST &&
      !process.env.FIREBASE_CONFIG &&
      !process.env.STRIPE_SECRET_KEY &&
      !process.env["stripe-secret-key"] &&
      !process.env.FIREBASE_PRIVATE_KEY,
    "scrubbed_environment",
  );
  const input = await boundedInput();
  verifyOperatorInput(input);
  const gcloud = (args) =>
    execFileSync("gcloud", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    }).trim();
  check(
    ["", "(unset)"].includes(
      gcloud(["config", "get-value", "auth/impersonate_service_account"]),
    ),
    "operator_impersonation",
  );
  const token = gcloud(["auth", "print-access-token", "--project", project]);
  const get = (url) => cloudJSON(token, url);
  const [profile, cloudProject, run, permissions] = await Promise.all([
    get("https://www.googleapis.com/oauth2/v3/userinfo"),
    get("https://cloudresourcemanager.googleapis.com/v3/projects/" + project),
    get("https://run.googleapis.com/v2/" + service),
    cloudJSON(
      token,
      "https://cloudresourcemanager.googleapis.com/v1/projects/" +
        project +
        ":testIamPermissions",
      {
        permissions: [
          "datastore.entities.get",
          "datastore.entities.create",
          "datastore.entities.update",
        ],
      },
    ),
  ]);
  check(
    profile.sub && profile.email_verified === true,
    "verified_google_operator",
  );
  const required = [
    "datastore.entities.get",
    "datastore.entities.create",
    "datastore.entities.update",
  ];
  check(
    required.every((p) => permissions.permissions?.includes(p)) &&
      cloudProject.projectId === project,
    "operator_project_permissions",
  );
  const projectNumber = String(cloudProject.name || "").replace(
    /^projects\//,
    "",
  );
  const traffic = (run.trafficStatuses || []).filter((t) => t.percent > 0);
  check(
    traffic.length === 1 && traffic[0].percent === 100,
    "one_serving_staging_revision",
  );
  const revision = String(traffic[0].revision || "")
    .split("/")
    .at(-1);
  check(
    /^sendmynotes-staging-[A-Za-z0-9-]+$/.test(revision),
    "serving_revision_name",
  );
  const rev = await get(
    "https://run.googleapis.com/v2/projects/" +
      project +
      "/locations/us-central1/services/" +
      project +
      "/revisions/" +
      revision,
  );
  const boundSecret = boundStripeVersion(rev, projectNumber);
  const secret = await get(
    "https://secretmanager.googleapis.com/v1/" + boundSecret + ":access",
  );
  check(
    new RegExp(
      "^projects/(?:" +
        project +
        "|" +
        projectNumber +
        ")/secrets/stripe-secret-key/versions/[1-9]\\d*$",
    ).test(secret.name || ""),
    "resolved_secret_version",
  );
  const stripeKey = Buffer.from(secret.payload?.data || "", "base64")
    .toString("utf8")
    .trim();
  check(/^(?:sk|rk)_test_/.test(stripeKey), "test_stripe_only");
  Object.assign(process.env, {
    NODE_ENV: "production",
    FIREBASE_PROJECT_ID: project,
    GOOGLE_CLOUD_PROJECT: project,
    HANDWRYTTEN_TEST_MODE: "true",
    STAGING_REVIEW_ONLY: "true",
    STRIPE_SECRET_KEY: stripeKey,
  });
  const [{ initializeApp }, { getFirestore }, { GoogleAuth, OAuth2Client }] =
    await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/firestore"),
      import("google-auth-library"),
    ]);
  const app = initializeApp({ projectId: project });
  const db = getFirestore(app);
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: token });
  // Supply the same identity used for control-plane/secret reads to GAX.
  // No implicit ADC discovery or service-account key is used for Firestore writes.
  db.settings({
    projectId: project,
    databaseId: "(default)",
    host: "firestore.googleapis.com",
    ssl: true,
    ignoreUndefinedProperties: true,
    auth: new GoogleAuth({ projectId: project, authClient }),
  });
  const requireLocal = await import("node:module").then((m) =>
    m.createRequire(import.meta.url),
  );
  const { firestoreDb, isFirestoreMock } = requireLocal(
    "../../../../lib/firebase-admin.ts",
  );
  check(
    !isFirestoreMock &&
      firestoreDb === db &&
      db.projectId === project &&
      db.databaseId === "(default)",
    "pinned_staging_firestore",
  );
  const { digest } = requireLocal("../../../../lib/wedding/finance.ts");
  const { getStripeClient } = requireLocal("../../../../lib/stripe.ts");
  const { refundWeddingCard } = requireLocal(
    "../../../../lib/wedding/refunds.ts",
  );
  const { heldPaymentRuntime } = requireLocal(
    "../../../../lib/wedding/checkout.ts",
  );
  check(heldPaymentRuntime(), "held_test_runtime");
  const pRef = db.collection("weddingProjects").doc(input.projectId),
    batch = db.collection("weddingBatches"),
    lastRef = batch.doc(input.lastId);
  const idem = "sprint0031_refund_H099",
    refundId = "wr_" + digest([input.lastId, input.householdId, idem]);
  const refs = [
    pRef,
    batch.doc(input.firstId),
    lastRef,
    pRef.collection("households").doc(input.householdId),
    lastRef.collection("cards").doc(input.householdId),
    db.collection("weddingRefunds").doc(refundId),
  ];
  const [p, first, last, row, child, existing] = (await db.getAll(...refs)).map(
    (s) => s.data(),
  );
  verifySyntheticRefund(input, { p, first, last, row, child, existing });
  const sdk = getStripeClient();
  const pi = await sdk.paymentIntents.retrieve(last.paymentIntentId, {
    expand: ["latest_charge"],
  });
  const charge = pi.latest_charge,
    allowedRefunded =
      existing && existing.status !== "failed" ? [0, 1200] : [0];
  check(
    pi.livemode === false &&
      pi.status === "succeeded" &&
      pi.currency === "usd" &&
      pi.amount === 1850 &&
      pi.amount_received === 1850 &&
      pi.metadata?.weddingBatchId === last.id &&
      pi.metadata?.weddingQuoteId === last.quote.id &&
      charge &&
      typeof charge === "object" &&
      charge.livemode === false &&
      charge.amount === 1850 &&
      charge.currency === "usd" &&
      charge.paid === true &&
      !charge.disputed &&
      allowedRefunded.includes(charge.amount_refunded),
    "verified_stripe_charge",
  );
  if (charge.amount_refunded) {
    const refunds = await sdk.refunds.list({ payment_intent: pi.id, limit: 3 });
    check(
      !refunds.has_more &&
        refunds.data.length === 1 &&
        refunds.data[0].amount === 1200 &&
        refunds.data[0].metadata?.weddingRefundId === refundId,
      "same_stripe_refund_only",
    );
  }
  const actor =
    "staging_iam_" +
    createHash("sha256").update(profile.sub).digest("hex").slice(0, 24);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await refundWeddingCard(
      input.lastId,
      input.householdId,
      idem,
      actor,
    );
    check(
      r.requestId === refundId &&
        r.status === "succeeded" &&
        r.amountCents === 1200,
      "operator_refund_receipt",
    );
  }
  const verified = await sdk.paymentIntents.retrieve(pi.id, {
    expand: ["latest_charge"],
  });
  check(
    verified.latest_charge?.amount_refunded === 1200 &&
      verified.livemode === false,
    "processor_refund_confirmation",
  );
  // Judge the ordinary signed Stripe webhook independently from the operator
  // refund response. A missing provider receipt is reported truthfully.
  let webhookObserved = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const inbox = await db
      .collection("provider_webhook_inbox")
      .where("paymentIntentId", "==", pi.id)
      .limit(50)
      .get();
    webhookObserved = inbox.docs.some((d) => {
      const r = d.data();
      return (
        r.provider === "stripe" &&
        r.signatureVerified === true &&
        r.livemode === false &&
        r.status === "processed" &&
        ["refund.created", "refund.updated", "charge.refunded"].includes(
          r.eventType,
        )
      );
    });
    if (webhookObserved || attempt === 3) break;
    await delay(5000);
  }
  await db.terminate();
  console.log(
    "STAGING_IAM_REFUND_CONFIRMED webhook=" +
      (webhookObserved ? "observed" : "pending"),
  );
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(
      "Staging operator refused or unavailable (" +
        (error instanceof OperatorRefusal ? error.message : "operator_error") +
        ").",
    );
    process.exitCode = 1;
  });
}
