import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { fmt } from '../lib/time'
import { summarizeSession, type Stretch } from '../lib/sessionStats'
import type { Video } from '../types'

const STRETCH_ROW: Record<Stretch['kind'], { icon: string; color: string; label: string }> = {
  'work-complete': { icon: '✓', color: 'text-accent-400', label: 'Completed block' },
  'pause-reset': { icon: '↺', color: 'text-amber-400', label: 'Reset (paused)' },
  interrupted: { icon: '■', color: 'text-zinc-500', label: 'Stopped early' },
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

  const {
    stretches,
    open,
    completedCount,
    resets,
    totalFocusSec,
    currentSec,
    isHeld,
    longestSec,
    breaksTaken,
    breaksSkipped,
  } = summarizeSession(events, now)

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
        <Stat label="Blocks completed" value={String(completedCount)} />
        <Stat label="Resets" value={String(resets)} />
        <Stat label="Breaks taken" value={String(breaksTaken)} />
        <Stat label="Breaks skipped" value={String(breaksSkipped)} />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        <ul className="space-y-1">
          {open && (
            <li
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ring-1 ${
                isHeld ? 'bg-ink-800 ring-zinc-600/40' : 'bg-accent-600/15 ring-accent-600/40'
              }`}
            >
              <span className={isHeld ? 'text-zinc-300' : 'text-white'}>
                {isHeld ? 'Held' : 'In progress'}
              </span>
              <span className={`font-mono ${isHeld ? 'text-zinc-400' : 'text-accent-300'}`}>
                {fmt(currentSec)}
              </span>
            </li>
          )}
          {[...stretches].reverse().map((s, i) => (
            <li
              key={stretches.length - 1 - i}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-800"
            >
              <span className="flex items-center gap-2">
                <span className={STRETCH_ROW[s.kind].color}>{STRETCH_ROW[s.kind].icon}</span>
                <span className="text-zinc-300">{STRETCH_ROW[s.kind].label}</span>
              </span>
              <span className="font-mono text-xs text-zinc-400">{fmt(s.durationSec)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
