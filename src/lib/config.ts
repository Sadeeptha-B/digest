// Build-time configuration.
//
// OAuth is handled server-side by Cloudflare Pages Functions mounted at `/auth` on the same
// origin (they hold the Google client id + secret). The browser never sees a client id or secret
// — it only opens the sign-in popup and calls `/auth/refresh`.
//
// `VITE_AUTH_BASE` set to an empty string hides the Google sign-in UI (API-key-only deployment).
// It does NOT make the app backend-less: the `/api` YouTube proxy + key endpoints are always
// required, so the Pages Functions must be deployed regardless.
export const AUTH_BASE: string = import.meta.env.VITE_AUTH_BASE ?? '/auth'
export const OAUTH_ENABLED: boolean = AUTH_BASE !== ''
