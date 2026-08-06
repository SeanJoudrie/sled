/**
 * Phase 1 tuning harness.
 *
 * Bare line segments, no paper, no editor, no rider art — spec phase 1 is
 * exactly "one hardcoded track, placeholder rig drawn as bare line segments",
 * and the point of it is to answer one question: does he carry speed like a
 * sled? Paper, rules, parallax and the real ink/highlighter strokes are phase 3
 * and deliberately absent, because making this look finished before the ride
 * feels right is how you end up tuning to a pretty thing that plays badly.
 *
 * Nothing in here may ever feed back into the simulation. Rendering reads the
 * rig; it never writes it.
 */

import {
  BRUSHES,
  CONSTRAINTS,
  HEAD,
  MAX_TICKS_PER_FRAME,
  NOSE,
  SEAT,
  TAIL,
  buildWorld,
  spawn,
  step,
} from './sim/index.ts'
import type { Level, Rig, World } from './sim/index.ts'
import { fixtureDescent, fixturePortal } from './level/fixtures.ts'
import { encodeLevel, tryLevelFromHash } from './level/format.ts'

const TICK_MS = 1000 / 60

// Camera: critically damped follow, evaluated in render space only.
const CAM_K = 0.1
const CAM_DAMP = 0.72
const ZOOM_NEAR = 1.0
const ZOOM_FAR = 0.7
const ZOOM_AT_SPEED = 12

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const statEl = document.getElementById('stat')!
const playBtn = document.getElementById('play') as HTMLButtonElement
const resetBtn = document.getElementById('reset') as HTMLButtonElement
const fixtureSel = document.getElementById('fixture') as HTMLSelectElement

const css = getComputedStyle(document.documentElement)
const colour = (token: string): string => css.getPropertyValue(token).trim() || '#1e2430'

// Definite-assignment: load() sets all three before anything reads them, and it
// is called at the bottom of this file before the first frame is requested.
let level!: Level
let world!: World
let rig!: Rig
let playing = false
let accumulator = 0
let last = 0

// Camera state. Render-only — never read by the sim.
let camX = 0
let camY = 0
let camVX = 0
let camVY = 0
let zoom = ZOOM_NEAR

function load(next: Level, recentre = true): void {
  level = next
  world = buildWorld(level)
  rig = spawn(world)
  playing = false
  accumulator = 0
  if (recentre) {
    camX = world.startX
    camY = world.startY
    camVX = 0
    camVY = 0
    zoom = ZOOM_NEAR
  }
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function speed(): number {
  const n = rig.pts[NOSE]!
  const dx = n.x - n.px
  const dy = n.y - n.py
  return Math.sqrt(dx * dx + dy * dy)
}

// ── render ───────────────────────────────────────────────────────────────────

function draw(): void {
  const w = window.innerWidth
  const h = window.innerHeight

  ctx.save()
  ctx.fillStyle = colour('--sled-paper')
  ctx.fillRect(0, 0, w, h)

  ctx.translate(w / 2, h / 2)
  ctx.scale(zoom, zoom)
  ctx.translate(-camX, -camY)

  // Lines, in level order, coloured by brush. Highlighter-class brushes get
  // the fat translucent treatment even here — it is the one visual rule that
  // makes a track readable without a legend, and it costs two lines of code.
  ctx.lineCap = 'round'
  for (const s of world.segs) {
    const hl = s.brush.cls === 'highlighter'
    ctx.strokeStyle = colour(s.brush.token)
    ctx.lineWidth = hl ? 11 : 2.4
    ctx.globalAlpha = hl ? 0.5 : 1
    ctx.beginPath()
    ctx.moveTo(s.ax, s.ay)
    ctx.lineTo(s.bx, s.by)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // Stamps, as bare outlines — placeholders for the hand-scribbled art.
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  for (const p of world.portals) {
    ctx.strokeStyle = colour('--sled-green')
    ctx.beginPath()
    ctx.moveTo(p.ax, p.ay)
    ctx.lineTo(p.bx, p.by)
    ctx.stroke()
    ctx.strokeStyle = colour('--sled-pink')
    ctx.beginPath()
    ctx.moveTo(p.cx, p.cy)
    ctx.lineTo(p.dx, p.dy)
    ctx.stroke()
  }
  ctx.strokeStyle = colour('--sled-pencil')
  for (const g of world.wells) {
    ctx.beginPath()
    ctx.arc(g.x, g.y, 24, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const wd of world.winds) {
    ctx.beginPath()
    if (wd.kind === 1) {
      ctx.arc(wd.ax, wd.ay, wd.radius, 0, Math.PI * 2)
    } else {
      ctx.moveTo(wd.ax, wd.ay)
      ctx.lineTo(wd.bx, wd.by)
    }
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Start flag.
  ctx.strokeStyle = colour('--sled-ink')
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(world.startX, world.startY)
  ctx.lineTo(world.startX, world.startY - 26)
  ctx.lineTo(world.startX + 14, world.startY - 20)
  ctx.lineTo(world.startX, world.startY - 14)
  ctx.stroke()

  // The rig, as bare segments. Every constraint is drawn, so a rig that is
  // folding or mirroring is visible rather than something you infer.
  ctx.lineWidth = 2
  ctx.strokeStyle = colour(rig.state === 'running' ? '--sled-ink' : '--sled-red')
  ctx.beginPath()
  for (const c of CONSTRAINTS) {
    const a = rig.pts[c.a]!
    const b = rig.pts[c.b]!
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()

  // Runners solid, head hollow — the head is the point that ends the run.
  for (const i of [NOSE, TAIL]) {
    const p = rig.pts[i]!
    ctx.fillStyle = colour('--sled-ink')
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  const head = rig.pts[HEAD]!
  ctx.beginPath()
  ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2)
  ctx.stroke()

  if (rig.state === 'crashed') {
    ctx.fillStyle = colour('--sled-red')
    ctx.font = 'bold 20px ui-monospace, monospace'
    ctx.fillText('!!', head.x + 8, head.y - 8)
  }

  ctx.restore()
}

// ── loop ─────────────────────────────────────────────────────────────────────

function frame(now: number): void {
  const dt = last === 0 ? 0 : Math.min(now - last, 250)
  last = now

  if (playing && rig.state === 'running') {
    accumulator += dt
    // Whole ticks only, capped so a stalled tab cannot spiral. Rendering is
    // decoupled from the simulation; the sim never sees a frame delta.
    let n = 0
    while (accumulator >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
      step(rig, world)
      accumulator -= TICK_MS
      n++
    }
    if (accumulator > TICK_MS * MAX_TICKS_PER_FRAME) accumulator = 0
    if (rig.state !== 'running') playing = false
  }

  const seat = rig.pts[SEAT]!
  camVX = (camVX + (seat.x - camX) * CAM_K) * CAM_DAMP
  camVY = (camVY + (seat.y - camY) * CAM_K) * CAM_DAMP
  camX += camVX
  camY += camVY

  const t = Math.min(speed() / ZOOM_AT_SPEED, 1)
  const wantZoom = ZOOM_NEAR + (ZOOM_FAR - ZOOM_NEAR) * t
  zoom += (wantZoom - zoom) * 0.05

  draw()

  statEl.textContent =
    `tick ${String(rig.tick).padStart(4)}  ·  ` +
    `${speed().toFixed(2)} px/tick  ·  ` +
    `${(speed() * 60).toFixed(0)} px/s  ·  ` +
    rig.state
  playBtn.textContent = playing ? 'Pause' : 'Play'

  requestAnimationFrame(frame)
}

// ── wiring ───────────────────────────────────────────────────────────────────

function selected(): Level {
  return fixtureSel.value === 'portal' ? fixturePortal() : fixtureDescent()
}

playBtn.addEventListener('click', () => {
  if (rig.state !== 'running') load(level, false)
  playing = !playing
})
resetBtn.addEventListener('click', () => load(level, false))
fixtureSel.addEventListener('change', () => {
  // "custom" is only ever set programmatically, when a level arrived in the
  // URL. Picking it by hand has nothing to switch to, so keep what is loaded.
  if (fixtureSel.value === 'custom') return
  const next = selected()
  location.hash = `l=${encodeLevel(next)}`
  load(next)
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (rig.state !== 'running') load(level, false)
    playing = true
  } else if (e.key === 'Escape') {
    load(level, false)
  } else {
    return
  }
  e.preventDefault()
})

window.addEventListener('resize', resize)

// A level in the URL wins; otherwise start on the descent. The share link needs
// no backend of any kind — the replay *is* the level.
const fromUrl = tryLevelFromHash(location.hash)
load(fromUrl ?? fixtureDescent())
if (fromUrl) fixtureSel.value = 'custom'

resize()
requestAnimationFrame(frame)

// Handy while tuning: the wire size of what is on screen.
console.log(
  `sled · ${BRUSHES.length} brushes · level encodes to ${encodeLevel(level).length} chars`,
)
