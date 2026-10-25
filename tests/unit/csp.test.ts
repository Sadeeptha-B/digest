// The single CSP source (csp.ts, ADR 0003): what the production meta tag and _headers file carry.
import { describe, expect, it } from 'vitest'
import { META_CSP, buildHeadersFile } from '../../csp'

const directives = (policy: string): Record<string, string[]> =>
    Object.fromEntries(
        policy.split(';').map((d) => {
            const [name, ...values] = d.trim().split(/\s+/)
            return [name, values]
        }),
    )

describe('csp', () => {
    it('keeps every network hop same-origin (the Data API and OAuth go through /api and /auth)', () => {
        expect(directives(META_CSP)['connect-src']).toEqual(["'self'"])
    })

    it('allows only the YouTube player, its privacy-enhanced embed and thumbnail hosts', () => {
        const d = directives(META_CSP)
        expect(d['script-src']).toEqual(["'self'", 'https://www.youtube.com'])
        expect(d['frame-src']).toEqual(['https://www.youtube-nocookie.com'])
        expect(d['object-src']).toEqual(["'none'"])
    })

    it('omits frame-ancestors from the meta tag (ignored there) but sends it as a header', () => {
        expect(directives(META_CSP)).not.toHaveProperty('frame-ancestors')
        const csp = buildHeadersFile().match(/Content-Security-Policy: (.*)/)?.[1] ?? ''
        expect(directives(csp)['frame-ancestors']).toEqual(["'none'"])
    })

    it('emits a Cloudflare _headers file applying to every path', () => {
        const lines = buildHeadersFile().split('\n')
        expect(lines[0]).toMatch(/^# Generated from csp.ts/)
        expect(lines[1]).toBe('/*')
        expect(lines).toContain('  X-Frame-Options: DENY')
        expect(lines).toContain('  X-Content-Type-Options: nosniff')
        expect(lines).toContain('  Referrer-Policy: no-referrer')
    })
})
