# 0009 — Recall summaries via per-user keys (no shared server key)

- **Status:** Accepted (supersedes the key-sourcing of [0007](./0007-recall-summaries-via-same-origin-proxy.md))
- **Date:** 2026-06-14 _(implemented across [`functions/api/recall/`](../../functions/api/recall) and [`src/lib/recallKey.ts`](../../src/lib/recallKey.ts))_

## Context

[0007](./0007-recall-summaries-via-same-origin-proxy.md) shipped getrecall.ai summaries behind a
single **shared** `RECALL_API_KEY` env secret: every user of a deployment read through the
operator's one Recall account. That fits a solo deployment but doesn't serve the app's actual model
— pre-approved users sign in with their **own** Google identity
([0002](./0002-serverless-broker-secrets-in-httponly-cookies.md)) and bring their **own** YouTube
Data API key, so summaries from the operator's unrelated knowledge base are both wrong for them and
an unnecessary exposure of the operator's data.

A Recall `sk_` key grants read access to an **entire** knowledge base, so a shared key also means
the operator silently exposes all their saved cards to every signed-in user. The clean model is the
same one already used for the YouTube key: if you want summaries, bring your own key.

## Decision

Make the Recall integration **per-user only — there is no shared/server-wide key.** Each user
supplies their own Recall key, validated server-side then stored in a `digest_recall_key` `HttpOnly`
+ `Secure` + `SameSite=Strict` cookie scoped to `/api`
([`functions/api/recall/key.ts`](../../functions/api/recall/key.ts),
[`_lib/recallkey.ts`](../../functions/_lib/recallkey.ts)) — exactly mirroring the YouTube key. The
key never reaches page JS; the browser holds only the non-secret boolean `recallConfigured`.

The same-origin proxy and GET-only allowlist from [0007](./0007-recall-summaries-via-same-origin-proxy.md)
are kept unchanged; only the **key source** changes (shared `RECALL_API_KEY` env secret → per-user
cookie), which is why this record supersedes 0007 rather than restating it. `POST /api/recall/key`
validates with a cheap card-lookup probe before storing (mirroring the YouTube key's probe), so a
bad key fails at save time rather than silently breaking the Summary tab. The proxy returns `503`
when no key is configured, and `GET /api/recall/status` reports whether *this browser* has one — the
sole input gating the **Summary** tab.

## Consequences

- Per-user summaries that match each user's own knowledge base; the operator no longer exposes their
  Recall data to anyone who can sign in. No deployment secret is needed for Recall at all (the
  `RECALL_API_KEY` env var / `.dev.vars` line and the Pages-project secret are removed).
- "This browser has a key" and "Recall is available" collapse to a single fact, so there is one
  non-persisted store flag (`recallConfigured`) and one status read (`GET /api/recall/status`); the
  earlier env-fallback design's second flag/endpoint are gone.
- **The user pastes a whole-knowledge-base read key into the app.** The same server-side, HttpOnly,
  cross-site-rejecting handling as every other secret applies, and the proxy stays a GET-only
  allowlist — but the Settings copy warns about the key's broad scope (also in
  [`architecture.md`](../architecture.md) §7.1).
- A summary feature now requires explicit per-user setup; there is no zero-config shared option. That
  is the intended tradeoff — privacy and correctness over convenience.
