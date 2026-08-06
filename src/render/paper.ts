/**
 * The page: paper ground, grain, creases, ruled lines.
 *
 * The rules live in **world space** and pan with the paper, not the viewport.
 * That is the whole trick — it is what makes the level sit *on* the page rather
 * than float in front of it.
 */

import { mulberry32 } from '../level/prng.ts'

/** Ruled lines every 28 px, and one vertical margin rule. */
export const RULE_SPACING = 28
export const MARGIN_RULE_X = 96

/** Grain is generated once, at load, and never animated or regenerated. */
const GRAIN_TILE = 256

let grainPattern: CanvasPattern | null = null

/**
 * Build the paper grain once.
 *
 * Maximum 3% contrast. Subtle to the point of near-invisibility: if you can see
 * it as texture rather than feel it as paper, it is too strong.
 *
 * Seeded from a constant, not the level — the paper stock is the same sheet for
 * everyone, and re-rolling it per level would make the page flicker on load.
 */
export function initGrain(ctx: CanvasRenderingContext2D, grain: string): void {
  if (grainPattern) return

  const tile = document.createElement('canvas')
  tile.width = GRAIN_TILE
  tile.height = GRAIN_TILE
  const tctx = tile.getContext('2d')!
  const rng = mulberry32(0x5eed_1a11)

  const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE)
  const [gr, gg, gb] = parseHex(grain)

  // Value noise, smoothed by averaging a coarse lattice — pure per-pixel noise
  // reads as television static rather than paper fibre.
  const LATTICE = 64
  const lattice = new Float32Array(LATTICE * LATTICE)
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng()

  for (let y = 0; y < GRAIN_TILE; y++) {
    for (let x = 0; x < GRAIN_TILE; x++) {
      const lx = (x / GRAIN_TILE) * LATTICE
      const ly = (y / GRAIN_TILE) * LATTICE
      const x0 = Math.floor(lx)
      const y0 = Math.floor(ly)
      const fx = lx - x0
      const fy = ly - y0
      // Wrap the lattice so the tile is seamless.
      const i00 = (y0 % LATTICE) * LATTICE + (x0 % LATTICE)
      const i10 = (y0 % LATTICE) * LATTICE + ((x0 + 1) % LATTICE)
      const i01 = ((y0 + 1) % LATTICE) * LATTICE + (x0 % LATTICE)
      const i11 = ((y0 + 1) % LATTICE) * LATTICE + ((x0 + 1) % LATTICE)
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const top = lattice[i00]! + (lattice[i10]! - lattice[i00]!) * sx
      const bot = lattice[i01]! + (lattice[i11]! - lattice[i01]!) * sx
      const v = top + (bot - top) * sy

      const o = (y * GRAIN_TILE + x) * 4
      img.data[o] = gr
      img.data[o + 1] = gg
      img.data[o + 2] = gb
      img.data[o + 3] = Math.round(v * 0.03 * 255) // ≤3% contrast
    }
  }
  tctx.putImageData(img, 0, 0)
  grainPattern = ctx.createPattern(tile, 'repeat')
}

/**
 * Paper ground and grain, in *screen* space.
 *
 * Grain does not pan: it is the sheet the whole page is printed on, and sliding
 * it under the camera turns a still texture into visible crawl.
 */
export function drawPaper(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paper: string,
): void {
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  if (grainPattern) {
    ctx.fillStyle = grainPattern
    ctx.fillRect(0, 0, w, h)
  }
}

/** Two soft diagonal crease bands, at 2%. Screen space, like the grain. */
export function drawCreases(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grain: string,
): void {
  ctx.save()
  ctx.globalAlpha = 0.02
  ctx.strokeStyle = grain
  ctx.lineWidth = 90
  ctx.beginPath()
  ctx.moveTo(-100, h * 0.22)
  ctx.lineTo(w + 100, h * 0.05)
  ctx.moveTo(-100, h * 0.78)
  ctx.lineTo(w + 100, h * 0.96)
  ctx.stroke()
  ctx.restore()
}

/**
 * Ruled lines, in world space, clipped to what the camera can see.
 *
 * Called inside the world transform, so it is handed the visible world rect
 * rather than working it out from the viewport itself.
 */
export function drawRules(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
  zoom: number,
  rule: string,
  marginRule: string,
): void {
  ctx.save()
  // Hairlines: keep them one device pixel regardless of zoom, or they fatten
  // into stripes when you zoom in and vanish when you zoom out.
  ctx.lineWidth = 1 / zoom

  // Zoomed out far enough, 28 px rules land a few pixels apart and the page
  // stops reading as ruled paper and starts reading as corduroy. Fade them out
  // before that happens rather than letting them moiré.
  const spacing = RULE_SPACING * zoom
  const ruleAlpha = spacing >= 17 ? 1 : Math.max(0, (spacing - 7) / 10)

  if (ruleAlpha > 0.01) {
    ctx.globalAlpha = ruleAlpha
    ctx.strokeStyle = rule
    ctx.beginPath()
    const first = Math.floor(top / RULE_SPACING) * RULE_SPACING
    for (let y = first; y <= bottom; y += RULE_SPACING) {
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  if (MARGIN_RULE_X >= left && MARGIN_RULE_X <= right) {
    ctx.strokeStyle = marginRule
    ctx.beginPath()
    ctx.moveTo(MARGIN_RULE_X, top)
    ctx.lineTo(MARGIN_RULE_X, bottom)
    ctx.stroke()
  }
  ctx.restore()
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}
