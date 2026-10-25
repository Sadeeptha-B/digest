import { http } from 'msw'
import { setupServer } from 'msw/node'
import { deferred } from './deferred'

/** Shared MSW server. Tests add per-case handlers with `server.use(...)`. */
export const server = setupServer()

const unhandled: string[] = []

/**
 * Start intercepting. Any request without a handler is blocked (never reaches the real network)
 * AND fails the test — even when the app swallows the error, as background syncs do.
 */
export function listen() {
    server.listen({
        onUnhandledRequest(request) {
            unhandled.push(`${request.method} ${request.url}`)
            throw new Error(`Unhandled request: ${request.method} ${request.url}`)
        },
    })
}

export function assertNoUnhandledRequests() {
    if (unhandled.length === 0) return
    const list = unhandled.splice(0).join('\n  ')
    throw new Error(`Request(s) with no MSW handler:\n  ${list}`)
}

/**
 * Hold GET requests to `path` until `release()`, then let them fall through to the handlers already
 * installed (a resolver that returns nothing defers to the next match). `sent` resolves once one is out.
 */
export function holdGet(path: string) {
    const sent = deferred<void>()
    const gate = deferred<void>()
    server.use(
        http.get(path, async () => {
            sent.resolve()
            await gate.promise
        }),
    )
    return { sent: sent.promise, release: () => gate.resolve() }
}
