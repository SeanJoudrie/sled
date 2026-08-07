/**
 * The level (what gets serialised), the world (what the sim reads), and the
 * brush table.
 *
 * `sim/` imports nothing outside itself — including these types — which is why
 * `Level` is declared here rather than next to the encoder that writes it.
 * `level/` depends on `sim/`, never the other way round. CI asserts this.
 */

// ── brushes ──────────────────────────────────────────────────────────────────

export const BRUSH = {
  INK: 0,
  ICE: 1,
  TAR: 2,
  BOOST: 3,
  KILL: 4,
  WATER: 5,
  SCENERY: 6,
  FINISH: 7,
} as const

export type BrushId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * Ink is thin and opaque; highlighter is fat, translucent and multiply-blended,
 * and ink draws over the top of it. The sim only cares about this insofar as it
 * must travel with the brush; the renderer is what acts on it.
 */
export type StrokeClass = 'ink' | 'highlighter'

export type BrushDef = {
  readonly id: BrushId
  readonly name: string
  /** CSS custom property carrying this brush's colour. */
  readonly token: string
  readonly cls: StrokeClass
  /** Whether RIDE points are pushed out of this line. */
  readonly collides: boolean
  /** Tangential velocity lost per tick of contact. */
  readonly friction: number
  /** Tangential impulse per tick of contact, along the segment as drawn. */
  readonly boost: number
  /** Whether contact by any rig point ends the run. */
  readonly kills: boolean
  /** Whether this line is a water surface rather than a solid. */
  readonly water: boolean
  /** Whether crossing it ends the run as a win. */
  readonly finishes: boolean
}

/**
 * Seven brushes, seven mechanics, one table. Colour means behaviour — a level
 * has to be readable without a legend.
 *
 * Friction is per tick of contact and a resting sled touches 60×/second, so
 * these are derived from per-second targets rather than picked directly:
 * ink keeps ~80% of speed over a second, tar ~10%. Setting tar to the 0.30 it
 * looks like it wants leaves 0.0000001 of the speed after one second, which
 * reads as hitting a wall.
 */
export const BRUSHES: readonly BrushDef[] = [
  { id: BRUSH.INK,     name: 'Ink',     token: '--sled-ink',    cls: 'ink',         collides: true,  friction: 0.004, boost: 0,    kills: false, water: false, finishes: false },
  { id: BRUSH.ICE,     name: 'Ice',     token: '--sled-cyan',   cls: 'highlighter', collides: true,  friction: 0.0,   boost: 0,    kills: false, water: false, finishes: false },
  { id: BRUSH.TAR,     name: 'Tar',     token: '--sled-brown',  cls: 'highlighter', collides: true,  friction: 0.038, boost: 0,    kills: false, water: false, finishes: false },
  { id: BRUSH.BOOST,   name: 'Boost',   token: '--sled-yellow', cls: 'highlighter', collides: true,  friction: 0.003, boost: 0.08, kills: false, water: false, finishes: false },
  { id: BRUSH.KILL,    name: 'Spikes',  token: '--sled-red',    cls: 'ink',         collides: true,  friction: 0.004, boost: 0,    kills: true,  water: false, finishes: false },
  { id: BRUSH.WATER,   name: 'Water',   token: '--sled-blue',   cls: 'ink',         collides: false, friction: 0,     boost: 0,    kills: false, water: true,  finishes: false },
  { id: BRUSH.SCENERY, name: 'Scenery', token: '--sled-pencil', cls: 'ink',         collides: false, friction: 0,     boost: 0,    kills: false, water: false, finishes: false },
  // Green, and the only brush that ends a run happily. Does not collide: you
  // ride *through* the tape, you do not land on it.
  { id: BRUSH.FINISH,  name: 'Finish',  token: '--sled-green',  cls: 'highlighter', collides: false, friction: 0,     boost: 0,    kills: false, water: false, finishes: true  },
]

export const BRUSH_COUNT = BRUSHES.length

// ── the level, as serialised ─────────────────────────────────────────────────

/** Wind stamp kinds. Arrow pushes along a segment; vortex spins inside a circle. */
export const WIND = { ARROW: 0, VORTEX: 1 } as const
export type WindKind = 0 | 1

/**
 * Everything a run is a pure function of.
 *
 * Array order is load-bearing: collisions resolve in it, and edits append. The
 * encoder never sorts.
 */
export type Level = {
  v: 1
  /** Rider part selection: body, face, hat, beard. Travels with the link. */
  r: [number, number, number, number]
  /** Start flag. */
  s: [number, number]
  /** Lines: brush, then both endpoints. */
  l: Array<[BrushId, number, number, number, number]>
  /**
   * Portal pairs: segment A (ax, ay, bx, by), segment B (cx, cy, dx, dy), flags.
   *
   * `flags & 1` makes the pair one-way, A to B only. Bidirectional portals are
   * the default and the interesting case, but two of them on the same track
   * trap the rig forever and a closed loop is a perpetual motion machine — so
   * the escape hatch has to exist in the wire format *before* level strings are
   * shared, or it can never be added without breaking them.
   */
  p: Array<[number, number, number, number, number, number, number, number, number]>
  /** Gravity wells: x, y, strength. */
  g: Array<[number, number, number]>
  /** Wind: both endpoints, strength, kind. Vortex uses the segment length as its radius. */
  w: Array<[number, number, number, number, number, WindKind]>
}

// ── the world, as the sim reads it ───────────────────────────────────────────

/** A level line with its brush behaviour already resolved. */
export type Segment = {
  readonly brush: BrushDef
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
}

export type Portal = {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly cx: number
  readonly cy: number
  readonly dx: number
  readonly dy: number
  /** Rotation from A's frame to B's frame, as a unit complex number. No trigonometry. */
  readonly qc: number
  readonly qs: number
  /** One-way: entering B does nothing. Stops a downstream pair trapping the rig. */
  readonly oneWay: boolean
}

/** Portal flag bits, as stored on the wire. */
export const PORTAL_ONE_WAY = 1

export type Well = {
  readonly x: number
  readonly y: number
  readonly strength: number
}

export type Wind = {
  readonly kind: WindKind
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly strength: number
  /** Unit direction, precomputed. Zero-length winds are dropped at build time. */
  readonly ux: number
  readonly uy: number
  /** Vortex radius — the segment's own length. */
  readonly radius: number
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type World = {
  readonly segs: readonly Segment[]
  /** Collidable subset, in level order. Precomputed — the hot loop runs every tick. */
  readonly solids: readonly Segment[]
  /** Water subset, in level order. First match wins; they are never summed. */
  readonly waters: readonly Segment[]
  /** Finish lines, in level order. Crossing one ends the run as a win. */
  readonly finishes: readonly Segment[]
  readonly portals: readonly Portal[]
  readonly wells: readonly Well[]
  readonly winds: readonly Wind[]
  readonly startX: number
  readonly startY: number
  readonly rider: readonly [number, number, number, number]
  readonly bounds: Bounds
}

// ── the rig ──────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number; px: number; py: number }

export type RunState = 'running' | 'crashed' | 'gone' | 'finished'

export type Rig = {
  /** Fixed length 5, in NOSE, TAIL, SEAT, HEAD, HAND order. Never a Set or a Map. */
  readonly pts: Point[]
  portalCooldown: number
  state: RunState
  tick: number
}
