/**
 * The scarf.
 *
 * A five-link chain hanging off the rider's neck, run as its own little Verlet
 * sim in **render space**. It streams out flat when he is moving and sags when
 * he is not, which turns speed into something you can see on the rider himself
 * rather than only in the readout.
 *
 * It is decoration and it is *not* the simulation. It runs on frame deltas,
 * uses whatever maths it likes, and is never read back — a run stays a pure
 * function of the level. That separation is why this file lives in `render/`
 * and why `sim/` cannot import it.
 */

export type ScarfPoint = { x: number; y: number; px: number; py: number }

const LINKS = 5
const LINK_LEN = 6.5
/** Heavier than the rider's own gravity: a scarf should hang, not float. */
const SCARF_GRAVITY = 0.42
const SCARF_DRAG = 0.86
/** How hard the wind of travel pulls it backwards, per unit of speed. */
const WIND_PER_SPEED = 0.62

export type Scarf = { pts: ScarfPoint[]; ready: boolean }

export function makeScarf(): Scarf {
  return {
    pts: Array.from({ length: LINKS }, () => ({ x: 0, y: 0, px: 0, py: 0 })),
    ready: false,
  }
}

/** Drop the chain onto the anchor, so it does not whip across the page on load. */
export function resetScarf(s: Scarf, x: number, y: number): void {
  for (const p of s.pts) {
    p.x = x
    p.y = y
    p.px = x
    p.py = y
  }
  s.ready = true
}

/**
 * Advance one frame.
 *
 * `vx`/`vy` is the rider's own velocity, which becomes a headwind on the scarf:
 * flat out at speed, limp at rest.
 */
export function stepScarf(
  s: Scarf,
  anchorX: number,
  anchorY: number,
  vx: number,
  vy: number,
  frames: number,
): void {
  if (!s.ready) {
    resetScarf(s, anchorX, anchorY)
    return
  }

  const n = Math.max(0.2, Math.min(frames, 3))
  const windX = -vx * WIND_PER_SPEED
  const windY = -vy * WIND_PER_SPEED

  for (let i = 1; i < s.pts.length; i++) {
    const p = s.pts[i]!
    const dx = (p.x - p.px) * SCARF_DRAG
    const dy = (p.y - p.py) * SCARF_DRAG
    p.px = p.x
    p.py = p.y
    // Links further from the neck catch more wind, so it tapers as it streams.
    const catchFactor = 0.5 + (i / s.pts.length) * 0.9
    p.x += dx + (windX * catchFactor + 0) * n
    p.y += dy + (windY * catchFactor + SCARF_GRAVITY) * n
  }

  // Pin the neck, then relax the chain a few times.
  s.pts[0]!.x = anchorX
  s.pts[0]!.y = anchorY
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1]!
      const b = s.pts[i]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-6) continue
      const diff = (len - LINK_LEN) / len
      // Only the free end moves: the neck is where the scarf is tied.
      if (i === 1) {
        b.x -= dx * diff
        b.y -= dy * diff
      } else {
        a.x += dx * diff * 0.5
        a.y += dy * diff * 0.5
        b.x -= dx * diff * 0.5
        b.y -= dy * diff * 0.5
      }
    }
    s.pts[0]!.x = anchorX
    s.pts[0]!.y = anchorY
  }
}

export function drawScarf(ctx: CanvasRenderingContext2D, s: Scarf, colour: string): void {
  if (!s.ready) return
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Tapers from neck to tip, like a strip of cloth seen edge-on.
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1]!
    const b = s.pts[i]!
    ctx.lineWidth = 3.6 * (1 - (i - 1) / s.pts.length) + 1.1
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
}
