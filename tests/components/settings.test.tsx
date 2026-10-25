// Settings: Pomodoro preferences, credentials, and clearing all data.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../../src/components/SettingsModal'
import { imported, store } from '../support/factories'
import { server } from '../support/msw'
import { renderAt } from '../support/render'

function setup() {
    const onClose = vi.fn()
    const utils = renderAt(<SettingsModal onClose={onClose} />)
    const length = screen.getByRole('spinbutton', { name: 'Pomodoro length (minutes)' })
    const threshold = screen.getByRole('spinbutton', { name: 'Reset threshold (minutes)' })
    return { ...utils, onClose, length, threshold }
}

describe('Pomodoro preferences', () => {
    it('accepts a typed length like 15 (no clamping mid-keystroke)', async () => {
        const { user, length } = setup()
        await user.clear(length)
        await user.type(length, '15')
        await user.tab()
        expect(store().settings.pomodoroLengthMin).toBe(15)
        expect(length).toHaveValue(15)
    })

    it('clamps an out-of-range length once committed', async () => {
        const { user, length } = setup()
        await user.clear(length)
        await user.type(length, '90{Enter}')
        expect(store().settings.pomodoroLengthMin).toBe(60)
        await user.clear(length)
        await user.type(length, '2{Enter}')
        expect(store().settings.pomodoroLengthMin).toBe(5)
    })

    it('ignores an emptied field', async () => {
        const { user, length } = setup()
        await user.clear(length)
        await user.tab()
        expect(store().settings.pomodoroLengthMin).toBe(25)
        expect(length).toHaveValue(25)
    })

    it('keeps the reset threshold within the block length', async () => {
        const { user, length, threshold } = setup()
        await user.clear(threshold)
        await user.type(threshold, '20{Enter}')
        expect(store().settings.pomodoroResetThresholdMin).toBe(20)
        await user.clear(length)
        await user.type(length, '10{Enter}')
        expect(threshold).toHaveValue(10)
    })
})

describe('credentials', () => {
    it('signs out', async () => {
        server.use(http.post('/auth/logout', () => new HttpResponse(null, { status: 204 })))
        store().setHasSignedIn(true)
        const { user } = setup()
        await user.click(screen.getByRole('button', { name: 'Sign out' }))
        expect(store().hasSignedIn).toBe(false)
        expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    })

    it('saves a YouTube API key and shows the server message when rejected', async () => {
        server.use(http.post('/api/key', () => HttpResponse.json({ message: 'API key not valid.' }, { status: 400 })))
        const { user } = setup()
        await user.type(screen.getByPlaceholderText('AIza…'), 'bad{Enter}')
        expect(await screen.findByText('API key not valid.')).toBeInTheDocument()

        server.use(http.post('/api/key', () => HttpResponse.json({ configured: true })))
        await user.click(screen.getAllByRole('button', { name: 'Save' })[0])
        expect(await screen.findAllByText('Key configured')).toHaveLength(1)
        expect(store().apiKeyConfigured).toBe(true)
    })
})

describe('clear all data', () => {
    /** Answer the three credential endpoints, failing the named ones; records what was cleared. */
    function credentials({ fail = [] as string[] } = {}) {
        const cleared: string[] = []
        const answer = (name: string, ok: () => Response) => () => {
            if (fail.includes(name)) return HttpResponse.error()
            cleared.push(name)
            return ok()
        }
        server.use(
            http.post('/auth/logout', answer('session', () => new HttpResponse(null, { status: 204 }))),
            http.delete('/api/key', answer('yt', () => HttpResponse.json({ configured: false }))),
            http.delete('/api/recall/key', answer('recall', () => HttpResponse.json({ configured: false }))),
        )
        return cleared
    }

    async function clearEverything(user: ReturnType<typeof setup>['user']) {
        await user.click(screen.getByRole('button', { name: 'Clear all data' }))
        await user.click(screen.getByRole('button', { name: 'Clear everything' }))
    }

    it.each([
        ['signed out', false],
        ['signed in', true],
    ])('%s: ends the server session and removes both keys, then wipes the library', async (_label, signedIn) => {
        const cleared = credentials()
        store().setHasSignedIn(signedIn)
        store().addPlaylist(imported('a', ['v1']))
        const { user, onClose } = setup()
        await clearEverything(user)
        await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
        // The session is ended even when signed out here: a refresh cookie can outlive the local flag.
        expect(cleared.sort()).toEqual(['recall', 'session', 'yt'])
        expect(store()).toMatchObject({ playlists: [], hasSignedIn: false })
    })

    it.each([['session'], ['yt']])(
        'keeps the library when the %s credential could not be cleared, and a retry clears what is left',
        async (failing) => {
            credentials({ fail: [failing] })
            store().setHasSignedIn(true)
            store().addPlaylist(imported('a', ['v1']))
            const { user, onClose } = setup()
            await clearEverything(user)
            expect(await screen.findByText(/Could not remove every server-side credential/)).toBeInTheDocument()
            expect(store().playlists).toHaveLength(1)
            expect(onClose).not.toHaveBeenCalled()

            // Back online. The local session already ended, but the retry still reaches the server.
            const cleared = credentials()
            await user.click(screen.getByRole('button', { name: 'Clear everything' }))
            await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
            expect(cleared.sort()).toEqual(['recall', 'session', 'yt'])
            expect(store().playlists).toEqual([])
        },
    )
})
