// The YouTube and Recall key clients (src/lib/apiKey.ts, src/lib/recallKey.ts). The keys live in
// server-side HttpOnly cookies; the browser only tracks a boolean, reconciled with the server.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { clearApiKey, refreshApiKeyStatus, saveApiKey } from '../../src/lib/apiKey'
import { clearRecallKey, saveRecallKey } from '../../src/lib/recallKey'
import { holdGet, server } from '../support/msw'
import { store } from '../support/factories'

describe.each([
    {
        name: 'YouTube API key',
        endpoint: '/api/key',
        save: saveApiKey,
        clear: clearApiKey,
        flag: () => store().apiKeyConfigured,
        setFlag: (v: boolean) => store().setApiKeyConfigured(v),
        rejected: 'That API key was rejected.',
    },
    {
        name: 'Recall key',
        endpoint: '/api/recall/key',
        save: saveRecallKey,
        clear: clearRecallKey,
        flag: () => store().recallConfigured,
        setFlag: (v: boolean) => store().setRecallConfigured(v),
        rejected: 'That Recall API key was rejected.',
    },
])('$name', ({ endpoint, save, clear, flag, setFlag, rejected }) => {
    it('saves by POSTing JSON and marks the key configured', async () => {
        let body: unknown
        let type: string | null = null
        server.use(
            http.post(endpoint, async ({ request }) => {
                body = await request.json()
                type = request.headers.get('Content-Type')
                return HttpResponse.json({ configured: true })
            }),
        )
        await save('sk_123')
        expect(body).toEqual({ key: 'sk_123' })
        expect(type).toBe('application/json')
        expect(flag()).toBe(true)
    })

    it("surfaces the server's message on rejection, else a fallback, and stays unconfigured", async () => {
        server.use(http.post(endpoint, () => HttpResponse.json({ message: 'API key not valid.' }, { status: 400 })))
        await expect(save('bad')).rejects.toThrow('API key not valid.')
        server.use(http.post(endpoint, () => new HttpResponse('oops', { status: 500 })))
        await expect(save('bad')).rejects.toThrow(rejected)
        expect(flag()).toBe(false)
    })

    it('explains an unreachable server', async () => {
        server.use(http.post(endpoint, () => HttpResponse.error()))
        await expect(save('k')).rejects.toThrow(/Could not reach the server/)
    })

    it('clears via DELETE', async () => {
        setFlag(true)
        server.use(http.delete(endpoint, () => HttpResponse.json({ configured: false })))
        await clear()
        expect(flag()).toBe(false)
    })

    it('keeps the flag when clearing fails', async () => {
        setFlag(true)
        server.use(http.delete(endpoint, () => HttpResponse.json({ message: 'nope' }, { status: 403 })))
        await expect(clear()).rejects.toThrow('nope')
        expect(flag()).toBe(true)
    })
})

describe('refreshApiKeyStatus', () => {
    it('honours the server when it answers', async () => {
        store().setApiKeyConfigured(true)
        server.use(http.get('/api/key', () => HttpResponse.json({ configured: false })))
        expect(await refreshApiKeyStatus()).toBe(false)
        expect(store().apiKeyConfigured).toBe(false)
    })

    it.each([
        ['offline', () => HttpResponse.error()],
        ['a server error', () => new HttpResponse(null, { status: 500 })],
        ['plain vite dev (index.html instead of JSON)', () => new HttpResponse('<!doctype html>', { status: 200 })],
    ])('keeps the last-known value when %s', async (_label, resolver) => {
        store().setApiKeyConfigured(true)
        server.use(http.get('/api/key', resolver))
        expect(await refreshApiKeyStatus()).toBe(true)
        expect(store().apiKeyConfigured).toBe(true)
    })

    it('an answer from before Clear all data does not mark the key configured again', async () => {
        server.use(http.get('/api/key', () => HttpResponse.json({ configured: true })))
        const held = holdGet('/api/key')
        const probe = refreshApiKeyStatus()
        await held.sent
        store().reset()
        held.release()
        expect(await probe).toBe(false) // what the store now holds
        expect(store().apiKeyConfigured).toBe(false)
    })
})
