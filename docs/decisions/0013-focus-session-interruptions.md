# 0013 — A focus session that stops early is logged as interrupted

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The Pomodoro engine ([`usePomodoro`](../../src/hooks/usePomodoro.ts)) appends events to a per-video
log, and the Stats tab replays that log ([`summarizeSession`](../../src/lib/sessionStats.ts)). A
session only logged its end when the video finished (`offramp`, `done`). When the user turned focus
mode off, moved to another video or left the watch page, the log stopped at an open `work-start`. The
Stats tab then counted that stretch as live forever, so an hour later it showed an hour of focus that
never happened. A reload or crash leaves the same open stretch, and so do logs written before this
change.

There were three ways to close the stretch:

- Log the stop as a `work-complete`. That would inflate the completed-block count and total focus.
- Hook `pagehide` as well, so a reload logs the stop too. `pagehide` doesn't fire on a crash or a
  killed mobile tab, and after a back/forward-cache restore the log would hold an end for a session
  that carried on.
- Log an explicit `interrupted` event when the engine knows the session stopped, and treat whatever
  is still open when the next session starts as abandoned.

## Decision

The third option:

- The engine logs **`interrupted`** whenever a running session stops before its end: focus mode turned
  off, the video changed, or the watch page unmounted. If a work stretch was open, the event carries
  its focus time so far (`stretchSec`, holds excluded). The event goes to the log of the video the
  session belonged to.
- The Stats tab lists an interrupted stretch as **"Stopped early"**. It counts toward the longest
  stretch, but not toward completed blocks or total focus, the same as a pause-reset.
- An `onramp-start` while a stretch is still open means the earlier session never logged its end.
  That stretch is **dropped**. Its end is unknown, and no duration is invented for it.

## Consequences

- Leaving a video mid-block no longer leaves a counter running. Legacy logs repair themselves the next
  time that video starts a session.
- After a reload or crash, the abandoned stretch's focus time is lost from the list. It was never in
  the totals.
- Until that video's next session starts, its Stats tab still shows the abandoned stretch as in
  progress. With focus mode on, a session starts as soon as the player reports its duration.
- Tests drive the real hook and replay its log through `summarizeSession`
  (`tests/domain/pomodoro.test.ts`), so the engine and the Stats tab can't drift apart.
