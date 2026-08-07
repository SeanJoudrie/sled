/**
 * Sled — draw a line, he rides it.
 *
 * Rendering never writes to the simulation. The camera, the wobble and the
 * scenery are all render state, and a run stays a pure function of the level.
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
import { encodeLevel, readHash } from './level/format.ts'
import { fnv1a } from './level/prng.ts'
import { fixtureDescent } from './level/fixtures.ts'
import { ERASE_SCREEN_R, Model } from './editor/model.ts'
import type { Doomed } from './editor/model.ts'
import { buildControls } from './editor/toolbar.ts'
import type { Action, ToolId } from './editor/toolbar.ts'
import { makeCamera, follow, quantiseZoom, screenToWorld, settle, zoomAt } from './render/camera.ts'
import { drawScene } from './render/scene.ts'
import { initGrain } from './render/paper.ts'
import { seedParallax } from './render/parallax.ts'
import { makeScarf, resetScarf, stepScarf } from './render/scarf.ts'

const TICK_MS = 1000 / 60

const canvas = document.getElementById('stage') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tickEl = document.getElementById('tick')!
const speedEl = document.getElementById('speed')!
const stateEl = document.getElementById('state')!
const toastEl = document.getElementById('toast')!
const liveEl = document.getElementById('live')!

const hudEl = document.querySelector('.hud') as HTMLElement
/**
 * `?debug` shows the tick counter and publishes the camera zoom on the canvas.
 *
 * The zoom is otherwise unobservable from outside, which meant the only way to
 * check whether the camera was misbehaving was to measure ruled-line spacing off
 * a screenshot — and that silently reports multiples of the true spacing when
 * scenery breaks up the line detection. A measurement you cannot trust is worse
 * than no measurement.
 */
const DEBUG = new URLSearchParams(location.search).has('debug')
if (DEBUG) hudEl.classList.add('debug')

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
const scarf = makeScarf()

/**
 * What a one-finger drag does.
 *
 * Drawing and panning both want the same gesture, and a phone has no right
 * button and no space bar to tell them apart — so it is a mode. Starts on
 * `draw`, because the first thing anyone should be able to do is draw.
 */
let tool: ToolId = { kind: 'draw' }
let mode: 'edit' | 'run' = 'edit'
let playing = false
let rig: Rig | null = null
let world: World | null = null
let accumulator = 0
let lastFrame = 0

let editCamX = 0
let editCamY = 0
let editZoom = 1

/**
 * The zoom a run started at, and whether the player has taken the camera.
 *
 * The follow is a convenience for someone who is not steering — the moment they
 * pan or pinch, it stops, for the rest of that run. A camera that hauls the view
 * back to the sled while you are trying to look at the jump you just built is
 * worse than no camera help at all.
 */
let runBaseZoom = 1
let cameraTaken = false

// ── pointers ─────────────────────────────────────────────────────────────────

type Gesture =
  | { kind: 'draw' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'erase'; doomed: Doomed }
  | { kind: 'pinch'; dist: number; midX: number; midY: number }
  | null

let gesture: Gesture = null
let spaceHeld = false
const pointers = new Map<number, { x: number; y: number }>()
let cursor = { x: 0, y: 0 }
let doomed: Doomed = new Map()

// ── level plumbing ───────────────────────────────────────────────────────────

const currentLevel = (): Level => model.toLevel()

/**
 * A world built from the page as it stands, for drawing stamps while editing.
 *
 * Stamps used to render only during a run, because `drawStamps` was handed the
 * run's world and there was none in edit mode. That made a level able to carry
 * physics that is not on the page: the example track has a gravity well and an
 * arrow wind, and until you pressed play neither existed as far as the page was
 * concerned. A shared link could put a well into someone's editor and silently
 * bend every run they built on what looked like blank paper.
 *
 * Built through `buildWorld` rather than read off the model directly, so the
 * derived fields the renderer needs — a wind's unit direction, a vortex's radius
 * — come from the same place the simulation gets them and cannot drift.
 *
 * Cached, and invalidated by `sync`, which already runs after every edit.
 */
let editWorld: World | null = null
function stampWorld(): World {
  if (!editWorld) editWorld = buildWorld(currentLevel())
  return editWorld
}

/**
 * The margin is rolled once, per page load.
 *
 * It used to be seeded from the level so everyone opening a link saw the same
 * doodles. Now it is different every visit, which is what makes coming back
 * worth doing — you pass a different Eiffel Tower.
 *
 * Safe only because scenery is decoration: the determinism law governs the
 * simulation, and check 12 proves `sim/` cannot reach the generator at all.
 */
const SESSION_SEED = (fnv1a(String(Date.now())) ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0

/**
 * Whether the address bar can be written to at all. An embedded copy can sit on
 * an opaque origin where history writes are refused; the share button must not
 * then claim the link is in the address bar.
 */
let hashWritable = true

function writeHash(encoded: string): void {
  if (!hashWritable) return
  try {
    // replaceState, not location.hash: a history entry per stroke would turn
    // the Back button into a broken undo.
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

/**
 * Below this, "fitting" stops being useful.
 *
 * The example track is 2200 px wide. Fitting all of it on a 390 px phone works
 * out at zoom 0.125, which makes the sled three pixels tall and squeezes the
 * 28 px ruling into corduroy. Seeing the whole level is worth less than being
 * able to see anything in it.
 */
const MIN_FIT_ZOOM = 0.5

/**
 * Frame the level: on load, and on a double tap.
 *
 * Opening at zoom 1 centred on the flag showed a *fragment* of the track on a
 * phone — a line leaving the right edge with no way to tell there was a hill.
 * Never zooms past 1, and never below MIN_FIT_ZOOM.
 */
function fitCamera(): void {
  const b = model.contentBounds()
  const w = window.innerWidth
  const h = window.innerHeight

  const cw = b.maxX - b.minX
  const ch = b.maxY - b.minY
  if (cw < 1 && ch < 1) {
    cam.x = model.startX
    cam.y = model.startY
    cam.zoom = 1
    settle(cam)
    return
  }

  // The corner clusters overlay the canvas, so the usable area is smaller than
  // the viewport. Proportional, or a phone loses half its width to padding.
  const padX = Math.min(80, w * 0.12)
  const padY = Math.min(96, h * 0.14)
  const availW = Math.max(140, w - padX * 2)
  const availH = Math.max(140, h - padY * 2)
  const fit = Math.min(availW / Math.max(cw, 1), availH / Math.max(ch, 1))

  if (fit >= MIN_FIT_ZOOM) {
    // Short enough to show whole. Centre on the content.
    cam.zoom = quantiseZoom(Math.min(fit, 1))
    cam.x = (b.minX + b.maxX) / 2
    cam.y = (b.minY + b.maxY) / 2
  } else {
    // Too long to frame at a readable size, so frame the *start* instead: the
    // flag sits left of centre and high, leaving the run ahead on screen.
    cam.zoom = MIN_FIT_ZOOM
    cam.x = model.startX + (w * 0.22) / cam.zoom
    cam.y = model.startY + (h * 0.12) / cam.zoom
  }
  settle(cam)
}

function loadLevel(level: Level, recentre: boolean, syncHash = true): void {
  model.load(level)
  stopRun()
  if (recentre) fitCamera()
  if (syncHash) scheduleShareSync()
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
  resetScarf(scarf, rig.pts[SEAT].x, rig.pts[SEAT].y - 9)
  mode = 'run'
  playing = true
  accumulator = 0
  runBaseZoom = cam.zoom
  cameraTaken = false
  settle(cam)
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

const worldAt = (sx: number, sy: number) =>
  screenToWorld(cam, sx, sy, window.innerWidth, window.innerHeight)

function localPoint(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault())

/**
 * Double-tap anywhere to reframe the level.
 *
 * Pan far enough and nothing brought you back — you were lost on an infinite
 * sheet of paper with no landmark. This reuses a gesture that previously did
 * nothing at all, so it adds no control and takes none away.
 *
 * Detected on pointer *up*, not down, and only when both presses were taps
 * rather than drags. Deciding on the way down cannot tell a tap from the start
 * of a drag, so two quick pans that happen to begin near each other read as a
 * double tap and reframe the page out from under you mid-gesture.
 */
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_SLOP = 34
/** Past this much movement, or this long held, a press was a drag. */
const TAP_SLOP = 9
const TAP_MAX_MS = 400

let pressX = 0
let pressY = 0
let pressT = 0
let lastTapAt = 0
let lastTapX = 0
let lastTapY = 0

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  const p = localPoint(e)
  pointers.set(e.pointerId, p)

  if (pointers.size === 2) {
    // A second finger cancels whatever the first was doing, rather than leaving
    // a stray line through the middle of a pinch.
    if (gesture?.kind === 'draw') model.cancelStroke()
    doomed = new Map()
    gesture = beginPinch()
    if (mode === 'run') cameraTaken = true
    return
  }
  if (pointers.size > 2) return

  cursor = worldAt(p.x, p.y)

  // Space and middle-drag always pan, and right-drag always erases, whatever
  // mode is selected — the mode exists for touch, not to take away a mouse.
  const forcePan = spaceHeld || e.button === 1
  const forceErase = e.button === 2

  pressX = p.x
  pressY = p.y
  pressT = e.timeStamp

  if (mode === 'run') {
    // Mid-run, a drag moves the page and a *tap* goes back to editing. It used
    // to end the run on pointer-down, which meant the one gesture available
    // during playback was the one that stopped it — no panning, no zooming, no
    // looking ahead at the jump you were about to hit. The tap-versus-drag test
    // in `endPointer` was already written; this just uses it here too.
    gesture = { kind: 'pan', lastX: p.x, lastY: p.y }
    return
  }

  if (forcePan || (!forceErase && tool.kind === 'pan')) {
    gesture = { kind: 'pan', lastX: p.x, lastY: p.y }
    setCursorClass()
    return
  }

  if (forceErase || tool.kind === 'erase') {
    gesture = { kind: 'erase', doomed: new Map() }
    collectDoomed(cursor.x, cursor.y)
    return
  }

  if (tool.kind === 'flag') {
    model.setStart(cursor.x, cursor.y)
    scheduleShareSync()
    announce('Start flag moved.')
    // One-shot: placing the flag hands you back the pencil.
    setTool({ kind: 'draw' })
    return
  }

  model.beginStroke(cursor.x, cursor.y)
  gesture = { kind: 'draw' }
})

canvas.addEventListener('pointermove', (e) => {
  const p = localPoint(e)
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
  cursor = worldAt(p.x, p.y)

  if (gesture?.kind === 'pinch') return updatePinch(gesture)
  if (gesture?.kind === 'pan') {
    const dx = p.x - gesture.lastX
    const dy = p.y - gesture.lastY
    // Mid-run, moving the page hands the camera over for the rest of the run.
    // Measured from where the press started, against the same slop the tap test
    // uses, so the jitter inside a tap cannot silently detach the follow from
    // someone who only meant to tap.
    if (mode === 'run') {
      const mx = p.x - pressX
      const my = p.y - pressY
      if (mx * mx + my * my > TAP_SLOP * TAP_SLOP) cameraTaken = true
    }
    cam.x -= dx / cam.zoom
    cam.y -= dy / cam.zoom
    gesture.lastX = p.x
    gesture.lastY = p.y
    return
  }
  if (gesture?.kind === 'erase') return collectDoomed(cursor.x, cursor.y)
  if (gesture?.kind === 'draw') model.extendStroke(cursor.x, cursor.y)
})

function endPointer(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  const p = localPoint(e)
  const w = worldAt(p.x, p.y)

  if (gesture?.kind === 'pinch') {
    // Do not fall back into drawing with the finger still down.
    if (pointers.size < 2) gesture = null
    return
  }
  const movedX = p.x - pressX
  const movedY = p.y - pressY
  const wasTap =
    Math.sqrt(movedX * movedX + movedY * movedY) < TAP_SLOP &&
    e.timeStamp - pressT < TAP_MAX_MS

  if (mode === 'run') {
    gesture = null
    // A tap goes back to editing. A drag was a look around, and must not.
    if (wasTap && pointers.size === 0) stopRun()
    setCursorClass()
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
      announce('Erased.')
    }
    doomed = new Map()
  }

  gesture = null

  // Double tap, decided here so a drag can never be mistaken for a tap.
  if (wasTap) {
    const near =
      Math.abs(p.x - lastTapX) < DOUBLE_TAP_SLOP && Math.abs(p.y - lastTapY) < DOUBLE_TAP_SLOP
    if (near && e.timeStamp - lastTapAt < DOUBLE_TAP_MS) {
      lastTapAt = 0 // consume it, so a triple tap is not two fits in a row
      fitCamera()
      announce('Reframed the level.')
    } else {
      lastTapAt = e.timeStamp
      lastTapX = p.x
      lastTapY = p.y
    }
  } else {
    lastTapAt = 0
  }

  setCursorClass()
  sync()
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

/** The eraser's world radius at the current zoom — constant size on screen. */
const eraseRadius = (): number => ERASE_SCREEN_R / cam.zoom

function collectDoomed(x: number, y: number): void {
  if (gesture?.kind !== 'erase') return
  model.collectSegments(x, y, eraseRadius(), gesture.doomed)
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
    zoomAt(cam, e.clientX - r.left, e.clientY - r.top, window.innerWidth, window.innerHeight,
      e.deltaY < 0 ? 1.12 : 1 / 1.12)
  },
  { passive: false },
)

// ── keyboard ─────────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !spaceHeld) {
    spaceHeld = true
    setCursorClass()
    e.preventDefault()
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
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
    togglePlay()
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    stopRun()
    return
  }
  const k = e.key.toLowerCase()
  if (k === 'd') return setTool({ kind: 'draw' })
  if (k === 'e') return setTool({ kind: 'erase' })
  if (k === 'h') return setTool({ kind: 'pan' })
  if (k === 'f') return setTool({ kind: 'flag' })

  const n = Number(e.key)
  if (Number.isInteger(n) && n >= 1 && n <= 8) setBrush((n - 1) as BrushId)
})

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') {
    spaceHeld = false
    if (gesture?.kind === 'pan') gesture = null
    setCursorClass()
  }
})

// ── controls ─────────────────────────────────────────────────────────────────

function setCursorClass(): void {
  canvas.classList.remove('drawing', 'erasing', 'flagging', 'panning')
  if (gesture?.kind === 'pan' || (spaceHeld && mode === 'edit')) canvas.classList.add('panning')
  else if (mode === 'run') return
  else if (tool.kind === 'draw') canvas.classList.add('drawing')
  else if (tool.kind === 'erase') canvas.classList.add('erasing')
  else if (tool.kind === 'flag') canvas.classList.add('flagging')
}

/** Selecting the tool you are already in drops back to panning. */
function setTool(t: ToolId): void {
  ensureEditable()
  tool = tool.kind === t.kind && t.kind !== 'pan' ? { kind: 'pan' } : t
  setCursorClass()
  announce(tool.kind === 'pan' ? 'Drag to move the page.' : `${tool.kind} mode.`)
  sync()
}

function setBrush(b: BrushId): void {
  ensureEditable()
  model.brush = b
  // Picking a pen means you intend to use it.
  if (tool.kind !== 'draw') tool = { kind: 'draw' }
  setCursorClass()
  sync()
}

function togglePlay(): void {
  if (mode === 'run' && rig?.state === 'running') {
    playing = !playing
    sync()
    return
  }
  // Playing a blank page used to give three and a half seconds of a sled
  // falling through nothing before the off-track test ended it. The person most
  // likely to do that is someone who just cleared the page and pressed the
  // biggest button to see what it does, and a long silence is a bad answer.
  if (model.isEmpty) {
    toast('Draw a hill first')
    announce('Nothing to ride yet. Draw a line first.')
    return
  }
  startRun()
  sync()
}

const controls = buildControls(
  {
    tl: document.getElementById('corner-tl')!,
    bl: document.getElementById('corner-bl')!,
    br: document.getElementById('corner-br')!,
    sheet: document.getElementById('sheet')!,
  },
  {
    onTool: setTool,
    onBrush: setBrush,
    onAction: (a: Action) => {
      if (a === 'play') return togglePlay()
      if (a === 'reset') return stopRun()
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
  },
)

/**
 * Past this, some apps wrap or truncate a pasted URL.
 *
 * A 600-segment track — busy, but well inside what someone builds in twenty
 * minutes — encodes to about 5,500 characters. The failure is silent and total:
 * the recipient gets a broken link and the author never had a signal. The toast
 * used to report the raw character count, which is a number with no threshold
 * attached and so reads as trivia rather than a warning.
 */
const LONG_LINK = 2000

async function copyLink(): Promise<void> {
  const encoded = encodeLevel(currentLevel())
  const url = `${location.origin}${location.pathname}#l=${encoded}`
  writeHash(encoded)
  const long = encoded.length > LONG_LINK
  try {
    await navigator.clipboard.writeText(url)
    toast(long ? 'Link copied — it is long, some apps may cut it' : 'Link copied')
    if (long) announce('Link copied. It is a long link and some apps may cut it short.')
    return
  } catch {
    // Clipboard access can be refused, and on an opaque origin so can the
    // address bar. Say which actually happened.
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

/** Crash is announced, not signalled by the "!!" alone. */
function announce(msg: string): void {
  liveEl.textContent = msg
}

let lastAnnouncedState = ''
function sync(): void {
  // Anything that reaches sync may have changed the page, so the cached world
  // the stamps are drawn from is no longer trustworthy.
  editWorld = null

  controls.sync({
    tool,
    brush: model.brush,
    canUndo: model.canUndo,
    canRedo: model.canRedo,
    canClear: !model.isEmpty,
    playing: playing && rig?.state === 'running',
    running: mode === 'run',
  })

  const state = mode === 'edit' ? 'edit' : (rig?.state ?? 'edit')
  stateEl.dataset['state'] = state
  stateEl.textContent =
    mode === 'edit'
      ? tool.kind === 'pan' ? 'move' : tool.kind
      : state === 'running' ? (playing ? 'running' : 'paused') : state

  if (state !== lastAnnouncedState) {
    lastAnnouncedState = state
    if (state === 'crashed') announce('Crashed. Tap the page to keep drawing.')
    else if (state === 'gone') announce('Off the page. Tap the page to keep drawing.')
    else if (state === 'finished') announce('Finished! Tap the page to keep drawing.')
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
    if (!cameraTaken) follow(cam, seat.x, seat.y, speed(), reducedMotion, runBaseZoom)
    // Render-only, and driven by real frame time rather than ticks — it is
    // cloth, not physics, and nothing reads it back.
    const nose = rig.pts[NOSE]!
    stepScarf(scarf, seat.x, seat.y - 9, nose.x - nose.px, nose.y - nose.py, dt / TICK_MS)
  }

  drawScene({
    ctx,
    w: window.innerWidth,
    h: window.innerHeight,
    cam,
    strokes: model.strokes,
    // Stamps are part of the page, not part of playback, so they are drawn from
    // the level whether or not a run is happening.
    world: world ?? stampWorld(),
    rig,
    preview: mode === 'edit' ? model.previewStroke(cursor.x, cursor.y) : null,
    doomed,
    scarf: mode === 'run' ? scarf : null,
    // Only while the eraser is the live tool — including a right-drag, which
    // erases whatever mode is selected.
    eraser:
      mode === 'edit' && (tool.kind === 'erase' || gesture?.kind === 'erase')
        ? { x: cursor.x, y: cursor.y, r: eraseRadius() }
        : null,
    startX: model.startX,
    startY: model.startY,
    colour,
    reducedMotion,
    showEmptyHint: mode === 'edit' && model.isEmpty && gesture === null,
  })

  tickEl.textContent = String(rig ? rig.tick : 0)
  speedEl.textContent = `${speed().toFixed(2)} px/tick`
  hudEl.classList.toggle('live', mode === 'run')
  if (DEBUG) canvas.dataset['zoom'] = cam.zoom.toFixed(4)

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
seedParallax(SESSION_SEED)

// A level in the URL wins. Failing that, the example track — an empty page with
// no way to know what any of this does is a worse first five seconds than a
// hill you can immediately press play on and then draw over.
const incoming = readHash(location.hash)
if (incoming.kind === 'ok') {
  loadLevel(incoming.level, true)
} else if (incoming.kind === 'bad') {
  // Load something usable, but leave the broken hash in the address bar: it is
  // the only copy of whatever they were sent, and syncing over it would destroy
  // it. The next edit takes the bar over naturally.
  loadLevel(fixtureDescent(), true, false)
  toast("That link looks damaged — showing the example instead")
  announce('That share link could not be read. The example track is loaded instead.')
} else {
  loadLevel(fixtureDescent(), true)
  announce('Example track loaded. Draw over it, or clear the page.')
}
setCursorClass()

requestAnimationFrame(frame)
