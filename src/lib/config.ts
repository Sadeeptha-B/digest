// Build-time configuration.
//
// The Google OAuth **Client ID is not a secret** — it is app metadata designed to be embedded
// in client-side apps, and it only works from the authorized JavaScript origins you configure
// in Google Cloud. Set it via a `.env` file (see `.env.example`) so it ships with the build and
// users never have to paste it. The Settings field is only a fallback when none is embedded.
export const EMBEDDED_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
