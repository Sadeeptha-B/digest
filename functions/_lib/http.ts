// Generic HTTP helpers shared by the Pages Functions (cookies, JSON responses). Kept separate
// from the OAuth-specific code in google.ts so the /api/* Functions can reuse them.

interface CookieOptions {
    path: string
    maxAge?: number
    sameSite?: 'Lax' | 'Strict' | 'None'
}

/** Serialize an HttpOnly + Secure cookie. The value is URL-encoded (decode in parseCookies). */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
    const { path, maxAge, sameSite = 'Lax' } = opts
    let s = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}; HttpOnly; Secure`
    if (maxAge !== undefined) s += `; Max-Age=${maxAge}`
    return s
}

/** A Set-Cookie string that immediately expires the named cookie at the given path. */
export function expireCookie(name: string, path: string): string {
    return `${name}=; Path=${path}; Max-Age=0; SameSite=Lax; HttpOnly; Secure`
}

export function parseCookies(header: string | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (!header) return out
    for (const part of header.split(';')) {
        const i = part.indexOf('=')
        if (i < 0) continue
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    }
    return out
}

export function json(body: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Cache-Control', 'no-store')
    return new Response(JSON.stringify(body), { ...init, headers })
}

/**
 * Reject requests that the browser marks as cross-site. Combined with SameSite cookies this keeps
 * the /api endpoints usable only from our own SPA. `Sec-Fetch-Site` is set by the browser and
 * can't be forged by page script; when it's absent (very old clients) we don't block.
 */
export function isCrossSite(request: Request): boolean {
    const site = request.headers.get('Sec-Fetch-Site')
    return site !== null && site !== 'same-origin' && site !== 'none'
}
