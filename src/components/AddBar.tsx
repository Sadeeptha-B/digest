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
import { getValidToken, isConsentRequired, tokenIsValid } from '../lib/oauth'
import { createId } from '../lib/id'
import type { Playlist } from '../types'

export function AddBar() {
    const apiKey = useStore((s) => s.apiKey)
    const accessToken = useStore((s) => s.accessToken)
    const hasSignedIn = useStore((s) => s.hasSignedIn)
    const upsertVideos = useStore((s) => s.upsertVideos)
    const addPlaylist = useStore((s) => s.addPlaylist)
    const addStandaloneVideo = useStore((s) => s.addStandaloneVideo)

    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // "Import from my channel" picker state
    const [picker, setPicker] = useState<MyPlaylist[] | null>(null)
    const [pickerBusy, setPickerBusy] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

    const signedIn = hasSignedIn || tokenIsValid(accessToken)
    const reauthMessage = 'Sign in again to access your private playlists.'

    /** Ensure a valid token if the user has signed in; otherwise fetch anonymously. */
    async function currentAuth(): Promise<Auth> {
        if (!hasSignedIn && !accessToken) return { apiKey, token: null }
        const token = await getValidToken()
        if (!token && !apiKey) throw new Error(reauthMessage)
        return { apiKey, token: token?.value ?? null }
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
            addedAt: Date.now(),
        }
        addPlaylist(playlist)
    }

    function reportError(err: unknown) {
        if (err instanceof Error && err.message === reauthMessage) {
            setError(err.message)
            return
        }
        if (isConsentRequired(err)) {
            setError(reauthMessage)
            return
        }
        if (err instanceof YouTubeApiError) {
            setError(
                err.status === 403
                    ? 'Request rejected (403). Check the API key and its referrer restrictions.'
                    : err.message,
            )
        } else {
            setError('Something went wrong fetching from YouTube.')
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        const parsed = parseYouTubeInput(value)
        if (parsed.kind === 'unknown') {
            setError('Could not find a playlist or video in that input.')
            return
        }
        setBusy(true)
        try {
            const auth = await currentAuth()
            if (parsed.kind === 'playlist') {
                await importPlaylist(parsed.playlistId, auth)
            } else {
                const video = await fetchVideo(parsed.videoId, auth)
                addStandaloneVideo(video)
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
            const auth = await currentAuth()
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
            const auth = await currentAuth()
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
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Paste a YouTube playlist or video URL…"
                    className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                />
                <button
                    type="submit"
                    disabled={busy || !value.trim()}
                    className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                >
                    {busy ? 'Adding…' : 'Add'}
                </button>
            </form>

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
                            <ul className="max-h-72 overflow-y-auto no-scrollbar">
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
