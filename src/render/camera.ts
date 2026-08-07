/**
 * The camera.
 *
 * Everything here is *render* state. It is never read by the simulation and
 * never fed back into it — a camera that could influence a run would make the
 * level string stop being a complete replay.
 */

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
/** Quantised so a level looks identical when reopened, rather than almost. */
export const ZOOM_STEP = 1 / 16

const FOLLOW_K = 0.1
const FOLLOW_DAMP = 0.72
/**
 * How far the camera pulls back at full speed, as a fraction of the zoom the
 * run *started* at.
 *
 * Relative, not absolute. It used to ease toward a fixed 1.0, which meant
 * pressing play on a phone framed at the 0.5 fit-zoom roughly doubled the view
 * in the first second — unasked, every run. Anchoring to the starting zoom
 * makes the pull-back a modulation of what you were already looking at.
 *
 * 0.85 rather than 0.7: the scenery and the scarf already carry speed, and a
 * third simultaneous speed signal that also moves the camera is one too many.
 */
const RUN_ZOOM_FAR_FACTOR = 0.85
const RUN_ZOOM_AT_SPEED = 12

export type Camera = {
  x: number
  y: number
  zoom: number
  vx: number
  vy: number
}

export function makeCamera(x = 0, y = 0): Camera {
  return { x, y, zoom: 1, vx: 0, vy: 0 }
}

export function quantiseZoom(z: number): number {
  const clamped = z < ZOOM_MIN ? ZOOM_MIN : z > ZOOM_MAX ? ZOOM_MAX : z
  return Math.round(clamped / ZOOM_STEP) * ZOOM_STEP
}

/** Zoom about a screen point, so the world under the cursor stays under it. */
export function zoomAt(
  cam: Camera,
  screenX: number,
  screenY: number,
  w: number,
  h: number,
  factor: number,
): void {
  const before = screenToWorld(cam, screenX, screenY, w, h)
  cam.zoom = quantiseZoom(cam.zoom * factor)
  const after = screenToWorld(cam, screenX, screenY, w, h)
  cam.x += before.x - after.x
  cam.y += before.y - after.y
}

export function screenToWorld(
  cam: Camera,
  sx: number,
  sy: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return {
    x: (sx - w / 2) / cam.zoom + cam.x,
    y: (sy - h / 2) / cam.zoom + cam.y,
  }
}

/** The world rect the camera can currently see, for clipping the ruled lines. */
export function visibleRect(
  cam: Camera,
  w: number,
  h: number,
): { left: number; top: number; right: number; bottom: number } {
  const halfW = w / 2 / cam.zoom
  const halfH = h / 2 / cam.zoom
  return {
    left: cam.x - halfW,
    top: cam.y - halfH,
    right: cam.x + halfW,
    bottom: cam.y + halfH,
  }
}

/**
 * Critically damped follow on a target, plus a speed-linked pull-back so fast
 * sections stay readable.
 *
 * `baseZoom` is the zoom the run started at. The caller stops calling this the
 * moment the player touches the camera — a follow that keeps hauling the view
 * back to the sled while someone is trying to look at their own track is worse
 * than no follow at all.
 */
export function follow(
  cam: Camera,
  targetX: number,
  targetY: number,
  speed: number,
  reducedMotion: boolean,
  baseZoom: number,
): void {
  cam.vx = (cam.vx + (targetX - cam.x) * FOLLOW_K) * FOLLOW_DAMP
  cam.vy = (cam.vy + (targetY - cam.y) * FOLLOW_K) * FOLLOW_DAMP
  cam.x += cam.vx
  cam.y += cam.vy

  if (reducedMotion) return
  const t = Math.min(speed / RUN_ZOOM_AT_SPEED, 1)
  const want = baseZoom * (1 + (RUN_ZOOM_FAR_FACTOR - 1) * t)
  cam.zoom += (want - cam.zoom) * 0.05
}

/**
 * Below this, "fitting" stops being useful.
 *
 * A 2200 px track on a 390 px phone works out at zoom 0.125, which makes the
 * sled three pixels tall and squeezes the 28 px ruling into corduroy. Seeing the
 * whole level is worth less than being able to see anything in it.
 */
export const MIN_FIT_ZOOM = 0.5

/**
 * What zoom frames this much content in this much viewport, and whether it
 * fits at all.
 *
 * Pure, and exported, so the determinism gate can assert that the track a first
 * visitor lands on actually fits on a phone. That check is only worth anything
 * if it uses the same arithmetic the app does — a copy in the test would drift
 * from this one and start passing on a framing nobody ships.
 *
 * `whole: false` means the caller should frame the *start* instead: there is no
 * zoom at which the content both fits and stays legible.
 */
export function fitZoom(
  viewW: number,
  viewH: number,
  contentW: number,
  contentH: number,
): { zoom: number; whole: boolean } {
  // The corner clusters overlay the canvas, so the usable area is smaller than
  // the viewport. Proportional, or a phone loses half its width to padding.
  const padX = Math.min(80, viewW * 0.12)
  const padY = Math.min(96, viewH * 0.14)
  const availW = Math.max(140, viewW - padX * 2)
  const availH = Math.max(140, viewH - padY * 2)
  const fit = Math.min(availW / Math.max(contentW, 1), availH / Math.max(contentH, 1))
  return fit >= MIN_FIT_ZOOM
    ? { zoom: quantiseZoom(Math.min(fit, 1)), whole: true }
    : { zoom: MIN_FIT_ZOOM, whole: false }
}

/** Drop follow velocity, so resuming an edit does not inherit a run's drift. */
export function settle(cam: Camera): void {
  cam.vx = 0
  cam.vy = 0
}
