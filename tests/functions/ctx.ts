// Calls a Pages Function handler directly. The handlers only use Web-standard APIs (Request,
// Response, crypto.subtle, fetch), which Node provides, so no Workers runtime is needed here; the
// e2e smoke project exercises them in workerd.

export const ORIGIN = 'https://digest.pages.dev'

export const SECRETS = { GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' }

type Handler = (context: never) => Response | Promise<Response>

export function call(
    handler: Handler | undefined,
    request: Request,
    { env = {}, params = {} }: { env?: Record<string, string>; params?: Record<string, string | string[]> } = {},
): Promise<Response> {
    if (!handler) throw new Error('handler not exported')
    const context = {
        request,
        env,
        params,
        data: {},
        functionPath: new URL(request.url).pathname,
        waitUntil: () => {},
        passThroughOnException: () => {},
        next: () => Promise.resolve(new Response(null, { status: 404 })),
    }
    return Promise.resolve(handler(context as never))
}

export function req(
    path: string,
    { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Request {
    return new Request(`${ORIGIN}${path}`, { method, headers, body })
}

/** Set-Cookie headers keyed by cookie name, each parsed into its attributes. */
export function setCookies(res: Response): Record<string, { value: string; attrs: Record<string, string> }> {
    const out: Record<string, { value: string; attrs: Record<string, string> }> = {}
    for (const line of res.headers.getSetCookie()) {
        const [pair, ...rest] = line.split(';').map((s) => s.trim())
        const i = pair.indexOf('=')
        const attrs: Record<string, string> = {}
        for (const a of rest) {
            const [k, v = ''] = a.split('=')
            attrs[k.toLowerCase()] = v
        }
        out[pair.slice(0, i)] = { value: decodeURIComponent(pair.slice(i + 1)), attrs }
    }
    return out
}
