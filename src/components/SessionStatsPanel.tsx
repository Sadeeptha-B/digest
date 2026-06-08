import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { fmt } from '../lib/time'
import type { PomodoroEvent, Video } from '../types'

interface Stretch {
  durationSec: number
  kind: 'work-complete' | 'pause-reset'
  at: number
}

function parse(events: PomodoroEvent[]) {
  const stretches: Stretch[] = []
  let openStart: number | null = null
  for (const e of events) {
    if (e.type === 'work-start') openStart = e.at
    else if (e.type === 'work-complete' || e.type === 'pause-reset') {
      const durationSec = e.stretchSec ?? (openStart ? (e.at - openStart) / 1000 : 0)
      stretches.push({ durationSec, kind: e.type, at: e.at })
      openStart = null
    }
  }
  return { stretches, inProgressSince: openStart }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2">
      <div className="font-mono text-base text-white">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  )
}

export function SessionStatsPanel({ video }: { video: Video }) {
  const events = useStore((s) => s.pomodoroSessions[video.id])
  const clearPomodoroSession = useStore((s) => s.clearPomodoroSession)

  // Tick once a second so the in-progress stretch counts up live.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const { stretches, inProgressSince } = useMemo(() => parse(events ?? []), [events])

  if (!events || events.length === 0) {
    return (
      <div className="px-1">
        <p className="text-sm text-zinc-500">
          No focus session yet. For videos longer than 15 minutes, a Pomodoro timeline appears
          below the video and your work stretches, pauses, and breaks are tracked here.
        </p>
      </div>
    )
  }

  const completed = stretches.filter((s) => s.kind === 'work-complete')
  const resets = stretches.filter((s) => s.kind === 'pause-reset').length
  const totalFocusSec = completed.reduce((sum, s) => sum + s.durationSec, 0)
  const currentSec = inProgressSince ? (now - inProgressSince) / 1000 : 0
  const longestSec = Math.max(0, currentSec, ...stretches.map((s) => s.durationSec))
  const breaksTaken = events.filter((e) => e.type === 'break-complete').length
  const breaksSkipped = events.filter((e) => e.type === 'break-skipped').length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Session stats</span>
        <button
          onClick={() => clearPomodoroSession(video.id)}
          className="rounded-lg border border-ink-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-ink-800 hover:text-zinc-200"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total focused" value={fmt(totalFocusSec)} />
        <Stat label="Longest stretch" value={fmt(longestSec)} />
        <Stat label="Blocks completed" value={String(completed.length)} />
        <Stat label="Resets" value={String(resets)} />
        <Stat label="Breaks taken" value={String(breaksTaken)} />
        <Stat label="Breaks skipped" value={String(breaksSkipped)} />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto no-scrollbar">
        <ul className="space-y-1">
          {inProgressSince && (
            <li className="flex items-center justify-between rounded-md bg-accent-600/15 px-2 py-1.5 text-sm ring-1 ring-accent-600/40">
              <span className="text-white">In progress</span>
              <span className="font-mono text-accent-300">{fmt(currentSec)}</span>
            </li>
          )}
          {[...stretches].reverse().map((s, i) => (
            <li
              key={stretches.length - 1 - i}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-800"
            >
              <span className="flex items-center gap-2">
                <span className={s.kind === 'work-complete' ? 'text-accent-400' : 'text-amber-400'}>
                  {s.kind === 'work-complete' ? '✓' : '↺'}
                </span>
                <span className="text-zinc-300">
                  {s.kind === 'work-complete' ? 'Completed block' : 'Reset (paused)'}
                </span>
              </span>
              <span className="font-mono text-xs text-zinc-400">{fmt(s.durationSec)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
