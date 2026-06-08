import {
    clearCookie,
    cookie,
    Env,
    GOOGLE_TOKEN,
    parseCookies,
    popupResponse,
    REFRESH_COOKIE,
    REFRESH_MAX_AGE,
    STATE_COOKIE,
    VERIFIER_COOKIE,
} from '../_lib/google'

interface TokenResponse {
    access_token: string
    expires_in: number
    refresh_token?: string
}

// GET /auth/callback — Google redirects here with `code` + `state`. Validate state, exchange the
// code (with the client secret + PKCE verifier) for tokens, persist the refresh token in an
// HttpOnly cookie, and hand the short-lived access token to the SPA popup.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const url = new URL(request.url)
    const { origin } = url
    const cookies = parseCookies(request.headers.get('Cookie'))
    // Always clear the transient state/verifier cookies on the way out.
    const clearTransient = [clearCookie(STATE_COOKIE), clearCookie(VERIFIER_COOKIE)]

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return popupResponse(
            origin,
            { error: 'server_misconfigured', error_description: 'Google sign-in is not configured on the server.' },
            clearTransient,
        )
    }

    const oauthError = url.searchParams.get('error')
    if (oauthError) return popupResponse(origin, { error: oauthError }, clearTransient)

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state || state !== cookies[STATE_COOKIE]) {
        return popupResponse(
            origin,
            { error: 'invalid_state', error_description: 'Sign-in could not be verified. Please try again.' },
            clearTransient,
        )
    }
    const verifier = cookies[VERIFIER_COOKIE]
    if (!verifier) {
        return popupResponse(
            origin,
            { error: 'invalid_state', error_description: 'Sign-in session expired. Please try again.' },
            clearTransient,
        )
    }

    const res = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${origin}/auth/callback`,
            grant_type: 'authorization_code',
            code_verifier: verifier,
        }),
    })
    if (!res.ok) {
        return popupResponse(
            origin,
            { error: 'token_exchange_failed', error_description: 'Could not complete sign-in.' },
            clearTransient,
        )
    }

    const token = (await res.json()) as TokenResponse
    const setCookies = [...clearTransient]
    // A refresh token is only present on the first consent (prompt=consent makes Google re-issue
    // it). Keep the existing cookie if Google omits it.
    if (token.refresh_token) {
        setCookies.push(cookie(REFRESH_COOKIE, token.refresh_token, { maxAge: REFRESH_MAX_AGE }))
    }
    return popupResponse(
        origin,
        { access_token: token.access_token, expires_in: token.expires_in },
        setCookies,
    )
}
