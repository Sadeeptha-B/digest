import { clearCookie, Env, GOOGLE_REVOKE, parseCookies, REFRESH_COOKIE } from '../_lib/google'

// POST /auth/logout — best-effort revoke at Google, then clear the refresh cookie.
export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
    const cookies = parseCookies(request.headers.get('Cookie'))
    const refreshToken = cookies[REFRESH_COOKIE]
    if (refreshToken) {
        try {
            await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' })
        } catch {
            /* best effort — clear the cookie regardless */
        }
    }
    return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie(REFRESH_COOKIE) } })
}
