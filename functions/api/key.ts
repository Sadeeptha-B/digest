import { KEY_COOKIE, KEY_COOKIE_PATH, KEY_MAX_AGE, readApiKey } from '../_lib/apikey'
import { expireCookie, isCrossSite, json, serializeCookie } from '../_lib/http'

// Manage the per-browser YouTube Data API key:
//   GET    /api/key — report whether a key is configured (the value itself is never returned)
//   POST   /api/key — validate a key, then store it in an HttpOnly cookie
//   DELETE /api/key — clear the stored key
//
// The key is the user's own (their Google Cloud project / quota). Storing it server-side keeps it
// out of localStorage and unreadable by page JS, while remaining per-user via the cookie.

const YT_VALIDATE = 'https://www.googleapis.com/youtube/v3/videos?part=id&id=BaW_jenozKc&maxResults=1&key='
const YT_UNAVAILABLE_MESSAGE = 'Could not reach Google to validate the key. Try again later.'

export const onRequestGet: PagesFunction = async ({ request }) => {
    return json({ configured: Boolean(readApiKey(request)) })
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

    // Validate against the Data API (1 quota unit). This also surfaces the common mistake of an
    // HTTP-referrer-restricted key, which fails server-side — it must be API-restricted instead.
    let probe: Response
    try {
        probe = await fetch(`${YT_VALIDATE}${encodeURIComponent(key as string)}`)
    } catch {
        return json({ error: 'upstream_unavailable', message: YT_UNAVAILABLE_MESSAGE }, { status: 502 })
    }
    if (!probe.ok) {
        // 4xx is about the key (invalid, wrong restriction, API not enabled, quota); 5xx is Google.
        const keyProblem = probe.status < 500
        let message = keyProblem ? 'That API key was rejected by Google.' : YT_UNAVAILABLE_MESSAGE
        try {
            const body = (await probe.json()) as { error?: { message?: string } }
            if (body?.error?.message) message = body.error.message
        } catch {
            /* keep the default message */
        }
        return keyProblem
            ? json({ error: 'invalid_key', message }, { status: 400 })
            : json({ error: 'upstream_unavailable', message }, { status: 502 })
    }

    return json(
        { configured: true },
        {
            headers: {
                'Set-Cookie': serializeCookie(KEY_COOKIE, key as string, {
                    path: KEY_COOKIE_PATH,
                    maxAge: KEY_MAX_AGE,
                    sameSite: 'Strict',
                }),
            },
        },
    )
}

export const onRequestDelete: PagesFunction = async ({ request }) => {
    if (isCrossSite(request)) return json({ error: 'forbidden' }, { status: 403 })
    return json({ configured: false }, { headers: { 'Set-Cookie': expireCookie(KEY_COOKIE, KEY_COOKIE_PATH) } })
}
