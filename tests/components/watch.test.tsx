// The watch page: resume, the distraction-free queue (advance on ENDED before YouTube's end screen),
// focus mode (ADR 0010) and the side tabs. react-youtube is replaced by a fake player.
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Watch } from '../../src/pages/Watch'
import { deferred } from '../support/deferred'
import { imported, store, video } from '../support/factories'
import { server } from '../support/msw'
import { renderAt } from '../support/render'

const harness = vi.hoisted(() => ({
    props: null as null | Record<string, (e: unknown) => unknown>,
    player: null as null | ReturnType<typeof makePlayer>,
    /** When set, a newly mounted player isn't ready until the test calls `pendingReady`. */
    holdReady: false,
    pendingReady: null as null | (() => void),
}))

function makePlayer() {
    const p = {
        duration: 10 * 60,
        time: 0,
        state: -1,
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        getDuration: vi.fn(async () => p.duration),
        getCurrentTime: vi.fn(async () => p.time),
        getPlayerState: vi.fn(async () => p.state),
    }
    return p
}

vi.mock('react-youtube', async () => {
    const React = await import('react')
    function FakeYouTube(props: Record<string, (e: unknown) => unknown> & { videoId: string }) {
        harness.props = props
        // Mount-only, like the real player: Watch remounts it per video (key={videoId}).
        React.useEffect(() => {
            const target = harness.player
            const ready = () => void props.onReady({ target })
            if (harness.holdReady) harness.pendingReady = ready
            else ready()
        }, [])
        return React.createElement('div', { 'data-testid': 'player', 'data-video': props.videoId })
    }
    return { default: FakeYouTube }
})

const ENDED = 0
const PLAYING = 1

/** Let the fake player's onReady run to completion: the resume seek and the duration read. */
const playerReady = () => act(async () => {})

async function playerState(data: number) {
    await act(async () => {
        await harness.props!.onStateChange({ data, target: harness.player })
    })
}

function watch(videoId: string, listId = 'a') {
    return renderAt(<Watch />, { route: `/watch/${videoId}?list=${listId}`, path: '/watch/:videoId' })
}

beforeEach(() => {
    harness.player = makePlayer()
    harness.holdReady = false
    harness.pendingReady = null
    store().addPlaylist(imported('a', ['v1', 'v2', 'v3'], { title: 'Course' }))
    store().upsertVideos(['v1', 'v2', 'v3', 'solo'].map((id) => video(id)))
})

describe('resume', () => {
    it('seeks to where an unfinished video was left', async () => {
        store().setPosition('v1', 120)
        watch('v1')
        await vi.waitFor(() => expect(harness.player!.seekTo).toHaveBeenCalledWith(120, true))
    })

    it.each([
        ['already watched', () => (store().setPosition('v1', 120), store().setWatched('v1', true))],
        ['barely started', () => store().setPosition('v1', 4)],
    ])('starts from the top when %s', async (_label, arrange) => {
        arrange()
        watch('v1')
        await screen.findByTestId('player')
        await playerReady()
        expect(harness.player!.seekTo).not.toHaveBeenCalled()
    })

    it('saves the playback position every 5 seconds while playing', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        watch('v1')
        harness.player!.state = PLAYING
        harness.player!.time = 42.7
        await act(() => vi.advanceTimersByTimeAsync(5000))
        expect(store().progress.v1.lastPositionSec).toBe(42)
    })

    it('never saves one video’s position as another’s when the player answers after a change of video', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        store().setPosition('v1', 30)
        const { user } = watch('v1')
        const late = deferred<number>()
        harness.player!.state = PLAYING
        harness.player!.getCurrentTime.mockReturnValueOnce(late.promise)
        await act(() => vi.advanceTimersByTimeAsync(5000)) // the save asks v1's player for its time…

        harness.player = makePlayer() // (v2 gets a player of its own)
        await user.click(screen.getByRole('button', { name: 'Next ›' })) // …and the user moves on first
        await act(async () => late.resolve(123))

        expect(store().progress.v2?.lastPositionSec).toBeUndefined()
        expect(store().progress.v1.lastPositionSec).toBe(30)
    })

    it('saves nothing when the player answers after the library was cleared', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        watch('v1')
        const late = deferred<number>()
        harness.player!.state = PLAYING
        harness.player!.getCurrentTime.mockReturnValueOnce(late.promise)
        await act(() => vi.advanceTimersByTimeAsync(5000))
        act(() => store().reset()) // Clear all data
        await act(async () => late.resolve(123))
        expect(store().progress).toEqual({})
    })
})

// The player's duration decides whether a video gets a Pomodoro. A duration that answers late belongs
// to the player that was asked, not to whichever video is showing by then.
describe('a late duration', () => {
    const LONG = 60 * 60
    const SHORT = 10 * 60

    it('from the previous video’s onReady does not give the next video a Pomodoro', async () => {
        const late = deferred<number>()
        harness.player!.getDuration.mockReturnValueOnce(late.promise)
        const { user } = watch('v1')
        await playerReady()

        harness.player = makePlayer() // v2: a short video
        harness.player.duration = SHORT
        await user.click(screen.getByRole('button', { name: 'Next ›' }))
        await playerReady()
        await act(async () => late.resolve(LONG))
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
    })

    // Until the next video's player is ready, the player ref still holds the previous one. The player
    // check alone would pass here; only the check that the player belongs to the video showing stops it.
    it('from the previous video, landing before the next one’s player is ready, does not give it a Pomodoro', async () => {
        const late = deferred<number>()
        harness.player!.getDuration.mockReturnValueOnce(late.promise)
        const { user } = watch('v1')
        await playerReady()

        harness.player = makePlayer()
        harness.player.duration = SHORT
        harness.holdReady = true
        await user.click(screen.getByRole('button', { name: 'Next ›' }))
        expect(harness.pendingReady).not.toBeNull() // v2 is showing; its player isn't ready
        await act(async () => {
            late.resolve(LONG)
            await late.promise // onReady awaits this same promise, so it has resumed by now
        })
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()

        await act(async () => harness.pendingReady!()) // v2's own (short) duration still applies
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
        expect(harness.player.getDuration).toHaveBeenCalled()
    })

    it('from the previous video’s first PLAYING does not give the next video a Pomodoro', async () => {
        const first = harness.player!
        first.getDuration.mockResolvedValueOnce(0) // not known at onReady; PLAYING asks again
        const { user } = watch('v1')
        await playerReady()
        const late = deferred<number>()
        first.getDuration.mockReturnValueOnce(late.promise)
        // v1 starts playing; its handler waits on the duration (no state changes until it answers).
        const playing = harness.props!.onStateChange({ data: PLAYING, target: first })

        harness.player = makePlayer()
        harness.player.duration = SHORT
        await user.click(screen.getByRole('button', { name: 'Next ›' }))
        await playerReady()
        await act(async () => {
            late.resolve(LONG)
            await playing
        })
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
    })
})

describe('the queue', () => {
    it('marks a finished video watched and advances immediately', async () => {
        store().setPosition('v1', 300)
        watch('v1')
        await playerState(ENDED)
        expect(store().progress.v1).toMatchObject({ watched: true, lastPositionSec: 0 })
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v2?list=a')
        expect(screen.getByTestId('player')).toHaveAttribute('data-video', 'v2')
    })

    // Today's behaviour. What the end of the queue should do is still open: docs/roadmap/playback-queue.md.
    it('stays put after the last video in the list', async () => {
        watch('v3')
        await playerState(ENDED)
        expect(store().progress.v3.watched).toBe(true)
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v3?list=a')
        expect(screen.queryByRole('button', { name: 'Next ›' })).not.toBeInTheDocument()
    })

    it('Next skips ahead without marking the current video watched', async () => {
        const { user } = watch('v1')
        await user.click(screen.getByRole('button', { name: 'Next ›' }))
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v2?list=a')
        expect(store().progress.v1?.watched).toBeFalsy()
    })

    it('toggles watched by hand', async () => {
        const { user } = watch('v1')
        await user.click(screen.getByRole('button', { name: 'Mark watched' }))
        expect(store().progress.v1.watched).toBe(true)
        expect(screen.getByRole('button', { name: /Watched/ })).toHaveAttribute('aria-pressed', 'true')
    })

    it('explains a video that is not in the library', () => {
        renderAt(<Watch />, { route: '/watch/unknown', path: '/watch/:videoId' })
        expect(screen.getByText(/Video not loaded/)).toBeInTheDocument()
    })
})

describe('focus mode (ADR 0010)', () => {
    it('shows the Pomodoro timeline and focus widgets on a long video, and one switch hides both', async () => {
        harness.player!.duration = 30 * 60
        const { user } = watch('v1')
        expect(await screen.findByText('Get ready')).toBeInTheDocument() // the Pomodoro onramp
        expect(screen.getByText('Brain dump')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: /Focus on/ }))
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
        expect(screen.queryByText('Brain dump')).not.toBeInTheDocument()
        expect(store().settings.focusMode).toBe(false)
        expect(screen.getByRole('button', { name: /Focus off/ })).toHaveAttribute('aria-pressed', 'false')
    })

    it('hands a finished focus session to the queue: offramp first, then exactly one advance', async () => {
        vi.useFakeTimers()
        harness.player!.duration = 30 * 60
        watch('v1')
        await playerReady() // the duration is known, so the session starts
        expect(screen.getByText('Get ready')).toBeInTheDocument()
        await act(() => vi.advanceTimersByTimeAsync(3000)) // onramp → first block

        await playerState(ENDED)
        // The offramp holds the advance for 3s, so the video isn't marked or left yet.
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v1?list=a')
        await act(() => vi.advanceTimersByTimeAsync(2000))
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v1?list=a')
        expect(store().progress.v1?.watched).toBeFalsy()

        await act(() => vi.advanceTimersByTimeAsync(1500))
        expect(store().progress.v1.watched).toBe(true)
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v2?list=a')
        expect(store().pomodoroSessions.v1.map((e) => e.type)).toEqual([
            'onramp-start',
            'work-start',
            'work-complete',
            'offramp',
            'done',
        ])

        // The next video gets its own fresh session, and nothing advances again on its own.
        await act(() => vi.advanceTimersByTimeAsync(10_000))
        expect(screen.getByTestId('location')).toHaveTextContent('/watch/v2?list=a')
        expect(store().progress.v2?.watched).toBeFalsy()
        expect(store().pomodoroSessions.v2?.[0]?.type).toBe('onramp-start')
        expect(store().pomodoroSessions.v1.filter((e) => e.type === 'done')).toHaveLength(1)
    })

    it('shows no Pomodoro on a short video, but keeps the focus widgets', async () => {
        harness.player!.duration = 10 * 60
        watch('v1')
        expect(await screen.findByText('Brain dump')).toBeInTheDocument()
        await playerReady()
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
    })

    it('a focus-mode-off user never sees the Pomodoro, even on a long video', async () => {
        store().setFocusMode(false)
        harness.player!.duration = 60 * 60
        watch('v1')
        await screen.findByTestId('player')
        await playerReady()
        expect(screen.queryByText('Get ready')).not.toBeInTheDocument()
        expect(screen.queryByText('Brain dump')).not.toBeInTheDocument()
    })
})

describe('side tabs', () => {
    const tabs = () => screen.getAllByRole('button').map((b) => b.textContent)

    it('offers Up next only inside a list with something to queue, and Summary only with a Recall key', () => {
        store().createList('Single')
        const single = store().playlists.find((p) => p.title === 'Single')!
        store().addVideoToList(video('solo'), single.id)
        const { unmount } = watch('solo', single.id)
        expect(tabs()).not.toContain('Up next')
        expect(tabs()).not.toContain('Summary')
        unmount()

        store().setRecallConfigured(true)
        watch('v1')
        expect(tabs()).toEqual(expect.arrayContaining(['Up next', 'Transcript', 'Summary', 'Stats']))
    })

    it('loads the Recall summary into its tab', async () => {
        store().setRecallConfigured(true)
        server.use(
            http.get('/api/recall/cards', () => HttpResponse.json({ results: [{ id: 'c', title: 'T', source_url: 'https://youtu.be/v1' }] })),
            http.get('/api/recall/cards/:id', () => HttpResponse.json({ id: 'c', title: 'Card title', chunks: [] })),
        )
        const { user } = watch('v1')
        await user.click(screen.getByRole('button', { name: 'Summary' }))
        expect(await screen.findByText('Card title')).toBeInTheDocument()
    })
})
