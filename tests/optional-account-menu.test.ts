import assert from "node:assert/strict";
import { classifyUploadStudioAccess } from "../lib/upload/access-state";

assert.equal(classifyUploadStudioAccess({ emailVerified: true, status: 200, allowed: true }), "active");
assert.equal(classifyUploadStudioAccess({ emailVerified: true, status: 200, allowed: false }), "inactive");
assert.equal(classifyUploadStudioAccess({ emailVerified: false, status: 200, allowed: true }), "inactive");
assert.equal(classifyUploadStudioAccess({ emailVerified: true, status: 401, allowed: true }), "inactive");
assert.equal(classifyUploadStudioAccess({ emailVerified: true, status: 403, allowed: true }), "inactive");
assert.equal(classifyUploadStudioAccess({ emailVerified: true, status: 503, allowed: false }), "error");
console.log("optional account menu access-state tests passed");
