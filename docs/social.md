# Social layer

Magpie grows from private archives into a shared place: people publish what they save, others save it for themselves, like it, follow the author, and say whether it worked. Decisions: D31–D33 in [decisions.md](decisions.md). Status per phase is in [roadmap.md](roadmap.md#social-layer).

## Model

There is no separate "post" table. An `items` row stays one entry in one person's library and is always created by importing a URL (D23). Sharing adds:

- `items.visibility` — `private` (default) or `public`. Public items are readable by every signed-in account. Only the owner can change it.
- `item_saves` — `(id, user_id, item_id → items ON DELETE CASCADE, note, saved_at)`. A **save** is a bookmark on someone else's public item. It is not an item: the saver owns no copy, no media and cannot edit the content. Unique `(user_id, item_id)`; owners cannot save their own items.
- `save_folders`, `save_tags` — links from a save to the saver's own folders and tags, so saved posts can be filed alongside the saver's own items. Folder and tag views, search and smart folders list both kinds of entry.

Importing is separate from saving: pasting or sharing a URL always creates a normal private item and downloads its own media, even when the URL matches someone's public item. Two accounts importing the same URL have two independent items.

### Ownership and deletion

The owner of an item controls its existence (D32).

- Owner deletes a public item → its saves, likes and feedback are removed by the FK cascade. Before the delete, everyone who saved or liked it gets a `post_removed` notification (title + owner handle only; no media remains).
- Owner switches a public item back to private → same cascade and a `post_unshared` notification. The app warns first with the number of savers.
- Saver deletes a save → only that bookmark (and its folder/tag links) goes; the item is untouched.
- Deleting an account deletes its items and therefore the saves of them in other libraries, with notifications.

### Storage accounting

A save adds no media, so it counts 0 bytes toward the saver's limit (D27).
## Other tables (added in phase 2+)

| Table | Purpose |
|---|---|
| `follows` | `(follower_id, followee_id)` — the feed is public items of followed accounts |
| `item_likes` | `(user_id, item_id)` — like count on the item |
| `notifications` | `user_id`, `type`, `payload` (jsonb, zod validated), `read_at` |
| `reports`, `blocks` | safety: a report on an item or account, a block between two accounts |
| `invites` | single-use codes when `REGISTRATION_MODE=invite` |
| `item_feedback` | `(user_id, item_id, verdict, reason chips, tried_at)` — see below |

Profiles: `users.handle` (the username), `display_name`, `bio`, `avatar_key` (a BlobStore key).

## Registration

`REGISTRATION_MODE` (`invite` | `open`, default `invite`) in the API env. In `invite` mode `POST /auth/signup` needs an invite code (admins issue them first, later any account within a quota). In `open` mode it needs none. Both modes are rate limited per IP; reports, blocks and an admin moderation queue exist before `open` is documented as supported.

## Feedback ("how did it go?")

One tap, never a free-text form.

- Verdict: `worked` | `meh` | `failed`, optional reason chips from a fixed list.
- Prompted once per save, a few days after saving a post from someone else (on the home feed), and anytime through an **I tried it** button on the item. Dismissing "not yet" snoozes it; the prompt never repeats after an answer. The verdict can always be changed.
- The item shows an aggregate ("worked for 82% of 31"). Its owner also sees the reason-chip breakdown.

### Dashboard

A "Me" area with two parts:

- **Progress**: items imported, share of items filed (folder or tag), saves from others, feedback given, helpful score of own posts, weeks active in a row.
- **Feedback**: tab *Given by me* (my verdicts) and tab *Received on my posts* (others' verdicts). Filters (verdict, folder, source, one item) live in URL params, so an item deep-links in.

Every item detail shows the feedback card (my verdict, aggregate, tried-it button) and a **See in dashboard** button to `/me/feedback?item=<id>`.

## API

Everything social is `/api/v2` (D24: new required behaviour for lists, new response shapes). `/api/v1` keeps serving the owner's private library unchanged; the new columns have defaults, so migrations are additive.

## Phases

1. Docs, `visibility` column, shared enums.
2. Publish, save (`item_saves`), delete cascade, follow, like, feed, explore, notifications.
3. Safety: `REGISTRATION_MODE`, invites, signup, rate limits, reports, blocks, moderation.
4. Feedback and the dashboard.
5. Smarter organization (auto-file with undo, keyword merge, similar posts, ranking).
