import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { CloseIcon, PlayIcon, TrashIcon } from './Icons'
import { DragHandle, SortableList, useSortableRow } from './Sortable'
import { VideoThumbnail } from './VideoThumbnail'

export function PlaylistContents({
    playlistId,
    onClose,
}: {
    playlistId: string
    onClose?: () => void
}) {
    const playlist = useStore((s) => s.playlists.find((p) => p.id === playlistId))
    const progress = useStore((s) => s.progress)
    const reorderVideos = useStore((s) => s.reorderVideos)
    const navigate = useNavigate()

    if (!playlist) {
        return <p className="text-sm text-zinc-500">Playlist not found.</p>
    }

    const first = playlist.videoIds[0]
    const total = playlist.videoIds.length
    const watched = playlist.videoIds.filter((id) => progress[id]?.watched).length

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-white">{playlist.title}</h2>
                    <p className="truncate text-xs text-zinc-500">
                        {playlist.channelTitle ? `${playlist.channelTitle} · ` : ''}
                        {watched}/{total} watched
                    </p>
                </div>
                {first && (
                    <button
                        onClick={() => navigate(`/watch/${first}?list=${playlist.id}`)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500"
                    >
                        <PlayIcon className="h-4 w-4" /> Play all
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white"
                        aria-label="Close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                )}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <SortableList
                    ids={playlist.videoIds}
                    onReorder={(ids) => reorderVideos(playlist.id, ids)}
                >
                    <ul className="space-y-1.5">
                        {playlist.videoIds.map((videoId, i) => (
                            <VideoRow key={videoId} videoId={videoId} index={i} playlistId={playlist.id} />
                        ))}
                    </ul>
                </SortableList>
            </div>
        </div>
    )
}

function VideoRow({
    videoId,
    index,
    playlistId,
}: {
    videoId: string
    index: number
    playlistId: string
}) {
    const video = useStore((s) => s.videos[videoId])
    const watched = useStore((s) => s.progress[videoId]?.watched ?? false)
    const removeVideoFromPlaylist = useStore((s) => s.removeVideoFromPlaylist)
    const { setNodeRef, style, isDragging, handleProps } = useSortableRow(videoId)

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 rounded-lg border border-transparent bg-ink-850 p-2 hover:border-ink-700 ${isDragging ? 'opacity-60' : ''
                }`}
        >
            <DragHandle iconClassName="h-4 w-4" {...handleProps} />

            <Link
                to={`/watch/${videoId}?list=${playlistId}`}
                className="flex min-w-0 flex-1 items-center gap-3"
            >
                <VideoThumbnail
                    thumbnailUrl={video?.thumbnailUrl}
                    watched={watched}
                    className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-ink-800"
                    checkClassName="h-6 w-6"
                />
                <div className="min-w-0">
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
                onClick={() => removeVideoFromPlaylist(playlistId, videoId)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-ink-800 hover:text-rose-400"
                aria-label="Remove video"
            >
                <TrashIcon className="h-4 w-4" />
            </button>
        </li>
    )
}
