import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store/useStore'
import { Layout } from './components/Layout'
import { ApiKeyGate } from './components/ApiKeyGate'
import { Library } from './pages/Library'
import { PlaylistDetail } from './pages/PlaylistDetail'
import { Watch } from './pages/Watch'

export default function App() {
  const apiKey = useStore((s) => s.apiKey)

  if (!apiKey) return <ApiKeyGate />

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
