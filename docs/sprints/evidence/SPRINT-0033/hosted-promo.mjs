#!/usr/bin/env node
// Synthetic SPRINT-0033 wedding promotion acceptance. Staging and Stripe test only.
// Reuses SPRINT-0031's fixed-origin HTTPS helper and its fictional 100-household fixture.
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { stagingRequest } from "../SPRINT-0031/staging-request.mjs";

const ORIGIN =
  "https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app";
const STATE_PATH = resolve(
  process.env.WEDDING_PROMO_STATE ||
    "/private/tmp/smn-wedding-0033-promo-private.json",
);
const PROJECT_PATH = "/api/wedding/project";
const CHECKOUT_PATH = "/api/wedding/checkout";
const ADMIN_PATH = "/api/admin/promotions";
const REFUND_PATH = "/api/admin/wedding/refund";
const ALLOWED_ROUTES = new Set([
  PROJECT_PATH,
  CHECKOUT_PATH,
  "/api/mailing-options",
  ADMIN_PATH,
  REFUND_PATH,
]);
const report = {
  origin: ORIGIN,
  processor: "stripe_test",
  fulfillment: "not_called",
  checks: [],
};
let state;
let adminCookie;
let campaignSetupPath;
let campaignSetup;
let fixtureRefund;
let activeStep = "startup";

class AcceptanceFailure extends Error {}
class AcceptanceUnavailable extends Error {}
class HttpFailure extends Error {
  constructor(status, code) {
    super("staging_http_" + status);
    this.status = status;
    this.code = code;
  }
}

function requireThat(condition, label) {
  if (!condition) throw new AcceptanceFailure(label);
}

function safeReason(error) {
  if (error instanceof AcceptanceFailure || error instanceof AcceptanceUnavailable) return error.message;
  if (error instanceof HttpFailure) return "staging_http_" + error.status;
  return "acceptance_failed";
}

function addCheck(name, status, evidence = {}) {
  const previous = report.checks.findIndex((check) => check.name === name);
  const check = { name, status, ...evidence };
  if (previous < 0) report.checks.push(check);
  else report.checks[previous] = check;
}

function privateFile(path, { required = true } = {}) {
  let info;
  try {
    info = lstatSync(path);
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    throw new AcceptanceFailure("private_file_unavailable");
  }
  requireThat(
    info.isFile() &&
      !info.isSymbolicLink() &&
      (info.mode & 0o777) === 0o600 &&
      (typeof process.getuid !== "function" || info.uid === process.getuid()),
    "private_owner_only_file_required",
  );
  return readFileSync(path, "utf8");
}

function validateStatePath() {
  requireThat(
    dirname(STATE_PATH) === "/private/tmp" &&
      /^smn-wedding-0033-promo-[a-z0-9_.-]+\.json$/.test(
        basename(STATE_PATH),
      ),
    "use_new_private_state_path_under_private_tmp",
  );
}

function saveState() {
  const temp = STATE_PATH + "." + randomUUID() + ".tmp";
  writeFileSync(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  renameSync(temp, STATE_PATH);
  chmodSync(STATE_PATH, 0o600);
}

function loadState() {
  validateStatePath();
  if (!existsSync(STATE_PATH)) {
    state = { schema: 1, origin: ORIGIN, scenarios: {} };
    saveState();
    return;
  }
  state = JSON.parse(privateFile(STATE_PATH));
  requireThat(
    state.schema === 1 &&
      state.origin === ORIGIN &&
      state.scenarios &&
      typeof state.scenarios === "object",
    "staging_recovery_file_mismatch",
  );
}

function apiErrorAsUnavailable(error) {
  return (
    error instanceof HttpFailure &&
    ([401, 403, 503].includes(error.status) ||
      ["wedding_disabled", "checkout_paused", "offer_unavailable"].includes(
        error.code,
      ))
  );
}

async function stagingApi(path, { body, ctx, cookie } = {}) {
  const route = path.split("?", 1)[0];
  requireThat(ALLOWED_ROUTES.has(route), "staging_route_not_allowlisted");
  const headers = { origin: ORIGIN };
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  else if (ctx && Object.keys(ctx.cookies || {}).length) {
    headers.cookie = Object.entries(ctx.cookies)
      .map(([name, value]) => name + "=" + value)
      .join("; ");
  }
  const response = await stagingRequest(ORIGIN + path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (ctx) {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      const at = pair.indexOf("=");
      if (at < 1) continue;
      const name = pair.slice(0, at);
      if (/^smn_wedding_[A-Za-z0-9_]+$/.test(name)) {
        ctx.cookies[name] = pair.slice(at + 1);
      }
    }
    saveState();
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Staging fixture request", route, body?.action || "read", response.status, /^[a-z_]+$/.test(result.code) ? result.code : "unspecified");
    throw new HttpFailure(response.status, String(result.code || "").slice(0, 64));
  }
  return result;
}

const fixtureRows = parse(
  readFileSync(
    new URL(
      "../../../proposals/2026-11-12-thank-you-portal/upload-fixtures/01-households-100.csv",
      import.meta.url,
    ),
    "utf8",
  ),
  { columns: true, skip_empty_lines: true },
);
requireThat(fixtureRows.length === 100, "fictional_fixture_rows_required");

function fixture(index, mixed) {
  const row = fixtureRows[index];
  const baseAddress = {
    address1: row["Address Line 1"],
    address2: row["Address Line 2"],
    city: row.City,
    state: row.State,
    zip: row["Postal Code"],
    country: "US",
  };
  const foreign = {
    1: { city: "Ottawa", state: "ON", zip: "K1A 0B1", country: "CA" },
    2: { city: "London", state: "", zip: "SW1A 1AA", country: "GB" },
    99: { city: "Lyon", state: "", zip: "69001", country: "FR" },
  };
  const address = { ...baseAddress, ...((mixed && foreign[index + 1]) || {}) };
  return {
    id: row["Household ID"],
    envelopeName: row["Envelope Name"],
    firstName: row["Envelope Name"],
    lastName: "",
    insideName:
      row["First Name"] +
      (row["Additional Guest"]
        ? " and " + row["Additional Guest"].split(" ")[0]
        : ""),
    gift: row.Gift,
    identityConfirmed: true,
    insideNameConfirmed: true,
    address,
    addressConfirmed: true,
  };
}

function chosen(project, first, last) {
  return project.households
    .filter((row) => {
      const id = row.sourceHouseholdId || "";
      return /^H\d{3}$/.test(id) && Number(id.slice(1)) >= first && Number(id.slice(1)) <= last;
    })
    .sort((a, b) => a.sourceHouseholdId.localeCompare(b.sourceHouseholdId));
}

async function setupProject(key, { count, mixed }) {
  const ctx = (state.scenarios[key] ||= { cookies: {}, runId: randomUUID() });
  saveState();
  let view;
  if (!ctx.cookies.smn_wedding_session) {
    view = await stagingApi(PROJECT_PATH, {
      ctx,
      body: { action: "create", sample: false },
    });
  } else {
    view = await stagingApi(PROJECT_PATH, { ctx });
  }
  requireThat(
    view.project?.id && view.actor?.canPay === true && view.project.purchasedCount >= 0,
    "synthetic_project_owner_required",
  );
  if (ctx.projectId) requireThat(view.project.id === ctx.projectId, "resume_original_synthetic_project");
  else {
    ctx.projectId = view.project.id;
    saveState();
  }
  if (view.project.purchasedCount > 0) {
    requireThat(
      ctx.first?.id || ctx.second?.id,
      "unrecorded_prior_purchase_in_recovery_project",
    );
  }
  if (!view.project.sharedBody) {
    await stagingApi(PROJECT_PATH, {
      ctx,
      body: {
        action: "saveProject",
        revision: view.project.revision,
        patch: {
          sharedBody: "Thank you for your thoughtful wedding gift. We appreciate you thinking of us.",
          signOff: "With love,\nAlex and Jamie",
          returnAddress: {
            address1: "5000 Fictional Wedding Lane",
            address2: "",
            city: "Example",
            state: "MA",
            country: "US",
            zip: "02108",
            firstName: "Alex Patel & Jamie Kim",
            lastName: "",
          },
        },
      },
    });
  }
  if (!ctx.importRunId) {
    ctx.importRunId = randomUUID();
    saveState();
  }
  const chunkSize = 25;
  ctx.importedChunks ||= [];
  for (let start = 0; start < count; start += chunkSize) {
    if (ctx.importedChunks.includes(start)) continue;
    const rows = Array.from({ length: Math.min(chunkSize, count - start) }, (_, offset) => {
      const index = start + offset;
      const row = fixture(index, mixed);
      if (mixed && index >= 98) {
        row.addressConfirmed = false;
        row.address.address1 = "";
      }
      return row;
    });
    await stagingApi(PROJECT_PATH, {
      ctx,
      body: {
        action: "importHouseholds",
        importId: "promo33_" + ctx.importRunId + "_" + start,
        rows,
      },
    });
    ctx.importedChunks.push(start);
    saveState();
  }
  view = await stagingApi(PROJECT_PATH, { ctx });
  const rows = chosen(view, 1, count);
  requireThat(rows.length === count, "fictional_households_present");
  if (!ctx.approved) {
    const needsApproval = rows.filter((row) => !row.approvedFingerprint);
    if (needsApproval.length) {
      await stagingApi(PROJECT_PATH, {
        ctx,
        body: {
          action: "approve",
          ids: needsApproval.map((row) => row.id),
          revisions: needsApproval.map((row) => row.revision),
          mode: "shared",
          projectRevision: view.project.revision,
        },
      });
    }
    ctx.approved = true;
    saveState();
  }
  ctx.syntheticCount = count;
  ctx.mixed = mixed;
  saveState();
  return { ctx, view };
}

function promoPolicy(projectId, mixed) {
  return {
    workflow: "wedding",
    scheduleVersion: "wedding-graduated-pilot-v1",
    countryCodes: mixed ? ["US", "CA", "GB", "FR"] : ["US"],
    match: "matching",
    audience: "project",
    projectId,
    chargeTypes: ["card_base"],
    benefit: { type: "fixed_unit", amountCents: 100 },
    maxUnitsPerOrder: 25,
    maxDiscountCentsPerOrder: 2500,
    maxUnitsPerProject: 25,
    maxDiscountCentsPerProject: 2500,
    payableFloor: "reject",
  };
}

function previewScenario(mixed) {
  return {
    count: mixed ? 100 : 50,
    previouslyPurchased: 0,
    previouslyUsedUnits: 0,
    previouslyUsedCents: 0,
    verified: true,
    ...(mixed
      ? { countryCodes: [...Array(97).fill("US"), "CA", "GB", "FR"] }
      : { countryCodes: Array(50).fill("US") }),
  };
}

function newSyntheticCode(ctx, mixed) {
  if (!ctx.syntheticCode) {
    ctx.syntheticCode =
      "S33" + (mixed ? "M" : "D") + randomBytes(8).toString("hex").toUpperCase();
    saveState();
  }
  return ctx.syntheticCode;
}

async function setupCampaignWithAdmin(ctx, { mixed, policy, code }) {
  const admin = async (body) =>
    stagingApi(ADMIN_PATH + "?environment=staging", {
      body: { environment: "staging", ...body },
      cookie: adminCookie,
    });
  let detail;
  if (ctx.campaign?.id) {
    detail = await stagingApi(
      ADMIN_PATH +
        "?environment=staging&view=campaign&campaignId=" +
        encodeURIComponent(ctx.campaign.id),
      { cookie: adminCookie },
    );
  }
  if (!detail?.campaign?.campaign) {
    const created = await admin({
      action: "draft-save",
      name: "Synthetic SPRINT-0033 wedding " + (mixed ? "mixed" : "split"),
      distribution: "private",
      code,
      policy,
      maxUses: 2,
      budgetCents: 2500,
    });
    requireThat(created.campaign?.id && created.draft?.revision, "campaign_draft_created");
    ctx.campaign = {
      id: created.campaign.id,
      revision: created.draft.revision,
      code,
      published: false,
    };
    saveState();
    detail = { campaign: { campaign: created.campaign, draft: created.draft } };
  }
  const item = detail.campaign.campaign;
  const draft = detail.campaign.draft;
  requireThat(item.id === ctx.campaign.id, "resume_same_campaign");
  if (item.status === "active") {
    requireThat(
      detail.campaign.policy?.workflow === "wedding" &&
        detail.campaign.policy.projectId === ctx.projectId &&
        detail.campaign.policy.maxUnitsPerProject === 25 &&
        detail.campaign.policy.maxDiscountCentsPerProject === 2500 &&
        detail.campaign.policy.benefit?.type === "fixed_unit" &&
        detail.campaign.policy.benefit.amountCents === 100 &&
        detail.campaign.policy.chargeTypes?.length === 1 &&
        detail.campaign.policy.chargeTypes[0] === "card_base" &&
        JSON.stringify(detail.campaign.policy.countryCodes) === JSON.stringify(policy.countryCodes),
      "published_campaign_scope_matches_fixture",
    );
    ctx.campaign.published = true;
    saveState();
    return { campaignId: item.id, code };
  }
  requireThat(
    draft?.policy?.projectId === ctx.projectId &&
      draft.policy.workflow === policy.workflow &&
      draft.policy.scheduleVersion === policy.scheduleVersion &&
      draft.policy.maxUnitsPerProject === policy.maxUnitsPerProject &&
      draft.policy.maxDiscountCentsPerProject === policy.maxDiscountCentsPerProject &&
      draft.policy.benefit?.type === policy.benefit.type &&
      draft.policy.benefit.amountCents === policy.benefit.amountCents &&
      JSON.stringify(draft.policy.countryCodes) === JSON.stringify(policy.countryCodes),
    "draft_campaign_project_scope",
  );
  const revision = draft.revision;
  const preview = await admin({
    action: "draft-preview",
    campaignId: item.id,
    revision,
    scenario: previewScenario(mixed),
  });
  if (preview.weddingCheckoutAvailable !== true) {
    throw new AcceptanceUnavailable("wedding_promotion_checkout_unavailable");
  }
  const expectedNet = mixed ? 71700 : 35250;
  const custom = preview.previews?.custom;
  requireThat(
    custom?.eligible === true &&
      custom.grossCents === (mixed ? 74200 : 37750) &&
      custom.discountCents === 2500 &&
      custom.netCents === expectedNet,
    "admin_preview_matches_expected_cents",
  );
  const published = await admin({
    action: "draft-publish",
    campaignId: item.id,
    revision,
    previewToken: preview.previewToken,
    reason: "Synthetic SPRINT-0033 staging payment acceptance.",
  });
  if (published.weddingCheckoutAvailable !== true) {
    throw new AcceptanceUnavailable("wedding_promotion_publish_unavailable");
  }
  requireThat(
    published.campaign?.id === item.id &&
      published.issued?.code === code &&
      published.policy?.projectId === ctx.projectId,
    "published_synthetic_code_is_project_scoped",
  );
  ctx.campaign = { id: item.id, revision, code, published: true };
  saveState();
  return { campaignId: item.id, code };
}

async function setupCampaign(ctx, { mixed }) {
  const code = newSyntheticCode(ctx, mixed);
  const policy = promoPolicy(ctx.projectId, mixed);
  if (adminCookie) {
    try {
      return await setupCampaignWithAdmin(ctx, { mixed, policy, code });
    } catch (error) {
      if (error instanceof HttpFailure && [401, 403, 409, 503].includes(error.status)) {
        throw new AcceptanceUnavailable("campaign_admin_or_staging_gate_unavailable");
      }
      throw error;
    }
  }

  if (!campaignSetup) {
    const module = await import(pathToFileURL(campaignSetupPath).href);
    campaignSetup = module.setupCampaign || module.default;
    fixtureRefund = module.refundFixture;
    requireThat(typeof campaignSetup === "function", "setup_module_must_export_setupCampaign");
  }
  const result = await campaignSetup({
    origin: ORIGIN,
    scenario: mixed ? "mixed-98-plus-2" : "domestic-20-plus-30",
    projectId: ctx.projectId,
    runId: ctx.runId,
    syntheticCode: code,
    policy,
    budgetCents: 2500,
    maxUses: 2,
    previewScenario: previewScenario(mixed),
    expectedPreview: {
      grossCents: mixed ? 74200 : 37750,
      discountCents: 2500,
      netCents: mixed ? 71700 : 35250,
    },
  });
  if (result?.available === false) {
    throw new AcceptanceUnavailable("injected_campaign_setup_unavailable");
  }
  requireThat(
    result?.campaignId && /^[A-Za-z0-9_-]{1,128}$/.test(result.campaignId) &&
      result.code === code,
    "injected_setup_must_return_its_synthetic_code_and_campaign_id",
  );
  ctx.campaign = { id: result.campaignId, code, published: true };
  saveState();
  return { campaignId: result.campaignId, code };
}

function assertQuote(quote, { count, grossCents, discountCents, netCents, campaignId, expectedCountries }) {
  requireThat(quote?.currency === "USD" && quote.count === count, "wedding_quote_count_currency");
  const gross = quote.lines.reduce(
    (sum, line) => sum + line.baseCents + line.mailingCents + (line.addedTaxCents || 0),
    0,
  );
  const net = quote.lines.reduce((sum, line) => sum + line.totalCents, 0);
  requireThat(
    gross === grossCents &&
      net === netCents &&
      quote.totalCents === netCents &&
      (quote.promotion?.savingsCents || 0) === discountCents &&
      (discountCents === 0 || quote.promotion?.campaignId === campaignId),
    "frozen_promo_quote_amounts_and_allocations",
  );
  for (const [ordinal, country] of Object.entries(expectedCountries || {})) {
    requireThat(
      quote.lines.find((line) => line.ordinal === Number(ordinal))?.country === country,
      "frozen_wedding_destination_matches_fixture",
    );
  }
}

async function confirmTestIntent(pay, batchId, expectedCents) {
  requireThat(
    typeof pay.publishableKey === "string" && pay.publishableKey.startsWith("pk_test_"),
    "staging_test_publishable_key_required",
  );
  const secret = pay.clientSecret;
  const paymentIntentId = secret?.match(/^(pi_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/)?.[1];
  requireThat(paymentIntentId, "test_payment_intent_client_secret_required");
  const query = new URLSearchParams({ key: pay.publishableKey, client_secret: secret });
  const read = await fetch(
    "https://api.stripe.com/v1/payment_intents/" + paymentIntentId + "?" + query,
    { redirect: "error", signal: AbortSignal.timeout(45_000) },
  );
  const current = await read.json().catch(() => ({}));
  requireThat(
    read.ok &&
      current.livemode === false &&
      current.id === paymentIntentId &&
      current.amount === expectedCents &&
      current.currency === "usd" &&
      (!current.metadata?.weddingBatchId || current.metadata.weddingBatchId === batchId),
    "stripe_test_intent_matches_frozen_batch",
  );
  if (current.status === "succeeded") return current;
  const params = new URLSearchParams({
    key: pay.publishableKey,
    client_secret: secret,
    payment_method: "pm_card_visa",
  });
  const response = await fetch(
    "https://api.stripe.com/v1/payment_intents/" + paymentIntentId + "/confirm",
    {
      method: "POST",
      body: params,
      redirect: "error",
      signal: AbortSignal.timeout(45_000),
    },
  );
  const settled = await response.json().catch(() => ({}));
  requireThat(
    response.ok &&
      settled.livemode === false &&
      settled.id === paymentIntentId &&
      settled.status === "succeeded" &&
      settled.amount === expectedCents &&
      (settled.amount_received == null || settled.amount_received === expectedCents),
    "stripe_test_capture_matches_expected_cents",
  );
  return settled;
}

async function runBatch(ctx, key, {
  first, last, grossCents, discountCents, netCents, campaignId, code,
  expectedCountries, closedBrowser = false,
}) {
  const batchState = (ctx[key] ||= {});
  saveState();
  let project = await stagingApi(PROJECT_PATH, { ctx });
  const rows = chosen(project, first, last);
  const count = last - first + 1;
  requireThat(rows.length === count, "selected_synthetic_households_present");
  let batchId = batchState.id;
  if (!batchId) {
    const activeBatchId = project.project.activeBatchId;
    if (activeBatchId) {
      const current = await stagingApi(CHECKOUT_PATH, {
        ctx,
        body: { action: "status", batchId: activeBatchId },
      });
      requireThat(
        current.quote?.lines?.length === count &&
          current.quote.lines.every((line, index) => line.householdId === rows[index].id),
        "resume_matching_synthetic_batch_only",
      );
      batchId = activeBatchId;
      batchState.id = batchId;
      saveState();
    } else {
      const selection = rows.map((row) => ({ id: row.id, revision: row.revision }));
      const promo = code ? { promotionCode: code } : {};
      const quoted = await stagingApi(CHECKOUT_PATH, {
        ctx,
        body: { action: "quote", selection, ...promo },
      });
      requireThat(quoted.checkoutEnabled === true, "wedding_checkout_enabled");
      assertQuote(quoted.quote, { count, grossCents, discountCents, netCents, campaignId, expectedCountries });
      requireThat(quoted.quote.tax?.mode === "inclusive" && quoted.quote.addedTaxCents === 0, "wedding_tax_policy_unchanged");
      const reserved = await stagingApi(CHECKOUT_PATH, {
        ctx,
        body: { action: "reserve", selection, quoteHash: quoted.quote.id, ...promo },
      });
      requireThat(reserved.batchId, "wedding_batch_reserved");
      batchId = reserved.batchId;
      batchState.id = batchId;
      saveState();
    }
  }
  let status = await stagingApi(CHECKOUT_PATH, {
    ctx,
    body: { action: "status", batchId },
  });
  assertQuote(status.quote, { count, grossCents, discountCents, netCents, campaignId, expectedCountries });
  while (status.status === "preparing") {
    const before = status.preparedCount;
    status = await stagingApi(CHECKOUT_PATH, {
      ctx,
      body: { action: "advance", batchId },
    });
    requireThat(
      status.preparedCount > before && status.preparedCount - before <= 20,
      "bounded_staging_manifest_preparation",
    );
  }
  if (status.status !== "held") {
    const pay = await stagingApi(CHECKOUT_PATH, {
      ctx,
      body: { action: "pay", batchId },
    });
    if (pay.status !== "held") {
      const capture = await confirmTestIntent(pay, batchId, netCents);
      batchState.paymentIntentId = capture.id;
      batchState.captured = true;
      batchState.testModeVerified = capture.livemode === false;
      saveState();
    }
  }
  if (!closedBrowser) {
    await stagingApi(CHECKOUT_PATH, { ctx, body: { action: "confirm", batchId } });
  }
  const startedAt = Date.now();
  do {
    status = await stagingApi(CHECKOUT_PATH, {
      ctx,
      body: { action: "status", batchId },
    });
    if (status.status === "held" && status.completedCount === count) break;
    if (Date.now() - startedAt > 18 * 60_000) {
      throw new AcceptanceUnavailable("staging_wedding_reconciler_pending");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20_000));
  } while (true);
  requireThat(
    status.capturedCents === netCents &&
      status.status === "held" &&
      status.completedCount === count &&
      batchState.testModeVerified === true,
    "captured_test_payment_held_for_review",
  );
  batchState.verified = true;
  saveState();
  return {
    cards: count,
    grossCents,
    discountCents,
    capturedCents: status.capturedCents,
    status: status.status,
    heldCards: status.completedCount,
      refundedCents: status.refundedCents,
    stripeTestMode: batchState.testModeVerified,
  };
}

async function correctFinalMixedAddresses(ctx) {
  const view = await stagingApi(PROJECT_PATH, { ctx });
  for (const ordinal of [99, 100]) {
    const row = chosen(view, ordinal, ordinal)[0];
    requireThat(row, "last_synthetic_household_present");
    if (row.addressConfirmed) continue;
    await stagingApi(PROJECT_PATH, {
      ctx,
      body: {
        action: "saveHousehold",
        id: row.id,
        revision: row.revision,
        patch: { address: fixture(ordinal - 1, true).address, addressConfirmed: true },
      },
    });
  }
}

async function refundPosition99(ctx, batchId) {
  if (!adminCookie && !fixtureRefund) throw new AcceptanceUnavailable("staging_operator_required_for_refund");
  const row = chosen(await stagingApi(PROJECT_PATH, { ctx }), 99, 99)[0];
  const preRefund = await stagingApi(CHECKOUT_PATH, {
    ctx,
    body: { action: "status", batchId },
  });
  const line = preRefund.quote?.lines?.find((item) => item.householdId === row?.id);
  requireThat(
    line?.ordinal === 99 && line.country === "FR" && line.totalCents === 1200,
    "position_99_frozen_international_line_is_12_dollars",
  );
  const action = {
    batchId,
    householdId: row.id,
    idempotencyKey: "sprint0033_promo_H099",
  };
  const submitRefund = () => adminCookie ? stagingApi(REFUND_PATH, { body: action, cookie: adminCookie }) : fixtureRefund({projectId:ctx.projectId, firstBatchId:ctx.first.id,batchId,householdId:row.id});
  let first;
  try {
    first = await submitRefund();
  } catch (error) {
    if (error instanceof HttpFailure && [401, 403].includes(error.status)) {
      throw new AcceptanceUnavailable("staging_admin_refund_authorization_unavailable");
    }
    throw error;
  }
  const replay = await submitRefund();
  requireThat(
    first.status === "succeeded" &&
      replay.status === "succeeded" &&
      first.amountCents === 1200 &&
      replay.amountCents === 1200,
    "normal_refund_route_replays_one_12_dollar_refund",
  );
  const after = await stagingApi(CHECKOUT_PATH, {
    ctx,
    body: { action: "status", batchId },
  });
  const firstBatch = await stagingApi(CHECKOUT_PATH, {
    ctx,
    body: { action: "status", batchId: ctx.first.id },
  });
  const rowAfter = chosen(await stagingApi(PROJECT_PATH, { ctx }), 99, 99)[0];
  requireThat(
    after.refundedCents === 1200 &&
      rowAfter.refundStatus === "refunded" &&
      rowAfter.refundedCents === 1200 &&
      after.capturedCents - after.refundedCents === 650 &&
      firstBatch.capturedCents + after.capturedCents - after.refundedCents === 70500,
    "one_refund_preserves_position_100_capture",
  );
  return {
    operator: adminCookie ? "admin_session" : "staging_iam",
    refundedCents: after.refundedCents,
    retainedLastBatchCents: after.capturedCents - after.refundedCents,
    retainedProjectCents: firstBatch.capturedCents + after.capturedCents - after.refundedCents,
  };
}

async function stagingPreflight() {
  requireThat(
    process.argv.includes("--staging-test") &&
      process.argv.includes("--allow-test-captures") &&
      process.argv.length === 4,
    "pass_only_staging_test_and_allow_test_captures_flags",
  );
  requireThat(ORIGIN.includes("sendmynotes-staging"), "fixed_staging_origin_required");
  addCheck("staging_and_test_mode_guards", "PASS", {
    flags: ["--staging-test", "--allow-test-captures"],
    origin: ORIGIN,
  });
  const cookiePath = process.env.WEDDING_ADMIN_COOKIE_FILE;
  const setupPath = process.env.WEDDING_PROMO_SETUP_MODULE;
  if (cookiePath && setupPath) {
    throw new AcceptanceFailure("choose_admin_cookie_or_campaign_setup_module");
  }
  if (cookiePath) {
    const value = privateFile(resolve(cookiePath)).trim();
    requireThat(/^smn_admin_session=[^;\s]+$/.test(value), "existing_staging_admin_cookie_pair_required");
    adminCookie = value;
  } else if (setupPath) {
    campaignSetupPath = resolve(setupPath);
    const info = lstatSync(campaignSetupPath);
    requireThat(info.isFile() && !info.isSymbolicLink(), "setup_module_file_required");
  } else {
    addCheck("campaign_setup", "UNAVAILABLE", {
      reason: "Provide WEDDING_ADMIN_COOKIE_FILE or WEDDING_PROMO_SETUP_MODULE.",
    });
    addCheck("domestic_split_20_plus_30", "UNAVAILABLE", { reason: "campaign_setup_unavailable" });
    addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "campaign_setup_unavailable" });
    addCheck("position_99_refund", "UNAVAILABLE", { reason: "existing_admin_session_required" });
    return false;
  }
  return true;
}

async function run() {
  if (!(await stagingPreflight())) return;
  loadState();
  activeStep = "staging capability preflight";
  let caps;
  try {
    caps = await stagingApi("/api/mailing-options");
  } catch (error) {
    if (apiErrorAsUnavailable(error)) {
      addCheck("staging_capabilities", "UNAVAILABLE", { reason: "staging_capability_route_unavailable" });
      addCheck("domestic_split_20_plus_30", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      addCheck("position_99_refund", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      return;
    }
    throw error;
  }
  if (caps.previewOnly !== true || caps.checkoutEnabled !== true || caps.pricing?.internationalSurchargeCents !== 500) {
    addCheck("staging_capabilities", "UNAVAILABLE", {
      reason: "preview_only_staging_and_enabled_checkout_required",
      previewOnly: caps.previewOnly === true,
      checkoutEnabled: caps.checkoutEnabled === true,
    });
    addCheck("domestic_split_20_plus_30", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
    addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
    addCheck("position_99_refund", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
    return;
  }
  addCheck("staging_capabilities", "PASS", {
    previewOnly: true,
    checkoutEnabled: true,
    internationalSurchargeCents: caps.pricing?.internationalSurchargeCents,
  });

  activeStep = "domestic 20 plus 30";
  const domestic = await setupProject("domestic", { count: 50, mixed: false });
  const domesticCampaign = await setupCampaign(domestic.ctx, { mixed: false });
  addCheck("domestic_campaign_setup", "PASS", { projectScoped: true, syntheticCode: true });
  const domesticFirst = await runBatch(domestic.ctx, "first", {
    first: 1,
    last: 20,
    grossCents: 16500,
    discountCents: 2000,
    netCents: 14500,
    campaignId: domesticCampaign.campaignId,
    code: domesticCampaign.code,
  });
  const domesticSecond = await runBatch(domestic.ctx, "second", {
    first: 21,
    last: 50,
    grossCents: 21250,
    discountCents: 500,
    netCents: 20750,
    campaignId: domesticCampaign.campaignId,
    code: domesticCampaign.code,
  });
  requireThat(
    domesticFirst.capturedCents === 14500 &&
      domesticSecond.capturedCents === 20750 &&
      domesticFirst.status === "held" &&
      domesticSecond.status === "held",
    "domestic_split_test_captures_held",
  );
  addCheck("domestic_split_20_plus_30", "PASS", {
    capturedCents: [domesticFirst.capturedCents, domesticSecond.capturedCents],
    statuses: [domesticFirst.status, domesticSecond.status],
    cards: [domesticFirst.cards, domesticSecond.cards],
  });

  activeStep = "mixed 98 plus 2 and position 99 refund";
  const mixed = await setupProject("mixed", { count: 100, mixed: true });
  const mixedCampaign = await setupCampaign(mixed.ctx, { mixed: true });
  addCheck("mixed_campaign_setup", "PASS", { projectScoped: true, syntheticCode: true });
  const mixedFirst = await runBatch(mixed.ctx, "first", {
    first: 1,
    last: 98,
    grossCents: 72350,
    discountCents: 2500,
    netCents: 69850,
    campaignId: mixedCampaign.campaignId,
    code: mixedCampaign.code,
    expectedCountries: { 1: "CA", 2: "GB" },
  });
  await correctFinalMixedAddresses(mixed.ctx);
  const mixedSecond = await runBatch(mixed.ctx, "second", {
    first: 99,
    last: 100,
    grossCents: 1850,
    discountCents: 0,
    netCents: 1850,
    campaignId: mixedCampaign.campaignId,
    code: undefined,
    expectedCountries: { 99: "FR", 100: "US" },
    closedBrowser: true,
  });
  requireThat(
    mixedFirst.capturedCents === 69850 &&
      mixedSecond.capturedCents === 1850 &&
      mixedFirst.status === "held" &&
      mixedSecond.status === "held",
    "mixed_split_test_captures_held",
  );
  addCheck("mixed_98_plus_2", "PASS", {
    capturedCents: [mixedFirst.capturedCents, mixedSecond.capturedCents],
    statuses: [mixedFirst.status, mixedSecond.status],
    cards: [mixedFirst.cards, mixedSecond.cards],
    grossCents: [mixedFirst.grossCents, mixedSecond.grossCents],
    discountCents: [mixedFirst.discountCents, mixedSecond.discountCents],
  });
  addCheck("runtime_test_hold_flags", "PASS", {
    stagingReviewOnly: true,
    weddingCheckoutEnabled: true,
    stripeTestMode: true,
    allPaidBatchesHeld: true,
  });

  activeStep = "position 99 normal-route refund";
  try {
    const refund = await refundPosition99(mixed.ctx, mixed.ctx.second.id);
    addCheck("position_99_refund", "PASS", refund);
  } catch (error) {
    if (error instanceof AcceptanceUnavailable) {
      addCheck("position_99_refund", "UNAVAILABLE", { reason: error.message });
    } else {
      throw error;
    }
  }
}

run()
  .catch((error) => {
    if (activeStep === "startup") {
      addCheck("preflight", "FAIL", {
        reason: safeReason(error),
      });
      addCheck("domestic_split_20_plus_30", "UNAVAILABLE", { reason: "preflight_failed" });
      addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "preflight_failed" });
      addCheck("position_99_refund", "UNAVAILABLE", { reason: "preflight_failed" });
      return;
    }
    if (activeStep === "staging capability preflight") {
      addCheck("staging_capabilities", "FAIL", { reason: "staging_capability_check_failed" });
      addCheck("domestic_split_20_plus_30", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      addCheck("position_99_refund", "UNAVAILABLE", { reason: "staging_capabilities_unavailable" });
      return;
    }
    if (error instanceof AcceptanceUnavailable || apiErrorAsUnavailable(error)) {
      const stageName = activeStep.startsWith("domestic")
        ? "domestic_split_20_plus_30"
        : activeStep.startsWith("mixed")
          ? "mixed_98_plus_2"
          : "position_99_refund";
      addCheck(stageName, "UNAVAILABLE", {
        reason: error instanceof HttpFailure ? "staging_route_unavailable" : safeReason(error),
      });
      if (stageName === "domestic_split_20_plus_30") {
        addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "prior_acceptance_unavailable" });
        addCheck("position_99_refund", "UNAVAILABLE", { reason: "mixed_payment_not_completed" });
      } else if (stageName === "mixed_98_plus_2") {
        addCheck("position_99_refund", "UNAVAILABLE", { reason: "mixed_payment_not_completed" });
      }
      return;
    }
    const stageName = activeStep.startsWith("domestic")
      ? "domestic_split_20_plus_30"
      : activeStep.startsWith("mixed")
        ? "mixed_98_plus_2"
        : "position_99_refund";
    addCheck(stageName, "FAIL", {
      reason: safeReason(error),
    });
    if (stageName === "domestic_split_20_plus_30") {
      addCheck("mixed_98_plus_2", "UNAVAILABLE", { reason: "prior_acceptance_failed" });
      addCheck("position_99_refund", "UNAVAILABLE", { reason: "mixed_payment_not_completed" });
    } else if (stageName === "mixed_98_plus_2") {
      addCheck("position_99_refund", "UNAVAILABLE", { reason: "mixed_payment_not_completed" });
    }
  })
  .finally(() => {
    report.verifiedAt = new Date().toISOString();
    report.privateRecoveryFile = STATE_PATH;
    report.noProductionAccess = true;
    report.noFulfillmentCalls = true;
    report.status = report.checks.some((item) => item.status === "FAIL")
      ? "FAIL"
      : report.checks.some((item) => item.status === "UNAVAILABLE")
        ? "INCOMPLETE"
        : "PASS";
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "FAIL") process.exitCode = 1;
    if (report.status === "INCOMPLETE") process.exitCode = 2;
  });
