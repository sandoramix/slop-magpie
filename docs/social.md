# Social layer

Magpie grows from private archives into a shared place: people publish what they save, others save it for themselves, like it, follow the author, and say whether it worked. Decisions: D31–D33 in [decisions.md](decisions.md). Status per phase is in [roadmap.md](roadmap.md#social-layer).

## Model

There is no separate "post" table. An `items` row stays one entry in one person's library (D23). Two columns add sharing:

- `items.visibility` — `private` (default) or `public`. Public items are readable by every signed-in account.
- `items.origin_item_id` — nullable FK to `items.id`, `ON DELETE CASCADE`. Set on a **save**: the copy of someone else's public item that lives in another library.

A save is a normal item for its saver: own folders, tags, notes, rating, workflow, favorite, custom fields, keywords, suggestions. At save time the text metadata is copied (`source`, `canonical_url`, `kind`, author, caption, title, `posted_at`), so search, categorize and the query language work unchanged. **Media is not copied**: a save has no `media` rows; reads resolve media through the origin (`content id = origin_item_id ?? id`). The worker never fetches a save.

### Ownership and deletion

The owner of the origin item controls its existence.

- Owner deletes the item → the cascade removes every save of it, plus its likes and feedback. Media exists once, under the origin, and is deleted with it.
- Before the delete, everyone who saved or liked it gets a `post_removed` notification (title + owner handle only; no media remains).
- Owner switches a public item back to private → same cascade and a `post_unshared` notification. The app warns first with the number of savers.
- Saver deletes a save → only that row goes; the origin and its media are untouched.
- Deleting an account deletes its items and therefore its saves in other libraries, with notifications.

Same URL imported separately by two people are two independent origin items with their own media (private content never dedupes across accounts, so one person's delete cannot reach into another's private library). Pasting a URL that matches someone's **public** item answers "already on Magpie" and offers a save instead of a download.

### Storage accounting

A save has no media rows, so it counts 0 bytes toward the saver's limit (D27).

## Other tables (added in phase 2+)

| Table | Purpose |
|---|---|
| `follows` | `(follower_id, followee_id)` — the feed is public items of followed accounts |
| `item_likes` | `(user_id, item_id)` — like count on the origin; liking a save likes its origin |
| `notifications` | `user_id`, `type`, `payload` (jsonb, zod validated), `read_at` |
| `reports`, `blocks` | safety: a report on an item or account, a block between two accounts |
| `invites` | single-use codes when `REGISTRATION_MODE=invite` |
| `item_feedback` | `(user_id, origin item, verdict, reason chips, tried_at)` — see below |

Profiles: `users.handle` (the username), `display_name`, `bio`, `avatar_key` (a BlobStore key).

## Registration

`REGISTRATION_MODE` (`invite` | `open`, default `invite`) in the API env. In `invite` mode `POST /auth/signup` needs an invite code (admins issue them first, later any account within a quota). In `open` mode it needs none. Both modes are rate limited per IP; reports, blocks and an admin moderation queue exist before `open` is documented as supported.

## Feedback ("how did it go?")

One tap, never a free-text form.

- Verdict: `worked` | `meh` | `failed`, optional reason chips from a fixed list.
- Prompted once per save, a few days after saving a post from someone else (on the home feed), and anytime through an **I tried it** button on the item. Dismissing "not yet" snoozes it; the prompt never repeats after an answer. The verdict can always be changed.
- The origin shows an aggregate ("worked for 82% of 31"). Its owner also sees the reason-chip breakdown.

### Dashboard

A "Me" area with two parts:

- **Progress**: items imported, share of items filed (folder or tag), saves from others, feedback given, helpful score of own posts, weeks active in a row.
- **Feedback**: tab *Given by me* (my verdicts) and tab *Received on my posts* (others' verdicts). Filters (verdict, folder, source, one item) live in URL params, so an item deep-links in.

Every item detail shows the feedback card (my verdict, aggregate, tried-it button) and a **See in dashboard** button to `/me/feedback?item=<id>`.

## API

Everything social is `/api/v2` (D24: new required behaviour for lists, new response shapes). `/api/v1` keeps serving the owner's private library unchanged; the new columns have defaults, so migrations are additive.

## Phases

1. Docs, `visibility` + `origin_item_id` schema, shared enums.
2. Save/publish/delete cascade, follow, like, feed, explore, notifications.
3. Safety: `REGISTRATION_MODE`, invites, signup, rate limits, reports, blocks, moderation.
4. Feedback and the dashboard.
5. Smarter organization (auto-file with undo, keyword merge, similar posts, ranking).
