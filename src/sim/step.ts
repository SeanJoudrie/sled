/**
 * One fixed step.
 *
 * There is no `dt`. Every constant is per tick or per tick², and the order of
 * the phases below is part of the definition of the simulation — reordering
 * them changes every existing level string.
 */

import { AIR, BUOYANCY, GRAVITY, WATER_DRAG } from './consts.ts'
import type { Rig, World } from './types.ts'
import { IS_RIDE, applyPosture, solveConstraints } from './rig.ts'
import { crashed, offTrack, resolveContacts, submerged } from './collide.ts'
import { applyPortals, stampForce } from './stamps.ts'

/** Scratch for stamp forces. Reused across points; never read across ticks. */
const force = { fx: 0, fy: 0 }

export function step(rig: Rig, world: World): void {
  if (rig.state !== 'running') return

  const pts = rig.pts

  // 1 · Integrate. Position Verlet: velocity is implicit in (x - px).
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    stampForce(p.x, p.y, world, force)

    let vx = (p.x - p.px) * AIR
    let vy = (p.y - p.py) * AIR
    let gy = GRAVITY

    // Water is a half-plane, not a surface to collide with. Buoyancy at 0.06
    // against gravity at 0.12 means he sinks and drags heavily: a water section
    // is a speed penalty you can survive, not a wall.
    if (IS_RIDE[i]! && submerged(p.x, p.y, world)) {
      vx *= 1 - WATER_DRAG
      vy *= 1 - WATER_DRAG
      gy -= BUOYANCY
    }

    p.px = p.x
    p.py = p.y
    p.x += vx + force.fx
    p.y += vy + force.fy + gy
  }

  // 2 · Portals, tested against the motion this tick just produced.
  applyPortals(rig, world)

  // 3 · Constraints, then posture. Complementary: distance stops the head
  //     sinking into the sled, posture stops it mirroring underneath.
  solveConstraints(pts)
  applyPosture(pts)

  // 4 · Contact. After the solve, so nothing the solve nudged is left buried.
  resolveContacts(pts, world)

  // 5 · Did the run end?
  if (crashed(pts, world)) {
    rig.state = 'crashed'
  } else if (offTrack(pts, world)) {
    rig.state = 'gone'
  }

  rig.tick++
}

/** Advance n ticks, stopping early if the run ends. Returns ticks actually run. */
export function stepN(rig: Rig, world: World, n: number): number {
  let i = 0
  for (; i < n; i++) {
    if (rig.state !== 'running') break
    step(rig, world)
  }
  return i
}
