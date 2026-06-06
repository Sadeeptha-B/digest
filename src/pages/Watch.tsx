import { useCallback, useEffect, useRef } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import YouTube, { type YouTubeEvent, type YouTubePlayer } from 'react-youtube'
import { useStore } from '../store/useStore'
import { Queue } from '../components/Queue'
import { BackIcon } from '../components/Icons'

// YT.PlayerState
const ENDED = 0
const PLAYING = 1

export function Watch() {
  const { videoId = '' } = useParams()
  const [search] = useSearchParams()
  const listId = search.get('list') ?? ''
  const navigate = useNavigate()

  const playlist = useStore((s) => s.playlists.find((p) => p.id === listId))
  const video = useStore((s) => s.videos[videoId])
  const setWatched = useStore((s) => s.setWatched)
  const setPosition = useStore((s) => s.setPosition)
  const getNextVideoId = useStore((s) => s.getNextVideoId)

  const playerRef = useRef<YouTubePlayer | null>(null)
  // keep the latest videoId for the polling interval's closure
  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId

  // Periodically persist playback position so we can resume later.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const player = playerRef.current
      if (!player) return
      try {
        const state = await player.getPlayerState()
        if (state === PLAYING) {
          const t = await player.getCurrentTime()
          if (typeof t === 'number' && t > 0) setPosition(videoIdRef.current, Math.floor(t))
        }
      } catch {
        /* player not ready */
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [setPosition])

  const goToNext = useCallback(() => {
    const next = getNextVideoId(listId, videoId)
    if (next) navigate(`/watch/${next}?list=${listId}`)
  }, [getNextVideoId, listId, videoId, navigate])

  const onReady = useCallback(
    (e: YouTubeEvent) => {
      playerRef.current = e.target
      const resume = useStore.getState().progress[videoId]
      if (resume && !resume.watched && resume.lastPositionSec > 5) {
        e.target.seekTo(resume.lastPositionSec, true)
      }
    },
    [videoId],
  )

  const onStateChange = useCallback(
    (e: YouTubeEvent) => {
      if (e.data === ENDED) {
        // Mark watched and immediately advance — this is what prevents YouTube's
        // end-screen related-video grid from ever taking over.
        setWatched(videoId, true)
        setPosition(videoId, 0)
        goToNext()
      }
    },
    [videoId, setWatched, setPosition, goToNext],
  )

  if (!video) {
    return (
      <div className="text-center text-sm text-zinc-500">
        Video not loaded.{' '}
        <Link to="/" className="text-sky-400 hover:underline">
          Back to library
        </Link>
      </div>
    )
  }

  const hasNext = Boolean(getNextVideoId(listId, videoId))

  return (
    <div className="mx-auto grid max-w-[1700px] gap-6 lg:grid-cols-[minmax(0,1fr)_402px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <Link
            to={playlist ? `/playlist/${playlist.id}` : '/'}
            className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white"
            aria-label="Back"
          >
            <BackIcon className="h-5 w-5" />
          </Link>
          <span className="truncate text-sm text-zinc-400">
            {playlist ? playlist.title : 'Saved videos'}
          </span>
        </div>

        <div className="mx-auto aspect-video max-h-[calc(100vh-9rem)] w-full overflow-hidden rounded-xl bg-black">
          <YouTube
            key={videoId}
            videoId={videoId}
            className="h-full w-full"
            iframeClassName="h-full w-full"
            opts={{
              width: '100%',
              height: '100%',
              host: 'https://www.youtube-nocookie.com',
              playerVars: {
                rel: 0,
                autoplay: 1,
                modestbranding: 1,
                playsinline: 1,
              },
            }}
            onReady={onReady}
            onStateChange={onStateChange}
          />
        </div>

        <h1 className="mt-3 text-lg font-medium text-white">{video.title}</h1>
        {video.channelTitle && <p className="text-sm text-zinc-500">{video.channelTitle}</p>}

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setWatched(videoId, true)}
            className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800"
          >
            Mark watched
          </button>
          {hasNext && (
            <button
              onClick={goToNext}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Next ›
            </button>
          )}
        </div>
      </div>

      {playlist && (
        <aside className="lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Up next
          </h2>
          <Queue videoIds={playlist.videoIds} currentVideoId={videoId} listId={playlist.id} />
        </aside>
      )}
    </div>
  )
}
