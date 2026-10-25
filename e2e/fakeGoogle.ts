// Google's half of the OAuth flow, faked for e2e so the REAL /auth Functions run behind the browser
// journeys: the consent screen (a redirect back to the callback), the token endpoint (code exchange
// and refresh, called by the Functions from Node) and token revocation (logout). It checks what Google
// would check (client id, redirect URI, the one code it issued, the client secret, the PKCE verifier
// against the challenge, and that a refresh token is the live one it issued) and records any mismatch
// as a problem that fails the test.
import { GOOGLE_AUTH, GOOGLE_REVOKE, GOOGLE_TOKEN, pkceChallenge } from '../functions/_lib/google'

export const E2E_OAUTH_ENV = { GOOGLE_CLIENT_ID: 'e2e-client-id', GOOGLE_CLIENT_SECRET: 'e2e-client-secret' }

export const FAKE_TOKENS = { access_token: 'ya29.e2e-access', expires_in: 3599, refresh_token: '1//e2e-refresh' }

/** The access token a refresh mints, distinct from the sign-in one so a test can tell which it got. */
export const REFRESHED_ACCESS_TOKEN = 'ya29.e2e-refreshed'

export class FakeGoogle {
    readonly problems: string[] = []
    /** Whether the refresh token it issued has been revoked (by /auth/logout). */
    revoked = false
    private issued: { code: string; challenge: string; redirectUri: string } | null = null

    constructor(
        private readonly consent: 'approve' | 'deny',
        private readonly appOrigin: string,
    ) {}

    /** Whether a browser request is for Google's consent screen. */
    isConsentScreen(url: URL): boolean {
        return `${url.origin}${url.pathname}` === GOOGLE_AUTH
    }

    /** The consent screen: where Google would send the browser next. */
    consentRedirect(url: URL): string {
        const q = url.searchParams
        const redirectUri = q.get('redirect_uri') ?? ''
        this.expect(q.get('client_id') === E2E_OAUTH_ENV.GOOGLE_CLIENT_ID, 'consent: wrong client_id')
        this.expect(redirectUri === `${this.appOrigin}/auth/callback`, `consent: unexpected redirect_uri ${redirectUri}`)
        this.expect(q.get('response_type') === 'code', 'consent: response_type is not code')
        this.expect(q.get('code_challenge_method') === 'S256', 'consent: PKCE is not S256')

        const back = new URL(redirectUri)
        back.searchParams.set('state', q.get('state') ?? '')
        if (this.consent === 'deny') {
            back.searchParams.set('error', 'access_denied')
        } else {
            this.issued = { code: 'e2e-auth-code', challenge: q.get('code_challenge') ?? '', redirectUri }
            back.searchParams.set('code', this.issued.code)
        }
        return back.href
    }

    /** Stands in for `fetch` while an /auth Function runs: only the token and revoke endpoints answer. */
    readonly fetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        const endpoint = `${url.origin}${url.pathname}`
        if (request.method === 'POST' && endpoint === GOOGLE_TOKEN) return this.token(new URLSearchParams(await request.text()))
        if (request.method === 'POST' && endpoint === GOOGLE_REVOKE) return this.revoke(url.searchParams.get('token'))
        this.problems.push(`unexpected upstream call: ${request.method} ${request.url}`)
        throw new TypeError('network error (not faked)')
    }

    private async token(form: URLSearchParams): Promise<Response> {
        const client =
            form.get('client_id') === E2E_OAUTH_ENV.GOOGLE_CLIENT_ID &&
            form.get('client_secret') === E2E_OAUTH_ENV.GOOGLE_CLIENT_SECRET
        if (form.get('grant_type') === 'refresh_token') {
            if (!client || form.get('refresh_token') !== FAKE_TOKENS.refresh_token || this.revoked) {
                this.problems.push('refresh did not present the live refresh token it was issued, or the right client')
                return Response.json({ error: 'invalid_grant' }, { status: 400 })
            }
            return Response.json({ access_token: REFRESHED_ACCESS_TOKEN, expires_in: FAKE_TOKENS.expires_in })
        }

        const issued = this.issued
        const ok =
            issued !== null &&
            client &&
            form.get('grant_type') === 'authorization_code' &&
            form.get('code') === issued.code &&
            form.get('redirect_uri') === issued.redirectUri &&
            (await pkceChallenge(form.get('code_verifier') ?? '')) === issued.challenge
        this.issued = null // codes are single-use
        if (!ok) {
            this.problems.push('token exchange did not match the issued code, client or PKCE verifier')
            return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        return Response.json(FAKE_TOKENS)
    }

    private revoke(token: string | null): Response {
        this.expect(token === FAKE_TOKENS.refresh_token, 'revoke: not the refresh token it issued')
        this.revoked = true
        return new Response(null, { status: 200 })
    }

    private expect(condition: boolean, problem: string) {
        if (!condition) this.problems.push(problem)
    }
}
