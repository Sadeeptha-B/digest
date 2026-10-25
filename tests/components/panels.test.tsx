// Watch-page side panels: manual transcripts (ADR 0008), Recall summaries (ADR 0009), stats.
import { act, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { YouTubePlayer } from 'react-youtube'
import { SessionStatsPanel } from '../../src/components/SessionStatsPanel'
import { SummaryPanel } from '../../src/components/SummaryPanel'
import { TranscriptPanel } from '../../src/components/TranscriptPanel'
import { deferred } from '../support/deferred'
import { store, video } from '../support/factories'
import { server } from '../support/msw'
import { renderAt } from '../support/render'

const ID = 'dQw4w9WgXcQ'

function fakePlayer() {
    const player = { seekTo: vi.fn(), playVideo: vi.fn(), getCurrentTime: vi.fn(async () => 0) }
    return { player, ref: { current: player as unknown as YouTubePlayer } }
}

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nWelcome to the course\n\n2\n00:01:05,000 --> 00:01:08,000\nToday: recursion\n'

describe('TranscriptPanel', () => {
    function setup() {
        const { player, ref } = fakePlayer()
        const utils = renderAt(<TranscriptPanel video={video(ID)} playerRef={ref} />)
        const fileInput = utils.container.querySelector('input[type="file"]') as HTMLInputElement
        return { ...utils, player, fileInput }
    }

    it('imports an .srt file, keeps it per video, and seeks when a line is clicked', async () => {
        const { user, fileInput, player } = setup()
        await user.upload(fileInput, new File([SRT], 'captions.srt', { type: 'application/x-subrip' }))
        expect(await screen.findByText('Today: recursion')).toBeInTheDocument()
        expect(store().transcripts[ID]).toMatchObject({ status: 'ok', source: 'manual' })

        await user.click(screen.getByText('Today: recursion'))
        expect(player.seekTo).toHaveBeenCalledWith(65, true)
    })

    it('filters lines by search', async () => {
        const { user, fileInput } = setup()
        await user.upload(fileInput, new File([SRT], 'c.srt'))
        await user.type(await screen.findByPlaceholderText('Search transcript…'), 'recur')
        expect(screen.queryByText('Welcome to the course')).not.toBeInTheDocument()
        expect(screen.getByText('Today: recursion')).toBeInTheDocument()
        await user.clear(screen.getByPlaceholderText('Search transcript…'))
        await user.type(screen.getByPlaceholderText('Search transcript…'), 'zzz')
        expect(screen.getByText('No matching lines.')).toBeInTheDocument()
    })

    it('rejects a file with no captions and keeps nothing', async () => {
        const { user, fileInput } = setup()
        await user.upload(fileInput, new File(['just notes'], 'notes.vtt'))
        expect(await screen.findByText(/No captions found in that file/)).toBeInTheDocument()
        expect(store().transcripts[ID]).toBeUndefined()
    })

    it('a file that finishes reading after the library was cleared is not kept', async () => {
        const { user, fileInput, unmount } = setup()
        const late = deferred<string>()
        const file = new File([SRT], 'captions.srt')
        file.text = () => late.promise
        await user.upload(fileInput, file)

        store().reset() // Clear all data; the panel goes with the page
        unmount()
        // The handler awaits this same promise, so it has resumed by the time this await returns.
        await act(async () => {
            late.resolve(SRT)
            await late.promise
        })
        expect(store().transcripts).toEqual({})
    })

    it('Replace drops the stored transcript', async () => {
        const { user, fileInput } = setup()
        await user.upload(fileInput, new File([SRT], 'c.srt'))
        await user.click(await screen.findByRole('button', { name: 'Replace' }))
        expect(store().transcripts[ID]).toBeUndefined()
        expect(screen.getByRole('button', { name: 'Upload .srt / .vtt' })).toBeInTheDocument()
    })
})

describe('SummaryPanel', () => {
    function recall(card: Record<string, unknown> | null, status = 200) {
        server.use(
            http.get('/api/recall/cards', () =>
                status === 200
                    ? HttpResponse.json({ results: card ? [{ id: 'c1', title: 't', source_url: `https://youtu.be/${ID}` }] : [] })
                    : new HttpResponse(null, { status }),
            ),
            http.get('/api/recall/cards/:id', () => HttpResponse.json(card)),
        )
    }

    it('renders the summary with click-to-seek time codes, ignoring ones it cannot parse', async () => {
        recall({ id: 'c1', title: 'Recursion, summarised', chunks: [{ chunk_id: 'a', content: 'Base cases first', timestamps: ['01:23', 'soon'] }] })
        const { player, ref } = fakePlayer()
        const { user } = renderAt(<SummaryPanel video={video(ID)} playerRef={ref} />)
        expect(await screen.findByText('Recursion, summarised')).toBeInTheDocument()
        // The chunk offers one time code: 'soon' can't be parsed, so it gets no seek button.
        expect(within(screen.getByRole('listitem')).getAllByRole('button').map((b) => b.textContent)).toEqual(['1:23'])
        await user.click(screen.getByRole('button', { name: '1:23' }))
        expect(player.seekTo).toHaveBeenCalledWith(83, true)
    })

    it('says when no summary is saved', async () => {
        recall(null)
        renderAt(<SummaryPanel video={video(ID)} playerRef={fakePlayer().ref} />)
        expect(await screen.findByText(/No Recall summary saved for this video/)).toBeInTheDocument()
    })

    it('says when Recall fails', async () => {
        recall(null, 502)
        renderAt(<SummaryPanel video={video(ID)} playerRef={fakePlayer().ref} />)
        expect(await screen.findByText(/Couldn’t load the summary/)).toBeInTheDocument()
    })
})

describe('SessionStatsPanel', () => {
    it('explains itself before any session, then shows the figures', () => {
        const { unmount } = renderAt(<SessionStatsPanel video={video(ID)} />)
        expect(screen.getByText(/No focus session yet/)).toBeInTheDocument()
        unmount()

        store().logPomodoroEvent(ID, { type: 'work-start', at: 0 })
        store().logPomodoroEvent(ID, { type: 'work-complete', at: 1_500_000, stretchSec: 1500 })
        renderAt(<SessionStatsPanel video={video(ID)} />)
        expect(screen.getByText('Total focused').previousSibling).toHaveTextContent('25:00')
        expect(screen.getByText('Blocks completed').previousSibling).toHaveTextContent('1')
    })

    it('lists a session that stopped early as such, with nothing left in progress', () => {
        store().logPomodoroEvent(ID, { type: 'work-start', at: 0 })
        store().logPomodoroEvent(ID, { type: 'interrupted', at: 600_000, stretchSec: 600 })
        renderAt(<SessionStatsPanel video={video(ID)} />)
        expect(screen.getByText('Stopped early')).toBeInTheDocument()
        expect(screen.queryByText('In progress')).not.toBeInTheDocument()
        expect(screen.queryByText('Completed block')).not.toBeInTheDocument()
    })
})
