// User journeys in the production build, under the real CSP (ADR 0003).
import type { Page } from '@playwright/test'
import { FAKE_TOKENS, REFRESHED_ACCESS_TOKEN } from './fakeGoogle'
import { expect, importPlaylist, listPanel, onboardWithKey, persisted, player, test } from './fixtures'

const LIST = 'PLe2eCourse0001'

test.beforeEach(({ backend }) => {
    backend.playlists[LIST] = { title: 'E2E Course', videoIds: ['vid00000001', 'vid00000002', 'vid00000003'] }
})

test('first run: onboarding with an API key lands in the library, under the production CSP', async ({ page }) => {
    await onboardWithKey(page)
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
    await expect(page.getByText(/No playlists yet/)).toBeVisible()
})

// Browser integration with the real /auth Functions: the popup page, PKCE, cookies and postMessage are
// the browser's own, and the handlers' code is production code. Two things are adapted: the handlers run
// in the test's Node process (not workerd, which the smoke project covers without secrets), and their
// redirects become script navigations so Playwright can route them. Only Google is faked
// (e2e/fakeGoogle.ts).
test.describe('Google sign-in (real auth Functions; only Google is faked)', () => {
    async function signInWithGoogle(page: Page) {
        await page.goto('/')
        const popupOpened = page.waitForEvent('popup')
        await page.getByRole('button', { name: 'Sign in with Google' }).click()
        // The callback page posts the token and closes itself (possibly before we could listen for it).
        const popup = await popupOpened
        await expect.poll(() => popup.isClosed()).toBe(true)
        // Signed in: the name comes from the account's channel.
        await expect(page.getByText('Test Channel')).toBeVisible()
    }

    test('a successful sign-in lands in the library as that account', async ({ page, context, backend }) => {
        backend.useRealSignIn('approve')
        await signInWithGoogle(page)

        // Channel import is offered.
        await expect(page.getByRole('button', { name: 'Import from my channel' })).toBeVisible()
        expect((await persisted(page)).hasSignedIn).toBe(true)
        expect(JSON.stringify(await persisted(page))).not.toContain(FAKE_TOKENS.access_token) // in memory only

        // The refresh token went into the HttpOnly cookie scoped to /auth; the PKCE cookies are gone.
        const cookies = await context.cookies()
        expect(cookies.find((c) => c.name === 'digest_rt')).toMatchObject({
            value: encodeURIComponent(FAKE_TOKENS.refresh_token),
            path: '/auth',
            httpOnly: true,
        })
        expect(cookies.map((c) => c.name)).not.toContain('digest_oauth_verifier')
    })

    test('a reload restores the session from the refresh cookie; signing out ends it for good', async ({ page, context, backend }) => {
        const google = backend.useRealSignIn('approve')
        // The account's own playlists answer only to a token, as Google's do.
        backend.on('GET', '/api/youtube/playlists', ({ headers }) =>
            headers.authorization === `Bearer ${REFRESHED_ACCESS_TOKEN}`
                ? { json: { items: [{ id: 'PLmine', snippet: { title: 'My private list', channelTitle: 'Me' }, contentDetails: { itemCount: 2 } }] } }
                : { status: 401, json: { error: { message: 'Login required.' } } },
        )
        await signInWithGoogle(page)

        // The reload forgets the in-memory token. The browser's cookie restores one through /auth/refresh,
        // and it reaches the account's private content.
        await page.reload()
        await page.getByRole('button', { name: 'Import from my channel' }).click()
        await expect(page.getByText('My private list')).toBeVisible()

        await page.getByRole('button', { name: 'Settings' }).click()
        await page.getByRole('button', { name: 'Sign out' }).click()
        await expect(page.getByText('Sign in to get started')).toBeVisible()
        await expect.poll(async () => (await context.cookies()).map((c) => c.name)).not.toContain('digest_rt')
        expect(google.revoked).toBe(true)

        // Still signed out after a reload, and the server agrees: there is no session to refresh.
        await page.reload()
        await expect(page.getByText('Sign in to get started')).toBeVisible()
        const refresh = await page.evaluate(() => fetch('/auth/refresh', { method: 'POST' }).then(async (r) => [r.status, await r.json()]))
        expect(refresh).toEqual([401, { error: 'no_session' }])
    })

    test('a refused sign-in (not a Test user, or Cancel) explains itself and stays on onboarding', async ({ page, backend }) => {
        backend.useRealSignIn('deny')
        await page.goto('/')
        await page.getByRole('button', { name: 'Sign in with Google' }).click()
        // The production explanation from /auth/callback, not a message made up by the test.
        await expect(page.getByText(/isn't approved for Digest yet\. You can use a public API key instead\./)).toBeVisible()
        await expect(page.getByText('Sign in to get started')).toBeVisible()
    })
})

test('import, watch, auto-advance on end, and resume after a reload', async ({ page }) => {
    await onboardWithKey(page)
    await importPlaylist(page, LIST)
    await expect(page.getByText('E2E Course')).toBeVisible()

    await page.getByRole('link', { name: 'Play' }).click()
    await expect(page).toHaveURL(/\/watch\/vid00000001\?list=/)
    await expect.poll(() => player.videoId(page)).toBe('vid00000001')

    // The video ends: Digest marks it watched and advances before YouTube's end screen can show.
    await player.end(page)
    await expect(page).toHaveURL(/\/watch\/vid00000002\?list=/)

    // Play into video 2 until the periodic save has persisted the position, then reload.
    await expect.poll(() => player.videoId(page)).toBe('vid00000002')
    await player.play(page, 95)
    await expect
        .poll(async () => (await persisted(page)).progress?.vid00000002?.lastPositionSec, { timeout: 10_000 })
        .toBe(95)
    await page.reload()
    await expect.poll(() => player.time(page)).toBe(95)

    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByText('1/3 watched')).toBeVisible()
})

test('remove a video, restore it, and sync without resurrecting removals', async ({ page, backend }) => {
    await onboardWithKey(page)
    await importPlaylist(page, LIST)
    await page.getByRole('button', { name: /E2E Course/ }).click()
    const panel = listPanel(page)

    await panel.getByRole('button', { name: 'Remove video' }).nth(1).click() // vid00000002
    await expect(panel.getByText('Video vid00000002')).toHaveCount(0)

    // Upstream adds a video and still lists the removed one: sync appends the new, keeps the removal.
    backend.playlists[LIST].videoIds.push('vid00000004')
    await panel.getByRole('button', { name: 'Refresh from YouTube' }).click()
    await expect(panel.getByText('3. Video vid00000004')).toBeVisible()
    await expect(panel.getByText('Video vid00000002')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Show removed (1)' }).click()
    await panel.getByRole('button', { name: 'Restore video' }).click()
    await expect(panel.getByText('4. Video vid00000002')).toBeVisible()
})

test('a video saved to two lists shares its watched state', async ({ page }) => {
    await onboardWithKey(page)
    const input = page.getByPlaceholder(/Paste a YouTube playlist or video URL/)

    await input.fill('https://youtu.be/vidShared01')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Saved to “Inbox”.')).toBeVisible()

    await input.fill('https://youtu.be/vidShared01')
    await page.getByLabel('Save to').selectOption('__new__')
    await page.getByLabel('New list name').fill('Weekend')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Saved to “Weekend”.')).toBeVisible()

    await page.getByRole('button', { name: /^Inbox/ }).click()
    await listPanel(page).getByRole('button', { name: 'Mark as watched' }).click()
    await page.getByRole('button', { name: /^Weekend/ }).click()
    await expect(listPanel(page).getByRole('button', { name: 'Mark as not watched' })).toBeVisible()
    // Both library rows count the one shared video as watched.
    await expect(page.getByRole('button', { name: /^Inbox.*1\/1 watched/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Weekend.*1\/1 watched/ })).toBeVisible()
})

test('drag to reorder videos; the order survives a reload', async ({ page }) => {
    await onboardWithKey(page)
    await importPlaylist(page, LIST)
    await page.getByRole('button', { name: /E2E Course/ }).click()
    const panel = listPanel(page)
    const handles = panel.getByRole('button', { name: 'Drag to reorder' })

    const from = await handles.nth(2).boundingBox()
    const to = await handles.nth(0).boundingBox()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    await page.mouse.move(from!.x + from!.width / 2, from!.y - 10, { steps: 5 }) // past the 6px activation
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 2, { steps: 10 })
    await page.mouse.up()

    await expect(panel.getByText('1. Video vid00000003')).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: /E2E Course/ }).click()
    await expect(listPanel(page).getByText('1. Video vid00000003')).toBeVisible()
})

test('focus mode: a long video gets the Pomodoro timeline; one switch gives a bare player', async ({ page }) => {
    await player.setDuration(page, 45 * 60)
    await onboardWithKey(page)
    await importPlaylist(page, LIST)
    await page.getByRole('link', { name: 'Play' }).click()

    await expect(page.getByText('Brain dump')).toBeVisible()
    await expect(page.getByText(/Get ready|Focus block/).first()).toBeVisible()

    await page.getByRole('button', { name: /Focus on/ }).click()
    await expect(page.getByText('Brain dump')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Focus off/ })).toBeVisible()
})

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('a list opens in a drawer that edits it and closes back to the library', async ({ page }) => {
        await onboardWithKey(page)
        await importPlaylist(page, LIST)
        await page.getByRole('button', { name: /E2E Course/ }).click()

        const drawer = listPanel(page)
        await expect(drawer).toBeVisible()
        await expect(drawer).toHaveCount(1) // the desktop side panel stays hidden
        await drawer.getByRole('button', { name: 'Mark as watched' }).first().click()
        await drawer.getByRole('button', { name: 'Close' }).click()

        await expect(listPanel(page)).toHaveCount(0)
        await expect(page.getByRole('button', { name: /E2E Course.*1\/3 watched/ })).toBeVisible()
    })
})
