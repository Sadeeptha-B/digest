import { useId, useState } from 'react'
import { POMODORO_LENGTH_RANGE, useStore } from '../store/useStore'
import { signOut, tokenIsValid } from '../lib/oauth'
import { clearApiKey } from '../lib/apiKey'
import { clearRecallKey } from '../lib/recallKey'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import { useApiKey } from '../hooks/useApiKey'
import { useRecallKey } from '../hooks/useRecallKey'
import { CloseIcon, HelpIcon } from './Icons'

function InfoTip({ text }: { text: string }) {
    const [open, setOpen] = useState(false)
    const tooltipId = useId()

    return (
        <span className="relative inline-flex items-center">
            <button
                type="button"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={() => setOpen((value) => !value)}
                className="ml-1.5 rounded-full p-0.5 text-zinc-600 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
                aria-label="More info"
                aria-describedby={open ? tooltipId : undefined}
                aria-expanded={open}
            >
                <HelpIcon className="h-3.5 w-3.5" />
            </button>
            {open && (
                <span
                    id={tooltipId}
                    role="tooltip"
                    className="absolute left-0 top-full z-20 mt-1 w-52 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-xs leading-relaxed text-zinc-400 shadow-xl"
                >
                    {text}
                </span>
            )}
        </span>
    )
}

/**
 * A whole-minutes number field. Edits stay a local draft and are committed on blur or Enter —
 * committing per keystroke would let the store clamp a partial entry ("1" on the way to "15") to the
 * minimum. The store owns the valid range (normalizeSettings); `min`/`max` only drive the native
 * spinner and its semantics.
 */
function MinutesInput({
    label,
    value,
    min,
    max,
    onCommit,
}: {
    label: string
    value: number
    min: number
    max: number
    onCommit: (minutes: number) => void
}) {
    const [draft, setDraft] = useState<string | null>(null)

    function commit() {
        if (draft === null) return
        const n = Number(draft)
        if (draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
        setDraft(null)
    }

    return (
        <input
            type="number"
            aria-label={label}
            min={min}
            max={max}
            value={draft ?? value}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
            }}
            className="w-20 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
        />
    )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
    const accessToken = useStore((s) => s.accessToken)
    const hasSignedIn = useStore((s) => s.hasSignedIn)
    const reset = useStore((s) => s.reset)
    const pomodoroLengthMin = useStore((s) => s.settings.pomodoroLengthMin)
    const setPomodoroLength = useStore((s) => s.setPomodoroLength)
    const resetThresholdMin = useStore((s) => s.settings.pomodoroResetThresholdMin ?? 5)
    const setResetThreshold = useStore((s) => s.setPomodoroResetThreshold)
    const userName = useStore((s) => s.settings.userName ?? '')
    const setUserName = useStore((s) => s.setUserName)

    const [key, setKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [recallKey, setRecallKey] = useState('')
    const [confirmClear, setConfirmClear] = useState(false)
    const [clearBusy, setClearBusy] = useState(false)
    const [clearError, setClearError] = useState<string | null>(null)

    const signedIn = hasSignedIn || tokenIsValid(accessToken)
    const { busy: authBusy, error: authError, start: handleSignIn } = useGoogleSignIn()
    const { configured: keyConfigured, busy: keyBusy, error: keyError, save: saveKey, remove: removeKey } = useApiKey()
    const {
        configured: recallConfigured,
        busy: recallBusy,
        error: recallError,
        save: saveRecall,
        remove: removeRecall,
    } = useRecallKey()

    async function handleClearData() {
        setClearError(null)
        setClearBusy(true)
        // End the server session even if this browser thinks it's signed out: the refresh cookie can
        // outlive the local flag (an earlier sign-out, or attempt at this, that couldn't reach the server).
        const results = await Promise.allSettled([signOut(), clearApiKey(), clearRecallKey()])
        if (results.some((r) => r.status === 'rejected')) {
            setClearError('Could not remove every server-side credential, so your library was kept. Try again while online.')
            setClearBusy(false)
            return
        }
        reset()
        onClose()
    }

    return (
        <>
            <div
                className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
                onClick={onClose}
            >
                <div
                    className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto scrollbar-slim rounded-xl border border-ink-700 bg-ink-850 p-5"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-medium text-white">Settings</h2>
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="rounded-lg p-1 text-zinc-500 hover:bg-ink-800 hover:text-zinc-300"
                        >
                            <CloseIcon className="h-4 w-4" />
                        </button>
                    </div>

                    {/* --- Your name --- */}
                    <label className="mt-4 flex items-center text-sm text-zinc-400">
                        Your name
                        <InfoTip text="Used for the greeting on your library page. Leave blank to keep it generic." />
                    </label>
                    <input
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value.slice(0, 40))}
                        placeholder="What should we call you?"
                        className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500"
                    />

                    <hr className="my-4 border-ink-700" />

                    {/* --- Google account --- */}
                    <label className="block text-sm text-zinc-400">Google account</label>
                    <div className="mt-2 flex items-center gap-2">
                        {signedIn ? (
                            <>
                                <span className="flex items-center gap-1.5 text-sm text-accent-400">
                                    <span className="h-2 w-2 rounded-full bg-accent-400" /> Signed in
                                </span>
                                <button
                                    onClick={() => void signOut().catch(() => { })}
                                    className="ml-auto rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800"
                                >
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleSignIn}
                                disabled={authBusy}
                                className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                            >
                                {authBusy ? 'Signing in…' : 'Sign in with Google'}
                            </button>
                        )}
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500">
                        Unlocks private playlists and transcripts. No API key required when signed in.
                        {!signedIn && ' Sign-in is limited to pre-approved Google accounts (app in "Testing" mode).'}
                    </p>
                    {authError && <p className="mt-1 text-sm text-rose-400">{authError}</p>}

                    <hr className="my-4 border-ink-700" />

                    {/* --- YouTube API key --- */}
                    {signedIn ? (
                        <p className="text-xs text-zinc-500">
                            A YouTube API key isn't needed while signed in.{' '}
                            <button onClick={() => setShowKey((v) => !v)} className="text-accent-400 hover:underline">
                                {showKey ? 'Hide' : 'Set one anyway'}
                            </button>
                        </p>
                    ) : (
                        <label className="block text-sm text-zinc-400">YouTube API key</label>
                    )}
                    {(!signedIn || showKey) && (
                        <>
                            {keyConfigured && (
                                <div className="mt-2 flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 text-sm text-accent-400">
                                        <span className="h-2 w-2 rounded-full bg-accent-400" /> Key configured
                                    </span>
                                    <button
                                        onClick={() => void removeKey()}
                                        disabled={keyBusy}
                                        className="ml-auto rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800 disabled:opacity-40"
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                            <form
                                className="mt-2 flex gap-2"
                                onSubmit={async (e) => {
                                    e.preventDefault()
                                    if (key.trim() && (await saveKey(key))) setKey('')
                                }}
                            >
                                <input
                                    type="password"
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    placeholder={keyConfigured ? 'Replace key…' : 'AIza…'}
                                    disabled={keyBusy}
                                    className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-50"
                                />
                                <button
                                    type="submit"
                                    disabled={keyBusy || !key.trim()}
                                    className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                                >
                                    {keyBusy ? 'Checking…' : 'Save'}
                                </button>
                            </form>
                            <p className="mt-1.5 text-xs text-zinc-500">
                                For browsing public content without signing in. Stored server-side; restrict it to
                                the YouTube Data API in Google Cloud.
                            </p>
                            {keyError && <p className="mt-1 text-sm text-rose-400">{keyError}</p>}
                        </>
                    )}

                    <hr className="my-4 border-ink-700" />

                    {/* --- Recall API key --- */}
                    <label className="block text-sm text-zinc-400">Recall API key</label>
                    {recallConfigured && (
                        <div className="mt-2 flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-sm text-accent-400">
                                <span className="h-2 w-2 rounded-full bg-accent-400" /> Key configured
                            </span>
                            <button
                                onClick={() => void removeRecall()}
                                disabled={recallBusy}
                                className="ml-auto rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800 disabled:opacity-40"
                            >
                                Remove
                            </button>
                        </div>
                    )}
                    <form
                        className="mt-2 flex gap-2"
                        onSubmit={async (e) => {
                            e.preventDefault()
                            if (recallKey.trim() && (await saveRecall(recallKey))) setRecallKey('')
                        }}
                    >
                        <input
                            type="password"
                            value={recallKey}
                            onChange={(e) => setRecallKey(e.target.value)}
                            placeholder={recallConfigured ? 'Replace key…' : 'sk_…'}
                            disabled={recallBusy}
                            className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={recallBusy || !recallKey.trim()}
                            className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                        >
                            {recallBusy ? 'Checking…' : 'Save'}
                        </button>
                    </form>
                    <p className="mt-1.5 text-xs text-zinc-500">
                        Shows AI summaries from your{' '}
                        <a
                            href="https://www.recall.it"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-400 hover:underline"
                        >
                            Recall
                        </a>{' '}
                        knowledge base on the watch page. This key grants read access to your entire Recall
                        library, so it's stored server-side and never exposed to the browser.
                    </p>
                    {recallError && <p className="mt-1 text-sm text-rose-400">{recallError}</p>}

                    <hr className="my-4 border-ink-700" />

                    {/* --- Pomodoro focus timer --- */}
                    <label className="flex items-center text-sm text-zinc-400">
                        Pomodoro length
                        <InfoTip text="Length of each focus block. For videos over 15 minutes, a timeline of blocks with skippable 5-minute breaks appears below the video." />
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                        <MinutesInput
                            label="Pomodoro length (minutes)"
                            value={pomodoroLengthMin}
                            min={POMODORO_LENGTH_RANGE.min}
                            max={POMODORO_LENGTH_RANGE.max}
                            onCommit={setPomodoroLength}
                        />
                        <span className="text-sm text-zinc-400">minutes</span>
                    </div>

                    {/* --- Pomodoro reset threshold --- */}
                    <label className="mt-4 flex items-center text-sm text-zinc-400">
                        Reset threshold
                        <InfoTip text="Pause in the first N minutes of a block and it resets — resume starts fresh. Pause later and the timer holds, keeping your progress. Set to 0 to never reset." />
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                        <MinutesInput
                            label="Reset threshold (minutes)"
                            value={resetThresholdMin}
                            min={0}
                            max={pomodoroLengthMin}
                            onCommit={setResetThreshold}
                        />
                        <span className="text-sm text-zinc-400">minutes</span>
                    </div>

                    <hr className="my-4 border-ink-700" />

                    {/* --- Clear data --- */}
                    <label className="block text-sm text-zinc-400">Clear data</label>
                    <button
                        onClick={() => setConfirmClear(true)}
                        className="mt-2 rounded-lg border border-rose-900/60 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950/40"
                    >
                        Clear all data
                    </button>

                    <div className="mt-5 flex justify-end">
                        <button
                            onClick={onClose}
                            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>

            {/* --- Nested clear-data confirm --- */}
            {confirmClear && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
                    onClick={() => !clearBusy && setConfirmClear(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-xl border border-rose-900/60 bg-ink-850 p-5 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-base font-medium text-white">Clear all data?</h3>
                        <p className="mt-2 text-sm text-zinc-400">
                            Removes all lists, videos, watch progress, cached transcripts, and credentials from
                            this browser. This can't be undone.
                        </p>
                        {clearError && <p className="mt-2 text-sm text-rose-400">{clearError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmClear(false)}
                                disabled={clearBusy}
                                className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800 disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleClearData()}
                                disabled={clearBusy}
                                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40"
                            >
                                {clearBusy ? 'Clearing…' : 'Clear everything'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
