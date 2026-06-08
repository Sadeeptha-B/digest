import { readApiKey } from '../../_lib/apikey'
import { isCrossSite, json } from '../../_lib/http'

// Same-origin proxy for the YouTube Data API. The browser calls /api/youtube/<resource>?... with
// no credentials in the URL; this Function adds them server-side:
//   - signed-in users: forward their OAuth Bearer token (their token never needs a key)
//   - otherwise:       inject the user's stored API key from the HttpOnly cookie
// Only a fixed set of read endpoints is allowed, so the proxy can't be used as an open relay.

const UPSTREAM = 'https://www.googleapis.com/youtube/v3'
const ALLOWED_RESOURCES = new Set(['playlists', 'playlistItems', 'videos', 'channels'])

export const onRequest: PagesFunction = async ({ request, params }) => {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405 })
    if (isCrossSite(request)) return json({ error: 'forbidden' }, { status: 403 })

    const segments = Array.isArray(params.path) ? params.path : [params.path]
    const resource = segments[0]
    if (segments.length !== 1 || !ALLOWED_RESOURCES.has(resource)) {
        return json({ error: 'not_found' }, { status: 404 })
    }

    const incoming = new URL(request.url)
    const qs = new URLSearchParams(incoming.search)
    qs.delete('key') // never trust a client-supplied key

    const authorization = request.headers.get('Authorization')
    if (!authorization) {
        const key = readApiKey(request)
        if (!key) return json({ error: 'no_credentials', message: 'Sign in or add an API key.' }, { status: 401 })
        qs.set('key', key)
    }

    const upstream = await fetch(`${UPSTREAM}/${resource}?${qs.toString()}`, {
        headers: authorization ? { Authorization: authorization } : {},
    })

    // Pass the body + status through unchanged so the client keeps reading Google's error messages.
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/json; charset=utf-8')
    headers.set('Cache-Control', 'no-store')
    return new Response(upstream.body, { status: upstream.status, headers })
}
