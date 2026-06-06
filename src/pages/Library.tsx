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
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { AddBar } from '../components/AddBar'
import { GripIcon, PlayIcon, TrashIcon } from '../components/Icons'
import type { Playlist } from '../types'

export function Library() {
  const playlists = useStore((s) => s.playlists)
  const reorderPlaylists = useStore((s) => s.reorderPlaylists)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = playlists.map((p) => p.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    reorderPlaylists(arrayMove(ids, from, to))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <AddBar />

      {playlists.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-500">
          No playlists yet. Paste a YouTube playlist or video URL above to get started.
        </p>
      ) : (
        <div className="mt-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={playlists.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {playlists.map((p) => (
                  <PlaylistRow key={p.id} playlist={p} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const progress = useStore((s) => s.progress)
  const removePlaylist = useStore((s) => s.removePlaylist)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: playlist.id,
  })

  const total = playlist.videoIds.length
  const watched = playlist.videoIds.filter((id) => progress[id]?.watched).length
  const firstUnwatched =
    playlist.videoIds.find((id) => !progress[id]?.watched) ?? playlist.videoIds[0]

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3 ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <button
        className="cursor-grab touch-none text-zinc-600 hover:text-zinc-400"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripIcon className="h-5 w-5" />
      </button>

      <Link to={`/playlist/${playlist.id}`} className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{playlist.title}</p>
        <p className="truncate text-xs text-zinc-500">
          {playlist.channelTitle ? `${playlist.channelTitle} · ` : ''}
          {watched}/{total} watched
        </p>
      </Link>

      {firstUnwatched && (
        <Link
          to={`/watch/${firstUnwatched}?list=${playlist.id}`}
          className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          <PlayIcon className="h-4 w-4" /> Play
        </Link>
      )}
      <button
        onClick={() => {
          if (confirm(`Remove "${playlist.title}"?`)) removePlaylist(playlist.id)
        }}
        className="rounded-lg p-2 text-zinc-500 hover:bg-ink-800 hover:text-rose-400"
        aria-label="Remove playlist"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  )
}
