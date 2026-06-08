import { useStore } from '../store/useStore'
import { AUTH_BASE, OAUTH_ENABLED } from './config'
import type { AccessToken } from '../types'

// OAuth runs through same-origin Cloudflare Pages Functions (see /functions/auth). The browser
// never holds the Google client secret: it opens a popup to /auth/login, receives a short-lived
// access token via postMessage, and silently renews it via POST /auth/refresh (which reads an
// HttpOnly refresh-token cookie). The access token stays in memory only, as before.

/** True when an auth backend is configured (the Pages Functions deployment). */
export function isOAuthConfigured(): boolean {
    return OAUTH_ENABLED
}

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

function clearSessionState(): void {
    useStore.getState().setAccessToken(null)
    useStore.getState().setHasSignedIn(false)
}

function toAccessToken(accessToken: string, expiresIn: number): AccessToken {
    return {
        value: accessToken,
        // refresh a minute early to avoid edge-of-expiry failures
        expiresAt: Date.now() + Math.max(expiresIn - 60, 0) * 1000,
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
            if (!data.access_token || typeof data.expires_in !== 'number') {
                finish(() => reject(new OAuthError('invalid_response', 'Sign-in returned no token.')))
                return
            }
            const token = toAccessToken(data.access_token, data.expires_in)
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
    useStore.getState().setAccessToken(token)
    useStore.getState().setHasSignedIn(true)
    return token
}

/** Revoke the server-side session and clear the in-memory token. */
export function signOut(): void {
    void fetch(`${AUTH_BASE}/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => { })
    clearSessionState()
}

/** Ask the backend for a fresh access token using the refresh cookie. Null when no live session. */
async function refresh(): Promise<AccessToken | null> {
    const res = await fetch(`${AUTH_BASE}/refresh`, { method: 'POST', credentials: 'same-origin' })
    if (res.status === 401) {
        clearSessionState()
        return null
    }
    if (!res.ok) throw new OAuthError('auth_unavailable', 'Could not refresh the session.')
    const data = (await res.json()) as { access_token: string; expires_in: number }
    const token = toAccessToken(data.access_token, data.expires_in)
    useStore.getState().setAccessToken(token)
    useStore.getState().setHasSignedIn(true)
    return token
}

/**
 * Return a valid token, silently refreshing if expired/missing. Returns null when there's no
 * restorable session (so callers can prompt an interactive sign-in instead).
 */
export async function getValidToken(): Promise<AccessToken | null> {
    if (!OAUTH_ENABLED) return null
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
