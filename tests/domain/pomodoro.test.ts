// The Pomodoro focus engine (src/hooks/usePomodoro.ts), driven with fake time and a fake player.
// Covers ADR 0010's focus scaffolding: onramp → work blocks → breaks → offramp, and how pauses
// either reset or hold a block depending on the reset threshold.
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { YouTubePlayer } from 'react-youtube'
import { usePomodoro } from '../../src/hooks/usePomodoro'
import { summarizeSession } from '../../src/lib/sessionStats'
import { deferred } from '../support/deferred'
import { store } from '../support/factories'

const PLAYING = 1
const PAUSED = 2

const MIN = 60
const LEN = 25 * MIN

function fakePlayer() {
    const player = {
        time: 0,
        getCurrentTime: vi.fn(async () => player.time),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
    }
    return player
}

type Props = { videoId: string; enabled: boolean; durationSec: number; resetThresholdSec: number }

function setup(overrides: Partial<Props> = {}) {
    const player = fakePlayer()
    const playerRef = { current: player as unknown as YouTubePlayer }
    const onSessionEnd = vi.fn()
    const initialProps: Props = {
        videoId: 'vid',
        enabled: true,
        durationSec: 120 * MIN,
        resetThresholdSec: 5 * MIN,
        ...overrides,
    }
    const hook = renderHook(
        (props: Props) =>
            usePomodoro({ ...props, playerRef, pomodoroLengthSec: LEN, onSessionEnd }),
        { initialProps },
    )
    return {
        player,
        onSessionEnd,
        hook,
        props: initialProps,
        view: () => hook.result.current.view,
        api: () => hook.result.current,
    }
}

type Ctx = ReturnType<typeof setup>

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

/** Let the video "play" for `sec`: wall clock and content time move together. */
async function play(player: ReturnType<typeof fakePlayer>, sec: number) {
    for (let i = 0; i < sec; i++) {
        player.time += 1
        await advance(1000)
    }
}

const events = (videoId = 'vid') => (store().pomodoroSessions[videoId] ?? []).map((e) => e.type)
const lastEvent = (type: string, videoId = 'vid') =>
    [...(store().pomodoroSessions[videoId] ?? [])].reverse().find((e) => e.type === type)

async function startWorking(overrides: Partial<Props> = {}) {
    const ctx = setup(overrides)
    await advance(3000) // the 3s onramp
    expect(ctx.view().phase).toBe('work')
    return ctx
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T09:00:00Z'))
})

describe('session start', () => {
    it('stays idle while disabled (focus mode off or a short video)', async () => {
        const { view, player } = setup({ enabled: false })
        await advance(5000)
        expect(view().phase).toBe('idle')
        expect(player.pauseVideo).not.toHaveBeenCalled()
        expect(events()).toEqual([])
    })

    it('projects the number of blocks from the duration', () => {
        expect(setup({ durationSec: 50 * MIN }).view().totalCount).toBe(2)
        expect(setup({ durationSec: 51 * MIN }).view().totalCount).toBe(3)
    })

    it('runs a paused 3s onramp, then starts the first block and plays', async () => {
        const { view, player } = setup()
        expect(view().phase).toBe('onramp')
        expect(player.pauseVideo).toHaveBeenCalledTimes(1)
        await advance(2000)
        expect(view().phase).toBe('onramp')
        await advance(1000)
        expect(view()).toMatchObject({ phase: 'work', activeIndex: 0, activeRemainingSec: LEN })
        expect(player.playVideo).toHaveBeenCalled()
        expect(events()).toEqual(['onramp-start', 'work-start'])
    })

    it('pressing play during the onramp skips straight to work', async () => {
        const { view, api } = setup()
        await act(async () => api().handlePlayerState(PLAYING))
        expect(view().phase).toBe('work')
    })

    it('pausing the onramp holds its countdown', async () => {
        const { view, api } = setup()
        await advance(1000)
        act(() => api().pause())
        expect(view().phase).toBe('onrampPaused')
        await advance(10_000)
        expect(view().phase).toBe('onrampPaused')
        act(() => api().resume())
        await advance(2000)
        expect(view().phase).toBe('work')
    })
})

describe('blocks and breaks', () => {
    it('a finished block starts a break that pauses the video', async () => {
        const { view, player } = await startWorking()
        player.time = LEN
        await advance(250)
        expect(view()).toMatchObject({ phase: 'break', doneCount: 1 })
        expect(player.pauseVideo).toHaveBeenCalledTimes(2)
        expect(events().slice(-2)).toEqual(['work-complete', 'break-start'])
    })

    it('after the 5-minute break the next block starts where the last one ended', async () => {
        const { view, player } = await startWorking()
        player.time = LEN
        await advance(250)
        player.time = LEN + 7 // wherever the video sits, the block anchors at the previous end
        await advance(5 * MIN * 1000)
        expect(view()).toMatchObject({ phase: 'work', activeIndex: 1 })
        expect(lastEvent('break-complete')).toBeDefined()
        player.time = 2 * LEN
        await advance(250)
        expect(view().phase).toBe('break')
    })

    it('pressing play during a break skips it', async () => {
        const { view, player, api } = await startWorking()
        player.time = LEN
        await advance(250)
        await advance(1000)
        act(() => api().handlePlayerState(PLAYING))
        expect(view().phase).toBe('work')
        expect(lastEvent('break-skipped')).toBeDefined()
    })

    it('ignores the late PAUSED echo of its own programmatic pause', async () => {
        const { view, player, api } = await startWorking()
        player.time = LEN
        await advance(250) // break → we paused the player
        act(() => api().skipBreak())
        act(() => api().handlePlayerState(PAUSED)) // the echo, within 700ms
        expect(view().phase).toBe('work')
        await advance(1000)
        act(() => api().handlePlayerState(PAUSED)) // a real user pause later on
        expect(view().phase).not.toBe('work')
    })
})

describe('pausing a block', () => {
    it('a pause before the reset threshold forfeits the block; resuming starts a fresh one from here', async () => {
        const { view, player, api } = await startWorking()
        await play(player, 2 * MIN)
        act(() => api().pause())
        expect(view()).toMatchObject({ phase: 'workPaused', activeRemainingSec: LEN })
        expect(lastEvent('pause-reset')?.stretchSec).toBe(2 * MIN)

        player.time = 3 * MIN
        await act(async () => api().resume())
        expect(view()).toMatchObject({ phase: 'work', activeIndex: 0, activeRemainingSec: LEN })
    })

    it('a pause after the threshold holds the block; resuming keeps the remaining time', async () => {
        const { view, player, api } = await startWorking()
        await play(player, 10 * MIN)
        act(() => api().handlePlayerState(PAUSED)) // native pause via the YouTube controls
        expect(view()).toMatchObject({ phase: 'workHeld', activeRemainingSec: LEN - 10 * MIN })
        await advance(30 * MIN * 1000) // a long hold costs nothing
        act(() => api().handlePlayerState(PLAYING))
        expect(view()).toMatchObject({ phase: 'work', activeRemainingSec: LEN - 10 * MIN })
    })

    it('a threshold of 0 never resets', async () => {
        const { view, api } = await startWorking({ resetThresholdSec: 0 })
        act(() => api().pause())
        expect(view().phase).toBe('workHeld')
    })

    it('held time is not counted as focus time', async () => {
        const { player, api } = await startWorking()
        await play(player, 10 * MIN)
        act(() => api().pause())
        await advance(20 * MIN * 1000)
        act(() => api().resume())
        player.time = LEN
        await play(player, 0)
        await advance(250)
        expect(lastEvent('work-complete')?.stretchSec).toBe(10 * MIN)
    })
})

describe('ending', () => {
    it('ENDED hands over to a 3s offramp, then ends the session exactly once', async () => {
        const { view, onSessionEnd, api, player } = await startWorking()
        await play(player, 60)
        let tookOver = false
        act(() => {
            tookOver = api().handleEnded()
        })
        expect(tookOver).toBe(true)
        expect(view()).toMatchObject({ phase: 'offramp', doneCount: 1 })
        await advance(2000)
        expect(onSessionEnd).not.toHaveBeenCalled()
        await advance(1500)
        expect(view().phase).toBe('done')
        await advance(10_000)
        expect(onSessionEnd).toHaveBeenCalledTimes(1)
        expect(events().slice(-3)).toEqual(['work-complete', 'offramp', 'done'])
    })

    it('does not take over ENDED when no session is running', () => {
        const { api } = setup({ enabled: false })
        expect(api().handleEnded()).toBe(false)
    })

    it('falls back to the offramp near the end of the last block if ENDED never fires', async () => {
        const { view, player } = await startWorking({ durationSec: 20 * MIN })
        player.time = 20 * MIN - 0.5
        await advance(250)
        expect(view().phase).toBe('offramp')
    })

    it('ENDED during a held block counts only the focused time', async () => {
        const { player, api } = await startWorking()
        await play(player, 10 * MIN)
        act(() => api().pause())
        await advance(MIN * 1000)
        act(() => {
            api().handleEnded()
        })
        expect(lastEvent('work-complete')?.stretchSec).toBe(10 * MIN)
    })
})

describe('turning it off', () => {
    it('disabling focus mode mid-break resumes the video and resets the session', async () => {
        const { view, player, hook } = await startWorking()
        player.time = LEN
        await advance(250)
        expect(view().phase).toBe('break')
        player.playVideo.mockClear()
        hook.rerender({ videoId: 'vid', enabled: false, durationSec: 120 * MIN, resetThresholdSec: 5 * MIN })
        expect(player.playVideo).toHaveBeenCalled()
        expect(view().phase).toBe('idle')
    })

    it('switching video resets the engine', async () => {
        const { view, hook } = await startWorking()
        hook.rerender({ videoId: 'next', enabled: false, durationSec: 0, resetThresholdSec: 5 * MIN })
        expect(view()).toMatchObject({ phase: 'idle', doneCount: 0 })
    })
})

// How a session that stops before the video ends reads back in the Stats tab: the real hook's log,
// replayed by summarizeSession long after the fact.
describe('an interrupted session, as the Stats tab replays it', () => {
    const interruptions: Array<[string, (ctx: Ctx) => void]> = [
        ['focus mode is turned off', ({ hook, props }) => hook.rerender({ ...props, enabled: false })],
        ['the user moves to another video', ({ hook, props }) => hook.rerender({ ...props, videoId: 'next', enabled: false, durationSec: 0 })],
        ['the hook unmounts (the user leaves the watch page)', ({ hook }) => hook.unmount()],
    ]
    const anHourLater = () => Date.now() + 60 * MIN * 1000

    it.each(interruptions)('stops counting when %s, without calling it a completed block', async (_label, interrupt) => {
        const ctx = await startWorking()
        await play(ctx.player, 10)
        interrupt(ctx)

        expect(events().slice(-1)).toEqual(['interrupted'])
        const summary = summarizeSession(store().pomodoroSessions.vid, anHourLater())
        expect(summary).toMatchObject({ open: null, currentSec: 0, longestSec: 10, completedCount: 0, totalFocusSec: 0 })
        expect(summary.stretches).toEqual([expect.objectContaining({ kind: 'interrupted', durationSec: 10 })])
    })

    it('a held block that is interrupted keeps only its focused time', async () => {
        const ctx = await startWorking()
        await play(ctx.player, 10 * MIN)
        act(() => ctx.api().pause())
        await advance(5 * MIN * 1000)
        ctx.hook.unmount()
        expect(summarizeSession(store().pomodoroSessions.vid, anHourLater()).stretches).toEqual([
            expect.objectContaining({ kind: 'interrupted', durationSec: 10 * MIN }),
        ])
    })

    it('leaves nothing open when it stops during the onramp', async () => {
        const onramp = setup()
        onramp.hook.unmount()
        expect(events()).toEqual(['onramp-start', 'interrupted'])
        expect(summarizeSession(store().pomodoroSessions.vid, anHourLater())).toMatchObject({ open: null, stretches: [] })
    })

    it('a session running when the library is cleared writes nothing to the cleared log', async () => {
        const { player, hook } = await startWorking()
        await play(player, 10)
        store().reset() // Clear all data; the watch page unmounts right after
        hook.unmount()
        expect(store().pomodoroSessions).toEqual({})
    })

    it('a session that reached its end is not interrupted by leaving afterwards', async () => {
        const { api, hook } = await startWorking()
        act(() => {
            api().handleEnded()
        })
        await advance(3500)
        hook.unmount()
        expect(events().slice(-2)).toEqual(['offramp', 'done'])
    })
})

// The player answers asynchronously. A read still in flight when the session moves on must not act
// on whatever came next.
describe('player reads that answer late', () => {
    it('pressing play in the onramp, then turning focus off before the time arrives, stays off', async () => {
        const { view, player, api, hook, props } = setup()
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        act(() => api().handlePlayerState(PLAYING))
        hook.rerender({ ...props, enabled: false })
        await act(async () => late.resolve(42))
        expect(view().phase).toBe('idle')
        expect(events()).not.toContain('work-start')
    })

    it('pressing play in the onramp, then pausing it before the time arrives, stays paused', async () => {
        const { view, player, api } = setup()
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        act(() => api().handlePlayerState(PLAYING))
        act(() => api().pause()) // the newer intent
        expect(view().phase).toBe('onrampPaused')
        await act(async () => late.resolve(42))
        expect(view().phase).toBe('onrampPaused')
        expect(events()).not.toContain('work-start')
    })

    // A decision, not an accident: the resume replaced the pause, so the earlier Play stands.
    it('pressing play in the onramp, then pausing and resuming before the time arrives, starts work', async () => {
        const { view, player, api } = setup()
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        act(() => api().handlePlayerState(PLAYING))
        act(() => api().pause())
        act(() => api().resume())
        expect(view().phase).toBe('onramp')
        await act(async () => late.resolve(42))
        expect(view()).toMatchObject({ phase: 'work', activeIndex: 0 })
    })

    it('pressing play after pausing the onramp still starts work', async () => {
        const { view, api } = setup()
        act(() => api().pause())
        await act(async () => api().handlePlayerState(PLAYING))
        expect(view().phase).toBe('work')
    })

    it('a tick that answers after the user moved to another video does not touch either session', async () => {
        const { view, player, hook, props } = await startWorking()
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        await advance(250) // a tick asks for the time…
        hook.rerender({ ...props, videoId: 'next', enabled: false, durationSec: 0 }) // …the user moves on…
        await act(async () => late.resolve(LEN)) // …then the old block's end arrives
        expect(view().phase).toBe('idle')
        expect(events()).not.toContain('break-start')

        hook.rerender({ ...props, videoId: 'next' }) // the next video starts its own session cleanly
        expect(events('next')).toEqual(['onramp-start'])
    })

    it('a tick that answers after the user paused does not end the block', async () => {
        const { view, player, api } = await startWorking()
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        await advance(250)
        act(() => api().pause()) // under the threshold: the block resets
        await act(async () => late.resolve(LEN))
        expect(view().phase).toBe('workPaused')
        expect(events()).not.toContain('work-complete')
    })

    it('an onramp tick that answers after the watch page closed logs nothing more', async () => {
        const { player, hook } = setup()
        await advance(2750)
        const late = deferred<number>()
        player.getCurrentTime.mockReturnValueOnce(late.promise)
        await advance(250) // the tick that would end the onramp
        hook.unmount()
        await act(async () => late.resolve(0))
        expect(events()).toEqual(['onramp-start', 'interrupted'])
    })
})
