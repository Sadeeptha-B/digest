import { useEffect, useRef, useState } from 'react'

// A slow lava-lamp drift — somewhere for a wandering gaze to rest that isn't another tab — with a
// grabbable blob layered on top for restless hands. Press anywhere and the lead blob springs to the
// cursor; drag to fling it (it bounces off the walls), release and it eases back into a lazy drift.
// The three backdrop blobs stay passive. Honors prefers-reduced-motion: the backdrop and the lead
// blob's idle wander are stilled (drift is autonomous motion), but dragging — being direct user
// input — still responds.

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

// Lead blob radius (matches the rendered h-20/w-20, ~80px) for wall clamping.
const R = 40

export function AmbientBlob() {
  const containerRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // Physics kept in a ref so the animation loop never has to be re-created on state changes.
  const sim = useRef({
    x: 0,
    y: 0, // current center, px relative to the container
    vx: 0,
    vy: 0, // velocity
    tx: 0,
    ty: 0, // spring target
    dragging: false,
    wanderUntil: 0, // when to pick the next idle drift target
  })

  useEffect(() => {
    const el = containerRef.current
    const blob = blobRef.current
    if (!el || !blob) return
    const reduced = prefersReducedMotion()
    const s = sim.current

    const rect0 = el.getBoundingClientRect()
    s.x = s.tx = rect0.width / 2
    s.y = s.ty = rect0.height / 2

    let raf = 0
    const tick = (now: number) => {
      const { width: w, height: h } = el.getBoundingClientRect()

      // Idle: amble toward a fresh random point every few seconds for a calm wander.
      if (!s.dragging && !reduced && now > s.wanderUntil) {
        const m = Math.min(w, h) * 0.25
        s.tx = m + Math.random() * Math.max(0, w - 2 * m)
        s.ty = m + Math.random() * Math.max(0, h - 2 * m)
        s.wanderUntil = now + 2500 + Math.random() * 2500
      }

      // Stiff + lightly damped while held (snappy, inertial); loose + heavily damped when drifting.
      const stiffness = s.dragging ? 0.2 : 0.012
      const damping = s.dragging ? 0.78 : 0.9
      s.vx = (s.vx + (s.tx - s.x) * stiffness) * damping
      s.vy = (s.vy + (s.ty - s.y) * stiffness) * damping
      s.x += s.vx
      s.y += s.vy

      // Soft walls: clamp inside the box and bounce a little when flung into an edge.
      if (s.x < R) {
        s.x = R
        s.vx *= -0.5
      } else if (s.x > w - R) {
        s.x = w - R
        s.vx *= -0.5
      }
      if (s.y < R) {
        s.y = R
        s.vy *= -0.5
      } else if (s.y > h - R) {
        s.y = h - R
        s.vy *= -0.5
      }

      blob.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  function aim(e: React.PointerEvent) {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    sim.current.tx = e.clientX - rect.left
    sim.current.ty = e.clientY - rect.top
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    sim.current.dragging = true
    setDragging(true)
    aim(e)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (sim.current.dragging) aim(e)
  }

  function endDrag() {
    // Leave velocity intact so a quick flick keeps coasting (the fling), then drift takes over.
    sim.current.dragging = false
    sim.current.wanderUntil = 0
    setDragging(false)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`relative h-28 touch-none select-none overflow-hidden rounded-xl border border-ink-700 bg-ink-950 sm:h-full sm:min-w-0 sm:flex-1 ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* Passive backdrop — the original lava drift, kept calm and non-interactive. */}
      <div className="pointer-events-none absolute -left-6 top-2 h-20 w-20 animate-blob-a rounded-full bg-accent-500/30 blur-2xl" />
      <div className="pointer-events-none absolute left-1/3 -top-4 h-24 w-24 animate-blob-b rounded-full bg-accent-400/20 blur-2xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-20 w-20 animate-blob-c rounded-full bg-rest-400/20 blur-2xl" />

      {/* Grabbable lead blob — crisper and a touch brighter so it reads as the thing you can move. */}
      <div
        ref={blobRef}
        className="pointer-events-none absolute left-0 top-0 h-20 w-20 rounded-full bg-accent-400/25 blur-xl ring-1 ring-accent-300/10"
      />

      <span className="pointer-events-none absolute bottom-2 left-3 text-xs text-zinc-600">
        Rest your eyes — or drag
      </span>
    </div>
  )
}
