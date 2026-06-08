import { fmt } from '../lib/time'
import { PauseIcon, PlayIcon, SkipIcon } from './Icons'
import type { PomodoroView } from '../hooks/usePomodoro'

const secs = (n: number) => fmt(Math.ceil(Math.max(0, n)))
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

type SegStatus = 'done' | 'active' | 'held' | 'paused' | 'next' | 'upcoming'

/**
 * A single block rendered as a segment of the continuous progress bar. The active
 * segment fills left-to-right in real time; a held segment keeps its fill but dims
 * (the timer is paused, progress preserved); a reset (paused) segment is striped and
 * empty; the segment that resumes after a break glows in the warm "rest" accent.
 */
function Segment({ status, fill }: { status: SegStatus; fill: number }) {
  const track =
    status === 'next'
      ? 'bg-rest-400/15'
      : status === 'paused'
        ? 'bg-ink-700'
        : 'bg-ink-800'
  const ring =
    status === 'active'
      ? 'ring-1 ring-inset ring-accent-500/40'
      : status === 'held'
        ? 'ring-1 ring-inset ring-zinc-500/40'
        : status === 'next'
          ? 'ring-1 ring-inset ring-rest-400/40'
          : ''

  return (
    <div className={`relative h-2 flex-1 overflow-hidden rounded-full ${track} ${ring}`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-linear ${
          status === 'done' ? 'bg-accent-600' : status === 'held' ? 'bg-accent-400/50' : 'bg-accent-400'
        }`}
        style={{ width: `${clamp01(fill) * 100}%` }}
      />
      {status === 'paused' && (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.06)_4px,rgba(255,255,255,0.06)_8px)]" />
      )}
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
  const { phase, doneCount, totalCount, activeIndex, activeRemainingSec, activeBlockLenSec } = view
  const total = Math.max(totalCount, doneCount, 1)
  const isBreak = phase === 'break'
  // During a break, doneCount already counts the just-finished block, so the block
  // that resumes next is at index `doneCount`.
  const nextIndex = isBreak ? doneCount : -1

  function statusFor(i: number): SegStatus {
    if (i < doneCount) return 'done'
    if (i === activeIndex && phase === 'work') return 'active'
    if (i === activeIndex && phase === 'workHeld') return 'held'
    if (i === activeIndex && phase === 'workPaused') return 'paused'
    if (i === nextIndex) return 'next'
    return 'upcoming'
  }

  function fillFor(status: SegStatus): number {
    if (status === 'done') return 1
    if (status === 'active' || status === 'held') return 1 - activeRemainingSec / activeBlockLenSec
    return 0
  }

  return (
    <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900/40 px-4 py-3">
      <Header view={view} />

      <div className="mt-2.5 flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const status = statusFor(i)
          return <Segment key={i} status={status} fill={fillFor(status)} />
        })}
      </div>

      <Controls view={view} onPause={onPause} onResume={onResume} onSkipBreak={onSkipBreak} />
    </div>
  )
}

/** The headline row: a short phase label on the left, the hero countdown on the right. */
function Header({ view }: { view: PomodoroView }) {
  const {
    phase,
    doneCount,
    totalCount,
    activeRemainingSec,
    breakRemainingSec,
    rampRemainingSec,
  } = view

  let label: React.ReactNode = null
  let time: string | null = null
  let tone = 'text-white'

  switch (phase) {
    case 'onramp':
      label = <span className="text-zinc-400">Get ready</span>
      time = secs(rampRemainingSec)
      break
    case 'onrampPaused':
      label = <span className="text-zinc-400">Paused before start</span>
      time = secs(rampRemainingSec)
      tone = 'text-zinc-500'
      break
    case 'work':
      label = (
        <span className="text-accent-300">
          Focus · block {doneCount + 1} of {totalCount}
        </span>
      )
      time = secs(activeRemainingSec)
      break
    case 'workHeld':
      label = <span className="text-zinc-300">Paused — progress held</span>
      time = secs(activeRemainingSec)
      tone = 'text-zinc-400'
      break
    case 'workPaused':
      label = <span className="text-rest-300">Block reset — resume for a fresh block</span>
      time = secs(activeRemainingSec)
      tone = 'text-zinc-500'
      break
    case 'break':
      label = <span className="text-rest-300">☕ Break</span>
      time = secs(breakRemainingSec)
      tone = 'text-rest-300'
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
    <div className="flex items-end justify-between gap-3">
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      {time && (
        <span className={`shrink-0 font-mono text-2xl leading-none tabular-nums ${tone}`}>
          {time}
        </span>
      )}
    </div>
  )
}

/** Right-aligned primary control, varying by phase. */
function Controls({
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
  const secondary =
    'flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-ink-800'
  const primary =
    'flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500'
  const rest =
    'flex items-center gap-1.5 rounded-lg bg-rest-500 px-3 py-1.5 text-xs font-medium text-ink-950 hover:bg-rest-400'

  let control: React.ReactNode = null
  switch (view.phase) {
    case 'onramp':
    case 'work':
      control = (
        <button onClick={onPause} className={secondary}>
          <PauseIcon className="h-3.5 w-3.5" /> Pause
        </button>
      )
      break
    case 'onrampPaused':
    case 'workPaused':
    case 'workHeld':
      control = (
        <button onClick={onResume} className={primary}>
          <PlayIcon className="h-3.5 w-3.5" /> Resume
        </button>
      )
      break
    case 'break':
      control = (
        <button onClick={onSkipBreak} className={rest}>
          <SkipIcon className="h-3.5 w-3.5" /> Skip break
        </button>
      )
      break
    default:
      return null
  }

  return <div className="mt-3 flex justify-end">{control}</div>
}
