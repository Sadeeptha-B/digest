import { useEffect, useState, type RefObject } from 'react'
import type { YouTubePlayer } from 'react-youtube'
import { getCardForVideo, type RecallCard } from '../lib/recall'
import { fmt } from '../lib/time'
import type { Video } from '../types'

/** Parse a Recall time code ("mm:ss" or "hh:mm:ss") to seconds; null if it isn't one. */
function hmsToSeconds(ts: string): number | null {
  const parts = ts.trim().split(':')
  if (parts.length < 2 || parts.length > 3) return null
  let sec = 0
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n)) return null
    sec = sec * 60 + n
  }
  return sec
}

type State =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error' }
  | { status: 'ok'; card: RecallCard }

export function SummaryPanel({
  video,
  playerRef,
}: {
  video: Video
  playerRef: RefObject<YouTubePlayer | null>
}) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getCardForVideo(video.id)
      .then((card) => {
        if (cancelled) return
        setState(card ? { status: 'ok', card } : { status: 'none' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [video.id])

  function seek(sec: number) {
    const player = playerRef.current
    if (!player) return
    player.seekTo(sec, true)
    player.playVideo?.()
  }

  if (state.status === 'loading') {
    return <p className="px-1 text-sm text-zinc-500">Loading summary…</p>
  }
  if (state.status === 'error') {
    return <p className="px-1 text-sm text-rose-400">Couldn’t load the summary. Try again later.</p>
  }
  if (state.status === 'none') {
    return (
      <p className="px-1 text-sm text-zinc-500">
        No Recall summary saved for this video. Save it in getrecall.ai and it’ll appear here.
      </p>
    )
  }

  const { card } = state
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2">
        <h3 className="text-sm font-medium text-white">{card.title}</h3>
        {card.created_at && <p className="text-xs text-zinc-500">Saved {card.created_at}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        {card.chunks.length === 0 ? (
          <p className="px-1 py-2 text-sm text-zinc-500">This summary has no content yet.</p>
        ) : (
          <ul className="space-y-3">
            {card.chunks.map((chunk) => {
              const seekable = (chunk.timestamps ?? [])
                .map((ts) => ({ ts, sec: hmsToSeconds(ts) }))
                .filter((t): t is { ts: string; sec: number } => t.sec !== null)
              return (
                <li key={chunk.chunk_id} className="rounded-lg bg-ink-900/40 p-2.5">
                  <p className="whitespace-pre-wrap text-sm text-zinc-300">{chunk.content}</p>
                  {seekable.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {seekable.map(({ ts, sec }, i) => (
                        <button
                          key={`${chunk.chunk_id}-${i}`}
                          onClick={() => seek(sec)}
                          className="rounded-full border border-accent-600/40 bg-accent-600/15 px-2 py-0.5 font-mono text-xs text-accent-300 hover:bg-accent-600/25"
                          title={`Jump to ${ts}`}
                        >
                          {fmt(sec)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
