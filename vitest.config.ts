import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test layers (see docs/decisions/0012-testing-strategy.md):
//   web       — domain, unit and component tests for the SPA (jsdom)
//   functions — the Pages Functions as plain handlers (node; they only use Web APIs)
// Tests live under tests/, never under functions/ — Pages would turn them into routes.
export default defineConfig({
    plugins: [react()],
    test: {
        // Node 25+ ships its own global localStorage, which shadows jsdom's (and is undefined without
        // --localstorage-file). Turn it off so the SPA tests see the browser storage zustand persists to.
        // (Only on Nodes that know the flag; older ones have no global localStorage to turn off.)
        poolOptions: {
            forks: {
                execArgv: process.allowedNodeEnvironmentFlags.has('--experimental-webstorage')
                    ? ['--no-experimental-webstorage']
                    : [],
            },
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'web',
                    environment: 'jsdom',
                    include: ['tests/{domain,unit,components}/**/*.test.{ts,tsx}'],
                    setupFiles: ['tests/setup.web.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'functions',
                    environment: 'node',
                    include: ['tests/functions/**/*.test.ts'],
                    setupFiles: ['tests/setup.functions.ts'],
                },
            },
        ],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}', 'functions/**/*.ts', 'csp.ts'],
            exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
            // The domain + security core is held to a bar; components are covered by behaviour, not %.
            thresholds: {
                'src/lib/**': { lines: 90 },
                'src/store/**': { lines: 90 },
                'functions/**': { lines: 90 },
            },
        },
    },
})
