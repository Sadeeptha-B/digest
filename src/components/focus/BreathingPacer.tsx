import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from '../Icons'

// Box breathing: equal 4s phases. Inhale grows the ring, exhale shrinks it; the two holds
// keep it steady. Calm and rhythmic by design — no score, nothing to chase.
const PHASES = [
  { key: 'inhale', label: 'Breathe in', sec: 4, scale: 1 },
  { key: 'hold-in', label: 'Hold', sec: 4, scale: 1 },
  { key: 'exhale', label: 'Breathe out', sec: 4, scale: 0.55 },
  { key: 'hold-out', label: 'Hold', sec: 4, scale: 0.55 },
] as const

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function BreathingPacer() {
  const reduced = useRef(prefersReducedMotion())
  const [running, setRunning] = useState(true)
  const [idx, setIdx] = useState(0)
  const phase = PHASES[idx]

  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => setIdx((i) => (i + 1) % PHASES.length), phase.sec * 1000)
    return () => window.clearTimeout(id)
  }, [running, idx, phase.sec])

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Breathe</span>
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-1 rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400 hover:bg-ink-800 hover:text-zinc-200"
          aria-label={running ? 'Pause' : 'Start'}
        >
          {running ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
          {running ? 'Pause' : 'Start'}
        </button>
      </div>

      <div className="flex flex-col items-center py-2">
        <div className="relative flex h-32 w-32 items-center justify-center">
          {/* outer guide ring */}
          <div className="absolute inset-0 rounded-full border border-accent-500/20" />
          {/* breathing ring */}
          <div
            className="h-28 w-28 rounded-full border-2 border-accent-400/60 bg-accent-500/15"
            style={{
              transform: `scale(${phase.scale})`,
              transition: reduced.current ? 'none' : `transform ${phase.sec}s ease-in-out`,
            }}
          />
          <span className="absolute text-sm font-medium text-zinc-200">{phase.label}</span>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Box breathing · in 4 · hold 4 · out 4 · hold 4</p>
      </div>
    </div>
  )
}
