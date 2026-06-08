import { useState } from 'react'
import { useGoogleSignIn } from '../hooks/useGoogleSignIn'
import { useApiKey } from '../hooks/useApiKey'

/**
 * First-run onboarding (shown only when the library is empty and there's no live session). Two
 * ways in, both always available:
 *  - Sign in with Google (recommended) — unlocks private playlists, and needs no API key.
 *  - Use a public API key — read-only access to public/unlisted content, no sign-in.
 */
export function ApiKeyGate() {
    const [showKey, setShowKey] = useState(false)
    const [key, setKey] = useState('')
    const { busy, error, start: handleSignIn } = useGoogleSignIn()
    const { busy: keyBusy, error: keyError, save: saveKey } = useApiKey()

    return (
        <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
            <h1 className="text-2xl font-semibold text-white">Digest</h1>
            <p className="mt-1 text-sm text-zinc-400">Distraction-free YouTube playlists.</p>

            <div className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-5">
                <h2 className="text-base font-medium text-white">Sign in to get started</h2>
                <p className="mt-1 text-sm text-zinc-400">
                    Connect your Google account to access your playlists. No API key needed.
                </p>
                <button
                    onClick={handleSignIn}
                    disabled={busy}
                    className="mt-4 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                >
                    {busy ? 'Signing in…' : 'Sign in with Google'}
                </button>
                {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

                <p className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-zinc-500">
                    Sign-in is limited to <span className="text-zinc-300">pre-approved Google accounts</span>{' '}
                    (this app is in Google's “Testing” mode). If yours isn't approved, use a public API
                    key below instead.
                </p>

                <button
                    onClick={() => setShowKey((value) => !value)}
                    className="mt-3 block text-sm text-accent-400 hover:underline"
                >
                    {showKey ? 'Hide' : 'Or use a public API key instead'}
                </button>

                {showKey && (
                    <>
                        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-zinc-400">
                            <li>
                                Open the{' '}
                                <a
                                    href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-accent-400 hover:underline"
                                >
                                    Google Cloud Console
                                </a>{' '}
                                and enable <span className="text-zinc-200">YouTube Data API v3</span>.
                            </li>
                            <li>
                                Go to{' '}
                                <a
                                    href="https://console.cloud.google.com/apis/credentials"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-accent-400 hover:underline"
                                >
                                    Credentials
                                </a>{' '}
                                → <span className="text-zinc-200">Create credentials → API key</span>.
                            </li>
                            <li>
                                Restrict the key to the{' '}
                                <span className="text-zinc-200">YouTube Data API v3</span> (API restriction)
                                and paste it below.
                            </li>
                        </ol>

                        <form
                            className="mt-3 flex gap-2"
                            onSubmit={async (e) => {
                                e.preventDefault()
                                if (key.trim()) await saveKey(key)
                            }}
                        >
                            <input
                                autoFocus
                                type="password"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder="AIza…"
                                disabled={keyBusy}
                                className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-accent-500 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={keyBusy || !key.trim()}
                                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                            >
                                {keyBusy ? 'Checking…' : 'Save'}
                            </button>
                        </form>
                        {keyError && <p className="mt-2 text-sm text-rose-400">{keyError}</p>}
                    </>
                )}
            </div>
        </div>
    )
}
