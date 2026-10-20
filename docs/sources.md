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
  login?(ctx, cookiesFile): Promise<void>; // optional automatic login, see Cookies below
  // cookies are resolved by the worker: SESSIONS_DIR/<id>.txt, else COOKIES_DIR/<id>.txt
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
| `instagram` | yt-dlp (reels) → gallery-dl (posts/carousels) | needs cookies; id = shortcode |
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

A `SourceFetcher` may define `login(ctx, cookiesFile)`, which logs in with credentials from the worker env and writes Netscape cookies. Today only `instagram` has one (gallery-dl logs in with `INSTAGRAM_USERNAME` / `INSTAGRAM_PASSWORD`; yt-dlp cannot log in to Instagram, so the exported cookies serve both tools). Sessions are stored in the writable `SESSIONS_DIR/<source-id>.txt` and win over the manual `COOKIES_DIR` file.

The worker logs in when no session exists, and again (once per job) when the fetch chain fails with a login/checkpoint/cookies error. At most one login attempt per source every 15 minutes, because repeated logins get accounts flagged. Accounts with 2FA or a checkpoint challenge cannot use this; keep the manual cookie file for them.

## Adding a source — checklist

1. `packages/shared/src/sources/<id>.ts` — `SourceDef` + unit tests for `match`/`normalize`/`extractId` with real URL samples.
2. Add to `packages/shared/src/sources/index.ts`.
3. `apps/worker/src/sources/<id>.ts` — strategy order + options.
4. Add to `apps/worker/src/sources/index.ts`.
5. Optional: cookies file, icon in the app.
6. Update the table above.

No DB migration needed: `items.source` is text validated against the registry, not a Postgres enum.
