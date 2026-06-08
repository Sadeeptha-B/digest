// Shared config for the user-supplied YouTube Data API key. The key is stored in an HttpOnly +
// Secure + SameSite=Strict cookie scoped to /api, so it's sent to the key endpoint and the proxy
// but never reaches page JavaScript and never leaves on cross-site requests.
import { parseCookies } from './http'

export const KEY_COOKIE = 'digest_yt_key'
export const KEY_COOKIE_PATH = '/api'
export const KEY_MAX_AGE = 60 * 60 * 24 * 365 // ~1 year

/** Read the stored API key from the request's cookies, if any. */
export function readApiKey(request: Request): string | undefined {
    return parseCookies(request.headers.get('Cookie'))[KEY_COOKIE]
}
