// Adding to the library (AddBar): importing a playlist, or saving a single video into a user-made
// list (ADR 0011 — never into an imported playlist).
import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AddBar } from '../../src/components/AddBar'
import { REAUTH_MESSAGE } from '../../src/lib/oauth'
import { INBOX_LIST_ID } from '../../src/types'
import { imported, playlist, store } from '../support/factories'
import { holdGet, server } from '../support/msw'
import { renderAt } from '../support/render'
import { fakeYouTube } from '../support/youtubeApi'

const VIDEO = 'https://youtu.be/dQw4w9WgXcQ'
const VID = 'dQw4w9WgXcQ'

function setup() {
    const utils = renderAt(<AddBar />)
    const input = screen.getByPlaceholderText(/Paste a YouTube playlist or video URL/)
    const add = screen.getByRole('button', { name: 'Add' })
    return { ...utils, input, add }
}

describe('AddBar', () => {
    it('imports a playlist from its URL', async () => {
        fakeYouTube({ PLcourse12345: { title: 'Course', videoIds: ['a', 'b'] } })
        const { user, input, add } = setup()
        await user.type(input, 'https://www.youtube.com/playlist?list=PLcourse12345')
        await user.click(add)
        await vi.waitFor(() => expect(store().playlists).toHaveLength(1))
        expect(store().playlists[0]).toMatchObject({ ytPlaylistId: 'PLcourse12345', title: 'Course', videoIds: ['a', 'b'] })
        expect(store().videos.a.title).toBe('Video a')
        expect(input).toHaveValue('')
    })

    it('rejects input that is not a playlist or video', async () => {
        const { user, input, add } = setup()
        await user.type(input, 'hello there')
        await user.click(add)
        expect(screen.getByText('Could not find a playlist or video in that input.')).toBeInTheDocument()
    })

    it('offers the Inbox first and only user-made lists as save targets', async () => {
        store().addPlaylist(imported('yt', [], { title: 'Imported course' }))
        const mine = store().createList('Later')
        const { user, input } = setup()
        await user.type(input, VIDEO)
        const select = screen.getByLabelText('Save to')
        const options = within(select).getAllByRole('option').map((o) => [o.getAttribute('value'), o.textContent])
        expect(options).toEqual([
            [INBOX_LIST_ID, 'Inbox'],
            [mine, 'Later'],
            ['__new__', '+ New list…'],
        ])
    })

    it('saves a video to the Inbox, creating it on first use', async () => {
        fakeYouTube()
        const { user, input, add } = setup()
        await user.type(input, VIDEO)
        await user.click(add)
        expect(await screen.findByText('Saved to “Inbox”.')).toBeInTheDocument()
        expect(playlist(INBOX_LIST_ID).videoIds).toEqual([VID])
    })

    it('needs a name for a new list, and creates it only once the video is fetched', async () => {
        server.use(http.get('/api/youtube/videos', () => HttpResponse.json({ items: [] })))
        const { user, input, add } = setup()
        await user.type(input, VIDEO)
        await user.selectOptions(screen.getByLabelText('Save to'), '__new__')
        expect(add).toBeDisabled()
        await user.type(screen.getByLabelText('New list name'), 'Watch later')
        await user.click(add)
        expect(await screen.findByText(/Video not found/)).toBeInTheDocument()
        expect(store().playlists).toEqual([]) // a failed fetch leaves no empty list behind

        fakeYouTube()
        await user.click(add)
        expect(await screen.findByText('Saved to “Watch later”.')).toBeInTheDocument()
        const created = store().playlists.find((p) => p.title === 'Watch later')!
        expect(created.videoIds).toEqual([VID])
        // The new list becomes the remembered target for the next video.
        await user.type(input, 'https://youtu.be/abcdefghijk')
        expect(screen.getByLabelText('Save to')).toHaveValue(created.id)
    })

    it('explains a 403 as a key restriction problem', async () => {
        server.use(http.get('/api/youtube/videos', () => HttpResponse.json({ error: { message: 'forbidden' } }, { status: 403 })))
        const { user, input, add } = setup()
        await user.type(input, VIDEO)
        await user.click(add)
        expect(await screen.findByText(/Request rejected \(403\)/)).toBeInTheDocument()
    })

    it('asks to sign in again when the session expired and there is no key', async () => {
        store().setHasSignedIn(true)
        server.use(http.post('/auth/refresh', () => HttpResponse.json({}, { status: 401 })))
        const { user, input, add } = setup()
        await user.type(input, VIDEO)
        await user.click(add)
        expect(await screen.findByText(REAUTH_MESSAGE)).toBeInTheDocument()
    })

    it("imports from the signed-in user's channel, disabling playlists already in the library", async () => {
        store().setAccessToken({ value: 'tok', expiresAt: Date.now() + 3_600_000 })
        store().setHasSignedIn(true)
        store().addPlaylist(imported('have', [], { ytPlaylistId: 'PLhave' }))
        fakeYouTube(
            { PLnew: { title: 'New one', videoIds: ['x'] } },
            { mine: [{ id: 'PLhave', title: 'Have it', itemCount: 3 }, { id: 'PLnew', title: 'New one', itemCount: 1 }] },
        )
        const { user } = setup()
        await user.click(screen.getByRole('button', { name: 'Import from my channel' }))
        const have = await screen.findByRole('button', { name: /Have it/ })
        expect(have).toBeDisabled()
        await user.click(screen.getByRole('button', { name: /New one/ }))
        await user.click(screen.getByRole('button', { name: 'Import 1' }))
        await vi.waitFor(() => expect(store().playlists.map((p) => p.ytPlaylistId)).toEqual(['PLhave', 'PLnew']))
    })
})

// Clear all data (Settings) resets the store while an add may still be waiting on YouTube. The answer
// must not put anything back: the user just emptied the library.
describe('an add still in flight when the library is cleared', () => {
    it.each([
        ['a playlist import', 'https://www.youtube.com/playlist?list=PLcourse12345', '/api/youtube/playlistItems'],
        ['a single-video save', VIDEO, '/api/youtube/videos'],
    ])('%s that answers after the reset adds nothing back', async (_label, url, heldPath) => {
        fakeYouTube({ PLcourse12345: { title: 'Course', videoIds: ['a', 'b'] } })
        const held = holdGet(heldPath)
        const { user, input, add } = setup()
        await user.type(input, url)
        await user.click(add)
        await held.sent

        store().reset()
        held.release()
        await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()) // settled
        expect({ playlists: store().playlists, videos: store().videos }).toEqual({ playlists: [], videos: {} })

        // Only the stale answer is dropped: the same add, started after the reset, lands.
        await user.clear(input)
        await user.type(input, url)
        await user.click(add)
        await vi.waitFor(() => expect(store().playlists).toHaveLength(1))
        expect(Object.keys(store().videos).length).toBeGreaterThan(0)
    })

    it('a channel import stops before the next playlist once the library is cleared', async () => {
        store().setAccessToken({ value: 'tok', expiresAt: Date.now() + 3_600_000 })
        store().setHasSignedIn(true)
        fakeYouTube(
            { PLone: { title: 'One', videoIds: ['a'] }, PLtwo: { title: 'Two', videoIds: ['b'] } },
            { mine: [{ id: 'PLone', title: 'One', itemCount: 1 }, { id: 'PLtwo', title: 'Two', itemCount: 1 }] },
        )
        const { user } = setup()
        await user.click(screen.getByRole('button', { name: 'Import from my channel' }))
        await user.click(await screen.findByRole('button', { name: /One/ }))
        await user.click(screen.getByRole('button', { name: /Two/ }))

        const held = holdGet('/api/youtube/playlistItems')
        const asked: string[] = [] // every playlist the import asks YouTube about
        server.use(
            http.get('/api/youtube/:resource', ({ request }) => {
                const q = new URL(request.url).searchParams
                asked.push(q.get('playlistId') ?? q.get('id') ?? '')
            }),
        )
        await user.click(screen.getByRole('button', { name: 'Import 2' }))
        await held.sent // the first playlist's items are on their way
        store().reset()
        held.release()
        await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()) // settled

        expect(store().playlists).toEqual([])
        expect(asked).not.toContain('PLtwo')
        expect(asked).toContain('PLone')
    })
})
