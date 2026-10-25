import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { useStore } from '../src/store/useStore'
import { clearRecallCache } from '../src/lib/recall'
import { assertNoUnhandledRequests, listen, server } from './support/msw'

// jsdom's Blob lacks text(), which every supported browser has (the transcript upload uses it).
if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsText(this)
        })
    }
}

beforeAll(listen)
beforeEach(() => {
    localStorage.clear()
    useStore.setState(useStore.getInitialState(), true)
    clearRecallCache()
})
afterEach(() => {
    cleanup()
    // Shared teardown, so a failing assertion can never leak a spy, fake clock or stubbed global.
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    server.resetHandlers()
    assertNoUnhandledRequests()
})
afterAll(() => server.close())
