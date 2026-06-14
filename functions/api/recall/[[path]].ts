import { isCrossSite, json } from '../../_lib/http'
import { readRecallKey } from '../../_lib/recallkey'

// Same-origin proxy for the getrecall.ai (Recall) knowledge-base API. The browser calls
// /api/recall/cards?... with no credentials; this Function injects the Recall key server-side.
//
// The Recall `sk_` key grants read access to the user's ENTIRE knowledge base, so it must never
// reach the browser. Each user brings their own key, stored in the digest_recall_key HttpOnly
// cookie (see ./key.ts); the proxy injects it server-side. There is no shared/server-wide key — the
// Summary tab is available only to users who have configured their own. Only a fixed set of read
// endpoints is allowed, so this can't be used as an open relay. (See ADR 0009.)

const UPSTREAM = 'https://backend.getrecall.ai/api/v1'
const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/

/** Allow `GET /cards` (list) and `GET /cards/<cardId>` (single card) — nothing else. */
function isAllowed(segments: string[]): boolean {
    if (segments[0] !== 'cards') return false
    return segments.length === 1 || segments.length === 2
}

function getUpstreamUrl(request: Request, segments: string[]): string | null {
    const incoming = new URL(request.url)
    const path = segments.map(encodeURIComponent).join('/')

    if (segments.length === 1) {
        const videoId = incoming.searchParams.get('source_url_contains')?.trim() ?? ''
        if (!YOUTUBE_VIDEO_ID.test(videoId)) return null

        const qs = new URLSearchParams({ source_url_contains: videoId })
        return `${UPSTREAM}/${path}?${qs.toString()}`
    }

    if (incoming.search) return null
    return `${UPSTREAM}/${path}`
}

export const onRequest: PagesFunction = async ({ request, params }) => {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405 })
    if (isCrossSite(request)) return json({ error: 'forbidden' }, { status: 403 })

    const segments = Array.isArray(params.path) ? params.path : [params.path]
    if (!isAllowed(segments)) return json({ error: 'not_found' }, { status: 404 })
    const upstreamUrl = getUpstreamUrl(request, segments)
    if (!upstreamUrl) return json({ error: 'bad_request' }, { status: 400 })

    const recallKey = readRecallKey(request)
    if (!recallKey) {
        return json({ error: 'not_configured', message: 'No Recall key configured.' }, { status: 503 })
    }

    const upstream = await fetch(upstreamUrl, {
        headers: { Authorization: `Bearer ${recallKey}` },
    })

    // Pass the body + status through unchanged so the client sees Recall's own responses/errors.
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8')
    headers.set('Cache-Control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers })
}
