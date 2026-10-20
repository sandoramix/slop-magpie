import { z } from "zod";
import { mergeCookies, parseSetCookies, toNetscape } from "../net/cookies.ts";
import { USER_AGENT } from "../strategies/types.ts";
import type { SourceFetcher } from "./types.ts";

const ORIGIN = "https://www.instagram.com";
// public web app id the instagram.com site itself sends
const WEB_APP_ID = "936619743392459";

const LoginResponse = z.object({
  authenticated: z.boolean().optional(),
  user: z.boolean().optional(),
  two_factor_required: z.boolean().optional(),
  checkpoint_url: z.string().optional(),
  message: z.string().optional(),
});

const cookieHeader = (cookies: readonly { name: string; value: string }[]) => cookies.map((c) => `${c.name}=${c.value}`).join("; ");

export const instagram: SourceFetcher = {
  id: "instagram",
  // reels/videos via yt-dlp; image posts and carousels (where yt-dlp finds no video) via gallery-dl
  strategies: ["yt-dlp", "gallery-dl"],

  // Neither yt-dlp nor gallery-dl can log in to Instagram any more, so this does the web login itself
  // (fixed host, no user-supplied URL) and returns the session as cookies.txt.
  async login({ fetch, credentials }) {
    const page = await fetch(`${ORIGIN}/accounts/login/`, { headers: { "user-agent": USER_AGENT }, redirect: "manual" });
    const initial = parseSetCookies(page.headers.getSetCookie(), "instagram.com");
    const csrf = initial.find((c) => c.name === "csrftoken")?.value;
    if (!csrf) throw new Error(`no csrftoken from the login page (HTTP ${page.status})`);

    const res = await fetch(`${ORIGIN}/api/v1/web/accounts/login/ajax/`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded",
        "x-csrftoken": csrf,
        "x-ig-app-id": WEB_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        origin: ORIGIN,
        referer: `${ORIGIN}/accounts/login/`,
        cookie: cookieHeader(initial),
      },
      body: new URLSearchParams({
        username: credentials.username,
        enc_password: `#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now() / 1000)}:${credentials.password}`,
        queryParams: "{}",
        optIntoOneTap: "false",
      }),
    });
    const parsed = LoginResponse.safeParse(await res.json().catch(() => null));
    const body = parsed.success ? parsed.data : {};
    if (body.two_factor_required) throw new Error("two-factor authentication is required; turn it off for this account");
    if (body.checkpoint_url) throw new Error("Instagram wants a security checkpoint; confirm the login in the Instagram app or website, then retry");
    if (!body.authenticated) {
      throw new Error(`login rejected (HTTP ${res.status}${body.user === false ? ", unknown user" : body.user ? ", wrong password" : ""}${body.message ? `: ${body.message.slice(0, 120)}` : ""})`);
    }

    const cookies = mergeCookies(initial, parseSetCookies(res.headers.getSetCookie(), "instagram.com"));
    if (!cookies.some((c) => c.name === "sessionid")) throw new Error("login succeeded but returned no sessionid");
    return toNetscape(cookies);
  },
};
