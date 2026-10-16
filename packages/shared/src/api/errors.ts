import { z } from "zod";

export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "unsupported_url",
  "rate_limited",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Optional detail on a 401: the token belonged to an account an admin has since deleted. */
export const ErrorReason = z.enum(["account_deleted"]);
export type ErrorReason = z.infer<typeof ErrorReason>;

export const ApiErrorBody = z.object({
  // `reason` is additive: builds that predate it ignore it and still see `unauthorized`
  error: z.object({ code: ErrorCode, message: z.string(), reason: ErrorReason.optional() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
