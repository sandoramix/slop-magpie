# Changelog

All notable changes to Magpie are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

This file is shown in the app ("What's new") and used as the GitHub release notes, so entries are written for users, not as commit messages. See [docs/releases.md](docs/releases.md).

## [Unreleased]
### Added

- **Sort** is now the first tab. "Start sorting" walks through your unsorted saves one at a time: the suggested tags and folders are already selected, tap to drop or add more, then say what the item is for (To try, Keep or Done) and move on.
- "Retry all failed" in the Failed list downloads every failed save again, and "Refresh suggestions" works out new suggestions for your whole library.
- Admins can replace the Instagram session or cookies from the app (Settings → Instagram login) and see whether the server's Instagram session still works, without logging in to the server.

### Changed

- Statuses are renamed so they make sense: Inbox is now **To sort**, Reference is **Keep**, and each status has a one-line explanation. Failed and removed lists explain what they mean.
- Suggestions are recomputed every night for items you have not organized yet.
- Suggestions are smarter: a hashtag or word that matches the name of one of your tags or folders is suggested right away, and posts by an author you have already filed are suggested into the same places.

## [1.5.0] - 2026-10-24
### Fixed

- Instagram saves no longer fail while the server's Instagram session is down: the post is kept with its caption, author and preview image, and the full media is fetched automatically once the session is back.

### Changed

- The server now checks its Instagram session every few hours, renews it when it can, and fetches again what was saved while it was down.
- The download tools (yt-dlp, gallery-dl, instaloader) update themselves daily, so site changes are picked up without a new release.

## [1.4.4] - 2026-10-20
### Changed

- `INSTAGRAM_PASSWORD` is now optional. Without it the server never signs in to Instagram itself and only reuses a session file you imported, which avoids Instagram's login checkpoint.


## [1.4.3] - 2026-10-20
### Fixed

- Instagram posts, carousels and reels are now downloaded with a logged-in session that the server keeps and reuses. It signs in only when the session has died, so you no longer upload a cookie file every day.

### Upgrade notes

- Set `INSTAGRAM_USERNAME` and `INSTAGRAM_PASSWORD` on the worker (a dedicated account without 2FA) and redeploy. The first sign-in may ask you to confirm "it was me" in the Instagram app.

## [1.4.2] - 2026-10-20
### Fixed

- Instagram's automatic sign-in now works through Instagram's own web login. The previous method no longer exists, so it never signed in.

## [1.4.1] - 2026-10-20
### Fixed

- Instagram saves that failed with a login-page error now trigger the automatic sign-in and a retry, instead of failing for good.

## [1.4.0] - 2026-10-20
### Added

- Instagram saves no longer need a cookie file uploaded by hand. The server can sign in to a spare Instagram account itself and renews the session when it expires.

### Upgrade notes

- Optional: set `INSTAGRAM_USERNAME` and `INSTAGRAM_PASSWORD` on the worker (a spare account without 2FA). Without them nothing changes and `instagram.txt` keeps working.

## [1.3.0] - 2026-10-17
### Added

- Tap a photo (or start pinching it) to open it full screen. There you can pinch or double-tap to zoom, drag to look around, and swipe to the next photo or video.

## [1.2.0] - 2026-10-17
### Added

- Each account now has a storage limit (50 GB by default). Settings shows how much you use; the admin can see everyone's usage and change or remove a limit under Accounts → Storage limit. At the limit, saving new links is refused and downloads that would not fit fail with a clear message.

### Changed

- When a new version is available, the app now asks once per launch whether to update, instead of only showing a banner.

## [1.1.0] - 2026-10-17
### Added

- Posts with several photos or videos now open as a swipeable slideshow with a counter and page dots, like Instagram.

## [1.0.7] - 2026-10-17
### Changed

- The cookies folder on the server now defaults to `/opt/magpie/secrets/cookies`.

### Upgrade notes

- Put `instagram.txt` in `/opt/magpie/secrets/cookies/` (or set `COOKIES_HOST_DIR`).

## [1.0.6] - 2026-10-17
### Fixed

- Saved media is now stored in `/opt/magpie/media` on the server by default, for the same reason as the cookies folder.

### Upgrade notes

- Existing media stays in the old folder. Before redeploying, copy it over (for Coolify: `sudo cp -a /data/coolify/applications/<uuid>/magpie/media/. /opt/magpie/media/`), or set `MEDIA_DIR` to the old path.

## [1.0.5] - 2026-10-16
### Fixed

- Instagram cookies are now read from `/opt/magpie/cookies` on the server (Coolify moved the old `~/magpie/cookies` default into its own folder, so the worker never saw your `instagram.txt`).

### Upgrade notes

- Put `instagram.txt` in `/opt/magpie/cookies/` on the server, or set `COOKIES_HOST_DIR` to where it is.

## [1.0.4] - 2026-10-16
### Changed

- Server logs are now one readable line per event (set `LOG_FORMAT=json` for the old format), with the reason each download method failed.
- Server-only releases no longer build a new app; the app only updates when it actually changed.

### Fixed

- Instagram posts that cannot be downloaded fail with a clear error again, instead of showing up as an empty item.

## [1.0.3] - 2026-10-16
### Changed

- A failed save now shows the error from every download method that was tried, not just the first.
- Instagram posts that cannot be downloaded now still save their preview image and caption instead of failing.

## [1.0.2] - 2026-10-16
### Changed

- Deleting an account now takes a warning and then typing the username (one confirmation fewer).
- The invite message and the page it opens are reworded: clearer steps, and what to do if you do not have the app yet.
- A new release only becomes the one the app offers once its APK is attached, so the app never offers an update that cannot be installed yet.


## [1.0.1] - 2026-10-16
### Changed

- Releases build faster behind the scenes: the Android build caches now carry over from one release to the next.

## [1.0.0] - 2026-10-16
### Added

- Two entries in Android's share sheet: **Magpie** (open the item and organize it now) and **Magpie: save for later** (saves the link to your Inbox and takes you straight back to the app you came from). Settings > Sharing chooses what plain "Magpie" does: organize now, or ask each time.
- Invite links are now ordinary `https://` links, so WhatsApp and other chats make them tappable. The page they open has an "Open in Magpie" button and a link to get the app.
- Admins can share an invite again for an account that has not signed in yet ("Invite" on the Users screen). It issues a fresh token, so the earlier invite stops working.
- Admins can delete an account from Users: two confirmations and typing the username. The person is told their account was deleted the next time they open the app, and it is removed from their phone.
- App updates show a progress bar with the size, can be cancelled, and the same progress shows on the Library and Settings screens.
- Magpie is now open source under the MIT license.

### Changed

- Every dialog can be closed with the back button or by tapping outside it, and menus with more than three actions open in a sheet with a close button. This also brings back the admin menu entries (such as delete) that Android was hiding.
- An update is only offered once the release's APK is attached, instead of sending you to the GitHub page.

### Upgrade notes

- The server migrates the database on start (one new `deleted_tokens` table). Older app builds keep working. Update the server first: invite links and the "account deleted" notice need the new server, and the new app's Users screen shows "Invite" only once the server reports which accounts are still pending.

## [0.3.0] - 2026-10-16
### Added

- An "Add link" button (+) at the top of every tab. Paste or type one link or many (one per line, or a whole block of text), optionally pick folders and tags and add notes, and see for each link whether it was saved, was already in your library, or why it failed. It starts from the link on your clipboard.
- When an admin creates an account (or resets one), the app builds an invite with the server address, the username and the access token: share it, copy it, or edit the server address first. Opening the invite link on the new phone adds the account after one confirmation, and "Paste invite" does the same from the welcome screen.

### Changed

- The "+ Paste link" chip on the Library screen is replaced by the Add link button.

## [0.2.0] - 2026-10-16
### Added

- Accounts: the admin can create accounts from the app (Settings, Manage users), each with its own private library of items, folders, tags, fields and smart folders. The admin can also open any account's library to help out; those changes are logged.
- Sign in with your generated access token the first time, then choose a password; after that the token stops working and you sign in with your username and password on any device. If you forget it, the admin resets your account and gives you a new token.
- Accounts get a role, user or admin, when they are created; admins can manage accounts and open other libraries, and can promote or demote others later. The built-in admin keeps using the server's admin token, alone or together with a password.
- You can change the name that is shown for you (your username stays the same).
- Several servers or accounts can be saved on the phone, with a switcher in the Library header and a first-launch screen to connect.
- Existing items stay with the admin account, so nothing is lost when upgrading.

### Upgrade notes

- The server migrates the database on start (new `users` and `sessions` tables, `user_id` on existing tables). Older app versions keep working: their token is the admin token.

### Changed

- Updates download inside the app (with progress) and open Android's installer, instead of sending you to the GitHub page. The first time, Android asks you to allow Magpie to install apps.
- A tag created from an item's tag picker is added to that item immediately.

### Fixed

- Screens and pickers no longer extend under the Android system navigation buttons.

## [0.1.3] - 2026-10-16
### Changed

- The Android APK works on all devices again (64-bit and 32-bit ARM, x86); the arm64-only build from 0.1.1 is reverted.

## [0.1.2] - 2026-10-16
### Fixed

- The server now redeploys automatically after each release (the deploy trigger was rejected by Coolify).

## [0.1.1] - 2026-10-16
### Changed

- The Android APK now targets 64-bit ARM phones only, which makes the download smaller. Releases appear on GitHub right away and the APK is attached a few minutes later.

## [0.1.0] - 2026-10-16
### Added

- Save any public link; saving the same post again (even through a different link) finds the existing item instead of making a copy.
- Organize items with nested folders (an item can be in several), tags, keywords, notes, favorites, ratings, a status (inbox, to try, done, reference) and your own custom fields.
- Search with free text, typo tolerance and filters such as `tag:`, `folder:`, `is:fav`, `from:@author`, `source:`, `kind:`, `saved:>2026-01-01` and `field:minutes<20`.
- Smart folders that save a search.
- Saved links are archived in the background: video, images and carousels (Instagram first, any other site through a generic fetcher), with a thumbnail, caption, author and keywords. Pages without media are kept as bookmarks with a preview image.
- Folder and tag suggestions learned from how you file items; confident ones are applied automatically, the rest wait for you to accept or dismiss.
- Items whose original post was removed are detected by a weekly check.
- Android app: share any link to Magpie from another app to save it, or paste one from the clipboard.
- Browse your library as a grid of thumbnails with search, favorites and type filters; pull to refresh, long-press to select several items and favorite, file, tag, refetch or delete them together.
- Open an item to watch the video or flip through the images, edit its title, notes, rating, status and custom fields, and file it into folders and tags.
- Inbox tab for new items, suggestions waiting for you, failed downloads and removed posts, with one-tap accept or retry.
- Folders, smart folders and tags tab with counts; create and delete them from the app.
- The app checks GitHub for a newer release and offers the APK download in Settings and on the library screen.
- Light, dark or system theme, 1 to 3 grid columns, and a What's new screen that opens after each update.
