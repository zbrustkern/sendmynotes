import assert from "node:assert/strict";
import { parsePostPurchaseArgs } from "../scripts/post-purchase-cli";

const preview = parsePostPurchaseArgs(["preview", "--order", "synthetic-order", "--stage", "check-in", "--environment", "staging"]);
assert.equal(preview.apply, false);
assert.equal(preview.stage, "check_in");
assert.equal(preview.environment, "staging");

const apply = parsePostPurchaseArgs(["enroll", "--environment", "production", "--order", "synthetic-order", "--apply"]);
assert.equal(apply.apply, true);
assert.equal(apply.command, "enroll");

const dispatch = parsePostPurchaseArgs(["dispatch", "--environment", "staging", "--limit", "100"]);
assert.equal(dispatch.limit, 100);
assert.equal(dispatch.apply, false);

for (const args of [
  ["dispatch"],
  ["preview", "--environment", "staging", "--order", "x"],
  ["preview", "--environment", "staging", "--order", "x", "--stage", "offer", "--apply"],
  ["reconcile", "--environment", "production", "--message", "x", "--apply"],
  ["dispatch", "--environment", "production", "--limit", "101"],
  ["candidates", "--environment", "production", "--to", "someone@example.com"],
]) assert.throws(() => parsePostPurchaseArgs(args));

process.stdout.write("Post-purchase CLI argument safety checks passed.\n");
