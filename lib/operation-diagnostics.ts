import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SAFE_OPERATION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;

/** Accept a caller correlation token only after strict validation; otherwise mint one. */
export function resolveOperationId(request: NextRequest, prefix: string): string {
  const requested = request.headers.get("x-correlation-id") || request.headers.get("x-request-id") || "";
  return SAFE_OPERATION_ID.test(requested) ? requested : `${prefix}_${crypto.randomUUID()}`;
}

export function withOperationId<T extends NextResponse>(response: T, operationId: string): T {
  response.headers.set("x-operation-id", operationId);
  return response;
}

export function operationMetadata(operationId: string, metadata: Record<string, unknown> = {}) {
  return { ...metadata, operationId };
}
