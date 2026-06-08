import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { META_CSP, buildHeadersFile } from './csp'

// Inject the app-shell CSP <meta> from the single source in csp.ts. Build-only (`apply: 'build'`):
// CSP is a production hardening measure and is deliberately NOT enforced in the Vite dev server,
// which would otherwise break on its own inline HMR/React-refresh scripts. See the note in csp.ts.
function injectCspMeta(): Plugin {
    return {
        name: 'inject-csp-meta',
        apply: 'build',
        transformIndexHtml: () => [
            {
                tag: 'meta',
                attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
                injectTo: 'head-prepend',
            },
        ],
    }
}

// Emit dist/_headers (the real CSP response header, with frame-ancestors + the other security
// headers) from that same source at build time. Replaces the previously hand-maintained
// public/_headers, keeping it from drifting out of sync with the <meta> tag.
function emitHeaders(): Plugin {
    return {
        name: 'emit-headers',
        apply: 'build',
        generateBundle() {
            this.emitFile({ type: 'asset', fileName: '_headers', source: buildHeadersFile() })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    // Base path. Cloudflare Pages serves the app at the root of its own origin
    // (https://<project>.pages.dev/), so the default '/' is correct. BASE_PATH stays overridable
    // for any sub-path host. (The old GitHub Pages build set BASE_PATH=/digest/.)
    base: process.env.BASE_PATH ?? '/',
    plugins: [
        injectCspMeta(),
        emitHeaders(),
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            workbox: {
                // The SW's navigation fallback serves the cached app shell (index.html) for SPA
                // deep links. Exclude the OAuth Functions so popup navigations to /auth/login and
                // /auth/callback reach the server instead of being shadowed by the app shell.
                navigateFallbackDenylist: [/^\/auth\//],
            },
            manifest: {
                name: 'Digest — distraction-free playlists',
                short_name: 'Digest',
                description: 'A distraction-free viewer for your YouTube playlists.',
                theme_color: '#0a0a0b',
                background_color: '#0a0a0b',
                display: 'standalone',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'pwa-maskable-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
        }),
    ],
    server: {
        // strictPort so the port can't silently drift to 5175 when 5174 is taken — `wrangler
        // pages dev --proxy 5174` proxies to this exact port, so a mismatch would break dev:pages.
        port: 5174,
        strictPort: true,
    },
})
