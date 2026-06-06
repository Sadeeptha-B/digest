import { Link } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { CheckIcon } from './Icons'

export function Queue({
  videoIds,
  currentVideoId,
  listId,
}: {
  videoIds: string[]
  currentVideoId: string
  listId: string
}) {
  const videos = useStore((s) => s.videos)
  const progress = useStore((s) => s.progress)

  return (
    <ul className="space-y-1 overflow-y-auto no-scrollbar">
      {videoIds.map((id, i) => {
        const v = videos[id]
        const isCurrent = id === currentVideoId
        const watched = progress[id]?.watched
        return (
          <li key={id}>
            <Link
              to={`/watch/${id}?list=${listId}`}
              className={`flex items-center gap-2.5 rounded-lg p-1.5 ${
                isCurrent ? 'bg-accent-600/15 ring-1 ring-accent-600/40' : 'hover:bg-ink-800'
              }`}
            >
              <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-ink-800">
                {v?.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
                {watched && !isCurrent && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-accent-400">
                    <CheckIcon className="h-5 w-5" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`line-clamp-2 text-xs ${
                    isCurrent ? 'font-medium text-white' : 'text-zinc-300'
                  } ${v?.isUnavailable ? 'italic text-zinc-500' : ''}`}
                >
                  {i + 1}. {v?.title ?? 'Loading…'}
                </p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
