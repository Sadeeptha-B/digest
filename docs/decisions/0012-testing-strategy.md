# 0012 — Testing strategy: layered Vitest suites, Playwright on the production build

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Digest had no automated tests. The only safety net was `tsc -b` over `src/` and ESLint, and nothing
compiled or exercised `functions/`, the backend that holds the security model
([0002](./0002-serverless-broker-secrets-in-httponly-cookies.md)). Cloudflare Pages deploys every
push to `main`. A first pass of tests against the ADRs found real bugs: a sync that copied YouTube's
duplicate entries and looped the queue, a refresh endpoint that signed users out during a Google
outage, Recall summaries that never matched cards saved from inside a playlist, and others. The
question was what to test at which layer, with which tools, without adding a parallel build system
or needing a Google account to run.

## Decision

Tests live in `tests/` and `e2e/`, **never under `functions/`**, because Pages turns every file
there into a route. The layers are split by what each one answers:

| Layer | Answers | Tooling |
|---|---|---|
| **Domain** (`tests/domain`) | Do the business rules hold: ADR 0006 sync, ADR 0011 lists, persistence/migrations, the Pomodoro engine? | Vitest + jsdom, the real store; property-based invariants with fast-check |
| **Unit** (`tests/unit`) | Do the pure helpers and the client API adapters behave? | Vitest + MSW |
| **Functions** (`tests/functions`) | Does each Function's HTTP and security contract hold? | Vitest in Node, handlers called directly, Google/Recall via MSW |
| **Component** (`tests/components`) | Do screens wire the store, network and player correctly? | Testing Library, MSW, a fake `react-youtube` |
| **E2E** (`e2e/journeys`, `e2e/pwa`) | Do real journeys work in the production build, under the enforced CSP — including sign-in, a reload and sign-out through the real popup page and cookies, a phone layout, and the service worker? | Playwright on `vite preview`, `/api` faked by a deny-by-default route table; in sign-in journeys the real `/auth` Functions answer, run in Node with redirects adapted to script navigations (a browser integration test, not workerd); a fake `YT.Player` |
| **Smoke** (`e2e/smoke`) | Do routing, the SPA fallback, `_headers` and the Functions work together in workerd? | Playwright `request` against `wrangler pages dev dist`, no secrets |

- **Vitest, not Jest**, because it reuses the Vite config and transforms with no extra build setup.
- **Every network boundary is deny-by-default**: MSW in Vitest, a route table in Playwright. A request
  without a handler (or, in E2E, any request leaving the app's origin) fails the test, even when the
  app swallows the error (as background syncs do), so a test can never reach the real network.
- **Functions are tested as plain handlers in Node, not with `@cloudflare/vitest-pool-workers`.**
  They only use Web-standard APIs, so Node runs them faithfully. This is faster, and it avoids tying
  the suite to the pool's Vitest version window. The smoke project covers real-runtime fidelity.
- **E2E runs against the production build**, because the CSP is production-only
  ([0003](./0003-csp-production-only.md)). Any CSP violation fails a test.
- **Bugs are fixed test-first.** A regression test fails before the fix lands.
- **Fakes answer late where timing matters.** Player reads and network calls are async, and the
  user can navigate, sign out or switch focus mode off before one answers. An immediately resolving
  fake can't show those races, so tests hold the answer with a deferred promise
  (`tests/support/deferred.ts`) and release it after the user has acted.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck (now including `functions/`), the Vitest suites
  with coverage, and both Playwright projects on every PR.

## Consequences

- The domain and security core is held to a coverage bar: 90% lines on `src/lib`, `src/store` and
  `functions`. Components are judged by behaviour, not percentage. The bar is a floor, not a goal:
  `functions/` reached 100% lines while still clearing sessions on the wrong OAuth errors. Sharper
  distinctions and assertions (checked by mutating the code under test) are worth more than raising it.
- The fake player and fake backend mean E2E never touches Google or YouTube. As a result, it does not
  prove that the *real* IFrame API or Data API still behave as faked. Nor does it prove that the real
  embed loads and plays under the CSP: the fake player creates no iframe, so E2E shows that the app runs
  under the CSP, not that YouTube does. Changes to those contracts need a manual check with
  `npm run dev:pages`. The unit tests do pin the requests each Data API adapter sends (`part`, ids,
  `mine`, page size), since Google's answer depends on them.
- Testability has shaped a little code. Pure logic moved out of components (`src/lib/sessionStats.ts`,
  `hmsToSeconds`, `activeLineIndex`), the Settings minute fields gained
  accessible labels, and the library's list panel is a labelled landmark (`List contents`) that tests
  and assistive tech both find by role.
- Cloudflare Pages still deploys `main` independently of CI. The gate is branch protection requiring
  the CI checks on PRs, not the deploy pipeline itself.
