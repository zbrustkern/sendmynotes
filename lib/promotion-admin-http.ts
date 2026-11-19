import { NextResponse } from "next/server";
import { adminEnvironmentMatches } from "./admin-environment";
import { PromotionAdminError } from "./promotions-v2-policy";

export function promotionAdminJson(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export function validatePromotionAdminEnvironment(environment: unknown) {
  if (environment === null || environment === undefined) return;
  if (typeof environment !== "string" || !adminEnvironmentMatches(environment as Parameters<typeof adminEnvironmentMatches>[0])) {
    throw new PromotionAdminError("Requested environment is not available from this configured datastore.", 409);
  }
}

export function promotionAdminErrorResponse(error: unknown) {
  if (error instanceof PromotionAdminError) return promotionAdminJson({ success: false, error: error.message }, error.status);
  return promotionAdminJson({ success: false, error: "The promotion could not be processed." }, 500);
}
