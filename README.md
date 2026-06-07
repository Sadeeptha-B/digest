# Digest

A distraction-free viewer for your YouTube playlists. Paste a playlist (or single
video) URL, and watch it in a stripped-down player surrounded only by **your own**
queue — no sidebar recommendations, no autoplay to unrelated content, no end-screen
grid of "related" videos.

Everything is stored locally in your browser — there is no backend. Sign in with Google
(optional) to reach your private playlists; otherwise a public API key is enough for
public/unlisted content.

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

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com),
   enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen** (External), add the scope
   `https://www.googleapis.com/auth/youtube.readonly`, and add your Google account as a
   **Test user** (staying in *Testing* needs no Google verification for personal use).
3. **Credentials → Create OAuth client ID → Web application.** Add your origins to
   **Authorized JavaScript origins**: `http://localhost:5174` and your Pages URL
   `https://<user>.github.io`.
4. Put the client ID in a `.env` file (copy from [.env.example](.env.example)):

   ```
   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   ```

   The OAuth client ID is **public app metadata, not a secret** — it's restricted by the
   authorized origins above. With it set, users just click **Sign in with Google**; no client
   ID is pasted at runtime. (If you don't set the env var, the app falls back to a Client ID
   field in Settings.)

### 2. (Optional) API key for public-only, no-sign-in use

Under **Credentials**, create an **API key** and restrict it by **HTTP referrer**
(`http://localhost:5174/*`, `https://<user>.github.io/*`). Not needed when signed in.

### 3. Run locally

```bash
npm install
npm run dev      # http://localhost:5174
```

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
React Router (`HashRouter`), `react-youtube`, and `@dnd-kit` for drag-and-drop reordering.

## Deploying to GitHub Pages

This repo includes a workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
that builds and deploys on every push to `main`.

One-time setup:
1. **Settings → Pages → Source = GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables → New variable:** add
   `VITE_GOOGLE_CLIENT_ID` with your OAuth client ID. It's public app metadata (not a secret),
   so a repository *variable* is appropriate. The workflow injects it at build time.

After the next push to `main`, the site publishes to `https://<user>.github.io/digest/`.

Notes:
- The Pages build sets `BASE_PATH=/digest/` (in the workflow), so assets and the PWA manifest
  (`start_url`/`scope`) resolve under the project subpath. Local dev/preview stays at `/`.
- The app uses `HashRouter`, so deep links and refreshes work on Pages without
  server-side rewrites.
- Add your Pages URL to the OAuth client's authorized origins (and, if used, the API key's
  referrer restrictions).

## Scope / not included

- A backend proxy / home server for transcripts of non-owned or auto-captioned videos
  (see [docs/roadmap/transcripts.md](docs/roadmap/transcripts.md)).
- Cross-device sync (state lives in each browser's local storage).
