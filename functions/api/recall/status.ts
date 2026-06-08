import { json } from '../../_lib/http'

// Reports whether the Recall integration is configured on the server (i.e. RECALL_API_KEY is set),
// so the SPA knows whether to show the Summary tab. The key itself is never exposed.

interface Env {
    RECALL_API_KEY?: string
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    return json({ configured: Boolean(env.RECALL_API_KEY) })
}
