/**
 * The simulation's entire public surface.
 *
 * `sim/` imports nothing from outside itself. That is not tidiness — it is what
 * lets the determinism gate run the physics in bare Node with no browser, no
 * bundler and no renderer anywhere near it, and it is asserted by CI.
 */

export {
  AIR,
  BUOYANCY,
  CONTACT_R,
  EPS_LEN,
  GRAVITY,
  HEAD_CRASH_R,
  ITERATIONS,
  MAX_TICKS_PER_FRAME,
  PORTAL_COOLDOWN,
  POSTURE_K,
  WATER_DRAG,
} from './consts.ts'

export { BRUSH, BRUSHES, BRUSH_COUNT, WIND } from './types.ts'
export type {
  Bounds,
  BrushDef,
  BrushId,
  Level,
  Point,
  Portal,
  Rig,
  RunState,
  Segment,
  StrokeClass,
  Well,
  Wind,
  WindKind,
  World,
} from './types.ts'

export {
  CONSTRAINTS,
  HAND,
  HEAD,
  NOSE,
  POINT_COUNT,
  POINT_NAMES,
  RIDE_POINTS,
  SEAT,
  TAIL,
  spawn,
} from './rig.ts'

export { asBrushId, buildWorld, emptyLevel } from './world.ts'
export { step, stepN } from './step.ts'
