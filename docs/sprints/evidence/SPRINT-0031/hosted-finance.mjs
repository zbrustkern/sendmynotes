import { stagingRequest } from './staging-request.mjs';
/**
 * Run from the release checkout: node docs/sprints/evidence/SPRINT-0031/hosted-finance.mjs --staging-test
 * Uses only the staging portal and Stripe's public test API. Re-run to resume.
 * Optional WEDDING_ADMIN_COOKIE_FILE: mode 0600 file containing smn_admin_session=...
 * Optional WEDDING_FINANCE_STATE: a new path below /private/tmp for another independent run.
 * Alternatively add --staging-iam-refund to use the logged-in staging operator for H099.
 * Output is sanitized JSON. Private recovery state is never written inside the repository.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  lstatSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "csv-parse/sync";

const origin =
  "https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app";
const statePath = resolve(
  process.env.WEDDING_FINANCE_STATE ||
    "/private/tmp/smn-wedding-0031-finance-private.json",
);
const projectPath = "/api/wedding/project",
  checkoutPath = "/api/wedding/checkout";
const address = {
  address1: "5000 Fictional Wedding Lane",
  address2: "",
  city: "Example",
  state: "MA",
  country: "US",
  zip: "02108",
};
const sender = {
  ...address,
  firstName: "Alex Patel & Jamie Kim",
  lastName: "",
};
const stageCheck = (condition, label) => assert.ok(condition, label);
const fail = (label) => {
  throw new Error(label);
};
function privateState(path) {
  const st = lstatSync(path);
  stageCheck(
    st.isFile() && !st.isSymbolicLink() && (st.mode & 0o077) === 0,
    "Private state needs owner-only file access.",
  );
  return readFileSync(path, "utf8");
}
stageCheck(
  dirname(statePath) === "/private/tmp" &&
    /^smn-wedding[-a-z0-9_.]*\.json$/.test(basename(statePath)),
  "Use a private staging state path under /private/tmp.",
);
let state;
function save() {
  const temp = statePath + "." + randomUUID() + ".tmp";
  writeFileSync(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  renameSync(temp, statePath);
  chmodSync(statePath, 0o600);
}
async function request(path, ctx, body, cookieOverride) {
  stageCheck(
    [
      projectPath,
      checkoutPath,
      "/api/mailing-options",
      "/api/admin/wedding/refund",
    ].includes(path),
    "Unexpected staging route.",
  );
  const headers = { origin };
  if (body) headers["content-type"] = "application/json";
  if (cookieOverride) headers.cookie = cookieOverride;
  else if (ctx && Object.keys(ctx.cookies).length)
    headers.cookie = Object.entries(ctx.cookies)
      .map(([k, v]) => k + "=" + v)
      .join("; ");
  const response = await stagingRequest(origin + path, {
    redirect: "error",
    headers,
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (ctx)
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0],
        at = pair.indexOf("="),
        name = pair.slice(0, at);
      if (/^smn_wedding_[A-Za-z0-9_]+$/.test(name))
        ctx.cookies[name] = pair.slice(at + 1);
    }
  if (ctx) save();
  if (!response.ok)
    fail(
      "Staging " +
        (body?.action || path) +
        " returned HTTP " +
        response.status +
        " (" +
        String(
          (await response.json().catch(() => ({}))).code || "unavailable",
        ).slice(0, 64) +
        ").",
    );
  return response.json();
}
const rows = parse(
  readFileSync(
    new URL(
      "../../../proposals/2026-11-12-thank-you-portal/upload-fixtures/01-households-100.csv",
      import.meta.url,
    ),
    "utf8",
  ),
  { columns: true, skip_empty_lines: true },
);
stageCheck(rows.length === 100, "Expected 100 fictional fixture rows.");
function fixture(i, mixed) {
  const r = rows[i],
    ordinal = i + 1,
    us = {
      address1: r["Address Line 1"],
      address2: r["Address Line 2"],
      city: r.City,
      state: r.State,
      zip: r["Postal Code"],
      country: "US",
    };
  const overrides = {
    1: { city: "Ottawa", state: "ON", zip: "K1A 0B1", country: "CA" },
    2: { city: "London", state: "", zip: "SW1A 1AA", country: "GB" },
    99: { city: "Lyon", state: "", zip: "69001", country: "FR" },
  };
  const addr = { ...us, ...((mixed && overrides[ordinal]) || {}) };
  return {
    id: r["Household ID"],
    envelopeName: r["Envelope Name"],
    firstName: r["Envelope Name"],
    lastName: "",
    insideName:
      r["First Name"] +
      (r["Additional Guest"]
        ? " and " + r["Additional Guest"].split(" ")[0]
        : ""),
    gift: r.Gift,
    identityConfirmed: true,
    insideNameConfirmed: true,
    address: addr,
    addressConfirmed: true,
  };
}
const projectState = (ctx) => request(projectPath, ctx);
function chosen(project, lo, hi) {
  return project.households
    .filter(
      (r) =>
        /^H\d{3}$/.test(r.sourceHouseholdId || "") &&
        Number(r.sourceHouseholdId.slice(1)) >= lo &&
        Number(r.sourceHouseholdId.slice(1)) <= hi,
    )
    .sort((a, b) => a.sourceHouseholdId.localeCompare(b.sourceHouseholdId));
}
async function setUp(ctx, mixed) {
  if (!ctx.cookies.smn_wedding_session) {
    await request(projectPath, ctx, { action: "create", sample: false });
  }
  let view = await projectState(ctx);
  if (ctx.projectId)
    stageCheck(
      view.project.id === ctx.projectId,
      "Resume the original synthetic project.",
    );
  else {
    ctx.projectId = view.project.id;
    save();
  }
  if (!view.project.sharedBody) {
    await request(projectPath, ctx, {
      action: "saveProject",
      revision: view.project.revision,
      patch: {
        sharedBody:
          "Thank you for your thoughtful wedding gift. We appreciate you thinking of us.",
        signOff: "With love,\nAlex and Jamie",
        returnAddress: sender,
      },
    });
  }
  if (!ctx.imported && !ctx.runId) {
    ctx.runId = randomUUID();
    save();
  }
  if (!ctx.imported) {
    for (let start = 0; start < 100; start += 25) {
      const portion = Array.from({ length: 25 }, (_, n) => {
        const row = fixture(start + n, mixed);
        if (start + n >= 98) {
          row.addressConfirmed = false;
          row.address.address1 = "";
        }
        return row;
      });
      await request(projectPath, ctx, {
        action: "importHouseholds",
        importId: "finance_" + ctx.runId + "_" + start,
        rows: portion,
      });
    }
    ctx.imported = true;
    save();
  }
  if (!ctx.approved) {
    view = await projectState(ctx);
    const selected = chosen(view, 1, 100);
    stageCheck(
      selected.length === 100,
      "All 100 fixture households are present.",
    );
    const needs = selected.filter((x) => !x.approvedFingerprint);
    if (needs.length)
      await request(projectPath, ctx, {
        action: "approve",
        ids: needs.map((r) => r.id),
        revisions: needs.map((r) => r.revision),
        mode: "shared",
        projectRevision: view.project.revision,
      });
    ctx.approved = true;
    save();
  }
}
async function confirmWithTestCard(secret, publishableKey) {
  stageCheck(
    typeof publishableKey === "string" && publishableKey.startsWith("pk_test_"),
    "Confirmed staging test publishable key required.",
  );
  const piId = secret?.match(/^(pi_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/)?.[1];
  stageCheck(
    !!piId,
    "Expected a Stripe client secret for a test PaymentIntent.",
  );
  const params = new URLSearchParams({
    key: publishableKey,
    client_secret: secret,
    payment_method: "pm_card_visa",
  });
  const response = await fetch(
    "https://api.stripe.com/v1/payment_intents/" + piId + "/confirm",
    {
      method: "POST",
      body: params,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    fail(
      "Public test Stripe confirmation returned HTTP " +
        response.status +
        " (" +
        String(result?.error?.code || result?.error?.type || "unknown").slice(
          0,
          64,
        ) +
        ").",
    );
  stageCheck(
    result.livemode === false &&
      result.status === "succeeded" &&
      result.id === piId,
    "Stripe test capture must succeed.",
  );
  return result;
}
async function runBatch(
  ctx,
  key,
  lo,
  hi,
  expectedCents,
  expectedMail,
  closedBrowser,
) {
  const b = (ctx[key] ||= {});
  let project = await projectState(ctx);
  const selected = chosen(project, lo, hi);
  stageCheck(
    selected.length === hi - lo + 1,
    "Expected selected fixture group.",
  );
  if (!b.id) {
    // A tab can close after reserve but before seeing its response.
    const prior = project.project.activeBatchId;
    if (prior) {
      b.id = prior;
      save();
    } else {
      const selection = selected.map((r) => ({
        id: r.id,
        revision: r.revision,
      }));
      const { quote, checkoutEnabled } = await request(checkoutPath, ctx, {
        action: "quote",
        selection,
      });
      stageCheck(
        checkoutEnabled === true &&
          quote.totalCents === expectedCents &&
          quote.mailingCents === expectedMail &&
          quote.tax?.mode === "inclusive" &&
          quote.includedTaxCents === null &&
          quote.addedTaxCents === 0,
        "Unexpected quote or staging payment mode.",
      );
      const reserved = await request(checkoutPath, ctx, {
        action: "reserve",
        selection,
        quoteHash: quote.id,
      });
      b.id = reserved.batchId;
      save();
    }
  }
  let status = await request(checkoutPath, ctx, {
    action: "status",
    batchId: b.id,
  });
  stageCheck(
    status.quote.totalCents === expectedCents &&
      status.quote.lines.every((l, i) => l.householdId === selected[i].id),
    "Frozen receipt must match the selected households and cents.",
  );
  while (status.status === "preparing") {
    const old = status.preparedCount;
    status = await request(checkoutPath, ctx, {
      action: "advance",
      batchId: b.id,
    });
    stageCheck(
      status.preparedCount > old && status.preparedCount - old <= 20,
      "Manifest must advance in bounded chunks.",
    );
    if (status.preparedCount === 40)
      status = await request(checkoutPath, ctx, {
        action: "status",
        batchId: b.id,
      });
  }
  if (status.status !== "held" && !b.confirmedAt) {
    const pay = await request(checkoutPath, ctx, {
      action: "pay",
      batchId: b.id,
    });
    if (pay.status !== "held") {
      // On an uncertain previous request, first retrieve the exact intent using the
      // existing public client secret. Never create a new intent or choose a new card.
      const pi = pay.clientSecret?.split("_secret_")[0];
      stageCheck(
        /^pi_[A-Za-z0-9]+$/.test(pi || "") &&
          pay.publishableKey?.startsWith("pk_test_"),
        "Staging test credentials required.",
      );
      const stripeQuery = new URLSearchParams({
        key: pay.publishableKey,
        client_secret: pay.clientSecret,
      });
      const read = await fetch(
        "https://api.stripe.com/v1/payment_intents/" + pi + "?" + stripeQuery,
        { redirect: "error", signal: AbortSignal.timeout(45000) },
      );
      const current = await read.json();
      stageCheck(
        read.ok &&
          current.livemode === false &&
          current.amount === expectedCents &&
          current.currency === "usd",
        "Stripe test intent must match frozen quote.",
      );
      const settled = current.status === "succeeded"
        ? current : await confirmWithTestCard(pay.clientSecret, pay.publishableKey);
      // Stripe's public view omits amount_received. The application's server
      // verifies that field and the settled held receipt must match below.
      stageCheck(settled.amount === expectedCents && (settled.amount_received == null || settled.amount_received === expectedCents), "Confirmed test intent amount must reconcile.");
    }
    b.confirmedAt = Date.now();
    save();
  }
  if (!closedBrowser)
    await request(checkoutPath, ctx, { action: "confirm", batchId: b.id });
  // status is read-only. The final mixed batch can be materialized only by the scheduler.
  const start = Date.now();
  do {
    status = await request(checkoutPath, ctx, {
      action: "status",
      batchId: b.id,
    });
    if (
      status.status === "held" &&
      (!closedBrowser || status.completedCount === status.count)
    )
      break;
    if (Date.now() - start > 18 * 60000)
      fail(
        "Closed-browser test capture is waiting on the staging scheduler. Re-run to resume.",
      );
    await delay(20000);
  } while (true);
  stageCheck(
    status.capturedCents === expectedCents,
    "Held batch must record the actual captured cents.",
  );
  b.verified = true;
  save();
  return {
    cards: status.count,
    baseCents: status.quote.baseCents,
    internationalCents: status.quote.mailingCents,
    capturedCents: status.capturedCents,
    status: status.status,
    materializedByScheduler:
      closedBrowser && status.completedCount === status.count,
    refundCents: status.refundedCents,
  };
}
async function runScenario(key, mixed) {
  const ctx = (state[key] ||= { cookies: {} });
  save();
  await setUp(ctx, mixed);
  const first = await runBatch(
    ctx,
    "first",
    1,
    98,
    mixed ? 72350 : 71350,
    mixed ? 1000 : 0,
    false,
  );
  if (!ctx.lastTwoCorrected) {
    let view = await projectState(ctx);
    for (const r of chosen(view, 99, 100)) {
      const i = Number(r.sourceHouseholdId.slice(1)) - 1;
      if (!r.addressConfirmed)
        await request(projectPath, ctx, {
          action: "saveHousehold",
          id: r.id,
          revision: r.revision,
          patch: { address: fixture(i, mixed).address, addressConfirmed: true },
        });
    }
    ctx.lastTwoCorrected = true;
    save();
  }
  const second = await runBatch(
    ctx,
    "second",
    99,
    100,
    mixed ? 1850 : 1350,
    mixed ? 500 : 0,
    mixed,
  );
  if (mixed) {
    const view = await projectState(ctx);
    for (const [n, country] of [
      [1, "CA"],
      [2, "GB"],
      [99, "FR"],
      [100, "US"],
    ]) {
      const row = chosen(view, n, n)[0];
      const snapshot = await request(checkoutPath, ctx, {
        action: "card",
        batchId: n > 98 ? ctx.second.id : ctx.first.id,
        householdId: row.id,
      });
      stageCheck(
        snapshot.card.recipient.address.country === country &&
          snapshot.card.recipient.supplierCountryId > 0,
        "Frozen supplier destination must match the intended household.",
      );
      stageCheck(
        snapshot.card.returnAddress.firstName === sender.firstName &&
          snapshot.card.returnAddress.lastName === "" &&
          snapshot.card.envelopeName === fixture(n - 1, mixed).envelopeName,
        "Frozen envelope labels must preserve joint and personal names.",
      );
    }
  }
  let refund = "unrequested";
  let refundWebhook = "unverified";
  let webhookCapabilities = null;
  let stateView = await projectState(ctx);
  stageCheck(
    stateView.project.purchasedCount === 100,
    "Exactly 100 purchased ordinals.",
  );
  const iam = process.argv.includes("--staging-iam-refund");
  if (mixed && (process.env.WEDDING_ADMIN_COOKIE_FILE || iam)) {
    stageCheck(
      !(process.env.WEDDING_ADMIN_COOKIE_FILE && iam),
      "Choose one refund authorization.",
    );
    const child = chosen(stateView, 99, 99)[0];
    if (iam) {
      stageCheck(
        ctx.runId &&
          child.provenance.some(
            (v) => v.importId === "finance_" + ctx.runId + "_75",
          ),
        "Operator mode requires the current synthetic run provenance.",
      );
      const runner = fileURLToPath(
        new URL("./finance-operator.mjs", import.meta.url),
      );
      const env = Object.fromEntries(
        ["PATH", "HOME", "TMPDIR", "CLOUDSDK_CONFIG"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]]),
      );
      const worker = spawnSync(
        process.execPath,
        ["--import", "tsx", runner, "--staging-iam-refund"],
        {
          env,
          input: JSON.stringify({
            projectId: ctx.projectId,
            firstId: ctx.first.id,
            lastId: ctx.second.id,
            householdId: child.id,
            runId: ctx.runId,
          }),
          encoding: "utf8",
          timeout: 150000,
          maxBuffer: 32768,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      if (
        worker.status !== 0 ||
        !worker.stdout.includes("STAGING_IAM_REFUND_CONFIRMED")
      ) {
        const reason = worker.stderr?.match(
          /Staging operator refused or unavailable \(([a-zA-Z0-9_]+)\)/,
        )?.[1];
        fail(
          "The staging IAM refund could not be verified (" +
            (reason || "operator_failed") +
            "). Resume this run after reviewing the operator account.",
        );
      }
      const metadata=worker.stdout.split("\n").find(l=>l.startsWith("STAGING_WEBHOOK_CAPABILITIES "));
      if(metadata)webhookCapabilities=JSON.parse(metadata.slice("STAGING_WEBHOOK_CAPABILITIES ".length));
      refundWebhook = worker.stdout.includes("webhook=observed")
        ? "observed"
        : "pending";
    } else {
      const admin = privateState(process.env.WEDDING_ADMIN_COOKIE_FILE).trim();
      stageCheck(
        /^smn_admin_session=[^;\s]+$/.test(admin),
        "Private operator file should contain the authenticated staging admin cookie pair.",
      );
      const action = {
        batchId: ctx.second.id,
        householdId: child.id,
        idempotencyKey: "sprint0031_refund_H099",
      };
      for (let i = 0; i < 2; i++) {
        const result = await request(
          "/api/admin/wedding/refund",
          null,
          action,
          admin,
        );
        stageCheck(
          result.status === "succeeded" && result.amountCents === 1200,
          "H099 must have exactly one successful $12 refund.",
        );
      }
    }
    const receipt = await request(checkoutPath, ctx, {
      action: "status",
      batchId: ctx.second.id,
    });
    stageCheck(
      receipt.refundedCents === 1200 &&
        first.capturedCents + second.capturedCents - receipt.refundedCents ===
          73000,
      "Retained cents reconcile after refund.",
    );
    const refundedRow = chosen(await projectState(ctx), 99, 99)[0];
    stageCheck(
      refundedRow.refundStatus === "refunded" &&
        refundedRow.refundedCents === 1200,
      "Tracker must reflect the refunded card.",
    );
    second.refundCents = 1200;
    refund = iam ? "succeeded_staging_iam" : "succeeded_admin_session";
  } else if (mixed) refund = "needs_verified_admin_or_staging_iam";
  return {
    first,
    second,
    earned: stateView.project.purchasedCount,
    currency: "USD",
    capturedCents: first.capturedCents + second.capturedCents,
    refundedCents: first.refundCents + second.refundCents,
    retainedBeforeProcessingFeesCents: first.capturedCents + second.capturedCents - first.refundCents - second.refundCents,
    processingFeesCents: null,
    refund,
    refundWebhook,
    webhookCapabilities,
  };
}
async function main() {
  stageCheck(
    process.argv.includes("--staging-test"),
    "Pass --staging-test to run synthetic test-mode checkout.",
  );
  state = existsSync(statePath)
    ? JSON.parse(privateState(statePath))
    : { schema: 1, origin };
  stageCheck(
    state.schema === 1 && state.origin === origin,
    "Use a staging-only recovery file.",
  );
  const caps = await request("/api/mailing-options", null);
  stageCheck(
    caps.previewOnly === true &&
      caps.checkoutEnabled === true &&
      caps.pricing?.internationalSurchargeCents === 500,
    "Staging held-preview capability and $5 international rate required.",
  );
  const [domestic, mixed] = await Promise.all([
    runScenario("domestic", false),
    runScenario("mixed", true),
  ]);
  console.log(
    JSON.stringify(
      {
        origin,
        verifiedAt: new Date().toISOString(),
        processor: "stripe_test",
        acceptance: { domestic, mixed },
      },
      null,
      2,
    ),
  );
}
main().catch((err) => {
  console.error(
    String(err?.message || "Staging test could not be completed.").replace(
      /(?:pi|sk|pk)_(?:test_)?[A-Za-z0-9_]+/g,
      "[redacted]",
    ),
  );
  process.exitCode = 1;
});
