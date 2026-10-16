import { ACT_AS_HEADER, ApiErrorBody, HealthResponse, LoginResponse, MeResponse, type ErrorCode } from "@magpie/shared/api";
import type { z } from "zod";
import { useAccounts } from "@/stores/accounts";

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
  const { accounts, activeId, token, actAs } = useAccounts.getState();
  const account = accounts.find((a) => a.id === activeId);
  if (!account || !token) throw new ApiError(0, "not_configured", "Add a server account first");

  let res: Response;
  try {
    res = await fetch(buildUrl(account.url, path, query), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        // admin only: work inside another account's library
        ...(actAs ? { [ACT_AS_HEADER]: actAs.id } : {}),
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

/** Checks the URL points at Magpie and the token is accepted; says who the token belongs to. */
export async function checkServer(baseUrl: string, token: string): Promise<{ version: string; me: MeResponse }> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new ApiError(0, "bad_request", "The server URL must start with http:// or https://");
  let health: Response;
  try {
    health = await fetch(`${base}/api/v1/health`);
  } catch {
    throw new ApiError(0, "network", "Can't reach the server");
  }
  const h = HealthResponse.safeParse(await health.json().catch(() => null));
  if (!health.ok || !h.success) throw new ApiError(health.status, "invalid_response", "Not a Magpie server");
  const res = await fetch(`${base}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new ApiError(401, "unauthorized", "Token rejected");
  if (res.status === 404) throw new ApiError(404, "not_found", "This server is too old for accounts; update it first");
  const me = MeResponse.safeParse(await res.json().catch(() => null));
  if (!res.ok || !me.success) throw new ApiError(res.status, "invalid_response", "Unexpected response from server");
  return { version: h.data.version, me: me.data };
}

async function checkHealth(base: string): Promise<string> {
  let health: Response;
  try {
    health = await fetch(`${base}/api/v1/health`);
  } catch {
    throw new ApiError(0, "network", "Can't reach the server");
  }
  const h = HealthResponse.safeParse(await health.json().catch(() => null));
  if (!health.ok || !h.success) throw new ApiError(health.status, "invalid_response", "Not a Magpie server");
  return h.data.version;
}

/** Username + password → a session token for this device (a normal bearer token from then on). */
export async function loginWithPassword(baseUrl: string, username: string, password: string): Promise<LoginResponse> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) throw new ApiError(0, "bad_request", "The server URL must start with http:// or https://");
  await checkHealth(base);
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server");
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(json);
    throw new ApiError(res.status, err.success ? err.data.error.code : "internal", err.success ? err.data.error.message : `Server error (${res.status})`);
  }
  const parsed = LoginResponse.safeParse(json);
  if (!parsed.success) throw new ApiError(res.status, "invalid_response", "Unexpected response from server");
  return parsed.data;
}

/** Best effort: tells the server to forget this device's session. Never throws. */
export async function signOutRemote(baseUrl: string, token: string): Promise<void> {
  try {
    await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/me/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // offline: the session stays valid until it expires or the account is reset
  }
}
