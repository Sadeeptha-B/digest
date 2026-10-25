// The onboarding gate (architecture §3): credentials are only needed to import, so the gate shows
// only for a genuinely fresh start — an existing library is always viewable, even offline.
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import * as recall from '../../src/lib/recall'
import * as youtube from '../../src/lib/youtube'
import { imported, store } from '../support/factories'
import { holdGet, server } from '../support/msw'
import { renderAt } from '../support/render'
import { startupProbes } from '../support/youtubeApi'

describe('App gate', () => {
    it('a fresh browser checks for a saved key, then shows onboarding', async () => {
        startupProbes()
        renderAt(<App />)
        expect(screen.getByText('Checking saved access…')).toBeInTheDocument()
        expect(await screen.findByText('Sign in to get started')).toBeInTheDocument()
    })

    it('keeps the user guide reachable from onboarding', async () => {
        startupProbes()
        renderAt(<App />, { route: '/guide' })
        expect(await screen.findByRole('heading', { name: 'How Digest works' })).toBeInTheDocument()
    })

    it('a configured API key goes straight to the (empty) library', async () => {
        startupProbes({ apiKey: true })
        renderAt(<App />)
        expect(await screen.findByText(/No playlists yet/)).toBeInTheDocument()
    })

    it('an existing library is viewable without credentials, even when the server is unreachable', async () => {
        server.use(
            http.get('/api/key', () => HttpResponse.error()),
            http.get('/api/recall/status', () => HttpResponse.error()),
        )
        store().addPlaylist(imported('a', [], { title: 'My course' }))
        renderAt(<App />)
        expect(screen.getByText('My course')).toBeInTheDocument()
        expect(screen.queryByText('Sign in to get started')).not.toBeInTheDocument()
    })

    it('reflects a lost session as signed out', async () => {
        startupProbes()
        server.use(http.post('/auth/refresh', () => HttpResponse.json({ error: 'no_session' }, { status: 401 })))
        store().setHasSignedIn(true)
        store().addPlaylist(imported('a', []))
        renderAt(<App />)
        await vi.waitFor(() => expect(store().hasSignedIn).toBe(false))
    })

    it('restores a session silently and prefills the display name from the channel', async () => {
        startupProbes()
        server.use(
            http.post('/auth/refresh', () => HttpResponse.json({ access_token: 'tok', expires_in: 3600 })),
            http.get('/api/youtube/channels', () => HttpResponse.json({ items: [{ snippet: { title: 'Sam' } }] })),
        )
        store().setHasSignedIn(true)
        renderAt(<App />)
        expect(await screen.findByText('Sam')).toBeInTheDocument()
        expect(store().settings.userName).toBe('Sam')
    })

    // Clear all data resets the store while startup work may still be waiting on the server. Each
    // test waits on the operation's own promise: App's handler runs before this test's await resumes.
    it('a channel name that arrives after the library was cleared is not filled back in', async () => {
        startupProbes()
        server.use(
            http.post('/auth/refresh', () => HttpResponse.json({ access_token: 'tok', expires_in: 3600 })),
            http.get('/api/youtube/channels', () => HttpResponse.json({ items: [{ snippet: { title: 'Sam' } }] })),
        )
        const lookup = vi.spyOn(youtube, 'fetchMyChannelTitle')
        const held = holdGet('/api/youtube/channels')
        store().setHasSignedIn(true)
        renderAt(<App />)
        await held.sent
        store().reset()
        await act(async () => {
            held.release()
            await lookup.mock.results[0].value
        })
        expect(store().settings.userName).toBe('')
    })

    it('a Recall status from before the library was cleared does not offer summaries again', async () => {
        startupProbes({ recall: true })
        const probe = vi.spyOn(recall, 'getRecallStatus')
        const held = holdGet('/api/recall/status')
        store().addPlaylist(imported('a', []))
        renderAt(<App />)
        await held.sent
        store().reset()
        await act(async () => {
            held.release()
            await probe.mock.results[0].value
        })
        expect(store().recallConfigured).toBe(false)
    })

    it('unknown routes fall back to the library', async () => {
        startupProbes({ apiKey: true })
        renderAt(<App />, { route: '/nope' })
        expect(await screen.findByText(/No playlists yet/)).toBeInTheDocument()
        expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
    })
})
