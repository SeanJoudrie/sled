/**
 * Ink and highlighter.
 *
 * The single most important visual decision in the whole project: ink is thin
 * and opaque, highlighter is fat, translucent and multiply-blended — and ink
 * draws *over* highlighter, because you highlight over writing. Behaviour-
 * carrying lines physically look highlighted, so a level reads without a
 * legend.
 */

import type { Stroke } from '../level/stroke.ts'
import { segmentRng } from '../level/stroke.ts'
import { BRUSH } from '../sim/index.ts'
import type { BrushDef } from '../sim/index.ts'

export const INK_WIDTH = 2.4
export const HIGHLIGHTER_WIDTH = 11
/** Second highlighter pass, offset, for the doubled edge a real marker leaves. */
export const HIGHLIGHTER_OFFSET = 0.8

const WOBBLE_STEP = 12
const WOBBLE_AMOUNT = 0.45

/**
 * Wobbled polylines, cached by stroke identity.
 *
 * Strokes are immutable once committed, so identity is a safe key. This cache
 * is the *only* place wobble exists: it is never written to level data, and the
 * physics always uses the straight segment, so a wobble can never affect a run.
 */
const wobbleCache = new WeakMap<Stroke, Array<readonly [number, number]>>()

/**
 * Subdivide into ~12 px pieces and nudge each interior vertex perpendicular.
 * A hand does not draw a straight line, and a perfectly straight one on ruled
 * paper looks printed rather than drawn.
 */
export function wobbled(s: Stroke): Array<readonly [number, number]> {
  const hit = wobbleCache.get(s)
  if (hit) return hit

  const out: Array<readonly [number, number]> = []

  for (let i = 1; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i - 1]!
    const [bx, by] = s.pts[i]!
    // Seeded per segment, so splitting a stroke leaves every surviving piece
    // wobbling exactly as it did before the cut.
    const rng = segmentRng(s.brush, ax, ay, bx, by)
    if (i === 1) out.push([ax, ay])

    const dx = bx - ax
    const dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.round(len / WOBBLE_STEP))
    // Perpendicular unit; a zero-length segment has no direction to offset along.
    const nx = len > 1e-9 ? -dy / len : 0
    const ny = len > 1e-9 ? dx / len : 0

    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const px = ax + dx * t
      const py = ay + dy * t
      // The endpoint stays put, so strokes still meet where they were drawn to meet.
      const w = k === steps ? 0 : (rng() * 2 - 1) * WOBBLE_AMOUNT
      out.push([px + nx * w, py + ny * w])
    }
  }

  wobbleCache.set(s, out)
  return out
}

function trace(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>, ox = 0, oy = 0): void {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0]![0] + ox, pts[0]![1] + oy)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0] + ox, pts[i]![1] + oy)
  ctx.stroke()
}

/** How far apart the spikes sit along a kill line, and how tall they stand. */
const SPIKE_STEP = 13
const SPIKE_HEIGHT = 7

/**
 * A kill line, drawn as spikes.
 *
 * It used to render as a plain red line — identical in weight to ink, so the
 * one brush that ends your run looked exactly as dangerous as the one that
 * doesn't. Little triangles along the top say it without a legend.
 *
 * The spikes are decoration: collision is still the bare segment, so what kills
 * you is the line you drew, not the teeth pointing off it.
 */
export function drawSpikes(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
): void {
  const pts = wobbled(s)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = colour
  ctx.lineWidth = INK_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  trace(ctx, pts)

  ctx.lineWidth = INK_WIDTH * 0.85
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!
    const [bx, by] = pts[i]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-6) continue
    const ux = dx / len
    const uy = dy / len
    // Spikes stand on whichever side is *up*, never on whichever side happens to
    // be left of the direction you drew in. Keyed to the stroke direction, a
    // line drawn right-to-left put its teeth underneath while the lethal segment
    // stayed exactly where it was — the drawing actively misreported where the
    // danger was, which is the one thing the teeth were added to fix.
    let nx = uy
    let ny = -ux
    if (ny > 0) {
      nx = -nx
      ny = -ny
    }

    for (let d = SPIKE_STEP * 0.5; d < len; d += SPIKE_STEP) {
      const cx = ax + ux * d
      const cy = ay + uy * d
      const half = SPIKE_STEP * 0.3
      ctx.beginPath()
      ctx.moveTo(cx - ux * half, cy - uy * half)
      ctx.lineTo(cx + nx * SPIKE_HEIGHT, cy + ny * SPIKE_HEIGHT)
      ctx.lineTo(cx + ux * half, cy + uy * half)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * A finish line: a green band with a row of ticks, like tape across the track.
 *
 * Highlighter-class, so it reads as a zone rather than a wall — which is what
 * it is. Nothing collides with it; you ride through.
 */
export function drawFinish(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
): void {
  drawHighlighter(ctx, s, colour, alpha)
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.85 * alpha
  for (let i = 1; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i - 1]!
    const [bx, by] = s.pts[i]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-6) continue
    const ux = dx / len
    const uy = dy / len
    for (let d = 0; d < len; d += 11) {
      const cx = ax + ux * d
      const cy = ay + uy * d
      ctx.beginPath()
      ctx.moveTo(cx - uy * 5, cy + ux * 5)
      ctx.lineTo(cx + uy * 5, cy - ux * 5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** How far apart the chevrons sit along a boost line. */
const BOOST_STEP = 26

/**
 * Which way a boost pushes.
 *
 * Boost runs along the segment as drawn, so a line drawn right-to-left pushes
 * backwards. That is a real feature and the material sheet says "along the
 * line" — but a yellow band drawn one way is pixel-identical to one drawn the
 * other, so four words in a sheet you opened ten minutes ago were the only
 * record of which one you made. Chevrons put the answer back on the page.
 */
export function drawBoostArrows(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.9 * alpha

  for (let i = 1; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i - 1]!
    const [bx, by] = s.pts[i]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1e-6) continue
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux
    const arm = 3.4

    for (let d = BOOST_STEP * 0.5; d < len; d += BOOST_STEP) {
      const cx = ax + ux * d
      const cy = ay + uy * d
      ctx.beginPath()
      ctx.moveTo(cx - ux * arm + nx * arm, cy - uy * arm + ny * arm)
      ctx.lineTo(cx + ux * arm, cy + uy * arm)
      ctx.lineTo(cx - ux * arm - nx * arm, cy - uy * arm - ny * arm)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/**
 * One ink stroke: thin, opaque, wobbled. Optionally dashed.
 *
 * `alpha` is a multiplier, not a value. Canvas `globalAlpha` replaces rather
 * than composes, so a function that sets it to 1 silently cancels whatever the
 * caller asked for — which is exactly what this did, and why the eraser's
 * "ghost" preview had never once been translucent.
 */
export function drawInk(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
  dash?: readonly number[],
): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = INK_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = 'source-over'
  if (dash) ctx.setLineDash(dash as number[])
  trace(ctx, wobbled(s))
  ctx.restore()
}

/** One highlighter stroke: fat, translucent, multiplied, dragged not sketched. */
export function drawHighlighter(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = HIGHLIGHTER_WIDTH
  ctx.lineCap = 'square'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.5 * alpha
  ctx.globalCompositeOperation = 'multiply'
  // No wobble — a highlighter is dragged, not sketched.
  trace(ctx, s.pts)
  trace(ctx, s.pts, HIGHLIGHTER_OFFSET, HIGHLIGHTER_OFFSET)
  ctx.restore()
}

/** How far below the surface the water tint reaches before fading out, px. */
const WATER_DEPTH = 170

/**
 * The body of a water section.
 *
 * Water is a half-plane in the simulation — everything below the line is wet,
 * forever — but it rendered as a single thin blue stroke, which reads as a
 * tripwire rather than as something you sink into. This fills beneath the
 * surface and fades out, so the mechanic is visible without claiming a bottom
 * the physics does not have.
 */
export function drawWaterBody(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  colour: string,
  alpha = 1,
): void {
  if (s.pts.length < 2) return
  let lowest = -Infinity
  for (const [, y] of s.pts) if (y > lowest) lowest = y

  const grad = ctx.createLinearGradient(0, lowest, 0, lowest + WATER_DEPTH)
  grad.addColorStop(0, colour)
  grad.addColorStop(1, 'transparent')

  ctx.save()
  ctx.globalAlpha = 0.11 * alpha
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(s.pts[0]![0], s.pts[0]![1])
  for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i]![0], s.pts[i]![1])
  // Close down the far edge, along the bottom, and back up the near edge.
  ctx.lineTo(s.pts[s.pts.length - 1]![0], lowest + WATER_DEPTH)
  ctx.lineTo(s.pts[0]![0], lowest + WATER_DEPTH)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * Every stroke, in three passes.
 *
 * Water bodies, then highlighter, then ink. Separate passes rather than one
 * loop: an ink line crossing a boost has to sit on top of it, and water has to
 * sit under everything, and that is not something per-stroke ordering can
 * express.
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  brushes: readonly BrushDef[],
  colour: (token: string) => string,
  alpha = 1,
): void {
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (b?.water) drawWaterBody(ctx, s, colour(b.token), alpha)
  }
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (!b || b.water) continue
    if (b.finishes) drawFinish(ctx, s, colour(b.token), alpha)
    else if (b.cls === 'highlighter') drawHighlighter(ctx, s, colour(b.token), alpha)
    // Chevrons go on in ink, over the band — you highlight, then write on top.
    // Yellow-on-yellow would not read at all.
    if (b.boost > 0) drawBoostArrows(ctx, s, colour('--sled-ink'), alpha)
  }
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (!b || b.cls !== 'ink') continue
    if (b.kills) drawSpikes(ctx, s, colour(b.token), alpha)
    // Scenery is the one entry in a list built on "colour means behaviour" that
    // means the *absence* of behaviour — the one thing a colour cannot say. A
    // dash can: a broken line is not a surface anywhere anyone has ever drawn.
    else if (b.id === BRUSH.SCENERY) drawInk(ctx, s, colour(b.token), alpha, [7, 5])
    else drawInk(ctx, s, colour(b.token), alpha)
  }
}
