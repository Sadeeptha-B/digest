import { useState } from 'react'
import { useStore } from '../store/useStore'
import { parseYouTubeInput } from '../lib/parseUrl'
import {
    fetchAllPlaylistItems,
    fetchPlaylistMeta,
    fetchVideo,
    listMyPlaylists,
    YouTubeApiError,
    type Auth,
    type MyPlaylist,
} from '../lib/youtube'
import { isConsentRequired, REAUTH_MESSAGE, resolveAuth, tokenIsValid } from '../lib/oauth'
import { createId } from '../lib/id'
import { INBOX_LIST_ID, isUserList, type Playlist } from '../types'

/** "Save to" option that creates a list from the typed name instead of naming an existing one. */
const NEW_LIST = '__new__'

// The last "Save to" choice, kept for the session so saving several videos to one list doesn't
// mean re-picking it each time (the AddBar remounts on every visit to the library).
let lastSaveTarget = INBOX_LIST_ID

export function AddBar() {
    const accessToken = useStore((s) => s.accessToken)
    const hasSignedIn = useStore((s) => s.hasSignedIn)
    const playlists = useStore((s) => s.playlists)
    const upsertVideos = useStore((s) => s.upsertVideos)
    const addPlaylist = useStore((s) => s.addPlaylist)
    const createList = useStore((s) => s.createList)
    const addVideoToList = useStore((s) => s.addVideoToList)

    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    // "Save to" target for single videos: a user-made list, or NEW_LIST plus a name.
    const [saveTarget, setSaveTarget] = useState(lastSaveTarget)
    const [newListName, setNewListName] = useState('')

    // "Import from my channel" picker state
    const [picker, setPicker] = useState<MyPlaylist[] | null>(null)
    const [pickerBusy, setPickerBusy] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

    const signedIn = hasSignedIn || tokenIsValid(accessToken)

    const isVideo = parseYouTubeInput(value).kind === 'video'
    // Inbox first (offered even when it doesn't exist yet — saving recreates it), then the user's
    // other lists in library order. Imported playlists aren't save targets (ADR 0011).
    const userLists = playlists.filter((p) => isUserList(p) && p.id !== INBOX_LIST_ID)
    const inboxTitle = playlists.find((p) => p.id === INBOX_LIST_ID)?.title ?? 'Inbox'
    // Fall back to the Inbox if the remembered list has since been deleted.
    const target =
        saveTarget === NEW_LIST || saveTarget === INBOX_LIST_ID || userLists.some((p) => p.id === saveTarget)
            ? saveTarget
            : INBOX_LIST_ID
    const needsListName = isVideo && target === NEW_LIST && !newListName.trim()

    function chooseTarget(id: string) {
        setSaveTarget(id)
        if (id !== NEW_LIST) lastSaveTarget = id
    }

    async function importPlaylist(playlistId: string, auth: Auth) {
        const [meta, videos] = await Promise.all([
            fetchPlaylistMeta(playlistId, auth),
            fetchAllPlaylistItems(playlistId, auth),
        ])
        upsertVideos(videos)
        const playlist: Playlist = {
            id: createId(),
            ytPlaylistId: playlistId,
            title: meta.title,
            channelTitle: meta.channelTitle,
            videoIds: videos.map((v) => v.id),
            removedVideoIds: [],
            restoredVideoIds: [],
            addedAt: Date.now(),
            lastSyncedAt: Date.now(),
        }
        addPlaylist(playlist)
    }

    function reportError(err: unknown) {
        if (err instanceof Error && err.message === REAUTH_MESSAGE) {
            setError(err.message)
            return
        }
        if (isConsentRequired(err)) {
            setError(REAUTH_MESSAGE)
            return
        }
        if (err instanceof YouTubeApiError) {
            setError(
                err.status === 403
                    ? 'Request rejected (403). Check the API key and its restrictions in Google Cloud.'
                    : err.message,
            )
        } else {
            setError('Something went wrong fetching from YouTube.')
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setNotice(null)
        const parsed = parseYouTubeInput(value)
        if (parsed.kind === 'unknown') {
            setError('Could not find a playlist or video in that input.')
            return
        }
        setBusy(true)
        try {
            const auth = await resolveAuth()
            if (parsed.kind === 'playlist') {
                await importPlaylist(parsed.playlistId, auth)
            } else {
                const video = await fetchVideo(parsed.videoId, auth)
                // Create a new list only once the fetch succeeded, so a failure leaves no empty list.
                const listId = target === NEW_LIST ? createList(newListName) : target
                addVideoToList(video, listId)
                if (target === NEW_LIST) {
                    chooseTarget(listId)
                    setNewListName('')
                }
                const title = useStore.getState().playlists.find((p) => p.id === listId)?.title
                if (title) setNotice(`Saved to “${title}”.`)
            }
            setValue('')
        } catch (err) {
            reportError(err)
        } finally {
            setBusy(false)
        }
    }

    async function openPicker() {
        setError(null)
        setSelected(new Set())
        setPickerBusy(true)
        try {
            const auth = await resolveAuth()
            if (!auth.token) {
                setError('Sign in (Settings) to import your own playlists.')
                return
            }
            setPicker(await listMyPlaylists(auth))
        } catch (err) {
            reportError(err)
        } finally {
            setPickerBusy(false)
        }
    }

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function importSelected() {
        const ids = [...selected]
        if (ids.length === 0) return
        setPicker(null)
        setBusy(true)
        setImportProgress({ done: 0, total: ids.length })
        try {
            const auth = await resolveAuth()
            const failures: string[] = []
            for (let i = 0; i < ids.length; i++) {
                try {
                    await importPlaylist(ids[i], auth)
                } catch {
                    failures.push(ids[i])
                }
                setImportProgress({ done: i + 1, total: ids.length })
            }
            if (failures.length) setError(`${failures.length} playlist(s) could not be imported.`)
        } catch (err) {
            reportError(err)
        } finally {
            setImportProgress(null)
            setSelected(new Set())
            setBusy(false)
        }
    }

    return (
        <div>
            <form className="flex gap-2" onSubmit={handleAdd}>
                <input
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value)
                        setNotice(null)
                    }}
                    placeholder="Paste a YouTube playlist or video URL…"
                    className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                />
                <button
                    type="submit"
                    disabled={busy || !value.trim() || needsListName}
                    className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                >
                    {busy ? 'Adding…' : 'Add'}
                </button>
            </form>

            {isVideo && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label htmlFor="save-target" className="text-xs text-zinc-500">
                        Save to
                    </label>
                    <select
                        id="save-target"
                        value={target}
                        onChange={(e) => chooseTarget(e.target.value)}
                        className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-white outline-none focus:border-accent-500"
                    >
                        <option value={INBOX_LIST_ID}>{inboxTitle}</option>
                        {userLists.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.title}
                            </option>
                        ))}
                        <option value={NEW_LIST}>+ New list…</option>
                    </select>
                    {target === NEW_LIST && (
                        <input
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            placeholder="New list name"
                            aria-label="New list name"
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-white outline-none focus:border-accent-500"
                        />
                    )}
                </div>
            )}

            {signedIn && (
                <button
                    onClick={openPicker}
                    disabled={pickerBusy || busy}
                    className="mt-2 text-sm text-accent-400 hover:underline disabled:opacity-40"
                >
                    {importProgress
                        ? `Importing ${importProgress.done}/${importProgress.total}…`
                        : pickerBusy
                            ? 'Loading your playlists…'
                            : 'Import from my channel'}
                </button>
            )}

            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
            {notice && !error && <p className="mt-2 text-sm text-zinc-400">{notice}</p>}

            {picker && (
                <div className="mt-2 rounded-xl border border-ink-700 bg-ink-850 p-2">
                    <div className="mb-1 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Your playlists — select to import
                        </span>
                        <button onClick={() => setPicker(null)} className="text-xs text-zinc-400 hover:text-white">
                            Close
                        </button>
                    </div>
                    {picker.length === 0 ? (
                        <p className="px-1 py-2 text-sm text-zinc-500">No playlists on this account.</p>
                    ) : (
                        <>
                            <ul className="max-h-72 overflow-y-auto scrollbar-slim">
                                {picker.map((p) => {
                                    const already = useStore
                                        .getState()
                                        .playlists.some((pl) => pl.ytPlaylistId === p.id)
                                    const checked = selected.has(p.id)
                                    return (
                                        <li key={p.id}>
                                            <button
                                                onClick={() => toggleSelect(p.id)}
                                                disabled={already}
                                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-800 disabled:opacity-40"
                                            >
                                                <span
                                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-accent-500 bg-accent-600 text-white' : 'border-ink-600'
                                                        }`}
                                                >
                                                    {checked && (
                                                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
                                                            <path d="M20 6 9 17l-5-5" />
                                                        </svg>
                                                    )}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-zinc-100">{p.title}</span>
                                                <span className="shrink-0 text-xs text-zinc-500">
                                                    {already ? 'added' : `${p.itemCount} videos`}
                                                </span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                            <div className="mt-2 flex items-center justify-between border-t border-ink-700 px-1 pt-2">
                                <span className="text-xs text-zinc-500">{selected.size} selected</span>
                                <button
                                    onClick={importSelected}
                                    disabled={selected.size === 0}
                                    className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                                >
                                    Import {selected.size > 0 ? selected.size : ''}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
