import { useStore } from '../store/useStore'
import { PlaylistVideoList } from './PlaylistVideoList'

/**
 * "Up next" tab on the watch page: the playlist queue with the now-playing video highlighted.
 * Reuses the shared {@link PlaylistVideoList} so reordering behaves identically to the playlist
 * detail view. Fills the panel with its own scroll.
 */
export function UpNextPanel({
    playlistId,
    currentVideoId,
}: {
    playlistId: string
    currentVideoId: string
}) {
    const playlist = useStore((s) => s.playlists.find((p) => p.id === playlistId))

    if (!playlist) {
        return <p className="px-1 text-sm text-zinc-500">No playlist for this video.</p>
    }

    const idx = playlist.videoIds.indexOf(currentVideoId)
    const remaining = idx >= 0 ? playlist.videoIds.length - idx - 1 : playlist.videoIds.length

    return (
        <div className="flex h-full min-h-0 flex-col">
            <p className="mb-2 shrink-0 px-1 text-xs text-zinc-500">
                {remaining > 0 ? `${remaining} more in queue` : 'Last video in queue'} · drag to reorder
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
                <PlaylistVideoList playlistId={playlistId} currentVideoId={currentVideoId} compact />
            </div>
        </div>
    )
}
