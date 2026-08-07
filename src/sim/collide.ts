/**
 * Contact resolution: swept crossing first, proximity second.
 *
 * Proximity alone tunnels, and it is not a close call. A point dropped 70 px is
 * already moving 4.1 px/tick when it arrives, so against any sane contact band
 * it is above the line on one tick and below it on the next, and never once
 * *within* it. So the tick's motion is tested as a segment crossing.
 *
 * But the swept test alone is not enough either, because it only sees motion:
 * the constraint solve and the posture rule reposition points with no motion to
 * sweep, and anything they nudge past the band would be invisible to both
 * tests, sink through the line, and stay there. Hence both, and hence a
 * CONTACT_R fat enough to swallow any single-tick correction.
 */

import { CONTACT_R, EPS_LEN, HEAD_CRASH_R } from './consts.ts'
import type { Point, Segment, World } from './types.ts'
import { HEAD, RIDE_POINTS } from './rig.ts'

/**
 * Where the motion segment P0->P1 crosses segment A->B, as a fraction of the
 * motion. -1 for no crossing. Arithmetic only.
 */
export function segCross(
  p0x: number, p0y: number, p1x: number, p1y: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const rx = p1x - p0x
  const ry = p1y - p0y
  const sx = bx - ax
  const sy = by - ay
  const denom = rx * sy - ry * sx
  if (denom < EPS_LEN && denom > -EPS_LEN) return -1 // parallel or stationary
  const qpx = ax - p0x
  const qpy = ay - p0y
  const t = (qpx * sy - qpy * sx) / denom
  if (t < 0 || t > 1) return -1
  const u = (qpx * ry - qpy * rx) / denom
  if (u < 0 || u > 1) return -1
  return t
}

/** Squared distance from a point to a segment, clamped to the segment's ends. */
export function pointSegDist2(
  x: number, y: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const ab2 = abx * abx + aby * aby
  if (ab2 < EPS_LEN) {
    const dx0 = x - ax
    const dy0 = y - ay
    return dx0 * dx0 + dy0 * dy0
  }
  let t = ((x - ax) * abx + (y - ay) * aby) / ab2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = x - (ax + abx * t)
  const dy = y - (ay + aby * t)
  return dx * dx + dy * dy
}

function distToSeg2(x: number, y: number, s: Segment): number {
  return pointSegDist2(x, y, s.ax, s.ay, s.bx, s.by)
}

/** Did this point cross or come within `r` of this segment during the tick? */
function touches(p: Point, s: Segment, r: number): boolean {
  if (segCross(p.px, p.py, p.x, p.y, s.ax, s.ay, s.bx, s.by) >= 0) return true
  return distToSeg2(p.x, p.y, s) < r * r
}

/**
 * Kill the normal component of velocity, damp the tangential, add any boost.
 *
 * Restitution is zero for every brush — a bouncing sled feels wrong and makes
 * tracks unpredictable to author. Velocity is read *after* the positional push
 * so that the push itself is absorbed by the normal-kill rather than injected
 * as free speed.
 */
function applyFriction(p: Point, s: Segment, nx: number, ny: number): void {
  const vx = p.x - p.px
  const vy = p.y - p.py

  const tx = -ny
  const ty = nx
  let vt = vx * tx + vy * ty

  vt *= 1 - s.brush.friction

  if (s.brush.boost !== 0) {
    // Boost runs along the segment as drawn, A->B. The tangent above inherits
    // its sign from the contact normal, so project the drawn direction onto it:
    // the result is +1 or -1, and a line drawn right-to-left boosts backwards.
    const abx = s.bx - s.ax
    const aby = s.by - s.ay
    const lab = Math.sqrt(abx * abx + aby * aby)
    if (lab > EPS_LEN) {
      const sgn = (tx * abx + ty * aby) / lab
      vt += s.brush.boost * (sgn >= 0 ? 1 : -1)
    }
  }

  // Normal velocity is zeroed, so only the tangential term is written back.
  p.px = p.x - vt * tx
  p.py = p.y - vt * ty
}

/** Resolve one point against one segment. Returns whether contact happened. */
function resolve(p: Point, s: Segment): boolean {
  const abx = s.bx - s.ax
  const aby = s.by - s.ay
  const ab2 = abx * abx + aby * aby
  if (ab2 < EPS_LEN) return false
  const lab = Math.sqrt(ab2)

  const t = segCross(p.px, p.py, p.x, p.y, s.ax, s.ay, s.bx, s.by)
  if (t >= 0) {
    // Push back out on the side the point started the tick on.
    let nx = -aby / lab
    let ny = abx / lab
    const side = (p.px - s.ax) * nx + (p.py - s.ay) * ny
    if (side < -EPS_LEN) {
      nx = -nx
      ny = -ny
    } else if (side <= EPS_LEN) {
      // Started on the line itself: oppose the motion instead.
      if ((p.x - p.px) * nx + (p.y - p.py) * ny > 0) {
        nx = -nx
        ny = -ny
      }
    }
    p.x = p.px + (p.x - p.px) * t + nx * CONTACT_R
    p.y = p.py + (p.y - p.py) * t + ny * CONTACT_R
    applyFriction(p, s, nx, ny)
    return true
  }

  let ct = ((p.x - s.ax) * abx + (p.y - s.ay) * aby) / ab2
  ct = ct < 0 ? 0 : ct > 1 ? 1 : ct
  const dx = p.x - (s.ax + abx * ct)
  const dy = p.y - (s.ay + aby * ct)
  const d2 = dx * dx + dy * dy
  if (d2 >= CONTACT_R * CONTACT_R) return false

  const d = Math.sqrt(d2)
  let nx: number
  let ny: number
  if (d > EPS_LEN) {
    nx = dx / d
    ny = dy / d
  } else {
    // Exactly on the line: no direction to push along, so use its normal.
    nx = -aby / lab
    ny = abx / lab
  }
  const push = CONTACT_R - d
  p.x += nx * push
  p.y += ny * push
  applyFriction(p, s, nx, ny)
  return true
}

/** Resolve every RIDE point against every solid, in level-array order. */
export function resolveContacts(pts: Point[], world: World): void {
  for (let i = 0; i < RIDE_POINTS.length; i++) {
    const p = pts[RIDE_POINTS[i]!]!
    for (let j = 0; j < world.solids.length; j++) {
      resolve(p, world.solids[j]!)
    }
  }
}

/**
 * Is this point under water?
 *
 * Water does not collide. It defines a half-plane: submerged means x lies
 * within the segment's span and y is below the surface at that x. If two water
 * lines overlap, the first in level order wins — they are never summed.
 */
export function submerged(x: number, y: number, world: World): boolean {
  for (let i = 0; i < world.waters.length; i++) {
    const s = world.waters[i]!
    const lo = s.ax < s.bx ? s.ax : s.bx
    const hi = s.ax < s.bx ? s.bx : s.ax
    if (x < lo || x > hi) continue
    const span = s.bx - s.ax
    let surfaceY: number
    if (span < EPS_LEN && span > -EPS_LEN) {
      surfaceY = s.ay < s.by ? s.ay : s.by
    } else {
      surfaceY = s.ay + ((s.by - s.ay) * (x - s.ax)) / span
    }
    if (y > surfaceY) return true // y is down
  }
  return false
}

/**
 * Has the run ended?
 *
 * The head's test is swept for the same reason contact is: a proximity-only
 * head test lets him sail straight through the ground head-first at speed.
 */
export function crashed(pts: Point[], world: World): boolean {
  const head = pts[HEAD]!
  for (let i = 0; i < world.solids.length; i++) {
    if (touches(head, world.solids[i]!, HEAD_CRASH_R)) return true
  }
  // Kill lines end the run on contact by *any* point, not just the head.
  for (let i = 0; i < world.solids.length; i++) {
    const s = world.solids[i]!
    if (!s.brush.kills) continue
    for (let j = 0; j < pts.length; j++) {
      if (touches(pts[j]!, s, CONTACT_R)) return true
    }
  }
  return false
}

/**
 * Has a RIDE point crossed a finish line?
 *
 * Swept, like everything else that matters: a finish line is thin and he
 * arrives at speed, so a proximity-only test would let a fast run sail through
 * the tape and keep going.
 */
export function finished(pts: Point[], world: World): boolean {
  for (let i = 0; i < world.finishes.length; i++) {
    const f = world.finishes[i]!
    for (let j = 0; j < RIDE_POINTS.length; j++) {
      if (touches(pts[RIDE_POINTS[j]!]!, f, CONTACT_R)) return true
    }
  }
  return false
}

/** Has the rig left the level entirely? */
export function offTrack(pts: Point[], world: World): boolean {
  const b = world.bounds
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return true
  }
  return false
}
