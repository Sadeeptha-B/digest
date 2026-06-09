// A slow lava-lamp drift — somewhere for a wandering gaze to rest that isn't another tab.
// Blobs are blurred, low-opacity, and move on long, offset cycles so nothing snaps to attention.
// Honors prefers-reduced-motion (animations disabled via CSS).
export function AmbientBlob() {
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-ink-700 bg-ink-950 sm:h-full sm:w-44 sm:shrink-0">
      <div className="absolute -left-6 top-2 h-20 w-20 animate-blob-a rounded-full bg-accent-500/30 blur-2xl" />
      <div className="absolute left-1/3 -top-4 h-24 w-24 animate-blob-b rounded-full bg-accent-400/20 blur-2xl" />
      <div className="absolute right-0 bottom-0 h-20 w-20 animate-blob-c rounded-full bg-rest-400/20 blur-2xl" />
      <span className="absolute bottom-2 left-3 text-xs text-zinc-600">Rest your eyes here</span>
    </div>
  )
}
