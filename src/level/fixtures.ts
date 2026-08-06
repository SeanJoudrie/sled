/**
 * The two fixture levels.
 *
 * Shared by the determinism gate and the tuning harness deliberately: if the
 * thing you watch and the thing CI checks are different tracks, a feel change
 * can quietly break a gate that still reports green on its own private level.
 *
 * All coordinates are exact multiples of 0.5 and all wind strengths exact in
 * thousandths, so a wire round-trip is lossless and can be compared deeply.
 */

import { BRUSH } from '../sim/index.ts'
import type { BrushId, Level } from '../sim/index.ts'

const L = (
  brush: BrushId,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): [BrushId, number, number, number, number] => [brush, x1, y1, x2, y2]

/**
 * A long descent, touching every one of the seven brushes and both force
 * stamps. Ends on a kill wall at the bottom.
 *
 * The start flag sits *on* the line, not before it. The sled is 20 px long, so
 * a flag near the start of a track leaves the tail hanging off the end with
 * nothing to rest on, and the rig pivots about the nose and drops the head in.
 */
export function fixtureDescent(): Level {
  return {
    v: 1,
    r: [1, 2, 3, 4],
    s: [80, 24],
    l: [
      L(BRUSH.INK, 0, 0, 200, 60),
      L(BRUSH.INK, 200, 60, 400, 140),
      L(BRUSH.ICE, 400, 140, 650, 230),
      L(BRUSH.INK, 650, 230, 800, 300),
      L(BRUSH.TAR, 800, 300, 1000, 340),
      L(BRUSH.INK, 1000, 340, 1150, 380),
      L(BRUSH.BOOST, 1150, 380, 1350, 420),
      L(BRUSH.INK, 1350, 420, 1600, 480),
      L(BRUSH.INK, 1600, 480, 2200, 480),
      L(BRUSH.WATER, 1700, 440, 2100, 440),
      L(BRUSH.SCENERY, 300, -100, 400, -160),
      L(BRUSH.SCENERY, 900, -40, 980, -120),
      // A wall at the end of the floor, so the run ends on a runner hitting a
      // kill line rather than the head clipping one on the way past — the
      // mechanic is contact by any point, and this pins the common case.
      L(BRUSH.KILL, 2200, 380, 2200, 480),
    ],
    p: [],
    g: [[900, 100, 600]],
    w: [[1200, 400, 1300, 400, 0.02, 0]],
  }
}

/**
 * A straight ramp through a rotating portal pair, onto a second ramp.
 *
 * A is vertical and crosses the first ramp; B is tilted so the rotation between
 * them (qc 0.96, qs -0.28, about -16.26°) maps the first ramp's direction
 * exactly onto the second's. He should exit running parallel to the floor he
 * lands on — any height pop or stutter here is a bug, not tuning.
 *
 * The angle is deliberately neither zero nor a right angle: a pure translation
 * would pass with qs stuck at 0 and prove nothing about the complex multiply,
 * which is the only subtle arithmetic in the whole simulation.
 *
 * B is deliberately **short**. The transform puts him the same distance along B
 * as he was along A, and he crosses A about 48 px from its start — so a B any
 * longer than that materialises him on top of itself, he re-enters as soon as
 * the 3-tick cooldown lapses, and the pair becomes the inescapable loop
 * described in §9.8 of the spec. B keeps its direction (7, 24) exactly, so the
 * rotation is unchanged; only its length moves out of his way.
 */
export function fixturePortal(): Level {
  return {
    v: 1,
    r: [0, 0, 0, 0],
    s: [80, 40],
    l: [
      L(BRUSH.INK, 0, 0, 600, 300),
      L(BRUSH.INK, 900, 500, 2000, 700),
      L(BRUSH.INK, 2000, 700, 2600, 700),
    ],
    p: [[400, 150, 400, 250, 1200, 480, 1207, 504, 0]],
    g: [],
    // A vortex over the lower floor. The descent fixture covers arrow wind, and
    // without this the vortex branch is never executed by any fixture — which
    // means the runtime trap in the determinism gate cannot see it, and only
    // the static grep guards that half of the stamp.
    // Its centre is the segment's start; its radius is the segment's length.
    w: [[1500, 500, 1500, 650, 0.03, 1]],
  }
}
