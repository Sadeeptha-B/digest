// Sync and restore against the network (src/lib/playlistSync.ts, ADR 0006).
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { refreshRestoredVideo, syncPlaylist } from '../../src/lib/playlistSync'
import { holdGet, server } from '../support/msw'
import { imported, playlist, store, video } from '../support/factories'

function upstream(videoIds: string[], title = 'Upstream title') {
    const calls = { meta: 0, items: 0 }
    server.use(
        http.get('/api/youtube/playlists', () => {
            calls.meta++
            return HttpResponse.json({ items: [{ id: 'PLa', snippet: { title, channelTitle: 'Owner' } }] })
        }),
        http.get('/api/youtube/playlistItems', () => {
            calls.items++
            return HttpResponse.json({
                items: videoIds.map((id) => ({
                    snippet: { title: `Fresh ${id}`, thumbnails: { medium: { url: `u/${id}` } }, resourceId: { videoId: id } },
                })),
            })
        }),
    )
    return calls
}

describe('syncPlaylist', () => {
    it('refreshes metadata and merges contents into the local copy', async () => {
        store().addPlaylist(imported('a', ['v2', 'v1']))
        store().upsertVideos([video('v1', { title: 'Stale' })])
        upstream(['v1', 'v2', 'v3'])
        await syncPlaylist('a', 'PLa', { token: null })
        expect(playlist('a')).toMatchObject({ title: 'Upstream title', videoIds: ['v2', 'v1', 'v3'] })
        expect(store().videos.v1.title).toBe('Fresh v1')
    })

    it('shares one in-flight sync between concurrent callers', async () => {
        store().addPlaylist(imported('a', []))
        const calls = upstream(['v1'])
        await Promise.all([syncPlaylist('a', 'PLa', {}), syncPlaylist('a', 'PLa', {})])
        expect(calls).toEqual({ meta: 1, items: 1 })
        // ...and a later sync runs again.
        await syncPlaylist('a', 'PLa', {})
        expect(calls).toEqual({ meta: 2, items: 2 })
    })

    it('lets a failed sync be retried', async () => {
        store().addPlaylist(imported('a', []))
        server.use(http.get('/api/youtube/*', () => new HttpResponse(null, { status: 500 })))
        await expect(syncPlaylist('a', 'PLa', {})).rejects.toBeDefined()
        upstream(['v1'])
        await syncPlaylist('a', 'PLa', {})
        expect(playlist('a').videoIds).toEqual(['v1'])
    })
})

describe('refreshRestoredVideo', () => {
    const videosApi = (resolver: Parameters<typeof http.get>[1]) => server.use(http.get('/api/youtube/videos', resolver))

    it('freshens the cached metadata', async () => {
        store().upsertVideos([video('v1', { title: 'Old' })])
        videosApi(() => HttpResponse.json({ items: [{ id: 'v1', snippet: { title: 'New', channelTitle: 'C' } }] }))
        await refreshRestoredVideo('v1')
        expect(store().videos.v1).toMatchObject({ title: 'New', isUnavailable: false })
    })

    it('flags a video that is gone upstream as unavailable, keeping its cached metadata', async () => {
        store().upsertVideos([video('v1', { title: 'Cached' })])
        videosApi(() => HttpResponse.json({ items: [] }))
        await refreshRestoredVideo('v1')
        expect(store().videos.v1).toMatchObject({ title: 'Cached', isUnavailable: true })
    })

    it('adds a placeholder when there was no cached entry', async () => {
        videosApi(() => HttpResponse.json({ items: [] }))
        await refreshRestoredVideo('v9')
        expect(store().videos.v9).toMatchObject({ title: 'Unavailable video', isUnavailable: true })
    })

    it.each([
        ['offline', () => HttpResponse.error()],
        ['quota/403', () => HttpResponse.json({ error: { message: 'quota' } }, { status: 403 })],
    ])('swallows other failures (%s) and leaves the cache alone', async (_label, resolver) => {
        const cached = video('v1')
        store().upsertVideos([cached])
        videosApi(resolver)
        await expect(refreshRestoredVideo('v1')).resolves.toBeUndefined()
        expect(store().videos.v1).toEqual(cached)
    })

    it('swallows an expired session with no key (the restore still stands)', async () => {
        store().setHasSignedIn(true)
        store().upsertVideos([video('v1')])
        server.use(http.post('/auth/refresh', () => HttpResponse.json({}, { status: 401 })))
        await expect(refreshRestoredVideo('v1')).resolves.toBeUndefined()
    })
})

// Clear all data resets the store while a background sync or refresh may still be waiting on YouTube.
describe('after the library is cleared', () => {
    it('a sync that answers after the reset caches nothing', async () => {
        store().addPlaylist(imported('a', ['v1']))
        upstream(['v1', 'v2'])
        const held = holdGet('/api/youtube/playlistItems')
        const sync = syncPlaylist('a', 'PLa', {})
        await held.sent
        store().reset()
        held.release()
        await sync
        expect({ playlists: store().playlists, videos: store().videos }).toEqual({ playlists: [], videos: {} })
    })

    it.each([
        ['found', () => HttpResponse.json({ items: [{ id: 'v1', snippet: { title: 'Fresh', channelTitle: 'C' } }] })],
        ['gone upstream', () => HttpResponse.json({ items: [] })],
    ])('a restored-video refresh that answers after the reset (%s) caches nothing', async (_label, resolver) => {
        server.use(http.get('/api/youtube/videos', resolver))
        const held = holdGet('/api/youtube/videos')
        const refresh = refreshRestoredVideo('v1')
        await held.sent
        store().reset()
        held.release()
        await refresh
        expect(store().videos).toEqual({})
    })
})
