# Sources

Magpie is not tied to any platform. A **source** is a plugin that knows how to recognize, normalize and fetch URLs from one site. Unknown sites still work through a **generic** fallback.

## Source registry

Each source has two halves:

**Shared half** — `packages/shared/src/sources/<id>.ts`. Pure, no I/O, used by api, worker and app:

```ts
export interface SourceDef {
  id: string;                         // 'instagram', 'tiktok', 'youtube', ... stable, stored in items.source
  label: string;                      // 'Instagram'
  hosts: string[];                    // ['instagram.com', 'www.instagram.com', 'instagr.am']
  match(url: URL): boolean;           // host + path check (e.g. /reel/, /p/)
  normalize(url: URL): string;        // canonical URL: strip tracking params, fixed host, no trailing slash
  extractId?(url: URL): string | null;// platform ID / shortcode, used for dedupe across URL variants
}
```

**Worker half** — `apps/worker/src/sources/<id>.ts`. Declares *how* to fetch:

```ts
export interface SourceFetcher {
  id: string;                         // same id as SourceDef
  strategies: StrategyId[];           // tried in order, e.g. ['yt-dlp', 'gallery-dl']
  options?: Partial<StrategyOptions>; // per-source tweaks (format selection, headers, ...)
  // cookies are resolved by the worker: COOKIES_DIR/<id>.txt if present
}
```

Registration is a static list (`packages/shared/src/sources/index.ts`, `apps/worker/src/sources/index.ts`) — adding a site means adding one file to each and one line to each index. The `sources` registry is also exposed via `GET /sources` so the app can show icons/labels and filters.

URL resolution: first source whose `match()` returns true wins; otherwise `generic`.

## Fetch strategies

Strategies are reusable engines in `apps/worker/src/strategies/`. All return the same normalized result:

```ts
interface FetchResult {
  kind: 'video' | 'image' | 'gallery' | 'link';
  sourceItemId?: string;
  author?: { handle?: string; name?: string; url?: string };
  title?: string;
  caption?: string;
  postedAt?: Date;
  files: { path: string; type: 'video' | 'image'; mime: string }[];
  rawMeta: unknown;                   // trimmed tool output, stored in items.raw_meta
}
```

| Strategy | Engine | Good for |
|---|---|---|
| `instaloader` | `instaloader -- -<shortcode>` into a temp dir | Instagram posts, carousels and reels, with its own logged-in session (see [Automatic login](#automatic-login)) |
| `yt-dlp` | `yt-dlp -J` + download | videos on 1800+ sites (Instagram reels, TikTok, YouTube/Shorts, X, Reddit, Facebook, Vimeo, Pinterest video pins, ...) |
| `gallery-dl` | `gallery-dl -j` + download | image posts/galleries/carousels (Instagram posts, Pinterest, Reddit galleries, Tumblr, X images, DeviantArt, ...) |
| `opengraph` | HTTP GET + parse `og:*` / `twitter:*` / oEmbed / JSON-LD | any web page: title, description, preview image, sometimes `og:video` |
| `direct` | HTTP GET of the URL itself | direct links to `.mp4`, `.jpg`, `.png`, `.webp`, `.gif` |

Strategy chain semantics:
- Try strategies in order; first one that yields **at least one media file** wins.
- If none yields media, the best metadata result is kept and the item becomes `kind = link` (a bookmark with preview image). Still archived, still categorizable.
- Each attempt is logged with strategy id and error, stored in `raw_meta.attempts`.

## Generic source

Used when no specific source matches:

```
direct (if URL looks like a media file) → yt-dlp (generic extractor) → gallery-dl → opengraph
```

This means most sites work out of the box; a dedicated source is only needed for better normalization/dedupe, cookies, or a different strategy order.

## Built-in sources (planned)

| id | Strategies | Notes |
|---|---|---|
| `instagram` | instaloader → yt-dlp (reels) → gallery-dl (posts/carousels) | needs a login (instaloader session) or cookies; id = shortcode |
| `tiktok` | yt-dlp → gallery-dl | photo-mode posts via gallery-dl |
| `youtube` | yt-dlp | Shorts + videos; cap resolution |
| `pinterest` | gallery-dl → yt-dlp | resolve `pin.it` short links |
| `x` | gallery-dl → yt-dlp | `twitter.com` + `x.com` |
| `reddit` | gallery-dl → yt-dlp | |
| `facebook` | yt-dlp | reels/videos; often needs cookies |
| `generic` | direct → yt-dlp → gallery-dl → opengraph | fallback |

Start with `instagram` + `generic`; add others as needed.

## Short links and redirects

Short links (`pin.it`, `vm.tiktok.com`, `youtu.be`, `t.co`, ...) are expanded by the worker (HEAD/GET following redirects, max 5 hops, SSRF-checked at each hop) before matching. The API stores the original URL immediately; `canonical_url` is finalized after expansion. Dedupe runs again after expansion and merges into the existing item if one matches.

## Cookies

Per-source cookie files in Netscape format at `COOKIES_DIR/<source-id>.txt` (read-only mount). Missing file = anonymous. Use secondary accounts. Never logged.

### Automatic login

Instagram needs a logged-in account. With `INSTAGRAM_USERNAME` / `INSTAGRAM_PASSWORD` set (one dedicated account owned by the server admin; users never provide credentials or cookies), the `instaloader` strategy keeps a session file in the writable `SESSIONS_DIR/instagram.session` and reuses it for every fetch. It logs in only when there is no session or the saved one has died, passes the password on stdin (not argv), and the worker allows one password use per 15 minutes, because repeated logins get accounts flagged. Neither yt-dlp nor gallery-dl can log in to Instagram, so they only see the manual cookie file.

If the first login hits a checkpoint, confirm "it was me" in the Instagram app, then wait out the 15 minutes (or restart the worker) and save a link again. The account must not use 2FA. Without credentials, `instaloader` fails fast and the chain falls back to yt-dlp / gallery-dl with `instagram.txt`. Deleting the session file forces a fresh login.

### Staying alive without babysitting

Instagram kills sessions and flags logins on purpose, so nothing here is "fixed once"; the worker instead notices and heals:

- **`session-check`** (every 6 h) runs a metadata-only instaloader request for the newest archived post. That keeps the session in use, renews a dead one through the rate-limited password login (if `INSTAGRAM_PASSWORD` is set), and records `ok`/`dead` in `SESSIONS_DIR/instagram.state`. `session.dead` and `session.recovered` go to the audit log; a dead session is also logged at `error`.
- **Last-resort strategy `opengraph`** with a link-preview crawler User-Agent (`pageUserAgent`). Instagram serves caption, author and a preview image to crawlers without a login, so a save during an outage becomes a `link` item with a preview instead of a failure. Private or deleted posts return no tags and still fail.
- **Re-fetch on every good check.** After each successful check, items from the last 30 days that failed or were kept as an OpenGraph-only `link` are fetched again (up to 100 per check, at most 8 attempts per item so private or removed posts stop looping). Because it does not depend on seeing the session die, saves that failed between two checks are picked up too. You can also select items in the app and refetch them in bulk by hand.
- **`tool-update`** (daily and once at start) installs the newest yt-dlp, gallery-dl and instaloader into `SESSIONS_DIR/pytools`, which shadows the versions baked into the image. The new set must start (`--version`) or it is rolled back. Extractor breakage from site changes is therefore fixed within a day without a rebuild.

#### When the session dies

If `INSTAGRAM_PASSWORD` is unset, or Instagram answers the login with a checkpoint, `session.dead` stays until you import a session: log in to the account in Firefox on a PC, run `instaloader --load-cookies firefox --sessionfile instagram.session`, and copy the file into the sessions dir. The next `session-check` (or restart) sees it and re-fetches what was saved meanwhile. A session created from a real browser lasts far longer than one created by the server's own login.