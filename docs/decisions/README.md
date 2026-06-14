# Decision records (ADRs)

One short file per architectural decision: **what we chose and why**. These are
**append-only** — a decision that no longer holds is not edited or deleted, it is marked
`Superseded by [NNNN]` and a new record is written. That is the whole point: the rationale
survives even after the system moves on, so nobody re-litigates a settled tradeoff.

This is the home for the "why" that used to live as prose and footnotes inside
[`architecture.md`](../architecture.md) and the [`roadmap/`](../roadmap) docs. The reference
docs describe how the system works **now**; these describe **why it is that way**.

See [`../../CLAUDE.md`](../../CLAUDE.md) for when to add one and how the doc tiers fit together.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](./0001-cloudflare-pages-over-github-pages.md) | Host on Cloudflare Pages, not shared GitHub Pages | Accepted |
| [0002](./0002-serverless-broker-secrets-in-httponly-cookies.md) | A thin server-side broker; secrets in HttpOnly cookies | Accepted |
| [0003](./0003-csp-production-only.md) | CSP is production-only (not enforced in dev) | Accepted |
| [0004](./0004-plain-http-in-dev.md) | Dev runs plain HTTP on `localhost`, not HTTPS | Accepted |
| [0005](./0005-no-oauth-api-key-build-toggle.md) | No OAuth/API-key build toggle — both always on | Accepted |
| [0006](./0006-local-authoritative-playlist-sync.md) | Digest owns the playlist; YouTube is a source | Accepted |
| [0007](./0007-recall-summaries-via-same-origin-proxy.md) | getrecall.ai summaries via the same-origin proxy | Accepted |
| [0008](./0008-remove-official-captions-download.md) | Remove official `captions.download`; manual import only | Accepted |

To add one, copy [`0000-template.md`](./0000-template.md) to the next number and append a row here.
