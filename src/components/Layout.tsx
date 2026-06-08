import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GearIcon } from './Icons'
import { SettingsModal } from './SettingsModal'
import { useStore } from '../store/useStore'
import { ACCENT_THEMES, applyAccentTheme, DEFAULT_ACCENT_THEME } from '../lib/themes'

export function Layout({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const accentTheme = useStore((s) => s.settings.accentTheme ?? DEFAULT_ACCENT_THEME)
  const setAccentTheme = useStore((s) => s.setAccentTheme)

  // Reflect the chosen palette onto <html> so the CSS [data-theme] vars take effect.
  useEffect(() => {
    applyAccentTheme(accentTheme)
  }, [accentTheme])

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur">
        <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="text-lg font-semibold tracking-tight text-white">
            Digest
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5"
              role="radiogroup"
              aria-label="Accent color"
            >
              {ACCENT_THEMES.map((t) => {
                const active = t.id === accentTheme
                return (
                  <button
                    key={t.id}
                    onClick={() => setAccentTheme(t.id)}
                    role="radio"
                    aria-checked={active}
                    title={t.label}
                    aria-label={t.label}
                    className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-ink-950 transition ${
                      active ? 'ring-2 ring-white' : 'ring-1 ring-white/20 hover:ring-white/50'
                    }`}
                    style={{ backgroundColor: t.swatch }}
                  />
                )
              })}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-ink-800 hover:text-white"
              aria-label="Settings"
            >
              <GearIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-6 sm:px-6">{children}</main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
