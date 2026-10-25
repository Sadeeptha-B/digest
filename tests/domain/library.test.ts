// The library as a domain model: the store actions that implement ADR 0006 (Digest owns the
// playlist; YouTube is a source) and ADR 0011 (user-made lists; a video may be in many lists).
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { INBOX_LIST_ID, isUserList, type Playlist } from '../../src/types'
import { imported, playlist, store, video } from '../support/factories'

const remote = (videoIds: string[], title = 'Remote title', channelTitle = 'Remote channel') => ({
    title,
    channelTitle,
    videoIds,
})

describe('importing a playlist (addPlaylist)', () => {
    it('appends a new playlist', () => {
        store().addPlaylist(imported('a', ['v1']))
        store().addPlaylist(imported('b', ['v2']))
        expect(store().playlists.map((p) => p.id)).toEqual(['a', 'b'])
    })

    it('re-importing the same YouTube playlist is a fresh start that keeps identity', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3'], { addedAt: 5 }))
        store().removeVideoFromPlaylist('a', 'v2')
        store().restoreVideoToPlaylist('a', 'v2')
        store().removeVideoFromPlaylist('a', 'v3')

        store().addPlaylist(imported('fresh-uuid', ['v3', 'v1', 'v2'], { ytPlaylistId: 'PLa', addedAt: 99 }))

        const p = playlist('a')
        expect(store().playlists).toHaveLength(1)
        expect(p.addedAt).toBe(5)
        expect(p.videoIds).toEqual(['v3', 'v1', 'v2'])
        expect(p.removedVideoIds).toEqual([])
        expect(p.restoredVideoIds).toEqual([])
    })

    it('keeps only the first occurrence of a video YouTube lists twice (ADR 0011: once per list)', () => {
        store().addPlaylist(imported('a', ['A', 'B', 'A', 'C']))
        expect(playlist('a').videoIds).toEqual(['A', 'B', 'C'])
    })
})

describe('syncing (mergePlaylistContents)', () => {
    it("keeps the user's order for videos still upstream and appends new ones in YouTube order", () => {
        store().addPlaylist(imported('a', ['v3', 'v1', 'v2']))
        store().mergePlaylistContents('a', remote(['v1', 'v2', 'v3', 'v5', 'v4']))
        expect(playlist('a').videoIds).toEqual(['v3', 'v1', 'v2', 'v5', 'v4'])
    })

    it('drops videos deleted upstream', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3']))
        store().mergePlaylistContents('a', remote(['v1', 'v3']))
        expect(playlist('a').videoIds).toEqual(['v1', 'v3'])
    })

    it('never resurrects a video the user removed (tombstone)', () => {
        store().addPlaylist(imported('a', ['v1', 'v2']))
        store().removeVideoFromPlaylist('a', 'v2')
        store().mergePlaylistContents('a', remote(['v1', 'v2']))
        expect(playlist('a').videoIds).toEqual(['v1'])
        expect(playlist('a').removedVideoIds).toEqual(['v2'])
    })

    it('keeps an explicitly restored video while it is gone upstream, then drops the pin once it is back', () => {
        store().addPlaylist(imported('a', ['v1', 'v2']))
        store().removeVideoFromPlaylist('a', 'v2')
        store().restoreVideoToPlaylist('a', 'v2')

        store().mergePlaylistContents('a', remote(['v1']))
        expect(playlist('a').videoIds).toEqual(['v1', 'v2'])
        expect(playlist('a').restoredVideoIds).toEqual(['v2'])

        store().mergePlaylistContents('a', remote(['v1', 'v2']))
        expect(playlist('a').videoIds).toEqual(['v1', 'v2'])
        expect(playlist('a').restoredVideoIds).toEqual([])

        // Pin gone: normal rules resume, so a later upstream deletion drops it.
        store().mergePlaylistContents('a', remote(['v1']))
        expect(playlist('a').videoIds).toEqual(['v1'])
    })

    it('refreshes title/channel and stamps lastSyncedAt', () => {
        vi.spyOn(Date, 'now').mockReturnValue(42_000)
        store().addPlaylist(imported('a', ['v1']))
        store().mergePlaylistContents('a', remote(['v1'], 'New title', 'New channel'))
        expect(playlist('a')).toMatchObject({ title: 'New title', channelTitle: 'New channel', lastSyncedAt: 42_000 })
    })

    it('is a no-op for an unknown playlist', () => {
        store().addPlaylist(imported('a', ['v1']))
        const before = store().playlists
        store().mergePlaylistContents('missing', remote(['x']))
        expect(store().playlists).toBe(before)
    })

    it('dedupes a remote list that repeats a video', () => {
        store().addPlaylist(imported('a', ['A']))
        store().mergePlaylistContents('a', remote(['A', 'B', 'A', 'B', 'C']))
        expect(playlist('a').videoIds).toEqual(['A', 'B', 'C'])
    })
})

describe('removing and restoring videos', () => {
    it('tombstones a removal from an imported playlist and clears its pin', () => {
        store().addPlaylist(imported('a', ['v1', 'v2']))
        store().removeVideoFromPlaylist('a', 'v2')
        store().restoreVideoToPlaylist('a', 'v2')
        store().removeVideoFromPlaylist('a', 'v2')
        expect(playlist('a')).toMatchObject({ videoIds: ['v1'], removedVideoIds: ['v2'], restoredVideoIds: [] })
    })

    it('never tombstones a removal from a user-made list', () => {
        store().addVideoToList(video('v1'), INBOX_LIST_ID)
        store().removeVideoFromPlaylist(INBOX_LIST_ID, 'v1')
        expect(playlist(INBOX_LIST_ID)).toMatchObject({ videoIds: [], removedVideoIds: [] })
    })

    it('restore appends, clears the tombstone and pins', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3']))
        store().removeVideoFromPlaylist('a', 'v1')
        store().restoreVideoToPlaylist('a', 'v1')
        expect(playlist('a')).toMatchObject({ videoIds: ['v2', 'v3', 'v1'], removedVideoIds: [], restoredVideoIds: ['v1'] })
    })

    it('restoring a video that is not tombstoned is a no-op', () => {
        store().addPlaylist(imported('a', ['v1']))
        store().restoreVideoToPlaylist('a', 'v1')
        store().restoreVideoToPlaylist('a', 'ghost')
        expect(playlist('a')).toMatchObject({ videoIds: ['v1'], restoredVideoIds: [] })
    })
})

describe('user-made lists (ADR 0011)', () => {
    it('createList trims the name and defaults a blank one', () => {
        const a = store().createList('  Reading  ')
        const b = store().createList('   ')
        expect(playlist(a)).toMatchObject({ title: 'Reading', ytPlaylistId: null, videoIds: [] })
        expect(playlist(b).title).toBe('Untitled list')
    })

    it('renames only user-made lists and ignores blank names', () => {
        const id = store().createList('Old')
        store().addPlaylist(imported('yt', []))
        store().renamePlaylist(id, '  New  ')
        store().renamePlaylist(id, '   ')
        store().renamePlaylist('yt', 'Hijacked')
        expect(playlist(id).title).toBe('New')
        expect(playlist('yt').title).toBe('Playlist yt')
    })

    it('saves a video once per list and caches its metadata', () => {
        const id = store().createList('Later')
        store().addVideoToList(video('v1'), id)
        store().addVideoToList(video('v1', { title: 'Updated' }), id)
        expect(playlist(id).videoIds).toEqual(['v1'])
        expect(store().videos.v1.title).toBe('Updated')
    })

    it('refuses to save into an imported playlist', () => {
        store().addPlaylist(imported('yt', ['v1']))
        store().addVideoToList(video('v2'), 'yt')
        expect(playlist('yt').videoIds).toEqual(['v1'])
    })

    it('recreates the Inbox at the front on demand, but no other missing list', () => {
        store().addPlaylist(imported('yt', []))
        store().addVideoToList(video('v1'), 'deleted-list')
        expect(store().playlists.map((p) => p.id)).toEqual(['yt'])

        store().addVideoToList(video('v1'), INBOX_LIST_ID)
        expect(store().playlists.map((p) => p.id)).toEqual([INBOX_LIST_ID, 'yt'])
        expect(playlist(INBOX_LIST_ID)).toMatchObject({ title: 'Inbox', videoIds: ['v1'] })
    })

    it('a video can sit in several lists and shares its progress across them', () => {
        const a = store().createList('A')
        const b = store().createList('B')
        store().addVideoToList(video('v1'), a)
        store().addVideoToList(video('v1'), b)
        store().setWatched('v1', true)
        expect(playlist(a).videoIds).toEqual(['v1'])
        expect(playlist(b).videoIds).toEqual(['v1'])
        expect(store().progress.v1.watched).toBe(true)
    })

    it('deleting a list keeps the cached videos and their progress', () => {
        const id = store().createList('Temp')
        store().addVideoToList(video('v1'), id)
        store().setPosition('v1', 120)
        store().removePlaylist(id)
        expect(store().playlists).toEqual([])
        expect(store().videos.v1).toBeDefined()
        expect(store().progress.v1.lastPositionSec).toBe(120)
    })
})

describe('progress', () => {
    it('setWatched and setPosition each keep the other field', () => {
        store().setPosition('v1', 30)
        store().setWatched('v1', true)
        expect(store().progress.v1).toMatchObject({ watched: true, lastPositionSec: 30 })
        store().setPosition('v1', 0)
        expect(store().progress.v1).toMatchObject({ watched: true, lastPositionSec: 0 })
    })
})

describe('queue (getNextVideoId)', () => {
    it('returns the next video, or null at the end / for unknown lists or videos', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3']))
        expect(store().getNextVideoId('a', 'v1')).toBe('v2')
        expect(store().getNextVideoId('a', 'v3')).toBeNull()
        expect(store().getNextVideoId('a', 'ghost')).toBeNull()
        expect(store().getNextVideoId('missing', 'v1')).toBeNull()
    })

    it('reaches the end of an imported playlist that repeats a video', () => {
        store().addPlaylist(imported('a', ['A', 'B', 'A', 'C']))
        const seen: string[] = []
        let current: string | null = 'A'
        while (current && seen.length < 10) {
            seen.push(current)
            current = store().getNextVideoId('a', current)
        }
        expect(seen).toEqual(['A', 'B', 'C'])
    })
})

describe('reordering', () => {
    it('reorders playlists and videos', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3']))
        store().addPlaylist(imported('b', []))
        store().reorderPlaylists(['b', 'a'])
        store().reorderVideos('a', ['v3', 'v1', 'v2'])
        expect(store().playlists.map((p) => p.id)).toEqual(['b', 'a'])
        expect(playlist('a').videoIds).toEqual(['v3', 'v1', 'v2'])
    })

    it('never loses a list or a video when given a partial order', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3']))
        store().addPlaylist(imported('b', []))
        store().addPlaylist(imported('c', []))
        store().reorderPlaylists(['c', 'a'])
        store().reorderVideos('a', ['v3'])
        expect(store().playlists.map((p) => p.id)).toEqual(['c', 'a', 'b'])
        expect(playlist('a').videoIds).toEqual(['v3', 'v1', 'v2'])
    })

    it('ignores unknown or repeated ids instead of inserting them', () => {
        store().addPlaylist(imported('a', ['v1', 'v2']))
        store().reorderPlaylists(['ghost', 'a', 'a'])
        store().reorderVideos('a', ['v2', 'ghost', 'v2', 'v1'])
        expect(store().playlists.map((p) => p.id)).toEqual(['a'])
        expect(playlist('a').videoIds).toEqual(['v2', 'v1'])
    })
})

// Property-based: random sequences of every library operation (including re-importing the SAME
// YouTube playlist under a fresh local id, as AddBar does) must keep the model's invariants, and
// sync/reorder/re-import must preserve content — structural checks alone pass even if videos are
// silently discarded.
describe('library properties (property-based)', () => {
    const YT = 'PLyt'
    const ids = fc.constantFrom<string>('A', 'B', 'C', 'D', 'E', 'F')
    const idList = fc.array(ids, { maxLength: 8 })
    // Weighted towards remove/restore on the imported list, so runs routinely reach tombstoned and
    // pinned states (pins need import → remove → restore of the same video). Mutation-checked: dropping
    // the pin rule from mergePlaylistContents fails the sync property.
    const op = fc.oneof(
        { weight: 3, arbitrary: fc.record({ kind: fc.constant('import' as const), videoIds: idList }) },
        { weight: 3, arbitrary: fc.record({ kind: fc.constant('sync' as const), videoIds: idList }) },
        { weight: 4, arbitrary: fc.record({ kind: fc.constant('remove' as const), list: fc.constantFrom('yt', 'yt', 'yt', INBOX_LIST_ID), id: ids }) },
        { weight: 4, arbitrary: fc.record({ kind: fc.constant('restore' as const), id: ids }) },
        { weight: 2, arbitrary: fc.record({ kind: fc.constant('reorder' as const), list: fc.constantFrom('yt', INBOX_LIST_ID), order: idList }) },
        { weight: 2, arbitrary: fc.record({ kind: fc.constant('save' as const), id: ids }) },
        { weight: 1, arbitrary: fc.record({ kind: fc.constant('deleteInbox' as const) }) },
    )
    const ops = fc.array(op, { maxLength: 30 })
    type Op = typeof op extends fc.Arbitrary<infer T> ? T : never

    /** Fresh library with one imported playlist (local id 'yt'), then `ops` applied in order. */
    function reach(sequence: Op[], afterEach?: () => void) {
        localStorage.clear()
        store().reset()
        store().addPlaylist(imported('yt', [], { ytPlaylistId: YT }))
        sequence.forEach((o, n) => {
            switch (o.kind) {
                // AddBar mints a new local id on every import; the store must match on YouTube id.
                case 'import': store().addPlaylist(imported(`incoming-${n}`, o.videoIds, { ytPlaylistId: YT })); break
                case 'sync': store().mergePlaylistContents('yt', remote(o.videoIds)); break
                case 'remove': store().removeVideoFromPlaylist(o.list, o.id); break
                case 'restore': store().restoreVideoToPlaylist('yt', o.id); break
                case 'reorder': store().reorderVideos(o.list, o.order); break
                case 'save': store().addVideoToList(video(o.id), INBOX_LIST_ID); break
                case 'deleteInbox': store().removePlaylist(INBOX_LIST_ID); break
            }
            afterEach?.()
        })
    }

    const withoutSyncStamp = ({ lastSyncedAt: _t, ...rest }: Playlist) => rest

    it('lists stay duplicate-free, the import keeps its identity, and tombstones/pins stay consistent', () => {
        fc.assert(
            fc.property(ops, (sequence) => {
                reach(sequence, () => {
                    const lists = store().playlists
                    expect(lists.filter((p) => p.id === INBOX_LIST_ID).length).toBeLessThanOrEqual(1)
                    expect(new Set(lists.map((p) => p.id)).size).toBe(lists.length)
                    expect(lists.filter((p) => p.ytPlaylistId === YT).map((p) => p.id)).toEqual(['yt'])
                    for (const p of lists) {
                        const inList = new Set(p.videoIds)
                        expect(inList.size).toBe(p.videoIds.length)
                        expect(p.removedVideoIds.filter((id) => inList.has(id))).toEqual([])
                        expect(p.restoredVideoIds.every((id) => inList.has(id))).toBe(true)
                        expect(p.restoredVideoIds.filter((id) => p.removedVideoIds.includes(id))).toEqual([])
                        if (isUserList(p)) expect(p.removedVideoIds).toEqual([])
                    }
                })
            }),
        )
    })

    it('a reorder permutes a list: same members, requested ones first', () => {
        fc.assert(
            fc.property(ops, idList, (sequence, order) => {
                reach(sequence)
                const before = playlist('yt').videoIds
                store().reorderVideos('yt', order)
                const after = playlist('yt').videoIds
                expect([...after].sort()).toEqual([...before].sort())
                const requested = [...new Set(order.filter((id) => before.includes(id)))]
                expect(after.slice(0, requested.length)).toEqual(requested)
            }),
        )
    })

    it('a sync keeps what is upstream (in the user order), adds what is new, and drops only the rest', () => {
        fc.assert(
            fc.property(ops, idList, (sequence, upstream) => {
                reach(sequence)
                const before = playlist('yt')
                store().mergePlaylistContents('yt', remote(upstream))
                const after = playlist('yt')
                const up = new Set(upstream)
                const tombstoned = new Set(before.removedVideoIds)
                const pinned = new Set(before.restoredVideoIds)

                // Retained videos keep the user's relative order.
                const retained = before.videoIds.filter((id) => up.has(id) || pinned.has(id))
                expect(after.videoIds.slice(0, retained.length)).toEqual(retained)
                // Every upstream video the user didn't remove is present...
                for (const id of up) if (!tombstoned.has(id)) expect(after.videoIds).toContain(id)
                // ...and nothing survives unless it's upstream or pinned. Tombstones are untouched.
                for (const id of after.videoIds) expect(up.has(id) || pinned.has(id)).toBe(true)
                expect(after.removedVideoIds).toEqual(before.removedVideoIds)
                // A pin only protects a restore while it's gone upstream; once seen again it's dropped.
                expect(after.restoredVideoIds.filter((id) => up.has(id))).toEqual([])
            }),
        )
    })

    it('syncing the same upstream twice changes nothing the second time', () => {
        fc.assert(
            fc.property(ops, idList, (sequence, upstream) => {
                reach(sequence)
                store().mergePlaylistContents('yt', remote(upstream))
                const once = withoutSyncStamp(playlist('yt'))
                store().mergePlaylistContents('yt', remote(upstream))
                expect(withoutSyncStamp(playlist('yt'))).toEqual(once)
            }),
        )
    })

    it('re-importing is a fresh start: upstream order, no removals or pins, same identity', () => {
        fc.assert(
            fc.property(ops, idList, (sequence, upstream) => {
                reach(sequence)
                const { addedAt } = playlist('yt')
                store().addPlaylist(imported('reimport', upstream, { ytPlaylistId: YT }))
                expect(playlist('yt')).toMatchObject({
                    videoIds: [...new Set(upstream)],
                    removedVideoIds: [],
                    restoredVideoIds: [],
                    addedAt,
                })
                expect(store().playlists.filter((p) => p.ytPlaylistId === YT)).toHaveLength(1)
            }),
        )
    })
})
