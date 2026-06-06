import { useState } from 'react'
import { useStore } from '../store/useStore'
import { parseYouTubeInput } from '../lib/parseUrl'
import {
  fetchAllPlaylistItems,
  fetchPlaylistMeta,
  fetchVideo,
  YouTubeApiError,
} from '../lib/youtube'
import type { Playlist } from '../types'

function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

export function AddBar() {
  const apiKey = useStore((s) => s.apiKey)
  const upsertVideos = useStore((s) => s.upsertVideos)
  const addPlaylist = useStore((s) => s.addPlaylist)
  const addStandaloneVideo = useStore((s) => s.addStandaloneVideo)

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (parsed.kind === 'playlist') {
        const [meta, videos] = await Promise.all([
          fetchPlaylistMeta(parsed.playlistId, apiKey),
          fetchAllPlaylistItems(parsed.playlistId, apiKey),
        ])
        upsertVideos(videos)
        const playlist: Playlist = {
          id: uuid(),
          ytPlaylistId: parsed.playlistId,
          title: meta.title,
          channelTitle: meta.channelTitle,
          videoIds: videos.map((v) => v.id),
          addedAt: Date.now(),
        }
        addPlaylist(playlist)
      } else {
        const video = await fetchVideo(parsed.videoId, apiKey)
        addStandaloneVideo(video)
      }
      setValue('')
    } catch (err) {
      if (err instanceof YouTubeApiError) {
        setError(
          err.status === 403
            ? 'Request rejected (403). Check the API key and its referrer restrictions.'
            : err.message,
        )
      } else {
        setError('Something went wrong fetching from YouTube.')
      }
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
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
    </div>
  )
}
