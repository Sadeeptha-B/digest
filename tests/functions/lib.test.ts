// Shared Functions helpers: cookies, cross-site detection, PKCE, and the OAuth popup page.
import { describe, expect, it } from 'vitest'
import { expireCookie, isCrossSite, json, parseCookies, serializeCookie } from '../../functions/_lib/http'
import { pkceChallenge, popupResponse, randomToken } from '../../functions/_lib/google'
import { req, setCookies } from './ctx'

describe('cookies', () => {
    it('serializes HttpOnly + Secure cookies with the requested scope', () => {
        expect(serializeCookie('k', 'a b;c', { path: '/api', maxAge: 60, sameSite: 'Strict' })).toBe(
            'k=a%20b%3Bc; Path=/api; SameSite=Strict; HttpOnly; Secure; Max-Age=60',
        )
        expect(serializeCookie('k', 'v', { path: '/auth' })).toBe('k=v; Path=/auth; SameSite=Lax; HttpOnly; Secure')
    })

    it('expires a cookie at its path', () => {
        expect(expireCookie('k', '/api')).toBe('k=; Path=/api; Max-Age=0; SameSite=Lax; HttpOnly; Secure')
    })

    it('parses and decodes a Cookie header, keeping "=" inside values', () => {
        expect(parseCookies('a=1; b=x%20y; c=base64==; junk; d=')).toEqual({ a: '1', b: 'x y', c: 'base64==', d: '' })
        expect(parseCookies(null)).toEqual({})
    })

    it('round-trips a serialized value', () => {
        const value = 'sk_live/+=;,:'
        const header = serializeCookie('k', value, { path: '/' }).split(';')[0]
        expect(parseCookies(header).k).toBe(value)
    })

    it("skips a cookie it can't decode instead of throwing (localhost cookies are shared across dev ports)", () => {
        expect(parseCookies('other_app=100%; digest_yt_key=AIza')).toEqual({ digest_yt_key: 'AIza' })
    })
})

describe('isCrossSite', () => {
    it.each([
        [undefined, false], // very old clients send no header: not blocked
        ['same-origin', false],
        ['none', false], // user-initiated (address bar, bookmark)
        ['same-site', true],
        ['cross-site', true],
    ])('Sec-Fetch-Site: %s → %s', (site, crossSite) => {
        const headers: Record<string, string> = site ? { 'Sec-Fetch-Site': site } : {}
        expect(isCrossSite(req('/api/key', { headers }))).toBe(crossSite)
    })
})

describe('json', () => {
    it('sets JSON content type and no-store, keeping other init', async () => {
        const res = json({ ok: true }, { status: 201, headers: { 'X-Test': '1' } })
        expect(res.status).toBe(201)
        expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
        expect(res.headers.get('Cache-Control')).toBe('no-store')
        expect(res.headers.get('X-Test')).toBe('1')
        expect(await res.json()).toEqual({ ok: true })
    })
})

describe('PKCE', () => {
    it('matches the RFC 7636 Appendix B test vector', async () => {
        expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
            'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        )
    })

    it('random tokens are URL-safe and unique', () => {
        const a = randomToken()
        expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes, unpadded base64url
        expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/)
        expect(randomToken()).not.toBe(a)
    })
})

describe('popupResponse', () => {
    it('posts the payload to exactly our origin and closes', async () => {
        const res = popupResponse('https://digest.pages.dev', { access_token: 't', expires_in: 10 })
        const html = await res.text()
        expect(html).toContain(
            'window.opener.postMessage({"type":"digest-oauth","access_token":"t","expires_in":10}, "https://digest.pages.dev")',
        )
        expect(html).toContain('window.close()')
    })

    it('cannot be broken out of its script by attacker-controlled text', async () => {
        const res = popupResponse('https://digest.pages.dev', { error: '</script><script>alert(1)</script>' })
        const html = await res.text()
        expect(html).not.toContain('</script><script>')
        expect(html.match(/<\/script>/g)).toHaveLength(1)
    })

    it('ships a locked-down page with every cookie it was given', () => {
        const res = popupResponse('https://x', {}, ['a=1; Path=/auth', 'b=2; Path=/auth'])
        expect(res.headers.get('Content-Security-Policy')).toMatch(/default-src 'none'/)
        expect(res.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/)
        expect(res.headers.get('Cache-Control')).toBe('no-store')
        expect(res.headers.get('X-Frame-Options')).toBe('DENY')
        expect(Object.keys(setCookies(res))).toEqual(['a', 'b'])
    })
})
