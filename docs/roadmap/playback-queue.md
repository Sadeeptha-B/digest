# Playback queue — open gaps

Digest's promise is that YouTube's end screen never gets a chance to pull you elsewhere: when a
video ends, the queue marks it watched and advances immediately (see the `ENDED` handling in
[`Watch`](../../src/pages/Watch.tsx)). Two cases still slip past that promise. Both are known and
deliberately left open for now. Record an ADR when one is chosen.

## 1. The end of the queue

When the **last** video in a list ends, there is no next video to advance to, so the player stays
on it and YouTube shows its end screen (related videos, limited to the same channel by `rel=0`).

Options:

- **Stop and show a "Queue finished" state.** Pause or seek to 0 on `ENDED`, and overlay a simple card
  ("You've finished *List*", with links back to the library or the next unwatched list). This
  keeps the promise and costs little.
- **Return to the list view** after the last video, the way a playlist "closes".
- **Leave it.** The end screen is limited to the same channel and is one click from Back.

## 2. Unavailable videos stall auto-advance

A queue can contain videos that won't play: deleted or private ones (flagged `isUnavailable` at import or
restore), and ones whose owner disabled embedding. Today:

- `getNextVideoId` ([`useStore`](../../src/store/useStore.ts)) returns the next id regardless of
  availability, so the queue advances *into* a dead video.
- The player has no `onError` handler, so the dead video sits on YouTube's error card and never
  ends, and the queue stops there.

Options:

- **Skip on advance.** `getNextVideoId` skips videos flagged unavailable.
- **Skip on error.** Handle the player's `onError` (codes 100, 101 and 150: not found, or embedding
  disallowed) by flagging the video unavailable and advancing.
- **Both, with a visible note** ("Skipped 2 unavailable videos") so a skip is never silent.

Either change needs a regression test in `tests/domain/library.test.ts` (queue) or
`tests/components/watch.test.tsx` (player error). See
[ADR 0012](../decisions/0012-testing-strategy.md).
