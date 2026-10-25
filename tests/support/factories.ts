import { useStore } from '../../src/store/useStore'
import type { Playlist, Video } from '../../src/types'

export function video(id: string, overrides: Partial<Video> = {}): Video {
    return {
        id,
        title: `Video ${id}`,
        channelTitle: 'Channel',
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        isUnavailable: false,
        ...overrides,
    }
}

/** An imported (YouTube-backed) playlist, as AddBar builds it. */
export function imported(id: string, videoIds: string[], overrides: Partial<Playlist> = {}): Playlist {
    return {
        id,
        ytPlaylistId: `PL${id}`,
        title: `Playlist ${id}`,
        channelTitle: 'Owner',
        videoIds,
        removedVideoIds: [],
        restoredVideoIds: [],
        addedAt: 1_000,
        lastSyncedAt: Date.now(), // fresh, so opening it does not trigger an auto-sync
        ...overrides,
    }
}

export const store = () => useStore.getState()

export const playlist = (id: string): Playlist => {
    const p = store().playlists.find((pl) => pl.id === id)
    if (!p) throw new Error(`no playlist ${id}`)
    return p
}
