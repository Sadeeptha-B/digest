import type { TranscriptLine } from '../types'

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
 * Parse WebVTT **or** SubRip (.srt) into transcript lines. Cues are separated by blank lines;
 * the timing line contains "-->" (SRT uses a comma for milliseconds, which we normalise).
 * Any leading SRT index line sits before the timing line and is ignored. Consecutive identical
 * lines (common in rolling ASR-style captions) are de-duplicated.
 */
export function parseVtt(vtt: string): TranscriptLine[] {
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/)
  const lines: TranscriptLine[] = []
  for (const block of blocks) {
    const rows = block.split('\n').filter(Boolean)
    const timingIdx = rows.findIndex((r) => r.includes('-->'))
    if (timingIdx === -1) continue
    const start = rows[timingIdx].split('-->')[0].trim().replace(',', '.')
    const text = cleanText(rows.slice(timingIdx + 1).join(' '))
    if (!text) continue
    const startSec = timestampToSeconds(start)
    if (lines.length && lines[lines.length - 1].text === text) continue
    lines.push({ startSec, text })
  }
  return lines
}

/** Parse an uploaded caption file (.vtt or .srt) into transcript lines. */
export function parseCaptionFile(text: string): TranscriptLine[] {
  return parseVtt(text)
}
