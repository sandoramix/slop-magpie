import type { ApiErrorBody, ErrorCode, ErrorReason } from "@magpie/shared/api";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  override name = "ApiError";
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code: ErrorCode, message: string, reason?: ErrorReason): ApiErrorBody {
  return { error: { code, message, ...(reason ? { reason } : {}) } };
}

export function errorResponse(c: Context, status: ContentfulStatusCode, code: ErrorCode, message: string, reason?: ErrorReason) {
  return c.json(errorBody(code, message, reason), status);
}
