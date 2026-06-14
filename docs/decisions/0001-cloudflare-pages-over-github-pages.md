# 0001 — Host on Cloudflare Pages, not shared GitHub Pages

- **Status:** Accepted
- **Date:** 2026-06-14 _(recorded; migration completed earlier — see [`roadmap/hosting.md`](../roadmap/hosting.md))_

## Context

Digest originally shipped as static files under a shared `user.github.io` path (`/digest/`).
Every project under that user shares **one origin**, so they share `localStorage` (including, at
the time, the API key) and the same OAuth authorized origin. A path (`/digest/`) does **not**
isolate origins — only a distinct host does. GitHub Pages also cannot serve custom response
headers, so the CSP was stuck as a `<meta>` tag with no `frame-ancestors`. Separately, the app
was about to grow a backend (see [0002](./0002-serverless-broker-secrets-in-httponly-cookies.md)),
which plain static hosting can't run at all.

## Decision

Host on **Cloudflare Pages**: each app gets its own `*.pages.dev` origin, real HTTP response
headers via a `_headers` file, and Pages Functions on the same origin. Build at the root (`/`),
no `BASE_PATH`. (Netlify was an equivalent fit on the static axis; Cloudflare won because the
Functions runtime and a future Cloudflare Tunnel for the transcript home server colocate cleanly —
see [`roadmap/hosting.md`](../roadmap/hosting.md) §5.)

## Consequences

- An **isolated origin** that no longer shares `localStorage` or OAuth config with other apps.
- A **real CSP response header** (with `frame-ancestors 'none'`) shipped as `dist/_headers`, on
  top of the build-time `<meta>` tag — see [`csp.ts`](../../csp.ts).
- Same-origin Pages Functions, which is what makes the whole broker model possible.
- There is **no longer a pure-static, backend-less deployment** — a plain static host can no
  longer run the app. The "any static host works" framing in `roadmap/hosting.md` is now historical.
