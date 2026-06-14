export interface Video {
    /** YouTube video id, e.g. "dQw4w9WgXcQ" */
    id: string
    title: string
    channelTitle: string
    thumbnailUrl: string
    /** true for deleted/private items that came back without real data */
    isUnavailable: boolean
}

export interface Playlist {
    /** internal id (uuid). For the reserved saved-videos list this is SAVED_VIDEOS_ID */
    id: string
    /** YouTube playlist id, or null for the standalone "Saved videos" pseudo-list */
    ytPlaylistId: string | null
    title: string
    channelTitle: string
    /** ordered list of Video ids; order = display/play order */
    videoIds: string[]
    /** Videos the user removed locally. Tombstoned so a later sync won't resurrect them even
     *  though they're still in the upstream YouTube playlist. Re-importing the playlist clears these. */
    removedVideoIds: string[]
    /** Tombstoned videos the user explicitly restored. These stay in the local copy even if a later
     *  sync no longer finds them upstream (for example, the source playlist removed them). */
    restoredVideoIds: string[]
    addedAt: number
    /** epoch ms of the last successful sync with YouTube. Equals addedAt right after import. */
    lastSyncedAt: number
}

export interface Progress {
    watched: boolean
    /** last playback position in seconds, for resume */
    lastPositionSec: number
    updatedAt: number
}

/** A jotted intrusive thought from the brain-dump / parking-lot widget. */
export interface FocusNote {
    id: string
    text: string
    at: number
}

export interface TranscriptLine {
    startSec: number
    text: string
}

export type TranscriptResult =
    | {
        status: 'ok'
        lines: TranscriptLine[]
        source: 'manual'
        fetchedAt: number
    }
    | { status: 'unavailable'; reason: string }

export type PomodoroEventType =
    | 'onramp-start'
    | 'work-start'
    | 'work-complete'
    | 'pause-reset'
    | 'pause-hold'
    | 'resume'
    | 'break-start'
    | 'break-skipped'
    | 'break-complete'
    | 'offramp'
    | 'done'

export interface PomodoroEvent {
    type: PomodoroEventType
    /** epoch ms */
    at: number
    /** 0-based block index this event relates to */
    index?: number
    /** duration of the just-ended work stretch, for work-complete / pause-reset */
    stretchSec?: number
}

export interface AccessToken {
    value: string
    /** epoch ms when the token expires */
    expiresAt: number
}

export const SAVED_VIDEOS_ID = 'saved-videos'
