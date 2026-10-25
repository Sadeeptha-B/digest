export type ParsedInput =
    | { kind: 'playlist'; playlistId: string }
    | { kind: 'video'; videoId: string }
    | { kind: 'unknown' }

const BARE_PLAYLIST_ID = /^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/
const BARE_VIDEO_ID = /^[\w-]{11}$/

function matchesHost(host: string, expected: string): boolean {
    return host === expected || host.endsWith(`.${expected}`)
}

function toUrl(input: string): URL | null {
    try {
        return new URL(input.includes('://') ? input : `https://${input}`)
    } catch {
        return null
    }
}

/** The video a YouTube URL points at, ignoring any playlist it also names. */
function videoIdFromUrl(url: URL): string | null {
    const host = url.hostname.replace(/^www\./, '')

    // youtu.be/<id>
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null

    if (matchesHost(host, 'youtube.com') || matchesHost(host, 'youtube-nocookie.com')) {
        const v = url.searchParams.get('v')
        if (v) return v
        // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
        const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)
        if (m) return m[1]
    }
    return null
}

/**
 * Parse any common YouTube URL form (or a bare id) into a playlist or video target.
 * Playlist takes priority when a `list=` param is present, since that's the user's intent
 * when adding a playlist even if a `v=` is also in the URL.
 */
export function parseYouTubeInput(raw: string): ParsedInput {
    const input = raw.trim()
    if (!input) return { kind: 'unknown' }

    // Bare playlist id (PL..., UU..., LL..., FL..., OL...) pasted on its own
    if (BARE_PLAYLIST_ID.test(input)) return { kind: 'playlist', playlistId: input }
    // Bare 11-char video id
    if (BARE_VIDEO_ID.test(input)) return { kind: 'video', videoId: input }

    const url = toUrl(input)
    if (!url) return { kind: 'unknown' }

    const list = url.searchParams.get('list')
    if (list && !list.startsWith('RD')) {
        // RD* are auto-generated "radio" mixes — ignore those, prefer the video if present
        return { kind: 'playlist', playlistId: list }
    }

    const videoId = videoIdFromUrl(url)
    if (videoId) return { kind: 'video', videoId }

    if (list) return { kind: 'playlist', playlistId: list }
    return { kind: 'unknown' }
}

/**
 * The video id in a URL or bare id, regardless of any playlist it also names (unlike
 * parseYouTubeInput, which prefers the playlist). Null if there's no video.
 */
export function extractVideoId(raw: string): string | null {
    const input = raw.trim()
    if (BARE_PLAYLIST_ID.test(input)) return null
    if (BARE_VIDEO_ID.test(input)) return input
    const url = toUrl(input)
    return url ? videoIdFromUrl(url) : null
}
