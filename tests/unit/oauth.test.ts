// The browser half of the OAuth broker (src/lib/oauth.ts): an in-memory access token, silent
// refresh via the HttpOnly cookie, and the popup handshake (architecture §2.1).
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import {
    getValidToken,
    isConsentRequired,
    REAUTH_MESSAGE,
    resolveAuth,
    signIn,
    signOut,
    tokenIsValid,
} from '../../src/lib/oauth'
import { deferred } from '../support/deferred'
import { server } from '../support/msw'
import { store } from '../support/factories'

const refreshOk = (token = 'fresh', expires_in = 3600) =>
    http.post('/auth/refresh', () => HttpResponse.json({ access_token: token, expires_in }))
const refreshStatus = (status: number) => http.post('/auth/refresh', () => HttpResponse.json({ error: 'x' }, { status }))

describe('tokenIsValid', () => {
    it('is true only for a token that has not expired', () => {
        expect(tokenIsValid(null)).toBe(false)
        expect(tokenIsValid({ value: 't', expiresAt: Date.now() - 1 })).toBe(false)
        expect(tokenIsValid({ value: 't', expiresAt: Date.now() + 60_000 })).toBe(true)
    })
})

describe('getValidToken', () => {
    it('returns the in-memory token without a network call while it is valid', async () => {
        const token = { value: 'live', expiresAt: Date.now() + 60_000 }
        store().setAccessToken(token)
        expect(await getValidToken()).toBe(token) // MSW would error on an unhandled /auth/refresh
    })

    it('silently refreshes, expiring the new token a minute early', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(1_000_000)
        server.use(refreshOk('fresh', 3600))
        const token = await getValidToken()
        expect(token).toEqual({ value: 'fresh', expiresAt: 1_000_000 + 3540 * 1000 })
        expect(store()).toMatchObject({ accessToken: token, hasSignedIn: true })
    })

    it('a 401 means no live session: clears it and returns null', async () => {
        store().setHasSignedIn(true)
        server.use(refreshStatus(401))
        expect(await getValidToken()).toBeNull()
        expect(store()).toMatchObject({ accessToken: null, hasSignedIn: false })
    })

    it.each([
        ['an unreadable body', () => new HttpResponse('{"access_token":', { status: 200 })],
        ['a body without a token', () => HttpResponse.json({ expires_in: 3600 })],
    ])('a 200 with %s is a controlled failure that keeps the session', async (_label, resolver) => {
        store().setHasSignedIn(true)
        server.use(http.post('/auth/refresh', resolver))
        await expect(getValidToken()).rejects.toMatchObject({ code: 'auth_unavailable' })
        expect(store()).toMatchObject({ hasSignedIn: true, accessToken: null })
    })

    it('any other failure throws but keeps the session (a server blip is not a sign-out)', async () => {
        store().setHasSignedIn(true)
        server.use(refreshStatus(502))
        await expect(getValidToken()).rejects.toMatchObject({ code: 'auth_unavailable' })
        expect(store().hasSignedIn).toBe(true)
    })
})

describe('resolveAuth', () => {
    it('never signed in: anonymous, so the proxy uses the API-key cookie (no refresh attempted)', async () => {
        expect(await resolveAuth()).toEqual({ token: null })
    })

    it('signed in: a fresh token', async () => {
        store().setHasSignedIn(true)
        server.use(refreshOk('abc'))
        expect(await resolveAuth()).toEqual({ token: 'abc' })
    })

    it('session gone but an API key is configured: falls back to anonymous', async () => {
        store().setHasSignedIn(true)
        store().setApiKeyConfigured(true)
        server.use(refreshStatus(401))
        expect(await resolveAuth()).toEqual({ token: null })
    })

    it('session gone and no key: asks the user to sign in again', async () => {
        store().setHasSignedIn(true)
        server.use(refreshStatus(401))
        await expect(resolveAuth()).rejects.toThrow(REAUTH_MESSAGE)
    })
})

describe('signIn popup', () => {
    function stubPopup() {
        const popup = { closed: false, close: vi.fn(() => (popup.closed = true)) }
        const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
        return { popup, open }
    }
    const post = (data: unknown, origin = window.location.origin) =>
        window.dispatchEvent(new MessageEvent('message', { data, origin }))

    it('opens /auth/login and resolves with the token posted back from our own origin', async () => {
        const { popup, open } = stubPopup()
        const pending = signIn()
        expect(open.mock.calls[0][0]).toBe('/auth/login')
        post({ type: 'digest-oauth', access_token: 'evil' }, 'https://evil.example') // ignored
        post({ type: 'other-app', access_token: 'nope' }) // ignored
        post({ type: 'digest-oauth', access_token: 'good', expires_in: 3600 })
        await expect(pending).resolves.toMatchObject({ value: 'good' })
        expect(popup.close).toHaveBeenCalled()
        expect(store()).toMatchObject({ hasSignedIn: true, accessToken: { value: 'good' } })
    })

    it('rejects with the error code the callback reports (e.g. not a Test user)', async () => {
        stubPopup()
        const pending = signIn()
        post({ type: 'digest-oauth', error: 'access_denied' })
        const err = await pending.catch((e) => e)
        expect(err).toMatchObject({ code: 'access_denied', message: 'access_denied' })
        expect(isConsentRequired(err)).toBe(false)
    })

    it('rejects a reply with no token', async () => {
        stubPopup()
        const pending = signIn()
        post({ type: 'digest-oauth' })
        await expect(pending).rejects.toMatchObject({ code: 'invalid_response' })
    })

    it('reports a blocked popup', async () => {
        vi.spyOn(window, 'open').mockReturnValue(null)
        await expect(signIn()).rejects.toMatchObject({ code: 'popup_blocked' })
    })

    it('reports a cancelled sign-in when the popup is closed', async () => {
        vi.useFakeTimers()
        const { popup } = stubPopup()
        const pending = signIn()
        popup.closed = true
        vi.advanceTimersByTime(600)
        await expect(pending).rejects.toMatchObject({ code: 'popup_closed' })
        expect(store().hasSignedIn).toBe(false)
    })
})

describe('signOut', () => {
    it('clears local session state at once, and reports a logout call that failed', async () => {
        server.use(http.post('/auth/logout', () => HttpResponse.error()))
        store().setAccessToken({ value: 't', expiresAt: Date.now() + 60_000 })
        store().setHasSignedIn(true)
        const done = signOut()
        expect(store()).toMatchObject({ accessToken: null, hasSignedIn: false })
        // The refresh cookie may still be set, so a caller that needs it gone (Clear all data) can tell.
        await expect(done).rejects.toMatchObject({ code: 'logout_failed' })
    })

    it('resolves once the server cleared the session, and rejects when it answered with an error', async () => {
        server.use(http.post('/auth/logout', () => new HttpResponse(null, { status: 204 })))
        await expect(signOut()).resolves.toBeUndefined()
        server.use(http.post('/auth/logout', () => HttpResponse.json({ error: 'x' }, { status: 500 })))
        await expect(signOut()).rejects.toMatchObject({ code: 'logout_failed' })
    })
})

// A silent refresh can be in flight (on load, or before an API call) when the user signs in or out.
// The user's newer action must win.
describe('a refresh still in flight when the session changes', () => {
    /** /auth/refresh answers only when the test says so; `sent` resolves once the request is out. */
    function heldRefresh() {
        const sent = deferred<void>()
        const reply = deferred<Response>()
        server.use(http.post('/auth/refresh', () => (sent.resolve(), reply.promise)))
        return { sent: sent.promise, reply }
    }

    it('does not sign the user back in after they signed out', async () => {
        store().setHasSignedIn(true)
        const refresh = heldRefresh()
        server.use(http.post('/auth/logout', () => new HttpResponse(null, { status: 204 })))
        const pending = getValidToken()
        await refresh.sent
        await signOut()
        refresh.reply.resolve(HttpResponse.json({ access_token: 'from-before', expires_in: 3600 }))

        expect(await pending).toBeNull()
        expect(store()).toMatchObject({ accessToken: null, hasSignedIn: false })
    })

    it('does not sign out a newer interactive sign-in when it comes back 401', async () => {
        store().setHasSignedIn(true)
        const refresh = heldRefresh()
        const pending = getValidToken()
        await refresh.sent
        const popup = { closed: false, close: vi.fn() }
        vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
        const signingIn = signIn()
        window.dispatchEvent(
            new MessageEvent('message', {
                data: { type: 'digest-oauth', access_token: 'new', expires_in: 3600 },
                origin: window.location.origin,
            }),
        )
        await signingIn
        refresh.reply.resolve(HttpResponse.json({ error: 'no_session' }, { status: 401 }))

        expect(await pending).toMatchObject({ value: 'new' })
        expect(store()).toMatchObject({ accessToken: { value: 'new' }, hasSignedIn: true })
    })
})
