import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { CloseIcon } from '../Icons'

// Parking lot for intrusive thoughts: get "I should email X" out of your head so it stops
// looping, then return to the video. Persists across sessions so the list is actually revisited.
export function BrainDumpPad() {
  const notes = useStore((s) => s.focusNotes)
  const addFocusNote = useStore((s) => s.addFocusNote)
  const removeFocusNote = useStore((s) => s.removeFocusNote)
  const clearFocusNotes = useStore((s) => s.clearFocusNotes)
  const [text, setText] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    addFocusNote(text)
    setText('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-ink-700 bg-ink-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Brain dump</span>
        {notes.length > 0 && (
          <button
            onClick={clearFocusNotes}
            className="rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400 hover:bg-ink-800 hover:text-zinc-200"
          >
            Clear
          </button>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Park a thought, stay on the video…"
          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-accent-500"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
        >
          Add
        </button>
      </form>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto scrollbar-slim">
        {notes.length === 0 ? (
          <p className="px-1 py-2 text-xs text-zinc-600">
            Nothing parked. When a stray thought pulls at you, drop it here and let it go — it'll
            keep until you're done.
          </p>
        ) : (
          <ul className="space-y-1">
            {notes.map((n) => (
              <li
                key={n.id}
                className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-800"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-300">
                  {n.text}
                </span>
                <button
                  onClick={() => removeFocusNote(n.id)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-600 hover:text-zinc-300"
                  aria-label="Remove note"
                  title="Done with this"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
