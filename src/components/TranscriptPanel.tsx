import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { YouTubePlayer } from 'react-youtube'
import { useStore } from '../store/useStore'
import { parseCaptionFile } from '../lib/captions'
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
  const result = useStore((s) => s.transcripts[video.id])
  const cacheTranscript = useStore((s) => s.cacheTranscript)
  const clearTranscript = useStore((s) => s.clearTranscript)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [fileError, setFileError] = useState<string | null>(null)
  // When the user scrolls away from the active line we pause auto-scroll so they can
  // read ahead; `dir` is where the current line sits relative to the viewport.
  const [following, setFollowing] = useState(true)
  const [dir, setDir] = useState<'up' | 'down'>('up')
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setFileError(null)
    try {
      const lines = parseCaptionFile(await file.text())
      if (lines.length === 0) {
        setFileError('No captions found in that file. Use a .vtt or .srt file.')
        return
      }
      cacheTranscript(video.id, { status: 'ok', lines, source: 'manual', fetchedAt: Date.now() })
    } catch {
      setFileError('Could not read that file.')
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

  // Keep the active line in view (only when not filtering and the user hasn't scrolled away).
  useEffect(() => {
    if (query || !following || activeIdx < 0) return
    rowRefs.current.get(activeIdx)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, query, following])

  // Searching or clearing the search resumes following the current line.
  useEffect(() => {
    setFollowing(true)
  }, [query])

  // Pause auto-scroll once the active line leaves the viewport; resume when it's back in view.
  function onScroll() {
    if (query) return
    const container = scrollRef.current
    const row = rowRefs.current.get(activeIdx)
    if (!container || !row) return
    const c = container.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    if (r.bottom <= c.top) {
      setFollowing(false)
      setDir('up')
    } else if (r.top >= c.bottom) {
      setFollowing(false)
      setDir('down')
    } else {
      setFollowing(true)
    }
  }

  function jumpToCurrent() {
    setFollowing(true)
    rowRefs.current.get(activeIdx)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

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

  // Hidden file input + button to import a .vtt/.srt transcript manually (e.g. exported from
  // YouTube Studio). Works without OAuth and for private videos.
  const uploader = (
    <div className="mt-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".vtt,.srt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={onFile}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800"
      >
        Upload .srt / .vtt
      </button>
      <p className="mt-1 text-xs text-zinc-500">
        Download a transcript from YouTube Studio → Subtitles, then import it here.
      </p>
      {fileError && <p className="mt-1 text-sm text-rose-400">{fileError}</p>}
    </div>
  )

  // --- Empty state: no transcript imported yet ---
  if (!lines) {
    return (
      <div className="px-1">
        <p className="text-sm text-zinc-500">
          Import a transcript file to read along and jump to any line.
        </p>
        {uploader}
      </div>
    )
  }

  // --- Loaded transcript ---
  const showJump = !query && !following && activeIdx >= 0
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transcript…"
          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-white outline-none focus:border-accent-500"
        />
        <button
          onClick={() => clearTranscript(video.id)}
          className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-ink-800 hover:text-zinc-200"
          title="Remove transcript and re-load or replace"
        >
          Replace
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto no-scrollbar">
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
                      isActive ? 'bg-accent-600/15 text-white ring-1 ring-accent-600/40' : 'hover:bg-ink-800'
                    }`}
                  >
                    <span className="shrink-0 font-mono text-xs text-accent-400">{fmt(l.startSec)}</span>
                    <span className="text-zinc-300">{l.text}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        </div>
        {showJump && (
          <button
            onClick={jumpToCurrent}
            className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/30 hover:bg-accent-500"
          >
            <svg
              className={`h-3.5 w-3.5 ${dir === 'up' ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            Current
          </button>
        )}
      </div>
    </div>
  )
}
