// Points the global fetch at a fake while the fixtures run a real Pages Function, whose upstream calls
// (to Google) go through it. Tested directly in withFetch.spec.ts.

let fetchSwaps = 0
let realFetch: typeof fetch = globalThis.fetch

/**
 * Swap the global fetch while `run` executes (a Function's upstream calls go through it). Counted, so
 * overlapping requests (a refresh racing a logout) can't restore the real fetch under one another and
 * let an upstream call reach the real Google.
 */
export async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
    if (fetchSwaps++ === 0) {
        realFetch = globalThis.fetch
        globalThis.fetch = impl
    }
    try {
        return await run()
    } finally {
        if (--fetchSwaps === 0) globalThis.fetch = realFetch
    }
}
