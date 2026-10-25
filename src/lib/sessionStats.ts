import type { PomodoroEvent } from '../types'

export interface Stretch {
  durationSec: number
  kind: 'work-complete' | 'pause-reset' | 'interrupted'
  at: number
}

export interface OpenStretch {
  /** wall ms the in-progress block started */
  startedAt: number
  /** wall ms already spent held (paused), excluded from focus time */
  heldMs: number
  /** wall ms the current hold began, or null if actively running */
  heldSince: number | null
}

export interface SessionSummary {
  stretches: Stretch[]
  open: OpenStretch | null
  completedCount: number
  resets: number
  totalFocusSec: number
  /** live focus time of the in-progress stretch (frozen while held) */
  currentSec: number
  isHeld: boolean
  longestSec: number
  breaksTaken: number
  breaksSkipped: number
}

/** Replay a video's Pomodoro event log into finished stretches plus the still-open one. */
export function parseSession(events: PomodoroEvent[]) {
  const stretches: Stretch[] = []
  let open: OpenStretch | null = null
  for (const e of events) {
    // A new session while a stretch is still open means the last one never logged its end (a reload
    // or crash, or a log written before `interrupted` existed). Its end is unknown, so drop it rather
    // than count the time the page was closed.
    if (e.type === 'onramp-start') open = null
    else if (e.type === 'work-start') open = { startedAt: e.at, heldMs: 0, heldSince: null }
    else if (e.type === 'pause-hold') {
      if (open && open.heldSince === null) open.heldSince = e.at
    } else if (e.type === 'resume') {
      if (open && open.heldSince !== null) {
        open.heldMs += e.at - open.heldSince
        open.heldSince = null
      }
    } else if (e.type === 'interrupted') {
      if (open) stretches.push({ durationSec: e.stretchSec ?? 0, kind: 'interrupted', at: e.at })
      open = null
    } else if (e.type === 'work-complete' || e.type === 'pause-reset') {
      const durationSec = e.stretchSec ?? (open ? (e.at - open.startedAt - open.heldMs) / 1000 : 0)
      stretches.push({ durationSec, kind: e.type, at: e.at })
      open = null
    }
  }
  return { stretches, open }
}

/** The figures the Stats tab shows, as of wall time `now`. */
export function summarizeSession(events: PomodoroEvent[], now: number): SessionSummary {
  const { stretches, open } = parseSession(events)
  const completed = stretches.filter((s) => s.kind === 'work-complete')
  // Freeze the live counter at the moment of a hold so it reflects true focus time, not wall time.
  const isHeld = open?.heldSince != null
  const currentSec = open
    ? Math.max(0, ((open.heldSince ?? now) - open.startedAt - open.heldMs) / 1000)
    : 0
  return {
    stretches,
    open,
    completedCount: completed.length,
    resets: stretches.filter((s) => s.kind === 'pause-reset').length,
    totalFocusSec: completed.reduce((sum, s) => sum + s.durationSec, 0),
    currentSec,
    isHeld,
    longestSec: Math.max(0, currentSec, ...stretches.map((s) => s.durationSec)),
    breaksTaken: events.filter((e) => e.type === 'break-complete').length,
    breaksSkipped: events.filter((e) => e.type === 'break-skipped').length,
  }
}
