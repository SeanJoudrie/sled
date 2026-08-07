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

      // Crinkle: the same lattice run through a ridge function, which turns
      // smooth blobs into creased facets. This is what makes it read as a sheet
      // that has been folded and flattened rather than as clean stock — the
      // ruled lines stay perfectly straight, it is only the tone that crumples.
      const ridge = 1 - Math.abs(v * 2 - 1)
      const crinkle = ridge * ridge * ridge

      const o = (y * GRAIN_TILE + x) * 4
      img.data[o] = gr
      img.data[o + 1] = gg
      img.data[o + 2] = gb
      // Fibre plus crinkle, still inside the 3% ceiling the page is built on.
      img.data[o + 3] = Math.round((v * 0.018 + crinkle * 0.022) * 255)
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

/** How far apart the folds sit, in world units. Roughly a sheet folded in thirds. */
const FOLD_SPACING_Y = 1120
export const FOLD_SPACING_X = 1680

/**
 * Folds and creases — the thing that makes it a *sheet* rather than a colour.
 *
 * Drawn in **world space**, which is the whole point. The first version put
 * two diagonal bands in screen space, so they slid across the paper as you
 * panned: the one element on the page that visibly did not belong to it.
 *
 * A fold is a pair, not a line — a soft shadow on one side and a thin catch of
 * light on the other, which is what a crease actually does to a flat surface.
 *
 * These ran at 2.5% and 1.8% and were, in practice, invisible: I could not find
 * them in a screenshot at any zoom while actively looking. Something you cannot
 * locate when you are hunting for it is not subtle, it is absent — and it was
 * costing a per-frame pass to be absent. Raised until they register. Still well
 * under the threshold where they would read as texture rather than as feel.
 */
export function drawCreases(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
  zoom: number,
  grain: string,
  paper: string,
): void {
  ctx.save()

  const shadow = Math.max(6, 26 / zoom)
  const firstY = Math.floor(top / FOLD_SPACING_Y) * FOLD_SPACING_Y
  const firstX = Math.floor(left / FOLD_SPACING_X) * FOLD_SPACING_X

  for (let y = firstY; y <= bottom + FOLD_SPACING_Y; y += FOLD_SPACING_Y) {
    // A horizontal fold is never quite straight, and never quite level.
    const sag = ((y / FOLD_SPACING_Y) % 2 === 0 ? 1 : -1) * 5

    ctx.globalAlpha = 0.045
    ctx.strokeStyle = grain
    ctx.lineWidth = shadow
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.quadraticCurveTo((left + right) / 2, y + sag, right, y + sag * 0.4)
    ctx.stroke()

    // The lit side of the crease, one hairline above the shadow.
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = paper
    ctx.lineWidth = Math.max(0.6, 1.6 / zoom)
    ctx.beginPath()
    ctx.moveTo(left, y - shadow * 0.32)
    ctx.quadraticCurveTo((left + right) / 2, y + sag - shadow * 0.32, right, y + sag * 0.4 - shadow * 0.32)
    ctx.stroke()
  }

  // One vertical fold per sheet-width, softer than the horizontals.
  ctx.globalAlpha = 0.032
  ctx.strokeStyle = grain
  ctx.lineWidth = shadow * 1.15
  ctx.beginPath()
  for (let x = firstX; x <= right + FOLD_SPACING_X; x += FOLD_SPACING_X) {
    ctx.moveTo(x, top)
    ctx.quadraticCurveTo(x + 7, (top + bottom) / 2, x, bottom)
  }
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

  // One margin rule per sheet-width, landing with the vertical folds, so a long
  // track reads as running across consecutive sheets. It used to be a single
  // line at world x = 96: pan a couple of screens right — which a descent does
  // constantly — and the most recognisable feature of ruled paper was gone for
  // good, leaving generic lined paper forever.
  ctx.strokeStyle = marginRule
  ctx.beginPath()
  const firstMargin = Math.floor((left - MARGIN_RULE_X) / FOLD_SPACING_X) * FOLD_SPACING_X
  for (let x = MARGIN_RULE_X + firstMargin; x <= right; x += FOLD_SPACING_X) {
    if (x < left) continue
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
  }
  ctx.stroke()
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
