/**
 * The three stamps: gravity wells, wind, and portals.
 *
 * Wells and wind are static force fields sampled per point per tick. Nothing
 * here simulates a fluid — that would be non-deterministic, and it is not what
 * the mechanic needs.
 */

import {
  EPS_LEN,
  PORTAL_COOLDOWN,
  VORTEX_MIN_R,
  WELL_CUTOFF_R2,
  WELL_MIN_R,
  WIND_R,
} from './consts.ts'
import { WIND } from './types.ts'
import type { Point, Rig, World } from './types.ts'
import { pointSegDist2, segCross } from './collide.ts'
import { RIDE_POINTS } from './rig.ts'

/**
 * Accumulate stamp forces for one point.
 *
 * Applied to *every* point in the rig, including the ones that do not collide.
 * Pulling only the RIDE points tears the rig apart against its own constraints.
 */
export function stampForce(
  x: number,
  y: number,
  world: World,
  out: { fx: number; fy: number },
): void {
  out.fx = 0
  out.fy = 0

  // ── gravity wells ──────────────────────────────────────────────────────────
  // At r = 100 with the default strength of 1200 the pull equals gravity
  // exactly; at r = 50 it is four times gravity. That scale is what makes a
  // well a screen away a gentle curve and one near the track a slingshot.
  for (let i = 0; i < world.wells.length; i++) {
    const w = world.wells[i]!
    const dx = w.x - x
    const dy = w.y - y
    const r2 = dx * dx + dy * dy
    if (r2 > WELL_CUTOFF_R2) continue
    const r = Math.sqrt(r2)
    if (r < EPS_LEN) continue // dead centre: no direction to pull along
    const rc = r < WELL_MIN_R ? WELL_MIN_R : r
    const a = w.strength / (rc * rc)
    out.fx += (dx / r) * a
    out.fy += (dy / r) * a
  }

  // ── wind ───────────────────────────────────────────────────────────────────
  for (let i = 0; i < world.winds.length; i++) {
    const w = world.winds[i]!
    if (w.kind === WIND.ARROW) {
      // Uniform push inside a capsule around the segment.
      if (pointSegDist2(x, y, w.ax, w.ay, w.bx, w.by) > WIND_R * WIND_R) continue
      out.fx += w.ux * w.strength
      out.fy += w.uy * w.strength
    } else {
      // Tangential push inside a circle, falling linearly to zero at the rim.
      const dx = w.ax - x
      const dy = w.ay - y
      const r2 = dx * dx + dy * dy
      if (r2 > w.radius * w.radius) continue
      const r = Math.sqrt(r2)
      const rc = r < VORTEX_MIN_R ? VORTEX_MIN_R : r
      const a = w.strength * (1 - rc / w.radius)
      out.fx += (-dy / rc) * a
      out.fy += (dx / rc) * a
    }
  }
}

/**
 * Portal transit.
 *
 * The rotation is built from normalised direction vectors and one complex
 * multiplication (precomputed in world.ts as qc/qs) — never atan2. IEEE-754
 * requires correct rounding for + - * / and sqrt and *nothing* of the
 * transcendentals, so a portal built on trigonometry works in one engine and
 * silently breaks in another.
 *
 * The whole rig transports, never just the crossing point, and the previous
 * positions are rotated by the identical transform. That is what carries
 * momentum through correctly — do not recompute velocity by any other route.
 */
export function applyPortals(rig: Rig, world: World): boolean {
  if (rig.portalCooldown > 0) {
    rig.portalCooldown--
    return false
  }
  if (world.portals.length === 0) return false

  const pts = rig.pts
  for (let i = 0; i < world.portals.length; i++) {
    const q = world.portals[i]!
    for (let j = 0; j < RIDE_POINTS.length; j++) {
      const p = pts[RIDE_POINTS[j]!]!

      if (segCross(p.px, p.py, p.x, p.y, q.ax, q.ay, q.bx, q.by) >= 0) {
        transport(pts, q.ax, q.ay, q.cx, q.cy, q.qc, q.qs)
        rig.portalCooldown = PORTAL_COOLDOWN
        return true
      }
      // Portals are bidirectional; B->A is the inverse rotation.
      if (segCross(p.px, p.py, p.x, p.y, q.cx, q.cy, q.dx, q.dy) >= 0) {
        transport(pts, q.cx, q.cy, q.ax, q.ay, q.qc, -q.qs)
        rig.portalCooldown = PORTAL_COOLDOWN
        return true
      }
    }
  }
  return false
}

function transport(
  pts: Point[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  qc: number,
  qs: number,
): void {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const rx = p.x - fromX
    const ry = p.y - fromY
    p.x = toX + (rx * qc - ry * qs)
    p.y = toY + (rx * qs + ry * qc)
    const rpx = p.px - fromX
    const rpy = p.py - fromY
    p.px = toX + (rpx * qc - rpy * qs)
    p.py = toY + (rpx * qs + rpy * qc)
  }
}
