// Turns tool/HTTP errors into pipeline decisions (docs/worker-pipeline.md#fetch).
import { BlockedTargetError } from "../net/ssrf.ts";
import { ToolError } from "../tools/run.ts";
import { HttpStatusError } from "./download.ts";

export type ErrorClass = "blocked" | "gone" | "retry" | "fatal";

const GONE =
  /\b(404|410)\b|not found|no longer available|not available|has been removed|was removed|been deleted|does not exist|private (video|account|post)|this (video|post|content) is (unavailable|private)|unavailable video|account.*(suspended|terminated)/i;
const RETRY =
  /\b(429|5\d\d)\b|rate.?limit|too many requests|login required|\blog ?in\b|sign in|requested content is not available|checkpoint|timed out|timeout|temporar|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network|unable to download webpage|cookies/i;

/** Failure text that means the session is missing or dead, as opposed to a plain rate limit. */
// yt-dlp reports Instagram's login wall as a JSON parse failure, gallery-dl as a redirect to the login page
const AUTH = /\blog ?in\b|sign in|checkpoint|cookies|\b(401|403)\b|failed to parse json/i;
export const looksLikeAuthFailure = (message: string) => AUTH.test(message);

export function classifyError(error: unknown): ErrorClass {
  if (error instanceof BlockedTargetError) return error.reason === "too_large" ? "fatal" : "blocked";
  if (error instanceof HttpStatusError) {
    if (error.status === 404 || error.status === 410) return "gone";
    if (error.status === 429 || error.status >= 500 || error.status === 401 || error.status === 403) return "retry";
    return "fatal";
  }
  const text = error instanceof ToolError ? `${error.message}\n${error.stderr}` : error instanceof Error ? error.message : String(error);
  // Instagram says "not available" for both deleted posts and logged-out rate limiting; retry wins
  if (RETRY.test(text)) return "retry";
  if (GONE.test(text)) return "gone";
  return "fatal";
}

/** For logs: query strings may carry signatures or tracking ids. */
export function logUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return "(invalid url)";
  }
}

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.slice(0, 500);
}
