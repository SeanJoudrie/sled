/**
 * Level -> World.
 *
 * A level string can arrive from anywhere — someone's URL bar, a hand-edited
 * link, a future format version — so everything is clamped here rather than
 * trusted. Degenerate geometry is dropped at build time so the hot loops never
 * have to guard against a zero-length segment producing NaN.
 */

import { BRUSHES, BRUSH_COUNT, WIND } from './types.ts'
import type { Bounds, BrushId, Level, Portal, Segment, Well, Wind, World } from './types.ts'
import { EPS_LEN, OFF_TRACK_MARGIN } from './consts.ts'

function clampId(n: number, count: number): number {
  const i = Math.trunc(n)
  if (!Number.isFinite(i) || i < 0) return 0
  return i >= count ? 0 : i
}

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0
}

export function buildWorld(level: Level): World {
  const segs: Segment[] = []
  for (let i = 0; i < level.l.length; i++) {
    const [b, ax, ay, bx, by] = level.l[i]!
    segs.push({
      brush: BRUSHES[clampId(b, BRUSH_COUNT)]!,
      ax: finite(ax),
      ay: finite(ay),
      bx: finite(bx),
      by: finite(by),
    })
  }

  // Precomputed subsets, still in level order — collision resolves in it.
  const solids = segs.filter((s) => s.brush.collides)
  const waters = segs.filter((s) => s.brush.water)

  const portals: Portal[] = []
  for (let i = 0; i < level.p.length; i++) {
    const q = level.p[i]!
    const ax = finite(q[0]), ay = finite(q[1]), bx = finite(q[2]), by = finite(q[3])
    const cx = finite(q[4]), cy = finite(q[5]), dx = finite(q[6]), dy = finite(q[7])

    let uax = bx - ax
    let uay = by - ay
    const la = Math.sqrt(uax * uax + uay * uay)
    let ubx = dx - cx
    let uby = dy - cy
    const lb = Math.sqrt(ubx * ubx + uby * uby)
    if (la < EPS_LEN || lb < EPS_LEN) continue // a portal with no width is not a portal
    uax /= la
    uay /= la
    ubx /= lb
    uby /= lb

    // q = uB * conj(uA): the rotation taking A's frame to B's frame.
    // Built from normalised directions and one complex multiply — never atan2.
    portals.push({
      ax, ay, bx, by, cx, cy, dx, dy,
      qc: ubx * uax + uby * uay,
      qs: uby * uax - ubx * uay,
    })
  }

  const wells: Well[] = []
  for (let i = 0; i < level.g.length; i++) {
    const [x, y, strength] = level.g[i]!
    wells.push({ x: finite(x), y: finite(y), strength: finite(strength) })
  }

  const winds: Wind[] = []
  for (let i = 0; i < level.w.length; i++) {
    const [ax, ay, bx, by, strength, kind] = level.w[i]!
    const fax = finite(ax), fay = finite(ay), fbx = finite(bx), fby = finite(by)
    const dx = fbx - fax
    const dy = fby - fay
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < EPS_LEN) continue // no direction and no radius: nothing to apply
    winds.push({
      kind: (kind === WIND.VORTEX ? WIND.VORTEX : WIND.ARROW) as Wind['kind'],
      ax: fax, ay: fay, bx: fbx, by: fby,
      strength: finite(strength),
      ux: dx / len,
      uy: dy / len,
      radius: len,
    })
  }

  const startX = finite(level.s[0])
  const startY = finite(level.s[1])

  const bounds = computeBounds(segs, portals, wells, winds, startX, startY)

  return {
    segs,
    solids,
    waters,
    portals,
    wells,
    winds,
    startX,
    startY,
    rider: [
      Math.trunc(finite(level.r[0])),
      Math.trunc(finite(level.r[1])),
      Math.trunc(finite(level.r[2])),
      Math.trunc(finite(level.r[3])),
    ] as const,
    bounds,
  }
}

/**
 * The level's extent, padded by OFF_TRACK_MARGIN. Leaving it ends the run as
 * "gone" — otherwise a rider launched off the end of a ramp integrates forever.
 */
function computeBounds(
  segs: readonly Segment[],
  portals: readonly Portal[],
  wells: readonly Well[],
  winds: readonly Wind[],
  startX: number,
  startY: number,
): Bounds {
  let minX = startX
  let minY = startY
  let maxX = startX
  let maxY = startY

  const put = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  for (const s of segs) {
    put(s.ax, s.ay)
    put(s.bx, s.by)
  }
  for (const p of portals) {
    put(p.ax, p.ay)
    put(p.bx, p.by)
    put(p.cx, p.cy)
    put(p.dx, p.dy)
  }
  for (const w of wells) put(w.x, w.y)
  for (const w of winds) {
    put(w.ax, w.ay)
    put(w.bx, w.by)
  }

  return {
    minX: minX - OFF_TRACK_MARGIN,
    minY: minY - OFF_TRACK_MARGIN,
    maxX: maxX + OFF_TRACK_MARGIN,
    maxY: maxY + OFF_TRACK_MARGIN,
  }
}

/** An empty level, for the editor's blank page. */
export function emptyLevel(): Level {
  return { v: 1, r: [0, 0, 0, 0], s: [0, 0], l: [], p: [], g: [], w: [] }
}

/** Narrow an arbitrary number to a valid brush id. Exported for the editor. */
export function asBrushId(n: number): BrushId {
  return clampId(n, BRUSH_COUNT) as BrushId
}
