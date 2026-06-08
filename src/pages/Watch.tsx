import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import YouTube, { type YouTubeEvent, type YouTubePlayer } from 'react-youtube'
import { useStore } from '../store/useStore'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { SessionStatsPanel } from '../components/SessionStatsPanel'
import { FocusPanel } from '../components/focus/FocusPanel'
import { PomodoroTimeline } from '../components/PomodoroTimeline'
import { usePomodoro } from '../hooks/usePomodoro'
import { BackIcon } from '../components/Icons'

type Tab = 'transcript' | 'stats' | 'calm'

// Videos longer than this (seconds) get a Pomodoro focus timeline.
const POMODORO_MIN_DURATION = 15 * 60

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
  const [tab, setTab] = useState<Tab>('transcript')
  const setWatched = useStore((s) => s.setWatched)
  const setPosition = useStore((s) => s.setPosition)
  const getNextVideoId = useStore((s) => s.getNextVideoId)
  const pomodoroLengthMin = useStore((s) => s.settings.pomodoroLengthMin)
  const pomodoroResetThresholdMin = useStore((s) => s.settings.pomodoroResetThresholdMin ?? 5)

  const playerRef = useRef<YouTubePlayer | null>(null)
  // keep the latest videoId for the polling interval's closure
  const videoIdRef = useRef(videoId)
  videoIdRef.current = videoId

  // Video duration (seconds), read from the player. 0 until known; reset between videos.
  const [durationSec, setDurationSec] = useState(0)
  useEffect(() => setDurationSec(0), [videoId])
  const pomodoroEnabled = durationSec > POMODORO_MIN_DURATION

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

  // Mark watched and immediately advance — this is what prevents YouTube's end-screen
  // related-video grid from ever taking over.
  const finishVideo = useCallback(() => {
    setWatched(videoId, true)
    setPosition(videoId, 0)
    goToNext()
  }, [videoId, setWatched, setPosition, goToNext])

  const pomodoro = usePomodoro({
    videoId,
    playerRef,
    durationSec,
    pomodoroLengthSec: pomodoroLengthMin * 60,
    resetThresholdSec: pomodoroResetThresholdMin * 60,
    enabled: pomodoroEnabled,
    onSessionEnd: finishVideo,
  })
  const { handlePlayerState, handleEnded } = pomodoro

  const onReady = useCallback(
    async (e: YouTubeEvent) => {
      playerRef.current = e.target
      const resume = useStore.getState().progress[videoId]
      if (resume && !resume.watched && resume.lastPositionSec > 5) {
        e.target.seekTo(resume.lastPositionSec, true)
      }
      try {
        const d = await e.target.getDuration()
        if (typeof d === 'number' && d > 0) setDurationSec(d)
      } catch {
        /* duration not ready yet; falls back to the first PLAYING event */
      }
    },
    [videoId],
  )

  const onStateChange = useCallback(
    async (e: YouTubeEvent) => {
      if (e.data === ENDED) {
        // Let an active focus session play its 3s offramp before advancing; otherwise advance now.
        if (!handleEnded()) finishVideo()
        return
      }
      if (e.data === PLAYING && durationSec === 0) {
        try {
          const d = await e.target.getDuration()
          if (typeof d === 'number' && d > 0) setDurationSec(d)
        } catch {
          /* still not ready */
        }
      }
      handlePlayerState(e.data)
    },
    [durationSec, handleEnded, handlePlayerState, finishVideo],
  )

  if (!video) {
    return (
      <div className="text-center text-sm text-zinc-500">
        Video not loaded.{' '}
        <Link to="/" className="text-accent-400 hover:underline">
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
                cc_load_policy: 1,
                cc_lang_pref: 'en',
              },
            }}
            onReady={onReady}
            onStateChange={onStateChange}
          />
        </div>

        {pomodoroEnabled && (
          <PomodoroTimeline
            view={pomodoro.view}
            onPause={pomodoro.pause}
            onResume={pomodoro.resume}
            onSkipBreak={pomodoro.skipBreak}
          />
        )}

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
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500"
            >
              Next ›
            </button>
          )}
        </div>
      </div>

      <aside className="flex flex-col rounded-xl border border-ink-700 bg-ink-900/40 p-3 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <div className="mb-2 flex gap-1 border-b border-ink-800">
          <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')}>
            Transcript
          </TabButton>
          <TabButton active={tab === 'stats'} onClick={() => setTab('stats')}>
            Stats
          </TabButton>
          <TabButton active={tab === 'calm'} onClick={() => setTab('calm')}>
            Calm
          </TabButton>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'stats' ? (
            <SessionStatsPanel video={video} />
          ) : tab === 'calm' ? (
            <FocusPanel />
          ) : (
            <TranscriptPanel video={video} playerRef={playerRef} />
          )}
        </div>
      </aside>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-accent-500 text-white'
          : 'border-transparent text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}
