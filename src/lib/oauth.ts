import { useStore } from '../store/useStore'
import { AUTH_BASE } from './config'
import type { Auth } from './youtube'
import type { AccessToken } from '../types'

// OAuth runs through same-origin Cloudflare Pages Functions (see /functions/auth). The browser
// never holds the Google client secret: it opens a popup to /auth/login, receives a short-lived
// access token via postMessage, and silently renews it via POST /auth/refresh (which reads an
// HttpOnly refresh-token cookie). The access token stays in memory only, as before.

class OAuthError extends Error {
    code: string

    constructor(code: string, message: string) {
        super(message)
        this.name = 'OAuthError'
        this.code = code
    }
}

// Codes that mean "the silent path failed; an interactive sign-in is required" rather than a
// hard error worth surfacing.
const CONSENT_REQUIRED_CODES = new Set(['no_session', 'refresh_failed'])

interface OAuthMessage {
    type: 'digest-oauth'
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
}

// Bumped by every sign-in and sign-out. A refresh that was in flight when the session changed must
// not apply its answer: it would undo a sign-out, or sign a newer sign-in back out.
let sessionGeneration = 0

function clearSessionState(): void {
    useStore.getState().setAccessToken(null)
    useStore.getState().setHasSignedIn(false)
}

/** The access token in a broker payload (the popup message or /auth/refresh), or null if the payload
 *  doesn't carry a usable one. Both paths go through this, so neither can store a broken token. */
function toAccessToken(payload: unknown): AccessToken | null {
    if (!payload || typeof payload !== 'object') return null
    const { access_token, expires_in } = payload as Record<string, unknown>
    if (typeof access_token !== 'string' || !access_token) return null
    if (typeof expires_in !== 'number' || !Number.isFinite(expires_in)) return null
    return {
        value: access_token,
        // refresh a minute early to avoid edge-of-expiry failures
        expiresAt: Date.now() + Math.max(expires_in - 60, 0) * 1000,
    }
}

/** Open the sign-in popup and resolve once the callback posts the access token back. */
function openAuthPopup(): Promise<AccessToken> {
    return new Promise((resolve, reject) => {
        const width = 480
        const height = 640
        const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2)
        const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2)
        const popup = window.open(
            `${AUTH_BASE}/login`,
            'digest-oauth',
            `width=${width},height=${height},left=${left},top=${top}`,
        )
        if (!popup) {
            reject(new OAuthError('popup_blocked', 'Pop-up blocked. Allow pop-ups for this site and try again.'))
            return
        }

        let settled = false
        const finish = (fn: () => void) => {
            if (settled) return
            settled = true
            window.removeEventListener('message', onMessage)
            clearInterval(closedTimer)
            fn()
        }

        function onMessage(event: MessageEvent) {
            if (event.origin !== window.location.origin) return
            const data = event.data as OAuthMessage | null
            if (!data || data.type !== 'digest-oauth') return
            popup?.close()
            if (data.error) {
                finish(() => reject(new OAuthError(data.error!, data.error_description || data.error!)))
                return
            }
            const token = toAccessToken(data)
            if (!token) {
                finish(() => reject(new OAuthError('invalid_response', 'Sign-in returned no token.')))
                return
            }
            finish(() => resolve(token))
        }

        window.addEventListener('message', onMessage)
        // If the user closes the popup without completing sign-in, surface a cancellation.
        const closedTimer = setInterval(() => {
            if (popup.closed) finish(() => reject(new OAuthError('popup_closed', 'Sign-in was cancelled.')))
        }, 500)
    })
}

/** Interactive sign-in. Stores the resulting access token in the Zustand store. */
export async function signIn(): Promise<AccessToken> {
    const token = await openAuthPopup()
    sessionGeneration++
    useStore.getState().setAccessToken(token)
    useStore.getState().setHasSignedIn(true)
    return token
}

/**
 * Sign out: the in-memory session ends at once, and the server revokes the refresh token and clears
 * its cookie. Resolves once the server confirms; rejects when the browser couldn't reach it, so the
 * cookie may still be set. A plain sign-out treats that as best effort, while Clear all data waits.
 */
export async function signOut(): Promise<void> {
    sessionGeneration++
    clearSessionState()
    const res = await fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
    if (!res?.ok) throw new OAuthError('logout_failed', 'Could not end the session on the server.')
}

/** Ask the backend for a fresh access token using the refresh cookie. Null when no live session. */
async function refresh(): Promise<AccessToken | null> {
    const generation = sessionGeneration
    const res = await fetch(`${AUTH_BASE}/refresh`, { method: 'POST', credentials: 'same-origin' })
    // A 200 we can't read as a token is a server problem, not a lost session: keep it for a retry.
    const token = res.ok ? toAccessToken(await res.json().catch(() => null)) : null
    if (generation !== sessionGeneration) {
        // The user signed in or out meanwhile; that session stands, whatever this answer says.
        const current = useStore.getState().accessToken
        return tokenIsValid(current) ? current : null
    }
    if (res.status === 401) {
        clearSessionState()
        return null
    }
    if (!token) throw new OAuthError('auth_unavailable', 'Could not refresh the session.')
    useStore.getState().setAccessToken(token)
    useStore.getState().setHasSignedIn(true)
    return token
}

/**
 * Return a valid token, silently refreshing if expired/missing. Returns null when there's no
 * restorable session (so callers can prompt an interactive sign-in instead).
 */
export async function getValidToken(): Promise<AccessToken | null> {
    const current = useStore.getState().accessToken
    if (tokenIsValid(current)) return current
    return refresh()
}

/** True if the token exists and hasn't expired. Pass a subscribed token for reactive checks. */
export function tokenIsValid(token: AccessToken | null): boolean {
    return Boolean(token && token.expiresAt > Date.now())
}

export function isConsentRequired(error: unknown): boolean {
    return error instanceof OAuthError && CONSENT_REQUIRED_CODES.has(error.code)
}

/** Shown when a signed-in session can't be silently restored and there's no API-key fallback. */
export const REAUTH_MESSAGE = 'Your session expired — sign in again from Settings.'

/**
 * Resolve the credentials for a Data API call from current store state. If the user has signed in,
 * silently refreshes the token (throwing REAUTH_MESSAGE when neither a token nor an API key is
 * available); otherwise returns an anonymous Auth so the proxy falls back to the stored API key.
 */
export async function resolveAuth(): Promise<Auth> {
    const { hasSignedIn, accessToken, apiKeyConfigured } = useStore.getState()
    if (!hasSignedIn && !accessToken) return { token: null }
    const token = await getValidToken()
    if (!token && !apiKeyConfigured) throw new Error(REAUTH_MESSAGE)
    return { token: token?.value ?? null }
}
