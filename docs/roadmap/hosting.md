# Hosting & Deployment — Options and Decision Guide

_Last updated: 2026-06-08_

> **Status (2026-06-08):** Roadmap step 1 is **done** — the app moved off shared GitHub Pages to
> **Cloudflare Pages** (isolated origin + real CSP header). A **thin serverless auth layer** (a
> "broker" variant of step 4) is also **done**: Google sign-in now runs through Cloudflare Pages
> Functions in [`functions/auth/`](../../functions/auth) using the OAuth Authorization Code flow.
> The Google **client secret** and the **refresh token** live server-side (the refresh token in an
> HttpOnly cookie); the browser still holds only a short-lived in-memory access token and calls the
> YouTube Data API directly. (A *full* BFF that also proxies the API and removes the in-browser
> access token + `localStorage` API key remains the next increment.) See the README's
> "Deploying to Cloudflare Pages" for setup.

This document captures the hosting options for **Digest** and the trade-offs between them.
It pairs with [`transcripts.md`](./transcripts.md) (which decides *how* transcripts are
fetched). Read this once to choose a deployment direction.

> Scope note: Digest is a lightweight personal SPA. Bandwidth/asset weight is **not** a
> consideration here — the decision is driven by **origin isolation**, **secret handling**,
> **HTTP headers**, and (if transcripts are automated) **where the backend can physically
> run**.

---

## 1. TL;DR

- The SPA itself is trivial to host — any static host works. The real decisions are
  **(a) origin isolation** between your apps and **(b) whether you run a backend, and if so,
  whether it's a home server or not.**
- **The transcript backend cannot be cloud-serverless.** YouTube blocks datacenter IPs and
  Whisper needs real compute, so automated transcripts effectively require a **home server**
  (see [`transcripts.md`](./transcripts.md) §2 and Option 6). Cloud functions only suit a
  *thin auth* backend, not transcripts.
- **Static host recommendation:** move off the shared `user.github.io` path onto a host that
  gives each app its **own origin** and **real HTTP headers** — Cloudflare Pages or Netlify.
- **If/when a home server lands:** expose it via **Tailscale** (private, your devices only)
  or **Cloudflare Tunnel + Access** (public, any device). That single choice hinges on
  whether you need the app to work off your tailnet.

---

## 2. The two independent decisions

Hosting Digest is really **two** choices that can be made separately:

| Axis | Question | Options |
|---|---|---|
| **A — Static site** | Where do the built SPA files live? | GitHub Pages · Cloudflare Pages · Netlify · (custom domain on any) |
| **B — Backend** | Is there a server, and where does it run? | None (current) · Non-home (serverless/third-party) · **Home server** |

Axis A is low-stakes and reversible. Axis B is the consequential one, because the transcript
feature constrains it hard.

---

## 3. Axis A — Static site hosting

The SPA is static files (`npm run build` → `dist/`). All hosts below serve that. They differ
on **origin isolation** and **HTTP header control**, which matter for security.

| Host | Per-app origin | Real HTTP headers | Backend functions | Cost | Maintenance |
|---|---|---|---|---|---|
| **GitHub Pages (current)** | ❌ shared `user.github.io` (path-based) | ❌ meta-tag CSP only | ❌ static only | Free | ~0 (Actions push-deploy) |
| GitHub Pages + custom subdomain | ✅ `app.you.dev` | ❌ still no headers | ❌ | ~$10–15/yr domain | low (DNS once) |
| **Cloudflare Pages** | ✅ `app.pages.dev` (free) | ✅ `_headers` file | ✅ Pages Functions | Free | ~0 (Git push-deploy) |
| **Netlify** | ✅ `app.netlify.app` (free) | ✅ `_headers` file | ✅ Netlify Functions | Free | ~0 (Git push-deploy) |

**Why move off plain GitHub Pages:** every project under `user.github.io` shares **one
origin**, so they share `localStorage` (incl. the API key) and the same OAuth authorized
origin. Path separation (`/digest/`) does **not** isolate origins — only a distinct host
does. GitHub Pages also can't serve custom response headers, so the CSP is stuck as a
`<meta>` tag (no `frame-ancestors`).

**Recommendation (Axis A):** **Cloudflare Pages or Netlify.** Each gives a free isolated
origin and real headers, with the same zero-maintenance push-to-deploy as Pages. A custom
domain is optional polish, not required. Remember to set `BASE_PATH: /` (not `/digest/`) —
the app sits at the root of its own subdomain, and SPA deep links should rewrite to
`index.html` (for example via `_redirects`).

---

## 4. Axis B — Backend scenarios

### Scenario 0 — No backend (current)
- **What works:** manual `.srt`/`.vtt` import + official `captions.download` (manual tracks
  only). See [`transcripts.md`](./transcripts.md) Options 1 & 5.
- **Cost / maintenance:** zero.
- **Concerns:** no automated transcripts; OAuth token lives in the browser (in-memory) and
  the API key in `localStorage` — mitigated by CSP + referrer/origin restrictions, not
  eliminated.
- **Verdict:** the right baseline; keep it as the fallback even after adding a backend.

### Scenario 1 — Non-home-server backend (serverless / third-party)
A cloud function or hosted transcript API instead of your own box.

- **What it can do:** a **thin auth/BFF** layer (move OAuth to the server-side code flow with
  httpOnly cookies — removes the in-browser token + the `localStorage` API key); or call a
  **third-party transcript API** ([`transcripts.md`](./transcripts.md) Option 3).
- **What it _cannot_ do:** reliably fetch transcripts itself. Cloud/datacenter IPs get
  `RequestBlocked`/PoToken-challenged by YouTube, and serverless time limits don't fit
  Whisper ([`transcripts.md`](./transcripts.md) §2, Option 2 verdict). Serverless also can't
  reach **private** videos.
- **Cost:** functions free-tier is plenty for thin auth. Third-party transcript APIs:
  free tier → ~$9–29/mo. A residential proxy to make cloud scraping work is ~$5–15/mo and
  still fragile — **not recommended**.
- **Maintenance:** low (managed platform). Third-party API = vendor dependency + key
  management.
- **Concerns:** public/unlisted videos only for transcripts; ongoing cost; ToS gray area for
  scraping APIs.
- **Verdict:** good for a **future thin auth backend** and/or quick public-video transcripts
  if you'd rather pay than self-host. **Not** a path to private/auto-caption transcripts.

### Scenario 2 — Home server (yt-dlp + Whisper) — the transcript-capable path
The only option that reaches **private** videos and **auto-generated** captions for free
(see [`transcripts.md`](./transcripts.md) Option 6).

- **What it does:** a small service on your home box exposes `GET /transcript?videoId=`
  (yt-dlp with your login cookies → Whisper fallback), and optionally `GET /recall?videoId=`
  to proxy the getrecall.ai `sk_` key so it never reaches the browser.
- **Why only this works:** **residential IP** avoids cloud-IP blocking; **login cookies**
  reach private videos; **local compute** runs Whisper without time limits.
- **Exposure (pick one):**

  | Method | Reachable from | Security | Setup |
  |---|---|---|---|
  | **Tailscale** | only devices on your tailnet | highest (no public surface) | easiest/safest |
  | **Cloudflare Tunnel + Access** | any browser, anywhere | strong (Zero-Trust in front) | moderate |

  → **Decision driver:** do you need Digest to fetch transcripts from a device **not** on
  your tailnet? Yes → Cloudflare Tunnel + Access. No → Tailscale.

- **Cost:** hardware + electricity only. Tailscale free (personal), Cloudflare Tunnel +
  Access free at this scale. Self-hosted Whisper is free; OpenAI `whisper-1` ≈ $0.006/min if
  you'd rather not run it locally.
- **Maintenance (the real cost):**
  - **yt-dlp breaks often** when YouTube changes — expect periodic `pip install -U yt-dlp`.
  - **Cookies expire** — refresh them periodically for private-video access.
  - **Uptime is on you** — the app's transcript feature is down when the box is.
  - **Patching** — keep the OS, the endpoint auth, and the tunnel/agent updated.
- **Concerns:** home-network exposure (mitigated by Tunnel+Access or Tailscale, not raw port
  forwarding); secret handling (endpoint auth + the Recall key); ToS is defensible for your
  own content + your own session — keep it personal.
- **Verdict:** **best long-term transcript option**, at the price of ongoing self-host
  maintenance.

---

## 5. How the axes combine (recommended pairings)

| You want… | Static (A) | Backend (B) |
|---|---|---|
| Simplest, no automation | Cloudflare Pages / Netlify | None (Scenario 0) |
| Automated transcripts, only on your own devices | Cloudflare Pages / Netlify | Home server + **Tailscale** |
| Automated transcripts, usable anywhere | **Cloudflare Pages** | Home server + **Cloudflare Tunnel + Access** |
| Public-video transcripts without self-hosting | Cloudflare Pages / Netlify | Non-home: third-party API (Scenario 1) |
| Stronger auth posture (BFF) later | Cloudflare Pages / Netlify | Thin serverless auth **or** colocate on home server |

**Note on "Cloudflare end-to-end":** if you go the public-reachable home-server route,
keeping **Pages + Tunnel + Access in one Cloudflare account** is the cleanest fit — isolated
SPA origin, real CSP headers, a *stable* HTTPS origin for the home API (simplifies CORS), and
Zero-Trust auth guarding the secret-bearing `/transcript` and `/recall` endpoints. This is
attractive for the **Tunnel**, not the functions — transcripts still run on the home box.

---

## 6. Cross-cutting concerns

- **Stable, distinct origins** matter for three things at once: the CSP `connect-src`
  allowlist, the home server's CORS allowlist, and per-app OAuth authorized origins. The
  current `user.github.io/digest/` path setup is the worst case for all three; a per-app
  subdomain fixes it.
- **Secret handling:** OAuth tokens are short-lived and scoped (lower risk). The Recall `sk_`
  key is broad — never ship it client-side in a deployed build; proxy it via the home server
  (see [`transcripts.md`](./transcripts.md) §7).
- **CSP strength scales with the host:** meta-tag only on GitHub Pages; full header (incl.
  `frame-ancestors`) on Cloudflare Pages / Netlify via `_headers`.
- **CORS:** any automated transcript path that isn't the home server still needs a server in
  front of YouTube's no-CORS endpoints — another reason the home server (with a CORS
  allowlist for the app origin) is the durable answer.

---

## 7. Decision guide

```
Do you need automated transcripts (auto-captions / private videos)?
├─ No ──► Static: Cloudflare Pages or Netlify. Backend: none (Scenario 0).
│         (Move off shared github.io for origin isolation + real CSP headers.)
└─ Yes ─► Home server (Scenario 2) — it's the only path to private/auto-caption transcripts.
          Expose it:
          ├─ Only need it on your own devices ─► Tailscale
          └─ Need it from anywhere/any device ─► Cloudflare Tunnel + Access
                                                 (then Cloudflare Pages pairs cleanly)

Want a stronger auth posture (no token/key in the browser)?
   ──► Add a thin BFF: serverless function (always-on) or colocate on the home server.
```

---

## 8. Recommended roadmap

1. **Now:** migrate the SPA off shared GitHub Pages to **Cloudflare Pages or Netlify** for an
   isolated origin + real CSP header (set `BASE_PATH: /`). Keep Scenario 0 (manual import).
2. **When you want automation:** stand up the **home server** from
   [`transcripts.md`](./transcripts.md) Option 6; choose **Tailscale vs Cloudflare Tunnel +
   Access** by the off-tailnet question.
3. **Alongside:** proxy the Recall `sk_` key through the same home server; add the home-API
   origin to the CSP `connect-src` and the server's CORS allowlist.
4. **Later (optional):** a thin BFF auth layer to remove the in-browser token + API key.
