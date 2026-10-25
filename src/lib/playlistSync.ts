import { getLibraryEpoch, useStore } from '../store/useStore'
import { resolveAuth } from './oauth'
import { fetchAllPlaylistItems, fetchPlaylistMeta, fetchVideo, YouTubeApiError, type Auth } from './youtube'

// In-flight syncs by playlist id, so concurrent callers (e.g. the library's side panel and drawer
// both auto-syncing the same stale playlist) share one fetch instead of spending quota twice.
const inFlight = new Map<string, Promise<void>>()

/**
 * Re-fetch a playlist from YouTube and reconcile it into the stored copy. Refreshes every video's
 * metadata (title/thumbnail) and merges contents via the store's mergePlaylistContents — preserving
 * the user's ordering, local removals, and explicit restores while picking up videos added or
 * deleted upstream.
 *
 * Quota: 1 unit for the meta call + 1 unit per 50 videos. Cheap enough to run on demand.
 */
export function syncPlaylist(playlistId: string, ytPlaylistId: string, auth: Auth): Promise<void> {
    const running = inFlight.get(playlistId)
    if (running) return running
    const sync = runSync(playlistId, ytPlaylistId, auth).finally(() => inFlight.delete(playlistId))
    inFlight.set(playlistId, sync)
    return sync
}

async function runSync(playlistId: string, ytPlaylistId: string, auth: Auth): Promise<void> {
    const epoch = getLibraryEpoch()
    const [meta, videos] = await Promise.all([
        fetchPlaylistMeta(ytPlaylistId, auth),
        fetchAllPlaylistItems(ytPlaylistId, auth),
    ])
    if (epoch !== getLibraryEpoch()) return // the library was cleared meanwhile
    const store = useStore.getState()
    store.upsertVideos(videos)
    store.mergePlaylistContents(playlistId, {
        title: meta.title,
        channelTitle: meta.channelTitle,
        videoIds: videos.map((v) => v.id),
    })
}

/**
 * Best-effort metadata refresh for a just-restored video. The restore itself is local and already
 * applied (restoreVideoToPlaylist) — this only freshens the cached title/thumbnail and, if the
 * video is gone upstream (404: deleted, made private, or removed from the source), flags it
 * unavailable so it renders greyed rather than as a normal entry.
 *
 * All failures are swallowed: a restore must never depend on network/auth, so offline, expired
 * sessions, and missing keys simply leave the cached metadata in place.
 */
export async function refreshRestoredVideo(videoId: string): Promise<void> {
    const epoch = getLibraryEpoch()
    try {
        const auth = await resolveAuth()
        const video = await fetchVideo(videoId, auth)
        if (epoch === getLibraryEpoch()) useStore.getState().upsertVideos([video])
    } catch (err) {
        if (epoch !== getLibraryEpoch()) return // the library was cleared meanwhile
        if (err instanceof YouTubeApiError && err.status === 404) {
            const cached = useStore.getState().videos[videoId]
            useStore.getState().upsertVideos([
                cached
                    ? { ...cached, isUnavailable: true }
                    : { id: videoId, title: 'Unavailable video', channelTitle: '', thumbnailUrl: '', isUnavailable: true },
            ])
        }
        // Other errors (offline / expired session / no key): keep cached metadata; restore stands.
    }
}
