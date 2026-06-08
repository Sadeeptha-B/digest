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
    const probe = await fetch(`${YT_VALIDATE}${encodeURIComponent(key as string)}`)
    if (!probe.ok) {
        let message = 'That API key was rejected by Google.'
        try {
            const body = (await probe.json()) as { error?: { message?: string } }
            if (body?.error?.message) message = body.error.message
        } catch {
            /* keep the default message */
        }
        return json({ error: 'invalid_key', message }, { status: 400 })
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
