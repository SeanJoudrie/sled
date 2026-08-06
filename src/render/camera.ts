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
const RUN_ZOOM_NEAR = 1.0
const RUN_ZOOM_FAR = 0.7
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
 * Critically damped follow on a target, plus a speed-linked zoom-out so fast
 * sections stay readable.
 */
export function follow(
  cam: Camera,
  targetX: number,
  targetY: number,
  speed: number,
  reducedMotion: boolean,
): void {
  cam.vx = (cam.vx + (targetX - cam.x) * FOLLOW_K) * FOLLOW_DAMP
  cam.vy = (cam.vy + (targetY - cam.y) * FOLLOW_K) * FOLLOW_DAMP
  cam.x += cam.vx
  cam.y += cam.vy

  if (reducedMotion) return
  const t = Math.min(speed / RUN_ZOOM_AT_SPEED, 1)
  const want = RUN_ZOOM_NEAR + (RUN_ZOOM_FAR - RUN_ZOOM_NEAR) * t
  cam.zoom += (want - cam.zoom) * 0.05
}

/** Drop follow velocity, so resuming an edit does not inherit a run's drift. */
export function settle(cam: Camera): void {
  cam.vx = 0
  cam.vy = 0
}
