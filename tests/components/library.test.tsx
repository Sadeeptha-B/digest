// The library page and a list's contents panel: user-made lists, rename, sync, remove/restore.
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { PlaylistContents } from '../../src/components/PlaylistContents'
import { Library } from '../../src/pages/Library'
import { imported, playlist, store, video } from '../support/factories'
import { server } from '../support/msw'
import { renderAt } from '../support/render'
import { fakeYouTube } from '../support/youtubeApi'

const DAY = 24 * 60 * 60 * 1000

describe('Library', () => {
    it('creates a user-made list and opens it', async () => {
        const { user } = renderAt(<Library />)
        await user.click(screen.getByRole('button', { name: 'New list' }))
        await user.type(screen.getByLabelText('New list name'), 'Deep work{Enter}')
        expect(store().playlists).toMatchObject([{ title: 'Deep work', ytPlaylistId: null }])
        // Opened: the panel offers rename (user lists only) and the empty-list hint.
        expect(screen.getAllByRole('button', { name: 'Rename list' }).length).toBeGreaterThan(0)
    })

    it('removes a list after confirming, keeping its videos and progress', async () => {
        store().addPlaylist(imported('a', ['v1'], { title: 'Course' }))
        store().upsertVideos([video('v1')])
        store().setWatched('v1', true)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { user } = renderAt(<Library />)
        await user.click(screen.getByRole('button', { name: 'Remove playlist' }))
        expect(window.confirm).toHaveBeenCalledWith('Remove "Course"?')
        expect(store().playlists).toEqual([])
        expect(store().progress.v1.watched).toBe(true)
    })

    it('keeps the list when the removal is cancelled', async () => {
        store().addPlaylist(imported('a', []))
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        const { user } = renderAt(<Library />)
        await user.click(screen.getByRole('button', { name: 'Remove playlist' }))
        expect(store().playlists).toHaveLength(1)
    })

    it('opening a stale playlist auto-syncs it exactly once, though both layouts mount the panel', async () => {
        store().addPlaylist(imported('a', ['v1'], { title: 'Stale', lastSyncedAt: Date.now() - 2 * DAY }))
        const calls = fakeYouTube({ PLa: { videoIds: ['v1', 'v2'] } })
        const { user } = renderAt(<Library />)
        await user.click(screen.getByText('Stale'))
        await vi.waitFor(() => expect(playlist('a').videoIds).toEqual(['v1', 'v2']))
        expect(calls).toMatchObject({ playlists: 1, playlistItems: 1 })
    })

    it('shows each list with its watched count and a Play link to the first unwatched video', () => {
        store().addPlaylist(imported('a', ['v1', 'v2', 'v3'], { title: 'Course', channelTitle: 'Prof' }))
        store().setWatched('v1', true)
        renderAt(<Library />)
        expect(screen.getByText('Prof · 1/3 watched')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/watch/v2?list=a')
    })
})

describe('PlaylistContents', () => {
    const open = (id: string) => renderAt(<PlaylistContents playlistId={id} />)

    it('does not sync a playlist synced within the last day, nor a user-made list', async () => {
        store().addPlaylist(imported('a', ['v1'], { lastSyncedAt: Date.now() - DAY / 2 }))
        const id = store().createList('Mine')
        // A sync starts synchronously in the mount effect and holds the Refresh button disabled while it
        // runs; MSW also fails the test at teardown on any request a sync would make.
        open('a')
        expect(screen.getByRole('button', { name: 'Refresh from YouTube' })).toBeEnabled()
        open(id)
        expect(screen.getAllByRole('button', { name: 'Refresh from YouTube' })).toHaveLength(1) // a user list has none
    })

    it('renames a user-made list: Enter saves, Escape cancels, blank is ignored', async () => {
        const id = store().createList('Original')
        const { user } = open(id)
        const rename = async (text: string) => {
            await user.click(screen.getByRole('button', { name: 'Rename list' }))
            const input = screen.getByLabelText('List name')
            await user.clear(input)
            await user.type(input, text)
        }

        await rename('Renamed{Enter}')
        expect(playlist(id).title).toBe('Renamed')
        await rename('Discarded{Escape}')
        expect(playlist(id).title).toBe('Renamed')
        await rename('   {Enter}')
        expect(playlist(id).title).toBe('Renamed')
    })

    it('offers no rename for an imported playlist (its title comes from YouTube)', () => {
        store().addPlaylist(imported('a', ['v1']))
        open('a')
        expect(screen.queryByRole('button', { name: 'Rename list' })).not.toBeInTheDocument()
    })

    it('lists removed videos and restores one instantly, then freshens it in the background', async () => {
        store().addPlaylist(imported('a', ['v1', 'v2']))
        store().upsertVideos([video('v1'), video('v2', { title: 'Removed talk' })])
        store().removeVideoFromPlaylist('a', 'v2')
        const calls = fakeYouTube()
        const { user } = open('a')
        await user.click(screen.getByRole('button', { name: 'Show removed (1)' }))
        expect(screen.getByText('Removed talk')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Restore video' }))
        expect(playlist('a')).toMatchObject({ videoIds: ['v1', 'v2'], removedVideoIds: [], restoredVideoIds: ['v2'] })
        await vi.waitFor(() => expect(calls.videos).toBe(1))
    })

    it("shows the reason a manual refresh failed", async () => {
        store().addPlaylist(imported('a', []))
        server.use(http.get('/api/youtube/*', () => HttpResponse.json({ error: { message: 'Playlist is private' } }, { status: 403 })))
        const { user } = open('a')
        await user.click(screen.getByRole('button', { name: 'Refresh from YouTube' }))
        expect(await screen.findByText('Playlist is private')).toBeInTheDocument()
    })

    it('points an empty user list at the Add bar, but not an imported playlist (it cannot take saves)', () => {
        const id = store().createList('Mine')
        store().addPlaylist(imported('a', []))
        const { unmount } = open(id)
        expect(screen.getByText(/Paste a video URL above and choose this list/)).toBeInTheDocument()
        unmount()
        open('a')
        expect(screen.queryByText(/choose this list/)).not.toBeInTheDocument()
        expect(screen.getByText('No videos in this playlist.')).toBeInTheDocument()
    })

    it('marks a video watched and removes it from the list', async () => {
        const id = store().createList('Mine')
        store().addVideoToList(video('v1', { title: 'Lecture' }), id)
        const { user } = open(id)
        await user.click(screen.getByRole('button', { name: 'Mark as watched' }))
        expect(store().progress.v1.watched).toBe(true)
        await user.click(screen.getByRole('button', { name: 'Remove video' }))
        expect(playlist(id).videoIds).toEqual([])
    })
})
