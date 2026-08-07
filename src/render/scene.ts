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
  /** Strokes the eraser is about to remove, drawn ghosted. */
  doomed: ReadonlySet<Stroke>
  /** Where the eraser is and how wide, in world units. Null unless erasing. */
  eraser: { x: number; y: number; r: number } | null
  /** The rider's scarf. Render-only; never read by the simulation. */
  scarf: Scarf | null
  startX: number
  startY: number
  colour: Palette
  reducedMotion: boolean
  showEmptyHint: boolean
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

  // Strokes the eraser will take are dimmed rather than hidden, so you can see
  // what you are about to lose before you commit to losing it.
  const keep = s.doomed.size ? s.strokes.filter((k) => !s.doomed.has(k)) : s.strokes
  drawStrokes(ctx, keep, BRUSHES, colour)
  if (s.doomed.size) {
    ctx.save()
    ctx.globalAlpha = 0.22
    drawStrokes(ctx, s.strokes.filter((k) => s.doomed.has(k)), BRUSHES, colour)
    ctx.restore()
  }
  if (s.preview) drawStrokes(ctx, [s.preview], BRUSHES, colour)

  if (s.world) drawStamps(ctx, s.world, colour)
  drawStartFlag(ctx, s.startX, s.startY, colour('--sled-ink'))
  if (s.rig) drawRider(ctx, s.rig, colour, s.scarf)
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
 * The rider, as bare segments over a placeholder sled.
 *
 * Still a placeholder: the layered part manifest and the hand-drawn art are
 * later phases. Every constraint is drawn, so a rig that is folding or
 * mirroring is visible rather than something you have to infer.
 */
function drawRider(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  colour: Palette,
  scarf: Scarf | null,
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

  // The sled itself, drawn heavier than its rigging — it is the part you are
  // actually watching, and at the zoom a long track opens at, a hairline
  // disappears into the ruling.
  ctx.lineWidth = 3.6
  const nose = pts[NOSE]!
  const tail = pts[TAIL]!
  ctx.beginPath()
  ctx.moveTo(tail.x, tail.y)
  ctx.lineTo(nose.x, nose.y)
  ctx.stroke()

  ctx.lineWidth = 2.6
  const seat = pts[SEAT]!
  const head = pts[HEAD]!
  const hand = pts[HAND]!
  ctx.beginPath()
  ctx.moveTo(seat.x, seat.y)
  ctx.lineTo(head.x, head.y)
  ctx.moveTo(seat.x, seat.y)
  ctx.lineTo(hand.x, hand.y)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(head.x, head.y, 5, 0, Math.PI * 2)
  ctx.stroke()

  // What happened, written next to the head. Crash and off-track are both bad
  // news and both red; finishing is not, and must never borrow their marks —
  // the first version tested `state !== 'running'` and stamped a confused red
  // `??` on the one outcome the player was aiming for.
  if (rig.state === 'crashed' || rig.state === 'gone') {
    ctx.fillStyle = colour('--sled-red')
    ctx.font = 'bold 18px ui-monospace, monospace'
    ctx.fillText(rig.state === 'crashed' ? '!!' : '??', head.x + 9, head.y - 9)
  } else if (rig.state === 'finished') {
    // Three short rays, the way a kid draws something being pleased with itself.
    //
    // Knocked out in paper first, because the rig stops *on* the tape — a win is
    // the one state where the rider is guaranteed to be standing on a green
    // band, and green rays on green tape are invisible at exactly the moment
    // they need to be read.
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.62
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      ctx.moveTo(head.x + dx * 9, head.y + dy * 9)
      ctx.lineTo(head.x + dx * 17, head.y + dy * 17)
    }
    ctx.strokeStyle = colour('--sled-paper')
    ctx.lineWidth = 5
    ctx.stroke()
    ctx.strokeStyle = colour('--sled-green')
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
