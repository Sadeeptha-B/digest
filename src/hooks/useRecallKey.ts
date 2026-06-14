import { useState } from 'react'
import { useStore } from '../store/useStore'
import { clearRecallKey, saveRecallKey } from '../lib/recallKey'

/** UI helper around the server-side Recall key: status + async save/remove with busy/error state. */
export function useRecallKey() {
    const configured = useStore((s) => s.recallConfigured)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function save(key: string): Promise<boolean> {
        setError(null)
        setBusy(true)
        try {
            await saveRecallKey(key)
            return true
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the Recall key.')
            return false
        } finally {
            setBusy(false)
        }
    }

    async function remove(): Promise<void> {
        setError(null)
        setBusy(true)
        try {
            await clearRecallKey()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove the Recall key.')
        } finally {
            setBusy(false)
        }
    }

    return { configured, busy, error, save, remove }
}
