import type { ApiErrorBody, ErrorCode } from "@magpie/shared/api";
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

export function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function errorResponse(c: Context, status: ContentfulStatusCode, code: ErrorCode, message: string) {
  return c.json(errorBody(code, message), status);
}
