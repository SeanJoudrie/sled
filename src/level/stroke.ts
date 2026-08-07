/**
 * Strokes — the authoring representation of a drawn line.
 *
 * The wire format stores flat segments, because that is what collision iterates
 * and array order is load-bearing. But a person draws, undoes and erases whole
 * *strokes*, so the editor holds strokes and flattens them on every change.
 *
 * Flattening is order-preserving, so a level built from strokes decodes to
 * exactly the same run as one built segment by segment.
 */

import type { BrushId, Level } from '../sim/index.ts'
import { fnv1a, mulberry32 } from './prng.ts'

export type Stroke = {
  readonly brush: BrushId
  /** Polyline points, in world units. At least two to be worth keeping. */
  readonly pts: ReadonlyArray<readonly [number, number]>
}

/** Flatten strokes to level lines, preserving draw order. */
export function strokesToLines(strokes: readonly Stroke[]): Level['l'] {
  const out: Level['l'] = []
  for (const s of strokes) {
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1]!
      const b = s.pts[i]!
      out.push([s.brush, a[0], a[1], b[0], b[1]])
    }
  }
  return out
}

/** Rebuild strokes from level lines, joining segments that share an endpoint. */
export function linesToStrokes(lines: Level['l']): Stroke[] {
  const out: Stroke[] = []
  let cur: { brush: BrushId; pts: Array<readonly [number, number]> } | null = null

  for (const [brush, x1, y1, x2, y2] of lines) {
    const joins =
      cur !== null &&
      cur.brush === brush &&
      cur.pts[cur.pts.length - 1]![0] === x1 &&
      cur.pts[cur.pts.length - 1]![1] === y1
    if (joins) {
      cur!.pts.push([x2, y2])
    } else {
      if (cur) out.push({ brush: cur.brush, pts: cur.pts })
      cur = { brush, pts: [[x1, y1], [x2, y2]] }
    }
  }
  if (cur) out.push({ brush: cur.brush, pts: cur.pts })
  return out
}

/**
 * A stable PRNG for one *segment's* hand-drawn wobble.
 *
 * Seeded from the segment's own endpoints, not the level hash and not the whole
 * stroke.
 *
 * The spec says level-seeded, and for a finished level that is the same thing —
 * everyone opening a link sees identical wobble either way, which is the actual
 * requirement. But while you are drawing, the level hash changes on every
 * stroke, so a level-seeded wobble would re-roll every line already on the page
 * each time you added another.
 *
 * Per *segment* rather than per stroke because the eraser splits strokes now. A
 * whole-stroke seed changes the moment a stroke loses a segment, so trimming the
 * end of a long line made the rest of it visibly re-draw itself. A segment's
 * wobble is a pure function of the two points the level actually stores, which
 * is the right unit anyway: split a stroke anywhere and every surviving segment
 * looks exactly as it did.
 *
 * Segments already meet exactly whatever the seeds do — `wobbled` pins every
 * endpoint to zero offset — so nothing is lost by not sharing a stream.
 */
export function segmentRng(
  brush: BrushId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): () => number {
  return mulberry32(fnv1a(`${brush}|${ax},${ay}|${bx},${by}`))
}

export function strokeBounds(s: Stroke): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of s.pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Squared distance from a point to one segment of a stroke. */
function segDist2(s: Stroke, j: number, x: number, y: number): number {
  const [ax, ay] = s.pts[j]!
  const [bx, by] = s.pts[j + 1]!
  const abx = bx - ax
  const aby = by - ay
  const ab2 = abx * abx + aby * aby
  let t = ab2 < 1e-9 ? 0 : ((x - ax) * abx + (y - ay) * aby) / ab2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = x - (ax + abx * t)
  const dy = y - (ay + aby * t)
  return dx * dx + dy * dy
}

/**
 * Which segments of a stroke the eraser is over.
 *
 * Segment `j` spans `pts[j] → pts[j + 1]`, so a stroke of n points has n − 1 of
 * them. Returns indices rather than a yes/no for the whole stroke, because the
 * eraser takes the part you touched and not the line you happened to touch it
 * with.
 */
export function segmentsNear(s: Stroke, x: number, y: number, radius2: number): number[] {
  const out: number[] = []
  for (let j = 0; j + 1 < s.pts.length; j++) {
    if (segDist2(s, j, x, y) <= radius2) out.push(j)
  }
  return out
}

/**
 * Split a stroke around the segments an eraser touched.
 *
 * What survives is every maximal run of untouched segments, each becoming a
 * stroke in its own right — which is what an eraser on paper does, and what the
 * previous whole-stroke delete could not: fixing the end of one long confident
 * hill meant deleting the hill. The removed runs come back too, so the renderer
 * can ghost exactly what is about to go rather than the whole line.
 */
export function splitStroke(
  s: Stroke,
  cut: ReadonlySet<number>,
): { keep: Stroke[]; removed: Stroke[] } {
  const keep: Stroke[] = []
  const removed: Stroke[] = []
  const n = s.pts.length - 1
  if (n < 1) return { keep, removed }

  let runStart = 0
  let runCut = cut.has(0)
  // A run of segments [a..b] owns points [a..b+1].
  const flush = (last: number): void => {
    const pts = s.pts.slice(runStart, last + 2)
    if (pts.length >= 2) (runCut ? removed : keep).push({ brush: s.brush, pts })
  }
  for (let j = 1; j < n; j++) {
    const isCut = cut.has(j)
    if (isCut !== runCut) {
      flush(j - 1)
      runStart = j
      runCut = isCut
    }
  }
  flush(n - 1)
  return { keep, removed }
}
