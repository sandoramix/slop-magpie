import { ApiErrorBody, HealthResponse, StatsResponse, type ErrorCode } from "@magpie/shared/api";
import type { z } from "zod";
import { useAuth } from "@/stores/auth";
import { useSettings } from "@/stores/settings";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "network" | "invalid_response" | "not_configured";

  constructor(status: number, code: ApiError["code"], message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | undefined>;

type RequestOptions<S extends z.ZodType> = {
  query?: Query;
  body?: unknown;
  schema: S;
};

function buildUrl(base: string, path: string, query: Query | undefined): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, String(v));
  const qs = params.toString();
  return `${base}/api/v1${path}${qs ? `?${qs}` : ""}`;
}

/** Every response is parsed with the shared zod schema; nothing unvalidated reaches the UI (D19). */
export async function request<S extends z.ZodType>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  { query, body, schema }: RequestOptions<S>,
): Promise<z.infer<S>> {
  const base = useSettings.getState().apiUrl;
  const token = useAuth.getState().token;
  if (!base || !token) throw new ApiError(0, "not_configured", "Set the server URL and token in Settings");

  let res: Response;
  try {
    res = await fetch(buildUrl(base, path, query), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server");
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorBody.safeParse(json);
    if (parsed.success) throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.message);
    throw new ApiError(res.status, "internal", `Server error (${res.status})`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, "invalid_response", "Unexpected response from server");
  return parsed.data;
}

/** Used by Settings before saving: checks the URL points at Magpie and the token is accepted. */
export async function checkServer(baseUrl: string, token: string): Promise<{ version: string }> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  let health: Response;
  try {
    health = await fetch(`${base}/api/v1/health`);
  } catch {
    throw new ApiError(0, "network", "Can't reach the server");
  }
  const h = HealthResponse.safeParse(await health.json().catch(() => null));
  if (!health.ok || !h.success) throw new ApiError(health.status, "invalid_response", "Not a Magpie server");
  const auth = await fetch(`${base}/api/v1/stats`, { headers: { Authorization: `Bearer ${token}` } });
  if (auth.status === 401) throw new ApiError(401, "unauthorized", "Token rejected");
  if (!auth.ok || !StatsResponse.safeParse(await auth.json().catch(() => null)).success) {
    throw new ApiError(auth.status, "invalid_response", "Unexpected response from server");
  }
  return { version: h.data.version };
}
