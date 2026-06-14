# 0007 — getrecall.ai summaries via the same-origin proxy

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

getrecall.ai surfaces the AI summaries you already generate for saved videos. Its API needs an
`sk_` bearer key that grants read access to your **entire** knowledge base — far too broad to ship
in a client build. The earlier plan (see [`roadmap/transcripts.md`](../roadmap/transcripts.md)
Option 7) was to hide the key behind a future **home server** `/recall` proxy. But the broker work
in [0002](./0002-serverless-broker-secrets-in-httponly-cookies.md) means Digest already has a
secret-holding, same-origin backend — so no separate server is needed.

## Decision

Serve Recall through the existing same-origin Pages Functions proxy
([`functions/api/recall/`](../../functions/api/recall)), injecting the key from the
`RECALL_API_KEY` env secret. The browser never sees the key; the **Summary** tab is hidden unless
`GET /api/recall/status` reports the key configured. The proxy is a GET-only allowlist
(`cards`, `cards/{id}`) that rejects cross-site requests. Leaving `RECALL_API_KEY` unset hides the
feature entirely.

## Consequences

- One backend, one trust boundary — supersedes the home-server `/recall` proxy idea for this purpose.
- The deployment holds a **broad** read key server-side; scope the key to the Recall account you're
  comfortable exposing read-only. Caveat tracked in [`architecture.md`](../architecture.md) §7.1.
- Recall is a **summary** source, not a verbatim transcript; it pairs with the manual-import and
  future home-server transcript paths, it doesn't replace them.
