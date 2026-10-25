import { defineConfig, devices } from '@playwright/test'

// Two projects (see docs/decisions/0012-testing-strategy.md):
//   e2e   — user journeys against the PRODUCTION build (`vite preview`), where the CSP <meta> is
//           enforced (ADR 0003). /api is faked by a deny-by-default route table, sign-in runs the
//           real /auth Functions against a fake Google, and the YouTube IFrame API is replaced by a
//           scriptable fake (e2e/fixtures.ts), so no Google account or network is needed.
//   smoke — the built dist/ served by `wrangler pages dev` (real workerd): routing, the SPA fallback,
//           _headers and the Functions wired together. No secrets, no upstream calls.
const CI = Boolean(process.env.CI)

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'e2e',
            testIgnore: /smoke\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
                baseURL: 'http://localhost:4373',
                // The PWA service worker would answer fetches itself, hiding them from page.route.
                serviceWorkers: 'block',
            },
        },
        {
            name: 'smoke',
            testMatch: /smoke\.spec\.ts/,
            use: { baseURL: 'http://localhost:8799' },
        },
    ],
    // Started in order: the build must exist before wrangler serves it. Servers are never reused, so a
    // run always tests a fresh build (a leftover preview would serve a stale one); the ports are
    // dedicated so a manual `npm run preview` (4173) or `npm run dev:pages` (8788) can't be mistaken for it.
    webServer: [
        {
            command: 'npm run build && npx vite preview --port 4373 --strictPort',
            url: 'http://localhost:4373',
            reuseExistingServer: false,
            timeout: 180_000,
        },
        {
            // Empty bindings override a developer's .dev.vars (real OAuth secrets), so the smoke run
            // always sees the Functions as "not configured" and never talks to Google.
            command:
                'npx wrangler pages dev dist --port 8799 --binding GOOGLE_CLIENT_ID= --binding GOOGLE_CLIENT_SECRET=',
            url: 'http://localhost:8799',
            reuseExistingServer: false,
            timeout: 120_000,
            env: { WRANGLER_SEND_METRICS: 'false' },
        },
    ],
})
