import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { POST, GET } from "../app/api/admin/auth/route";
import { generateAdminSessionToken, verifyAdminAuth, getAdminSessionSigningKey } from "../lib/admin-auth";
const request = (body: unknown) => new NextRequest("http://localhost/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function main() {
  Object.assign(process.env, { NODE_ENV: "test", ADMIN_SECRET_KEY: "fixture_legacy_key", ADMIN_SESSION_SIGNING_KEY: "fixture_private_signing_key" });
  for (const body of [{ passphrase: "fixture_legacy_key" }, {}, { idToken: "forged" }]) {
    const r = await POST(request(body)); assert.equal(r.status, 401); assert.equal(r.headers.get("set-cookie"), null);
  }
  assert.equal(verifyAdminAuth(new NextRequest("http://localhost/api/admin/reporting", { headers: { "x-admin-key": "fixture_legacy_key" } })), false);
  // A genuine legacy anonymous signature must no longer authorize anything.
  const payload = `smn_admin_${Date.now()}`;
  const anonymous = payload + "." + crypto.createHmac("sha256",getAdminSessionSigningKey()).update(payload).digest("hex");
  for (const token of [anonymous, generateAdminSessionToken("unknown@example.com")]) {
    const req = new NextRequest("http://localhost/api/admin/auth", { headers: { cookie: `smn_admin_session=${token}` } });
    assert.equal(verifyAdminAuth(req), false); assert.equal((await (await GET(req)).json()).authenticated, false);
  }
  const allowed = await POST(request({ idToken: "mock_token_zbrustkern@gmail.com" }));
  assert.equal(allowed.status, 200); const cookie = allowed.headers.get("set-cookie")!.split(";")[0];
  assert.equal(verifyAdminAuth(new NextRequest("http://localhost/api/admin/reporting", { headers: { cookie } })), true);
  assert.equal((await POST(request({ idToken: "mock_token_unknown@example.com" }))).status, 403);
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal((await POST(request({ idToken: "mock_token_zbrustkern@gmail.com" }))).status, 401, "Mock identity cannot create production sessions");
  console.log("Google-only auth: valid allowed account succeeds; passphrase, header key, anonymous/unauthorized sessions and production mock identities rejected.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
