// The /api Functions: per-user key storage (YouTube + Recall) and the two read-only proxies
// (architecture §2.2–2.3, ADR 0009). These are the trust boundary, so each test pins a security
// property: HttpOnly key cookies, cross-site rejection, allowlists, and no client-chosen credentials.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import * as youtubeKey from '../../functions/api/key'
import * as recallKey from '../../functions/api/recall/key'
import { onRequestGet as recallStatus } from '../../functions/api/recall/status'
import { onRequest as youtubeProxy } from '../../functions/api/youtube/[[path]]'
import { onRequest as recallProxy } from '../../functions/api/recall/[[path]]'
import { server } from '../support/msw'
import { call, req, setCookies } from './ctx'

const YT_PROBE = 'https://www.googleapis.com/youtube/v3/videos'
const RECALL_API = 'https://backend.getrecall.ai/api/v1/cards'

/** What a test needs from a request the proxy sent upstream. */
interface Seen {
    url: string
    headers: Headers
}

const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    req(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })

describe.each([
    {
        name: 'YouTube key (/api/key)',
        path: '/api/key',
        mod: youtubeKey,
        cookie: 'digest_yt_key',
        status: (cookie?: string) =>
            call(youtubeKey.onRequestGet, req('/api/key', { headers: cookie ? { Cookie: cookie } : {} })),
        probe: (resolver: Parameters<typeof http.get>[1]) => server.use(http.get(YT_PROBE, resolver)),
        // Google takes the key as a query parameter.
        credentialSent: (s: Seen) => new URL(s.url).searchParams.get('key'),
        rejectedStatus: 400,
    },
    {
        name: 'Recall key (/api/recall/key)',
        path: '/api/recall/key',
        mod: recallKey,
        cookie: 'digest_recall_key',
        status: (cookie?: string) =>
            call(recallStatus, req('/api/recall/status', { headers: cookie ? { Cookie: cookie } : {} })),
        probe: (resolver: Parameters<typeof http.get>[1]) => server.use(http.get(RECALL_API, resolver)),
        // Recall takes it as a Bearer token.
        credentialSent: (s: Seen) => s.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null,
        rejectedStatus: 401,
    },
])('$name', ({ path, mod, cookie, status, probe, credentialSent, rejectedStatus }) => {
    it('reports only whether a key is configured, never the key', async () => {
        expect(await (await status()).json()).toEqual({ configured: false })
        const res = await status(`${cookie}=SECRET`)
        const text = await res.text()
        expect(JSON.parse(text)).toEqual({ configured: true })
        expect(text).not.toContain('SECRET')
    })

    it('validates, then stores the trimmed key in a Strict, HttpOnly cookie scoped to /api', async () => {
        const probes: Seen[] = []
        probe(({ request }) => {
            probes.push({ url: request.url, headers: request.headers })
            return HttpResponse.json({ items: [], results: [] })
        })
        // An older key already stored must not be the one validated.
        const res = await call(mod.onRequestPost, postJson(path, { key: '  KEY-123  ' }, { Cookie: `${cookie}=OLD-KEY` }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ configured: true })
        expect(probes).toHaveLength(1)
        expect(credentialSent(probes[0])).toBe('KEY-123')
        expect(setCookies(res)[cookie]).toEqual({
            value: 'KEY-123',
            attrs: { path: '/api', samesite: 'Strict', httponly: '', secure: '', 'max-age': String(60 * 60 * 24 * 365) },
        })
    })

    it('rejects cross-site requests before doing anything', async () => {
        const res = await call(mod.onRequestPost, postJson(path, { key: 'k' }, { 'Sec-Fetch-Site': 'cross-site' }))
        expect(res.status).toBe(403)
        const del = await call(mod.onRequestDelete, req(path, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } }))
        expect(del.status).toBe(403)
    })

    it('requires a JSON body (so a cross-site form post cannot reach it)', async () => {
        const form = req(path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'key=k' })
        expect((await call(mod.onRequestPost, form)).status).toBe(415)
    })

    it.each([['not json', '{oops'], ['a missing key', {}], ['a blank key', { key: '   ' }], ['a non-string key', { key: 42 }]])(
        'is a 400 for %s',
        async (_label, body) => {
            expect((await call(mod.onRequestPost, postJson(path, body))).status).toBe(400)
        },
    )

    it('rejects a key the upstream refuses, with its message, and sets no cookie', async () => {
        probe(() => HttpResponse.json({ error: { message: 'API key not valid.' }, detail: 'API key not valid.' }, { status: rejectedStatus }))
        const res = await call(mod.onRequestPost, postJson(path, { key: 'bad' }))
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ error: 'invalid_key', message: 'API key not valid.' })
        expect(res.headers.getSetCookie()).toEqual([])
    })

    it.each([
        ['is down', () => new HttpResponse(null, { status: 503 })],
        ['is unreachable', () => HttpResponse.error()],
    ])('reports a 502 (not a bad key) when the upstream %s', async (_label, resolver) => {
        probe(resolver)
        const res = await call(mod.onRequestPost, postJson(path, { key: 'k' }))
        expect(res.status).toBe(502)
        expect(await res.json()).toMatchObject({ error: 'upstream_unavailable' })
        expect(res.headers.getSetCookie()).toEqual([])
    })

    it('DELETE expires the cookie', async () => {
        const res = await call(mod.onRequestDelete, req(path, { method: 'DELETE' }))
        expect(await res.json()).toEqual({ configured: false })
        expect(setCookies(res)[cookie].attrs).toMatchObject({ 'max-age': '0', path: '/api' })
    })
})

describe('/api/youtube/* proxy', () => {
    const proxy = (path: string, { method = 'GET', headers = {} }: { method?: string; headers?: Record<string, string> } = {}) => {
        const [resource, query = ''] = path.split('?')
        const segments = resource.split('/').filter(Boolean)
        return call(youtubeProxy, req(`/api/youtube/${resource}${query ? `?${query}` : ''}`, { method, headers }), {
            params: { path: segments },
        })
    }

    function upstream(status = 200, body: Record<string, unknown> = { items: [] }) {
        const seen: Seen[] = []
        server.use(
            http.get('https://www.googleapis.com/youtube/v3/:resource', ({ request }) => {
                seen.push({ url: request.url, headers: request.headers })
                return HttpResponse.json(body, { status })
            }),
        )
        return seen
    }

    it('injects the stored API key server-side and strips any client-supplied one', async () => {
        const seen = upstream()
        const res = await proxy('playlistItems?playlistId=PL1&key=ATTACKER', { headers: { Cookie: 'digest_yt_key=REAL' } })
        expect(res.status).toBe(200)
        const url = new URL(seen[0].url)
        expect(url.pathname).toBe('/youtube/v3/playlistItems')
        expect(url.searchParams.getAll('key')).toEqual(['REAL'])
        expect(url.searchParams.get('playlistId')).toBe('PL1')
    })

    it("forwards a signed-in user's Bearer token without adding the key", async () => {
        const seen = upstream()
        await proxy('playlists?mine=true', { headers: { Authorization: 'Bearer ya29', Cookie: 'digest_yt_key=REAL' } })
        expect(seen[0].headers.get('Authorization')).toBe('Bearer ya29')
        expect(new URL(seen[0].url).searchParams.has('key')).toBe(false)
    })

    it('is a 401 with neither a token nor a key', async () => {
        const res = await proxy('videos?id=x')
        expect(res.status).toBe(401)
        expect(await res.json()).toMatchObject({ error: 'no_credentials' })
    })

    it.each(['playlists', 'playlistItems', 'videos', 'channels'])('allows %s', async (resource) => {
        upstream()
        expect((await proxy(resource, { headers: { Cookie: 'digest_yt_key=K' } })).status).toBe(200)
    })

    it.each([['search'], ['commentThreads'], ['videos/extra'], ['../oauth2']])('refuses %s (not an open relay)', async (path) => {
        const res = await proxy(path, { headers: { Cookie: 'digest_yt_key=K' } })
        expect(res.status).toBe(404)
    })

    it('is GET-only and same-site only', async () => {
        expect((await proxy('videos', { method: 'POST' })).status).toBe(405)
        expect((await proxy('videos', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    })

    it("passes Google's status and body through, uncached", async () => {
        upstream(403, { error: { message: 'quotaExceeded' } })
        const res = await proxy('videos?id=x', { headers: { Cookie: 'digest_yt_key=K' } })
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: { message: 'quotaExceeded' } })
        expect(res.headers.get('Cache-Control')).toBe('no-store')
        expect(res.headers.get('Content-Type')).toMatch(/application\/json/)
    })
})

describe('/api/recall/* proxy', () => {
    const ID = 'dQw4w9WgXcQ'
    const proxy = (path: string, { method = 'GET', headers = { Cookie: 'digest_recall_key=sk_USER' } as Record<string, string> } = {}) => {
        const [resource] = path.split('?')
        return call(recallProxy, req(`/api/recall/${path}`, { method, headers }), {
            params: { path: resource.split('/').filter(Boolean) },
        })
    }

    function upstream() {
        const seen: Seen[] = []
        server.use(
            http.get(`${RECALL_API}*`, ({ request }) => {
                seen.push({ url: request.url, headers: request.headers })
                return HttpResponse.json({ results: [] })
            }),
        )
        return seen
    }

    it("looks up cards by video id with the user's key, dropping any other params", async () => {
        const seen = upstream()
        const res = await proxy(`cards?source_url_contains=${ID}&limit=1000&owner=someone`)
        expect(res.status).toBe(200)
        const url = new URL(seen[0].url)
        expect(url.pathname).toBe('/api/v1/cards')
        expect([...url.searchParams]).toEqual([['source_url_contains', ID]])
        expect(seen[0].headers.get('Authorization')).toBe('Bearer sk_USER')
    })

    it('fetches a single card', async () => {
        const seen = upstream()
        await proxy('cards/card-1')
        expect(new URL(seen[0].url).pathname).toBe('/api/v1/cards/card-1')
    })

    it.each([['cards'], ['cards?source_url_contains=short'], ['cards?source_url_contains=a%20b%20c%20d%20eeee'], ['cards/1?expand=all']])(
        'is a 400 for %s (only an 11-char video id lookup is allowed)',
        async (path) => {
            expect((await proxy(path)).status).toBe(400)
        },
    )

    it.each([['notes'], ['cards/1/chunks'], ['users/me']])('refuses %s', async (path) => {
        expect((await proxy(path)).status).toBe(404)
    })

    it('is a 503 when this browser has no Recall key (no shared server key, ADR 0009)', async () => {
        const res = await proxy(`cards?source_url_contains=${ID}`, { headers: {} })
        expect(res.status).toBe(503)
        expect(await res.json()).toMatchObject({ error: 'not_configured' })
    })

    it('is GET-only and same-site only', async () => {
        expect((await proxy('cards/1', { method: 'DELETE' })).status).toBe(405)
        expect((await proxy('cards/1', { headers: { 'Sec-Fetch-Site': 'cross-site', Cookie: 'digest_recall_key=k' } })).status).toBe(403)
    })
})
