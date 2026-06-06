import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SAVED_VIDEOS_ID,
  type AccessToken,
  type Playlist,
  type Progress,
  type TranscriptResult,
  type Video,
} from '../types'

interface StoreState {
  apiKey: string
  playlists: Playlist[]
  videos: Record<string, Video>
  progress: Record<string, Progress>

  /** OAuth client id fallback (persisted). The access token is in-memory only (not persisted). */
  oauthClientId: string
  accessToken: AccessToken | null
  /** Remembers that the user has signed in, so we can silently restore the session and skip
   *  the onboarding gate after a reload (the token itself is not persisted). */
  hasSignedIn: boolean
  /** cached transcripts keyed by videoId */
  transcripts: Record<string, TranscriptResult>

  setApiKey: (key: string) => void
  setOAuthClientId: (id: string) => void
  setAccessToken: (token: AccessToken | null) => void
  setHasSignedIn: (value: boolean) => void
  cacheTranscript: (videoId: string, result: TranscriptResult) => void

  /** merge a batch of fetched videos into the cache */
  upsertVideos: (videos: Video[]) => void
  addPlaylist: (playlist: Playlist) => void
  removePlaylist: (playlistId: string) => void
  /** append a single standalone video into the reserved "Saved videos" list */
  addStandaloneVideo: (video: Video) => void

  reorderPlaylists: (orderedIds: string[]) => void
  reorderVideos: (playlistId: string, orderedVideoIds: string[]) => void
  removeVideoFromPlaylist: (playlistId: string, videoId: string) => void

  setWatched: (videoId: string, watched: boolean) => void
  setPosition: (videoId: string, positionSec: number) => void

  /** next video id in a playlist after the given one, or null if at the end */
  getNextVideoId: (playlistId: string, currentVideoId: string) => string | null

  /** wipe all persisted data back to a fresh-install state */
  reset: () => void
}

const initialData = {
  apiKey: '',
  playlists: [] as Playlist[],
  videos: {} as Record<string, Video>,
  progress: {} as Record<string, Progress>,
  oauthClientId: '',
  accessToken: null as AccessToken | null,
  hasSignedIn: false,
  transcripts: {} as Record<string, TranscriptResult>,
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...initialData,

      setApiKey: (key) => set({ apiKey: key.trim() }),
      setOAuthClientId: (id) => set({ oauthClientId: id.trim() }),
      setAccessToken: (token) => set({ accessToken: token }),
      setHasSignedIn: (value) => set({ hasSignedIn: value }),
      cacheTranscript: (videoId, result) =>
        set((s) => ({ transcripts: { ...s.transcripts, [videoId]: result } })),

      upsertVideos: (incoming) =>
        set((s) => {
          const videos = { ...s.videos }
          for (const v of incoming) videos[v.id] = v
          return { videos }
        }),

      addPlaylist: (playlist) =>
        set((s) => {
          // replace if a playlist with the same YouTube id already exists
          const existingIdx = s.playlists.findIndex(
            (p) => p.ytPlaylistId && p.ytPlaylistId === playlist.ytPlaylistId,
          )
          const playlists = [...s.playlists]
          if (existingIdx >= 0) playlists[existingIdx] = playlist
          else playlists.push(playlist)
          return { playlists }
        }),

      removePlaylist: (playlistId) =>
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlistId) })),

      addStandaloneVideo: (video) =>
        set((s) => {
          const videos = { ...s.videos, [video.id]: video }
          const playlists = [...s.playlists]
          let saved = playlists.find((p) => p.id === SAVED_VIDEOS_ID)
          if (!saved) {
            saved = {
              id: SAVED_VIDEOS_ID,
              ytPlaylistId: null,
              title: 'Saved videos',
              channelTitle: '',
              videoIds: [],
              addedAt: Date.now(),
            }
            playlists.unshift(saved)
          }
          if (!saved.videoIds.includes(video.id)) {
            saved.videoIds = [...saved.videoIds, video.id]
          }
          return { videos, playlists }
        }),

      reorderPlaylists: (orderedIds) =>
        set((s) => {
          const byId = new Map(s.playlists.map((p) => [p.id, p]))
          const playlists = orderedIds
            .map((id) => byId.get(id))
            .filter((p): p is Playlist => Boolean(p))
          return { playlists }
        }),

      reorderVideos: (playlistId, orderedVideoIds) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId ? { ...p, videoIds: orderedVideoIds } : p,
          ),
        })),

      removeVideoFromPlaylist: (playlistId, videoId) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, videoIds: p.videoIds.filter((id) => id !== videoId) }
              : p,
          ),
        })),

      setWatched: (videoId, watched) =>
        set((s) => {
          const prev = s.progress[videoId]
          return {
            progress: {
              ...s.progress,
              [videoId]: {
                watched,
                lastPositionSec: prev?.lastPositionSec ?? 0,
                updatedAt: Date.now(),
              },
            },
          }
        }),

      setPosition: (videoId, positionSec) =>
        set((s) => {
          const prev = s.progress[videoId]
          return {
            progress: {
              ...s.progress,
              [videoId]: {
                watched: prev?.watched ?? false,
                lastPositionSec: positionSec,
                updatedAt: Date.now(),
              },
            },
          }
        }),

      getNextVideoId: (playlistId, currentVideoId) => {
        const pl = get().playlists.find((p) => p.id === playlistId)
        if (!pl) return null
        const idx = pl.videoIds.indexOf(currentVideoId)
        if (idx < 0 || idx >= pl.videoIds.length - 1) return null
        return pl.videoIds[idx + 1]
      },

      reset: () => set({ ...initialData }),
    }),
    {
      name: 'digest-store',
      version: 1,
      // Persist everything except the short-lived access token (kept in memory only).
      partialize: ({ accessToken: _omit, ...rest }) => rest,
    },
  ),
)
