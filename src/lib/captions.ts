import type { TranscriptLine } from '../types'
import { YouTubeApiError } from './youtube'

const API_BASE = 'https://www.googleapis.com/youtube/v3'

interface CaptionTrack {
  id: string
  language: string
  trackKind: string // 'standard' | 'ASR' | 'forced'
  name: string
}

interface CaptionsListResponse {
  items: Array<{
    id: string
    snippet: { language: string; trackKind: string; name: string }
  }>
}

async function authedText(url: string, token: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error?.message) detail = body.error.message
    } catch {
      /* non-JSON body */
    }
    throw new YouTubeApiError(detail, res.status)
  }
  return res
}

/** captions.list — 50 quota units. Lists caption tracks for a video the user can edit. */
export async function listCaptionTracks(videoId: string, token: string): Promise<CaptionTrack[]> {
  const qs = new URLSearchParams({ part: 'snippet', videoId })
  const res = await authedText(`${API_BASE}/captions?${qs}`, token)
  const data = (await res.json()) as CaptionsListResponse
  return (data.items ?? []).map((i) => ({
    id: i.id,
    language: i.snippet.language,
    trackKind: i.snippet.trackKind,
    name: i.snippet.name,
  }))
}

/** Prefer a manually-uploaded English track; fall back to any manual track, then anything. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null
  const isEn = (t: CaptionTrack) => t.language?.toLowerCase().startsWith('en')
  const isManual = (t: CaptionTrack) => t.trackKind !== 'ASR'
  return (
    tracks.find((t) => isManual(t) && isEn(t)) ??
    tracks.find((t) => isManual(t)) ??
    tracks.find((t) => isEn(t)) ??
    tracks[0]
  )
}

/** captions.download — 200 quota units. Returns the raw caption file (WebVTT). */
export async function downloadCaption(captionId: string, token: string): Promise<string> {
  const qs = new URLSearchParams({ tfmt: 'vtt' })
  const res = await authedText(`${API_BASE}/captions/${captionId}?${qs}`, token)
  return res.text()
}

function timestampToSeconds(ts: string): number {
  // HH:MM:SS.mmm or MM:SS.mmm
  const parts = ts.trim().split(':')
  let s = 0
  for (const p of parts) s = s * 60 + parseFloat(p)
  return s
}

/** Strip WebVTT inline tags (<c>, <00:00:01.000>, <v ...>) and collapse whitespace. */
function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parse WebVTT into transcript lines. Cues are separated by blank lines; the timing line
 * contains "-->". Consecutive identical lines (common in rolling ASR-style captions) are
 * de-duplicated.
 */
export function parseVtt(vtt: string): TranscriptLine[] {
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/)
  const lines: TranscriptLine[] = []
  for (const block of blocks) {
    const rows = block.split('\n').filter(Boolean)
    const timingIdx = rows.findIndex((r) => r.includes('-->'))
    if (timingIdx === -1) continue
    const start = rows[timingIdx].split('-->')[0]
    const text = cleanText(rows.slice(timingIdx + 1).join(' '))
    if (!text) continue
    const startSec = timestampToSeconds(start)
    if (lines.length && lines[lines.length - 1].text === text) continue
    lines.push({ startSec, text })
  }
  return lines
}
