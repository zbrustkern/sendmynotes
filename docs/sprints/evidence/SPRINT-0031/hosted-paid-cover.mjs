// Usage: node docs/sprints/evidence/SPRINT-0031/hosted-paid-cover.mjs --staging-test
// First issue the single-use pilot into the fixed private input path below. A retry
// always uses the same project and batch, and queries the intent before confirming.
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import sharp from "sharp";
import { stagingRequest } from "./staging-request.mjs";
const origin = "https://staging.sendmynotes.com";
const invitation = "/private/tmp/smn-wedding-paid-cover-v2.private";
const local = "/private/tmp/smn-wedding-paid-cover-v2-state.private";
const output = new URL("./hosted-paid-cover.json", import.meta.url);
const must = (condition, code) => {
  if (!condition) throw new Error(code);
};
const readPrivate = (path) => {
  const s = lstatSync(path);
  must(s.isFile() && (s.mode & 0o777) === 0o600, "private_file_required");
  return readFileSync(path, "utf8");
};
must(process.argv.includes("--staging-test"), "explicit_staging_test_required");
const state = existsSync(local)
  ? JSON.parse(readPrivate(local))
  : { origin, cookies: {}, foreign: {} };
must(state.origin === origin, "unexpected_staging_origin");
function save() {
  const temp = local + ".new";
  writeFileSync(temp, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  renameSync(temp, local);
}
const projectPath = "/api/wedding/project",
  purchasePath = "/api/wedding/checkout",
  artPath = "/api/wedding/artwork";
async function request(
  path,
  { body, file, cookies = state.cookies, deny = false, bytes = false } = {},
) {
  must(
    [projectPath, purchasePath, artPath, "/api/mailing-options"].includes(
      path.split("?")[0],
    ),
    "unexpected_route",
  );
  const operation = body?.action || path.split("?")[0].split("/").pop();
  const h = {
    origin,
    cookie: Object.entries(cookies)
      .map(([k, v]) => k + "=" + v)
      .join("; "),
  };
  if (body) h["content-type"] = "application/json";
  const res = await stagingRequest(origin + path, {
    method: body || file ? "POST" : "GET",
    headers: h,
    body: body ? JSON.stringify(body) : file,
    signal: AbortSignal.timeout(90000),
  });
  for (const raw of res.headers.getSetCookie()) {
    const [key, value] = raw.split(";")[0].split("=");
    if (/^smn_wedding_[a-z]+$/.test(key) && /^[a-f0-9]{64}$/.test(value)) {
      cookies[key] = value;
      save();
    }
  }
  if (deny) {
    must([401, 403, 404].includes(res.status), "unexpected_foreign_access");
    return res.status;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Error(
      "failed_" +
        operation +
        "_" +
        res.status +
        "_" +
        (/^[a-z_]{1,60}$/.test(data.code) ? data.code : "response"),
    );
  }
  if (bytes) {
    must(
      res.headers.get("content-type")?.includes("image/png"),
      "private_png_expected",
    );
    return Buffer.from(await res.arrayBuffer());
  }
  return res.json();
}
const action = (path, action, data = {}) =>
  request(path, { body: { action, ...data } });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const address = {
  address1: "101 Fictional Lane",
  address2: "",
  city: "Example",
  state: "MA",
  zip: "02108",
  country: "US",
};
const body =
  "We made the lemon pasta in your blue bowl. Thank you for the recipe!";
const signOff = "With love,\nAlex and Jamie";
const expected = "Dear Noor and Kit,\n\n" + body + "\n\n" + signOff;
let step = "capabilities";
async function run() {
  const caps = await request("/api/mailing-options");
  must(caps.previewOnly && caps.checkoutEnabled, "staging_hold_required");
  step = "membership";
  let view = state.cookies.smn_wedding_session
    ? await request(projectPath)
    : await action(projectPath, "create", { sample: false });
  if (!view.actor.pilot) {
    const token = new URLSearchParams(
      new URL(readPrivate(invitation).trim()).hash.slice(1),
    ).get("wedding");
    must(/^[a-f0-9]{64}$/.test(token || ""), "invalid_invite");
    view = await action(projectPath, "redeem", { token });
  }
  must(
    view.actor.pilot &&
      view.actor.role === "owner" &&
      (!state.projectId || state.projectId === view.project.id),
    "guest_pilot_required",
  );
  if (!state.projectId) {
    must(
      !view.households.length && !view.project.purchasedCount,
      "isolated_empty_project_required",
    );
    state.projectId = view.project.id;
    state.preset = view.project.cover;
    save();
  }
  step = "private_upload";
  if (!state.normalized) {
    const width = 680,
      height = 880,
      pixels = Buffer.alloc(width * height * 3, 246);
    for (const [left, top, tone] of [
      [0, 0, 40],
      [590, 0, 80],
      [0, 790, 120],
      [590, 790, 160],
    ])
      for (let y = top; y < top + 90; y++)
        for (let x = left; x < left + 90; x++)
          pixels[(y * width + x) * 3] = tone;
    const png = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    const file = new FormData();
    file.set(
      "file",
      new Blob([png], { type: "image/png" }),
      "synthetic-corners.png",
    );
    state.normalized = await request(artPath, { file });
    save();
  }
  if (!state.composed) {
    state.composed = await action(artPath, "compose", {
      assetId: state.normalized.assetId,
      fit: "cover",
      zoom: 1.12,
      x: 0.07,
      y: 0.04,
      lettering: "Thank you",
    });
    save();
  }
  const rawUrl =
      artPath + "?id=" + encodeURIComponent(state.normalized.assetId),
    composedUrl = artPath + "?id=" + encodeURIComponent(state.composed.assetId);
  const [original, composed] = await Promise.all([
    request(rawUrl, { bytes: true }),
    request(composedUrl, { bytes: true }),
  ]);
  const masterHash = hash(composed),
    dimensions = await sharp(composed).metadata();
  must(
    masterHash !== hash(original) &&
      dimensions.width === 1275 &&
      dimensions.height === 1650,
    "transformed_master_required",
  );
  if (!state.frozenHash) {
    state.frozenHash = masterHash;
    save();
  }
  must(state.frozenHash === masterHash, "private_master_changed");
  step = "personal_note";
  if (!view.project.purchasedCount && !state.batch) {
    if (view.project.cover.id !== state.composed.assetId)
      view = await action(projectPath, "saveProject", {
        revision: view.project.revision,
        patch: {
          sharedBody: "Thank you for being there.",
          signOff,
          returnAddress: {
            ...address,
            firstName: "Alex and Jamie",
            lastName: "",
          },
          cover: {
            kind: "upload",
            id: state.composed.assetId,
            url: composedUrl,
          },
        },
      });
    if (!view.households.length)
      view = await action(projectPath, "saveHousehold", {
        id: "paid_cover_fixture",
        revision: 0,
        patch: {
          envelopeName: "Noor Vale and Kit Gale",
          firstName: "Noor Vale and Kit Gale",
          lastName: "",
          insideName: "Noor and Kit",
          identityConfirmed: true,
          insideNameConfirmed: true,
          address,
          addressConfirmed: true,
          bodyOverride: body,
        },
      });
    const [row] = view.households;
    must(
      view.households.length === 1 &&
        row.address.country === "US" &&
        row.bodyOverride === body,
      "one_domestic_personal_card_required",
    );
    if (!row.approvedFingerprint)
      view = await action(projectPath, "approve", {
        ids: [row.id],
        revisions: { [row.id]: row.revision },
        projectRevision: view.project.revision,
        mode: "individual",
      });
    const selection = [{ id: row.id, revision: view.households[0].revision }];
    if (view.project.activeBatchId) {
      state.batch = view.project.activeBatchId;
      save();
    } else {
      const { quote, checkoutEnabled } = await action(purchasePath, "quote", {
        selection,
      });
      must(
        checkoutEnabled &&
          quote.lines.length === 1 &&
          quote.totalCents === 900 &&
          quote.addedTaxCents === 0 &&
          quote.mailingCents === 0,
        "single_domestic_test_quote_required",
      );
      state.batch = (
        await action(purchasePath, "reserve", {
          selection,
          quoteHash: quote.id,
        })
      ).batchId;
      save();
    }
  }
  must(!!state.batch, "original_batch_required");
  const value = { batchId: state.batch };
  let status = await action(purchasePath, "status", value);
  step = "single_test_capture";
  if (status.status === "preparing")
    status = await action(purchasePath, "advance", value);
  if (status.status !== "held") {
    must(
      ["ready", "awaiting_payment"].includes(status.status),
      "batch_not_ready",
    );
    const pay = await action(purchasePath, "pay", value),
      pi = pay.clientSecret?.match(
        /^(pi_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/,
      )?.[1];
    must(pi && pay.publishableKey?.startsWith("pk_test_"), "test_key_required");
    const stripeUrl = "https://api.stripe.com/v1/payment_intents/" + pi,
      params = new URLSearchParams({
        key: pay.publishableKey,
        client_secret: pay.clientSecret,
      });
    const before = await fetch(stripeUrl + "?" + params, {
      redirect: "error",
      signal: AbortSignal.timeout(40000),
    });
    let intent = await before.json();
    must(
      before.ok &&
        intent.id === pi &&
        intent.livemode === false &&
        intent.amount === 900 &&
        intent.currency === "usd",
      "test_intent_amount_required",
    );
    if (intent.status !== "succeeded") {
      must(
        intent.status === "requires_payment_method",
        "existing_intent_not_reconciled",
      );
      params.set("payment_method", "pm_card_visa");
      const confirmed = await fetch(stripeUrl + "/confirm", {
        method: "POST",
        body: params,
        redirect: "error",
        signal: AbortSignal.timeout(40000),
      });
      intent = await confirmed.json();
      must(
        confirmed.ok &&
          intent.id === pi &&
          intent.status === "succeeded" &&
          intent.livemode === false &&
          intent.amount === 900,
        "test_confirmation_failed",
      );
    }
  }
  status = await action(purchasePath, "confirm", value);
  must(
    status.status === "held" &&
      status.count === 1 &&
      status.capturedCents === 900,
    "single_held_capture_required",
  );
  step = "immutable_card";
  const readSnapshot = () =>
    action(purchasePath, "card", {
      ...value,
      householdId: "paid_cover_fixture",
    });
  const initial = await readSnapshot();
  must(
    initial.card.note === expected &&
      initial.card.cover.id === state.composed.assetId,
    "initial_card_mismatch",
  );
  const paidUrl = purchasePath + "?art=" + encodeURIComponent(state.batch);
  must(
    initial.card.cover.url === paidUrl,
    "authorized_paid_cover_url_required",
  );
  must(
    hash(await request(paidUrl, { bytes: true })) === state.frozenHash,
    "paid_master_mismatch",
  );
  view = await request(projectPath);
  if (view.project.cover.kind === "upload")
    view = await action(projectPath, "saveProject", {
      revision: view.project.revision,
      patch: {
        cover: state.preset,
        sharedBody: "We loved the celebration.",
        signOff: "Warmly,\nThe couple",
      },
    });
  must(
    view.project.cover.kind === "preset" &&
      view.project.cover.id !== state.composed.assetId &&
      view.project.signOff !== signOff,
    "change_saved_cover_and_wording",
  );
  const after = await readSnapshot();
  must(
    after.card.note === expected &&
      after.card.cover.id === state.composed.assetId &&
      hash(await request(after.card.cover.url, { bytes: true })) ===
        state.frozenHash,
    "paid_snapshot_changed",
  );
  step = "foreign_session";
  if (!state.foreign.smn_wedding_session)
    await request(projectPath, {
      body: { action: "create", sample: false },
      cookies: state.foreign,
    });
  const other = await request(projectPath, { cookies: state.foreign });
  must(
    other.project.id !== state.projectId && other.actor.role === "owner",
    "foreign_owner_required",
  );
  const denied = {
    draft: await request(composedUrl, { cookies: state.foreign, deny: true }),
    paidMaster: await request(paidUrl, { cookies: state.foreign, deny: true }),
    card: await request(purchasePath, {
      cookies: state.foreign,
      deny: true,
      body: { action: "card", ...value, householdId: "paid_cover_fixture" },
    }),
  };
  return {
    host: new URL(origin).host,
    observedAt: new Date().toISOString(),
    processor: "stripe_test",
    cards: status.count,
    capturedCents: status.capturedCents,
    deliveryStatus: status.status,
    syntheticFront: {
      cropAndLetteringChangedBytes: true,
      width: dimensions.width,
      height: dimensions.height,
    },
    privateMasterMatchesPaidBeforeAndAfter: true,
    purchasedNoteMatchesApprovedPersonalPreviewBeforeAndAfter: true,
    editableCoverAndSignOffChanged: true,
    otherProjectOwnerDenied: denied,
  };
}
try {
  const result = await run();
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} catch (e) {
  const reason = /^[a-z_0-9]{1,100}$/.test(e.message)
    ? e.message
    : "request_failure";
  console.error(JSON.stringify({ step, reason }));
  process.exitCode = 1;
}
