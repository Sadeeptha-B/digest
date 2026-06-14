import { RECALL_KEY_COOKIE, RECALL_KEY_COOKIE_PATH, RECALL_KEY_MAX_AGE } from '../../_lib/recallkey'
import { expireCookie, isCrossSite, json, serializeCookie } from '../../_lib/http'

// Manage the per-browser getrecall.ai (Recall) API key:
//   POST   /api/recall/key — validate a key, then store it in an HttpOnly cookie
//   DELETE /api/recall/key — clear the stored key
// (Whether a key is configured is reported by GET /api/recall/status.)
//
// The key is the user's own Recall `sk_` key, which grants read access to their entire knowledge
// base — so it must never reach the browser. Storing it server-side keeps it out of localStorage
// and unreadable by page JS, while remaining per-user via the cookie. The integration is per-user
// only — there is no shared/server-wide key (see ./[[path]].ts and ADR 0009).

// A cheap auth probe: a card lookup filtered to a dummy id keeps the response tiny. A valid key
// returns 200 (even with no matching card); a bad key returns 401/403.
const RECALL_VALIDATE = 'https://backend.getrecall.ai/api/v1/cards?source_url_contains=00000000000'
const RECALL_UNAVAILABLE_MESSAGE = 'Could not reach Recall to validate the key. Try again later.'

async function messageFromProbe(probe: Response, fallback: string): Promise<string> {
    try {
        const body = (await probe.json()) as { detail?: string; message?: string; error?: string }
        return body?.detail || body?.message || body?.error || fallback
    } catch {
        return fallback
    }
}

export const onRequestPost: PagesFunction = async ({ request }) => {
    if (isCrossSite(request)) return json({ error: 'forbidden' }, { status: 403 })
    // Requiring JSON also stops cross-site form posts (they'd trigger a CORS preflight we reject).
    if (!request.headers.get('Content-Type')?.includes('application/json')) {
        return json({ error: 'bad_request' }, { status: 415 })
    }

    let key: unknown
    try {
        key = (await request.json<{ key?: unknown }>()).key
    } catch {
        return json({ error: 'bad_request', message: 'Expected JSON { key }.' }, { status: 400 })
    }
    if (typeof key !== 'string' || !key.trim()) {
        return json({ error: 'bad_request', message: 'A key is required.' }, { status: 400 })
    }
    key = key.trim()

    // Validate against the Recall API before storing, so a typo'd key fails here rather than
    // silently breaking the Summary tab later.
    let probe: Response
    try {
        probe = await fetch(RECALL_VALIDATE, { headers: { Authorization: `Bearer ${key as string}` } })
    } catch {
        return json({ error: 'upstream_unavailable', message: RECALL_UNAVAILABLE_MESSAGE }, { status: 502 })
    }
    if (!probe.ok) {
        if (probe.status === 401 || probe.status === 403) {
            const message = await messageFromProbe(probe, 'That Recall API key was rejected.')
            return json({ error: 'invalid_key', message }, { status: 400 })
        }
        const message = await messageFromProbe(probe, RECALL_UNAVAILABLE_MESSAGE)
        return json({ error: 'upstream_unavailable', message }, { status: 502 })
    }

    return json(
        { configured: true },
        {
            headers: {
                'Set-Cookie': serializeCookie(RECALL_KEY_COOKIE, key as string, {
                    path: RECALL_KEY_COOKIE_PATH,
                    maxAge: RECALL_KEY_MAX_AGE,
                    sameSite: 'Strict',
                }),
            },
        },
    )
}

export const onRequestDelete: PagesFunction = async ({ request }) => {
    if (isCrossSite(request)) return json({ error: 'forbidden' }, { status: 403 })
    return json({ configured: false }, { headers: { 'Set-Cookie': expireCookie(RECALL_KEY_COOKIE, RECALL_KEY_COOKIE_PATH) } })
}
