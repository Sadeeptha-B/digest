import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Flat config. Type checking proper is left to `tsc -b` (build); ESLint here catches the
// things the compiler doesn't — Rules of Hooks, Fast Refresh hazards, and lint-only smells.
// The codebase is split by runtime, so each tier gets the right globals:
//   src/        → browser SPA          functions/ → Cloudflare Workers runtime
//   scripts/, *.config.*, csp.ts → Node tooling
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', '.wrangler'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Match TypeScript's own `noUnusedLocals`: a leading underscore marks a deliberately
  // unused binding (e.g. omitting keys via destructuring).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  // Frontend SPA: browser globals + React hooks/refresh rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Cloudflare Pages Functions run on the Workers runtime (no Node, no DOM).
  {
    files: ['functions/**/*.ts'],
    languageOptions: {
      globals: { ...globals.serviceworker, ...globals.worker },
    },
  },

  // Node-side tooling: build config, the CSP module, icon generation.
  {
    files: ['**/*.{js,mjs}', '**/*.config.ts', 'csp.ts', 'scripts/**/*'],
    languageOptions: {
      globals: globals.node,
    },
  },
)
