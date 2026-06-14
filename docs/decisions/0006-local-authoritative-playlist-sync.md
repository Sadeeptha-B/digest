# 0006 — Digest owns the playlist; YouTube is a source

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

When syncing an imported playlist, there are two models: **mirror** YouTube as the source of
truth, or treat the **local copy as authoritative** and pull from YouTube only as a source. The
app already centres on local editing (reorder, remove, the upstream-less `Saved videos` list), and
the `youtube.readonly` scope means edits can never be written back upstream — so a true two-way
mirror is impossible by construction.

## Decision

**Once imported, the local copy is authoritative.** The user's ordering and removals are sacred;
YouTube is only ever a *source* to pull from. `syncPlaylist`
([`src/lib/playlistSync.ts`](../../src/lib/playlistSync.ts)) reconciles via `mergePlaylistContents`
([`src/store/useStore.ts`](../../src/store/useStore.ts)) and is **additive and edit-preserving**:

- Videos still upstream are kept in the **user's** order; new upstream videos are appended.
- A locally removed video is **tombstoned** (`removedVideoIds`) so sync won't resurrect it.
- A locally restored video is **pinned** (`restoredVideoIds`) so it survives future syncs even
  after it's gone upstream; the pin drops once sync sees it upstream again. Remove and restore are
  mutually exclusive.

## Consequences

- Ownership is irrelevant: a public playlist you don't own is treated identically to your own — a
  snapshot you curate, not a live mirror.
- Restore is **local-first and instant** (uses cached metadata), with a best-effort background
  metadata refresh; it never depends on the network.
- Re-importing a playlist clears tombstones — a deliberate fresh start.
- Full behavior documented in [`architecture.md`](../architecture.md) §3.1.
