import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { CheckIcon, PlayIcon, TrashIcon } from './Icons'
import { DragHandle, SortableList } from './Sortable'
import { VideoThumbnail } from './VideoThumbnail'
import { useSortableRow } from './useSortableRow'

/**
 * Drag-to-reorder list of a playlist's videos. The single shared surface behind both the
 * playlist detail view and the watch page's "Up next" panel, so reordering behaves identically
 * in both places. Pass `currentVideoId` to flag the now-playing row; `compact` shrinks the rows
 * for the narrow watch-page sidebar.
 */
export function PlaylistVideoList({
    playlistId,
    currentVideoId,
    compact = false,
}: {
    playlistId: string
    currentVideoId?: string
    compact?: boolean
}) {
    const playlist = useStore((s) => s.playlists.find((p) => p.id === playlistId))
    const reorderVideos = useStore((s) => s.reorderVideos)

    if (!playlist) return null

    return (
        <SortableList ids={playlist.videoIds} onReorder={(ids) => reorderVideos(playlist.id, ids)}>
            <ul className="space-y-1.5">
                {playlist.videoIds.map((videoId, i) => (
                    <VideoRow
                        key={videoId}
                        videoId={videoId}
                        index={i}
                        playlistId={playlist.id}
                        current={videoId === currentVideoId}
                        compact={compact}
                    />
                ))}
            </ul>
        </SortableList>
    )
}

function VideoRow({
    videoId,
    index,
    playlistId,
    current = false,
    compact = false,
}: {
    videoId: string
    index: number
    playlistId: string
    current?: boolean
    compact?: boolean
}) {
    const video = useStore((s) => s.videos[videoId])
    const watched = useStore((s) => s.progress[videoId]?.watched ?? false)
    const setWatched = useStore((s) => s.setWatched)
    const removeVideoFromPlaylist = useStore((s) => s.removeVideoFromPlaylist)
    const { setNodeRef, style, isDragging, handleProps } = useSortableRow(videoId)

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 rounded-lg border p-2 ${current
                ? 'border-accent-600/40 bg-accent-600/10'
                : 'border-transparent bg-ink-850 hover:border-ink-700'
                } ${isDragging ? 'opacity-60' : ''}`}
        >
            <DragHandle iconClassName="h-4 w-4" {...handleProps} />

            <Link
                to={`/watch/${videoId}?list=${playlistId}`}
                className="flex min-w-0 flex-1 items-center gap-3"
            >
                <VideoThumbnail
                    thumbnailUrl={video?.thumbnailUrl}
                    watched={watched}
                    className={`relative aspect-video shrink-0 overflow-hidden rounded bg-ink-800 ${compact ? 'w-20' : 'w-28'
                        }`}
                    checkClassName={compact ? 'h-5 w-5' : 'h-6 w-6'}
                />
                <div className="min-w-0">
                    {current && (
                        <p className="mb-0.5 flex items-center gap-1 text-xs font-medium text-accent-400">
                            <PlayIcon className="h-3 w-3" /> Now playing
                        </p>
                    )}
                    <p
                        className={`line-clamp-2 text-sm ${video?.isUnavailable ? 'italic text-zinc-500' : 'text-zinc-100'
                            }`}
                    >
                        {index + 1}. {video?.title ?? 'Loading…'}
                    </p>
                    {video?.channelTitle && (
                        <p className="truncate text-xs text-zinc-500">{video.channelTitle}</p>
                    )}
                </div>
            </Link>

            <button
                onClick={() => setWatched(videoId, !watched)}
                className={`rounded-lg p-2 hover:bg-ink-800 ${watched
                        ? 'text-accent-400 hover:text-accent-300'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                aria-pressed={watched}
                aria-label={watched ? 'Mark as not watched' : 'Mark as watched'}
                title={watched ? 'Mark as not watched' : 'Mark as watched'}
            >
                <CheckIcon className="h-4 w-4" />
            </button>

            <button
                onClick={() => removeVideoFromPlaylist(playlistId, videoId)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-ink-800 hover:text-rose-400"
                aria-label="Remove video"
            >
                <TrashIcon className="h-4 w-4" />
            </button>
        </li>
    )
}
