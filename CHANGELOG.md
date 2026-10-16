# Changelog

All notable changes to Magpie are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

This file is shown in the app ("What's new") and used as the GitHub release notes, so entries are written for users, not as commit messages. See [docs/releases.md](docs/releases.md).

## [Unreleased]

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
