/**
 * The things a kid draws in the margin.
 *
 * Deliberately bad. Everything here is a handful of straight-ish strokes with
 * no shading, no perspective and no care — the Eiffel Tower is four lines and a
 * couple of crossbars, and it should read as *someone drew that in a notebook*
 * rather than as an illustration. If any of these starts looking accomplished,
 * it is wrong.
 *
 * All of it is scenery. It is generated from a seed and never from simulation
 * state, and nothing here may ever feed back into physics.
 */

export type DoodleKind =
  | 'conifer'
  | 'roundtree'
  | 'house'
  | 'building'
  | 'tower'
  | 'star'
  | 'shootingstar'
  | 'planet'
  | 'comet'
  | 'cools'

/** Kinds that stand on the ground line. */
export const GROUND_KINDS: readonly DoodleKind[] = [
  'conifer', 'conifer', 'roundtree', 'house', 'house', 'building', 'tower',
]

/** Kinds that float in the sky above it. */
export const SKY_KINDS: readonly DoodleKind[] = [
  'star', 'star', 'shootingstar', 'planet', 'comet', 'cools',
]

export type Doodle = {
  kind: DoodleKind
  x: number
  /** Height above the ground line. 0 for things standing on it. */
  lift: number
  size: number
  /** Per-doodle wobble, so two of the same kind are never identical. */
  bend: number
  a: number
  bIdx: number
}

/**
 * Draw one.
 *
 * `ctx` is expected to have strokeStyle, alpha and lineWidth already set — the
 * caller owns the band's depth, and a doodle that reached for its own colour
 * would break the parallax layering.
 */
export function drawDoodle(ctx: CanvasRenderingContext2D, d: Doodle, base: number): void {
  const y = base - d.lift
  switch (d.kind) {
    case 'conifer': return conifer(ctx, d.x, y, d.size, d.bend)
    case 'roundtree': return roundTree(ctx, d.x, y, d.size, d.bend)
    case 'house': return house(ctx, d.x, y, d.size, d.bIdx)
    case 'building': return building(ctx, d.x, y, d.size, d.a, d.bIdx)
    case 'tower': return tower(ctx, d.x, y, d.size)
    case 'star': return star(ctx, d.x, y, d.size * 0.24)
    case 'shootingstar': return shootingStar(ctx, d.x, y, d.size * 0.5, d.bend)
    case 'planet': return planet(ctx, d.x, y, d.size * 0.26, d.bend)
    case 'comet': return comet(ctx, d.x, y, d.size * 0.4, d.bend)
    case 'cools': return coolS(ctx, d.x, y, d.size * 0.5)
  }
}

const line = (ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) => {
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}

/** A trunk and three zig-zag tiers. */
function conifer(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, lean: number): void {
  const tipX = x + h * lean
  line(ctx, x, base, x + h * lean * 0.35, base - h * 0.22)
  for (let i = 0; i < 3; i++) {
    const t0 = 0.22 + (i / 3) * 0.78
    const t1 = 0.22 + ((i + 1) / 3) * 0.78
    const spread = (1 - t0) * h * 0.36
    const cx0 = x + (tipX - x) * t0
    const cx1 = x + (tipX - x) * t1
    ctx.beginPath()
    ctx.moveTo(cx0 - spread, base - h * t0)
    ctx.lineTo(cx1, base - h * t1)
    ctx.lineTo(cx0 + spread, base - h * t0)
    ctx.stroke()
  }
}

/** A stick and a scribbled blob. The other tree every kid draws. */
function roundTree(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, bend: number): void {
  line(ctx, x, base, x, base - h * 0.45)
  const r = h * 0.3
  const cy = base - h * 0.66
  ctx.beginPath()
  // Four overlapping arcs, not one circle — a circle looks printed.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + bend
    ctx.moveTo(x + Math.cos(a) * r * 0.55 + r, cy + Math.sin(a) * r * 0.5)
    ctx.arc(x + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.5, r * 0.62, 0, Math.PI * 2)
  }
  ctx.stroke()
}

/** Square, triangle roof, one door, one window. */
function house(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, seed: number): void {
  const w = h * 0.82
  const wallTop = base - h * 0.62
  ctx.beginPath()
  ctx.moveTo(x - w / 2, base)
  ctx.lineTo(x - w / 2, wallTop)
  ctx.lineTo(x + w / 2, wallTop)
  ctx.lineTo(x + w / 2, base)
  ctx.stroke()
  // Roof, one side always longer than the other.
  ctx.beginPath()
  ctx.moveTo(x - w * 0.6, wallTop)
  ctx.lineTo(x + (seed % 2 ? -w * 0.06 : w * 0.06), base - h)
  ctx.lineTo(x + w * 0.6, wallTop)
  ctx.stroke()
  // Door.
  ctx.strokeRect(x - w * 0.14, base - h * 0.3, w * 0.28, h * 0.3)
  // Window, offset to one side.
  const wx = x + (seed % 3 === 0 ? -w * 0.3 : w * 0.28)
  ctx.strokeRect(wx - w * 0.1, wallTop + h * 0.08, w * 0.2, h * 0.16)
}

/** An outline and a grid of square windows, deliberately not square. */
function building(
  ctx: CanvasRenderingContext2D, x: number, base: number, h: number, w: number, seed: number,
): void {
  if (w < 6 || h < 10) return
  const left = x - w / 2
  const right = x + w / 2
  const top = base - h
  const skew = w * 0.035 * ((seed % 3) - 1)

  ctx.beginPath()
  ctx.moveTo(left, base)
  ctx.lineTo(left + skew, top)
  ctx.lineTo(right + skew * 0.6, top + Math.abs(skew) * 0.35)
  ctx.lineTo(right, base)
  ctx.stroke()

  const cols = 2 + (seed % 3)
  const rows = 2 + (seed % 4)
  const padX = w * 0.18
  const padY = h * 0.16
  const cw = (w - padX * 2) / cols
  const chh = (h - padY * 2) / rows
  const s = Math.min(cw, chh) * 0.52
  if (s < 1.4) return
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r * 7 + c * 3 + seed) % 5 === 0) continue
      ctx.strokeRect(
        left + padX + cw * (c + 0.5) - s / 2,
        top + padY + chh * (r + 0.5) - s / 2,
        s, s,
      )
    }
  }
}

/** Four lines and two crossbars. It is the Eiffel Tower if you squint. */
function tower(ctx: CanvasRenderingContext2D, x: number, base: number, h: number): void {
  const foot = h * 0.3
  const waist = h * 0.1
  ctx.beginPath()
  ctx.moveTo(x - foot, base)
  ctx.quadraticCurveTo(x - waist, base - h * 0.5, x, base - h)
  ctx.moveTo(x + foot, base)
  ctx.quadraticCurveTo(x + waist, base - h * 0.5, x, base - h)
  ctx.stroke()
  // The arch at the bottom and one platform, which is all anyone remembers.
  ctx.beginPath()
  ctx.moveTo(x - foot * 0.72, base - h * 0.2)
  ctx.quadraticCurveTo(x, base - h * 0.05, x + foot * 0.72, base - h * 0.2)
  ctx.stroke()
  line(ctx, x - waist * 1.5, base - h * 0.52, x + waist * 1.5, base - h * 0.52)
}

/**
 * The five-line star, drawn without lifting the pencil.
 *
 * Step **two** vertices of the pentagon per stroke, not four. Four is congruent
 * to minus one mod five, so it traces the pentagon's own perimeter backwards
 * and you get a plain five-sided blob instead of a star.
 */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i <= 5; i++) {
    const a = ((i * 2) % 5) * ((Math.PI * 2) / 5) - Math.PI / 2
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.stroke()
}

/** A star with three speed lines behind it. */
function shootingStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bend: number): void {
  star(ctx, x, y, r * 0.5)
  const dx = -Math.cos(bend + 0.4) * r * 2.4
  const dy = -Math.sin(bend + 0.4) * r * 1.1
  for (let i = -1; i <= 1; i++) {
    line(ctx, x + dx * 0.35 + i * 3, y + dy * 0.35 + i * 3.5, x + dx + i * 3, y + dy + i * 3.5)
  }
}

/** A circle and a ring, because every kid's planet is Saturn. */
function planet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bend: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.35 + bend * 0.3)
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 1.85, r * 0.42, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** A blob with a tail. */
function comet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bend: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r * 0.38, 0, Math.PI * 2)
  ctx.stroke()
  const ang = bend + 2.6
  for (let i = 0; i < 3; i++) {
    const spread = (i - 1) * 0.22
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang + spread) * r * 0.5, y + Math.sin(ang + spread) * r * 0.5)
    ctx.lineTo(x + Math.cos(ang + spread) * r * 2.2, y + Math.sin(ang + spread) * r * 2.2)
    ctx.stroke()
  }
}

/**
 * That S.
 *
 * Six strokes, two pointed ends, and nobody has ever known what it is called.
 * It has to be slightly wrong to be right.
 */
function coolS(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  const w = h * 0.3
  const topA = y - h * 0.26 // where the rails begin, below the point
  const botA = y + h * 0.26
  const midL = y + h * 0.07
  const midR = y - h * 0.07

  // The two rails: left runs high-to-low, right low-to-high. They are what make
  // it read as an S rather than a zigzag.
  ctx.beginPath()
  ctx.moveTo(x - w, topA)
  ctx.lineTo(x - w, midL)
  ctx.moveTo(x + w, midR)
  ctx.lineTo(x + w, botA)
  ctx.stroke()

  // The crossing diagonal.
  ctx.beginPath()
  ctx.moveTo(x - w, midL)
  ctx.lineTo(x + w, midR)
  ctx.stroke()

  // Pointed ends: a shallow V at the top, another at the bottom.
  ctx.beginPath()
  ctx.moveTo(x - w, topA)
  ctx.lineTo(x, y - h * 0.5)
  ctx.lineTo(x + w, midR)
  ctx.moveTo(x + w, botA)
  ctx.lineTo(x, y + h * 0.5)
  ctx.lineTo(x - w, midL)
  ctx.stroke()
}
