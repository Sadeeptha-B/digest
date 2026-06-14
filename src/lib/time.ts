/** Format a number of seconds as mm:ss, or h:mm:ss once it passes an hour. */
export function fmt(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const s = total % 60
  const m = Math.floor((total / 60) % 60)
  const h = Math.floor(total / 3600)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Compact relative-time label for a past epoch-ms timestamp, e.g. "just now", "5m ago", "3d ago". */
export function timeAgo(epochMs: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - epochMs) / 1000))
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.round(hr / 24)
  return `${days}d ago`
}
