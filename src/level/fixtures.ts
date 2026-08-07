/**
 * The fixture levels.
 *
 * Two of them are gate fixtures, shared with the tuning harness deliberately: if
 * the thing you watch and the thing CI checks are different tracks, a feel
 * change can quietly break a gate that still reports green on its own private
 * level.
 *
 * The third, `fixtureDemo`, is the track a first visitor lands on. It is checked
 * too — check 16 asserts it still fits a phone whole and still ends in a win,
 * because the first five seconds is the one thing nothing else tests.
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
 * The track a first visitor lands on.
 *
 * Deliberately **short**, and that is the whole point. The descent below is
 * 2200 px wide, and `fitZoom` will not frame anything wider than about 590 px on
 * a 390 px phone without dropping below a legible zoom — so it framed the start
 * instead and cropped the rest. The result was a tutorial that taught three of
 * eight brushes, hid the spikes, the water, the well and the wind off the right
 * edge, and gave no indication it was holding anything back.
 *
 * This one is 520 px wide and fits **whole** on a phone at 0.5625 and on a
 * desktop at 1.0. It touches all eight brushes in two and a half seconds, and it
 * ends on the finish tape — the previous example ended on a kill wall, so the
 * first thing every new visitor watched was a failure, and almost nobody ever
 * saw that winning was a thing.
 *
 * The gate keeps using the two fixtures below. They exist to cover mechanics;
 * this one exists to be someone's first five seconds. One level was doing both
 * jobs badly.
 *
 * The water pool is genuinely local — `submerged` bounds the half-plane to the
 * segment's own x span — so it sits under the ice run as something to look at
 * rather than something the sled quietly swims through.
 */
export function fixtureDemo(): Level {
  return {
    v: 1,
    r: [0, 0, 0, 0],
    s: [36, 14],
    l: [
      L(BRUSH.INK, 0, 0, 110, 64),
      L(BRUSH.ICE, 110, 64, 230, 132),
      L(BRUSH.INK, 230, 132, 270, 150),
      L(BRUSH.TAR, 270, 150, 330, 168),
      L(BRUSH.INK, 330, 168, 360, 178),
      L(BRUSH.BOOST, 360, 178, 440, 202),
      L(BRUSH.INK, 440, 202, 520, 224),
      // Below the track, not on it: red should read as "avoid" before anyone
      // draws with it.
      L(BRUSH.SPIKES, 250, 250, 330, 250),
      L(BRUSH.WATER, 120, 300, 240, 300),
      L(BRUSH.FINISH, 500, 170, 500, 270),
      L(BRUSH.SCENERY, 70, -46, 132, -74),
    ],
    p: [],
    g: [],
    w: [],
  }
}

/**
 * A long descent, touching every one of the physical brushes and both force
 * stamps. Ends on a kill wall at the bottom.
 *
 * Gate fixture. Nobody is shown this on load any more — see `fixtureDemo`.
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
      L(BRUSH.SPIKES, 2200, 380, 2200, 480),
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
      // Finish tape across the run-out. Without this the fixture ended "gone",
      // which tested the off-track guard and nothing about winning.
      L(BRUSH.FINISH, 2450, 640, 2450, 760),
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
