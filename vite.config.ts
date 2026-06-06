import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
    // Base path. Local dev/preview defaults to '/'. The GitHub Pages build sets
    // BASE_PATH=/digest/ (see .github/workflows/deploy.yml) so assets and the PWA
    // manifest resolve under the project site https://<user>.github.io/digest/.
    base: process.env.BASE_PATH ?? '/',
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
