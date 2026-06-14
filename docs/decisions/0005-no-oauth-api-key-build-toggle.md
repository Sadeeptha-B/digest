# 0005 — No OAuth/API-key build toggle — both paths always on

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

There used to be a `VITE_AUTH_BASE=` (empty) build flag that flipped an `OAUTH_ENABLED` constant
to hide the Google sign-in branch entirely. It cost a second onboarding UI variant, an extra
documented build mode, and `isOAuthConfigured()` checks scattered across components.

The toggle never bought a simpler deployment: the `/api` proxy and `/api/key` endpoints are
required either way, so you still deploy the Functions, create a Google Cloud project, and need an
API key. Hiding sign-in only saved setting two secrets — not worth the branching surface.

## Decision

**Remove the toggle. Both ways in are always available at runtime.**
[`ApiKeyGate`](../../src/components/ApiKeyGate.tsx) is a single UI offering sign-in *and* a public
API key; [`config.ts`](../../src/lib/config.ts) is just `AUTH_BASE = '/auth'`;
[`getValidToken`](../../src/lib/oauth.ts) always attempts a refresh (a dead session returns `null`
gracefully).

## Consequences

- Less branching, one onboarding UI, one config constant.
- A deployment that didn't set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` still shows a sign-in
  button, which errors on use (`/auth/login` → 500); users fall back to the API key. A real
  deployment wants the secrets anyway, so this is an acceptable edge.
- Summarized in [`architecture.md`](../architecture.md) §8 (Design decisions); this ADR is the
  durable record.
