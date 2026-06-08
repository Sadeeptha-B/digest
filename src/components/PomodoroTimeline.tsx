import { Fragment } from 'react'
import { fmt } from '../lib/time'
import { CheckIcon, PauseIcon, PlayIcon, SkipIcon } from './Icons'
import type { PomodoroView } from '../hooks/usePomodoro'

const secs = (n: number) => fmt(Math.ceil(Math.max(0, n)))

type BlockStatus = 'done' | 'active' | 'paused' | 'upcoming'

/** A thin connector line between blocks, mirroring the timeline sketch. */
function Line() {
  return <div className="h-px flex-1 bg-ink-700" />
}

function Block({ status, label }: { status: BlockStatus; label?: string }) {
  const base =
    'flex h-11 min-w-[60px] shrink-0 items-center justify-center rounded-xl border-2 px-3 font-mono text-sm'
  const styles: Record<BlockStatus, string> = {
    done: 'border-accent-600/50 bg-accent-600/20 text-accent-300',
    active: 'border-accent-500 bg-accent-600/15 text-white ring-1 ring-accent-500',
    paused: 'border-zinc-500 bg-ink-800 text-zinc-300',
    upcoming: 'border-ink-700 text-zinc-600',
  }
  return (
    <div className={`${base} ${styles[status]}`}>
      {status === 'done' ? <CheckIcon className="h-4 w-4" /> : label}
    </div>
  )
}

export function PomodoroTimeline({
  view,
  onPause,
  onResume,
  onSkipBreak,
}: {
  view: PomodoroView
  onPause: () => void
  onResume: () => void
  onSkipBreak: () => void
}) {
  const { phase, doneCount, totalCount, activeIndex, activeRemainingSec, breakRemainingSec } = view
  const total = Math.max(totalCount, doneCount, 1)

  function statusFor(i: number): BlockStatus {
    if (i < doneCount) return 'done'
    if (i === activeIndex && phase === 'work') return 'active'
    if (i === activeIndex && phase === 'workPaused') return 'paused'
    return 'upcoming'
  }

  function labelFor(status: BlockStatus): string | undefined {
    if (status === 'active') return secs(activeRemainingSec)
    if (status === 'paused') return '↺'
    return undefined
  }

  // The break sits after the last completed block (between block doneCount-1 and doneCount).
  const breakAfter = phase === 'break' ? doneCount - 1 : -1

  return (
    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <Line />
        {Array.from({ length: total }).map((_, i) => {
          const status = statusFor(i)
          return (
            <Fragment key={i}>
              <Block status={status} label={labelFor(status)} />
              {i < total - 1 ? (
                breakAfter === i ? (
                  <div className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-zinc-400">
                    <span className="h-px w-2 bg-ink-700" />
                    <span className="rounded-full bg-ink-800 px-2 py-0.5 font-mono">
                      ☕ {secs(breakRemainingSec)}
                    </span>
                    <span className="h-px w-2 bg-ink-700" />
                  </div>
                ) : (
                  <Line />
                )
              ) : null}
            </Fragment>
          )
        })}
        <Line />
      </div>

      <StatusBar
        view={view}
        onPause={onPause}
        onResume={onResume}
        onSkipBreak={onSkipBreak}
      />
    </div>
  )
}

function StatusBar({
  view,
  onPause,
  onResume,
  onSkipBreak,
}: {
  view: PomodoroView
  onPause: () => void
  onResume: () => void
  onSkipBreak: () => void
}) {
  const { phase, doneCount, totalCount, activeRemainingSec, breakRemainingSec, rampRemainingSec } =
    view

  const secondary =
    'flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-ink-800'
  const primary =
    'flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500'

  let label: React.ReactNode = null
  let control: React.ReactNode = null

  switch (phase) {
    case 'onramp':
      label = <>Get ready — starting in {secs(rampRemainingSec)}s</>
      control = (
        <button onClick={onPause} className={secondary}>
          <PauseIcon className="h-3.5 w-3.5" /> Pause
        </button>
      )
      break
    case 'onrampPaused':
      label = <span className="text-zinc-400">Paused before start</span>
      control = (
        <button onClick={onResume} className={primary}>
          <PlayIcon className="h-3.5 w-3.5" /> Resume
        </button>
      )
      break
    case 'work':
      label = (
        <>
          Focus block {doneCount + 1} of {totalCount} — {secs(activeRemainingSec)} left
        </>
      )
      control = (
        <button onClick={onPause} className={secondary}>
          <PauseIcon className="h-3.5 w-3.5" /> Pause
        </button>
      )
      break
    case 'workPaused':
      label = (
        <span className="text-amber-400">Block reset — resume to start a fresh block from here</span>
      )
      control = (
        <button onClick={onResume} className={primary}>
          <PlayIcon className="h-3.5 w-3.5" /> Resume
        </button>
      )
      break
    case 'break':
      label = <>Break — {secs(breakRemainingSec)} left</>
      control = (
        <button onClick={onSkipBreak} className={primary}>
          <SkipIcon className="h-3.5 w-3.5" /> Skip break
        </button>
      )
      break
    case 'offramp':
      label = <span className="text-zinc-400">Wrapping up…</span>
      break
    case 'done':
      label = <span className="text-accent-300">Session complete 🎉</span>
      break
    default:
      return null
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400">
      <span className="min-w-0 truncate">{label}</span>
      {control}
    </div>
  )
}
