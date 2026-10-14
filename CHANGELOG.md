# Changelog

All notable changes to Magpie are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

This file is shown in the app ("What's new") and used as the GitHub release notes, so entries are written for users, not as commit messages. See [docs/releases.md](docs/releases.md).

## [Unreleased]

### Added

- Save any public link; saving the same post again (even through a different link) finds the existing item instead of making a copy.
- Organize items with nested folders (an item can be in several), tags, keywords, notes, favorites, ratings, a status (inbox, to try, done, reference) and your own custom fields.
- Search with free text, typo tolerance and filters such as `tag:`, `folder:`, `is:fav`, `from:@author`, `source:`, `kind:`, `saved:>2026-01-01` and `field:minutes<20`.
- Smart folders that save a search.
- Saved links are archived in the background: video, images and carousels (Instagram first, any other site through a generic fetcher), with a thumbnail, caption, author and keywords. Pages without media are kept as bookmarks with a preview image.
- Folder and tag suggestions learned from how you file items; confident ones are applied automatically, the rest wait for you to accept or dismiss.
- Items whose original post was removed are detected by a weekly check.
