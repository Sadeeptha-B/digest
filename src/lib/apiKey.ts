import { useStore } from '../store/useStore'

// The YouTube API key is stored server-side in an HttpOnly cookie (see /functions/api/key). The
// browser never holds the value; it only tracks a boolean "is a key configured" for gating the UI,
// kept in sync with the server via these helpers.

const KEY_ENDPOINT = '/api/key'

function setConfigured(configured: boolean): void {
    useStore.getState().setApiKeyConfigured(configured)
}

/** Validate + store a key on the server. Throws with a user-facing message on failure. */
export async function saveApiKey(key: string): Promise<void> {
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
        const message = await messageFromResponse(res, 'That API key was rejected.')
        throw new Error(message)
    }
    setConfigured(true)
}

/** Clear the stored key on the server. */
export async function clearApiKey(): Promise<void> {
    let res: Response
    try {
        res = await fetch(KEY_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' })
    } catch {
        throw new Error('Could not reach the server to remove the key.')
    }
    if (!res.ok) {
        const message = await messageFromResponse(res, 'Could not remove the API key.')
        throw new Error(message)
    }
    setConfigured(false)
}

/** Reconcile the persisted boolean with the authoritative server cookie. Returns the live value. */
export async function refreshApiKeyStatus(): Promise<boolean> {
    try {
        const res = await fetch(KEY_ENDPOINT, { method: 'GET', credentials: 'same-origin' })
        if (!res.ok) throw new Error('Could not refresh API key status.')
        const { configured } = (await res.json()) as { configured: boolean }
        setConfigured(configured)
        return configured
    } catch {
        // Transient failure (offline PWA, server blip, or running plain `vite dev` with no
        // Functions): keep the last-known persisted state rather than forcing the onboarding gate.
        // A successful response saying configured=false is still honored above.
        return useStore.getState().apiKeyConfigured
    }
}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
    try {
        const body = (await res.json()) as { message?: string }
        return body?.message || fallback
    } catch {
        return fallback
    }
}
