import { http, HttpResponse } from 'msw'
import { server } from './msw'

export interface FakePlaylist {
    title?: string
    channelTitle?: string
    videoIds: string[]
}

/**
 * A minimal fake of the /api/youtube proxy backed by in-memory playlists and videos. Returns call
 * counters so tests can assert on quota use.
 */
export function fakeYouTube(
    playlists: Record<string, FakePlaylist> = {},
    { mine = [] as Array<{ id: string; title: string; itemCount: number }> } = {},
) {
    const calls = { playlists: 0, playlistItems: 0, videos: 0 }
    server.use(
        http.get('/api/youtube/playlists', ({ request }) => {
            calls.playlists++
            const q = new URL(request.url).searchParams
            if (q.get('mine')) {
                return HttpResponse.json({
                    items: mine.map((p) => ({ id: p.id, snippet: { title: p.title, channelTitle: 'Me' }, contentDetails: { itemCount: p.itemCount } })),
                })
            }
            const id = q.get('id') ?? ''
            const p = playlists[id]
            return HttpResponse.json({
                items: p ? [{ id, snippet: { title: p.title ?? `Playlist ${id}`, channelTitle: p.channelTitle ?? 'Owner' } }] : [],
            })
        }),
        http.get('/api/youtube/playlistItems', ({ request }) => {
            calls.playlistItems++
            const id = new URL(request.url).searchParams.get('playlistId') ?? ''
            return HttpResponse.json({
                items: (playlists[id]?.videoIds ?? []).map((v) => ({
                    snippet: {
                        title: `Video ${v}`,
                        videoOwnerChannelTitle: 'Creator',
                        thumbnails: { medium: { url: `https://i.ytimg.com/vi/${v}/mqdefault.jpg` } },
                        resourceId: { videoId: v },
                    },
                })),
            })
        }),
        http.get('/api/youtube/videos', ({ request }) => {
            calls.videos++
            const id = new URL(request.url).searchParams.get('id') ?? ''
            return HttpResponse.json({
                items: [{ id, snippet: { title: `Video ${id}`, channelTitle: 'Creator', thumbnails: {} } }],
            })
        }),
    )
    return calls
}

/** The startup probes App makes, answered as a fresh browser with nothing configured. */
export function startupProbes({ apiKey = false, recall = false } = {}) {
    server.use(
        http.get('/api/key', () => HttpResponse.json({ configured: apiKey })),
        http.get('/api/recall/status', () => HttpResponse.json({ configured: recall })),
    )
}
