import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GearIcon } from './Icons'
import { SettingsModal } from './SettingsModal'

export function Layout({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight text-white">
            Digest
          </Link>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white"
            aria-label="Settings"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="w-full px-4 py-6 sm:px-6">{children}</main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
