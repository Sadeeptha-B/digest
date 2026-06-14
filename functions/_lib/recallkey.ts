// Shared config for the user-supplied getrecall.ai (Recall) API key. Mirrors the YouTube key in
// _lib/apikey.ts: stored in an HttpOnly + Secure + SameSite=Strict cookie scoped to /api, so it's
// sent to the Recall key endpoint and the proxy but never reaches page JavaScript and never leaves
// on cross-site requests. The integration is per-user only — each user brings their own `sk_` key;
// there is no shared/server-wide key (see the recall proxy and ADR 0009).
import { parseCookies } from './http'

export const RECALL_KEY_COOKIE = 'digest_recall_key'
export const RECALL_KEY_COOKIE_PATH = '/api'
export const RECALL_KEY_MAX_AGE = 60 * 60 * 24 * 365 // ~1 year

/** Read the stored Recall key from the request's cookies, if any. */
export function readRecallKey(request: Request): string | undefined {
    return parseCookies(request.headers.get('Cookie'))[RECALL_KEY_COOKIE]
}
