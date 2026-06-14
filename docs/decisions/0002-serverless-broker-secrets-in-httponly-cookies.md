# 0002 — A thin server-side broker; secrets in HttpOnly cookies

- **Status:** Accepted
- **Date:** 2026-06-14 _(recorded; implemented across [`functions/auth/`](../../functions/auth) and [`functions/api/`](../../functions/api))_

## Context

A pure-SPA design forces every credential into the browser: the OAuth token in memory and the
YouTube API key in `localStorage`, mitigated only by CSP and referrer restrictions, never
eliminated. Once the app moved to Cloudflare Pages ([0001](./0001-cloudflare-pages-over-github-pages.md)),
same-origin **Pages Functions** became available — a place to hold secrets that page JavaScript
cannot read.

## Decision

Run a **thin server-side broker** on the same origin as the SPA:

- `/auth/*` brokers Google sign-in (Authorization Code + PKCE). The **client secret** and the
  long-lived **refresh token** stay server-side; the refresh token lives in the `digest_rt`
  `HttpOnly` cookie scoped to `/auth`.
- `/api/*` proxies the YouTube Data API and stores the user's API key in the `digest_yt_key`
  `HttpOnly` cookie scoped to `/api`.
- The **only** credential that reaches the browser is a short-lived OAuth access token, kept in
  memory and never persisted.

## Consequences

- Secrets are out of reach of page JS; a `localStorage` dump contains no live credential.
- **Cookie scoping is the access-control mechanism** — each cookie is sent only to the endpoints
  that need it. Combined with same-origin, this removes all CORS configuration.
- The proxy is a **narrow allowlist** (fixed resources, GET-only, client `key` stripped), not an
  open relay.
- This is now the canonical posture documented end-to-end in
  [`architecture.md`](../architecture.md) §2 and §7. **Broadening the backend** (transcripts,
  cross-device sync, wider proxying) is a new trust-boundary decision, not a free extension of
  this one — record it as a new ADR.
