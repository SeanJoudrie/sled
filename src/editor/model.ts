/**
 * What the editor owns.
 *
 * Strokes are the source of truth while authoring; the flat `Level` is derived
 * from them on demand. Undo, redo and erase all operate on whole strokes,
 * because that is the unit a person thinks they drew.
 *
 * Stamps are carried through untouched. The level format holds them and the
 * simulation runs them, so a level with portals survives a round trip through
 * the editor — there is simply no UI to place one yet.
 */

import type { BrushId, Level } from '../sim/index.ts'
import { emptyLevel } from '../sim/index.ts'
import type { Stroke } from '../level/stroke.ts'
import { distToStroke2, linesToStrokes, strokesToLines } from '../level/stroke.ts'

/** One segment committed per this much cursor travel, in world units. */
export const COMMIT_DISTANCE = 14

/** Undo depth. Deep enough that nobody hits the bottom by accident. */
export const HISTORY_LIMIT = 100

/** How near the cursor has to pass a stroke to erase it, in world units. */
export const ERASE_RADIUS = 12

type Snapshot = {
  strokes: readonly Stroke[]
  startX: number
  startY: number
  // Stamps ride along even though nothing can place one yet: Clear removes
  // them, so undo has to be able to bring them back.
  portals: Level['p']
  wells: Level['g']
  winds: Level['w']
}

export class Model {
  strokes: Stroke[] = []
  startX = 0
  startY = 0
  brush: BrushId = 0

  private rider: Level['r'] = [0, 0, 0, 0]
  portals: Level['p'] = []
  wells: Level['g'] = []
  winds: Level['w'] = []

  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []

  /** The stroke being drawn right now. Not in `strokes` until it is committed. */
  private live: { brush: BrushId; pts: Array<readonly [number, number]> } | null = null

  constructor(level: Level = emptyLevel()) {
    this.load(level)
  }

  load(level: Level): void {
    this.strokes = linesToStrokes(level.l)
    this.startX = level.s[0]
    this.startY = level.s[1]
    this.rider = [...level.r] as Level['r']
    this.portals = level.p.map((p) => [...p] as Level['p'][number])
    this.wells = level.g.map((g) => [...g] as Level['g'][number])
    this.winds = level.w.map((w) => [...w] as Level['w'][number])
    this.undoStack = []
    this.redoStack = []
    this.live = null
  }

  toLevel(): Level {
    return {
      v: 1,
      r: this.rider,
      s: [this.startX, this.startY],
      l: strokesToLines(this.strokes),
      p: this.portals,
      g: this.wells,
      w: this.winds,
    }
  }

  get isEmpty(): boolean {
    return (
      this.strokes.length === 0 &&
      this.live === null &&
      this.portals.length === 0 &&
      this.wells.length === 0 &&
      this.winds.length === 0
    )
  }

  // ── history ────────────────────────────────────────────────────────────────

  private capture(): Snapshot {
    return {
      strokes: this.strokes.slice(),
      startX: this.startX,
      startY: this.startY,
      portals: this.portals,
      wells: this.wells,
      winds: this.winds,
    }
  }

  private snapshot(): void {
    this.undoStack.push(this.capture())
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    // Any new edit invalidates the redo branch.
    this.redoStack.length = 0
  }

  private restore(from: Snapshot[], to: Snapshot[]): boolean {
    const s = from.pop()
    if (!s) return false
    to.push(this.capture())
    this.strokes = s.strokes.slice()
    this.startX = s.startX
    this.startY = s.startY
    this.portals = s.portals
    this.wells = s.wells
    this.winds = s.winds
    return true
  }

  undo(): boolean {
    return this.restore(this.undoStack, this.redoStack)
  }

  redo(): boolean {
    return this.restore(this.redoStack, this.undoStack)
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  beginStroke(x: number, y: number): void {
    this.live = { brush: this.brush, pts: [[x, y]] }
  }

  /** Returns true when the cursor moved far enough to commit a new segment. */
  extendStroke(x: number, y: number): boolean {
    if (!this.live) return false
    const last = this.live.pts[this.live.pts.length - 1]!
    const dx = x - last[0]
    const dy = y - last[1]
    if (dx * dx + dy * dy < COMMIT_DISTANCE * COMMIT_DISTANCE) return false
    this.live.pts.push([x, y])
    return true
  }

  /** The in-progress stroke, for live preview. Null when not drawing. */
  previewStroke(cursorX?: number, cursorY?: number): Stroke | null {
    if (!this.live) return null
    const pts =
      cursorX === undefined || cursorY === undefined
        ? this.live.pts
        : [...this.live.pts, [cursorX, cursorY] as const]
    if (pts.length < 2) return null
    return { brush: this.live.brush, pts }
  }

  /** Commit the live stroke. A stroke that never moved is dropped, not stored. */
  endStroke(cursorX: number, cursorY: number): boolean {
    const live = this.live
    this.live = null
    if (!live) return false

    const last = live.pts[live.pts.length - 1]!
    const dx = cursorX - last[0]
    const dy = cursorY - last[1]
    // Keep the final partial segment, so a stroke ends where you released it
    // rather than at the last 14 px checkpoint.
    if (dx * dx + dy * dy > 1) live.pts.push([cursorX, cursorY])
    if (live.pts.length < 2) return false

    this.snapshot()
    this.strokes.push({ brush: live.brush, pts: live.pts })
    return true
  }

  cancelStroke(): void {
    this.live = null
  }

  // ── erasing ────────────────────────────────────────────────────────────────

  /** Which strokes the eraser would take at this point. */
  strokesAt(x: number, y: number, radius = ERASE_RADIUS): Stroke[] {
    const r2 = radius * radius
    return this.strokes.filter((s) => distToStroke2(s, x, y) <= r2)
  }

  /** Remove whole strokes. One snapshot per erase gesture, not per stroke. */
  erase(targets: ReadonlySet<Stroke>): boolean {
    if (!targets.size) return false
    this.snapshot()
    this.strokes = this.strokes.filter((s) => !targets.has(s))
    return true
  }

  // ── the rest ───────────────────────────────────────────────────────────────

  /**
   * Tight bounds of everything on the page, including the start flag.
   *
   * Deliberately *not* World.bounds, which is padded by OFF_TRACK_MARGIN for
   * the off-track test — framing the camera on that would show 2000 px of blank
   * paper in every direction.
   */
  contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = this.startX
    let minY = this.startY
    let maxX = this.startX
    let maxY = this.startY
    const put = (x: number, y: number) => {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    for (const s of this.strokes) for (const [x, y] of s.pts) put(x, y)
    for (const p of this.portals) {
      put(p[0], p[1]); put(p[2], p[3]); put(p[4], p[5]); put(p[6], p[7])
    }
    for (const g of this.wells) put(g[0], g[1])
    for (const w of this.winds) {
      put(w[0], w[1]); put(w[2], w[3])
    }
    return { minX, minY, maxX, maxY }
  }

  setStart(x: number, y: number): void {
    this.snapshot()
    this.startX = x
    this.startY = y
  }

  /**
   * Clear the page — stamps included.
   *
   * Leaving them behind would strand a gravity well the editor cannot draw,
   * select or delete, silently bending every run on what looks like a blank
   * page. Undo restores them.
   */
  clear(): void {
    if (this.isEmpty) return
    this.snapshot()
    this.strokes = []
    this.portals = []
    this.wells = []
    this.winds = []
  }
}
