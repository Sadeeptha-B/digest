// The e2e fixtures run real Pages Functions (/auth/login, /auth/callback), but e2e is type-checked
// against the browser lib, where Cloudflare's Workers types would clash. This declares just the slice
// of PagesFunction those handlers use; the Functions themselves are checked against the real Workers
// types by functions/tsconfig.json and tests/functions/tsconfig.json.
type PagesFunction<Env = unknown> = (context: {
    request: Request
    env: Env
    params: Record<string, string | string[]>
    data: Record<string, unknown>
    functionPath: string
    waitUntil(promise: Promise<unknown>): void
    passThroughOnException(): void
    next(): Promise<Response>
}) => Response | Promise<Response>
