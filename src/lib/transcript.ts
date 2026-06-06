import type { TranscriptResult, Video } from '../types'
import { YouTubeApiError } from './youtube'
import { downloadCaption, listCaptionTracks, parseVtt, pickTrack } from './captions'

/**
 * A transcript provider resolves a video to a transcript (or an explanation of why it's
 * unavailable). The official provider below covers videos the signed-in user owns.
 *
 * SEAM for non-owned videos (deferred — see plan Part 4): add a `ProxyTranscriptProvider`
 * that calls a self-hosted serverless function (`/api/transcript?videoId=`) or a third-party
 * transcript API, returning the same `TranscriptResult`. `getTranscript` would fall through
 * to it when the official route reports `unavailable`. No UI changes needed when added.
 */
export interface TranscriptProvider {
  fetch(video: Video, token: string | null): Promise<TranscriptResult>
}

export const officialProvider: TranscriptProvider = {
  async fetch(video, token) {
    if (!token) {
      return { status: 'unavailable', reason: 'Sign in to load transcripts for your own videos.' }
    }
    try {
      const tracks = await listCaptionTracks(video.id, token)
      const track = pickTrack(tracks)
      if (!track) {
        return { status: 'unavailable', reason: 'This video has no caption tracks.' }
      }
      const vtt = await downloadCaption(track.id, token)
      const lines = parseVtt(vtt)
      if (lines.length === 0) {
        return { status: 'unavailable', reason: 'The caption track was empty.' }
      }
      return { status: 'ok', lines, source: 'official', fetchedAt: Date.now() }
    } catch (e) {
      if (e instanceof YouTubeApiError) {
        if (e.status === 403) {
          return {
            status: 'unavailable',
            reason:
              'Transcripts via the official API are only available for videos on your own account. (Auto-generated captions often cannot be downloaded.)',
          }
        }
        return { status: 'unavailable', reason: e.message }
      }
      return { status: 'unavailable', reason: 'Could not load the transcript.' }
    }
  },
}

/** Resolve a transcript for a video using the official (owned-video) provider. */
export function getTranscript(video: Video, token: string | null): Promise<TranscriptResult> {
  return officialProvider.fetch(video, token)
}
