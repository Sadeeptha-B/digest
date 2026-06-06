import { useState } from 'react'
import { useStore } from '../store/useStore'

/**
 * Shown when no API key is set. Explains how to obtain a referrer-restricted key and
 * captures it. Nothing is shipped in code — the key lives only in localStorage.
 */
export function ApiKeyGate() {
  const setApiKey = useStore((s) => s.setApiKey)
  const [value, setValue] = useState('')

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold text-white">Digest</h1>
      <p className="mt-1 text-sm text-zinc-400">Distraction-free YouTube playlists.</p>

      <div className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-5">
        <h2 className="text-base font-medium text-white">Add your YouTube API key</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
          <li>
            Open the{' '}
            <a
              className="text-sky-400 hover:underline"
              href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>{' '}
            and enable <span className="text-zinc-200">YouTube Data API v3</span>.
          </li>
          <li>Create an API key under <span className="text-zinc-200">Credentials</span>.</li>
          <li>
            Restrict it by <span className="text-zinc-200">HTTP referrer</span> to
            <span className="text-zinc-200"> localhost</span> (and your deploy domain).
          </li>
          <li>Paste it below — it stays in this browser only.</li>
        </ol>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) setApiKey(value)
          }}
        >
          <input
            autoFocus
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza…"
            className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  )
}
