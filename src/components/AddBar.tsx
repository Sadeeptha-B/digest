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
import { getValidToken } from '../lib/oauth'
import type { Playlist } from '../types'

function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

export function AddBar() {
  const apiKey = useStore((s) => s.apiKey)
  const accessToken = useStore((s) => s.accessToken)
  const upsertVideos = useStore((s) => s.upsertVideos)
  const addPlaylist = useStore((s) => s.addPlaylist)
  const addStandaloneVideo = useStore((s) => s.addStandaloneVideo)

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Import from my channel" picker state
  const [picker, setPicker] = useState<MyPlaylist[] | null>(null)
  const [pickerBusy, setPickerBusy] = useState(false)

  const signedIn = Boolean(accessToken && accessToken.expiresAt > Date.now())

  /** Ensure a valid token if the user has signed in; otherwise fetch anonymously. */
  async function currentAuth(): Promise<Auth> {
    if (!accessToken) return { apiKey, token: null }
    const token = await getValidToken()
    return { apiKey, token: token?.value ?? null }
  }

  async function importPlaylist(playlistId: string, auth: Auth) {
    const [meta, videos] = await Promise.all([
      fetchPlaylistMeta(playlistId, auth),
      fetchAllPlaylistItems(playlistId, auth),
    ])
    upsertVideos(videos)
    const playlist: Playlist = {
      id: uuid(),
      ytPlaylistId: playlistId,
      title: meta.title,
      channelTitle: meta.channelTitle,
      videoIds: videos.map((v) => v.id),
      addedAt: Date.now(),
    }
    addPlaylist(playlist)
  }

  function reportError(err: unknown) {
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

  async function pick(p: MyPlaylist) {
    if (useStore.getState().playlists.some((pl) => pl.ytPlaylistId === p.id)) {
      setPicker(null)
      return
    }
    setBusy(true)
    setPicker(null)
    try {
      await importPlaylist(p.id, await currentAuth())
    } catch (err) {
      reportError(err)
    } finally {
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
          className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      {signedIn && (
        <button
          onClick={openPicker}
          disabled={pickerBusy || busy}
          className="mt-2 text-sm text-sky-400 hover:underline disabled:opacity-40"
        >
          {pickerBusy ? 'Loading your playlists…' : 'Import from my channel'}
        </button>
      )}

      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

      {picker && (
        <div className="mt-2 rounded-xl border border-ink-700 bg-ink-850 p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Your playlists
            </span>
            <button onClick={() => setPicker(null)} className="text-xs text-zinc-400 hover:text-white">
              Close
            </button>
          </div>
          {picker.length === 0 ? (
            <p className="px-1 py-2 text-sm text-zinc-500">No playlists on this account.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto no-scrollbar">
              {picker.map((p) => {
                const already = useStore
                  .getState()
                  .playlists.some((pl) => pl.ytPlaylistId === p.id)
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => pick(p)}
                      disabled={already}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-ink-800 disabled:opacity-40"
                    >
                      <span className="truncate text-zinc-100">{p.title}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {already ? 'added' : `${p.itemCount} videos`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
