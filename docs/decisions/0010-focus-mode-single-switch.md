# 0010 — Focus mode is one switch over all focus scaffolding

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

The watch page carries focus scaffolding beyond the player: the Pomodoro timeline (for long
videos) and the [`FocusPanel`](../../src/components/focus/FocusPanel.tsx) row of low-stimulation
ADHD widgets (breathing pacer, ambient blob, brain-dump pad). Until now these were always
rendered — the widgets unconditionally, the Pomodoro gated only on video duration. Some users
want a bare player; others want the full scaffolding. The question was how granular the control
should be: a single master switch, a widgets-only switch, or independent per-widget toggles.

## Decision

A single user preference, `settings.focusMode` (default **on**), gates **all** of it: the
Pomodoro timeline (`focusMode && pomodoroEnabled`) and the entire `FocusPanel`. The control is a
non-intrusive `Focus on/off` toggle in the watch-page header, kept as the single canonical
surface (not mirrored into Settings, to avoid drift). Default-on because focus tooling is
Digest's reason for existing; opting out yields a bare player.

## Consequences

- One toggle = one mental model ("scaffolding or bare player"), with no confusing matrix of
  independent states. The preference persists via the store (schema v9 backfills `focusMode:
  true` for existing users).
- The Pomodoro is now gated by *both* duration and intent, so a focus-mode-off user never sees it
  even on long videos.
- The cost is coarseness: a user who wants, say, only the brain-dump pad can't keep it while
  hiding the rest. If that demand appears, split `focusMode` into per-widget preferences in a new
  record rather than editing this one.
