// Reads getrecall.ai (Recall) summaries through the same-origin proxy (see /functions/api/recall),
// which injects the Recall API key server-side. The browser never holds the key; it only ever talks
// to /api/recall/*.
//
// A Recall "card" is the AI summary Recall generates for a saved video. We find the card whose
// source_url contains the YouTube video id, then fetch its content chunks. Chunks may carry
// `timestamps` (e.g. ["01:23"]) that map onto the video for click-to-seek.

import { parseYouTubeInput } from './parseUrl'

const RECALL_BASE = '/api/recall'

export interface RecallChunk {
    chunk_id: string
    content: string
    source?: string
    /** time codes like "01:23" / "1:02:03"; present when the summary point maps to a moment */
    timestamps?: string[]
}

export interface RecallCardSummary {
    id: string
    title: string
    created_at?: string
    source_url?: string
}

export interface RecallCard {
    id: string
    title: string
    chunks: RecallChunk[]
    created_at?: string
    source_url?: string
}

interface CardsListResponse {
    results?: RecallCardSummary[]
    total_count?: number
}

// Session cache keyed by videoId. Summaries are cheap to refetch and can change in Recall, so we
// don't persist them (unlike effortful manual transcripts) — this just avoids refetching while
// navigating back and forth within a session. `null` means "looked up, no card".
const cardCache = new Map<string, RecallCard | null>()

function matchesVideoId(sourceUrl: string | undefined, videoId: string): boolean {
    if (!sourceUrl) return false
    const parsed = parseYouTubeInput(sourceUrl)
    return parsed.kind === 'video' && parsed.videoId === videoId
}

function toChunk(value: unknown): RecallChunk | null {
    if (!value || typeof value !== 'object') return null
    const chunk = value as Record<string, unknown>
    if (typeof chunk.chunk_id !== 'string' || typeof chunk.content !== 'string') return null
    return {
        chunk_id: chunk.chunk_id,
        content: chunk.content,
        source: typeof chunk.source === 'string' ? chunk.source : undefined,
        timestamps: Array.isArray(chunk.timestamps)
            ? chunk.timestamps.filter((ts): ts is string => typeof ts === 'string')
            : undefined,
    }
}

function toCard(value: unknown): RecallCard {
    if (!value || typeof value !== 'object') {
        throw new Error('Recall card payload was invalid')
    }
    const card = value as Record<string, unknown>
    const id = typeof card.id === 'string' ? card.id : typeof card.card_id === 'string' ? card.card_id : ''
    if (!id || typeof card.title !== 'string') {
        throw new Error('Recall card payload was missing required fields')
    }
    return {
        id,
        title: card.title,
        created_at: typeof card.created_at === 'string' ? card.created_at : undefined,
        source_url: typeof card.source_url === 'string' ? card.source_url : undefined,
        chunks: Array.isArray(card.chunks) ? card.chunks.map(toChunk).filter((chunk): chunk is RecallChunk => chunk !== null) : [],
    }
}

/** Whether the Recall integration is configured on the server. Never throws (false on any failure,
 *  e.g. running plain `vite dev` with no Functions). */
export async function getRecallStatus(): Promise<boolean> {
    try {
        const res = await fetch(`${RECALL_BASE}/status`, { credentials: 'same-origin' })
        if (!res.ok) return false
        const { configured } = (await res.json()) as { configured?: boolean }
        return Boolean(configured)
    } catch {
        return false
    }
}

/** Find the Recall card for a video by matching its id against card source URLs. Null if none. */
async function findCardForVideo(videoId: string): Promise<RecallCardSummary | null> {
    const qs = new URLSearchParams({ source_url_contains: videoId })
    const res = await fetch(`${RECALL_BASE}/cards?${qs.toString()}`, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`Recall cards lookup failed (${res.status})`)
    const data = (await res.json()) as CardsListResponse
    return data.results?.find((card) => matchesVideoId(card.source_url, videoId)) ?? null
}

/** Fetch a single card's content chunks. */
async function fetchCard(cardId: string): Promise<RecallCard> {
    const res = await fetch(`${RECALL_BASE}/cards/${encodeURIComponent(cardId)}`, {
        credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(`Recall card fetch failed (${res.status})`)
    return toCard(await res.json())
}

/** Resolve the Recall summary card for a video (or null if none is saved), with session caching. */
export async function getCardForVideo(videoId: string): Promise<RecallCard | null> {
    if (cardCache.has(videoId)) return cardCache.get(videoId) ?? null
    const summary = await findCardForVideo(videoId)
    const card = summary ? await fetchCard(summary.id) : null
    cardCache.set(videoId, card)
    return card
}
