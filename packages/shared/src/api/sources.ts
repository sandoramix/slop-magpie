import { z } from "zod";

export const SourceInfo = z.object({
  id: z.string(),
  label: z.string(),
  hosts: z.array(z.string()),
  itemCount: z.number().int().nonnegative(),
  /** False for sources whose code exists but is switched off (`ENABLED_SOURCES`); their links save as generic. */
  enabled: z.boolean().default(true),
});
export type SourceInfo = z.infer<typeof SourceInfo>;

export const SourcesResponse = z.object({ sources: z.array(SourceInfo) });
export type SourcesResponse = z.infer<typeof SourcesResponse>;

/** Login material an admin can upload per source (session = base64 of instaloader's session file, cookies = cookies.txt). */
export const credentialKinds = ["session", "cookies"] as const;
export const CredentialKind = z.enum(credentialKinds);
export type CredentialKind = z.infer<typeof CredentialKind>;

export const CredentialKindParam = z.object({ id: z.string().min(1).max(50), kind: CredentialKind });
export const SourceIdParam = z.object({ id: z.string().min(1).max(50) });

export const SetCredentialBody = z.object({ content: z.string().min(1).max(4_000_000) });
export type SetCredentialBody = z.infer<typeof SetCredentialBody>;

/** What is stored, never the content itself. */
export const CredentialsStatus = z.object({
  source: z.string(),
  session: z.object({ updatedAt: z.iso.datetime() }).nullable(),
  cookies: z.object({ updatedAt: z.iso.datetime() }).nullable(),
  /** The worker's last verdict on the saved session; null before its first check. */
  state: z.object({ value: z.enum(["ok", "dead"]), checkedAt: z.iso.datetime() }).nullable(),
});
export type CredentialsStatus = z.infer<typeof CredentialsStatus>;
