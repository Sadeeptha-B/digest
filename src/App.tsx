import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { getValidToken, isOAuthConfigured } from './lib/oauth'
import { refreshApiKeyStatus } from './lib/apiKey'
import { Layout } from './components/Layout'
import { ApiKeyGate } from './components/ApiKeyGate'
import { Library } from './pages/Library'
import { PlaylistDetail } from './pages/PlaylistDetail'
import { Watch } from './pages/Watch'

export default function App() {
    const apiKeyConfigured = useStore((s) => s.apiKeyConfigured)
    const hasSignedIn = useStore((s) => s.hasSignedIn)
    const [apiKeyStatusReady, setApiKeyStatusReady] = useState(hasSignedIn)

    // The token isn't persisted; if the user signed in before, silently restore it from the
    // server-side refresh cookie on load. If the session is gone, reflect signed-out state.
    useEffect(() => {
        if (!hasSignedIn || !isOAuthConfigured()) return
        void getValidToken().then((token) => {
            if (!token) useStore.getState().setHasSignedIn(false)
        }).catch(() => { })
    }, [hasSignedIn])

    // Reconcile the persisted "key configured" flag with the authoritative server-side cookie
    // (it may have expired, been cleared, or be absent on a new device).
    useEffect(() => {
        let cancelled = false
        if (!hasSignedIn) setApiKeyStatusReady(false)
        void refreshApiKeyStatus().finally(() => {
            if (!cancelled) setApiKeyStatusReady(true)
        })

        return () => {
            cancelled = true
        }
    }, [hasSignedIn])

    if (!hasSignedIn && !apiKeyStatusReady) {
        return (
            <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
                <h1 className="text-2xl font-semibold text-white">Digest</h1>
                <p className="mt-1 text-sm text-zinc-400">Checking saved access…</p>
            </div>
        )
    }

    // Usable once the user can talk to the API: either via OAuth, or with a public API key.
    const ready = hasSignedIn || apiKeyConfigured
    if (!ready) return <ApiKeyGate />

    return (
        <Layout>
            <Routes>
                <Route path="/" element={<Library />} />
                <Route path="/playlist/:playlistId" element={<PlaylistDetail />} />
                <Route path="/watch/:videoId" element={<Watch />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Layout>
    )
}
