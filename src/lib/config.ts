// Build-time configuration.
//
// OAuth is handled server-side by Cloudflare Pages Functions mounted at `/auth` on the same
// origin (they hold the Google client id + secret). The browser never sees a client id or secret
// — it only opens the sign-in popup and calls `/auth/refresh`.
//
// Both ways into the app (Google sign-in and a public API key) are always available at runtime;
// there is no build flag to disable either. A deployment that doesn't set the Google secrets simply
// has a sign-in button that errors when used, and users fall back to the API key.
export const AUTH_BASE = '/auth'
