// The Data API client (src/lib/youtube.ts). Every call goes through the same-origin /api/youtube
// proxy, which adds the credential server-side — so the browser must never put a key in the URL.
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { describe, expect, it } from 'vitest'
import {
    apiErrorFromResponse,
    fetchAllPlaylistItems,
    fetchMyChannelTitle,
    fetchPlaylistMeta,
    fetchVideo,
    listMyPlaylists,
    YouTubeApiError,
} from '../../src/lib/youtube'
import { server } from '../support/msw'

const thumbs = (id: string) => ({
    default: { url: `https://i.ytimg.com/vi/${id}/default.jpg`, width: 120, height: 90 },
    medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, width: 320, height: 180 },
})

const item = (id: string, title = `Video ${id}`, extra: Record<string, unknown> = {}) => ({
    snippet: { title, videoOwnerChannelTitle: 'Owner', thumbnails: thumbs(id), resourceId: { videoId: id }, ...extra },
})

// What each adapter asks for. The proxy forwards the query to Google unchanged, and `part` decides
// which fields come back, so a wrong part breaks against Google even though every fake below would
// still answer in full. Exact, so a stray parameter (an API key in the URL, say) fails too.
describe('the request each adapter makes', () => {
    const playlist = { id: 'PL1', snippet: { title: 'T', channelTitle: 'C' } }
    const cases: Array<[string, string, () => Promise<unknown>, Record<string, string>, JsonBodyType]> = [
        ['fetchPlaylistMeta', 'playlists', () => fetchPlaylistMeta('PL1', {}), { part: 'snippet', id: 'PL1', maxResults: '1' }, { items: [playlist] }],
        ['listMyPlaylists', 'playlists', () => listMyPlaylists({ token: 't' }), { part: 'snippet,contentDetails', mine: 'true', maxResults: '50' }, { items: [playlist] }],
        ['fetchMyChannelTitle', 'channels', () => fetchMyChannelTitle({ token: 't' }), { part: 'snippet', mine: 'true', maxResults: '1' }, { items: [] }],
        ['fetchAllPlaylistItems', 'playlistItems', () => fetchAllPlaylistItems('PL1', {}), { part: 'snippet', playlistId: 'PL1', maxResults: '50' }, { items: [item('a')] }],
        ['fetchVideo', 'videos', () => fetchVideo('v1', {}), { part: 'snippet', id: 'v1', maxResults: '1' }, { items: [{ id: 'v1', snippet: { title: 'T', channelTitle: 'C' } }] }],
    ]

    it.each(cases)('%s → /%s', async (_name, resource, run, expected, body) => {
        const seen: Record<string, string>[] = []
        server.use(
            http.get(`/api/youtube/${resource}`, ({ request }) => {
                seen.push(Object.fromEntries(new URL(request.url).searchParams))
                return HttpResponse.json(body)
            }),
        )
        await run()
        expect(seen).toEqual([expected])
    })
})

describe('fetchAllPlaylistItems', () => {
    it('follows pageToken across pages and keeps playlist order', async () => {
        const seen: URL[] = []
        server.use(
            http.get('/api/youtube/playlistItems', ({ request }) => {
                const url = new URL(request.url)
                seen.push(url)
                return url.searchParams.get('pageToken') === 'p2'
                    ? HttpResponse.json({ items: [item('c')] })
                    : HttpResponse.json({ items: [item('a'), item('b')], nextPageToken: 'p2' })
            }),
        )
        const videos = await fetchAllPlaylistItems('PL1', { token: null })
        expect(videos.map((v) => v.id)).toEqual(['a', 'b', 'c'])
        expect(seen.map((u) => u.searchParams.get('pageToken'))).toEqual([null, 'p2'])
        expect(seen[0].searchParams.get('playlistId')).toBe('PL1')
        expect(seen[0].searchParams.get('maxResults')).toBe('50')
    })

    it('flags deleted/private items unavailable and skips items without a video id', async () => {
        server.use(
            http.get('/api/youtube/playlistItems', () =>
                HttpResponse.json({
                    items: [
                        item('ok'),
                        item('gone', 'Deleted video'),
                        item('hidden', 'Private video'),
                        item('bare', 'Bare', { thumbnails: undefined }),
                        { snippet: { title: 'broken', resourceId: {} } },
                    ],
                }),
            ),
        )
        const videos = await fetchAllPlaylistItems('PL1', {})
        expect(videos.map((v) => [v.id, v.isUnavailable])).toEqual([
            ['ok', false],
            ['gone', true],
            ['hidden', true],
            ['bare', true],
        ])
        expect(videos[0]).toMatchObject({ channelTitle: 'Owner', thumbnailUrl: thumbs('ok').medium.url })
        expect(videos[3].thumbnailUrl).toBe('')
    })
})

describe('credentials', () => {
    it('sends a Bearer token when signed in, and never a key in the URL', async () => {
        let auth: string | null = null
        let url = ''
        server.use(
            http.get('/api/youtube/videos', ({ request }) => {
                auth = request.headers.get('Authorization')
                url = request.url
                return HttpResponse.json({ items: [{ id: 'v', snippet: { title: 'T', channelTitle: 'C', thumbnails: thumbs('v') } }] })
            }),
        )
        await fetchVideo('v', { token: 'ya29.tok' })
        expect(auth).toBe('Bearer ya29.tok')
        expect(new URL(url).searchParams.has('key')).toBe(false)
    })

    it('sends no Authorization header without a token (the proxy falls back to the key cookie)', async () => {
        let auth: string | null = 'unset'
        server.use(
            http.get('/api/youtube/playlists', ({ request }) => {
                auth = request.headers.get('Authorization')
                return HttpResponse.json({ items: [{ id: 'PL1', snippet: { title: 'T', channelTitle: 'C' } }] })
            }),
        )
        await fetchPlaylistMeta('PL1', { token: null })
        expect(auth).toBeNull()
    })
})

describe('single lookups', () => {
    it('fetchPlaylistMeta returns title and channel', async () => {
        server.use(
            http.get('/api/youtube/playlists', () =>
                HttpResponse.json({ items: [{ id: 'PL1', snippet: { title: 'Course', channelTitle: 'Prof' } }] }),
            ),
        )
        expect(await fetchPlaylistMeta('PL1', {})).toEqual({ title: 'Course', channelTitle: 'Prof' })
    })

    it.each([
        ['anonymous', {}, /private \(sign in/],
        ['signed in', { token: 't' }, /^Playlist not found\.$/],
    ])('an empty playlist lookup is a 404 (%s)', async (_label, auth, message) => {
        server.use(http.get('/api/youtube/playlists', () => HttpResponse.json({ items: [] })))
        const err = await fetchPlaylistMeta('PL1', auth).catch((e) => e)
        expect(err).toBeInstanceOf(YouTubeApiError)
        expect(err.status).toBe(404)
        expect(err.message).toMatch(message)
    })

    it('an empty video lookup is a 404', async () => {
        server.use(http.get('/api/youtube/videos', () => HttpResponse.json({ items: [] })))
        await expect(fetchVideo('v', {})).rejects.toMatchObject({ status: 404 })
    })

    it('listMyPlaylists pages through the account and defaults a missing count', async () => {
        server.use(
            http.get('/api/youtube/playlists', ({ request }) => {
                const url = new URL(request.url)
                expect(url.searchParams.get('mine')).toBe('true')
                return url.searchParams.get('pageToken') === 'n'
                    ? HttpResponse.json({ items: [{ id: 'b', snippet: { title: 'B', channelTitle: '' } }] })
                    : HttpResponse.json({
                        items: [{ id: 'a', snippet: { title: 'A', channelTitle: '' }, contentDetails: { itemCount: 7 } }],
                        nextPageToken: 'n',
                    })
            }),
        )
        expect(await listMyPlaylists({ token: 't' })).toEqual([
            { id: 'a', title: 'A', itemCount: 7 },
            { id: 'b', title: 'B', itemCount: 0 },
        ])
    })

    it("fetchMyChannelTitle returns the channel name, or '' when there is none", async () => {
        server.use(http.get('/api/youtube/channels', () => HttpResponse.json({ items: [{ snippet: { title: 'Sam' } }] })))
        expect(await fetchMyChannelTitle({ token: 't' })).toBe('Sam')
        server.use(http.get('/api/youtube/channels', () => HttpResponse.json({})))
        expect(await fetchMyChannelTitle({ token: 't' })).toBe('')
    })
})

describe('errors', () => {
    it("surfaces Google's own error message and status", async () => {
        server.use(
            http.get('/api/youtube/videos', () =>
                HttpResponse.json({ error: { message: 'The request cannot be completed because you have exceeded your quota.' } }, { status: 403 }),
            ),
        )
        await expect(fetchVideo('v', {})).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/quota/) })
    })

    it('falls back to the status line for a non-JSON body', async () => {
        const err = await apiErrorFromResponse(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
        expect(err).toMatchObject({ status: 502, message: '502 Bad Gateway' })
    })
})
