# Transcripts & Summaries — Options and Decision Guide

_Last updated: 2026-06-06_

This document captures **every option** we have evaluated for adding transcripts (and AI
summaries) to **Digest**, with costs, implementation details, trade-offs, and a decision
guide. It is meant to be read once and used to choose a direction.

---

## 1. TL;DR

- **The official YouTube API cannot fetch auto-generated captions** — even for videos you
  own. This is a hard restriction, not a bug, and it's why the in-app "Load transcript"
  button fails for typical lecture videos.
- **What already works today:** **manual `.srt`/`.vtt` import** (in the Transcript tab) and
  the official API path **only when a video has a *manually uploaded* caption track**.
- **The single best long-term option for this use case is a home server running `yt-dlp`
  (+ Whisper as fallback).** It is free, reaches **private** videos (via your login
  cookies), and avoids the cloud-IP blocking that breaks hosted scrapers — because it runs
  on a **residential IP**.
- **getrecall.ai** is a **complementary summary source** (not a full transcript): its new
  read-only API can surface the summaries you already generate, ideally behind the same home
  server to protect the key.
- The app already has a **provider seam** (`getTranscript` in
  [`src/lib/transcript.ts`](../src/lib/transcript.ts)) so any of these slot in **without UI
  changes**.

**Recommended path:** Manual import now → home-server `yt-dlp`/Whisper provider when the
server is up → optional Recall "Summary" tab alongside it.

---

## 2. Why this is hard (the core constraint)

| Layer | Constraint |
|---|---|
| **Official `captions.download`** | Returns text **only** for caption tracks uploaded via the API (`captions.insert`) or where the owner enabled third-party contributions. **Auto-generated (ASR) tracks return `403`** even for the owner. |
| **Browser CORS** | YouTube's caption/timedtext endpoints send **no `Access-Control-Allow-Origin`** header, so the browser blocks direct fetches. Any scraping must go through a server. |
| **Cloud-IP blocking** | YouTube increasingly blocks **datacenter IPs** (Vercel/Cloudflare/AWS) with `RequestBlocked` / PoToken challenges. Scrapers that work on a laptop fail when hosted. |
| **Private videos** | Unofficial scrapers and third-party APIs can only reach **public/unlisted** videos. **Private** videos require authenticated access (owner OAuth, or login cookies). |

These four constraints, taken together, are what make each option viable or not.

---

## 3. The options in detail

### Option 1 — Official YouTube Data API (`captions.download`)
- **What it does:** `captions.list` → pick track → `captions.download` (VTT).
- **Auth:** OAuth, scope `youtube.force-ssl`, **owner only**.
- **Cost:** Free quota — **50 + 200 = 250 units/video** (default 10,000/day ≈ ~40 videos/day).
- **Reaches private videos?** Yes (you're the owner).
- **Reaches auto-captions?** **No** — the dealbreaker.
- **CORS:** May also be blocked from the browser; secondary concern given the 403.
- **ToS:** Fully sanctioned.
- **Status in app:** Implemented; only succeeds when a *manually uploaded* track exists.
- **Verdict:** Keep as a "use it if a real caption track exists" path; **not** a general
  solution.

### Option 2 — Unofficial scrape behind your own cloud proxy
- **What it does:** A serverless function runs `youtube-transcript` /
  `youtube-caption-extractor` against YouTube's timedtext/InnerTube; the frontend calls it.
- **Cost:** Hosting free-tier; **but** reliability often needs a **paid residential/mobile
  proxy (~$5–15/mo minimum plans)** because cloud IPs get blocked. Bandwidth is negligible.
- **Reaches private videos?** **No** (public/unlisted only).
- **Reaches auto-captions?** Yes.
- **Reliability:** Fragile — breaks when YouTube changes InnerTube/PoToken.
- **ToS:** Gray area.
- **Where it runs:** **Not** GitHub Pages (static only) — separate deploy; CORS must allow
  the app origin.
- **Verdict:** Superseded by the **home server** (Option 6), which solves the IP-blocking
  problem for free. Only choose this if you can't self-host.

### Option 3 — Third-party transcript API (e.g. Supadata, others)
- **What it does:** Call a hosted service with an API key; many are **CORS-enabled** so
  callable **directly from the browser** (no backend).
- **Cost:** Free tier (~100/mo typical) → **~$9–29/mo** or fractions of a cent per
  transcript. _Verify current pricing — it changes._
- **Reaches private videos?** **No.**
- **Reaches auto-captions?** Yes.
- **Reliability:** High (they manage proxies/PoToken).
- **ToS:** Gray area (offloaded to the vendor).
- **Concerns:** Ongoing cost; third-party dependency; key management.
- **Verdict:** Lowest-effort automation **if** your videos are public/unlisted and you'd
  rather pay than self-host.

### Option 4 — Self-transcribe with ASR (Whisper / Deepgram / AssemblyAI)
- **What it does:** Feed **audio you can access** to a speech-to-text model; get timestamped
  text.
- **Cost (approx — verify):**
  - OpenAI `whisper-1`: **$0.006/min ≈ $0.36 per 1-hour lecture**.
  - Deepgram / AssemblyAI: **~$0.10–0.25 per hour**.
  - Self-hosted `whisper.cpp` / `faster-whisper`: **free** (your compute/time).
- **Reaches private videos?** **Yes** — you supply the audio.
- **Reaches auto-captions?** N/A — you *generate* the transcript, so it works even when **no
  captions exist at all**.
- **Quality:** Excellent, with timestamps.
- **ToS:** Clean for your own content.
- **Verdict:** Best **quality** and the universal fallback; pairs naturally with the home
  server (Option 6) where you'd run it self-hosted for free.

### Option 5 — Manual import (`.srt` / `.vtt`) — **implemented**
- **What it does:** Download a transcript from **YouTube Studio → Subtitles** and upload it
  in the Transcript tab. Parser handles **VTT and SRT**
  ([`src/lib/captions.ts`](../src/lib/captions.ts)).
- **Cost:** Free. **No backend, no OAuth.**
- **Reaches private videos?** **Yes** (you're the owner in Studio).
- **Reaches auto-captions?** **Yes** (Studio lets owners export the auto track).
- **Concerns:** Manual, per-video effort.
- **Verdict:** Reliable zero-infra baseline; **already shipped**. Good complement to any
  automated option.

### Option 6 — Home server (`yt-dlp` + Whisper) — **recommended**
The self-hosted route that resolves the constraints from §2.

- **What it does:** A small service on your home box exposes
  `GET /transcript?videoId=` that:
  1. runs `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs en --sub-format
     vtt --cookies cookies.txt <url>` to fetch **manual *and* auto** captions, then
  2. falls back to **`faster-whisper` / `whisper.cpp`** on `yt-dlp -f bestaudio` when no
     captions exist,
  3. parses to `{ startSec, text }[]` and returns JSON.
- **Why it's superior here:**
  - **Residential IP** → avoids the cloud-IP `RequestBlocked` problem for free.
  - **`--cookies` (your YouTube login)** → reaches **your private lectures**.
  - **Free** (your hardware), **highest coverage** (captions *or* ASR), **ToS-defensible**
    (your own content + your session).
- **Cost:** Hardware/electricity only; software is free/open-source.
- **Reaching it from the app:** Expose via **Tailscale** (private mesh, simplest/safest) or
  **Cloudflare Tunnel** (public HTTPS). Add a **server base URL + shared secret** in Settings;
  CORS allows the app origin.
- **Concerns:** You run/maintain it; cookies must be refreshed periodically; keep the
  endpoint authenticated so only you can call it.
- **How it plugs in:** Implement `ProxyTranscriptProvider` against this endpoint;
  `getTranscript` falls back to it when the official route returns `unavailable`. **No UI
  change.**
- **Verdict:** **Best long-term option** for private, auto-captioned lecture content.

### Option 7 — getrecall.ai (summaries; complementary)
**Disambiguation:** this is **getrecall.ai — "Recall, your AI knowledge base"** (summarizes
YouTube videos/articles into cards), **not** Recall.ai the meeting-bot API.

- **What it provides:** The **summaries you already generate** in Recall — a *summary*, "a
  transcript of sorts," **not** guaranteed verbatim transcript text.
- **API** ([docs](https://docs.recall.it/developer/api)):
  - **Base:** `https://backend.getrecall.ai/api/v1` · **Auth:** `Authorization: Bearer sk_…`
    (key from **Settings → API & MCP**; up to 10 keys; shown once).
  - `GET /cards` — filter by **`source_url` substring** (match the YouTube video id), tags,
    date range.
  - `GET /cards/{card_id}` — content `chunks` (`focus_query`, `max_chunks` 1–50).
  - `GET /search` — semantic search (focused/exhaustive).
  - Also an **MCP server** and **bulk markdown export**.
- **Card shape:** `id`, `title`, `created_at`, `source_url`,
  `chunks[{ chunk_id, content, source, timestamps }]`. The optional **`timestamps`** allow
  **click-to-seek** on summary points.
- **Integration pattern:** For the current video, `GET /cards?source_url=<videoId>` → fetch
  the card → render `chunks` in a new **"Summary" tab** next to Queue/Transcript.
- **Cost:** Whatever your Recall plan is; the API itself adds no per-call fee documented.
- **Concerns:**
  - **Key sensitivity:** the `sk_` key grants read access to your **entire** knowledge base
    — fine for **local** use, but **do not ship it in the deployed build**. Prefer a home
    server `/recall?videoId=` proxy that hides the key and sidesteps any **CORS** limits.
  - **Coverage:** only videos you've actually saved to Recall have cards.
  - **Not a transcript:** treat as the **summary/notes** source; pair with Options 5/6 for
    full transcripts.
- **Verdict:** Valuable **summary** layer, best surfaced via the home-server proxy.

---

## 4. Comparison matrix

| # | Option | Auto-captions | Private videos | No captions at all | Backend | Approx cost | Reliability | ToS |
|---|---|---|---|---|---|---|---|---|
| 1 | Official `captions.download` | ❌ | ✅ owner | ❌ | No | Free (250 u/video) | High (when applicable) | ✅ |
| 2 | Unofficial scrape (cloud proxy) | ✅ | ❌ | ❌ | **Yes** | Host free + ~$5–15/mo proxy | Low–Med | ⚠️ |
| 3 | Third-party API | ✅ | ❌ | ❌ | No (key) | Free→~$9–29/mo | High | ⚠️ |
| 4 | Self-transcribe (ASR) | ✅ (generated) | ✅ | ✅ | **Yes** | ~$0.10–0.40/hr (or free self-host) | High | ✅ |
| 5 | **Manual import (shipped)** | ✅ | ✅ | ❌ (needs a track) | No | Free | High | ✅ |
| 6 | **Home server (yt-dlp + Whisper)** | ✅ | ✅ (cookies) | ✅ (Whisper) | **Yes (self)** | Hardware only | High (residential IP) | ✅* |
| 7 | getrecall.ai (summaries) | n/a (summary) | ✅ (if saved) | n/a | No / proxy | Recall plan | High | ✅ |

\* Using your own session/cookies for your own content; keep it personal.

---

## 5. Cross-cutting considerations

- **Is the content public, unlisted, or private?** The single biggest factor.
  - Public/unlisted → Options 2/3 reach it.
  - Private → only Options 1 (manual track), 4, 5, 6 reach it.
- **CORS:** Anything hitting YouTube/timedtext directly needs a server. Third-party APIs and
  the official `captions.list` (JSON) are usually browser-OK; `captions.download` and Recall
  are uncertain — a proxy removes the question.
- **Key/secret security:** OAuth tokens are short-lived and scoped; the **Recall `sk_` key is
  broad** — don't ship it client-side in a public deploy.
- **Quota:** Only the official API consumes YouTube quota (250 u/video). yt-dlp/Whisper/Recall
  do not.
- **Reliability vs. effort:** Self-host (6) trades a bit of setup for the most durable,
  lowest-cost, highest-coverage result.
- **ToS:** Official (1) and your-own-content routes (4/5/6) are clean; scraping (2/3) is gray.

---

## 6. How each plugs into the app

The provider seam already exists in [`src/lib/transcript.ts`](../src/lib/transcript.ts):

```ts
getTranscript(video, token)   // tries officialProvider today
// → fall through to ProxyTranscriptProvider for Options 2/3/6
//   (a fetch to your endpoint or a third-party API, returning the same TranscriptResult)
```

- **Transcript providers (Options 2/3/6):** implement `ProxyTranscriptProvider.fetch()`
  returning `TranscriptResult`; no UI change. A **server base URL + secret** setting is the
  only new config.
- **Manual import (Option 5):** already wired via `parseCaptionFile` →
  `cacheTranscript(..., source: 'manual')`.
- **Recall summaries (Option 7):** a **new "Summary" tab** + a small `getSummary(video)`
  reader (direct or proxied), cached like transcripts.

---

## 7. Decision guide

```
Are the videos private?
├─ Yes ──► Do you want zero infra?
│          ├─ Yes ─► Option 5 (manual import)   [shipped]
│          └─ No  ─► Option 6 (home server: yt-dlp + Whisper)   ★ recommended
└─ No (public/unlisted) ──► Want to self-host?
            ├─ Yes ─► Option 6 (home server)     ★ recommended
            └─ No  ─► Option 3 (third-party API, browser-callable)

Want AI summaries (not just transcripts)?  ──► Option 7 (getrecall.ai), ideally via the
                                               home-server proxy.
No captions exist for a video at all?      ──► Option 4 / Option 6's Whisper fallback.
```

---

## 8. Recommended roadmap

1. **Now (done):** Option 5 — manual `.srt`/`.vtt` import. Covers everything, including
   private, at zero cost.
2. **Frontend-ready step (no server needed yet):** add `ProxyTranscriptProvider` + a
   "Transcript server URL / secret" setting, so the app is ready to point at the home server.
3. **When the home server lands:** stand up `GET /transcript?videoId=` (yt-dlp + Whisper
   fallback). This becomes the **primary** transcript path — free, private-capable, reliable.
4. **Alongside:** add a `/recall?videoId=` proxy on the same server and a **Summary tab** to
   surface getrecall.ai summaries (with click-to-seek where `timestamps` exist).

---

## 9. Current implementation status

| Capability | Status |
|---|---|
| On-screen captions auto-enabled (`cc_load_policy`) | ✅ Shipped |
| Official transcript (owned, manual tracks) | ✅ Shipped (limited by §2) |
| Manual `.srt`/`.vtt` import | ✅ Shipped |
| Multi-select "Import from my channel" (incl. private) | ✅ Shipped |
| `ProxyTranscriptProvider` (Options 2/3/6) | ⬜ Seam stubbed, not built |
| Home-server `/transcript` endpoint | ⬜ Not built |
| getrecall.ai "Summary" tab | ⬜ Not built |

---

## 10. References

- YouTube `captions.download` (owner-only; ASR not downloadable):
  <https://developers.google.com/youtube/v3/docs/captions/download>
- Quota costs: <https://developers.google.com/youtube/v3/determine_quota_cost>
- `captions.download` 403 behavior (third-party/ASR):
  <https://medium.com/@cafraser/how-to-download-public-youtube-captions-in-xml-b4041a0f9352>
- CORS on YouTube caption/timedtext endpoints:
  <https://github.com/algolia/youtube-captions-scraper/issues/2>
- Cloud-IP blocking / residential proxies needed:
  <https://github.com/jdepoix/youtube-transcript-api/issues/593>
- `yt-dlp` (subtitles, `--cookies` for private):
  <https://github.com/yt-dlp/yt-dlp> ·
  <https://forum.videohelp.com/threads/414600-How-to-get-subtitles-when-downloading-using-yt-dlp>
- getrecall.ai API: <https://docs.recall.it/developer/api>
- OpenAI Whisper API pricing: <https://platform.openai.com/docs/pricing>
- (Disambiguation) Recall.ai meeting-bot API: <https://www.recall.ai/>
