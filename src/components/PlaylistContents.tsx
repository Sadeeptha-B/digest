import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { isConsentRequired, REAUTH_MESSAGE, resolveAuth } from '../lib/oauth'
import { refreshRestoredVideo, syncPlaylist } from '../lib/playlistSync'
import { YouTubeApiError } from '../lib/youtube'
import { timeAgo } from '../lib/time'
import { isUserList } from '../types'
import { CloseIcon, PencilIcon, PlayIcon, RefreshIcon, RestoreIcon } from './Icons'
import { PlaylistVideoList } from './PlaylistVideoList'
import { VideoThumbnail } from './VideoThumbnail'

/** Opening a playlist older than this triggers a silent background sync. */
const AUTOSYNC_STALE_MS = 24 * 60 * 60 * 1000 // 24 hours

export function PlaylistContents({
    playlistId,
    onClose,
}: {
    playlistId: string
    onClose?: () => void
}) {
    const playlist = useStore((s) => s.playlists.find((p) => p.id === playlistId))
    const progress = useStore((s) => s.progress)
    const restoreVideoToPlaylist = useStore((s) => s.restoreVideoToPlaylist)
    const renamePlaylist = useStore((s) => s.renamePlaylist)
    const navigate = useNavigate()

    const [refreshing, setRefreshing] = useState(false)
    const [refreshError, setRefreshError] = useState<string | null>(null)
    const [showRemoved, setShowRemoved] = useState(false)
    // Inline title edit (user-made lists only); null when not editing.
    const [draftTitle, setDraftTitle] = useState<string | null>(null)
    // Set on Escape so the blur that follows unmounting the input doesn't save the draft.
    const cancelRename = useRef(false)

    const ytPlaylistId = playlist?.ytPlaylistId

    // Restore is local-first and instant; the metadata refresh runs in the background and is allowed
    // to fail (e.g. the video was removed/made private upstream) without blocking the restore.
    function handleRestore(videoId: string) {
        restoreVideoToPlaylist(playlistId, videoId)
        void refreshRestoredVideo(videoId)
    }

    async function handleRefresh({ silent = false } = {}) {
        if (!playlist || !ytPlaylistId || refreshing) return
        setRefreshing(true)
        setRefreshError(null)
        try {
            const auth = await resolveAuth()
            await syncPlaylist(playlist.id, ytPlaylistId, auth)
        } catch (err) {
            // Background auto-syncs fail quietly; the manual button is where errors surface.
            if (silent) return
            if (err instanceof Error && err.message === REAUTH_MESSAGE) setRefreshError(err.message)
            else if (isConsentRequired(err)) setRefreshError(REAUTH_MESSAGE)
            else if (err instanceof YouTubeApiError) setRefreshError(err.message)
            else setRefreshError('Could not refresh from YouTube.')
        } finally {
            setRefreshing(false)
        }
    }

    // Auto-sync once when a stale playlist is opened, so the list freshens without a manual click.
    useEffect(() => {
        if (!ytPlaylistId) return
        const p = useStore.getState().playlists.find((pl) => pl.id === playlistId)
        if (!p || Date.now() - p.lastSyncedAt < AUTOSYNC_STALE_MS) return
        void handleRefresh({ silent: true })
        // Fire only when the opened playlist changes, not on every sync-driven re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playlistId, ytPlaylistId])

    if (!playlist) {
        return <p className="text-sm text-zinc-500">Playlist not found.</p>
    }

    const renamable = isUserList(playlist)
    const first = playlist.videoIds[0]
    const total = playlist.videoIds.length
    const watched = playlist.videoIds.filter((id) => progress[id]?.watched).length

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    {draftTitle !== null ? (
                        <input
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={() => {
                                if (!cancelRename.current) renamePlaylist(playlist.id, draftTitle)
                                cancelRename.current = false
                                setDraftTitle(null)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                    cancelRename.current = true
                                    e.currentTarget.blur()
                                }
                            }}
                            aria-label="List name"
                            autoFocus
                            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-0.5 text-lg font-semibold text-white outline-none focus:border-accent-500"
                        />
                    ) : (
                        <div className="flex min-w-0 items-center gap-1">
                            <h2 className="truncate text-lg font-semibold text-white">{playlist.title}</h2>
                            {renamable && (
                                <button
                                    onClick={() => setDraftTitle(playlist.title)}
                                    className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-ink-800 hover:text-white"
                                    aria-label="Rename list"
                                    title="Rename list"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}
                    <p className="truncate text-xs text-zinc-500">
                        {playlist.channelTitle ? `${playlist.channelTitle} · ` : ''}
                        {watched}/{total} watched
                        {ytPlaylistId && (
                            <> · {refreshing ? 'syncing…' : `synced ${timeAgo(playlist.lastSyncedAt)}`}</>
                        )}
                    </p>
                </div>
                {ytPlaylistId && (
                    <button
                        onClick={() => handleRefresh()}
                        disabled={refreshing}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white disabled:opacity-40"
                        aria-label="Refresh from YouTube"
                        title="Refresh from YouTube"
                    >
                        <RefreshIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                )}
                {first && (
                    <button
                        onClick={() => navigate(`/watch/${first}?list=${playlist.id}`)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500"
                    >
                        <PlayIcon className="h-4 w-4" /> Play all
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white"
                        aria-label="Close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                )}
            </div>

            {refreshError && <p className="mt-2 text-sm text-rose-400">{refreshError}</p>}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto scrollbar-slim">
                {total === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-500">
                        {/* Only user-made lists accept saved videos (ADR 0011). */}
                        {renamable
                            ? 'No videos yet. Paste a video URL above and choose this list.'
                            : 'No videos in this playlist.'}
                    </p>
                ) : (
                    <PlaylistVideoList playlistId={playlist.id} />
                )}
            </div>

            {ytPlaylistId && playlist.removedVideoIds.length > 0 && (
                <div className="mt-3 border-t border-ink-800 pt-3">
                    <button
                        onClick={() => setShowRemoved((v) => !v)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
                    >
                        {showRemoved ? 'Hide' : 'Show'} removed ({playlist.removedVideoIds.length})
                    </button>
                    {showRemoved && (
                        <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto scrollbar-slim">
                            {playlist.removedVideoIds.map((videoId) => (
                                <RemovedVideoRow
                                    key={videoId}
                                    videoId={videoId}
                                    onRestore={() => handleRestore(videoId)}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

function RemovedVideoRow({ videoId, onRestore }: { videoId: string; onRestore: () => void }) {
    const video = useStore((s) => s.videos[videoId])

    return (
        <li className="flex items-center gap-3 rounded-lg border border-transparent bg-ink-900/60 p-2">
            <VideoThumbnail
                thumbnailUrl={video?.thumbnailUrl}
                className="relative aspect-video w-20 shrink-0 overflow-hidden rounded bg-ink-800 opacity-60"
            />
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-zinc-400">{video?.title ?? videoId}</p>
                {video?.channelTitle && (
                    <p className="truncate text-xs text-zinc-600">{video.channelTitle}</p>
                )}
            </div>
            <button
                onClick={onRestore}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-400 hover:bg-ink-800"
                aria-label="Restore video"
            >
                <RestoreIcon className="h-4 w-4" /> Restore
            </button>
        </li>
    )
}
