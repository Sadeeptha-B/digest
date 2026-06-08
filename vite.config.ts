import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    // Base path. Cloudflare Pages serves the app at the root of its own origin
    // (https://<project>.pages.dev/), so the default '/' is correct. BASE_PATH stays overridable
    // for any sub-path host. (The old GitHub Pages build set BASE_PATH=/digest/.)
    base: process.env.BASE_PATH ?? '/',
    plugins: [
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
        port: 5174
    }
})
