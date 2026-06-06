# Digest

A distraction-free viewer for your YouTube playlists. Paste a playlist (or single
video) URL, and watch it in a stripped-down player surrounded only by **your own**
queue — no sidebar recommendations, no autoplay to unrelated content, no end-screen
grid of "related" videos.

Everything is stored locally in your browser. There is no backend and no sign-in.

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

### 1. Create a YouTube API key

1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   and enable **YouTube Data API v3**.
2. Under **Credentials**, create an **API key**.
3. Restrict it by **HTTP referrer** to the sites you'll use it from, e.g.
   `http://localhost:5174/*` and your GitHub Pages URL `https://<user>.github.io/*`.

The key is stored only in your browser's local storage. Because it's referrer-restricted
and read-only over public data, exposing it in the browser is acceptable for personal use.

### 2. Run locally

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5174`), paste your API key when prompted,
then paste a playlist or video URL.

### 3. Build

```bash
npm run build     # type-checks and bundles to dist/
npm run preview   # serve the production build locally
```

## Tech stack

React + TypeScript + Vite, Tailwind CSS, Zustand (with `persist` for local storage),
React Router (`HashRouter`), `react-youtube`, and `@dnd-kit` for drag-and-drop reordering.

## Deploying to GitHub Pages

This repo includes a workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
that builds and deploys on every push to `main`.

One-time setup: in the repository's **Settings → Pages**, set **Source** to
**GitHub Actions**. After the next push to `main`, the site publishes to
`https://<user>.github.io/<repo>/`.

Notes:
- Vite's `base` is set to `./` (relative), so the build works under any project path.
- The app uses `HashRouter`, so deep links and refreshes work on Pages without
  server-side rewrites.
- Remember to add your Pages URL to the API key's referrer restrictions (step 1 above).

## Scope / not included

- **Private** playlists (would require Google OAuth sign-in).
- A backend proxy to hide the API key (not needed for a referrer-restricted personal key).
- Cross-device sync (state lives in each browser's local storage).
