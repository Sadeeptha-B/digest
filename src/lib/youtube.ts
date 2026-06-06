import type { Video } from '../types'

const API_BASE = 'https://www.googleapis.com/youtube/v3'

export class YouTubeApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'YouTubeApiError'
    this.status = status
  }
}

interface Thumbnails {
  [key: string]: { url: string; width: number; height: number } | undefined
}

function pickThumb(thumbs: Thumbnails | undefined): string {
  if (!thumbs) return ''
  return (
    thumbs.medium?.url ??
    thumbs.high?.url ??
    thumbs.standard?.url ??
    thumbs.default?.url ??
    ''
  )
}

async function call<T>(path: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: apiKey })
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* ignore parse errors */
    }
    throw new YouTubeApiError(detail, res.status)
  }
  return res.json() as Promise<T>
}

interface PlaylistsListResponse {
  items: Array<{ snippet: { title: string; channelTitle: string } }>
}

/** playlists.list — 1 quota unit. Returns title/channel for the playlist. */
export async function fetchPlaylistMeta(
  playlistId: string,
  apiKey: string,
): Promise<{ title: string; channelTitle: string }> {
  const data = await call<PlaylistsListResponse>(
    'playlists',
    { part: 'snippet', id: playlistId, maxResults: '1' },
    apiKey,
  )
  const item = data.items?.[0]
  if (!item) throw new YouTubeApiError('Playlist not found or is private.', 404)
  return { title: item.snippet.title, channelTitle: item.snippet.channelTitle }
}

interface PlaylistItemsResponse {
  nextPageToken?: string
  items: Array<{
    snippet: {
      title: string
      videoOwnerChannelTitle?: string
      thumbnails?: Thumbnails
      resourceId: { videoId: string }
    }
  }>
}

const UNAVAILABLE_TITLES = new Set(['Deleted video', 'Private video'])

/**
 * playlistItems.list, paginated — 1 quota unit per page (50 items each).
 * Returns the videos in playlist order. Deleted/private items are kept but flagged.
 */
export async function fetchAllPlaylistItems(playlistId: string, apiKey: string): Promise<Video[]> {
  const videos: Video[] = []
  let pageToken: string | undefined
  do {
    const params: Record<string, string> = {
      part: 'snippet',
      playlistId,
      maxResults: '50',
    }
    if (pageToken) params.pageToken = pageToken
    const data = await call<PlaylistItemsResponse>('playlistItems', params, apiKey)
    for (const item of data.items ?? []) {
      const s = item.snippet
      const id = s.resourceId?.videoId
      if (!id) continue
      const unavailable = UNAVAILABLE_TITLES.has(s.title) || !s.thumbnails
      videos.push({
        id,
        title: s.title,
        channelTitle: s.videoOwnerChannelTitle ?? '',
        thumbnailUrl: pickThumb(s.thumbnails),
        isUnavailable: unavailable,
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return videos
}

interface VideosListResponse {
  items: Array<{ id: string; snippet: { title: string; channelTitle: string; thumbnails?: Thumbnails } }>
}

/** videos.list — 1 quota unit. Fetch a single standalone video's metadata. */
export async function fetchVideo(videoId: string, apiKey: string): Promise<Video> {
  const data = await call<VideosListResponse>(
    'videos',
    { part: 'snippet', id: videoId, maxResults: '1' },
    apiKey,
  )
  const item = data.items?.[0]
  if (!item) throw new YouTubeApiError('Video not found or is unavailable.', 404)
  return {
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: pickThumb(item.snippet.thumbnails),
    isUnavailable: false,
  }
}
