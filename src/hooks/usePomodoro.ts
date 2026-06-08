import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { YouTubePlayer } from 'react-youtube'
import { useStore } from '../store/useStore'
import type { PomodoroEventType } from '../types'

// YT.PlayerState values we care about.
const ENDED = 0
const PLAYING = 1
const PAUSED = 2

// Fixed durations (seconds). Pomodoro work length is configurable; these are not.
const ONRAMP_SEC = 3
const BREAK_SEC = 5 * 60
const OFFRAMP_SEC = 3

export type PomodoroPhase =
  | 'idle'
  | 'onramp'
  | 'onrampPaused'
  | 'work'
  | 'workPaused'
  | 'break'
  | 'offramp'
  | 'done'

export interface PomodoroView {
  phase: PomodoroPhase
  /** completed work blocks */
  doneCount: number
  /** projected total work blocks (recomputes as the timeline adjusts) */
  totalCount: number
  /** 0-based index of the in-progress work block, or -1 */
  activeIndex: number
  /** seconds left in the active work block */
  activeRemainingSec: number
  /** seconds left in the current break */
  breakRemainingSec: number
  /** seconds left in an onramp/offramp countdown */
  rampRemainingSec: number
}

const INITIAL_VIEW: PomodoroView = {
  phase: 'idle',
  doneCount: 0,
  totalCount: 0,
  activeIndex: -1,
  activeRemainingSec: 0,
  breakRemainingSec: 0,
  rampRemainingSec: 0,
}

interface Params {
  videoId: string
  playerRef: RefObject<YouTubePlayer | null>
  durationSec: number
  pomodoroLengthSec: number
  enabled: boolean
  /** called once the offramp finishes, so Watch can mark watched + advance */
  onSessionEnd: () => void
}

/**
 * Drives a Pomodoro focus session over a long video. The session is fully coupled to the
 * YouTube player: breaks auto-pause/resume the video, and a native video pause counts as a
 * Pomodoro pause (which forfeits the current block — "don't rewind, restart from here").
 *
 * Watch owns the player wiring and forwards player state changes + the ENDED event into this
 * hook via the returned `handlePlayerState` / `handleEnded`.
 */
export function usePomodoro({
  videoId,
  playerRef,
  durationSec,
  pomodoroLengthSec,
  enabled,
  onSessionEnd,
}: Params) {
  const logPomodoroEvent = useStore((s) => s.logPomodoroEvent)
  const [view, setView] = useState<PomodoroView>(INITIAL_VIEW)

  // --- Engine internals (refs so the interval/closures read fresh values synchronously) ---
  const phaseRef = useRef<PomodoroPhase>('idle')
  const doneRef = useRef(0)
  const blockStartRef = useRef(0) // content sec where the current work block began
  const blockEndRef = useRef(0) // target content sec where it ends
  const nextAnchorRef = useRef(0) // content sec where the next work block will begin
  const phaseStartRef = useRef(0) // wall ms when the current onramp/break/offramp began
  const rampAccumRef = useRef(0) // onramp seconds accumulated across pause/resume
  const workStartRef = useRef(0) // wall ms when the current work stretch began
  const lastTimeRef = useRef(0) // most recent content time read, for projecting totals
  // Programmatic pauses land in a phase that already ignores PAUSED, but a late event can race
  // a fast user action; swallow PAUSED briefly after we pause the player ourselves.
  const ignorePauseUntilRef = useRef(0)

  // Rebuilt every render so the closures capture the latest props; the interval and the
  // exposed handlers call through `fnsRef` to stay stable.
  const log = (type: PomodoroEventType, extra?: { index?: number; stretchSec?: number }) =>
    logPomodoroEvent(videoId, { type, at: Date.now(), ...extra })

  const projectTotal = (fromContentSec: number, done: number) => {
    const remaining = Math.max(0, durationSec - fromContentSec)
    return done + Math.max(0, Math.ceil(remaining / pomodoroLengthSec))
  }

  const buildView = (
    phase: PomodoroPhase,
    opts: { rampRemainingSec?: number; breakRemainingSec?: number; activeRemainingSec?: number },
  ): PomodoroView => {
    const done = doneRef.current
    const v: PomodoroView = { ...INITIAL_VIEW, phase, doneCount: done, totalCount: done }
    switch (phase) {
      case 'idle':
        v.totalCount = projectTotal(0, 0)
        break
      case 'onramp':
      case 'onrampPaused':
        v.totalCount = projectTotal(lastTimeRef.current, 0)
        v.rampRemainingSec = opts.rampRemainingSec ?? ONRAMP_SEC
        break
      case 'work':
      case 'workPaused':
        v.totalCount = projectTotal(blockStartRef.current, done)
        v.activeIndex = done
        v.activeRemainingSec =
          opts.activeRemainingSec ?? Math.max(0, blockEndRef.current - blockStartRef.current)
        break
      case 'break':
        v.totalCount = projectTotal(nextAnchorRef.current, done)
        v.breakRemainingSec = opts.breakRemainingSec ?? BREAK_SEC
        break
      case 'offramp':
        v.rampRemainingSec = opts.rampRemainingSec ?? OFFRAMP_SEC
        break
      case 'done':
        break
    }
    return v
  }

  const show = (phase: PomodoroPhase, opts: Parameters<typeof buildView>[1] = {}) =>
    setView(buildView(phase, opts))

  const pauseVideo = () => {
    ignorePauseUntilRef.current = Date.now() + 700
    try {
      playerRef.current?.pauseVideo?.()
    } catch {
      /* not ready */
    }
  }
  const playVideo = () => {
    try {
      playerRef.current?.playVideo?.()
    } catch {
      /* not ready */
    }
  }
  const readTime = async (): Promise<number> => {
    try {
      const t = await playerRef.current?.getCurrentTime()
      if (typeof t === 'number' && !Number.isNaN(t)) return t
    } catch {
      /* not ready */
    }
    return blockStartRef.current
  }

  function startSession() {
    if (phaseRef.current !== 'idle') return
    doneRef.current = 0
    rampAccumRef.current = 0
    phaseRef.current = 'onramp'
    phaseStartRef.current = Date.now()
    log('onramp-start')
    pauseVideo()
    show('onramp', { rampRemainingSec: ONRAMP_SEC })
  }

  function startWork(anchorSec: number) {
    blockStartRef.current = anchorSec
    blockEndRef.current = Math.min(anchorSec + pomodoroLengthSec, durationSec)
    workStartRef.current = Date.now()
    phaseRef.current = 'work'
    log('work-start', { index: doneRef.current })
    playVideo()
    show('work', { activeRemainingSec: blockEndRef.current - anchorSec })
  }

  function startBreak() {
    const stretchSec = Math.round((Date.now() - workStartRef.current) / 1000)
    log('work-complete', { index: doneRef.current, stretchSec })
    nextAnchorRef.current = blockEndRef.current
    doneRef.current += 1
    phaseRef.current = 'break'
    phaseStartRef.current = Date.now()
    log('break-start', { index: doneRef.current })
    pauseVideo()
    show('break', { breakRemainingSec: BREAK_SEC })
  }

  function endBreak(reason: Extract<PomodoroEventType, 'break-complete' | 'break-skipped'>) {
    if (phaseRef.current !== 'break') return
    log(reason, { index: doneRef.current })
    startWork(nextAnchorRef.current)
  }

  function startOfframp() {
    const p = phaseRef.current
    if (p === 'offramp' || p === 'done' || p === 'idle') return
    if (p === 'work') {
      const stretchSec = Math.round((Date.now() - workStartRef.current) / 1000)
      log('work-complete', { index: doneRef.current, stretchSec })
      doneRef.current += 1
    }
    phaseRef.current = 'offramp'
    phaseStartRef.current = Date.now()
    log('offramp')
    pauseVideo()
    show('offramp', { rampRemainingSec: OFFRAMP_SEC })
  }

  function finish() {
    if (phaseRef.current === 'done') return
    phaseRef.current = 'done'
    log('done')
    show('done')
    onSessionEnd()
  }

  // Forfeit the current work block. `viaNative` = the user paused via the YouTube controls
  // (video already paused); otherwise we pause it ourselves.
  function pauseWork(viaNative: boolean) {
    if (phaseRef.current !== 'work') return
    const stretchSec = Math.round((Date.now() - workStartRef.current) / 1000)
    log('pause-reset', { index: doneRef.current, stretchSec })
    phaseRef.current = 'workPaused'
    if (!viaNative) pauseVideo()
    show('workPaused', { activeRemainingSec: pomodoroLengthSec })
  }

  async function resumeWork() {
    if (phaseRef.current !== 'workPaused') return
    const t = await readTime()
    log('resume', { index: doneRef.current })
    startWork(t) // fresh full block from the current position
  }

  function pauseOnramp() {
    if (phaseRef.current !== 'onramp') return
    rampAccumRef.current += (Date.now() - phaseStartRef.current) / 1000
    phaseRef.current = 'onrampPaused'
    show('onrampPaused', { rampRemainingSec: Math.max(0, ONRAMP_SEC - rampAccumRef.current) })
  }

  function resumeOnramp() {
    if (phaseRef.current !== 'onrampPaused') return
    phaseRef.current = 'onramp'
    phaseStartRef.current = Date.now()
    show('onramp', { rampRemainingSec: Math.max(0, ONRAMP_SEC - rampAccumRef.current) })
  }

  function pause() {
    const p = phaseRef.current
    if (p === 'work') pauseWork(false)
    else if (p === 'onramp') pauseOnramp()
  }

  function resume() {
    const p = phaseRef.current
    if (p === 'workPaused') void resumeWork()
    else if (p === 'onrampPaused') resumeOnramp()
  }

  function skipBreak() {
    endBreak('break-skipped')
  }

  function handlePlayerState(state: number) {
    const p = phaseRef.current
    if (state === PAUSED) {
      if (Date.now() < ignorePauseUntilRef.current) return
      if (p === 'work') pauseWork(true)
    } else if (state === PLAYING) {
      if (p === 'workPaused') void resumeWork()
      else if (p === 'onramp' || p === 'onrampPaused') void readTime().then(startWork)
      else if (p === 'break') skipBreak()
    }
  }

  // Returns true when it has taken over the end-of-video handling (so Watch defers its normal
  // advance until the offramp finishes and calls onSessionEnd).
  function handleEnded() {
    const p = phaseRef.current
    if (p === 'idle' || p === 'done') return false
    startOfframp()
    return true
  }

  async function tick() {
    const player = playerRef.current
    if (!player) return
    const phase = phaseRef.current
    const now = Date.now()
    switch (phase) {
      case 'onramp': {
        lastTimeRef.current = await readTime()
        const remaining = ONRAMP_SEC - (rampAccumRef.current + (now - phaseStartRef.current) / 1000)
        if (remaining <= 0) startWork(lastTimeRef.current)
        else show('onramp', { rampRemainingSec: remaining })
        break
      }
      case 'work': {
        const t = await readTime()
        lastTimeRef.current = t
        const remaining = blockEndRef.current - t
        const isLast = blockEndRef.current >= durationSec - 0.5
        if (isLast) {
          if (t >= durationSec - 1) startOfframp() // fallback if ENDED never fires
          else show('work', { activeRemainingSec: Math.max(0, remaining) })
        } else if (remaining <= 0) {
          startBreak()
        } else {
          show('work', { activeRemainingSec: remaining })
        }
        break
      }
      case 'break': {
        const remaining = BREAK_SEC - (now - phaseStartRef.current) / 1000
        if (remaining <= 0) endBreak('break-complete')
        else show('break', { breakRemainingSec: remaining })
        break
      }
      case 'offramp': {
        const remaining = OFFRAMP_SEC - (now - phaseStartRef.current) / 1000
        if (remaining <= 0) finish()
        else show('offramp', { rampRemainingSec: remaining })
        break
      }
      default:
        break
    }
  }

  const fnsRef = useRef({
    tick,
    startSession,
    handlePlayerState,
    handleEnded,
    skipBreak,
    pause,
    resume,
  })
  fnsRef.current = { tick, startSession, handlePlayerState, handleEnded, skipBreak, pause, resume }

  // Reset the engine when switching videos.
  useEffect(() => {
    phaseRef.current = 'idle'
    doneRef.current = 0
    rampAccumRef.current = 0
    setView(INITIAL_VIEW)
  }, [videoId])

  // Auto-start the onramp once the video is known to be long enough. Keyed on `enabled` only:
  // navigating to another video resets durationSec to 0 in Watch, so `enabled` reliably dips to
  // false and back to true per video — re-running this without a premature start mid-transition.
  useEffect(() => {
    if (enabled) fnsRef.current.startSession()
  }, [enabled])

  // Single driving interval (same polling pattern as the transcript/position effects).
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      void fnsRef.current.tick()
    }, 250)
    return () => window.clearInterval(id)
  }, [enabled])

  const stablePause = useCallback(() => fnsRef.current.pause(), [])
  const stableResume = useCallback(() => fnsRef.current.resume(), [])
  const stableSkipBreak = useCallback(() => fnsRef.current.skipBreak(), [])
  const stableHandlePlayerState = useCallback((s: number) => fnsRef.current.handlePlayerState(s), [])
  const stableHandleEnded = useCallback(() => fnsRef.current.handleEnded(), [])

  return {
    view,
    pause: stablePause,
    resume: stableResume,
    skipBreak: stableSkipBreak,
    handlePlayerState: stableHandlePlayerState,
    handleEnded: stableHandleEnded,
    PLAYER_ENDED: ENDED,
  }
}
