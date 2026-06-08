// Build-time configuration.
//
// OAuth is handled server-side by Cloudflare Pages Functions mounted at `/auth` on the same
// origin (they hold the Google client id + secret). The browser never sees a client id or secret
// — it only opens the sign-in popup and calls `/auth/refresh`.
//
// `VITE_AUTH_BASE` lets a static-only build (no Functions) disable OAuth: set it to an empty
// string and the app falls back to API-key-only mode.
export const AUTH_BASE: string = import.meta.env.VITE_AUTH_BASE ?? '/auth'
export const OAUTH_ENABLED: boolean = AUTH_BASE !== ''
