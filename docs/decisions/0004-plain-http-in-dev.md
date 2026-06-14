# 0004 — Dev runs plain HTTP on `localhost`, not HTTPS

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

`localhost` is a browser-trusted [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts),
so `Secure` `HttpOnly` cookies are sent over plain `http` and sign-in works without any local TLS.
We still evaluated serving dev over **HTTPS** — it would let the `youtube-player` IFrame API load
over https (see [0003](./0003-csp-production-only.md)) — and found it doesn't fit cleanly:

- `wrangler pages dev --proxy` can't terminate TLS to a Vite upstream. `--local-protocol https`
  proxies over HTTPS, but Node/undici won't trust the mkcert CA, so every request 502s.
- The working alternative (Vite serves HTTPS and proxies to wrangler) costs a mkcert CA install,
  two processes, a dev-origin change to `:5174`, and a new Google redirect URI.

## Decision

Dev runs **plain HTTP on `localhost`** for both `npm run dev` and `npm run dev:pages`. No mkcert,
no local TLS.

## Consequences

- Simple, zero-setup dev that still exercises the real cookie flow.
- Combined with [0003](./0003-csp-production-only.md), the IFrame-API http/https mismatch never
  bites, because there's no CSP in dev to block the `http://` script.
- Anyone tempted to "just add HTTPS to dev" should read this before re-deriving the 502 dead end.
  Supporting detail is in the two memory notes (`wrangler-proxy-no-https`, `digest-dev-https-decision`)
  and [`architecture.md`](../architecture.md) §4.
