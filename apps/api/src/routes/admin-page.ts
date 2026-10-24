import { createHash } from "node:crypto";
import { Hono } from "hono";

// A tiny admin page for the Instagram login, so a PC can replace the session or cookies without SSH or the app.
// It has no server-side session at all: the admin token is typed in, held in a JS variable, sent as a bearer
// token to the existing admin-only API routes, and dropped on log out, after 10 idle minutes or when the tab is
// hidden for good. Nothing is stored (no cookie, no web storage), so there is nothing to forge across sites.
// Like the invite page it is static, uses textContent only and is locked down by a hash-based CSP.

const STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#0f0f14;--muted:#6b6b78;--border:#e4e4ea;--primary:#7c3aed;--bad:#c2261f}
@media(prefers-color-scheme:dark){:root{--bg:#0a0a0f;--fg:#f4f4f7;--muted:#9a9aa8;--border:#26262f;--primary:#a78bfa;--bad:#ff7b72}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:start center;padding:32px 16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{width:100%;max-width:520px;display:grid;gap:16px}
h1{margin:0;font-size:1.5rem}
h2{margin:0;font-size:1.05rem}
p{margin:0;color:var(--muted)}
.card{border:1px solid var(--border);border-radius:12px;padding:16px;display:grid;gap:10px}
.small{font-size:.85rem}
input[type=password],textarea{width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:transparent;color:var(--fg);font:inherit}
textarea{min-height:90px;font:13px/1.4 ui-monospace,monospace}
button{padding:12px 14px;border-radius:10px;border:1px solid var(--primary);background:var(--primary);color:#fff;font:600 1rem system-ui,sans-serif;cursor:pointer}
button.secondary{background:transparent;color:var(--primary)}
button.danger{background:transparent;color:var(--bad);border-color:var(--bad)}
button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row>*{flex:1}
#msg{min-height:1.4em;font-size:.9rem}
#msg.bad{color:var(--bad)}
[hidden]{display:none!important}
`;

const SCRIPT = `
const API = "/api/v1/sources/instagram/credentials";
const IDLE_MS = 10 * 60 * 1000;
const MAX_CHARS = 60000;
let token = null;
let idle = null;
const $ = (id) => document.getElementById(id);

function say(text, bad) {
  const el = $("msg");
  el.textContent = text;
  el.className = bad ? "bad" : "";
}
function show(name) {
  $("login").hidden = name !== "login";
  $("panel").hidden = name !== "panel";
}
function logout(text) {
  token = null;
  clearTimeout(idle);
  $("token").value = "";
  $("cookies").value = "";
  show("login");
  say(text || "", false);
}
function touch() {
  clearTimeout(idle);
  idle = setTimeout(() => logout("Logged out after 10 idle minutes."), IDLE_MS);
}
async function call(method, path, body) {
  touch();
  const res = await fetch(API + path, {
    method,
    headers: Object.assign({ Authorization: "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error((data && data.error && data.error.message) || "Request failed (" + res.status + ")");
    error.status = res.status;
    throw error;
  }
  return data;
}
const when = (iso) => new Date(iso).toLocaleString();
function render(s) {
  $("state").textContent = s.state ? (s.state.value === "ok" ? "Session works" : "Session expired") : "Session not checked yet";
  $("stateAt").textContent = s.state ? "Last checked " + when(s.state.checkedAt) + "." : "The server checks every 6 hours and after each upload.";
  $("sess").textContent = s.session ? "Uploaded " + when(s.session.updatedAt) + "." : "Nothing uploaded; the server uses its own login.";
  $("cook").textContent = s.cookies ? "Uploaded " + when(s.cookies.updatedAt) + "." : "Nothing uploaded.";
  $("rmCook").hidden = !s.cookies;
}
async function refresh() {
  if (token === null) return;
  try { render(await call("GET", "")); } catch (e) { say(e.message, true); }
}
async function login() {
  const typed = $("token").value.trim();
  if (typed === "") return;
  token = typed;
  $("token").value = "";
  say("Checking…", false);
  try {
    render(await call("GET", ""));
    show("panel");
    say("", false);
  } catch (e) {
    token = null;
    say(e.status === 401 ? "That token was not accepted." : e.status === 403 ? "That token does not belong to an admin." : e.status === 429 ? "Too many attempts. Try again later." : e.message, true);
  }
}
async function upload(kind, content) {
  if (content.length > MAX_CHARS) return say("That is too large to be the right file.", true);
  say("Uploading…", false);
  try {
    render(await call("PUT", "/" + kind, { content }));
    say("Uploaded. The server is checking the new login; the result appears in a few seconds.", false);
    setTimeout(refresh, 6000);
    setTimeout(refresh, 20000);
  } catch (e) {
    say(e.message, true);
  }
}
function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(binary);
}

$("go").addEventListener("click", login);
$("token").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
$("out").addEventListener("click", () => logout("Logged out."));
$("check").addEventListener("click", async () => {
  say("Checking…", false);
  try { render(await call("POST", "/check")); say("The server is checking now; the result appears in a few seconds.", false); setTimeout(refresh, 6000); } catch (e) { say(e.message, true); }
});
$("sessFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) upload("session", base64(await file.arrayBuffer()));
});
$("cookFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) upload("cookies", await file.text());
});
$("cookSend").addEventListener("click", () => {
  const text = $("cookies").value;
  $("cookies").value = "";
  if (text.trim() !== "") upload("cookies", text);
});
$("rmCook").addEventListener("click", async () => {
  try { render(await call("DELETE", "/cookies")); say("Removed.", false); } catch (e) { say(e.message, true); }
});
// a page restored from the back/forward cache must not come back logged in
window.addEventListener("pagehide", () => logout(""));
`;

const BODY = `<main>
<h1>Magpie · Instagram login</h1>
<p id="msg" role="status"></p>
<div id="login" class="card">
<h2>Admin token</h2>
<p class="small">The server's <code>API_TOKEN</code>. It is kept in this tab's memory only and forgotten when you log out, after 10 idle minutes, or when you leave the page.</p>
<input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Admin token">
<button id="go" type="button">Log in</button>
</div>
<div id="panel" hidden>
<div class="card">
<h2 id="state"></h2>
<p id="stateAt" class="small"></p>
<div class="row"><button id="check" class="secondary" type="button">Check now</button><button id="out" class="secondary" type="button">Log out</button></div>
</div>
<div class="card">
<h2>Session file</h2>
<p id="sess" class="small"></p>
<input id="sessFile" type="file">
<p class="small">Create it on a PC where you are logged in to the account in Firefox: <code>instaloader --load-cookies firefox --sessionfile instagram.session</code></p>
</div>
<div class="card">
<h2>Cookies</h2>
<p id="cook" class="small"></p>
<input id="cookFile" type="file" accept=".txt,text/plain">
<textarea id="cookies" spellcheck="false" placeholder="…or paste the contents of cookies.txt (Netscape format)"></textarea>
<div class="row"><button id="cookSend" type="button">Upload pasted cookies</button><button id="rmCook" class="danger" type="button" hidden>Remove uploaded cookies</button></div>
</div>
</div>
</main>`;

const sri = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

export const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Magpie admin</title><style>${STYLE}</style></head><body>${BODY}<script>${SCRIPT}</script></body></html>`;

const CSP = [
  "default-src 'none'",
  `style-src ${sri(STYLE)}`,
  `script-src ${sri(SCRIPT)}`,
  // the page only ever talks to this server's API
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const adminPageRoutes = () =>
  new Hono().get("/", (c) => {
    c.header("Content-Security-Policy", CSP);
    c.header("Cache-Control", "no-store");
    c.header("X-Frame-Options", "DENY");
    return c.html(ADMIN_PAGE);
  });
