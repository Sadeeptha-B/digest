// The service worker (vite-plugin-pwa), which the other journeys block so page.route sees every
// request. Here it runs for real: the precached app shell must work offline, and its navigation
// fallback must never shadow the OAuth Functions (navigateFallbackDenylist in vite.config.ts).
import { expect, onboardWithKey, test } from './fixtures'

test.use({ serviceWorkers: 'allow' })

async function waitForServiceWorkerControl(page: import('@playwright/test').Page) {
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('the app shell, and deep links into it, load offline', async ({ page, context }) => {
    await onboardWithKey(page)
    await waitForServiceWorkerControl(page)

    await context.setOffline(true)
    await page.goto('/')
    await expect(page.getByPlaceholder(/Paste a YouTube playlist or video URL/)).toBeVisible()
    await page.goto('/watch/notcached01')
    await expect(page.getByText(/Video not loaded/)).toBeVisible()
    await context.setOffline(false)
})

test('/auth/* navigations reach the server instead of the cached app shell', async ({ page, backend }) => {
    backend.on('GET', '/auth/login', () => ({ json: { servedBy: 'functions' } }))
    await onboardWithKey(page)
    await waitForServiceWorkerControl(page)

    await page.goto('/auth/login')
    await expect(page.locator('body')).toContainText('"servedBy":"functions"')
})
