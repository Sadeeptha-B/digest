import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { AddBar } from '../components/AddBar'
import { GreetingBanner } from '../components/GreetingBanner'
import { PlaylistContents } from '../components/PlaylistContents'
import { PlayIcon, PlusIcon, TrashIcon } from '../components/Icons'
import { DragHandle, SortableList } from '../components/Sortable'
import { useSortableRow } from '../components/useSortableRow'
import type { Playlist } from '../types'

export function Library() {
    const playlists = useStore((s) => s.playlists)
    const reorderPlaylists = useStore((s) => s.reorderPlaylists)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Drop the selection if its playlist was removed.
    const selected = playlists.some((p) => p.id === selectedId) ? selectedId : null

    return (
        <div className="flex flex-col gap-6">
            <div className={selected ? 'w-full' : 'mx-auto w-full max-w-3xl'}>
                <GreetingBanner />
            </div>

            <div className="flex flex-col gap-6 lg:flex-row">
                <div className={selected ? 'w-full lg:w-[400px] lg:shrink-0' : 'mx-auto w-full max-w-3xl'}>
                    <AddBar />
                    <NewListButton onCreated={setSelectedId} />

                    {playlists.length === 0 ? (
                        <p className="mt-10 text-center text-sm text-zinc-500">
                            No playlists yet. Paste a YouTube playlist or video URL above, or create your
                            own list, to get started.
                        </p>
                    ) : (
                        <div className="mt-6">
                            <SortableList ids={playlists.map((p) => p.id)} onReorder={reorderPlaylists}>
                                <ul className="space-y-2">
                                    {playlists.map((p) => (
                                        <PlaylistRow
                                            key={p.id}
                                            playlist={p}
                                            selected={p.id === selected}
                                            onSelect={() => setSelectedId(p.id)}
                                        />
                                    ))}
                                </ul>
                            </SortableList>
                        </div>
                    )}
                </div>

                {/* Side panel (large screens) — only while a playlist is selected. */}
                {selected && (
                    <div className="hidden min-w-0 flex-1 lg:block">
                        <div className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col rounded-2xl border border-ink-800 bg-ink-900/40 p-5">
                            <PlaylistContents playlistId={selected} onClose={() => setSelectedId(null)} />
                        </div>
                    </div>
                )}

                {/* Slide-over drawer (small screens). */}
                {selected && (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedId(null)} />
                        <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-ink-800 bg-ink-950 p-5">
                            <PlaylistContents playlistId={selected} onClose={() => setSelectedId(null)} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

/** "+ New list" — expands into a name field; Enter creates the (empty) list and opens it. */
function NewListButton({ onCreated }: { onCreated: (id: string) => void }) {
    const createList = useStore((s) => s.createList)
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState('')

    function close() {
        setEditing(false)
        setName('')
    }

    if (!editing) {
        return (
            <button
                onClick={() => setEditing(true)}
                className="mt-2 flex items-center gap-1 text-sm text-accent-400 hover:underline"
            >
                <PlusIcon className="h-4 w-4" /> New list
            </button>
        )
    }

    return (
        <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
                e.preventDefault()
                if (!name.trim()) return
                onCreated(createList(name))
                close()
            }}
        >
            <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') close()
                }}
                placeholder="List name"
                aria-label="New list name"
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-white outline-none focus:border-accent-500"
            />
            <button
                type="submit"
                disabled={!name.trim()}
                className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
            >
                Create
            </button>
            <button
                type="button"
                onClick={close}
                className="rounded-lg px-2 py-1.5 text-sm text-zinc-400 hover:text-white"
            >
                Cancel
            </button>
        </form>
    )
}

function PlaylistRow({
    playlist,
    selected,
    onSelect,
}: {
    playlist: Playlist
    selected: boolean
    onSelect: () => void
}) {
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
            className={`flex items-center gap-3 rounded-xl border bg-ink-850 p-3 ${selected ? 'border-accent-500' : 'border-ink-700'
                } ${isDragging ? 'opacity-60' : ''}`}
        >
            <DragHandle iconClassName="h-5 w-5" {...handleProps} />

            <button onClick={onSelect} className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium text-white">{playlist.title}</p>
                <p className="truncate text-xs text-zinc-500">
                    {playlist.channelTitle ? `${playlist.channelTitle} · ` : ''}
                    {watched}/{total} watched
                </p>
            </button>

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
