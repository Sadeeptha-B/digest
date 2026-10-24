# 0011 — User-made lists; a video may belong to many lists

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Every list was a YouTube import, plus one hard-coded **Saved videos** list where every pasted
single-video URL landed. Users couldn't create, name, or choose a list. Adding that raised three
questions: should a video belong to only one list, may videos be saved into *imported* playlists,
and what becomes of Saved videos.

## Decision

- **User-made lists are `Playlist`s with `ytPlaylistId: null`** — no new fields. The code that
  syncs, records removals, and shows "Show removed" already runs only when `ytPlaylistId` is set,
  so a user list is simply never synced.
- **A video may belong to any number of lists.** Lists hold video ids that point into the shared
  `videos` cache. Progress, Pomodoro sessions, and transcripts stay keyed per video, so watching a
  video in one list shows it watched in all of them. A list holds each video **at most once**,
  because video ids are the keys for the sortable rows and for queue lookups (`getNextVideoId`).
- **Only user-made lists accept saved videos.** Imported playlists stay copies of YouTube that the
  user curates ([0006](./0006-local-authoritative-playlist-sync.md)). Saving into them would need
  sync to pin local additions, which blurs the "YouTube is a source" model for little gain.
- **"Saved videos" becomes the Inbox**, the default list for pasted videos. It's an ordinary user
  list (renamable, deletable, recreated on the next save) that keeps the reserved id
  `'saved-videos'` so existing libraries carry over. The store's v10 migration renames it only if
  the title is still the old default.
- **Renaming is for user-made lists only**, since sync overwrites an imported playlist's title
  from YouTube.

## Consequences

- No schema change beyond a title migration. Deleting a list or removing a video only drops the
  reference, never the cached video or its progress.
- "Watched" is global by design. Someone who wants per-list progress would need progress keyed by
  list and video, recorded as a new decision.
- For now the only way to save a video is the Add bar ("Save to …" when the pasted URL is a single
  video). Watch-page or per-row "save to list" buttons can build on the same `addVideoToList`
  store action.
