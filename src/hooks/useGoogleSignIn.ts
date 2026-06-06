import { useState } from 'react'
import { signIn } from '../lib/oauth'

export function useGoogleSignIn({ beforeSignIn }: { beforeSignIn?: () => void } = {}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function start() {
        setError(null)
        beforeSignIn?.()
        setBusy(true)
        try {
            await signIn()
            return true
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Sign-in failed.')
            return false
        } finally {
            setBusy(false)
        }
    }

    return { busy, error, start }
}