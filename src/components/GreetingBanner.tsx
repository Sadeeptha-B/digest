import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { pickTagline, timeGreeting } from '../lib/greeting'

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export function GreetingBanner() {
  const name = useStore((s) => s.settings.userName ?? '')
  const playlists = useStore((s) => s.playlists)
  const progress = useStore((s) => s.progress)

  // Live clock — re-render exactly on each minute boundary rather than every second.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let id: number
    const schedule = () => {
      id = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60000 - (Date.now() % 60000))
    }
    schedule()
    return () => window.clearTimeout(id)
  }, [])

  const unwatched = useMemo(() => {
    const ids = new Set<string>()
    for (const p of playlists) for (const id of p.videoIds) if (!progress[id]?.watched) ids.add(id)
    return ids.size
  }, [playlists, progress])

  // Pick a tagline once per load (kept stable as the clock ticks).
  const tagline = useMemo(() => pickTagline(new Date(), unwatched), [unwatched])

  const greeting = timeGreeting(now)
  let hours = now.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return (
    <section className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800 bg-ink-900/40 px-5 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold leading-snug text-white sm:text-2xl">
          {greeting}
          {name && (
            <>
              , <span className="text-accent-300">{name}</span>
            </>
          )}
          .{' '}
          <span className="font-normal text-zinc-400">{tagline}</span>
        </h1>
      </div>

      <div className="shrink-0 text-right">
        <div className="font-mono text-2xl font-semibold leading-none tabular-nums text-white sm:text-3xl">
          {hours}:{minutes}
          <span className="ml-1 align-baseline text-sm font-medium text-accent-300">{ampm}</span>
        </div>
        <div className="mt-1.5 text-xs text-zinc-500">{dateFmt.format(now)}</div>
      </div>
    </section>
  )
}
