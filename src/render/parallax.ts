/**
 * The scenery behind the page: conifers and rooftops, in pencil.
 *
 * They exist for one reason: velocity is unreadable against a blank page.
 * Without them a fast run and a slow run look the same.
 *
 * Parallax runs in **both axes**. A first pass moved only horizontally, on the
 * theory that the ruled lines already carried vertical speed — they do not.
 * Dropping down a long hill is most of what happens in this game, and with a
 * fixed treeline the whole background sat dead still through the part of the
 * run that most needs to feel fast.
 *
 * Scenery is decoration. It is generated from a seed and never from simulation
 * state, and nothing about it may ever feed back into physics.
 */

import { mulberry32 } from '../level/prng.ts'

/**
 * Depth bands: parallax factor, alpha, scale.
 *
 * Vertical factor is deliberately gentler than horizontal — a hill drops much
 * further than it runs, and matching the two makes the scenery streak.
 */
const BANDS = [
  { fx: 0.25, fy: 0.14, alpha: 0.38, scale: 1.0 },
  { fx: 0.45, fy: 0.24, alpha: 0.25, scale: 0.74 },
  { fx: 0.7, fy: 0.4, alpha: 0.15, scale: 0.52 },
] as const

/**
 * One repeat of the pattern, in parallax space. Wraps in both axes.
 *
 * SPAN_Y is deliberately large. Three bands already put three ridgelines on
 * screen at once; a short vertical repeat stacks more on top of those and the
 * background stops reading as distance and starts reading as wallpaper.
 */
const SPAN_X = 2400
const SPAN_Y = 1100
const PER_BAND = 20

type Prop = {
  x: number
  /** Height for a tree, or roof height for a building. */
  h: number
  lean: number
  kind: 'tree' | 'building'
  /** Buildings only: width, and the window grid. */
  w: number
  cols: number
  rows: number
}

let bands: Prop[][] = []
let seeded = -1

/**
 * Lay out the scenery for a level.
 *
 * Seeded from the level hash so everyone opening the same link gets the same
 * skyline — but only re-seeded when the seed actually changes, *not* on every
 * edit. Re-rolling on each stroke would turn the background into a slot machine
 * while someone is trying to draw.
 */
export function seedParallax(seed: number): void {
  if (seed === seeded && bands.length) return
  seeded = seed
  const rng = mulberry32(seed)

  bands = BANDS.map(() => {
    const props: Prop[] = []
    for (let i = 0; i < PER_BAND; i++) {
      // Roughly a third buildings, so a ridgeline reads as a place rather than
      // an infinite forest.
      const building = rng() < 0.34
      props.push({
        x: rng() * SPAN_X,
        h: building ? 46 + rng() * 78 : 44 + rng() * 56,
        lean: building ? 0 : (rng() * 2 - 1) * 0.14,
        kind: building ? 'building' : 'tree',
        w: 26 + rng() * 34,
        cols: 2 + Math.floor(rng() * 3),
        rows: 2 + Math.floor(rng() * 4),
      })
    }
    // Draw order must not depend on generation order, or props pop in front of
    // each other between reseeds.
    props.sort((a, b) => a.x - b.x)
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

    // Wrap in both axes so the scenery never runs out in either direction.
    const rowShift = ((shiftY % SPAN_Y) + SPAN_Y) % SPAN_Y
    const firstCol = Math.floor((shiftX - w) / SPAN_X)
    const lastCol = Math.ceil((shiftX + w) / SPAN_X)

    for (let row = -1; row <= Math.ceil(h / SPAN_Y) + 1; row++) {
      const baseline = h * 0.8 + row * SPAN_Y - rowShift
      if (baseline < -220 || baseline > h + 220) continue

      for (let k = firstCol; k <= lastCol; k++) {
        for (const p of props) {
          const x = p.x + k * SPAN_X - shiftX
          if (x < -110 || x > w + 110) continue
          if (p.kind === 'tree') conifer(ctx, x, baseline, p.h * band.scale, p.lean)
          else building(ctx, x, baseline, p.w * band.scale, p.h * band.scale, p.cols, p.rows)
        }
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

/**
 * One building: an outline and a grid of square windows.
 *
 * Deliberately not square. Each corner is nudged a little and the walls are
 * drawn as single strokes with slight overshoot, which is what a hand does with
 * a pencil and a straight edge it is not using. A perfectly true rectangle
 * would read as printed, and the whole page is meant to look drawn.
 */
function building(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
): void {
  if (w < 6 || h < 10) return
  const left = x - w / 2
  const right = x + w / 2
  const top = base - h
  // A fixed, tiny skew per building keeps it hand-drawn without needing a PRNG
  // draw here — this runs every frame and must not consume randomness.
  const skew = (w * 0.035) * (((x | 0) % 3) - 1)

  ctx.beginPath()
  ctx.moveTo(left, base)
  ctx.lineTo(left + skew, top)
  ctx.lineTo(right + skew * 0.6, top + Math.abs(skew) * 0.35)
  ctx.lineTo(right, base)
  ctx.stroke()

  // Windows: little squares, inset, skipping the odd one so it reads as lit.
  const padX = w * 0.18
  const padY = h * 0.16
  const cw = (w - padX * 2) / cols
  const chh = (h - padY * 2) / rows
  const s = Math.min(cw, chh) * 0.52
  if (s < 1.4) return

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Deterministic gaps — no randomness in a per-frame path.
      if ((r * 7 + c * 3 + (x | 0)) % 5 === 0) continue
      const wx = left + padX + cw * (c + 0.5) + skew * (1 - (base - (base - h * 0.5)) / h)
      const wy = top + padY + chh * (r + 0.5)
      ctx.strokeRect(wx - s / 2, wy - s / 2, s, s)
    }
  }
}
