# Digest

A distraction-free viewer for your YouTube playlists. Paste a playlist (or single
video) URL, and watch it in a stripped-down player surrounded only by **your own**
queue — no sidebar recommendations, no autoplay to unrelated content, no end-screen
grid of "related" videos.

Everything you save stays in your browser. When Google sign-in is enabled, a small
Cloudflare Pages Functions layer handles the OAuth code exchange and refresh-token cookie;
otherwise a public API key is enough for public/unlisted content.

## Features

- Add public/unlisted **playlists** or standalone **videos** by URL.
- A custom **queue** that auto-advances to the next video when one ends — so YouTube's
  end-screen never gets a chance to pull you elsewhere.
- **Watch progress**: finished videos are marked, and playback **resumes** where you
  left off.
- Manage **multiple lists**, drag to **reorder** lists and videos, and remove items.
- Privacy-enhanced embeds via `youtube-nocookie.com`.

## How it works

- **Fetching contents** uses the [YouTube Data API v3](https://developers.google.com/youtube/v3).
  `playlistItems.list` costs **1 quota unit per 50 videos** against a free **10,000
  units/day** pool — effectively unlimited for personal use. Public/unlisted playlists
  need only an API key (no OAuth).
- **Playback** uses the YouTube IFrame Player API (via `react-youtube`). YouTube no
  longer lets embeds fully disable related videos (`rel=0` only limits them to the same
  channel), so the distraction-free experience comes from our own queue plus
  intercepting the player's `ENDED` event to advance immediately.

## Getting started

There are two ways in. **Signing in with Google is recommended** — it unlocks your private
playlists and needs no API key. The API key is an optional fallback for browsing public
content without signing in.

### 1. Configure Google sign-in (recommended)

Sign-in uses the OAuth **Authorization Code** flow, brokered by a small serverless backend
(Cloudflare Pages Functions in [`functions/auth/`](functions/auth)). The Google **client secret**
and the long-lived **refresh token** stay server-side; the browser only ever receives a
short-lived access token. See the full setup in
[Deploying to Cloudflare Pages](#deploying-to-cloudflare-pages) below — in short:

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com),
   enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen** (External), add the scope
   `https://www.googleapis.com/auth/youtube.readonly`, and add your Google account as a
   **Test user** (staying in *Testing* needs no Google verification for personal use).
3. **Credentials → Create OAuth client ID → Web application.** Under **Authorized redirect
   URIs** add `http://localhost:8788/auth/callback` (local dev) and
   `https://<project>.pages.dev/auth/callback` (production).
4. Provide the **client id + secret** to the backend as server-side secrets — in `.dev.vars`
   locally (copy [.dev.vars.example](.dev.vars.example)) and on the Cloudflare Pages project for
   production. They are **never** bundled into the frontend.

### 2. (Optional) API key for public-only, no-sign-in use

Under **Credentials**, create an **API key** and restrict it by **HTTP referrer**
(`http://localhost:5174/*`, `https://<project>.pages.dev/*`). Not needed when signed in.

### 3. Run locally

```bash
npm install
npm run dev        # http://localhost:5174 — frontend only (Google sign-in won't work here)
```

To exercise Google sign-in locally you need the auth Functions running too. Put your client
id/secret in `.dev.vars` (copy [.dev.vars.example](.dev.vars.example)), then:

```bash
npm run dev:pages  # http://localhost:8788 — Vite + the /auth Pages Functions on one origin
```

Make sure `http://localhost:8788/auth/callback` is in the OAuth client's redirect URIs.

### 4. Build

```bash
npm run build     # type-checks and bundles to dist/
npm run preview   # serve the production build locally (PWA active here)
npm run icons     # regenerate app icons from scripts/generate-icons.mjs
```

## Install as an app (PWA)

Digest is a PWA: open the production build (`npm run preview`, or your deployed Pages URL)
and use the browser's **Install** action to add it as a standalone app. The service worker
caches the app shell for fast loads and offline UI.

## Tech stack

React + TypeScript + Vite, Tailwind CSS, Zustand (with `persist` for local storage),
React Router (`BrowserRouter` + SPA rewrite), `react-youtube`, and `@dnd-kit` for drag-and-drop reordering. Google
sign-in is brokered by **Cloudflare Pages Functions** in [`functions/auth/`](functions/auth).

## Deploying to Cloudflare Pages

The app deploys to Cloudflare Pages as static assets **plus** the OAuth Functions in
[`functions/`](functions), served on the same origin. Moving off `user.github.io` also gives the
app its **own origin**, isolating its `localStorage` from any other site you host there.

### A. Google Cloud (OAuth client)

1. Enable **YouTube Data API v3** and configure the **OAuth consent screen** (External; add the
   `youtube.readonly` scope and yourself as a Test user) — as in
   [§1 above](#1-configure-google-sign-in-recommended).
2. **Credentials → Create OAuth client ID → Web application.** Add **Authorized redirect URIs**:
   - `http://localhost:8788/auth/callback` — local dev (`npm run dev:pages`)
   - `https://<project>.pages.dev/auth/callback` — production (fill in after step B picks the name)

   Copy the generated **Client ID** and **Client secret**.

### B. Create the Pages project

1. Push this repo to GitHub/GitLab.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create →
   Pages → Connect to Git**, pick the repo. This gives the cleanest setup: every push to `main`
   builds and deploys (with preview deployments for other branches), and the `functions/`
   directory is compiled automatically.
3. **Build settings:**
   - Framework preset: **Vite** (or *None*)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Save and run the first deploy. Note the assigned URL `https://<project>.pages.dev`, then go
   back to Google Cloud (step A2) and confirm its `/auth/callback` redirect URI is listed.

### C. Set the OAuth secrets on the project

In **Pages project → Settings → Variables and secrets**, add two **secrets** (encrypted) for the
**Production** (and **Preview**, if you want sign-in on previews) environments:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Web client ID from step A2 |
| `GOOGLE_CLIENT_SECRET` | the Web client secret from step A2 |

Then redeploy (Deployments → Retry/Redeploy) so the Functions pick them up. The frontend needs
**no** environment variables.

> CLI alternative to B+C: `npm run deploy` (runs `wrangler pages deploy`) after
> `wrangler pages secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Notes

- The app builds at the **root** (`/`) of its own origin — no `BASE_PATH` needed (unlike the old
  GitHub Pages `/digest/` subpath).
- Client-side routes use `BrowserRouter`; [`public/_redirects`](public/_redirects) rewrites deep
  links back to `index.html` so refreshes still work.
- [`public/_headers`](public/_headers) ships a real CSP response header (with `frame-ancestors`),
  which Cloudflare Pages serves automatically.
- Add your `https://<project>.pages.dev` to the YouTube **API key**'s referrer restrictions if you
  use the API-key fallback.
- **Custom domain (optional):** add it under the project's **Custom domains** tab, then add
  `https://yourdomain.com/auth/callback` to the OAuth client's redirect URIs.

## Scope / not included

- A backend proxy / home server for transcripts of non-owned or auto-captioned videos
  (see [docs/roadmap/transcripts.md](docs/roadmap/transcripts.md)).
- Cross-device sync (state lives in each browser's local storage).
