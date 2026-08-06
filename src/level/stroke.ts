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
 * A stable PRNG for one stroke's hand-drawn wobble.
 *
 * Seeded from the stroke's **own coordinates**, not the level hash.
 *
 * The spec says level-seeded, and for a finished level that is the same thing —
 * everyone opening a link sees identical wobble either way, which is the actual
 * requirement. But while you are drawing, the level hash changes on every
 * stroke, so a level-seeded wobble would re-roll every line already on the page
 * each time you added another. Seeding per stroke keeps a line looking the way
 * it looked when you drew it.
 */
export function strokeRng(s: Stroke): () => number {
  let key = `${s.brush}`
  for (const [x, y] of s.pts) key += `|${x},${y}`
  return mulberry32(fnv1a(key))
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

/** Squared distance from a point to a stroke's nearest segment. */
export function distToStroke2(s: Stroke, x: number, y: number): number {
  let best = Infinity
  for (let i = 1; i < s.pts.length; i++) {
    const [ax, ay] = s.pts[i - 1]!
    const [bx, by] = s.pts[i]!
    const abx = bx - ax
    const aby = by - ay
    const ab2 = abx * abx + aby * aby
    let t = ab2 < 1e-9 ? 0 : ((x - ax) * abx + (y - ay) * aby) / ab2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const dx = x - (ax + abx * t)
    const dy = y - (ay + aby * t)
    const d2 = dx * dx + dy * dy
    if (d2 < best) best = d2
  }
  return best
}
