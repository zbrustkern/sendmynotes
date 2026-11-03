#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parsePostPurchaseArgs } from "./post-purchase-cli";
import type { PostPurchaseEnvironment } from "./post-purchase-cli";

const PROJECTS: Record<PostPurchaseEnvironment, string> = {
  staging: "sendmynotes-staging",
  production: "sendmynotes-2a417",
};

function safe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safe);
  if (!value || typeof value !== "object") return value;
  const allowed = new Set(["orderId", "maskedEmail", "eligible", "eligibility", "reason", "state", "stage", "step", "dueAt", "createdAt", "updatedAt", "acceptedAt", "processed", "accepted", "held", "failed", "uncertain", "count", "limit", "mode", "globalPaused", "deliveryEnabled", "environment", "readOnly", "applied", "subject", "previewText", "text", "html", "versionId", "status", "offerStatus", "paymentEvidence", "mailingEvidence", "permissionState"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => allowed.has(key)).map(([key, item]) => [key, safe(item)]));
}

function verifyProject(environment: PostPurchaseEnvironment): string {
  const expected = PROJECTS[environment];
  const selected = process.env.FIREBASE_PROJECT_ID;
  const google = process.env.GOOGLE_CLOUD_PROJECT;
  if (!selected || !google || selected !== expected || google !== expected) {
    throw new Error(`Set FIREBASE_PROJECT_ID and GOOGLE_CLOUD_PROJECT to ${expected} for --environment ${environment}.`);
  }
  if (!process.env.POST_PURCHASE_SENDER_HMAC_KEY || process.env.POST_PURCHASE_SENDER_HMAC_KEY.length < 32) {
    throw new Error("POST_PURCHASE_SENDER_HMAC_KEY is not configured; no operation was attempted.");
  }
  return expected;
}

function authorizedOperator(): string {
  let email = "";
  try {
    email = execFileSync(process.env.SMN_GCLOUD_BIN || "gcloud", ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000,
    }).trim().split(/\r?\n/)[0] || "";
  } catch {
    throw new Error("An active gcloud operator identity is required for --apply.");
  }
  const allow = (process.env.UPLOAD_ADMIN_EMAILS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!email || !allow.includes(email.toLowerCase())) throw new Error("The active operator is not in the configured admin allowlist.");
  return email;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = parsePostPurchaseArgs(process.argv.slice(2));
  const projectId = verifyProject(args.environment);

  // Import only after the explicit environment/project check: firebase-admin
  // initializes its singleton at module load time.
  const firebase = await import("../lib/firebase-admin");
  if (firebase.isFirestoreMock) throw new Error("CLI refuses mock Firestore; no operation was attempted.");

  const { getPostPurchaseConfig } = await import("../lib/post-purchase/config");
  const config = await getPostPurchaseConfig();
  const envelope = { environment: args.environment, projectId, readOnly: !args.apply, applied: false };

  if (args.command === "preview") {
    const service = await import("../lib/post-purchase/operator");
    const preview = await service.previewPostPurchaseMessage({ orderId: args.orderId!, step: args.stage! });
    printJson({ ...envelope, preview: safe(preview) });
    return;
  }

  if (args.command === "candidates") {
    const service = await import("../lib/post-purchase/operator");
    const rows = await service.listPostPurchaseCandidates({ limit: args.limit });
    printJson({ ...envelope, limit: args.limit, candidates: safe(rows) });
    return;
  }

  if (args.command === "reconcile") {
    const service = await import("../lib/post-purchase/operator");
    const record = await service.reconcilePostPurchaseMessage(args.messageId!);
    printJson({ ...envelope, reconcile: safe(record), mutationSupported: false });
    return;
  }

  if (args.command === "enroll") {
    if (!args.apply) {
      const service = await import("../lib/post-purchase/operator");
      const preview = await service.previewPostPurchaseEnrollment(args.orderId!);
      printJson({ ...envelope, enrollment: safe(preview), applyRequired: true });
      return;
    }
    const actor = authorizedOperator();
    const service = await import("../lib/post-purchase/enrollment");
    const result = await service.enrollPostPurchaseOrder(args.orderId!, actor);
    printJson({ ...envelope, readOnly: false, applied: true, enrollment: safe(result) });
    return;
  }

  if (args.command === "dispatch") {
    if (!args.apply) {
      const repository = await import("../lib/post-purchase/repository");
      const due = await repository.listDueMessages(Date.now(), args.limit);
      printJson({ ...envelope, limit: args.limit, dueCount: due.length, globalPaused: config.globalPaused, deliveryEnabled: process.env.POST_PURCHASE_DELIVERY_ACTIVE === "true", applyRequired: true });
      return;
    }
    authorizedOperator();
    if (args.environment === "staging" || process.env.STAGING_REVIEW_ONLY === "true") throw new Error("Dispatch is blocked in staging review-only mode.");
    if (process.env.POST_PURCHASE_DELIVERY_ACTIVE !== "true") throw new Error("POST_PURCHASE_DELIVERY_ACTIVE is not true; no messages were dispatched.");
    if (config.globalPaused) throw new Error("The post-purchase program is paused; no messages were dispatched.");
    const service = await import("../lib/post-purchase/dispatch");
    const result = await service.dispatchDuePostPurchase(args.limit);
    printJson({ ...envelope, readOnly: false, applied: true, dispatch: safe(result) });
    return;
  }

  throw new Error("Unsupported command.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Post-purchase command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
