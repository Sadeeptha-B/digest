# 0008 — Remove official `captions.download`; manual import only

- **Status:** Accepted
- **Date:** 2026-06-14

## Context

The official YouTube `captions.download` path returns text **only** for caption tracks uploaded via
the API — **auto-generated (ASR) tracks return `403` even for the owner**. So it only ever
succeeded for the rare video with a *manually uploaded* track, while costing **250 quota
units/video** and forcing the broad `youtube.force-ssl` scope on every sign-in. Manual `.srt`/`.vtt`
import ([`src/lib/captions.ts`](../../src/lib/captions.ts)) already covers the same cases (owner,
real caption track) for free and with no OAuth.

## Decision

**Remove the official `captions.download` path.** Transcripts are **manual import only** for now.
The provider seam (`getTranscript` → `cacheTranscript`) is stubbed but not built, so a future
automated provider can land with no UI change.

## Consequences

- Drops the broad `youtube.force-ssl` scope from sign-in — sign-in needs only `youtube.readonly`.
- No quota burned on transcripts.
- Auto-generated and no-caption-at-all videos are not covered until an automated provider lands.
  The recommended long-term path is a **home server** (`yt-dlp` + Whisper) — see
  [`roadmap/transcripts.md`](../roadmap/transcripts.md) Option 6, whose deployment/exposure choices
  remain an open roadmap item, not yet a decision.
