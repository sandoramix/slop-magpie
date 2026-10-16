import { createHash } from "node:crypto";
import { Hono } from "hono";

// Chat apps only turn http(s) text into tappable links, never `magpie://`. So an invite shares
// `https://<server>/invite#url=…&username=…&token=…` and this page turns it into the app link.
// The details sit in the URL fragment: browsers never send it, so the token stays out of server
// and proxy logs. The page is static; the script reads `location.hash` and uses textContent only.

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#0f0f14;--muted:#6b6b78;--border:#e4e4ea;--primary:#7c3aed}
@media(prefers-color-scheme:dark){:root{--bg:#0a0a0f;--fg:#f4f4f7;--muted:#9a9aa8;--border:#26262f;--primary:#a78bfa}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{width:100%;max-width:420px;display:grid;gap:16px}
h1{margin:0;font-size:1.6rem}
p{margin:0;color:var(--muted)}
.card{border:1px solid var(--border);border-radius:12px;padding:14px;display:grid;gap:4px;word-break:break-all}
.label{font-size:.8rem;color:var(--muted)}
a.button,button{display:block;width:100%;padding:14px;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:#fff;font:600 1rem system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
button.secondary,a.secondary{background:transparent;color:var(--primary)}
#ok:not([hidden]){display:grid;gap:16px}
details{color:var(--muted)}
summary{cursor:pointer}
details .card{margin-top:8px}
[hidden]{display:none}
`;

const SCRIPT = `
const q = new URLSearchParams(location.hash.slice(1));
const url = q.get("url") || "";
const token = q.get("token") || "";
const username = q.get("username") || "";
const valid = /^https?:\\/\\//i.test(url) && token !== "";
document.getElementById(valid ? "ok" : "bad").hidden = false;
if (valid) {
  const app = "magpie://connect?" + new URLSearchParams({ url, username, token }).toString();
  document.getElementById("open").href = app;
  document.getElementById("server").textContent = url;
  document.getElementById("user").textContent = username || "-";
  document.getElementById("tok").textContent = token;
  document.getElementById("copy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(token); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy it by hand"; }
  });
}
`;

const BODY = `<main>
<h1>You are invited to Magpie</h1>
<div id="ok" hidden>
<p>Magpie is a private archive for links and media. Tap the button on the phone where Magpie is installed to add this account.</p>
<a id="open" class="button" href="#">Open in Magpie</a>
<div class="card"><span class="label">Server</span><span id="server"></span><span class="label">Username</span><span id="user"></span></div>
<p>Don't have Magpie yet? Install the app first, then come back to this page and tap Open in Magpie.</p>
<a class="button secondary" href="https://github.com/sandoramix/slop-magpie/releases/latest">Get the Android app</a>
<details><summary>Enter the details by hand</summary><div class="card"><span class="label">Access token</span><span id="tok"></span><button id="copy" class="secondary" type="button">Copy token</button></div></details>
<p>Once you are in, choose a password in Settings. The access token stops working after that.</p>
</div>
<p id="bad" hidden>This invite link is incomplete. Ask for a new one.</p>
</main>`;

const sri = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

export const INVITE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Magpie invite</title><style>${STYLE}</style></head><body>${BODY}<script>${SCRIPT}</script></body></html>`;

const CSP = [
  "default-src 'none'",
  `style-src ${sri(STYLE)}`,
  `script-src ${sri(SCRIPT)}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const inviteRoutes = () =>
  new Hono().get("/", (c) => {
    c.header("Content-Security-Policy", CSP);
    c.header("Cache-Control", "no-store");
    return c.html(INVITE_PAGE);
  });
