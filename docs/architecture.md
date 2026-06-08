# How Digest works — dev, cloud, and the security model

_Last updated: 2026-06-08_

> A holistic walkthrough of the whole system: the frontend SPA, the Cloudflare Pages
> Functions backend, how Google sign-in and the YouTube API key actually flow, and **what
> differs between local dev and the deployed cloud setup**. Web-security and Cloudflare
> concepts are explained inline as they come up.
>
> This is also the canonical security walkthrough now: the posture, tradeoffs, and residual
> caveats are folded in here so there's one document to read end-to-end. For deployment options
> and future hosting directions, see [`roadmap/hosting.md`](./roadmap/hosting.md).

---

## 1. The big picture

Digest is a React SPA plus a **thin server-side broker**. The browser never holds a Google
client secret, refresh token, or raw API key — those live server-side. The only credential
that ever reaches page JavaScript is a **short-lived OAuth access token**, kept in memory.

```
                         ┌──────────────────────────────────────────────┐
                         │            ONE ORIGIN (same host)             │
                         │   dev:  http://localhost:8788                 │
                         │   prod: https://<project>.pages.dev           │
                         ├───────────────────────┬──────────────────────┤
   Browser (SPA)         │   Static assets       │   Pages Functions     │
   ───────────────       │   (dist/, the SPA)    │   (functions/)        │
   • access token        │                       │                       │
     in memory           │   index.html, JS,     │   /auth/login         │──┐
   • localStorage:       │   CSS, icons, SW      │   /auth/callback      │  │  Google
     lists, progress,    │                       │   /auth/refresh       │  ├─► OAuth +
     "hasSignedIn",      │                       │   /auth/logout        │  │  YouTube
     "apiKeyConfigured"  │                       │   /api/key            │  │  Data API
                         │                       │   /api/youtube/*      │──┘
                         │                       │                       │
                         │                       │   HttpOnly cookies:   │
                         │                       │   • digest_rt (/auth) │
                         │                       │   • digest_yt_key     │
                         │                       │       (/api)          │
                         └───────────────────────┴──────────────────────┘
```

The single most important architectural fact: **everything is same-origin**. The SPA, the
auth endpoints, and the YouTube proxy all answer on one host. That is what lets the secrets
live in `HttpOnly` cookies the page can't read, keeps the CSP `connect-src` at `'self'`, and
removes the need for any CORS configuration.

### The four moving parts

| Part | Where it lives | What it holds |
|---|---|---|
| **SPA** | [`src/`](../src) → built to `dist/` | UI, in-memory access token, local library (lists/progress) |
| **Pages Functions** | [`functions/`](../functions) | Google client secret, code/token exchange, the YouTube proxy |
| **Google Cloud project** | console.cloud.google.com | OAuth client (id+secret), the YouTube Data API, your API key |
| **Browser storage** | `localStorage` + cookies | Non-secret app state in LS; the real secrets in HttpOnly cookies |

---

## 2. The backend: Cloudflare Pages Functions

Cloudflare Pages auto-compiles the [`functions/`](../functions) directory into **Pages
Functions** served on the same origin as the static site. File path = route:
`functions/auth/login.ts` → `/auth/login`. Directories/files starting with `_` (like
[`functions/_lib/`](../functions/_lib)) are **not** routed — they're shared helper modules.

There are two groups:

- **`/auth/*`** — the OAuth broker ([`functions/auth/`](../functions/auth))
- **`/api/*`** — the YouTube Data API proxy + key management ([`functions/api/`](../functions/api))

Functions run on Cloudflare's Workers runtime (V8 isolates, Web-standard APIs — `fetch`,
`crypto.subtle`, `Request`/`Response`). There is no Node.js; that's why
[`functions/_lib/google.ts`](../functions/_lib/google.ts) does PKCE with `crypto.getRandomValues`
and `crypto.subtle.digest` rather than a Node crypto import.

### 2.1 OAuth sign-in flow (Authorization Code + PKCE, brokered)

This is the recommended path. It unlocks the signed-in account's **private** playlists and
needs no API key. The flow:

```
SPA                       /auth/login          Google           /auth/callback        SPA
 │  window.open popup ───────►│                                                          │
 │                            │ set state + verifier cookies                             │
 │                            │ 302 → Google consent ──►│                                │
 │                            │                         │ user approves                  │
 │                            │                         │ 302 → /auth/callback?code ───► │
 │                            │                                    │ verify state        │
 │                            │                                    │ exchange code +     │
 │                            │                                    │   secret + verifier │
 │                            │                                    │   for tokens ──►Google
 │                            │                                    │ set digest_rt cookie│
 │  ◄── postMessage(access_token) to opener, popup closes ─────────┤                     │
 │  store access token in memory ◄─────────────────────────────────────────────────────┘
```

Step by step:

1. **[`/auth/login`](../functions/auth/login.ts)** generates a random `state` and a PKCE
   `verifier`, stashes both in short-lived (`Max-Age=600`) `HttpOnly` cookies, computes the
   S256 `code_challenge`, and 302-redirects the popup to Google's consent screen. It requests
   `access_type=offline` + `prompt=consent` so Google returns a **refresh token**, and the
   narrow `youtube.readonly` scope.
2. **[`/auth/callback`](../functions/auth/callback.ts)** is where Google sends the user back
   with `?code&state`. It checks the returned `state` equals the cookie (CSRF defense),
   exchanges the code — together with the **client secret** and the PKCE **verifier** — for
   tokens at Google's token endpoint, stores the **refresh token** in the `digest_rt`
   `HttpOnly` cookie scoped to `/auth`, and hands the **access token** back to the SPA via
   `postMessage` (see [`popupResponse`](../functions/_lib/google.ts)).
3. The SPA's [`openAuthPopup`](../src/lib/oauth.ts) listens for that message, verifies
   `event.origin === window.location.origin`, and stores the access token **in memory only**.
4. **[`/auth/refresh`](../functions/auth/refresh.ts)** (POST) mints a new access token from the
   refresh cookie. The SPA calls this silently on load and a minute before expiry
   ([`getValidToken`](../src/lib/oauth.ts)). A `401` means "no live session → prompt sign-in."
5. **[`/auth/logout`](../functions/auth/logout.ts)** (POST) best-effort revokes the refresh
   token at Google, then clears the cookie.

**Why PKCE *and* a client secret?** This is a confidential (server-side) client, so the
secret already authenticates the code exchange. PKCE is belt-and-suspenders: it binds the
authorization code to the specific request that started the flow, so a leaked/intercepted
`code` is useless without the matching verifier. Cheap to add, strictly better.

### 2.2 The API-key path (no sign-in)

A fallback for browsing **public/unlisted** content without a Google account. The user pastes
*their own* YouTube Data API key once:

- **[`POST /api/key`](../functions/api/key.ts)** validates the key with a 1-unit probe call to
  the Data API (this also catches the common mistake of an HTTP-referrer-restricted key, which
  fails server-side), then stores it in the `digest_yt_key` `HttpOnly` cookie scoped to `/api`,
  `SameSite=Strict`.
- **`GET /api/key`** returns only `{ configured: boolean }` — the value is never sent back to
  the browser.
- **`DELETE /api/key`** clears it.

The key is server-restricted to *YouTube Data API v3* (an **API restriction**, not a referrer
restriction), because it's now used server-side where there is no browser `Referer`.

### 2.3 The YouTube data proxy

Every Data API call goes through [`/api/youtube/<resource>`](../functions/api/youtube/[[path]].ts)
(`[[path]]` is a catch-all route). The browser sends **no credential in the URL**; the proxy
adds it server-side:

- If the request carries an `Authorization: Bearer <access token>` header → forward it
  (signed-in user, reaches private content).
- Otherwise → inject the stored API-key cookie (public/unlisted only).
- If neither → `401 no_credentials`.

It's a **deliberately narrow allowlist** (`playlists`, `playlistItems`, `videos`, GET only) so
it can't be abused as an open proxy, and it strips any client-supplied `key` param before
forwarding. The upstream body/status pass through unchanged so the SPA still sees Google's
error messages.

---

## 3. Browser-side state

[`src/store/useStore.ts`](../src/store/useStore.ts) (Zustand + `persist`) holds the app's
library. Two rules matter for security:

- **`partialize` drops `accessToken`** — it's in-memory only, never written to `localStorage`.
  A localStorage dump contains no live credential.
- Only **non-secret flags** are persisted: `hasSignedIn` (so we can attempt a silent refresh
  after reload) and `apiKeyConfigured` (UI hints). Both are *advisory* — the server cookie is the
  source of truth, and the SPA reconciles on load ([`refreshApiKeyStatus`](../src/lib/apiKey.ts),
  [`getValidToken`](../src/lib/oauth.ts) in [`App.tsx`](../src/App.tsx)). A store migration
  (`version: 3`) deletes the old `apiKey`/`oauthClientId` values from any returning user's
  localStorage.

**Onboarding gate.** [`App.tsx`](../src/App.tsx) shows the sign-in / API-key onboarding screen
([`ApiKeyGate`](../src/components/ApiKeyGate.tsx)) **only when the library is empty and there's no
live session or key** (`ready = hasSignedIn || apiKeyConfigured || playlists.length > 0`).
Credentials are needed *only to import* playlists ([`AddBar`](../src/components/AddBar.tsx)) — once
imported, the playlists, videos, and progress live in localStorage and the [`Watch`](../src/pages/Watch.tsx)
player is a plain IFrame embed, so viewing needs no credentials at all. A returning user therefore
lands straight in their library even with an expired session (offline-friendly); they only need to
re-authenticate, from **Settings**, to import more.

---

## 4. Local development

There are **two** npm scripts, and the difference is just **whether the Functions run**.

| Script | What runs | Origin | Functions (`/auth`, `/api`)? |
|---|---|---|---|
| `npm run dev` | Vite only | `http://localhost:5174` | ❌ no — sign-in & data calls fail |
| `npm run dev:pages` | wrangler + Vite | `http://localhost:8788` | ✅ yes — full stack |

Both serve over **plain HTTP** on `localhost`. That's deliberately simple: `localhost` is a
browser-trusted [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts),
so the `Secure` `HttpOnly` cookies are still sent over `http`, and no local TLS / mkcert setup is
needed. (We evaluated HTTPS-in-dev; see [§8.1](#81-csp-is-production-only).)

### 4.1 `npm run dev` — frontend only

Standalone Vite on port 5174. Useful for pure UI work, but **sign-in and YouTube calls won't
work** (no Functions). The SPA tolerates this: [`refreshApiKeyStatus`](../src/lib/apiKey.ts)
swallows the failed `/api/key` fetch and keeps the last-known state instead of forcing the
onboarding gate. The onboarding UI can still render in this mode, but its actions won't complete:
`/auth/*` and `/api/*` are just SPA paths here, not real backend endpoints. For any sign-in,
API-key, or import-path testing, use `npm run dev:pages`.

### 4.2 `npm run dev:pages` — the real full-stack dev

This is the one that mirrors production. It runs:

```
wrangler pages dev --proxy 5174 -- npm run dev
```

What's happening:

- **`wrangler pages dev`** boots Cloudflare's local Workers runtime (workerd/miniflare),
  compiles `functions/` into local Pages Functions, and serves everything on **one origin**,
  `http://localhost:8788`. This is what makes `/auth/*` and `/api/*` exist locally.
- **`--proxy 5174`** tells wrangler to proxy all non-Function requests to the Vite dev server
  (so you keep hot-module-reload for the SPA). Vite is started as the `-- npm run dev` child.
- **`.dev.vars`** (copy of [`.dev.vars.example`](../.dev.vars.example), gitignored) supplies
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to the local Functions automatically.

For sign-in to work locally you must add `http://localhost:8788/auth/callback` to the OAuth
client's **Authorized redirect URIs** in Google Cloud.

### 4.3 Why two ports / why the proxy dance

The port choreography is load-bearing:

- Vite uses `strictPort: true` on 5174 so it can't silently drift to 5175 — wrangler proxies to
  that **exact** port.
- wrangler serves 8788, the origin you actually open. Everything (SPA + Functions) appears
  same-origin there, which is what the cookies and CSP assume.

---

## 5. Cloud deployment (Cloudflare Pages)

The deployed setup is the **same code** as `dev:pages`, but the runtime, secrets, and TLS come
from Cloudflare instead of your laptop.

### 5.1 How it's wired

1. **Connect the Git repo** to a Cloudflare Pages project (Workers & Pages → Create → Pages →
   Connect to Git). Every push to `main` builds and deploys; other branches get preview
   deployments.
2. **Build:** `npm run build` (`tsc -b && vite build`) → `dist/`. Cloudflare compiles
   `functions/` automatically alongside it.
3. **Secrets:** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set as encrypted variables on
   the Pages project (Settings → Variables and secrets). The frontend needs **no** env vars.
   **Optional:** `RECALL_API_KEY` enables the getrecall.ai **Summary** tab — it's injected by the
   `/api/recall/*` proxy and never reaches the browser; leave it unset to hide the tab.
4. **TLS + origin:** Cloudflare serves `https://<project>.pages.dev` (or your custom domain)
   with its own certificate. Add `https://<project>.pages.dev/auth/callback` to the OAuth
   client's redirect URIs.

> Note on [`wrangler.jsonc`](../wrangler.jsonc): it intentionally does **not** set
> `pages_build_output_dir`. That key conflicts with `wrangler pages dev --proxy` in wrangler v4,
> so `dist` is passed explicitly to `wrangler pages deploy dist` (the `deploy` script) instead.

### 5.2 Two static files that ship with the build

- **`dist/_headers`** — emitted from [`csp.ts`](../csp.ts) at build time (the `emitHeaders`
  Vite plugin). Cloudflare Pages reads this file and applies the **real CSP response header**
  plus the other security headers to every response. This is the production-grade CSP that
  includes `frame-ancestors 'none'`.
- **`public/_redirects`** — `/* /index.html 200`, the SPA fallback so deep links / refreshes
  on client-side routes don't 404. Cloudflare serves real files first, so this only catches
  unmatched paths.

---

## 6. Dev vs. cloud: what actually differs

The application code is identical. Only the *environment* changes:

| Concern | Local `dev:pages` | Cloudflare Pages (prod) |
|---|---|---|
| Functions runtime | workerd/miniflare on your machine | Cloudflare edge |
| Origin | `http://localhost:8788` | `https://<project>.pages.dev` |
| TLS | none — plain HTTP on `localhost` (a secure context) | Cloudflare-managed cert |
| Static serving | proxied to live Vite (HMR) | prebuilt `dist/` (immutable, CDN-cached) |
| OAuth secrets | `.dev.vars` file | encrypted Pages project secrets |
| CSP | **none** — not enforced in the Vite dev server | `<meta>` tag (strict) **plus** the `_headers` response header (`frame-ancestors`) |
| Service worker / PWA | inactive in dev | active (`npm run preview` to test it) |
| OAuth redirect URI | `http://localhost:8788/auth/callback` | `.../<project>.pages.dev/auth/callback` |

The easy-to-miss gap: **the entire CSP is production-only**. The `<meta>` tag is injected only at
build time and `_headers` is applied only by Cloudflare, so locally there's no CSP at all (see
[§8.1](#81-csp-is-production-only)). To exercise the real policy — including `frame-ancestors` and
that no resource is blocked — run `npm run build && npm run preview` (the `<meta>` CSP) or check the
deployed site (the full header).

---

## 7. The web-security model, holistically

Pulling the threads together — why each defense is here:

- **Same-origin everything.** No CORS to configure, and the `connect-src 'self'` CSP is enough
  for the SPA to reach its own `/auth` and `/api`. Moving off shared `user.github.io` to a
  dedicated origin also isolates this app's `localStorage` from any other app.
- **Secrets never reach the browser.** Client secret + refresh token live only in the
  Functions / `digest_rt` cookie; the API key lives only in the `digest_yt_key` cookie. The
  page can read **neither** — both are `HttpOnly`.
- **Cookie scoping is the access-control mechanism.** `digest_rt` is scoped to `/auth` and
  `digest_yt_key` to `/api`, so each cookie is sent only to the endpoints that need it and
  never to the SPA routes. All cookies are `Secure` + `HttpOnly`.
- **CSRF defense without tokens.** `SameSite` cookies (`Lax` for auth, `Strict` for the key)
  mean the browser won't attach them to cross-site requests, so a malicious page can't drive
  these endpoints with your session. The `/api` Functions additionally reject requests whose
  `Sec-Fetch-Site` header (browser-set, unforgeable by page JS) marks them cross-site
  ([`isCrossSite`](../functions/_lib/http.ts)), and require a JSON content-type on POST so a
  cross-site HTML form can't post without triggering a (rejected) CORS preflight.
- **OAuth state + PKCE.** `state` prevents CSRF on the callback; PKCE binds the code to the
  initiating request. Both transient cookies expire in 10 minutes and are cleared on callback.
- **Popup `postMessage` is origin-checked** on both ends — the callback posts to a specific
  `targetOrigin`, and the SPA verifies `event.origin`.
- **Access token is short-lived and in-memory.** Worst case if page JS is compromised: an
  attacker gets a token that expires in ~an hour and only grants `youtube.readonly`. The
  long-lived refresh token stays out of reach.
- **The proxy is an allowlist, not a relay.** Fixed resource set, GET-only, client `key`
  stripped — it can't be repurposed to hit arbitrary Google endpoints.
- **Two CSPs.** The app shell's policy lives once in [`csp.ts`](../csp.ts) (injected as a
  `<meta>` tag at build time and emitted as a real header for prod; **not enforced in dev** — see
  [§8.1](#81-csp-is-production-only)). The OAuth popup has its own **stricter** inline CSP in
  [`popupResponse`](../functions/_lib/google.ts) (`default-src 'none'`), deliberately not derived
  from `csp.ts`.

This is the "what's already right" side of the posture. The other half is the set of caveats that
still matter operationally.

### 7.1 Remaining caveats and operator responsibilities

None of these are design-breaking, but they are the places where the system still depends on
careful setup or accepts an intentional tradeoff.

- **Google OAuth publishing status still governs who can sign in.** The app uses the narrow
  `youtube.readonly` scope, but as long as the Google project stays in **Testing**, only accounts
  on the project's **Test users** list can complete sign-in. That is acceptable for a personal or
  limited-audience tool and is the safest default unless you want to go through Google's broader
  verification flow.
- **Redirect-URI and secret hygiene matter more than frontend config now.** The browser no longer
  needs OAuth env vars, but the backend still depends on the exact authorized callback URLs and on
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` being present in `.dev.vars` or the Pages project.
  Keep the redirect URIs tight to the exact local and deployed callback URLs; this is now the real
  configuration boundary.
- **Logout is best-effort, not instantaneous revocation everywhere.** [`/auth/logout`](../functions/auth/logout.ts)
  clears the local refresh-token cookie even if Google's revoke call fails, so the browser session
  is gone from the app's point of view. But a short-lived access token that was already issued can
  still remain usable until expiry.
- **`hasSignedIn` is only a hint.** It is intentionally persisted so the app knows to attempt a
  silent refresh after reload, but it is not proof of a live session. The source of truth is still
  the server-side refresh cookie, and the UI is expected to correct itself after refresh/logout
  failures.
- **The API key is no longer stored in `localStorage`, but the deployment still needs the right
  restrictions.** The actual key lives only in the `digest_yt_key` `HttpOnly` cookie; the browser
  persists only the boolean `apiKeyConfigured`. That removes the old "any script on the origin can
  read the key" problem, but the key should still be restricted in Google Cloud to **YouTube Data
  API v3** so a leaked server-side secret cannot be reused broadly.
- **The Recall proxy holds a broad key server-side.** [`/api/recall/*`](../functions/api/recall)
  injects `RECALL_API_KEY`, which grants read access to your **entire** getrecall.ai knowledge base.
  Like the Google secret it lives only server-side (Pages secret / `.dev.vars`), the proxy is a
  GET-only allowlist (`cards`, `cards/{id}`) that rejects cross-site requests, and the SPA only ever
  learns a boolean from `GET /api/recall/status`. Keep the key scoped to the Recall account you're
  comfortable exposing read-only through this deployment.
- **Future backend expansion would need a fresh security review.** The current backend is narrow:
  OAuth brokerage, API-key storage, a small YouTube proxy, and the read-only Recall summary proxy. If
  transcripts, broader proxying, or cross-device sync move server-side later, revisit cookie scope,
  CSP, origin boundaries, and abuse controls as a new design rather than assuming this posture scales
  unchanged.

### 7.2 Security posture in one paragraph

Digest is intentionally built so the browser can do the user-facing work without becoming the
secret store: long-lived credentials stay server-side in `HttpOnly` cookies, the only browser-held
credential is a short-lived in-memory access token, all sensitive network hops are same-origin, and
the production build adds a tight CSP around that model. The remaining risk is therefore less about
"is the frontend holding secrets?" and more about operational correctness: keeping Google project
settings tight, understanding that dev is not production-parity for CSP, and treating any future
backend broadening as a new trust-boundary decision.

---

## 8. Where the complexity actually is (for the simplification decision)

Taking stock before changing anything — the parts that add build/branching surface:

### 8.1 CSP is production-only
The CSP is **not enforced in the Vite dev server** — `injectCspMeta` is `apply: 'build'`, and
`_headers` is applied only by Cloudflare. This is deliberate. CSP exists to limit damage from
injected script in production; in dev it protects only a short-lived, `youtube.readonly`,
in-memory access token on `localhost` with no untrusted input — negligible value — while actively
fighting the toolchain. We hit this twice: the `youtube-player` library derives the IFrame API URL
from `window.location.protocol`, so on `http://localhost` it loads `http://www.youtube.com/...`
(blocked by an https-only `script-src`); and Vite injects inline HMR / React-refresh `<script>`s
that a `script-src` without `'unsafe-inline'` blocks outright, so the app wouldn't even load.

A dev CSP could never match prod anyway (prod has no inline HMR scripts), so it gives a false sense
of parity. The real policy is verified where it's real: `npm run build && npm run preview` exercises
the strict `<meta>`, and the deployed site exercises the full `_headers` response header. The single
source in [`csp.ts`](../csp.ts) means there's exactly one policy to keep correct.

> Related: we also evaluated serving **dev over HTTPS** (which would have let the IFrame API load
> over https). It's not viable cleanly — `wrangler pages dev --proxy` can't terminate TLS to a Vite
> upstream (deprecated; with `--local-protocol https` it proxies over HTTPS and Node/undici won't
> trust the mkcert CA, so every request 502s). The working flip (Vite serves HTTPS, proxies to
> wrangler) costs a mkcert CA install, two processes, a dev origin change to `:5174`, and a new
> Google redirect URI. Not worth it — plain HTTP on `localhost` (a secure context, so cookies still
> work) plus a production-only CSP is simpler.

### 8.2 No OAuth/API-key build toggle (both are always on)
There used to be a `VITE_AUTH_BASE=` (empty) build flag that flipped an `OAUTH_ENABLED` constant
to hide the Google sign-in branch entirely — a second onboarding UI variant, an extra documented
build mode, and `isOAuthConfigured()` checks scattered across components. It was **removed**: the
toggle never bought a simpler deployment (the `/api` proxy + `/api/key` endpoints are required
either way, so you still deploy the Functions, create a Google Cloud project, and need an API key —
it only saved setting two secrets), so it wasn't worth the branching.

Now **both ways in are always available at runtime**: [`ApiKeyGate`](../src/components/ApiKeyGate.tsx)
is a single UI offering sign-in *and* a public API key, [`config.ts`](../src/lib/config.ts) is just
`AUTH_BASE = '/auth'`, and [`getValidToken`](../src/lib/oauth.ts) always attempts a refresh (a dead
session returns `null` gracefully). The only consequence: a deployment that didn't set
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` still shows a sign-in button, which errors on use
(`/auth/login` → 500) — users just fall back to the API key. A real deployment wants the secrets
anyway.
