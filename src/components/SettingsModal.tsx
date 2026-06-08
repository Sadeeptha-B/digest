import { useState } from 'react'
import { useStore } from '../store/useStore'
import { signOut, tokenIsValid } from '../lib/oauth'
import { clearApiKey } from '../lib/apiKey'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import { useApiKey } from '../hooks/useApiKey'

export function SettingsModal({ onClose }: { onClose: () => void }) {
    const accessToken = useStore((s) => s.accessToken)
    const hasSignedIn = useStore((s) => s.hasSignedIn)
    const reset = useStore((s) => s.reset)

    const [key, setKey] = useState('')
    const [showKey, setShowKey] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)

    const signedIn = hasSignedIn || tokenIsValid(accessToken)
    const { busy: authBusy, error: authError, start: handleSignIn } = useGoogleSignIn()
    const { configured: keyConfigured, busy: keyBusy, error: keyError, save: saveKey, remove: removeKey } = useApiKey()

    function handleClearData() {
        if (signedIn) signOut() // revoke the token before wiping everything
        void clearApiKey().catch(() => { }) // clear the server-side key cookie too
        reset()
        onClose()
    }

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

                {/* --- Google account --- */}
                <label className="mt-4 block text-sm text-zinc-400">Google account</label>
                <div className="mt-2 flex items-center gap-2">
                    {signedIn ? (
                        <>
                            <span className="flex items-center gap-1.5 text-sm text-accent-400">
                                <span className="h-2 w-2 rounded-full bg-accent-400" /> Signed in
                            </span>
                            <button
                                onClick={() => signOut()}
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
                </p>
                {authError && <p className="mt-1 text-sm text-rose-400">{authError}</p>}

                <hr className="my-4 border-ink-700" />

                {/* --- API key (only relevant when not signed in) --- */}
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

                {/* --- Clear data --- */}
                <label className="block text-sm text-zinc-400">Clear data</label>
                <p className="mt-1 text-xs text-zinc-500">
                    Removes all lists, videos, watch progress, cached transcripts, and credentials from this
                    browser, resetting the app to a fresh install.
                </p>
                {confirmClear ? (
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-rose-400">This can't be undone.</span>
                        <button
                            onClick={handleClearData}
                            className="ml-auto rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500"
                        >
                            Clear everything
                        </button>
                        <button
                            onClick={() => setConfirmClear(false)}
                            className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-800"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmClear(true)}
                        className="mt-2 rounded-lg border border-rose-900/60 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950/40"
                    >
                        Clear all data
                    </button>
                )}

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
    )
}
