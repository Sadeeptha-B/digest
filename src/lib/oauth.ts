import { useStore } from '../store/useStore'
import type { AccessToken } from '../types'

// Single scope that covers both captions.download and reading the signed-in
// account's own private/unlisted playlists and videos.
export const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

// --- Minimal typings for the Google Identity Services token client ---
interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: '' | 'none' | 'consent' }) => void
}
interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string
    scope: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: { type: string }) => void
  }) => TokenClient
  revoke: (token: string, done?: () => void) => void
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let gisPromise: Promise<GoogleOAuth2> | null = null

/** Load the GIS script once and resolve with the oauth2 namespace. */
function loadGis(): Promise<GoogleOAuth2> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const ready = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error('Google Identity Services failed to initialise.'))
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      if (window.google?.accounts?.oauth2) ready()
      else existing.addEventListener('load', ready, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = ready
    script.onerror = () => reject(new Error('Could not load Google Identity Services.'))
    document.head.appendChild(script)
  })
  return gisPromise
}

/**
 * Request an access token. `prompt: ''` re-uses prior consent silently when possible;
 * the first sign-in needs an interactive consent. Resolves with the token + expiry and
 * stores it in the Zustand store.
 */
export async function requestToken(prompt: '' | 'consent' = ''): Promise<AccessToken> {
  const clientId = useStore.getState().oauthClientId
  if (!clientId) throw new Error('Set an OAuth Client ID in Settings first.')

  const oauth2 = await loadGis()
  const token = await new Promise<AccessToken>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: YT_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error_description || resp.error))
          return
        }
        resolve({
          value: resp.access_token,
          // refresh a minute early to avoid edge-of-expiry failures
          expiresAt: Date.now() + (resp.expires_in - 60) * 1000,
        })
      },
      error_callback: (err) => reject(new Error(err.type || 'Sign-in was cancelled.')),
    })
    client.requestAccessToken({ prompt })
  })

  useStore.getState().setAccessToken(token)
  return token
}

/** Interactive sign-in (forces the consent screen on first use). */
export function signIn(): Promise<AccessToken> {
  return requestToken('consent')
}

/** Revoke and clear the current token. */
export function signOut(): void {
  const token = useStore.getState().accessToken
  if (token) window.google?.accounts?.oauth2?.revoke(token.value)
  useStore.getState().setAccessToken(null)
}

/**
 * Return a valid token, silently refreshing if expired/missing. Returns null if the user
 * has never consented (so callers can prompt an interactive sign-in instead).
 */
export async function getValidToken(): Promise<AccessToken | null> {
  const current = useStore.getState().accessToken
  if (current && current.expiresAt > Date.now()) return current
  try {
    return await requestToken('')
  } catch {
    return null
  }
}

export function isSignedIn(): boolean {
  const t = useStore.getState().accessToken
  return Boolean(t && t.expiresAt > Date.now())
}
