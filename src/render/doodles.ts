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

/**
 * A trunk and a stack of zig-zag tiers.
 *
 * The tier *count* scales with height. Three fixed tiers is right on a small
 * tree and wrong on a tall one: the gaps grow with it until the thing stops
 * reading as a tree and starts reading as three separate hills. A kid drawing
 * a big one fills the space with more branches, so this does too.
 */
function conifer(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, lean: number): void {
  const tipX = x + h * lean
  line(ctx, x, base, x + h * lean * 0.35, base - h * 0.2)
  const tiers = h > 120 ? 5 : h > 68 ? 4 : 3
  for (let i = 0; i < tiers; i++) {
    const t0 = 0.2 + (i / tiers) * 0.8
    const t1 = 0.2 + ((i + 1) / tiers) * 0.8
    // The constant term stops the topmost tier collapsing to a bare spike.
    const spread = (1 - t0) * h * 0.3 + h * 0.035
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
  //
  // The moveTo has to land on the arc's own start point (centre + its radius,
  // at angle 0). The first version moved to centre + `r` while the arc ran at
  // `r * 0.62`, so canvas joined the gap and every tree grew a stray tick out
  // of its right side.
  const blob = r * 0.62
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + bend
    const bx = x + Math.cos(a) * r * 0.55
    const by = cy + Math.sin(a) * r * 0.5
    ctx.moveTo(bx + blob, by)
    ctx.arc(bx, by, blob, 0, Math.PI * 2)
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

/**
 * The Eiffel Tower, if you squint.
 *
 * The first version ran both legs as one curve from the foot straight to the
 * apex, which draws a **triangle** — at any size above small it read as a tent.
 * The silhouette people actually recognise is an hourglass: a hard flare at the
 * feet, a pinch at the second deck, then a near-vertical mast. Two decks, one
 * arch, one antenna, and it lands.
 */
function tower(ctx: CanvasRenderingContext2D, x: number, base: number, h: number): void {
  const foot = h * 0.32
  const waist = h * 0.075
  const deck1 = base - h * 0.3
  const deck2 = base - h * 0.62
  const top = base - h

  ctx.beginPath()
  ctx.moveTo(x - foot, base)
  ctx.quadraticCurveTo(x - foot * 0.42, deck1, x - waist, deck2)
  ctx.lineTo(x - waist * 0.35, top)
  ctx.moveTo(x + foot, base)
  ctx.quadraticCurveTo(x + foot * 0.42, deck1, x + waist, deck2)
  ctx.lineTo(x + waist * 0.35, top)
  ctx.stroke()

  // The arch under the first deck, sagging between the feet.
  ctx.beginPath()
  ctx.moveTo(x - foot * 0.76, deck1)
  ctx.quadraticCurveTo(x, base - h * 0.15, x + foot * 0.76, deck1)
  ctx.stroke()

  line(ctx, x - foot * 0.52, deck1, x + foot * 0.52, deck1)
  line(ctx, x - waist * 1.3, deck2, x + waist * 1.3, deck2)
  line(ctx, x, top, x, top - h * 0.08)
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

/**
 * A star with three speed lines behind it.
 *
 * The streaks are **parallel**, which is what separates this from the comet —
 * the comet's tail fans. Every offset here is a multiple of `r`: the first
 * version spaced them by a flat 3 px and started them 0.84 r out from a star
 * whose points only reached 0.5 r, so a small one showed a detached smudge and
 * a large one showed three lines fused into a single stripe.
 */
function shootingStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bend: number): void {
  star(ctx, x, y, r * 0.55)
  const ang = bend + 2.9
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  // Perpendicular, to space the streaks across the direction of travel.
  const px = -dy
  const py = dx
  for (let i = -1; i <= 1; i++) {
    const off = i * r * 0.24
    const near = r * 0.8
    const far = r * (2.1 - Math.abs(i) * 0.5)
    ctx.beginPath()
    ctx.moveTo(x + dx * near + px * off, y + dy * near + py * off)
    ctx.lineTo(x + dx * far + px * off, y + dy * far + py * off)
    ctx.stroke()
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
  const H = h * 0.5
  const w = h * 0.28 // how far the rails sit from centre
  const t = h * 0.105 // half the ribbon's width

  // It is a *ribbon*, and that is the whole trick. Trace one path — point at the
  // top, down the left rail, one long diagonal across, down the right rail,
  // point at the bottom — then draw it twice, offset to either side. The two
  // ends collapse onto the spine, which is what makes them points.
  //
  // The first version drew single lines instead: a left rail, a right rail, a
  // near-horizontal diagonal and two V caps. Those six strokes close into a
  // hexagon with a bar across it. It was not an S from any angle.
  const spine: readonly (readonly [number, number])[] = [
    [0, -H],
    [-w, -H * 0.62],
    [-w, -H * 0.12],
    [w, H * 0.12],
    [w, H * 0.62],
    [0, H],
  ]

  for (const side of [-1, 1]) {
    ctx.beginPath()
    for (let i = 0; i < spine.length; i++) {
      const [sx, sy] = spine[i]!
      // Ends stay on the spine so the S tapers to a point rather than stopping
      // flat; everything between is pushed sideways to give the ribbon width.
      const shift = i === 0 || i === spine.length - 1 ? 0 : side * t
      if (i === 0) ctx.moveTo(x + sx + shift, y + sy)
      else ctx.lineTo(x + sx + shift, y + sy)
    }
    ctx.stroke()
  }
}
