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
import { strokeRng } from '../level/stroke.ts'
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

  const rng = strokeRng(s)
  const out: Array<readonly [number, number]> = []

  for (let i = 1; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i - 1]!
    const [bx, by] = s.pts[i]!
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
export function drawSpikes(ctx: CanvasRenderingContext2D, s: Stroke, colour: string): void {
  const pts = wobbled(s)
  ctx.save()
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
    // Spikes stand off the left of the direction of travel, which for a line
    // drawn left-to-right is up — the side you land on.
    const nx = uy
    const ny = -ux

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
export function drawFinish(ctx: CanvasRenderingContext2D, s: Stroke, colour: string): void {
  drawHighlighter(ctx, s, colour)
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.85
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

/** One ink stroke: thin, opaque, wobbled. */
export function drawInk(ctx: CanvasRenderingContext2D, s: Stroke, colour: string): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = INK_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  trace(ctx, wobbled(s))
  ctx.restore()
}

/** One highlighter stroke: fat, translucent, multiplied, dragged not sketched. */
export function drawHighlighter(ctx: CanvasRenderingContext2D, s: Stroke, colour: string): void {
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = HIGHLIGHTER_WIDTH
  ctx.lineCap = 'square'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 0.5
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
): void {
  if (s.pts.length < 2) return
  let lowest = -Infinity
  for (const [, y] of s.pts) if (y > lowest) lowest = y

  const grad = ctx.createLinearGradient(0, lowest, 0, lowest + WATER_DEPTH)
  grad.addColorStop(0, colour)
  grad.addColorStop(1, 'transparent')

  ctx.save()
  ctx.globalAlpha = 0.11
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
): void {
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (b?.water) drawWaterBody(ctx, s, colour(b.token))
  }
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (!b || b.water) continue
    if (b.finishes) drawFinish(ctx, s, colour(b.token))
    else if (b.cls === 'highlighter') drawHighlighter(ctx, s, colour(b.token))
  }
  for (const s of strokes) {
    const b = brushes[s.brush]
    if (!b || b.cls !== 'ink') continue
    if (b.kills) drawSpikes(ctx, s, colour(b.token))
    else drawInk(ctx, s, colour(b.token))
  }
}
