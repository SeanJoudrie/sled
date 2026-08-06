/**
 * Sled — draw a line, he rides it.
 *
 * Phases 3–5 and 8: the page, the editor, all seven brushes, and the share
 * link. Stamps and the hand-drawn rider are still to come; a level that already
 * contains stamps runs and round-trips, there is simply no UI to place one yet.
 *
 * Rendering never writes to the simulation. The camera, the wobble and the
 * parallax are all render state, and the run stays a pure function of the level.
 */

import {
  MAX_TICKS_PER_FRAME,
  NOSE,
  SEAT,
  buildWorld,
  spawn,
  step,
} from './sim/index.ts'
import type { BrushId, Level, Rig, World } from './sim/index.ts'
import type { Stroke } from './level/stroke.ts'
import { encodeLevel, tryLevelFromHash } from './level/format.ts'
import { fnv1a } from './level/prng.ts'
import { fixtureDescent } from './level/fixtures.ts'
import { Model } from './editor/model.ts'
import { buildToolbar } from './editor/toolbar.ts'
import type { Action, ToolId } from './editor/toolbar.ts'
import { makeCamera, follow, screenToWorld, settle, zoomAt } from './render/camera.ts'
import { drawScene } from './render/scene.ts'
import { initGrain } from './render/paper.ts'
import { seedParallax } from './render/parallax.ts'

const TICK_MS = 1000 / 60

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const railEl = document.getElementById('rail')!
const tickEl = document.getElementById('tick')!
const speedEl = document.getElementById('speed')!
const stateEl = document.getElementById('state')!
const toastEl = document.getElementById('toast')!
const liveEl = document.getElementById('live')!

const css = getComputedStyle(document.documentElement)
const colourCache = new Map<string, string>()
const colour = (token: string): string => {
  let v = colourCache.get(token)
  if (v === undefined) {
    v = css.getPropertyValue(token).trim() || '#1e2430'
    colourCache.set(token, v)
  }
  return v
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── state ────────────────────────────────────────────────────────────────────

const model = new Model()
const cam = makeCamera()

let tool: ToolId = { kind: 'brush', brush: 0 }
let mode: 'edit' | 'run' = 'edit'
let playing = false
let rig: Rig | null = null
let world: World | null = null
let accumulator = 0
let lastFrame = 0

/** Camera to come back to when a run ends — a run should not move your page. */
let editCamX = 0
let editCamY = 0
let editZoom = 1

// ── pointers ─────────────────────────────────────────────────────────────────

type Gesture =
  | { kind: 'draw' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'erase'; doomed: Set<Stroke> }
  | { kind: 'pinch'; dist: number; midX: number; midY: number }
  | null

let gesture: Gesture = null
let spaceHeld = false
const pointers = new Map<number, { x: number; y: number }>()
let cursor = { x: 0, y: 0 }
let doomed: Set<Stroke> = new Set()

// ── level plumbing ───────────────────────────────────────────────────────────

function currentLevel(): Level {
  return model.toLevel()
}

/**
 * Reseed the treeline.
 *
 * Called on load and on play, never per stroke: the requirement is that
 * everyone watching the same run sees the same page, and re-rolling on every
 * edit would turn the background into a slot machine while you draw.
 */
function reseedParallax(): void {
  seedParallax(fnv1a(encodeLevel(currentLevel())))
}

/**
 * Whether the address bar can be written to at all.
 *
 * An embedded copy of this page can be on an opaque origin, where the browser
 * refuses history writes outright. That is survivable — the level still exists
 * and can still be encoded — but the share button must not then claim the link
 * is in the address bar when nothing was ever put there.
 */
let hashWritable = true

function writeHash(encoded: string): void {
  if (!hashWritable) return
  try {
    // replaceState, not location.hash: a new history entry per stroke would
    // turn the browser Back button into a broken undo.
    history.replaceState(null, '', `#l=${encoded}`)
  } catch {
    hashWritable = false
  }
}

let shareTimer = 0
function scheduleShareSync(): void {
  clearTimeout(shareTimer)
  shareTimer = window.setTimeout(() => writeHash(encodeLevel(currentLevel())), 350)
}

function loadLevel(level: Level, recentre: boolean): void {
  model.load(level)
  stopRun()
  if (recentre) {
    cam.x = model.startX
    cam.y = model.startY
    cam.zoom = 1
    settle(cam)
  }
  reseedParallax()
  scheduleShareSync()
  sync()
}

// ── run control ──────────────────────────────────────────────────────────────

function startRun(): void {
  if (mode === 'edit') {
    editCamX = cam.x
    editCamY = cam.y
    editZoom = cam.zoom
  }
  world = buildWorld(currentLevel())
  rig = spawn(world)
  mode = 'run'
  playing = true
  accumulator = 0
  settle(cam)
  reseedParallax()
  announce('Playing.')
  sync()
}

function stopRun(): void {
  if (mode === 'run') {
    cam.x = editCamX
    cam.y = editCamY
    cam.zoom = editZoom
    settle(cam)
  }
  mode = 'edit'
  playing = false
  rig = null
  world = null
  sync()
}

/** Any edit during a run resets first — editing a level mid-flight is nonsense. */
function ensureEditable(): void {
  if (mode === 'run') stopRun()
}

// ── input ────────────────────────────────────────────────────────────────────

function worldAt(sx: number, sy: number): { x: number; y: number } {
  return screenToWorld(cam, sx, sy, window.innerWidth, window.innerHeight)
}

function localPoint(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault())

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  const p = localPoint(e)
  pointers.set(e.pointerId, p)

  if (pointers.size === 2) {
    // A second finger cancels whatever the first was doing, rather than drawing
    // a stray line into the middle of a pinch.
    if (gesture?.kind === 'draw') model.cancelStroke()
    doomed = new Set()
    gesture = beginPinch()
    return
  }
  if (pointers.size > 2) return

  cursor = worldAt(p.x, p.y)

  const wantsPan = spaceHeld || e.button === 1
  const wantsErase = e.button === 2 || tool.kind === 'erase'

  if (wantsPan) {
    gesture = { kind: 'pan', lastX: p.x, lastY: p.y }
    canvas.classList.add('panning')
    return
  }

  if (mode === 'run') {
    // Tapping the canvas mid-run gets you back to the page.
    stopRun()
    return
  }

  if (wantsErase) {
    gesture = { kind: 'erase', doomed: new Set() }
    canvas.classList.add('erasing')
    collectDoomed(cursor.x, cursor.y)
    return
  }

  if (tool.kind === 'flag') {
    model.setStart(cursor.x, cursor.y)
    scheduleShareSync()
    announce('Start flag moved.')
    sync()
    return
  }

  model.beginStroke(cursor.x, cursor.y)
  gesture = { kind: 'draw' }
})

canvas.addEventListener('pointermove', (e) => {
  const p = localPoint(e)
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
  cursor = worldAt(p.x, p.y)

  if (gesture?.kind === 'pinch') {
    updatePinch(gesture)
    return
  }
  if (gesture?.kind === 'pan') {
    cam.x -= (p.x - gesture.lastX) / cam.zoom
    cam.y -= (p.y - gesture.lastY) / cam.zoom
    gesture.lastX = p.x
    gesture.lastY = p.y
    return
  }
  if (gesture?.kind === 'erase') {
    collectDoomed(cursor.x, cursor.y)
    return
  }
  if (gesture?.kind === 'draw') {
    model.extendStroke(cursor.x, cursor.y)
  }
})

function endPointer(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  const p = localPoint(e)
  const w = worldAt(p.x, p.y)

  if (gesture?.kind === 'pinch') {
    // Do not fall back into drawing with the finger that is still down.
    if (pointers.size < 2) gesture = null
    return
  }
  if (gesture?.kind === 'draw') {
    if (model.endStroke(w.x, w.y)) {
      scheduleShareSync()
      announce('Stroke added.')
    }
  } else if (gesture?.kind === 'erase') {
    if (model.erase(gesture.doomed)) {
      scheduleShareSync()
      announce(`${gesture.doomed.size} stroke${gesture.doomed.size === 1 ? '' : 's'} erased.`)
    }
    doomed = new Set()
  }

  gesture = null
  canvas.classList.remove('panning', 'erasing')
  sync()
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

function collectDoomed(x: number, y: number): void {
  if (gesture?.kind !== 'erase') return
  for (const s of model.strokesAt(x, y)) gesture.doomed.add(s)
  doomed = gesture.doomed
}

function beginPinch(): Gesture {
  const [a, b] = [...pointers.values()]
  if (!a || !b) return null
  return {
    kind: 'pinch',
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  }
}

function updatePinch(g: Extract<Gesture, { kind: 'pinch' }>): void {
  const [a, b] = [...pointers.values()]
  if (!a || !b) return
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2

  // Pan by the midpoint's travel, then zoom about it.
  cam.x -= (midX - g.midX) / cam.zoom
  cam.y -= (midY - g.midY) / cam.zoom
  if (g.dist > 1 && dist > 1) {
    zoomAt(cam, midX, midY, window.innerWidth, window.innerHeight, dist / g.dist)
  }
  g.dist = dist
  g.midX = midX
  g.midY = midY
}

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    const r = canvas.getBoundingClientRect()
    zoomAt(
      cam,
      e.clientX - r.left,
      e.clientY - r.top,
      window.innerWidth,
      window.innerHeight,
      e.deltaY < 0 ? 1.12 : 1 / 1.12,
    )
  },
  { passive: false },
)

// ── keyboard ─────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !spaceHeld) {
    spaceHeld = true
    e.preventDefault()
    return
  }

  const meta = e.metaKey || e.ctrlKey
  if (meta && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    ensureEditable()
    const ok = e.shiftKey ? model.redo() : model.undo()
    if (ok) {
      scheduleShareSync()
      announce(e.shiftKey ? 'Redone.' : 'Undone.')
    }
    sync()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (mode === 'run' && rig?.state === 'running') playing = !playing
    else startRun()
    sync()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    stopRun()
    return
  }
  if (e.key.toLowerCase() === 'e') {
    setTool({ kind: 'erase' })
    return
  }
  if (e.key.toLowerCase() === 'f') {
    setTool({ kind: 'flag' })
    return
  }
  const n = Number(e.key)
  if (Number.isInteger(n) && n >= 1 && n <= 7) {
    setTool({ kind: 'brush', brush: (n - 1) as BrushId })
  }
})

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    spaceHeld = false
    canvas.classList.remove('panning')
    if (gesture?.kind === 'pan') gesture = null
  }
})

// ── toolbar ──────────────────────────────────────────────────────────────────

function setTool(t: ToolId): void {
  ensureEditable()
  tool = t
  if (t.kind === 'brush') model.brush = t.brush
  sync()
}

const toolbar = buildToolbar(railEl, {
  onTool: setTool,
  onAction: (a: Action) => {
    if (a === 'play') {
      if (mode === 'run' && rig?.state === 'running') playing = !playing
      else startRun()
      sync()
      return
    }
    if (a === 'reset') {
      stopRun()
      return
    }
    ensureEditable()
    if (a === 'undo' && model.undo()) announce('Undone.')
    else if (a === 'redo' && model.redo()) announce('Redone.')
    else if (a === 'clear') {
      model.clear()
      announce('Page cleared.')
    } else if (a === 'share') {
      void copyLink()
      return
    }
    scheduleShareSync()
    sync()
  },
})

async function copyLink(): Promise<void> {
  const encoded = encodeLevel(currentLevel())
  const url = `${location.origin}${location.pathname}#l=${encoded}`
  writeHash(encoded)
  try {
    await navigator.clipboard.writeText(url)
    toast(`Link copied · ${encoded.length} characters`)
    return
  } catch {
    // Clipboard access can be refused, and on an opaque origin so can the
    // address bar. Say which of those actually happened rather than pointing
    // at a URL that was never written.
  }
  toast(hashWritable ? 'Link is in the address bar' : 'Copy blocked here — open the page directly')
}

// ── feedback ─────────────────────────────────────────────────────────────────

let toastTimer = 0
function toast(msg: string): void {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1900)
}

/** Crash state is announced, not signalled by the "!!" alone. */
function announce(msg: string): void {
  liveEl.textContent = msg
}

let lastAnnouncedState = ''
function sync(): void {
  toolbar.sync({
    tool,
    canUndo: model.canUndo,
    canRedo: model.canRedo,
    playing: playing && rig?.state === 'running',
    canClear: !model.isEmpty,
  })

  const state = mode === 'edit' ? 'edit' : (rig?.state ?? 'edit')
  stateEl.dataset['state'] = state
  stateEl.textContent =
    mode === 'edit' ? 'editing' : state === 'running' ? (playing ? 'running' : 'paused') : state

  if (state !== lastAnnouncedState) {
    lastAnnouncedState = state
    if (state === 'crashed') announce('Crashed. Press Escape to keep drawing.')
    else if (state === 'gone') announce('Off the page. Press Escape to keep drawing.')
  }
}

// ── loop ─────────────────────────────────────────────────────────────────────

function speed(): number {
  if (!rig) return 0
  const n = rig.pts[NOSE]!
  const dx = n.x - n.px
  const dy = n.y - n.py
  return Math.sqrt(dx * dx + dy * dy)
}

function frame(now: number): void {
  const dt = lastFrame === 0 ? 0 : Math.min(now - lastFrame, 250)
  lastFrame = now

  if (mode === 'run' && playing && rig && world && rig.state === 'running') {
    accumulator += dt
    // Whole ticks only, capped so a stalled tab cannot spiral. The simulation
    // never sees a frame delta.
    let n = 0
    while (accumulator >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
      step(rig, world)
      accumulator -= TICK_MS
      n++
    }
    if (accumulator > TICK_MS * MAX_TICKS_PER_FRAME) accumulator = 0
    if (rig.state !== 'running') {
      playing = false
      sync()
    }
  }

  if (mode === 'run' && rig) {
    const seat = rig.pts[SEAT]!
    follow(cam, seat.x, seat.y, speed(), reducedMotion)
  }

  const w = window.innerWidth
  const h = window.innerHeight
  drawScene({
    ctx,
    w,
    h,
    cam,
    strokes: model.strokes,
    world,
    rig,
    preview: mode === 'edit' ? model.previewStroke(cursor.x, cursor.y) : null,
    doomed,
    startX: model.startX,
    startY: model.startY,
    colour,
    reducedMotion,
    showEmptyHint: mode === 'edit' && model.isEmpty && gesture === null,
  })

  tickEl.textContent = `tick ${rig ? rig.tick : 0}`
  speedEl.textContent = `${speed().toFixed(2)} px/tick`

  requestAnimationFrame(frame)
}

// ── boot ─────────────────────────────────────────────────────────────────────

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(window.innerWidth * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

window.addEventListener('resize', resize)
resize()
initGrain(ctx, colour('--sled-grain'))

// A level in the URL wins. Failing that, the example track — an empty page with
// no way to know what any of this does is a worse first five seconds than a
// hill you can immediately press play on and then draw over.
const fromUrl = tryLevelFromHash(location.hash)
loadLevel(fromUrl ?? fixtureDescent(), true)
if (!fromUrl) announce('Example track loaded. Draw over it, or clear the page.')

requestAnimationFrame(frame)
