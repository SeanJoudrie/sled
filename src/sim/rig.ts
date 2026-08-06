/**
 * The rider: five points, six distance constraints, and one posture rule.
 *
 * The posture rule is not a distance constraint and cannot be one — see
 * applyPosture below for why.
 */

import {
  EPS_LEN,
  ITERATIONS,
  POSTURE_K,
  POSTURE_REST_UP,
  SPAWN_AHEAD,
  SPAWN_LIFT,
  SPAWN_SNAP_R2,
} from './consts.ts'
import type { Point, Rig, World } from './types.ts'

export const NOSE = 0
export const TAIL = 1
export const SEAT = 2
export const HEAD = 3
export const HAND = 4

export const POINT_COUNT = 5

/** Point names, indexed by the constants above. For debug output only. */
export const POINT_NAMES = ['nose', 'tail', 'seat', 'head', 'hand'] as const

/**
 * Points that collide with solid lines. The seat and hand are structural and
 * decorative respectively; the head does not collide, it *crashes*.
 */
export const RIDE_POINTS: readonly number[] = [NOSE, TAIL]

/** RIDE_POINTS as a flat lookup, so the tick loop does not search an array. */
export const IS_RIDE: readonly boolean[] = Array.from(
  { length: 5 },
  (_, i) => RIDE_POINTS.indexOf(i) >= 0,
)

/** Rest pose, rider facing +x, origin at the sled nose. y is down. */
const REST: readonly (readonly [number, number])[] = [
  [0, 0], // nose
  [-20, 0], // tail
  [-10, -11], // seat
  [-10, -27], // head
  [2, -18], // hand
]

export type Constraint = {
  readonly a: number
  readonly b: number
  readonly rest: number
  readonly k: number
}

/**
 * Solved in this exact order, ITERATIONS times per tick.
 *
 * The first three are a rigid triangle — that is the sled. `seat–head` and
 * `nose–head` together hold the rider up: without `nose–head` the head is free
 * anywhere on a 16 px circle about the seat, and its momentum carries it
 * straight through the sled into the ground on the first landing.
 *
 * `nose–head` is soft (0.6) so he leans in a dip and rights himself after.
 * `seat–hand` is floppy on purpose.
 */
export const CONSTRAINTS: readonly Constraint[] = [
  { a: NOSE, b: TAIL, rest: 20.0, k: 1.0 },
  { a: NOSE, b: SEAT, rest: 14.866, k: 1.0 },
  { a: TAIL, b: SEAT, rest: 14.866, k: 1.0 },
  { a: SEAT, b: HEAD, rest: 16.0, k: 0.92 },
  { a: NOSE, b: HEAD, rest: 28.792, k: 0.6 },
  { a: SEAT, b: HAND, rest: 13.892, k: 0.5 },
]

/**
 * Lay the rig out at the start flag.
 *
 * The flag keeps the position the player put it at, but takes its *orientation*
 * from the nearest line beneath it, and the sled is placed a full sled-length
 * along that tangent so it sits entirely ahead of the flag.
 *
 * Both halves are the same lesson. Spawning flat onto a slope nose-plants every
 * time: the downhill runner touches first, stops dead against zero restitution,
 * and the tail rotates over the top of it. Spawning *behind* the flag strands
 * the tail off the end of the track whenever the flag is at the top of a hill —
 * which is precisely where a person puts it.
 */
export function spawn(world: World): Rig {
  let ux = 1
  let uy = 0

  // Nearest solid line within reach of the flag. Ties break by level order.
  let bestD2 = SPAWN_SNAP_R2
  let bestIdx = -1
  for (let i = 0; i < world.solids.length; i++) {
    const s = world.solids[i]!
    const abx = s.bx - s.ax
    const aby = s.by - s.ay
    const ab2 = abx * abx + aby * aby
    if (ab2 < EPS_LEN) continue
    let t = ((world.startX - s.ax) * abx + (world.startY - s.ay) * aby) / ab2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const dx = world.startX - (s.ax + abx * t)
    const dy = world.startY - (s.ay + aby * t)
    const d2 = dx * dx + dy * dy
    if (d2 < bestD2) {
      bestD2 = d2
      bestIdx = i
    }
  }

  if (bestIdx >= 0) {
    const s = world.solids[bestIdx]!
    let dx = s.bx - s.ax
    let dy = s.by - s.ay
    const len = Math.sqrt(dx * dx + dy * dy)
    // Orient downhill-agnostic but forward-facing: he always faces +x. A purely
    // vertical line breaks the tie on y so the choice stays deterministic.
    if (dx < 0 || (dx === 0 && dy < 0)) {
      dx = -dx
      dy = -dy
    }
    ux = dx / len
    uy = dy / len
  }

  // "Up" in the sled's own frame, with y pointing down the screen.
  const nx = uy
  const ny = -ux

  // Lifted clear of the line, and moved a sled's length along it so the whole
  // rig sits ahead of the flag rather than trailing off the end of the track.
  const ox = world.startX + nx * SPAWN_LIFT + ux * SPAWN_AHEAD
  const oy = world.startY + ny * SPAWN_LIFT + uy * SPAWN_AHEAD

  const pts: Point[] = []
  for (let i = 0; i < POINT_COUNT; i++) {
    const [rx, ry] = REST[i]!
    // Rotate the rest pose into the tangent frame: one complex multiply.
    const x = ox + (rx * ux - ry * uy)
    const y = oy + (rx * uy + ry * ux)
    pts.push({ x, y, px: x, py: y })
  }

  return { pts, portalCooldown: 0, state: 'running', tick: 0 }
}

/** Standard symmetric Verlet relaxation. Mass is uniform, so both points move equally. */
export function solveConstraints(pts: Point[]): void {
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < CONSTRAINTS.length; i++) {
      const c = CONSTRAINTS[i]!
      const a = pts[c.a]!
      const b = pts[c.b]!
      const d = b.x - a.x
      const e = b.y - a.y
      const len = Math.sqrt(d * d + e * e)
      if (len < EPS_LEN) continue
      const diff = ((len - c.rest) / len) * 0.5 * c.k
      a.x += d * diff
      a.y += e * diff
      b.x -= d * diff
      b.y -= e * diff
    }
  }
}

/**
 * Keep the rider on top of the sled.
 *
 * A point held by two distance constraints in 2D has **two** solutions,
 * mirrored across the line through its anchors, and both satisfy the
 * constraints exactly. Nothing in solveConstraints stops the head popping to
 * the underside on a hard landing and staying there — the rig is just as
 * "correct" upside down.
 *
 * Distance alone cannot express which side he sits on, so this does, in the
 * sled's own frame. It corrects only the component along the sled's up-normal;
 * the along-sled component is left completely free, which is what preserves
 * leaning. Posture and distance are complementary: the distance constraint
 * stops the head sinking, this stops it mirroring.
 */
export function applyPosture(pts: Point[]): void {
  const nose = pts[NOSE]!
  const tail = pts[TAIL]!
  const seat = pts[SEAT]!
  const head = pts[HEAD]!

  const dx = nose.x - tail.x
  const dy = nose.y - tail.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < EPS_LEN) return

  const ux = dx / len
  const uy = dy / len
  const nx = uy
  const ny = -ux

  const rx = head.x - seat.x
  const ry = head.y - seat.y
  const up = rx * nx + ry * ny

  // Soft pull toward the rest offset. Upright is the only equilibrium, so the
  // mirrored solution cannot be settled in.
  const corr = (POSTURE_REST_UP - up) * POSTURE_K
  head.x += nx * corr
  head.y += ny * corr
}
