import { useStore } from '../store/useStore'
import { fetchAllPlaylistItems, fetchPlaylistMeta, type Auth } from './youtube'

/**
 * Re-fetch a playlist from YouTube and reconcile it into the stored copy. Refreshes every video's
 * metadata (title/thumbnail) and merges contents via the store's mergePlaylistContents — preserving
 * the user's ordering and local removals while picking up videos added or deleted upstream.
 *
 * Quota: 1 unit for the meta call + 1 unit per 50 videos. Cheap enough to run on demand.
 */
export async function syncPlaylist(
    playlistId: string,
    ytPlaylistId: string,
    auth: Auth,
): Promise<void> {
    const [meta, videos] = await Promise.all([
        fetchPlaylistMeta(ytPlaylistId, auth),
        fetchAllPlaylistItems(ytPlaylistId, auth),
    ])
    const store = useStore.getState()
    store.upsertVideos(videos)
    store.mergePlaylistContents(playlistId, {
        title: meta.title,
        channelTitle: meta.channelTitle,
        videoIds: videos.map((v) => v.id),
    })
}
