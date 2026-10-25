import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
    INBOX_LIST_ID,
    isUserList,
    type AccessToken,
    type FocusNote,
    type Playlist,
    type PomodoroEvent,
    type Progress,
    type TranscriptResult,
    type Video,
} from '../types'
import { DEFAULT_ACCENT_THEME, type AccentTheme } from '../lib/themes'
import { createId } from '../lib/id'

interface StoreState {
    /** Whether a YouTube API key is configured. The key itself lives in a server-side HttpOnly
     *  cookie (see lib/apiKey.ts); only this non-secret flag is persisted, for UI gating. */
    apiKeyConfigured: boolean
    playlists: Playlist[]
    videos: Record<string, Video>
    progress: Record<string, Progress>

    /** The access token is in-memory only (not persisted); the refresh token lives server-side. */
    accessToken: AccessToken | null
    /** Remembers that the user has signed in, so we can silently restore the session and skip
     *  the onboarding gate after a reload (the token itself is not persisted). */
    hasSignedIn: boolean
    /** cached transcripts keyed by videoId */
    transcripts: Record<string, TranscriptResult>
    /** Whether this browser has a getrecall.ai key configured (the key lives in a server-side
     *  HttpOnly cookie — see lib/recallKey.ts). Probed on load; non-persisted, so it's always
     *  reconciled fresh. Gates the Summary tab and the Settings UI. */
    recallConfigured: boolean

    /** user-configurable preferences */
    settings: {
        pomodoroLengthMin: number
        /** Pausing within the first N minutes of a block resets it; later pauses just hold. */
        pomodoroResetThresholdMin: number
        accentTheme: AccentTheme
        userName: string
        /** Master switch for the watch-page focus scaffolding (Pomodoro timeline + focus widgets).
         *  Off gives a bare player. Defaults on — focus tooling is Digest's reason for existing. */
        focusMode: boolean
    }
    /** Pomodoro focus-session event logs keyed by videoId */
    pomodoroSessions: Record<string, PomodoroEvent[]>
    /** Brain-dump parking lot — intrusive thoughts to revisit later */
    focusNotes: FocusNote[]

    setApiKeyConfigured: (value: boolean) => void
    setAccessToken: (token: AccessToken | null) => void
    setHasSignedIn: (value: boolean) => void
    cacheTranscript: (videoId: string, result: TranscriptResult) => void
    clearTranscript: (videoId: string) => void
    setRecallConfigured: (value: boolean) => void

    addFocusNote: (text: string) => void
    removeFocusNote: (id: string) => void
    clearFocusNotes: () => void

    setPomodoroLength: (min: number) => void
    setPomodoroResetThreshold: (min: number) => void
    setAccentTheme: (theme: AccentTheme) => void
    setUserName: (name: string) => void
    setFocusMode: (value: boolean) => void
    logPomodoroEvent: (videoId: string, event: PomodoroEvent) => void
    clearPomodoroSession: (videoId: string) => void

    /** merge a batch of fetched videos into the cache */
    upsertVideos: (videos: Video[]) => void
    addPlaylist: (playlist: Playlist) => void
    removePlaylist: (playlistId: string) => void
    /** create an empty user-made list and return its id */
    createList: (title: string) => string
    /** rename a user-made list (imported playlists take their title from YouTube on sync) */
    renamePlaylist: (playlistId: string, title: string) => void
    /** cache the video and append it to a user-made list (no-op if it's already there). Saving to
     *  INBOX_LIST_ID recreates the Inbox if it doesn't exist. */
    addVideoToList: (video: Video, playlistId: string) => void

    /**
     * Reconcile a stored playlist against a fresh fetch from YouTube. Preserves the user's video
     * order and local removals: retained videos keep their position, videos deleted upstream are
     * dropped unless the user explicitly restored them locally, and videos newly added upstream are
     * appended. Also refreshes title/channel and stamps lastSyncedAt. (Video metadata is refreshed
     * separately via upsertVideos.)
     */
    mergePlaylistContents: (
        playlistId: string,
        remote: { title: string; channelTitle: string; videoIds: string[] },
    ) => void

    reorderPlaylists: (orderedIds: string[]) => void
    reorderVideos: (playlistId: string, orderedVideoIds: string[]) => void
    removeVideoFromPlaylist: (playlistId: string, videoId: string) => void
    /** Undo a local removal: move a tombstoned video back into the playlist (appended to the end),
     *  clear its tombstone, and pin it (restoredVideoIds) so a later sync keeps it even if it's no
     *  longer found upstream. No-op if the video isn't currently tombstoned. */
    restoreVideoToPlaylist: (playlistId: string, videoId: string) => void

    setWatched: (videoId: string, watched: boolean) => void
    setPosition: (videoId: string, positionSec: number) => void

    /** next video id in a playlist after the given one, or null if at the end */
    getNextVideoId: (playlistId: string, currentVideoId: string) => string | null

    /** wipe all persisted data back to a fresh-install state */
    reset: () => void
}

const initialData = {
    apiKeyConfigured: false,
    playlists: [] as Playlist[],
    videos: {} as Record<string, Video>,
    progress: {} as Record<string, Progress>,
    accessToken: null as AccessToken | null,
    hasSignedIn: false,
    transcripts: {} as Record<string, TranscriptResult>,
    recallConfigured: false,
    settings: {
        pomodoroLengthMin: 25,
        pomodoroResetThresholdMin: 5,
        accentTheme: DEFAULT_ACCENT_THEME,
        userName: '',
        focusMode: true,
    },
    pomodoroSessions: {} as Record<string, PomodoroEvent[]>,
    focusNotes: [] as FocusNote[],
}

// Bumped by reset() (Clear all data). Async work that writes to the library (imports, syncs, metadata
// refreshes, the player's position and focus logs) reads it before awaiting and commits only if it
// hasn't changed, so an answer that lands after a reset can't fill the cleared library back in.
// Cancelling the requests instead would miss one whose response is already being handled.
let libraryEpoch = 0

/** The library's current epoch. Compare with a value read before an await to detect a reset. */
export const getLibraryEpoch = () => libraryEpoch

const INBOX_TITLE = 'Inbox'

type Settings = StoreState['settings']

/** Supported Pomodoro block length, in whole minutes (the Settings UI reads its bounds from here). */
export const POMODORO_LENGTH_RANGE = { min: 5, max: 60 } as const

function clampWhole(value: unknown, min: number, max: number, fallback: number): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
    return Math.min(max, Math.max(min, n))
}

/**
 * Keep the Pomodoro settings valid together: a whole-minute block within POMODORO_LENGTH_RANGE, and
 * a reset threshold ("pause within the first N minutes of a block") between 0 and the block length.
 * Every write path — the setters and the persisted-state migration — goes through this, so the
 * relationship can't be broken by one path and missed by another. Non-numeric values fall back to
 * `previous` (the value being replaced).
 */
function normalizeSettings(next: Settings, previous: Settings = initialData.settings): Settings {
    const pomodoroLengthMin = clampWhole(
        next.pomodoroLengthMin,
        POMODORO_LENGTH_RANGE.min,
        POMODORO_LENGTH_RANGE.max,
        previous.pomodoroLengthMin,
    )
    const pomodoroResetThresholdMin = clampWhole(
        next.pomodoroResetThresholdMin,
        0,
        pomodoroLengthMin,
        previous.pomodoroResetThresholdMin,
    )
    return { ...next, pomodoroLengthMin, pomodoroResetThresholdMin }
}

function newUserList(id: string, title: string): Playlist {
    const now = Date.now()
    return {
        id,
        ytPlaylistId: null,
        title,
        channelTitle: '',
        videoIds: [],
        removedVideoIds: [],
        restoredVideoIds: [],
        addedAt: now,
        lastSyncedAt: now,
    }
}

/** Drop repeats, keeping each id's first position. A list holds a video at most once (ADR 0011),
 *  but YouTube playlists may repeat one, so imported/synced ids pass through this. */
function unique(ids: string[]): string[] {
    return [...new Set(ids)]
}

/** Apply a requested order as a pure permutation of `current`: unknown or repeated ids are ignored
 *  and any id the request left out is kept (appended), so a reorder can never add or lose items. */
function permute(current: string[], ordered: string[]): string[] {
    const known = new Set(current)
    const placed = unique(ordered.filter((id) => known.has(id)))
    const placedSet = new Set(placed)
    return [...placed, ...current.filter((id) => !placedSet.has(id))]
}

function mergePlaylist(existing: Playlist | undefined, incoming: Playlist): Playlist {
    if (!existing) return incoming
    return {
        ...incoming,
        id: existing.id,
        addedAt: existing.addedAt,
    }
}

function updateProgressEntry(
    progress: Record<string, Progress>,
    videoId: string,
    next: Partial<Pick<Progress, 'watched' | 'lastPositionSec'>>,
): Record<string, Progress> {
    const previous = progress[videoId]
    return {
        ...progress,
        [videoId]: {
            watched: next.watched ?? previous?.watched ?? false,
            lastPositionSec: next.lastPositionSec ?? previous?.lastPositionSec ?? 0,
            updatedAt: Date.now(),
        },
    }
}

export const useStore = create<StoreState>()(
    persist(
        (set, get) => ({
            ...initialData,

            setApiKeyConfigured: (value) => set({ apiKeyConfigured: value }),
            setAccessToken: (token) => set({ accessToken: token }),
            setHasSignedIn: (value) => set({ hasSignedIn: value }),
            cacheTranscript: (videoId, result) =>
                set((s) => ({ transcripts: { ...s.transcripts, [videoId]: result } })),
            clearTranscript: (videoId) =>
                set((s) => {
                    const transcripts = { ...s.transcripts }
                    delete transcripts[videoId]
                    return { transcripts }
                }),
            setRecallConfigured: (value) => set({ recallConfigured: value }),

            // Normalized together: shortening the block pulls the reset threshold down with it.
            setPomodoroLength: (min) =>
                set((s) => ({ settings: normalizeSettings({ ...s.settings, pomodoroLengthMin: min }, s.settings) })),
            setPomodoroResetThreshold: (min) =>
                set((s) => ({
                    settings: normalizeSettings({ ...s.settings, pomodoroResetThresholdMin: min }, s.settings),
                })),
            setAccentTheme: (theme) => set((s) => ({ settings: { ...s.settings, accentTheme: theme } })),
            setUserName: (name) => set((s) => ({ settings: { ...s.settings, userName: name } })),
            setFocusMode: (value) => set((s) => ({ settings: { ...s.settings, focusMode: value } })),
            logPomodoroEvent: (videoId, event) =>
                set((s) => ({
                    pomodoroSessions: {
                        ...s.pomodoroSessions,
                        [videoId]: [...(s.pomodoroSessions[videoId] ?? []), event],
                    },
                })),
            clearPomodoroSession: (videoId) =>
                set((s) => {
                    const pomodoroSessions = { ...s.pomodoroSessions }
                    delete pomodoroSessions[videoId]
                    return { pomodoroSessions }
                }),

            addFocusNote: (text) =>
                set((s) => {
                    const trimmed = text.trim()
                    if (!trimmed) return s
                    const note: FocusNote = {
                        id: (crypto.randomUUID?.() ?? String(Date.now())),
                        text: trimmed,
                        at: Date.now(),
                    }
                    return { focusNotes: [note, ...s.focusNotes] }
                }),
            removeFocusNote: (id) =>
                set((s) => ({ focusNotes: s.focusNotes.filter((n) => n.id !== id) })),
            clearFocusNotes: () => set({ focusNotes: [] }),

            upsertVideos: (incoming) =>
                set((s) => {
                    const videos = { ...s.videos }
                    for (const v of incoming) videos[v.id] = v
                    return { videos }
                }),

            addPlaylist: (incoming) =>
                set((s) => {
                    const playlist = { ...incoming, videoIds: unique(incoming.videoIds) }
                    // replace if a playlist with the same YouTube id already exists
                    const existingIdx = s.playlists.findIndex(
                        (p) => p.ytPlaylistId && p.ytPlaylistId === playlist.ytPlaylistId,
                    )
                    const playlists = [...s.playlists]
                    if (existingIdx >= 0) {
                        playlists[existingIdx] = mergePlaylist(playlists[existingIdx], playlist)
                    }
                    else playlists.push(playlist)
                    return { playlists }
                }),

            removePlaylist: (playlistId) =>
                set((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlistId) })),

            createList: (title) => {
                const list = newUserList(createId(), title.trim() || 'Untitled list')
                set((s) => ({ playlists: [...s.playlists, list] }))
                return list.id
            },

            renamePlaylist: (playlistId, title) =>
                set((s) => {
                    const trimmed = title.trim()
                    if (!trimmed) return s
                    return {
                        playlists: s.playlists.map((p) =>
                            p.id === playlistId && isUserList(p) ? { ...p, title: trimmed } : p,
                        ),
                    }
                }),

            addVideoToList: (video, playlistId) =>
                set((s) => {
                    const videos = { ...s.videos, [video.id]: video }
                    const existing = s.playlists.find((p) => p.id === playlistId)
                    if (!existing) {
                        // Only the Inbox is recreated on demand (first save, or after it was deleted).
                        if (playlistId !== INBOX_LIST_ID) return s
                        const inbox = { ...newUserList(INBOX_LIST_ID, INBOX_TITLE), videoIds: [video.id] }
                        return { videos, playlists: [inbox, ...s.playlists] }
                    }
                    if (!isUserList(existing)) return s
                    // Immutably append (skip if already present — a list holds each video once, since
                    // ids key the sortable rows and the queue) so subscribers re-render.
                    const playlists = existing.videoIds.includes(video.id)
                        ? s.playlists
                        : s.playlists.map((p) =>
                            p.id === playlistId ? { ...p, videoIds: [...p.videoIds, video.id] } : p,
                        )
                    return { videos, playlists }
                }),

            mergePlaylistContents: (playlistId, remote) =>
                set((s) => {
                    const existing = s.playlists.find((p) => p.id === playlistId)
                    if (!existing) return s
                    const remoteIds = unique(remote.videoIds)
                    const remoteSet = new Set(remoteIds)
                    const existingSet = new Set(existing.videoIds)
                    const tombstoned = new Set(existing.removedVideoIds)
                    const restored = new Set(existing.restoredVideoIds)
                    // Keep the user's order; drop videos gone upstream UNLESS the user explicitly
                    // restored them (those are pinned to the local copy).
                    const retained = unique(existing.videoIds).filter(
                        (id) => remoteSet.has(id) || restored.has(id),
                    )
                    // ...then append videos newly added upstream, in their YouTube order — but skip
                    // any the user has removed locally (tombstones), so sync never resurrects them.
                    const added = remoteIds.filter(
                        (id) => !existingSet.has(id) && !tombstoned.has(id),
                    )
                    const videoIds = [...retained, ...added]
                    const mergedSet = new Set(videoIds)
                    const merged: Playlist = {
                        ...existing,
                        title: remote.title,
                        channelTitle: remote.channelTitle,
                        videoIds,
                        // A pin only exists to protect a restore from being dropped while it's gone
                        // upstream. Once a sync sees the video upstream again, the pin has served its
                        // purpose — drop it so normal sync rules resume. Also drop pins whose video
                        // is no longer present (defensive; removal already clears the pin).
                        restoredVideoIds: existing.restoredVideoIds.filter(
                            (id) => mergedSet.has(id) && !remoteSet.has(id),
                        ),
                        lastSyncedAt: Date.now(),
                    }
                    return {
                        playlists: s.playlists.map((p) => (p.id === playlistId ? merged : p)),
                    }
                }),

            reorderPlaylists: (orderedIds) =>
                set((s) => {
                    const byId = new Map(s.playlists.map((p) => [p.id, p]))
                    const playlists = permute(
                        s.playlists.map((p) => p.id),
                        orderedIds,
                    ).map((id) => byId.get(id)!)
                    return { playlists }
                }),

            reorderVideos: (playlistId, orderedVideoIds) =>
                set((s) => ({
                    playlists: s.playlists.map((p) =>
                        p.id === playlistId ? { ...p, videoIds: permute(p.videoIds, orderedVideoIds) } : p,
                    ),
                })),

            removeVideoFromPlaylist: (playlistId, videoId) =>
                set((s) => ({
                    playlists: s.playlists.map((p) =>
                        p.id === playlistId
                            ? {
                                ...p,
                                videoIds: p.videoIds.filter((id) => id !== videoId),
                                // Tombstone it so a later sync won't pull it back from upstream.
                                removedVideoIds:
                                    p.ytPlaylistId && !p.removedVideoIds.includes(videoId)
                                        ? [...p.removedVideoIds, videoId]
                                        : p.removedVideoIds,
                                restoredVideoIds: p.restoredVideoIds.filter((id) => id !== videoId),
                            }
                            : p,
                    ),
                })),

            restoreVideoToPlaylist: (playlistId, videoId) =>
                set((s) => ({
                    playlists: s.playlists.map((p) => {
                        if (p.id !== playlistId || !p.removedVideoIds.includes(videoId)) return p
                        return {
                            ...p,
                            removedVideoIds: p.removedVideoIds.filter((id) => id !== videoId),
                            restoredVideoIds: p.restoredVideoIds.includes(videoId)
                                ? p.restoredVideoIds
                                : [...p.restoredVideoIds, videoId],
                            videoIds: p.videoIds.includes(videoId)
                                ? p.videoIds
                                : [...p.videoIds, videoId],
                        }
                    }),
                })),

            setWatched: (videoId, watched) =>
                set((s) => {
                    return { progress: updateProgressEntry(s.progress, videoId, { watched }) }
                }),

            setPosition: (videoId, positionSec) =>
                set((s) => {
                    return { progress: updateProgressEntry(s.progress, videoId, { lastPositionSec: positionSec }) }
                }),

            getNextVideoId: (playlistId, currentVideoId) => {
                const pl = get().playlists.find((p) => p.id === playlistId)
                if (!pl) return null
                const idx = pl.videoIds.indexOf(currentVideoId)
                if (idx < 0 || idx >= pl.videoIds.length - 1) return null
                return pl.videoIds[idx + 1]
            },

            reset: () => {
                libraryEpoch += 1
                set({ ...initialData })
            },
        }),
        {
            name: 'digest-store',
            version: 11,
            // Persist everything except the short-lived access token (kept in memory only) and the
            // server-probed recallConfigured flag (always reconciled fresh on load).
            partialize: ({ accessToken: _omit, recallConfigured: _omitRecall, ...rest }) => rest,
            // v2 dropped the in-browser `oauthClientId` (OAuth moved to a server-side worker).
            // v3 dropped the in-browser `apiKey` (now a server-side HttpOnly cookie) — delete the
            // stale secret from localStorage; the user re-enters it once to set the cookie.
            // v4 added settings.accentTheme; v5 added settings.pomodoroResetThresholdMin —
            // backfill both on older state. v6 added playlist.lastSyncedAt — backfill from addedAt.
            // v7 added playlist.removedVideoIds (sync tombstones) — backfill to an empty array.
            // v8 added playlist.restoredVideoIds so explicit restores survive later syncs.
            // v9 added settings.focusMode — backfill to true (focus scaffolding stays on for
            // existing users). See ADR 0010.
            // v10 renamed the default "Saved videos" list to "Inbox" (same reserved id), unless the
            // user had already changed its title. See ADR 0011.
            // v11 dedupes playlist.videoIds: imports used to copy YouTube's repeats, breaking the
            // once-per-list rule (ADR 0011) that row keys and the queue depend on. It also repairs
            // Pomodoro settings older versions let drift apart (a threshold longer than its block).
            migrate: (persisted, version) => {
                if (persisted && typeof persisted === 'object') {
                    const data = persisted as Record<string, unknown>
                    delete data.oauthClientId
                    delete data.apiKey
                    const settings = (data.settings ?? {}) as Record<string, unknown>
                    if (!settings.accentTheme) settings.accentTheme = DEFAULT_ACCENT_THEME
                    if (typeof settings.userName !== 'string') settings.userName = ''
                    if (typeof settings.focusMode !== 'boolean') settings.focusMode = true
                    // Backfills missing/invalid Pomodoro values and repairs combinations older
                    // versions allowed (a threshold longer than its block).
                    data.settings = normalizeSettings(settings as unknown as Settings)
                    if (Array.isArray(data.playlists)) {
                        for (const p of data.playlists as Array<Record<string, unknown>>) {
                            if (typeof p.lastSyncedAt !== 'number') {
                                p.lastSyncedAt = typeof p.addedAt === 'number' ? p.addedAt : Date.now()
                            }
                            if (!Array.isArray(p.removedVideoIds)) p.removedVideoIds = []
                            if (!Array.isArray(p.restoredVideoIds)) p.restoredVideoIds = []
                            // Only for pre-v10 state: after that, "Saved videos" is a title the user chose.
                            if (version < 10 && p.id === INBOX_LIST_ID && p.title === 'Saved videos') {
                                p.title = INBOX_TITLE
                            }
                            if (Array.isArray(p.videoIds)) p.videoIds = unique(p.videoIds as string[])
                        }
                    }
                }
                return persisted as StoreState
            },
        },
    ),
)
