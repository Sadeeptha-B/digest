import {
    cookie,
    Env,
    GOOGLE_AUTH,
    pkceChallenge,
    randomToken,
    STATE_COOKIE,
    VERIFIER_COOKIE,
    YT_SCOPE,
} from '../_lib/google'

// GET /auth/login — start the Authorization Code + PKCE flow and redirect to Google's consent
// screen. `state` + the PKCE `verifier` are stashed in short-lived HttpOnly cookies and checked
// back in /auth/callback.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return new Response('OAuth is not configured on the server.', { status: 500 })
    }

    const url = new URL(request.url)
    const redirectUri = `${url.origin}/auth/callback`
    const state = randomToken()
    const verifier = randomToken(48)
    const challenge = await pkceChallenge(verifier)

    const authUrl = new URL(GOOGLE_AUTH)
    authUrl.search = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: YT_SCOPE,
        // access_type=offline + prompt=consent => Google returns a refresh token.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    }).toString()

    const headers = new Headers({ Location: authUrl.toString(), 'Cache-Control': 'no-store' })
    headers.append('Set-Cookie', cookie(STATE_COOKIE, state, { maxAge: 600 }))
    headers.append('Set-Cookie', cookie(VERIFIER_COOKIE, verifier, { maxAge: 600 }))
    return new Response(null, { status: 302, headers })
}
