/** Connection details an admin hands to a new account: where the server is, who they are, and the temporary token. */
export type Invite = { url: string; username: string; token: string };

const CONNECT_PREFIX = "magpie://connect";

/** The deep link the app opens; chat apps do not make it tappable, so it is not what gets shared. */
export function inviteLink({ url, username, token }: Invite): string {
  const q = new URLSearchParams({ url, username, token });
  return `${CONNECT_PREFIX}?${q.toString()}`;
}

/**
 * The shareable https link: the server's own landing page (`GET /invite`), which turns into the app
 * link on tap. The details travel in the fragment so they never reach server or proxy logs.
 */
export function inviteWebLink({ url, username, token }: Invite): string {
  const q = new URLSearchParams({ url, username, token });
  return `${url.replace(/\/+$/, "")}/invite#${q.toString()}`;
}

/** A message that works in chat apps: a tappable https link, with the details spelled out too. */
export function inviteMessage(invite: Invite): string {
  return [
    "You are invited to Magpie.",
    "",
    `Open this on your phone: ${inviteWebLink(invite)}`,
    "",
    `Server: ${invite.url}`,
    `Username: ${invite.username}`,
    `Access token: ${invite.token}`,
    "",
    "Sign in with the token first, then choose a password in Settings. The token stops working once you have.",
  ].join("\n");
}

function fromParams(params: string): Invite | null {
  const q = new URLSearchParams(params);
  const url = q.get("url");
  const token = q.get("token");
  return url && token ? { url, username: q.get("username") ?? "", token } : null;
}

/** Reads an invite back from a pasted message: either link if there is one, else the spelled-out lines. */
export function parseInvite(text: string): Invite | null {
  const app = /magpie:\/\/connect\?[^\s]+/i.exec(text);
  if (app) {
    const found = fromParams(app[0].slice(app[0].indexOf("?") + 1));
    if (found) return found;
  }
  const web = /https?:\/\/[^\s#]+\/invite#[^\s]+/i.exec(text);
  if (web) {
    const found = fromParams(web[0].slice(web[0].indexOf("#") + 1));
    if (found) return found;
  }
  const line = (label: string) => new RegExp(String.raw`^\s*${label}\s*:\s*(.+?)\s*$`, "im").exec(text)?.[1];
  const url = line("Server");
  const token = line("Access token");
  return url && token ? { url, username: line("Username") ?? "", token } : null;
}
