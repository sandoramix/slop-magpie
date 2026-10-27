// Google, GitHub and Discord as OAuth 2.0 authorization-code providers (docs/security.md#social-login).
// Everything provider specific lives here; the flow in services/oauth.ts is the same for all three.
import type { OAuthProvider } from "@magpie/shared/api";
import { z } from "zod";

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

/** What every provider boils down to once its profile is read. */
export interface ProviderProfile {
  /** The provider's stable user id. The key of the link, never the email. */
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** Something to propose as a username; the person confirms or changes it. */
  nameHint: string | null;
}

export interface ProviderDef {
  id: OAuthProvider;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string;
  /** Extra authorize parameters. */
  authorizeParams?: Record<string, string>;
  parseProfile(json: unknown): ProviderProfile;
}

const Google = z.looseObject({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
});

const GitHub = z.looseObject({
  id: z.number(),
  login: z.string().optional(),
  name: z.string().nullish(),
  email: z.string().nullish(),
});

const Discord = z.looseObject({
  id: z.string().min(1),
  username: z.string().optional(),
  global_name: z.string().nullish(),
  email: z.string().nullish(),
  verified: z.boolean().optional(),
});

export const providers: Readonly<Record<OAuthProvider, ProviderDef>> = {
  google: {
    id: "google",
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    authorizeParams: { access_type: "online", prompt: "select_account" },
    parseProfile(json) {
      const p = Google.parse(json);
      return { id: p.sub, email: p.email ?? null, emailVerified: p.email_verified ?? false, nameHint: p.given_name ?? p.name ?? p.email?.split("@")[0] ?? null };
    },
  },
  github: {
    id: "github",
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    profileUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    parseProfile(json) {
      const p = GitHub.parse(json);
      // the public profile email is whatever the person chose to show; it is never trusted as verified
      return { id: String(p.id), email: p.email ?? null, emailVerified: false, nameHint: p.login ?? p.name ?? null };
    },
  },
  discord: {
    id: "discord",
    label: "Discord",
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
    authorizeParams: { prompt: "none" },
    parseProfile(json) {
      const p = Discord.parse(json);
      return { id: p.id, email: p.email ?? null, emailVerified: p.verified ?? false, nameHint: p.username ?? p.global_name ?? null };
    },
  },
};

/** A username candidate from a provider's name hint: allowed characters only, 3 to 32 long. */
export function suggestUsername(hint: string | null): string {
  const cleaned = (hint ?? "").normalize("NFKD").replace(/[^A-Za-z0-9_.-]+/g, "").slice(0, 32);
  return cleaned.length >= 3 ? cleaned : `${cleaned}user`.slice(0, 32).padEnd(3, "0");
}
