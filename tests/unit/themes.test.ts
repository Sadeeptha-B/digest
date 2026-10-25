import { beforeEach, describe, expect, it } from 'vitest'
import { bootstrapAccentTheme } from '../../src/lib/themes'

const persist = (raw: string) => localStorage.setItem('digest-store', raw)

beforeEach(() => {
    delete document.documentElement.dataset.theme
})

describe('bootstrapAccentTheme', () => {
    it('applies the persisted theme before React mounts', () => {
        persist(JSON.stringify({ state: { settings: { accentTheme: 'teal' } }, version: 11 }))
        bootstrapAccentTheme()
        expect(document.documentElement.dataset.theme).toBe('teal')
    })

    it.each([
        ['nothing stored', null],
        ['corrupt JSON', '{not json'],
        ['an unknown theme', JSON.stringify({ state: { settings: { accentTheme: 'neon' } } })],
    ])('falls back to the default for %s', (_label, raw) => {
        if (raw !== null) persist(raw)
        bootstrapAccentTheme()
        expect(document.documentElement.dataset.theme).toBe('indigo')
    })
})
