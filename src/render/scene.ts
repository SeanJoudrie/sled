/**
 * Composing one frame.
 *
 * Order, back to front: paper → creases → rules → parallax → highlighter → ink
 * → stamps → rider. Highlighter always sits *under* ink, so an ink line
 * crossing a boost reads correctly.
 */

import { BRUSHES } from '../sim/index.ts'
import type { Rig, World } from '../sim/index.ts'
import type { Stroke } from '../level/stroke.ts'
import { splitStroke } from '../level/stroke.ts'
import { drawStrokes } from './strokes.ts'
import { drawCreases, drawPaper, drawRules } from './paper.ts'
import { drawParallax } from './parallax.ts'
import type { Camera } from './camera.ts'
import type { Scarf } from './scarf.ts'
import { drawScarf } from './scarf.ts'
import { visibleRect } from './camera.ts'
import { CONSTRAINTS, HAND, HEAD, NOSE, SEAT, TAIL } from '../sim/index.ts'

export type Palette = (token: string) => string

export type SceneInput = {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  cam: Camera
  strokes: readonly Stroke[]
  world: World | null
  rig: Rig | null
  /** The stroke currently under the cursor, drawn as a live preview. */
  preview: Stroke | null
  /**
   * Which segments of which strokes the eraser is about to take, drawn ghosted.
   * Keyed by stroke; the numbers are segment indices.
   */
  doomed: ReadonlyMap<Stroke, ReadonlySet<number>>
  /** Where the eraser is and how wide, in world units. Null unless erasing. */
  eraser: { x: number; y: number; r: number } | null
  /** The rider's scarf. Render-only; never read by the simulation. */
  scarf: Scarf | null
  startX: number
  startY: number
  colour: Palette
  reducedMotion: boolean
  showEmptyHint: boolean
  /** `?debug`: draw the rig's constraint graph over the rider. */
  debug: boolean
}

export function drawScene(s: SceneInput): void {
  const { ctx, w, h, cam, colour } = s

  const world = () => {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(-cam.x, -cam.y)
  }

  drawPaper(ctx, w, h, colour('--sled-paper'))

  // Folds and rules both belong to the sheet, so both pan with it.
  const r = visibleRect(cam, w, h)
  world()
  drawCreases(ctx, r.left, r.top, r.right, r.bottom, cam.zoom, colour('--sled-grain'), colour('--sled-paper'))
  // Rules are *printed*, so they go down before anything drawn by hand.
  drawRules(ctx, r.left, r.top, r.right, r.bottom, cam.zoom, colour('--sled-rule'), colour('--sled-margin-rule'))
  ctx.restore()

  // Scenery sits on top of the ruling, because someone sketched it onto the
  // page. Both axes: a hill drops far more than it runs, and a treeline that
  // only slides sideways sits dead still through the fastest part of a descent.
  drawParallax(ctx, w, h, cam.x, cam.y, colour('--sled-pencil'), s.reducedMotion)

  world()

  // What the eraser will take is dimmed rather than hidden, so you can see what
  // you are about to lose before you commit to losing it. Split at the same
  // segment boundaries the erase itself will use — ghosting the whole stroke
  // would promise to remove a line the eraser is only going to trim.
  let keep: readonly Stroke[] = s.strokes
  const ghost: Stroke[] = []
  if (s.doomed.size) {
    const kept: Stroke[] = []
    keep = kept
    for (const st of s.strokes) {
      const segs = s.doomed.get(st)
      if (!segs || segs.size === 0) {
        kept.push(st)
        continue
      }
      const split = splitStroke(st, segs)
      kept.push(...split.keep)
      ghost.push(...split.removed)
    }
  }
  drawStrokes(ctx, keep, BRUSHES, colour)
  // 0.22 is passed as a multiplier rather than set on the context: every draw
  // function assigns its own globalAlpha, and canvas alpha replaces rather than
  // composes, so setting it here was silently cancelled. The ghost had never
  // once been translucent.
  if (ghost.length) drawStrokes(ctx, ghost, BRUSHES, colour, 0.22)
  if (s.preview) drawStrokes(ctx, [s.preview], BRUSHES, colour)

  if (s.world) drawStamps(ctx, s.world, colour)
  drawStartFlag(ctx, s.startX, s.startY, colour('--sled-ink'))
  if (s.rig) drawRider(ctx, s.rig, colour, s.scarf, s.debug)
  if (s.eraser) drawEraser(ctx, s.eraser, cam.zoom, colour('--sled-ink'))

  ctx.restore()

  if (s.showEmptyHint) drawEmptyHint(ctx, s)
}

function drawStamps(ctx: CanvasRenderingContext2D, world: World, colour: Palette): void {
  ctx.save()
  ctx.lineWidth = 1.6
  ctx.setLineDash([6, 5])

  for (const p of world.portals) {
    ctx.strokeStyle = colour('--sled-green')
    line(ctx, p.ax, p.ay, p.bx, p.by)
    ctx.strokeStyle = colour('--sled-pink')
    line(ctx, p.cx, p.cy, p.dx, p.dy)
  }

  ctx.strokeStyle = colour('--sled-pencil')
  for (const g of world.wells) {
    // A hand-scribbled spiral, as an inward arc rather than a plain circle.
    ctx.beginPath()
    for (let i = 0; i <= 48; i++) {
      const t = i / 48
      const ang = t * Math.PI * 4
      const rad = 30 * (1 - t * 0.72)
      const px = g.x + Math.cos(ang) * rad
      const py = g.y + Math.sin(ang) * rad
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  for (const wd of world.winds) {
    if (wd.kind === 1) {
      ctx.beginPath()
      ctx.arc(wd.ax, wd.ay, wd.radius, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      line(ctx, wd.ax, wd.ay, wd.bx, wd.by)
      // A little arrowhead, so the push direction is visible.
      const hx = wd.bx - wd.ux * 12
      const hy = wd.by - wd.uy * 12
      line(ctx, wd.bx, wd.by, hx - wd.uy * 7, hy + wd.ux * 7)
      line(ctx, wd.bx, wd.by, hx + wd.uy * 7, hy - wd.ux * 7)
    }
  }
  ctx.restore()
}

/**
 * The eraser's reach.
 *
 * It has always been 12 world units, and it has always been invisible — you
 * erased by guesswork and found out what you hit afterwards. Shown only while
 * the eraser is the active tool, so it costs nothing the rest of the time.
 */
function drawEraser(
  ctx: CanvasRenderingContext2D,
  e: { x: number; y: number; r: number },
  zoom: number,
  ink: string,
): void {
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.2 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.beginPath()
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawStartFlag(ctx: CanvasRenderingContext2D, x: number, y: number, ink: string): void {
  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y + 2)
  ctx.lineTo(x, y - 28)
  ctx.lineTo(x + 15, y - 22)
  ctx.lineTo(x, y - 15)
  ctx.stroke()
  ctx.restore()
}

/**
 * The rider.
 *
 * Drawn in the same hand as the doodles: a handful of strokes, no shading, no
 * perspective. It was bare constraint segments for four phases — every square
 * inch of this page had been art-directed except the character the product is
 * named around and the camera is locked onto, which made the whole thing read
 * as a tech demo with very good scenery.
 *
 * Everything is built off the sled's **own frame** — `u` along nose→tail, `up`
 * perpendicular to it — so the figure leans, rolls and lands with the rig
 * instead of being pasted on at screen angles. There is no new state and no new
 * point: the five the simulation already has are the joints.
 *
 * The constraint overlay is still there under `?debug`, because a rig that is
 * folding or mirroring should be visible rather than inferred.
 */
function drawRider(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  colour: Palette,
  scarf: Scarf | null,
  debug: boolean,
): void {
  const ink =
    rig.state === 'running' ? colour('--sled-ink')
    : rig.state === 'finished' ? colour('--sled-green')
    : colour('--sled-red')

  // Behind the rider, so it reads as trailing rather than draped over him.
  if (scarf) drawScarf(ctx, scarf, colour('--sled-red'))
  const pts = rig.pts

  ctx.save()
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const nose = pts[NOSE]!
  const tail = pts[TAIL]!
  const seat = pts[SEAT]!
  const head = pts[HEAD]!
  const hand = pts[HAND]!

  if (debug) {
    ctx.lineWidth = 1.2
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    for (const c of CONSTRAINTS) {
      const a = pts[c.a]!
      const b = pts[c.b]!
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // The sled's frame. `up` is the sled's up, not the screen's, so a rider on a
  // steep face leans with the hill.
  let ux = nose.x - tail.x
  let uy = nose.y - tail.y
  const len = Math.sqrt(ux * ux + uy * uy) || 1
  ux /= len
  uy /= len
  const px = uy
  const py = -ux
  const at = (alongU: number, alongUp: number, from = { x: nose.x, y: nose.y }) => ({
    x: from.x + ux * alongU + px * alongUp,
    y: from.y + uy * alongU + py * alongUp,
  })

  /** Head radius. Declared up here because the neck stops short of it. */
  const R = 5

  // The rig is 28 px long and 27 px tall, which is not much room. Everything
  // below is deliberately few and large: a first pass with a knee joint, a
  // brimmed hat and a tall curl put six overlapping strokes inside a thumbnail
  // and the curl swallowed the legs. At this size, detail subtracts.

  // ── the toboggan ───────────────────────────────────────────────────────────
  // A flat runner with a small upturn at the front — the one detail that makes
  // it a sled rather than a plank. Heavier than everything else: it is the part
  // you are actually watching, and at the zoom a long track opens at, a hairline
  // vanishes into the ruling.
  const curlTip = at(4, 6)
  const curlCtl = at(8, 1)
  ctx.lineWidth = 3.4
  ctx.beginPath()
  ctx.moveTo(tail.x, tail.y)
  ctx.lineTo(nose.x, nose.y)
  ctx.quadraticCurveTo(curlCtl.x, curlCtl.y, curlTip.x, curlTip.y)
  ctx.stroke()

  // ── legs ───────────────────────────────────────────────────────────────────
  // One stroke, seat to a foot braced short of the curl. A knee joint reads as
  // a scribble at this scale.
  const foot = at(-6, 3)
  ctx.lineWidth = 2.3
  ctx.beginPath()
  ctx.moveTo(seat.x, seat.y)
  ctx.lineTo(foot.x, foot.y)
  ctx.stroke()

  // ── torso and arm ──────────────────────────────────────────────────────────
  // The shoulder sits at 45% of seat→head. Higher, and the arm appears to come
  // out of the side of the head.
  // The torso runs the whole way to the head. Stopping it at the shoulder left
  // the head attached to nothing — it read as floating just above the body, and
  // the arm happening to pass nearby was the only thing disguising it.
  const sh = { x: seat.x + (head.x - seat.x) * 0.45, y: seat.y + (head.y - seat.y) * 0.45 }
  // Stops just *outside* the head circle. Running the 3 px torso into a 5 px
  // circle filled it in and the head read as a blob.
  const neck = at(0, -R * 1.15, head)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(seat.x, seat.y)
  ctx.lineTo(neck.x, neck.y)
  ctx.stroke()

  // Thinner than the torso, so the two do not read as one double line when the
  // rig is upright and they run close together.
  ctx.lineWidth = 1.9
  ctx.beginPath()
  ctx.moveTo(sh.x, sh.y)
  ctx.lineTo(hand.x, hand.y)
  ctx.stroke()

  // ── head and hat ───────────────────────────────────────────────────────────
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.arc(head.x, head.y, R, 0, Math.PI * 2)
  ctx.stroke()

  // A woolly hat: one dome, wider than the skull and clear above it. A quadratic
  // only reaches half way to its control point, so a control at 2.3R peaked
  // barely above the crown and the whole thing read as a thick head outline. At
  // 4.2R the dome sits a full radius proud, which is what makes it a hat.
  ctx.lineWidth = 2
  const hatBack = at(-R * 1.3, R * 0.15, head)
  const hatFront = at(R * 1.3, R * 0.15, head)
  const hatTop = at(0, R * 4.2, head)
  ctx.beginPath()
  ctx.moveTo(hatBack.x, hatBack.y)
  ctx.quadraticCurveTo(hatTop.x, hatTop.y, hatFront.x, hatFront.y)
  ctx.stroke()

  // What happened, drawn next to the head.
  //
  // All three are sketched, not typed. Crash and off-track used to be `!!` and
  // `??` in bold monospace — ASCII punctuation at the two moments the page most
  // wants to look hand-made, in a product whose entire art direction is that a
  // kid drew this. Each is knocked out in paper first, because the rider can end
  // on top of a highlighter band and a thin mark on a coloured wash is invisible
  // exactly when it needs reading.
  if (rig.state !== 'running') {
    ctx.beginPath()
    if (rig.state === 'crashed') {
      // An impact burst: rays all round, uneven, the way you scribble a bang.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        const far = i % 2 === 0 ? 19 : 14
        ctx.moveTo(head.x + dx * 9, head.y + dy * 9)
        ctx.lineTo(head.x + dx * far, head.y + dy * far)
      }
    } else if (rig.state === 'gone') {
      // Off the page: a dashed fall away downward, and nothing to hit.
      for (let i = 0; i < 3; i++) {
        const y = head.y + 12 + i * 8
        ctx.moveTo(head.x + 11, y)
        ctx.lineTo(head.x + 11, y + 4)
      }
      ctx.moveTo(head.x + 7, head.y + 34)
      ctx.lineTo(head.x + 11, head.y + 40)
      ctx.lineTo(head.x + 15, head.y + 34)
    } else {
      // Three rays over the head, the way a kid draws something being pleased
      // with itself.
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.62
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        ctx.moveTo(head.x + dx * 9, head.y + dy * 9)
        ctx.lineTo(head.x + dx * 17, head.y + dy * 17)
      }
    }
    ctx.strokeStyle = colour('--sled-paper')
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = rig.state === 'finished' ? colour('--sled-green') : colour('--sled-red')
    ctx.lineWidth = 2.2
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * The empty page prompt.
 *
 * One arrow, pointing the way you should drag.
 *
 * The first version had two: a drawn arrow curving *up-left* toward the flag,
 * and the text "draw a hill →" pointing right. Two arrows, opposite directions,
 * neither indicating the downhill slope you actually want — at 390 px wide it
 * read as an error rather than an invitation.
 */
function drawEmptyHint(ctx: CanvasRenderingContext2D, s: SceneInput): void {
  const c = ctx
  const colour = s.colour
  const sx = s.w / 2 + (s.startX - s.cam.x) * s.cam.zoom
  const sy = s.h / 2 + (s.startY - s.cam.y) * s.cam.zoom

  // Length scales with the viewport so the gesture reads at any width.
  const len = Math.min(150, s.w * 0.34)
  const x0 = sx + 16
  const y0 = sy + 20
  const x1 = x0 + len
  const y1 = y0 + len * 0.46

  c.save()
  c.globalAlpha = 0.4
  c.fillStyle = colour('--sled-ink')
  c.strokeStyle = colour('--sled-ink')
  c.lineWidth = 1.8
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.setLineDash([7, 6])

  // The stroke you would draw: a slope away from the flag, sagging like a hill.
  c.beginPath()
  c.moveTo(x0, y0)
  c.quadraticCurveTo(x0 + len * 0.55, y0 + len * 0.1, x1, y1)
  c.stroke()

  // Arrowhead at the far end, aligned to the direction of travel.
  c.setLineDash([])
  const ang = Math.atan2(y1 - (y0 + len * 0.1), x1 - (x0 + len * 0.55))
  const head = 11
  c.beginPath()
  c.moveTo(x1, y1)
  c.lineTo(x1 - head * Math.cos(ang - 0.42), y1 - head * Math.sin(ang - 0.42))
  c.moveTo(x1, y1)
  c.lineTo(x1 - head * Math.cos(ang + 0.42), y1 - head * Math.sin(ang + 0.42))
  c.stroke()

  c.font = '15px ui-monospace, monospace'
  c.fillText('draw a hill', x0 + 2, y0 - 10)
  c.restore()
}

function line(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.stroke()
}
