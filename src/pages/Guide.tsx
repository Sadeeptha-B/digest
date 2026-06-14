import { useNavigate } from 'react-router-dom'
import { BackIcon } from '../components/Icons'
import { usePageTitle } from '../lib/pageTitle'

/**
 * In-app user guide: what Digest is, how it relates to YouTube, and the handful of concerns a user
 * should understand (where their library lives, what their credentials are used for, the limits).
 * Plain prose deliberately — this is the user-facing counterpart to docs/architecture.md, which is
 * the deep technical reference. Reachable from the header (always) and the onboarding gate.
 */
export function Guide() {
  usePageTitle('User guide')
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
      >
        <BackIcon className="h-4 w-4" /> Back
      </button>

      <h1 className="mt-6 text-2xl font-semibold text-white">How Digest works</h1>
      <p className="mt-2 text-zinc-400">
        Digest is a distraction-free viewer for your own YouTube playlists — a personal library you
        curate, surrounded by nothing but your own queue. No sidebar recommendations, no autoplay to
        unrelated videos, no end-screen grid pulling you elsewhere.
      </p>

      <Section title="It’s your library, kept in this browser">
        <p>
          The lists you add, your ordering, and your watch progress are stored locally in{' '}
          <em>this</em> browser — not on a Digest server. That keeps things fast and private, with
          two consequences worth knowing:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-zinc-200">There’s no cross-device sync.</span> Your library on
            your phone is separate from your laptop. Each browser keeps its own.
          </li>
          <li>
            <span className="text-zinc-200">Clearing this browser’s data clears Digest.</span> The
            same goes for <span className="text-zinc-200">Clear all data</span> in Settings, which
            resets the app to a fresh install.
          </li>
        </ul>
        <p className="mt-3">
          You can <span className="text-zinc-200">install Digest as an app</span> from your
          browser’s menu — it runs in its own window and loads instantly, but the library still
          lives in that browser’s storage.
        </p>
      </Section>

      <Section title="Its relationship with YouTube">
        <p>
          Digest is an independent project and is <span className="text-zinc-200">not affiliated
          with YouTube or Google</span>. It’s a different lens onto content that still lives entirely
          on YouTube:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-zinc-200">Importing a playlist</span> uses the official YouTube
            Data API to read its videos. You provide the access (see below); Digest never scrapes.
          </li>
          <li>
            <span className="text-zinc-200">Playback</span> is YouTube’s own embedded player, so
            views still count and YouTube’s Terms of Service apply just as on the site. Digest only
            removes the surrounding distractions and advances your queue when a video ends.
          </li>
          <li>
            <span className="text-zinc-200">Your edits stay in Digest.</span> Once imported, the
            local copy is yours to reorder and prune; Digest has read-only access and never writes
            changes back to YouTube.
          </li>
        </ul>
        <p className="mt-3">
          A playlist you imported is a <span className="text-zinc-200">snapshot you curate</span>,
          not a live mirror. Hit <span className="text-zinc-200">Refresh</span> to pull in videos
          added or removed upstream — the sync merges rather than replaces, so it preserves your
          ordering and anything you removed locally. Removed videos stay reviewable under{' '}
          <span className="text-zinc-200">Show removed</span>, where you can restore them.
        </p>
      </Section>

      <Section title="How you get access — and where credentials go">
        <p>There are two ways to let Digest read your playlists:</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-zinc-200">Sign in with Google (recommended).</span> Unlocks your{' '}
            <em>private</em> playlists and needs no API key. It uses the narrow{' '}
            <span className="text-zinc-200">read-only</span> YouTube scope — Digest can view, never
            modify.
          </li>
          <li>
            <span className="text-zinc-200">Use a public API key.</span> For browsing public or
            unlisted content without signing in. It’s <em>your own</em> Google Cloud key, drawing on
            your own (generous, free) quota.
          </li>
        </ul>
        <p className="mt-3">
          Either way, the sensitive part of the credential is held{' '}
          <span className="text-zinc-200">server-side in a secure cookie this page can’t read</span>
          , and YouTube calls are proxied so the credential never reaches the page’s JavaScript. The
          only thing the browser holds is a short-lived access token kept in memory. Your data goes
          to Google/YouTube and nowhere else.
        </p>
        <p className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-sm text-zinc-500">
          Google sign-in is currently limited to <span className="text-zinc-300">pre-approved
          accounts</span> (the app runs in Google’s “Testing” mode). If yours isn’t approved, use a
          public API key instead.
        </p>
      </Section>

      <Section title="Watching, focused">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-zinc-200">A custom queue</span> auto-advances to your next video
            when one ends — so YouTube’s end screen never gets a chance to redirect you.
          </li>
          <li>
            <span className="text-zinc-200">Watch progress</span> is remembered: finished videos are
            marked, and playback resumes where you left off.
          </li>
          <li>
            <span className="text-zinc-200">An optional focus timer</span> (Pomodoro) breaks long
            videos into timed blocks with skippable breaks. Tune it in Settings.
          </li>
        </ul>
      </Section>

      <Section title="AI summaries from Recall (optional)">
        <p>
          If you use{' '}
          <a
            href="https://www.recall.it"
            target="_blank"
            rel="noreferrer"
            className="text-accent-400 hover:underline"
          >
            Recall
          </a>{' '}
          (getrecall.ai) to save and summarise videos, Digest can show those AI summaries beside the
          player on the watch page — with <span className="text-zinc-200">click-to-seek
          timestamps</span> that jump to the moment each point refers to.
        </p>
        <p className="mt-3">
          It’s opt-in and per-person: paste <em>your own</em> Recall API key in{' '}
          <span className="text-zinc-200">Settings</span>, and a{' '}
          <span className="text-zinc-200">Summary</span> tab appears on videos you’ve saved in
          Recall. There’s no shared key — leave it unset and the tab simply doesn’t show. Because a
          Recall key grants read access to your <em>whole</em> Recall library, it’s held{' '}
          <span className="text-zinc-200">server-side in a secure cookie this page can’t read</span>,
          and Digest only ever <span className="text-zinc-200">reads</span> your summaries — it never
          edits or deletes anything in Recall.
        </p>
      </Section>

      <Section title="What Digest doesn’t do">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Sync your library across devices — each browser is independent.</li>
          <li>Download or store the videos themselves; playback always streams from YouTube.</li>
          <li>
            Provide transcripts for videos you don’t own or that only have auto-captions.
          </li>
        </ul>
      </Section>

      <p className="mt-10 text-sm text-zinc-500">
        Manage sign-in, your YouTube and Recall keys, the focus timer, and clearing data from{' '}
        <span className="text-zinc-300">Settings</span> (the gear in the header).
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      <div className="mt-2 space-y-1 text-zinc-400">{children}</div>
    </section>
  )
}
