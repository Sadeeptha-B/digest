import { useStore } from '../store/useStore'
import { clearRecallCache } from './recall'

// The user's own getrecall.ai (Recall) API key is stored server-side in an HttpOnly cookie (see
// /functions/api/recall/key). The browser never holds the value; it only tracks the non-secret
// boolean `recallConfigured` (gates the Summary tab and the Settings UI), kept in sync with the
// server via these helpers. The integration is per-user only — there is no shared server key
// (see ADR 0009), so "this browser has a key" and "Recall is available" are the same fact.

const KEY_ENDPOINT = '/api/recall/key'

function setConfigured(configured: boolean): void {
    useStore.getState().setRecallConfigured(configured)
}

/** Validate + store a Recall key on the server. Throws with a user-facing message on failure. */
export async function saveRecallKey(key: string): Promise<void> {
    let res: Response
    try {
        res = await fetch(KEY_ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
        })
    } catch {
        throw new Error('Could not reach the server to save the key.')
    }
    if (!res.ok) {
        const message = await messageFromResponse(res, 'That Recall API key was rejected.')
        throw new Error(message)
    }
    clearRecallCache()
    setConfigured(true)
}

/** Clear the stored Recall key on the server. */
export async function clearRecallKey(): Promise<void> {
    let res: Response
    try {
        res = await fetch(KEY_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' })
    } catch {
        throw new Error('Could not reach the server to remove the key.')
    }
    if (!res.ok) {
        const message = await messageFromResponse(res, 'Could not remove the Recall key.')
        throw new Error(message)
    }
    clearRecallCache()
    setConfigured(false)
}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
    try {
        const body = (await res.json()) as { message?: string }
        return body?.message || fallback
    } catch {
        return fallback
    }
}
