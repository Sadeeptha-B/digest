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
  addedAt: number
}

export interface Progress {
  watched: boolean
  /** last playback position in seconds, for resume */
  lastPositionSec: number
  updatedAt: number
}

export interface TranscriptLine {
  startSec: number
  text: string
}

export type TranscriptResult =
  | {
      status: 'ok'
      lines: TranscriptLine[]
      source: 'official' | 'proxy' | 'manual'
      fetchedAt: number
    }
  | { status: 'unavailable'; reason: string }

export interface AccessToken {
  value: string
  /** epoch ms when the token expires */
  expiresAt: number
}

export const SAVED_VIDEOS_ID = 'saved-videos'
