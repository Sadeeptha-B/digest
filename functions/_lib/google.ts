// Shared helpers for the OAuth Pages Functions. Files/dirs under functions/ whose name starts
// with "_" are NOT turned into routes, so this module is safe to import from the handlers.
//
// Flow (Authorization Code + PKCE, "broker" model):
//   /auth/login    -> redirects the browser to Google's consent screen
//   /auth/callback -> exchanges the code for tokens, stores the refresh token in an HttpOnly
//                     cookie, and hands the short-lived access token back to the SPA popup
//   /auth/refresh  -> mints a fresh access token from the stored refresh token
//   /auth/logout   -> revokes + clears the refresh token
//
// The Google client secret only ever lives here (server-side), never in the browser bundle.

export interface Env {
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
}

// Read-only scope: enough to read the signed-in account's own private/unlisted playlists.
export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke'

// Cookies are scoped to /auth so they are only ever sent to these functions, not to the SPA.
export const COOKIE_PATH = '/auth'
export const REFRESH_COOKIE = 'digest_rt'
export const STATE_COOKIE = 'digest_oauth_state'
export const VERIFIER_COOKIE = 'digest_oauth_verifier'

// Long-lived: Google refresh tokens don't expire for personal "Testing"/published apps unless
// revoked or unused for 6 months, so re-pin the cookie for ~180 days on each issue.
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 180

function base64url(bytes: ArrayBuffer | Uint8Array): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let str = ''
    for (const b of arr) str += String.fromCharCode(b)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Cryptographically-random, URL-safe token (for state / PKCE verifier). */
export function randomToken(bytes = 32): string {
    return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** PKCE S256 challenge for a given verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
    return base64url(digest)
}

interface CookieOptions {
    maxAge?: number
    path?: string
    sameSite?: 'Lax' | 'Strict' | 'None'
}

export function cookie(name: string, value: string, opts: CookieOptions = {}): string {
    const { maxAge, path = COOKIE_PATH, sameSite = 'Lax' } = opts
    let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}; HttpOnly; Secure`
    if (maxAge !== undefined) s += `; Max-Age=${maxAge}`
    return s
}

export function clearCookie(name: string, path = COOKIE_PATH): string {
    return `${name}=; Path=${path}; Max-Age=0; SameSite=Lax; HttpOnly; Secure`
}

export function parseCookies(header: string | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (!header) return out
    for (const part of header.split(';')) {
        const i = part.indexOf('=')
        if (i < 0) continue
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    }
    return out
}

export function json(body: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Cache-Control', 'no-store')
    return new Response(JSON.stringify(body), { ...init, headers })
}

/**
 * HTML returned in the OAuth popup. It hands the result back to the app window via postMessage
 * (scoped to our own origin) and closes itself — mirroring the previous GIS popup UX.
 */
export function popupResponse(
    origin: string,
    payload: Record<string, unknown>,
    setCookies: string[] = [],
): Response {
    const message = JSON.stringify({ type: 'digest-oauth', ...payload }).replace(/</g, '\\u003c')
    const targetOrigin = JSON.stringify(origin).replace(/</g, '\\u003c')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Signing in…</title></head>
<body style="font:14px system-ui;background:#0a0a0b;color:#a1a1aa;padding:24px">
<p>You can close this window.</p>
<script>
(function () {
  try { if (window.opener) window.opener.postMessage(${message}, ${targetOrigin}); } catch (e) {}
  window.close();
})();
</script>
</body></html>`
    const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    })
    for (const c of setCookies) headers.append('Set-Cookie', c)
    return new Response(html, { status: 200, headers })
}
