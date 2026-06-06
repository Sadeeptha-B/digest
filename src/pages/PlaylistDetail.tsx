import { useNavigate, useParams } from 'react-router-dom'
import { PlaylistContents } from '../components/PlaylistContents'

export function PlaylistDetail() {
    const { playlistId = '' } = useParams()
    const navigate = useNavigate()

    return (
        <div className="mx-auto max-w-3xl">
            <PlaylistContents playlistId={playlistId} onClose={() => navigate('/')} />
        </div>
    )
}
