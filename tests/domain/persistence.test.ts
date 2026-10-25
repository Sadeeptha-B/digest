// What survives a reload: the persist config in useStore (partialize + migrate). Old-version
// fixtures in tests/fixtures/persisted are real shapes returning users still have in localStorage.
import { describe, expect, it } from 'vitest'
import { useStore } from '../../src/store/useStore'
import { INBOX_LIST_ID } from '../../src/types'
import v1 from '../fixtures/persisted/v1.json'
import v6 from '../fixtures/persisted/v6.json'
import v9 from '../fixtures/persisted/v9.json'
import v10 from '../fixtures/persisted/v10.json'
import v10ThresholdOverLength from '../fixtures/persisted/v10-threshold-over-length.json'
import { imported, playlist, store, video } from '../support/factories'

const KEY = 'digest-store'

async function rehydrateFrom(fixture: unknown) {
    localStorage.setItem(KEY, JSON.stringify(fixture))
    await useStore.persist.rehydrate()
}

function persisted(): Record<string, unknown> {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}').state
}

describe('partialize', () => {
    it('never writes the access token or the server-probed Recall flag to localStorage', () => {
        store().setAccessToken({ value: 'ya29.secret', expiresAt: Date.now() + 60_000 })
        store().setRecallConfigured(true)
        store().setHasSignedIn(true)
        const saved = persisted()
        expect(saved).not.toHaveProperty('accessToken')
        expect(saved).not.toHaveProperty('recallConfigured')
        expect(saved.hasSignedIn).toBe(true)
        expect(localStorage.getItem(KEY)).not.toContain('ya29.secret')
    })
})

describe('migrations', () => {
    const fixtures = { v1, v6, v9, v10, v10ThresholdOverLength }

    // Presence isn't enough: settings must also be valid together.
    it.each(Object.entries(fixtures))('%s: the Pomodoro settings are mutually valid after migrating', async (_name, fixture) => {
        await rehydrateFrom(fixture)
        const { pomodoroLengthMin, pomodoroResetThresholdMin } = store().settings
        expect(pomodoroLengthMin).toBeGreaterThanOrEqual(5)
        expect(pomodoroLengthMin).toBeLessThanOrEqual(60)
        expect(pomodoroResetThresholdMin).toBeGreaterThanOrEqual(0)
        expect(pomodoroResetThresholdMin).toBeLessThanOrEqual(pomodoroLengthMin)
    })

    it('repairs a reset threshold saved longer than its block, and the repair is persisted', async () => {
        // Reachable before the setter clamped: threshold 20, then the block shortened to 10.
        await rehydrateFrom(v10ThresholdOverLength)
        expect(store().settings).toMatchObject({ pomodoroLengthMin: 10, pomodoroResetThresholdMin: 10 })

        // Written back at the current version, so the next load (no migration) keeps the repair.
        const saved = JSON.parse(localStorage.getItem(KEY)!)
        expect(saved.version).toBe(useStore.persist.getOptions().version)
        expect(saved.state.settings).toMatchObject({ pomodoroLengthMin: 10, pomodoroResetThresholdMin: 10 })
        useStore.setState(useStore.getInitialState(), true) // (this writes too — put the save back)
        await rehydrateFrom(saved)
        expect(store().settings).toMatchObject({ pomodoroLengthMin: 10, pomodoroResetThresholdMin: 10 })
    })

    it.each(Object.entries(fixtures))('%s: every current setting exists after migrating', async (_name, fixture) => {
        await rehydrateFrom(fixture)
        // persist merges shallowly, so a setting added without a migration would be undefined here.
        const expectedKeys = Object.keys(useStore.getInitialState().settings)
        for (const key of expectedKeys) {
            expect(store().settings[key as keyof ReturnType<typeof store>['settings']], key).toBeDefined()
        }
    })

    it.each(Object.entries(fixtures))('%s: every playlist has the current shape', async (_name, fixture) => {
        await rehydrateFrom(fixture)
        for (const p of store().playlists) {
            expect(typeof p.lastSyncedAt).toBe('number')
            expect(Array.isArray(p.removedVideoIds)).toBe(true)
            expect(Array.isArray(p.restoredVideoIds)).toBe(true)
            expect(new Set(p.videoIds).size).toBe(p.videoIds.length)
        }
    })

    it('v1: deletes the in-browser secrets and backfills defaults', async () => {
        await rehydrateFrom(v1)
        const state = store() as unknown as Record<string, unknown>
        expect(state.apiKey).toBeUndefined()
        expect(state.oauthClientId).toBeUndefined()
        expect(persisted()).not.toHaveProperty('apiKey')
        expect(store().settings).toMatchObject({
            pomodoroLengthMin: 30,
            pomodoroResetThresholdMin: 5,
            accentTheme: 'indigo',
            userName: '',
            focusMode: true,
        })
        expect(playlist('p1')).toMatchObject({ lastSyncedAt: 1000, removedVideoIds: [], restoredVideoIds: [] })
        expect(store().progress.v1.watched).toBe(true)
    })

    it('v6: keeps user choices that already exist', async () => {
        await rehydrateFrom(v6)
        expect(store().settings).toMatchObject({ pomodoroResetThresholdMin: 3, accentTheme: 'teal', userName: 'Sam' })
        expect(playlist('p1').lastSyncedAt).toBe(5000)
        expect(store().apiKeyConfigured).toBe(true)
    })

    it('v9: renames the default "Saved videos" list to Inbox, keeps focusMode, dedupes repeats', async () => {
        await rehydrateFrom(v9)
        expect(playlist(INBOX_LIST_ID).title).toBe('Inbox')
        expect(store().settings.focusMode).toBe(false)
        expect(playlist('p1').videoIds).toEqual(['A', 'B', 'C'])
    })

    it('v10: leaves a list the user deliberately titled "Saved videos" alone, dedupes repeats', async () => {
        await rehydrateFrom(v10)
        expect(playlist(INBOX_LIST_ID).title).toBe('Saved videos')
        expect(playlist('p1').videoIds).toEqual(['A'])
    })
})

/** The store's data fields, without its actions. */
function data(state: object = store()): Record<string, unknown> {
    return Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
}

/** Fill every field with something distinguishable from a fresh install, through the store's own actions. */
function populate() {
    store().addPlaylist(imported('a', ['v1', 'v2'], { title: 'Course' }))
    store().removeVideoFromPlaylist('a', 'v2') // a tombstone
    store().addVideoToList(video('v3'), store().createList('Weekend'))
    store().upsertVideos([video('v1'), video('v2')])
    store().setWatched('v1', true)
    store().setPosition('v3', 321)
    store().cacheTranscript('v1', { status: 'ok', source: 'manual', fetchedAt: 42, lines: [{ startSec: 1, text: 'Hello' }] })
    store().addFocusNote('call the dentist')
    store().logPomodoroEvent('v1', { type: 'work-complete', at: 7, index: 0, stretchSec: 1500 })
    store().setPomodoroLength(40)
    store().setPomodoroResetThreshold(8)
    store().setAccentTheme('teal')
    store().setUserName('Sam')
    store().setFocusMode(false)
    store().setHasSignedIn(true)
    store().setApiKeyConfigured(true)
    // In memory only:
    store().setAccessToken({ value: 'ya29.secret', expiresAt: Date.now() + 60_000 })
    store().setRecallConfigured(true)
}

describe('populated state', () => {
    const fresh = () => data(useStore.getInitialState())

    it('touches every field, so the round trip and reset below cover them all', () => {
        populate()
        const populated = data()
        // A field added to the store fails here until populate() fills it.
        for (const [key, value] of Object.entries(fresh())) expect(populated[key], key).not.toEqual(value)
        // One level down for settings, the one nested object of plain values. Deeper shapes aren't checked.
        const settings = populated.settings as Record<string, unknown>
        for (const [key, value] of Object.entries(fresh().settings as object)) expect(settings[key], `settings.${key}`).not.toEqual(value)
    })

    it('survives a reload field for field, except what is kept in memory only', async () => {
        populate()
        const before = data()
        const saved = localStorage.getItem(KEY)!
        useStore.setState(useStore.getInitialState(), true) // a fresh page (this writes too: put the save back)
        localStorage.setItem(KEY, saved)
        await useStore.persist.rehydrate()
        expect(data()).toEqual({ ...before, accessToken: null, recallConfigured: false })
    })

    it('reset returns every field to a fresh install, in memory and in storage', () => {
        populate()
        store().reset()
        expect(data()).toEqual(fresh())
        const { accessToken: _token, recallConfigured: _recall, ...persistedFresh } = fresh()
        expect(persisted()).toEqual(persistedFresh)
    })
})
