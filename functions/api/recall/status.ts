import { json } from '../../_lib/http'
import { readRecallKey } from '../../_lib/recallkey'

// Reports whether THIS browser has a Recall key configured, so the SPA knows whether to show the
// Summary tab. The integration is per-user (no shared server key) — see ADR 0009. The key itself
// (the digest_recall_key cookie) is never exposed; only this boolean is returned.

export const onRequestGet: PagesFunction = async ({ request }) => {
    return json({ configured: Boolean(readRecallKey(request)) })
}
