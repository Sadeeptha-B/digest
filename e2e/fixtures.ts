import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'
import { onRequestGet as authCallback } from '../functions/auth/callback'
import { onRequestGet as authLogin } from '../functions/auth/login'
import { onRequestPost as authLogout } from '../functions/auth/logout'
import { onRequestPost as authRefresh } from '../functions/auth/refresh'
import { E2E_OAUTH_ENV, FakeGoogle } from './fakeGoogle'
import { withFetch } from './withFetch'

const FAKE_PLAYER = readFileSync(fileURLToPath(new URL('./fakeYouTubePlayer.js', import.meta.url)), 'utf8')
// 1×1 transparent PNG for thumbnails.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

export interface FakePlaylist {
    title: string
    videoIds: string[]
}

interface FakeRequest {
    url: URL
    method: string
    headers: Record<string, string>
}

type Reply = { status?: number; json?: unknown } | Response

type Handler = (req: FakeRequest) => Reply | Promise<Reply>

type PagesHandler = (context: never) => Response | Promise<Response>

/** Run a real Pages Function for a routed request, as Cloudflare would (see tests/functions/ctx.ts). */
function runFunction(handler: PagesHandler, { url, method, headers }: FakeRequest, env: Record<string, string>) {
    const request = new Request(url, { method, headers })
    const context = { request, env, params: {}, data: {}, waitUntil: () => {}, passThroughOnException: () => {} }
    return Promise.resolve(handler(context as never))
}

/** A page that navigates to `location` — a redirect the Playwright router can intercept. */
function scriptRedirect(location: string): string {
    return `<!doctype html><script>location.replace(${JSON.stringify(location).replace(/</g, '\\u003c')})</script>`
}

/**
 * In-memory stand-in for Google behind the app's own /api and /auth Functions. Deny-by-default:
 * only the endpoints in the table below (or added with `on`) answer; any other /api or /auth call,
 * and any request leaving the app's origin (bar thumbnails), is recorded as unexpected and fails
 * the test at teardown — even when the app swallows the error, as background requests do.
 */
export class FakeBackend {
    apiKeyConfigured = false
    playlists: Record<string, FakePlaylist> = {}
    channelTitle = 'Test Channel'
    readonly unexpected: string[] = []
    private readonly handlers = new Map<string, Handler>()
    private google: FakeGoogle | null = null

    constructor(private readonly appOrigin: string) {
        this.on('GET', '/api/key', () => ({ json: { configured: this.apiKeyConfigured } }))
        this.on('POST', '/api/key', () => ((this.apiKeyConfigured = true), { json: { configured: true } }))
        this.on('DELETE', '/api/key', () => ((this.apiKeyConfigured = false), { json: { configured: false } }))
        this.on('GET', '/api/recall/status', () => ({ json: { configured: false } }))
        this.on('GET', '/api/youtube/playlists', ({ url }) => {
            const id = url.searchParams.get('id') ?? ''
            const p = this.playlists[id]
            return { json: { items: p ? [{ id, snippet: { title: p.title, channelTitle: 'Owner' } }] : [] } }
        })
        this.on('GET', '/api/youtube/playlistItems', ({ url }) => {
            const p = this.playlists[url.searchParams.get('playlistId') ?? '']
            return {
                json: {
                    items: (p?.videoIds ?? []).map((id) => ({
                        snippet: { ...this.video(id).snippet, videoOwnerChannelTitle: 'Creator', resourceId: { videoId: id } },
                    })),
                },
            }
        })
        this.on('GET', '/api/youtube/videos', ({ url }) => ({ json: { items: [this.video(url.searchParams.get('id') ?? '')] } }))
        this.on('GET', '/api/youtube/channels', () => ({ json: { items: [{ snippet: { title: this.channelTitle } }] } }))
        this.on('POST', '/auth/refresh', () => ({ status: 401, json: { error: 'no_session' } }))
        this.on('POST', '/auth/logout', () => ({ status: 204 }))
    }

    /** Add or replace the handler for one method + path. */
    on(method: string, path: string, handler: Handler) {
        this.handlers.set(`${method} ${path}`, handler)
    }

    /**
     * The session through the REAL /auth Functions (login, callback, refresh, logout), run here in Node
     * against the browser's own requests and cookies; only Google is faked (its consent screen answers
     * with `consent`; its token and revoke endpoints check what Google would). Returns the fake Google.
     */
    useRealSignIn(consent: 'approve' | 'deny'): FakeGoogle {
        const google = new FakeGoogle(consent, this.appOrigin)
        this.google = google
        const real = (handler: PagesHandler) => (req: FakeRequest) =>
            withFetch(google.fetch, () => runFunction(handler, req, E2E_OAUTH_ENV))
        this.on('GET', '/auth/login', real(authLogin))
        this.on('GET', '/auth/callback', real(authCallback))
        this.on('POST', '/auth/refresh', real(authRefresh))
        this.on('POST', '/auth/logout', real(authLogout))
        return google
    }

    /** Everything that went wrong out of sight: unexpected requests and fake-Google mismatches. */
    problems(): string[] {
        return [...this.unexpected, ...(this.google?.problems ?? [])]
    }

    video(id: string) {
        return {
            id,
            snippet: {
                title: `Video ${id}`,
                channelTitle: 'Creator',
                thumbnails: { medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` } },
            },
        }
    }

    async install(context: BrowserContext) {
        // Context-level, so the sign-in popup is covered too.
        await context.route('**/*', async (route) => {
            const request = route.request()
            const url = new URL(request.url())
            const method = request.method()

            if (url.hostname.endsWith('.ytimg.com')) {
                return route.fulfill({ contentType: 'image/png', body: PIXEL })
            }
            if (this.google?.isConsentScreen(url)) {
                return route.fulfill({ contentType: 'text/html', body: scriptRedirect(this.google.consentRedirect(url)) })
            }
            if (url.origin !== this.appOrigin) {
                this.unexpected.push(`${method} ${url.href}`)
                return route.abort()
            }
            if (!/^\/(api|auth)\//.test(url.pathname)) return route.continue() // the built app itself

            const handler = this.handlers.get(`${method} ${url.pathname}`)
            if (!handler) {
                this.unexpected.push(`${method} ${url.pathname}`)
                return route.fulfill({ status: 404, json: { error: 'not_found' } })
            }
            let reply: Reply
            try {
                reply = await handler({ url, method, headers: await request.allHeaders() })
            } catch (err) {
                // A broken fake must fail loudly, not leave the request (and the test) hanging.
                this.unexpected.push(`handler for ${method} ${url.pathname} threw: ${String(err)}`)
                return route.fulfill({ status: 500, json: { error: 'fake_backend_error' } })
            }
            if (reply instanceof Response) {
                const headers = Object.fromEntries(reply.headers)
                // Several Set-Cookie headers can't share an object key; Playwright splits them on newlines.
                const cookies = reply.headers.getSetCookie()
                if (cookies.length) headers['set-cookie'] = cookies.join('\n')

                const location = reply.headers.get('Location')
                if (reply.status >= 300 && reply.status < 400 && location) {
                    // Playwright doesn't route the target of a fulfilled redirect — it would go straight
                    // to the network. Hop by script instead: a fresh navigation the router does see
                    // (cookies set on this response still apply).
                    delete headers.location
                    headers['content-type'] = 'text/html'
                    return route.fulfill({ status: 200, headers, body: scriptRedirect(location) })
                }
                return route.fulfill({ status: reply.status, headers, body: await reply.text() })
            }
            return route.fulfill({ status: reply.status ?? 200, json: reply.json })
        })
        // Install the fake YT global before the app loads, so youtube-player never fetches the real
        // IFrame API (it skips loading when window.YT.Player exists).
        await context.addInitScript(FAKE_PLAYER)
    }
}

type Fixtures = { backend: FakeBackend; cspViolations: string[] }

export const test = base.extend<Fixtures>({
    // Every e2e test runs under the production CSP; any violation fails it.
    cspViolations: [
        // Installed on the browser context, not the page, so every document is watched — including
        // pages opened later, like the sign-in popup with its own stricter CSP.
        async ({ context }, use) => {
            const violations: string[] = []
            await context.exposeBinding('__reportCsp', ({ page }, v: string) => violations.push(`${page.url()}: ${v}`))
            await context.addInitScript(() => {
                document.addEventListener('securitypolicyviolation', (e) => {
                    ;(window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(
                        `${e.violatedDirective} blocked ${e.blockedURI}`,
                    )
                })
            })
            context.on('console', (msg) => {
                if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) violations.push(msg.text())
            })
            await use(violations)
            expect(violations, 'CSP violations').toEqual([])
        },
        { auto: true },
    ],
    // Every e2e test runs against the fake backend, and fails on any request it doesn't expect.
    backend: [
        async ({ context, baseURL }, use) => {
            const backend = new FakeBackend(new URL(baseURL!).origin)
            await backend.install(context)
            await use(backend)
            expect(backend.problems(), 'requests the fake backend does not serve, or fake-Google mismatches').toEqual([])
        },
        { auto: true },
    ],
})

export { expect }

/** The test handle the fake player installs (e2e/fakeYouTubePlayer.js). */
interface FakeYouTube {
    videoId(): string | null
    current(): { time: number } | undefined
    play(atSec?: number): void
    end(): void
}

declare global {
    interface Window {
        __yt?: FakeYouTube
        __ytDuration?: number
    }
}

export const player = {
    videoId: (page: Page) => page.evaluate(() => window.__yt?.videoId() ?? null),
    time: (page: Page) => page.evaluate(() => window.__yt?.current()?.time ?? null),
    play: (page: Page, atSec?: number) => page.evaluate((t) => window.__yt!.play(t), atSec),
    end: (page: Page) => page.evaluate(() => window.__yt!.end()),
    /** Duration (seconds) for players created from now on; call before navigating. */
    setDuration: (page: Page, sec: number) => page.addInitScript((d) => (window.__ytDuration = d), sec),
}

/** The persisted library, read straight from localStorage (what survives a reload). */
export function persisted(page: Page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem('digest-store') ?? '{}').state ?? {})
}

/** The open list's contents panel: the desktop side panel or the mobile drawer, whichever shows. */
export const listPanel = (page: Page) => page.getByRole('complementary', { name: 'List contents' })

/** Get past onboarding with an API key (the no-sign-in path). */
export async function onboardWithKey(page: Page) {
    await page.goto('/')
    await page.getByRole('button', { name: 'Or use a public API key instead' }).click()
    await page.getByPlaceholder('AIza…').fill('AIza-test-key')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByPlaceholder(/Paste a YouTube playlist or video URL/)).toBeVisible()
}

export async function importPlaylist(page: Page, ytId: string) {
    await page.getByPlaceholder(/Paste a YouTube playlist or video URL/).fill(`https://www.youtube.com/playlist?list=${ytId}`)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
}
