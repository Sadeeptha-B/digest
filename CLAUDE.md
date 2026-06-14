# Digest — project guide

Digest is a React SPA plus a thin Cloudflare Pages Functions broker. See
[`docs/architecture.md`](docs/architecture.md) for how it works and
[`docs/decisions/`](docs/decisions/README.md) for why.

## Documentation discipline

The docs are split by **lifecycle, not by topic**. Each tier changes for a different reason; keep
content in the tier whose trigger matches, and the docs stay maintainable as the app grows.

| Tier | File(s) | Job — answers… | Changes when |
|---|---|---|---|
| **Quickstart / how-to** | [`README.md`](README.md) | "how do I run/deploy it?" | setup or deploy steps change |
| **Reference / explanation** | [`docs/architecture.md`](docs/architecture.md) | "how does it work *now*?" | the system itself changes |
| **Decision records (ADRs)** | [`docs/decisions/`](docs/decisions/README.md) | "*why* is it this way?" | a decision is made (then never edited) |
| **Roadmap** | [`docs/roadmap/`](docs/roadmap) | "what might we build?" | direction changes; shrinks as things ship |

### Rules

1. **Put the "why" in an ADR, not in the reference doc.** When you write "a deliberate decision,"
   "we chose X over Y," "we removed/rejected Z," or a "(superseded)" footnote — that's a decision
   record. Add a file under `docs/decisions/` (copy
   [`0000-template.md`](docs/decisions/0000-template.md), take the next number, add a row to the
   [index](docs/decisions/README.md)) and link to it from the reference doc with a one-line pointer.
   `architecture.md` should describe behavior and link out for rationale.

2. **ADRs are append-only.** Never rewrite or delete a decision once accepted. If it no longer
   holds, set its status to `Superseded by [NNNN]` and write a new record. The whole value is that
   the rationale survives the system moving on, so a settled tradeoff isn't re-litigated.

3. **Roadmap shrinks, it doesn't accumulate.** When a roadmap item ships, migrate its rationale to
   an ADR and delete the "future" framing — don't annotate it with "(done)"/"(superseded)" banners.
   Roadmap docs hold *open* options only.

4. **Don't hand-maintain "Last updated" dates or live status as prose.** They drift and give false
   confidence; git history is the source of truth for recency. A genuinely dated *status snapshot*
   (e.g. a "Status (YYYY-MM-DD): …" banner stating a point-in-time fact) is fine; a top-of-file
   `_Last updated:_` line is not.

5. **Don't duplicate reference across README and architecture.** State a fact once in the tier that
   owns it and link, rather than restating (every restatement is a place to drift). The README is
   operator-facing setup; the deep "how/why" lives in `docs/`.

6. **Broadening the backend is a new trust-boundary decision.** The current backend is narrow (OAuth
   brokerage, API-key storage, a small YouTube proxy, the read-only Recall proxy). If transcripts,
   wider proxying, or cross-device sync move server-side, write a new ADR revisiting cookie scope,
   CSP, origin boundaries, and abuse controls — don't assume the current posture scales unchanged.

The single source for the CSP is [`csp.ts`](csp.ts); it is **not** enforced in dev (see
[ADR 0003](docs/decisions/0003-csp-production-only.md)).
