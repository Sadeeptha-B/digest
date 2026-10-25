// The OAuth broker (functions/auth/*): Authorization Code + PKCE with the secret and refresh token
// kept server-side (ADR 0002, architecture §2.1).
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { onRequestGet as callback } from '../../functions/auth/callback'
import { onRequestGet as login } from '../../functions/auth/login'
import { onRequestPost as logout } from '../../functions/auth/logout'
import { onRequestPost as refresh } from '../../functions/auth/refresh'
import { pkceChallenge } from '../../functions/_lib/google'
import { server } from '../support/msw'
import { call, ORIGIN, req, SECRETS, setCookies } from './ctx'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/** The JSON the popup page posts back to the SPA. */
async function popupMessage(res: Response) {
    const html = await res.text()
    const m = html.match(/postMessage\((\{.*\}), "(.*?)"\)/)
    if (!m) throw new Error('no postMessage in popup')
    return { message: JSON.parse(m[1]), targetOrigin: m[2] }
}

describe('/auth/login', () => {
    it('refuses to start without server secrets', async () => {
        const res = await call(login, req('/auth/login'))
        expect(res.status).toBe(500)
    })

    it('redirects to Google consent with state + an S256 challenge bound to short-lived cookies', async () => {
        const res = await call(login, req('/auth/login'), { env: SECRETS })
        expect(res.status).toBe(302)
        const location = new URL(res.headers.get('Location')!)
        const q = Object.fromEntries(location.searchParams)
        expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
        expect(q).toMatchObject({
            client_id: 'client-id',
            redirect_uri: `${ORIGIN}/auth/callback`,
            response_type: 'code',
            scope: 'https://www.googleapis.com/auth/youtube.readonly',
            access_type: 'offline',
            prompt: 'consent',
            code_challenge_method: 'S256',
        })
        expect(q).not.toHaveProperty('client_secret')

        const cookies = setCookies(res)
        expect(cookies.digest_oauth_state.value).toBe(q.state)
        expect(await pkceChallenge(cookies.digest_oauth_verifier.value)).toBe(q.code_challenge)
        for (const c of [cookies.digest_oauth_state, cookies.digest_oauth_verifier]) {
            expect(c.attrs).toMatchObject({ path: '/auth', 'max-age': '600', httponly: '', secure: '', samesite: 'Lax' })
        }
        expect(res.headers.get('Cache-Control')).toBe('no-store')
    })
})

describe('/auth/callback', () => {
    const cookie = 'digest_oauth_state=S; digest_oauth_verifier=V'
    const cb = (query: string, headers: Record<string, string> = { Cookie: cookie }) =>
        call(callback, req(`/auth/callback?${query}`, { headers }), { env: SECRETS })

    function expectTransientCleared(res: Response) {
        const cookies = setCookies(res)
        expect(cookies.digest_oauth_state.attrs['max-age']).toBe('0')
        expect(cookies.digest_oauth_verifier.attrs['max-age']).toBe('0')
    }

    it('reports a misconfigured server to the popup', async () => {
        const res = await call(callback, req('/auth/callback?code=c&state=S', { headers: { Cookie: cookie } }))
        expect((await popupMessage(res)).message.error).toBe('server_misconfigured')
        expectTransientCleared(res)
    })

    it('explains a refused consent (a non-Test user, or Cancel) and points at the API-key path', async () => {
        const res = await cb('error=access_denied&state=S')
        const { message } = await popupMessage(res)
        expect(message).toMatchObject({ type: 'digest-oauth', error: 'access_denied' })
        expect(message.error_description).toMatch(/approved/)
        expect(message.error_description).toMatch(/API key/)
        expectTransientCleared(res)
    })

    it("relays any other Google error code with Google's own description", async () => {
        const res = await cb('error=invalid_scope&error_description=Bad+scope&state=S')
        expect((await popupMessage(res)).message).toEqual({
            type: 'digest-oauth',
            error: 'invalid_scope',
            error_description: 'Bad scope',
        })
    })

    it.each([
        ['a truncated JSON body', () => new HttpResponse('{"access_token":"ya29', { status: 200, headers: { 'Content-Type': 'application/json' } })],
        ['a null body', () => HttpResponse.json(null)],
        ['no access token', () => HttpResponse.json({ expires_in: 3599 })],
        ['a non-numeric expiry', () => HttpResponse.json({ access_token: 'a', expires_in: 'soon' })],
    ])('answers the popup with a normal failure when Google returns %s', async (_label, resolver) => {
        server.use(http.post(TOKEN_URL, resolver))
        const res = await cb('code=c&state=S')
        expect((await popupMessage(res)).message.error).toBe('token_exchange_failed')
        expect(setCookies(res)).not.toHaveProperty('digest_rt')
        expectTransientCleared(res)
    })

    it.each([
        ['a state mismatch (CSRF)', 'code=c&state=FORGED', { Cookie: cookie }],
        ['a missing state', 'code=c', { Cookie: cookie }],
        ['no state cookie', 'code=c&state=S', {}],
        ['an expired verifier', 'code=c&state=S', { Cookie: 'digest_oauth_state=S' }],
    ])('rejects %s without contacting Google', async (_label, query, headers) => {
        const res = await cb(query, headers) // MSW fails the test on any unhandled request
        expect((await popupMessage(res)).message.error).toBe('invalid_state')
        expectTransientCleared(res)
    })

    it('exchanges the code with the secret + verifier and hands only the access token to the SPA', async () => {
        let form: URLSearchParams | undefined
        server.use(
            http.post(TOKEN_URL, async ({ request }) => {
                form = new URLSearchParams(await request.text())
                return HttpResponse.json({ access_token: 'ya29.A', expires_in: 3599, refresh_token: '1//R' })
            }),
        )
        const res = await cb('code=CODE&state=S')
        expect(Object.fromEntries(form!)).toEqual({
            code: 'CODE',
            client_id: 'client-id',
            client_secret: 'client-secret',
            redirect_uri: `${ORIGIN}/auth/callback`,
            grant_type: 'authorization_code',
            code_verifier: 'V',
        })
        const { message, targetOrigin } = await popupMessage(res)
        expect(message).toEqual({ type: 'digest-oauth', access_token: 'ya29.A', expires_in: 3599 })
        expect(targetOrigin).toBe(ORIGIN)
        const cookies = setCookies(res)
        expect(cookies.digest_rt).toMatchObject({
            value: '1//R',
            attrs: { path: '/auth', httponly: '', secure: '', samesite: 'Lax', 'max-age': String(60 * 60 * 24 * 180) },
        })
        expectTransientCleared(res)
    })

    it('keeps the existing refresh cookie when Google omits a new one', async () => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.json({ access_token: 'a', expires_in: 1 })))
        const res = await cb('code=c&state=S')
        expect(setCookies(res)).not.toHaveProperty('digest_rt')
    })

    it('reports a failed exchange', async () => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })))
        const res = await cb('code=c&state=S')
        expect((await popupMessage(res)).message.error).toBe('token_exchange_failed')
        expectTransientCleared(res)
    })

    it('tells the operator, not the user, when the client credentials are wrong', async () => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.json({ error: 'invalid_client' }, { status: 401 })))
        const res = await cb('code=c&state=S')
        expect((await popupMessage(res)).message.error).toBe('server_misconfigured')
    })

    it('still answers the popup when Google is unreachable (instead of a bare error page)', async () => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.error()))
        const res = await cb('code=c&state=S')
        expect((await popupMessage(res)).message.error).toBe('token_exchange_failed')
        expectTransientCleared(res)
    })
})

describe('/auth/refresh', () => {
    const post = (cookie?: string, env: Record<string, string> = SECRETS) =>
        call(refresh, req('/auth/refresh', { method: 'POST', headers: cookie ? { Cookie: cookie } : {} }), { env })

    it('is a 500 without server secrets', async () => {
        expect((await post('digest_rt=R', {})).status).toBe(500)
    })

    it('is a 401 no_session without a refresh cookie', async () => {
        const res = await post()
        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'no_session' })
    })

    it('mints a new access token from the refresh cookie', async () => {
        let form: URLSearchParams | undefined
        server.use(
            http.post(TOKEN_URL, async ({ request }) => {
                form = new URLSearchParams(await request.text())
                return HttpResponse.json({ access_token: 'new', expires_in: 3599, scope: 'x', token_type: 'Bearer' })
            }),
        )
        const res = await post('digest_rt=1%2F%2FR')
        expect(await res.json()).toEqual({ access_token: 'new', expires_in: 3599 })
        expect(form!.get('refresh_token')).toBe('1//R')
        expect(form!.get('grant_type')).toBe('refresh_token')
    })

    it('a revoked/expired refresh token drops the dead cookie and asks for sign-in', async () => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })))
        const res = await post('digest_rt=R')
        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'refresh_failed' })
        expect(setCookies(res).digest_rt.attrs['max-age']).toBe('0')
    })

    // Only a rejection of the refresh token itself (invalid_grant) ends the session. Everything
    // else is a problem with our configuration or with Google, and the session must survive it.
    it.each([
        ['invalid_client (wrong client secret deployed)', 401, { error: 'invalid_client' }],
        ['unauthorized_client', 400, { error: 'unauthorized_client' }],
    ])('keeps the session on %s and reports a misconfigured server', async (_label, status, body) => {
        server.use(http.post(TOKEN_URL, () => HttpResponse.json(body, { status })))
        const res = await post('digest_rt=R')
        expect(res.status).toBe(500)
        expect(await res.json()).toEqual({ error: 'server_misconfigured' })
        expect(res.headers.getSetCookie()).toEqual([])
    })

    it.each([
        ['a Google outage', () => new HttpResponse(null, { status: 503 })],
        ['a network failure', () => HttpResponse.error()],
        ['invalid_request', () => HttpResponse.json({ error: 'invalid_request' }, { status: 400 })],
        ['an unreadable 400', () => new HttpResponse('<html>Bad Request</html>', { status: 400 })],
        ['an unreadable 401', () => new HttpResponse(null, { status: 401 })],
        ['an unknown error code', () => HttpResponse.json({ error: 'something_new' }, { status: 400 })],
        // A 200 whose body can't be read or isn't a token is Google misbehaving, not a dead session.
        ['a truncated 200 body', () => new HttpResponse('{"access_token":"ya29', { status: 200, headers: { 'Content-Type': 'application/json' } })],
        ['a null 200 body', () => HttpResponse.json(null)],
        ['a 200 without a token', () => HttpResponse.json({ expires_in: 3599 })],
    ])('keeps the session through %s (a 502, not a sign-out)', async (_label, resolver) => {
        server.use(http.post(TOKEN_URL, resolver))
        const res = await post('digest_rt=R')
        expect(res.status).toBe(502)
        expect(res.headers.getSetCookie()).toEqual([])
    })
})

describe('/auth/logout', () => {
    it('revokes the refresh token at Google and clears the cookie', async () => {
        let revoked: string | null = null
        server.use(
            http.post(REVOKE_URL, ({ request }) => {
                revoked = new URL(request.url).searchParams.get('token')
                return new HttpResponse(null, { status: 200 })
            }),
        )
        const res = await call(logout, req('/auth/logout', { method: 'POST', headers: { Cookie: 'digest_rt=1%2F%2FR' } }))
        expect(res.status).toBe(204)
        expect(revoked).toBe('1//R')
        expect(setCookies(res).digest_rt.attrs).toMatchObject({ 'max-age': '0', path: '/auth' })
    })

    it('clears the cookie even when the revoke fails', async () => {
        server.use(http.post(REVOKE_URL, () => HttpResponse.error()))
        const res = await call(logout, req('/auth/logout', { method: 'POST', headers: { Cookie: 'digest_rt=R' } }))
        expect(res.status).toBe(204)
        expect(setCookies(res).digest_rt.attrs['max-age']).toBe('0')
    })

    it('skips the revoke when there is no session', async () => {
        const res = await call(logout, req('/auth/logout', { method: 'POST' }))
        expect(res.status).toBe(204)
    })
})
