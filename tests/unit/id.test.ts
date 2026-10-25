import { describe, expect, it, vi } from 'vitest'
import { createId } from '../../src/lib/id'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('createId', () => {
    it('returns a v4 UUID', () => {
        expect(createId()).toMatch(V4)
    })

    it('falls back to getRandomValues where randomUUID is missing (older browsers, http contexts)', () => {
        const real = globalThis.crypto
        vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
        const ids = new Set(Array.from({ length: 50 }, createId))
        expect(ids.size).toBe(50)
        for (const id of ids) expect(id).toMatch(V4)
    })
})
