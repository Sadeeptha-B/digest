// The built app + Functions together in workerd (`wrangler pages dev dist`), with no secrets:
// routing, the SPA fallback, the generated _headers, and the Functions' guard rails.
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Deep links rely on Cloudflare Pages' built-in SPA mode (architecture §5.2), which a top-level
// 404.html would silently switch off — so check both the behaviour and that precondition.
test('deep links fall back to the SPA shell', async ({ request }) => {
    const res = await request.get('/watch/dQw4w9WgXcQ?list=x')
    expect(res.status()).toBe(200)
    expect(await res.text()).toContain('<div id="root">')
    expect(existsSync('dist/404.html'), 'a top-level 404.html disables Pages SPA mode').toBe(false)
})

test('the app shell is served with the production CSP header, including frame-ancestors', async ({ request }) => {
    const res = await request.get('/')
    const csp = res.headers()['content-security-policy'] ?? ''
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(res.headers()['x-frame-options']).toBe('DENY')
})

test('the key status endpoint answers with a boolean only', async ({ request }) => {
    const res = await request.get('/api/key')
    expect(await res.json()).toEqual({ configured: false })
})

test('the YouTube proxy refuses resources outside its allowlist', async ({ request }) => {
    expect((await request.get('/api/youtube/search?q=x')).status()).toBe(404)
    expect((await request.get('/api/youtube/videos?id=x')).status()).toBe(401) // allowed, but no credential
})

test('the key endpoint rejects cross-site writes', async ({ request }) => {
    const res = await request.post('/api/key', {
        headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
        data: { key: 'k' },
    })
    expect(res.status()).toBe(403)
})

test('auth reports a missing server configuration rather than failing obscurely', async ({ request }) => {
    const res = await request.post('/auth/refresh')
    expect(res.status()).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_misconfigured' })
})
