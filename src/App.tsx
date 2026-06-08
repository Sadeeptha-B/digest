import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { getValidToken, isOAuthConfigured } from './lib/oauth'
import { Layout } from './components/Layout'
import { ApiKeyGate } from './components/ApiKeyGate'
import { Library } from './pages/Library'
import { PlaylistDetail } from './pages/PlaylistDetail'
import { Watch } from './pages/Watch'

export default function App() {
    const apiKey = useStore((s) => s.apiKey)
    const hasSignedIn = useStore((s) => s.hasSignedIn)

    // The token isn't persisted; if the user signed in before, silently restore it from the
    // server-side refresh cookie on load. If the session is gone, reflect signed-out state.
    useEffect(() => {
        if (!hasSignedIn || !isOAuthConfigured()) return
        void getValidToken().then((token) => {
            if (!token) useStore.getState().setHasSignedIn(false)
        }).catch(() => { })
    }, [hasSignedIn])

    // Usable once the user can talk to the API: either via OAuth, or with a public API key.
    const ready = hasSignedIn || Boolean(apiKey)
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
