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
