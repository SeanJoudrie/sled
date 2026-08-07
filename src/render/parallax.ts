/**
 * The margin of the page: trees, houses, a bad Eiffel Tower, and whatever a kid
 * would draw in the gap while thinking.
 *
 * It exists for one reason: velocity is unreadable against a blank page.
 * Without it a fast run and a slow run look the same.
 *
 * Parallax runs in **both axes**. A first pass moved only horizontally, on the
 * theory that the ruled lines carried vertical speed — they do not, and
 * descending is most of what happens here.
 *
 * Scenery is decoration. It is generated from a seed and never from simulation
 * state, and nothing about it may ever feed back into physics.
 */

import { mulberry32 } from '../level/prng.ts'
import { GROUND_KINDS, SKY_KINDS, drawDoodle } from './doodles.ts'
import type { Doodle } from './doodles.ts'

/**
 * Depth bands: parallax factor, alpha, scale.
 *
 * Vertical factor is gentler than horizontal — a hill drops much further than
 * it runs, and matching the two makes the scenery streak.
 */
const BANDS = [
  { fx: 0.25, fy: 0.14, alpha: 0.38, scale: 1.0 },
  { fx: 0.45, fy: 0.24, alpha: 0.25, scale: 0.74 },
  { fx: 0.7, fy: 0.4, alpha: 0.15, scale: 0.52 },
] as const

/** One repeat of the pattern, in parallax space. Wraps in both axes. */
const SPAN_X = 2400
const SPAN_Y = 1100
const GROUND_PER_BAND = 16
const SKY_PER_BAND = 9

let bands: Doodle[][] = []
let seeded = -1

/**
 * Lay out the scenery.
 *
 * The seed is rolled fresh each page load rather than derived from the level,
 * so the margin is different every time you come back — which is the point of
 * having a margin. The trade is that two people opening the same link see
 * different doodles.
 *
 * That is safe *only* because scenery is decoration: the determinism law
 * governs the simulation, and check 12 proves `sim/` cannot reach this file at
 * all. If anything here ever became load-bearing, this has to go back to being
 * level-seeded on the same day.
 */
export function seedParallax(seed: number): void {
  if (seed === seeded && bands.length) return
  seeded = seed
  const rng = mulberry32(seed)

  bands = BANDS.map(() => {
    const props: Doodle[] = []

    for (let i = 0; i < GROUND_PER_BAND; i++) {
      props.push({
        kind: GROUND_KINDS[Math.floor(rng() * GROUND_KINDS.length)]!,
        x: rng() * SPAN_X,
        lift: 0,
        size: 44 + rng() * 62,
        bend: (rng() * 2 - 1) * 0.16,
        a: 26 + rng() * 34,
        bIdx: Math.floor(rng() * 97),
      })
    }

    for (let i = 0; i < SKY_PER_BAND; i++) {
      props.push({
        kind: SKY_KINDS[Math.floor(rng() * SKY_KINDS.length)]!,
        x: rng() * SPAN_X,
        // Well clear of the ground line, so the sky reads as sky.
        lift: 150 + rng() * 460,
        size: 40 + rng() * 54,
        bend: rng() * Math.PI * 2,
        a: 0,
        bIdx: Math.floor(rng() * 97),
      })
    }

    // Draw order must not depend on generation order, or props pop in front of
    // each other between reseeds.
    props.sort((p, q) => p.x - q.x)
    return props
  })
}

export function drawParallax(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX: number,
  camY: number,
  pencil: string,
  stillness = false,
): void {
  if (!bands.length) return

  ctx.save()
  ctx.strokeStyle = pencil
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b]!
    const props = bands[b]!
    // prefers-reduced-motion holds the scenery still. The run itself continues,
    // because the run is the content, not decoration.
    const shiftX = stillness ? 0 : camX * band.fx
    const shiftY = stillness ? 0 : camY * band.fy

    ctx.globalAlpha = band.alpha
    ctx.lineWidth = 1.5

    const rowShift = ((shiftY % SPAN_Y) + SPAN_Y) % SPAN_Y
    const firstCol = Math.floor((shiftX - w) / SPAN_X)
    const lastCol = Math.ceil((shiftX + w) / SPAN_X)

    for (let row = -1; row <= Math.ceil(h / SPAN_Y) + 1; row++) {
      const baseline = h * 0.8 + row * SPAN_Y - rowShift
      // Sky props sit up to 610 above the line, so the cull has to reach that
      // far or they vanish while still on screen.
      if (baseline < -260 || baseline > h + 700) continue

      for (let k = firstCol; k <= lastCol; k++) {
        for (const p of props) {
          const x = p.x + k * SPAN_X - shiftX
          if (x < -140 || x > w + 140) continue
          drawDoodle(ctx, { ...p, x, size: p.size * band.scale, lift: p.lift * band.scale }, baseline)
        }
      }
    }
  }
  ctx.restore()
}
