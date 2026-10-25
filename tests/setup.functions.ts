import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { assertNoUnhandledRequests, listen, server } from './support/msw'

beforeAll(listen)
afterEach(() => {
    server.resetHandlers()
    vi.restoreAllMocks()
    assertNoUnhandledRequests()
})
afterAll(() => server.close())
