/** Connection details an admin hands to a new account: where the server is, who they are, and the temporary token. */
export type Invite = { url: string; username: string; token: string };

const CONNECT_PREFIX = "magpie://connect";

export function inviteLink({ url, username, token }: Invite): string {
  const q = new URLSearchParams({ url, username, token });
  return `${CONNECT_PREFIX}?${q.toString()}`;
}

/** A message that works even where the app link is not clickable: the details are spelled out too. */
export function inviteMessage(invite: Invite): string {
  return [
    "You are invited to Magpie.",
    "",
    `Server: ${invite.url}`,
    `Username: ${invite.username}`,
    `Access token: ${invite.token}`,
    "",
    `Open in the app: ${inviteLink(invite)}`,
    "",
    "Sign in with the token first, then choose a password in Settings. The token stops working once you have.",
  ].join("\n");
}

/** Reads an invite back from a pasted message: the app link if there is one, else the spelled-out lines. */
export function parseInvite(text: string): Invite | null {
  const link = /magpie:\/\/connect\?[^\s]+/i.exec(text);
  if (link) {
    const q = new URLSearchParams(link[0].slice(link[0].indexOf("?") + 1));
    const url = q.get("url");
    const token = q.get("token");
    if (url && token) return { url, username: q.get("username") ?? "", token };
  }
  const line = (label: string) => new RegExp(String.raw`^\s*${label}\s*:\s*(.+?)\s*$`, "im").exec(text)?.[1];
  const url = line("Server");
  const token = line("Access token");
  return url && token ? { url, username: line("Username") ?? "", token } : null;
}
