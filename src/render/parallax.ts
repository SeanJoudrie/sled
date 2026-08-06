/**
 * Scribbled conifers, in pencil, at three depths.
 *
 * They exist for exactly one reason: velocity is unreadable against a blank
 * page. Without them a fast run and a slow run look identical.
 *
 * Trees are decoration. They are generated from a seed and never from
 * simulation state, and nothing about them may ever feed back into physics.
 */

import { mulberry32 } from '../level/prng.ts'

/** Depth bands: parallax factor and alpha. Nearer means faster and darker. */
const BANDS = [
  { factor: 0.25, alpha: 0.3, scale: 1.0 },
  { factor: 0.45, alpha: 0.16, scale: 0.72 },
  { factor: 0.7, alpha: 0.08, scale: 0.5 },
] as const

/** How wide one repeat of the tree pattern is, in world units. */
const SPAN = 2400
const PER_BAND = 26

type Tree = { x: number; h: number; lean: number }

let bands: Tree[][] = []
let seeded = -1

/**
 * Lay out the trees for a level.
 *
 * Seeded from the level hash so everyone opening the same link gets the same
 * page — but only re-seeded when the seed actually changes, *not* on every
 * edit. Re-rolling the treeline each time someone adds a stroke would turn the
 * background into a slot machine while they are trying to draw.
 */
export function seedParallax(seed: number): void {
  if (seed === seeded && bands.length) return
  seeded = seed
  const rng = mulberry32(seed)
  bands = BANDS.map(() => {
    const trees: Tree[] = []
    for (let i = 0; i < PER_BAND; i++) {
      trees.push({
        x: rng() * SPAN,
        h: 42 + rng() * 54,
        lean: (rng() * 2 - 1) * 0.14,
      })
    }
    // Draw order must not depend on generation order, or trees pop in front of
    // each other between reseeds.
    trees.sort((a, b) => a.x - b.x)
    return trees
  })
}

/**
 * Draw the bands, in **screen** space.
 *
 * Horizontal parallax only. Vertical velocity is already legible from the ruled
 * lines, which pan in world space — adding a vertical factor here made a long
 * descent fling the treeline off the page for no extra information.
 */
export function drawParallax(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX: number,
  pencil: string,
  stillness = false,
): void {
  if (!bands.length) return

  const baseline = h * 0.82
  ctx.save()
  ctx.strokeStyle = pencil
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b]!
    const trees = bands[b]!
    // prefers-reduced-motion holds the parallax still; the run itself continues,
    // because the run is the content, not decoration.
    const shift = stillness ? 0 : camX * band.factor
    ctx.globalAlpha = band.alpha
    ctx.lineWidth = 1.4

    // Repeat the pattern either side of the viewport so it never runs out.
    const first = Math.floor((shift - w) / SPAN)
    const last = Math.ceil((shift + w) / SPAN)
    for (let k = first; k <= last; k++) {
      for (const t of trees) {
        const x = t.x + k * SPAN - shift
        if (x < -80 || x > w + 80) continue
        conifer(ctx, x, baseline, t.h * band.scale, t.lean)
      }
    }
  }
  ctx.restore()
}

/** One scribbled fir: a trunk and three zig-zag tiers. Drawn, not rendered. */
function conifer(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  h: number,
  lean: number,
): void {
  const tipX = x + h * lean
  ctx.beginPath()
  ctx.moveTo(x, base)
  ctx.lineTo(x + h * lean * 0.35, base - h * 0.22)
  ctx.stroke()

  const tiers = 3
  for (let i = 0; i < tiers; i++) {
    const t0 = 0.22 + (i / tiers) * 0.78
    const t1 = 0.22 + ((i + 1) / tiers) * 0.78
    const y0 = base - h * t0
    const y1 = base - h * t1
    const spread = (1 - t0) * h * 0.36
    const cx0 = x + (tipX - x) * t0
    const cx1 = x + (tipX - x) * t1
    ctx.beginPath()
    ctx.moveTo(cx0 - spread, y0)
    ctx.lineTo(cx1, y1)
    ctx.lineTo(cx0 + spread, y0)
    ctx.stroke()
  }
}
