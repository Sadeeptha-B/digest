import { useState } from 'react'
import { useStore } from '../store/useStore'
import { clearApiKey, saveApiKey } from '../lib/apiKey'

/** UI helper around the server-side API key: status + async save/remove with busy/error state. */
export function useApiKey() {
    const configured = useStore((s) => s.apiKeyConfigured)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function save(key: string): Promise<boolean> {
        setError(null)
        setBusy(true)
        try {
            await saveApiKey(key)
            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the API key.')
            return false
        } finally {
            setBusy(false)
        }
    }

    async function remove(): Promise<void> {
        setError(null)
        setBusy(true)
        try {
            await clearApiKey()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove the API key.')
        } finally {
            setBusy(false)
        }
    }

    return { configured, busy, error, save, remove }
}
