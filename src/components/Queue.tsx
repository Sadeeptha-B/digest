import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { DragHandle, SortableList, useSortableRow } from './Sortable'
import { VideoThumbnail } from './VideoThumbnail'

export function Queue({
    videoIds,
    currentVideoId,
    listId,
}: {
    videoIds: string[]
    currentVideoId: string
    listId: string
}) {
    const reorderVideos = useStore((s) => s.reorderVideos)

    return (
        <SortableList ids={videoIds} onReorder={(ids) => reorderVideos(listId, ids)}>
            <ul className="space-y-1 overflow-y-auto no-scrollbar">
                {videoIds.map((id, i) => (
                    <QueueItem key={id} id={id} index={i} currentVideoId={currentVideoId} listId={listId} />
                ))}
            </ul>
        </SortableList>
    )
}

function QueueItem({
    id,
    index,
    currentVideoId,
    listId,
}: {
    id: string
    index: number
    currentVideoId: string
    listId: string
}) {
    const v = useStore((s) => s.videos[id])
    const watched = useStore((s) => s.progress[id]?.watched)
    const isCurrent = id === currentVideoId
    const { setNodeRef, style, isDragging, handleProps } = useSortableRow(id)

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-1.5 rounded-lg ${isCurrent ? 'bg-accent-600/15 ring-1 ring-accent-600/40' : 'hover:bg-ink-800'} ${isDragging ? 'opacity-50' : ''}`}
        >
            <DragHandle iconClassName="h-3.5 w-3.5" className="px-1 py-2" {...handleProps} />
            <Link
                to={`/watch/${id}?list=${listId}`}
                className="flex min-w-0 flex-1 items-center gap-2 pr-2 py-1.5"
            >
                <VideoThumbnail
                    thumbnailUrl={v?.thumbnailUrl}
                    watched={watched && !isCurrent}
                    className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-ink-800"
                />
                <div className="min-w-0">
                    <p
                        className={`line-clamp-2 text-xs ${isCurrent ? 'font-medium text-white' : 'text-zinc-300'} ${v?.isUnavailable ? 'italic text-zinc-500' : ''}`}
                    >
                        {index + 1}. {v?.title ?? 'Loading…'}
                    </p>
                </div>
            </Link>
        </li>
    )
}
