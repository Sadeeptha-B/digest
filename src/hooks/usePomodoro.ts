import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { YouTubePlayer } from 'react-youtube'
import { getLibraryEpoch, useStore } from '../store/useStore'
import type { PomodoroEvent, PomodoroEventType } from '../types'

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
    | 'workHeld'
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
    /** full length of the active work block, for rendering fill progress */
    activeBlockLenSec: number
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
    activeBlockLenSec: 0,
    breakRemainingSec: 0,
    rampRemainingSec: 0,
}

interface Params {
    videoId: string
    playerRef: RefObject<YouTubePlayer | null>
    durationSec: number
    pomodoroLengthSec: number
    /** Pausing with less than this much focus elapsed in the block resets it; at/above, it holds. */
    resetThresholdSec: number
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
    resetThresholdSec,
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
    const holdStartRef = useRef(0) // wall ms when the current hold (workHeld) began
    const blockHeldMsRef = useRef(0) // total held ms in the current block, excluded from the stretch
    const lastTimeRef = useRef(0) // most recent content time read, for projecting totals
    // Programmatic pauses land in a phase that already ignores PAUSED, but a late event can race
    // a fast user action; swallow PAUSED briefly after we pause the player ourselves.
    const ignorePauseUntilRef = useRef(0)
    // Bumped on every reset (video switch, focus off, unmount). Player reads are async, so a read
    // still in flight from an earlier session checks this before acting on its answer.
    const sessionRef = useRef(0)
    // The library epoch the session started in. Once Clear all data has run, the session writes
    // nothing more, including the `interrupted` it would log as the watch page unmounts.
    const libraryEpochRef = useRef(0)

    // Rebuilt every render so the closures capture the latest props; the interval and the
    // exposed handlers call through `fnsRef` to stay stable.
    const record = (forVideoId: string, event: PomodoroEvent) => {
        if (libraryEpochRef.current === getLibraryEpoch()) logPomodoroEvent(forVideoId, event)
    }
    const log = (type: PomodoroEventType, extra?: { index?: number; stretchSec?: number }) =>
        record(videoId, { type, at: Date.now(), ...extra })

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
            case 'workHeld':
                v.totalCount = projectTotal(blockStartRef.current, done)
                v.activeIndex = done
                v.activeRemainingSec =
                    opts.activeRemainingSec ?? Math.max(0, blockEndRef.current - blockStartRef.current)
                // A reset shows a full (fresh) block; an active/held block shows real progress.
                v.activeBlockLenSec = Math.max(
                    1,
                    phase === 'workPaused'
                        ? pomodoroLengthSec
                        : blockEndRef.current - blockStartRef.current,
                )
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
    // Read the content time for a decision taken in the current phase. Null when the engine moved on
    // while the player answered (a reset, or any change of phase such as a pause), so a stale read
    // never overrides the newer state. A pause already resumed by then has been superseded, and the
    // read still counts.
    const readTimeForPhase = async (): Promise<number | null> => {
        const session = sessionRef.current
        const phase = phaseRef.current
        const t = await readTime()
        return session === sessionRef.current && phase === phaseRef.current ? t : null
    }

    function resetEngine() {
        sessionRef.current += 1
        phaseRef.current = 'idle'
        doneRef.current = 0
        rampAccumRef.current = 0
        blockStartRef.current = 0
        blockEndRef.current = 0
        nextAnchorRef.current = 0
        phaseStartRef.current = 0
        workStartRef.current = 0
        holdStartRef.current = 0
        blockHeldMsRef.current = 0
        lastTimeRef.current = 0
        ignorePauseUntilRef.current = 0
        setView(INITIAL_VIEW)
    }

    function startSession() {
        if (phaseRef.current !== 'idle') return
        libraryEpochRef.current = getLibraryEpoch()
        doneRef.current = 0
        rampAccumRef.current = 0
        phaseRef.current = 'onramp'
        phaseStartRef.current = Date.now()
        log('onramp-start')
        pauseVideo()
        show('onramp', { rampRemainingSec: ONRAMP_SEC })
    }

    // Focused duration of the current stretch, excluding any time it was held (paused).
    const stretchSeconds = () =>
        Math.max(0, Math.round((Date.now() - workStartRef.current - blockHeldMsRef.current) / 1000))

    // The stretch's focus time as it ends now. Ending mid-hold: the ongoing hold isn't focus time either.
    function endStretch() {
        if (phaseRef.current === 'workHeld') blockHeldMsRef.current += Date.now() - holdStartRef.current
        return stretchSeconds()
    }

    function startWork(anchorSec: number) {
        blockStartRef.current = anchorSec
        blockEndRef.current = Math.min(anchorSec + pomodoroLengthSec, durationSec)
        workStartRef.current = Date.now()
        blockHeldMsRef.current = 0
        phaseRef.current = 'work'
        log('work-start', { index: doneRef.current })
        playVideo()
        show('work', { activeRemainingSec: blockEndRef.current - anchorSec })
    }

    function startBreak() {
        const stretchSec = stretchSeconds()
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
        if (p === 'work' || p === 'workHeld') {
            const stretchSec = endStretch()
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

    // A session that stops before the video ends (focus mode turned off, or the user left the video)
    // is logged as `interrupted`, closing any open work stretch at the focus time it reached. It is not
    // logged as a completed block, which it wasn't, and the Stats tab stops counting it.
    function interrupt(forVideoId = videoId) {
        const p = phaseRef.current
        if (p === 'idle' || p === 'done') return
        const stretch = p === 'work' || p === 'workHeld' ? { stretchSec: endStretch() } : {}
        record(forVideoId, { type: 'interrupted', at: Date.now(), index: doneRef.current, ...stretch })
    }

    // Pause the current work block. `viaNative` = the user paused via the YouTube controls
    // (video already paused); otherwise we pause it ourselves. How much focus has accrued in the
    // block decides what happens: under the threshold it's forfeited (reset, restart fresh on
    // resume); at/above it's just held (the remaining time is preserved and the same block resumes).
    function pauseWork(viaNative: boolean) {
        if (phaseRef.current !== 'work') return
        const stretchSec = stretchSeconds()
        const elapsedSec = Math.max(0, lastTimeRef.current - blockStartRef.current)
        if (!viaNative) pauseVideo()

        if (elapsedSec < resetThresholdSec) {
            log('pause-reset', { index: doneRef.current, stretchSec })
            phaseRef.current = 'workPaused'
            show('workPaused', { activeRemainingSec: pomodoroLengthSec })
        } else {
            log('pause-hold', { index: doneRef.current, stretchSec })
            holdStartRef.current = Date.now()
            phaseRef.current = 'workHeld'
            show('workHeld', { activeRemainingSec: Math.max(0, blockEndRef.current - lastTimeRef.current) })
        }
    }

    // Resume after a reset: a fresh full block from the current position.
    async function resumeWork() {
        if (phaseRef.current !== 'workPaused') return
        const t = await readTimeForPhase()
        if (t === null) return
        log('resume', { index: doneRef.current })
        startWork(t)
    }

    // Resume after a hold: continue the same block where it left off (remaining time preserved).
    function resumeHeld() {
        if (phaseRef.current !== 'workHeld') return
        blockHeldMsRef.current += Date.now() - holdStartRef.current
        log('resume', { index: doneRef.current })
        phaseRef.current = 'work'
        playVideo()
        show('work', { activeRemainingSec: Math.max(0, blockEndRef.current - lastTimeRef.current) })
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
        else if (p === 'workHeld') resumeHeld()
        else if (p === 'onrampPaused') resumeOnramp()
    }

    function skipBreak() {
        endBreak('break-skipped')
    }

    // Pressing play during the onramp skips straight to the first block, from wherever the video is.
    async function skipOnramp() {
        const t = await readTimeForPhase()
        if (t !== null) startWork(t)
    }

    function handlePlayerState(state: number) {
        const p = phaseRef.current
        if (state === PAUSED) {
            if (Date.now() < ignorePauseUntilRef.current) return
            if (p === 'work') pauseWork(true)
        } else if (state === PLAYING) {
            if (p === 'workPaused') void resumeWork()
            else if (p === 'workHeld') resumeHeld()
            else if (p === 'onramp' || p === 'onrampPaused') void skipOnramp()
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
                const t = await readTimeForPhase()
                if (t === null) break
                lastTimeRef.current = t
                const remaining = ONRAMP_SEC - (rampAccumRef.current + (now - phaseStartRef.current) / 1000)
                if (remaining <= 0) startWork(lastTimeRef.current)
                else show('onramp', { rampRemainingSec: remaining })
                break
            }
            case 'work': {
                const t = await readTimeForPhase()
                if (t === null) break
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
        interrupt,
    })
    fnsRef.current = { tick, startSession, handlePlayerState, handleEnded, skipBreak, pause, resume, interrupt }

    // Reset the engine when the video changes or the page closes. A session still running then is
    // interrupted and logged under the video it belonged to, not the one that replaced it.
    useEffect(() => {
        return () => {
            fnsRef.current.interrupt(videoId)
            resetEngine()
        }
    }, [videoId])

    // Auto-start the onramp once the video is known to be long enough. Keyed on `enabled` only:
    // navigating to another video resets durationSec to 0 in Watch, so `enabled` reliably dips to
    // false and back to true per video — re-running this without a premature start mid-transition.
    useEffect(() => {
        if (enabled) {
            fnsRef.current.startSession()
            return
        }

        const phase = phaseRef.current
        if (phase === 'onramp' || phase === 'onrampPaused' || phase === 'break' || phase === 'offramp') {
            try {
                playerRef.current?.playVideo?.()
            } catch {
                /* not ready */
            }
        }
        fnsRef.current.interrupt()
        resetEngine()
    }, [enabled, playerRef])

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
