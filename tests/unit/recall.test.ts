// The Recall summary client (src/lib/recall.ts): find the card saved for a video, fetch its
// chunks, cache per session (ADR 0009).
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { getCardForVideo, getRecallStatus } from '../../src/lib/recall'
import { saveRecallKey } from '../../src/lib/recallKey'
import { server } from '../support/msw'

const ID = 'dQw4w9WgXcQ'

function recallApi(cards: Array<{ id: string; source_url?: string }>, detail: Record<string, unknown> = {}) {
    const calls = { list: 0, card: 0 }
    server.use(
        http.get('/api/recall/cards', ({ request }) => {
            calls.list++
            expect(new URL(request.url).searchParams.get('source_url_contains')).toBe(ID)
            return HttpResponse.json({ results: cards.map((c) => ({ title: `Card ${c.id}`, ...c })) })
        }),
        http.get('/api/recall/cards/:id', ({ params }) => {
            calls.card++
            return HttpResponse.json({
                id: params.id,
                title: 'Summary',
                chunks: [{ chunk_id: 'c1', content: 'Point one', timestamps: ['01:23', 7] }],
                ...detail,
            })
        }),
    )
    return calls
}

describe('getCardForVideo', () => {
    it('returns the card whose source URL is this video', async () => {
        recallApi([
            { id: 'other', source_url: `https://www.youtube.com/watch?v=${ID}x` }, // substring match only
            { id: 'mine', source_url: `https://youtu.be/${ID}` },
        ])
        const card = await getCardForVideo(ID)
        expect(card).toMatchObject({ id: 'mine', title: 'Summary' })
        expect(card?.chunks).toEqual([{ chunk_id: 'c1', content: 'Point one', source: undefined, timestamps: ['01:23'] }])
    })

    it('matches a card saved from a watch URL inside a playlist (watch?v=…&list=…)', async () => {
        recallApi([{ id: 'from-playlist', source_url: `https://www.youtube.com/watch?v=${ID}&list=PLabcdefghijkl&index=2` }])
        expect(await getCardForVideo(ID)).toMatchObject({ id: 'from-playlist' })
    })

    it('caches "no card" for the session, so it does not refetch', async () => {
        const calls = recallApi([])
        expect(await getCardForVideo(ID)).toBeNull()
        expect(await getCardForVideo(ID)).toBeNull()
        expect(calls.list).toBe(1)
    })

    it('does not cache failures', async () => {
        server.use(http.get('/api/recall/cards', () => new HttpResponse(null, { status: 503 })))
        await expect(getCardForVideo(ID)).rejects.toThrow(/503/)
        const calls = recallApi([])
        await getCardForVideo(ID)
        expect(calls.list).toBe(1)
    })

    it('accepts card_id and drops malformed chunks', async () => {
        recallApi([{ id: 'k', source_url: `https://youtu.be/${ID}` }], {
            id: undefined,
            card_id: 'k',
            chunks: [{ chunk_id: 'ok', content: 'fine' }, { chunk_id: 1 }, null, 'text'],
        })
        const card = await getCardForVideo(ID)
        expect(card?.id).toBe('k')
        expect(card?.chunks.map((c) => c.chunk_id)).toEqual(['ok'])
    })

    it('rejects a card without the required fields', async () => {
        recallApi([{ id: 'k', source_url: `https://youtu.be/${ID}` }], { title: undefined })
        await expect(getCardForVideo(ID)).rejects.toThrow(/missing required fields/)
    })

    it('a key change clears the cache', async () => {
        const calls = recallApi([])
        await getCardForVideo(ID)
        server.use(http.post('/api/recall/key', () => HttpResponse.json({ configured: true })))
        await saveRecallKey('sk_new')
        await getCardForVideo(ID)
        expect(calls.list).toBe(2)
    })
})

describe('getRecallStatus', () => {
    it('reports the configured flag', async () => {
        server.use(http.get('/api/recall/status', () => HttpResponse.json({ configured: true })))
        expect(await getRecallStatus()).toBe(true)
    })

    it.each([
        ['an error status', () => new HttpResponse(null, { status: 500 })],
        ['a network failure', () => HttpResponse.error()],
        ['a non-JSON body', () => new HttpResponse('<!doctype html>')],
    ])('is false on %s (never throws)', async (_label, resolver) => {
        server.use(http.get('/api/recall/status', resolver))
        expect(await getRecallStatus()).toBe(false)
    })
})
