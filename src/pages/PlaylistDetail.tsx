import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { BackIcon, CheckIcon, GripIcon, PlayIcon, TrashIcon } from '../components/Icons'

export function PlaylistDetail() {
  const { playlistId = '' } = useParams()
  const navigate = useNavigate()
  const playlist = useStore((s) => s.playlists.find((p) => p.id === playlistId))
  const reorderVideos = useStore((s) => s.reorderVideos)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!playlist) {
    return (
      <div className="mx-auto max-w-3xl text-center text-sm text-zinc-500">
        Playlist not found.{' '}
        <Link to="/" className="text-sky-400 hover:underline">
          Back to library
        </Link>
      </div>
    )
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !playlist) return
    const ids = playlist.videoIds
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    reorderVideos(playlist.id, arrayMove(ids, from, to))
  }

  const first = playlist.videoIds[0]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/" className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white">
          <BackIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-white">{playlist.title}</h1>
          {playlist.channelTitle && (
            <p className="truncate text-xs text-zinc-500">{playlist.channelTitle}</p>
          )}
        </div>
        {first && (
          <button
            onClick={() => navigate(`/watch/${first}?list=${playlist.id}`)}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            <PlayIcon className="h-4 w-4" /> Play all
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={playlist.videoIds} strategy={verticalListSortingStrategy}>
          <ul className="mt-5 space-y-1.5">
            {playlist.videoIds.map((videoId, i) => (
              <VideoRow key={videoId} videoId={videoId} index={i} playlistId={playlist.id} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: videoId,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border border-transparent bg-ink-850 p-2 hover:border-ink-700 ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <button
        className="cursor-grab touch-none text-zinc-600 hover:text-zinc-400"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripIcon className="h-4 w-4" />
      </button>

      <Link
        to={`/watch/${videoId}?list=${playlistId}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-ink-800">
          {video?.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
          {watched && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-emerald-400">
              <CheckIcon className="h-6 w-6" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p
            className={`line-clamp-2 text-sm ${
              video?.isUnavailable ? 'italic text-zinc-500' : 'text-zinc-100'
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
