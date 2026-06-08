import type { Video } from '../types'

// Calls go through the same-origin proxy (see /functions/api/youtube), which injects the OAuth
// token or the stored API key server-side. The browser never sends credentials in the URL.
export const API_BASE = '/api/youtube'

/** Credentials for a Data API call. With a token, the signed-in account's private content resolves;
 *  otherwise the proxy falls back to the user's stored API key (public/unlisted content only). */
export interface Auth {
  token?: string | null
}

export class YouTubeApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'YouTubeApiError'
    this.status = status
  }
}

/** Build a YouTubeApiError from a failed Response, preferring the API's JSON error message. */
export async function apiErrorFromResponse(res: Response): Promise<YouTubeApiError> {
  let detail = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    if (body?.error?.message) detail = body.error.message
  } catch {
    /* non-JSON / empty body — keep the status line */
  }
  return new YouTubeApiError(detail, res.status)
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

async function call<T>(path: string, params: Record<string, string>, auth: Auth): Promise<T> {
  const qs = new URLSearchParams({ ...params })
  const headers: Record<string, string> = {}
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`, { headers, credentials: 'same-origin' })
  if (!res.ok) throw await apiErrorFromResponse(res)
  return res.json() as Promise<T>
}

interface PlaylistsListResponse {
  nextPageToken?: string
  items: Array<{
    id: string
    snippet: { title: string; channelTitle: string }
    contentDetails?: { itemCount: number }
  }>
}

/** playlists.list — 1 quota unit. Returns title/channel for the playlist. */
export async function fetchPlaylistMeta(
  playlistId: string,
  auth: Auth,
): Promise<{ title: string; channelTitle: string }> {
  const data = await call<PlaylistsListResponse>(
    'playlists',
    { part: 'snippet', id: playlistId, maxResults: '1' },
    auth,
  )
  const item = data.items?.[0]
  if (!item) {
    throw new YouTubeApiError(
      auth.token ? 'Playlist not found.' : 'Playlist not found or is private (sign in to access your own).',
      404,
    )
  }
  return { title: item.snippet.title, channelTitle: item.snippet.channelTitle }
}

export interface MyPlaylist {
  id: string
  title: string
  itemCount: number
}

/**
 * playlists.list?mine=true, paginated — 1 unit/page. Lists ALL of the signed-in account's
 * playlists, including private ones. Requires a token.
 */
export async function listMyPlaylists(auth: Auth): Promise<MyPlaylist[]> {
  const out: MyPlaylist[] = []
  let pageToken: string | undefined
  do {
    const params: Record<string, string> = {
      part: 'snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
    }
    if (pageToken) params.pageToken = pageToken
    const data = await call<PlaylistsListResponse>('playlists', params, auth)
    for (const item of data.items ?? []) {
      out.push({
        id: item.id,
        title: item.snippet.title,
        itemCount: item.contentDetails?.itemCount ?? 0,
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

interface ChannelsListResponse {
  items?: Array<{ snippet?: { title?: string } }>
}

/**
 * channels.list?mine=true — 1 quota unit. Returns the signed-in account's channel title,
 * used to prefill the user's display name. Requires a token; '' if unavailable.
 */
export async function fetchMyChannelTitle(auth: Auth): Promise<string> {
  const data = await call<ChannelsListResponse>(
    'channels',
    { part: 'snippet', mine: 'true', maxResults: '1' },
    auth,
  )
  return data.items?.[0]?.snippet?.title ?? ''
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
export async function fetchAllPlaylistItems(playlistId: string, auth: Auth): Promise<Video[]> {
  const videos: Video[] = []
  let pageToken: string | undefined
  do {
    const params: Record<string, string> = {
      part: 'snippet',
      playlistId,
      maxResults: '50',
    }
    if (pageToken) params.pageToken = pageToken
    const data = await call<PlaylistItemsResponse>('playlistItems', params, auth)
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
export async function fetchVideo(videoId: string, auth: Auth): Promise<Video> {
  const data = await call<VideosListResponse>(
    'videos',
    { part: 'snippet', id: videoId, maxResults: '1' },
    auth,
  )
  const item = data.items?.[0]
  if (!item) {
    throw new YouTubeApiError(
      auth.token ? 'Video not found.' : 'Video not found or is private (sign in to access your own).',
      404,
    )
  }
  return {
    id: item.id,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnailUrl: pickThumb(item.snippet.thumbnails),
    isUnavailable: false,
  }
}
