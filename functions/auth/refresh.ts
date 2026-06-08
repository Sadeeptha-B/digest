import {
    clearCookie,
    Env,
    GOOGLE_TOKEN,
    json,
    parseCookies,
    REFRESH_COOKIE,
} from '../_lib/google'

interface TokenResponse {
    access_token: string
    expires_in: number
}

// POST /auth/refresh — mint a fresh access token from the stored refresh token. Returns 401 when
// there's no session (or it was revoked) so the SPA knows to prompt an interactive sign-in.
// The HttpOnly + SameSite=Lax refresh cookie is never sent on cross-site requests, so this needs
// no extra CSRF token.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return json({ error: 'server_misconfigured' }, { status: 500 })
    }

    const cookies = parseCookies(request.headers.get('Cookie'))
    const refreshToken = cookies[REFRESH_COOKIE]
    if (!refreshToken) return json({ error: 'no_session' }, { status: 401 })

    const res = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        }),
    })
    if (!res.ok) {
        // Revoked/expired — drop the dead cookie so the next attempt starts a clean sign-in.
        return json({ error: 'refresh_failed' }, { status: 401, headers: { 'Set-Cookie': clearCookie(REFRESH_COOKIE) } })
    }

    const token = (await res.json()) as TokenResponse
    return json({ access_token: token.access_token, expires_in: token.expires_in })
}
