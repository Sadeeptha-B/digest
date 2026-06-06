import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { YouTubePlayer } from 'react-youtube'
import { useStore } from '../store/useStore'
import { getValidToken, signIn } from '../lib/oauth'
import { getTranscript } from '../lib/transcript'
import type { Video } from '../types'

function fmt(sec: number): string {
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function TranscriptPanel({
  video,
  playerRef,
}: {
  video: Video
  playerRef: RefObject<YouTubePlayer | null>
}) {
  const oauthClientId = useStore((s) => s.oauthClientId)
  const result = useStore((s) => s.transcripts[video.id])
  const cacheTranscript = useStore((s) => s.cacheTranscript)

  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  async function load() {
    setLoading(true)
    try {
      let token = await getValidToken()
      if (!token) token = await signIn() // never consented yet → interactive
      const res = await getTranscript(video, token.value)
      cacheTranscript(video.id, res)
    } catch (e) {
      cacheTranscript(video.id, {
        status: 'unavailable',
        reason: e instanceof Error ? e.message : 'Could not load the transcript.',
      })
    } finally {
      setLoading(false)
    }
  }

  const lines = result?.status === 'ok' ? result.lines : null

  // Highlight the line matching the current playback time.
  useEffect(() => {
    if (!lines) return
    const timer = window.setInterval(async () => {
      const player = playerRef.current
      if (!player) return
      try {
        const t = await player.getCurrentTime()
        if (typeof t !== 'number') return
        // last line whose start is <= current time
        let idx = -1
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startSec <= t + 0.25) idx = i
          else break
        }
        setActiveIdx(idx)
      } catch {
        /* not ready */
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [lines, playerRef])

  // Keep the active line in view (only when not filtering).
  useEffect(() => {
    if (query || activeIdx < 0) return
    rowRefs.current.get(activeIdx)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, query])

  const filtered = useMemo(() => {
    if (!lines) return []
    const q = query.trim().toLowerCase()
    const withIdx = lines.map((l, i) => ({ ...l, i }))
    return q ? withIdx.filter((l) => l.text.toLowerCase().includes(q)) : withIdx
  }, [lines, query])

  function seek(sec: number) {
    const player = playerRef.current
    if (!player) return
    player.seekTo(sec, true)
    player.playVideo?.()
  }

  // --- Empty / gating states ---
  if (!oauthClientId) {
    return (
      <p className="px-1 text-sm text-zinc-500">
        Add an <span className="text-zinc-300">OAuth Client ID</span> in Settings, then sign in,
        to load transcripts for your own videos.
      </p>
    )
  }

  if (!result) {
    return (
      <div className="px-1">
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {loading ? 'Loading…' : 'Load transcript'}
        </button>
        <p className="mt-2 text-xs text-zinc-500">
          Works for videos on your account. Uses ~250 quota units, then caches.
        </p>
      </div>
    )
  }

  if (result.status === 'unavailable') {
    return (
      <div className="px-1">
        <p className="text-sm text-zinc-400">{result.reason}</p>
        <button
          onClick={load}
          disabled={loading}
          className="mt-2 rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800 disabled:opacity-40"
        >
          {loading ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    )
  }

  // --- Loaded transcript ---
  return (
    <div className="flex min-h-0 flex-col">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search transcript…"
        className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-white outline-none focus:border-sky-500"
      />
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-sm text-zinc-500">No matching lines.</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((l) => {
              const isActive = l.i === activeIdx
              return (
                <li key={l.i}>
                  <button
                    ref={(el) => {
                      if (el) rowRefs.current.set(l.i, el)
                      else rowRefs.current.delete(l.i)
                    }}
                    onClick={() => seek(l.startSec)}
                    className={`flex w-full gap-2.5 rounded-md px-2 py-1 text-left text-sm ${
                      isActive ? 'bg-sky-600/15 text-white ring-1 ring-sky-600/40' : 'hover:bg-ink-800'
                    }`}
                  >
                    <span className="shrink-0 font-mono text-xs text-sky-400">{fmt(l.startSec)}</span>
                    <span className="text-zinc-300">{l.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
