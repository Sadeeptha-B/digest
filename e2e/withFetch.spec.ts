// The fixtures' fetch swap (e2e/withFetch.ts). A slip here would let a Function's upstream call reach
// the real Google, and ordinary journeys seldom force these orderings, so they are exercised directly.
import { expect, test } from '@playwright/test'
import { withFetch } from './withFetch'

const fake: typeof fetch = async () => new Response('fake')

test('overlapping calls keep the fake until the last one finishes, then restore the real fetch', async () => {
    const real = globalThis.fetch
    let finishFirst!: () => void
    let finishSecond!: () => void
    const first = withFetch(fake, () => new Promise<void>((resolve) => (finishFirst = resolve)))
    const second = withFetch(fake, () => new Promise<void>((resolve) => (finishSecond = resolve)))
    expect(globalThis.fetch).toBe(fake)

    finishFirst()
    await first
    expect(globalThis.fetch, 'the second call is still running').toBe(fake)

    finishSecond()
    await second
    expect(globalThis.fetch).toBe(real)
})

test('a call that throws still restores the real fetch', async () => {
    const real = globalThis.fetch
    await expect(withFetch(fake, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(globalThis.fetch).toBe(real)
})
