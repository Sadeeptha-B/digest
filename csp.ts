// Single source of truth for the app-shell Content-Security-Policy and the sibling security
// headers. Both the <meta> tag injected into index.html (see vite.config.ts) and the production
// `_headers` file emitted into dist/ are derived from the `directives` map below — edit the policy
// here only, never in index.html or a static _headers file.
//
// (The OAuth popup in functions/_lib/google.ts has its own, intentionally stricter policy and is
// deliberately NOT driven from here.)
//
// Allowances: the YouTube IFrame Player API (www.youtube.com), the privacy-enhanced embed
// (youtube-nocookie.com), and thumbnail hosts (ytimg/ggpht). Everything else — the YouTube Data
// API and OAuth — is same-origin via Pages Functions (/api/*, /auth/*), so connect-src is 'self'.
const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://www.youtube.com'],
    'connect-src': ["'self'"],
    'frame-src': ['https://www.youtube-nocookie.com'],
    'img-src': ["'self'", 'data:', 'https://*.ytimg.com', 'https://*.ggpht.com'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'form-action': ["'self'"],
}

// Other security response headers shipped alongside the CSP (header-only — no <meta> equivalent).
const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
}

const serialize = (d: Record<string, string[]>): string =>
    Object.entries(d)
        .map(([directive, values]) => `${directive} ${values.join(' ')}`)
        .join('; ')

// Policy for the <meta> tag. `frame-ancestors` is intentionally omitted here because it is ignored
// in a <meta> CSP — clickjacking protection comes from the real header below (and X-Frame-Options).
//
// NOTE: this is injected only in production builds, NOT in the Vite dev server. CSP is a production
// hardening measure; enforcing it in dev fights the toolchain (Vite injects inline HMR/React-refresh
// scripts, the YouTube IFrame API loads over http on http://localhost, etc.) while protecting only a
// short-lived in-memory token on localhost. Verify the real policy with `npm run build && preview`.
export const META_CSP: string = serialize(directives)

// Header CSP adds `frame-ancestors 'none'`, which only works as a real response header.
const HEADER_CSP: string = serialize({ ...directives, 'frame-ancestors': ["'none'"] })

/** Contents of the Cloudflare Pages `_headers` file (emitted into dist/ by the Vite build). */
export function buildHeadersFile(): string {
    const lines = [
        `  Content-Security-Policy: ${HEADER_CSP}`,
        ...Object.entries(securityHeaders).map(([name, value]) => `  ${name}: ${value}`),
    ]
    return `# Generated from csp.ts by the Vite build — do not edit by hand.\n/*\n${lines.join('\n')}\n`
}
