export type ParsedInput =
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'video'; videoId: string }
  | { kind: 'unknown' }

/**
 * Parse any common YouTube URL form (or a bare id) into a playlist or video target.
 * Playlist takes priority when a `list=` param is present, since that's the user's intent
 * when adding a playlist even if a `v=` is also in the URL.
 */
export function parseYouTubeInput(raw: string): ParsedInput {
  const input = raw.trim()
  if (!input) return { kind: 'unknown' }

  // Bare playlist id (PL..., UU..., LL..., FL..., OL...) pasted on its own
  if (/^(PL|UU|LL|FL|OL|RD)[\w-]{10,}$/.test(input)) {
    return { kind: 'playlist', playlistId: input }
  }
  // Bare 11-char video id
  if (/^[\w-]{11}$/.test(input)) {
    return { kind: 'video', videoId: input }
  }

  let url: URL
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`)
  } catch {
    return { kind: 'unknown' }
  }

  const host = url.hostname.replace(/^www\./, '')
  const list = url.searchParams.get('list')
  if (list && !list.startsWith('RD')) {
    // RD* are auto-generated "radio" mixes — ignore those, prefer the video if present
    return { kind: 'playlist', playlistId: list }
  }

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    if (id) return { kind: 'video', videoId: id }
  }

  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    const v = url.searchParams.get('v')
    if (v) return { kind: 'video', videoId: v }
    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)
    if (m) return { kind: 'video', videoId: m[1] }
  }

  if (list) return { kind: 'playlist', playlistId: list }
  return { kind: 'unknown' }
}
