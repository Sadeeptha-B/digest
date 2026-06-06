import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    // Relative base so the build works under any GitHub Pages project path
    // (e.g. https://<user>.github.io/<repo>/). Combined with HashRouter, deep
    // links and refreshes work without server-side rewrites.
    base: './',
    plugins: [react()],
    server: {
        port: 5174
    }
})
