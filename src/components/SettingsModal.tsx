import { useState } from 'react'
import { useStore } from '../store/useStore'

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const apiKey = useStore((s) => s.apiKey)
  const setApiKey = useStore((s) => s.setApiKey)
  const [value, setValue] = useState(apiKey)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-ink-700 bg-ink-850 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-medium text-white">Settings</h2>

        <label className="mt-4 block text-sm text-zinc-400">YouTube API key</label>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="AIza…"
          className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Stored only in this browser. Restrict the key by HTTP referrer in Google Cloud.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-zinc-300 hover:bg-ink-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setApiKey(value)
              onClose()
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
