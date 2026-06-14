# 0003 — CSP is production-only (not enforced in dev)

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

The Content-Security-Policy lives in one place, [`csp.ts`](../../csp.ts): injected as a `<meta>`
tag at build time (`injectCspMeta`, `apply: 'build'`) and emitted as a real `dist/_headers`
response header for production. Neither is active in the Vite dev server. The question was whether
to also enforce a CSP in dev for parity.

Enforcing it in dev fights the toolchain in two concrete ways we hit:

- The `youtube-player` library derives the IFrame API URL from `window.location.protocol`, so on
  `http://localhost` it loads `http://www.youtube.com/...`, which an https-only `script-src` blocks.
- Vite injects inline HMR / React-refresh `<script>`s that a `script-src` without `'unsafe-inline'`
  blocks outright — the app wouldn't even load.

A dev CSP could never match prod anyway (prod has no inline HMR scripts), so it would give a false
sense of parity.

## Decision

**Do not enforce any CSP in dev.** Keep the single source in `csp.ts` and verify the real policy
where it's real: `npm run build && npm run preview` exercises the strict `<meta>`, and the deployed
site exercises the full `_headers` header.

## Consequences

- One policy to keep correct, verified in the environment that actually ships it.
- Dev has **no CSP at all**. This is acceptable: in dev it would protect only a short-lived,
  `youtube.readonly`, in-memory access token on `localhost` with no untrusted input — negligible
  value. The easy-to-miss gap is that **dev is not production-parity for CSP**; documented in
  [`architecture.md`](../architecture.md) §6.
- Closely related: see [0004](./0004-plain-http-in-dev.md) for why dev stays on plain HTTP (which
  is what surfaces the `youtube-player` http-vs-https issue above).
