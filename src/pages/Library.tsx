import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { AddBar } from '../components/AddBar'
import { PlayIcon, TrashIcon } from '../components/Icons'
import { DragHandle, SortableList, useSortableRow } from '../components/Sortable'
import type { Playlist } from '../types'

export function Library() {
  const playlists = useStore((s) => s.playlists)
  const reorderPlaylists = useStore((s) => s.reorderPlaylists)

  return (
    <div className="mx-auto max-w-3xl">
      <AddBar />

      {playlists.length === 0 ? (
        <p className="mt-10 text-center text-sm text-zinc-500">
          No playlists yet. Paste a YouTube playlist or video URL above to get started.
        </p>
      ) : (
        <div className="mt-6">
          <SortableList ids={playlists.map((p) => p.id)} onReorder={reorderPlaylists}>
            <ul className="space-y-2">
              {playlists.map((p) => (
                <PlaylistRow key={p.id} playlist={p} />
              ))}
            </ul>
          </SortableList>
        </div>
      )}
    </div>
  )
}

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  const progress = useStore((s) => s.progress)
  const removePlaylist = useStore((s) => s.removePlaylist)
  const { setNodeRef, style, isDragging, handleProps } = useSortableRow(playlist.id)

  const total = playlist.videoIds.length
  const watched = playlist.videoIds.filter((id) => progress[id]?.watched).length
  const firstUnwatched =
    playlist.videoIds.find((id) => !progress[id]?.watched) ?? playlist.videoIds[0]

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3 ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <DragHandle iconClassName="h-5 w-5" {...handleProps} />

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
          className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500"
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
