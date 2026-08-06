/**
 * Every tunable in the simulation, in one place.
 *
 * UNITS: per tick, or per tick squared. Never per second. There is no `dt`
 * term anywhere in the integrator — it is folded into these numbers. One tick
 * is one fixed step; 60 ticks make a simulated second.
 *
 * Several of these read as surprisingly small. That is because they are applied
 * 60 times a second: a resting sled touches the ground every single tick, so a
 * friction of 0.038 compounds to keeping roughly a tenth of its speed after one
 * second. See FRICTION in types.ts for the per-second targets they came from.
 */

/** px/tick². About 200 px of fall in the first second. Tune here, nowhere else. */
export const GRAVITY = 0.12

/** Per-tick velocity retention in open air. */
export const AIR = 0.999

/** Constraint relaxation passes per tick. */
export const ITERATIONS = 6

/** Stall guard: a backgrounded tab must not be able to spiral. */
export const MAX_TICKS_PER_FRAME = 5

/** Degenerate-length guard. Never branch on float equality; compare to this. */
export const EPS_LEN = 1e-9

/**
 * Point contact band, px.
 *
 * Deliberately fat. Collision is swept, so this is not what stops tunnelling —
 * but the constraint solve and the posture rule reposition points with no
 * motion to sweep, and anything they nudge past a thin band would be invisible
 * to both the swept test and the proximity test, and would sink through the
 * line and stay there. 2.0 is thicker than any single-tick correction.
 */
export const CONTACT_R = 2.0

/**
 * How close the head may come to a solid line before the run ends.
 *
 * Held separately from CONTACT_R even though the two are currently equal:
 * one is a physical band, the other is a gameplay tolerance, and they want to
 * be tuned against different questions.
 */
export const HEAD_CRASH_R = 2.0

/** Upward acceleration while submerged. Half of gravity: he sinks, he does not bob. */
export const BUOYANCY = 0.06

/** Per-tick velocity loss while submerged. Roughly half of speed per second. */
export const WATER_DRAG = 0.012

/** Strength of the soft pull that keeps the rider on the correct side of the sled. */
export const POSTURE_K = 0.12

/** Head offset along the sled's own "up", at rest. Equals the seat–head rest length. */
export const POSTURE_REST_UP = 16.0

/** Ticks of portal immunity after a transit. Stops a facing pair trapping the rig. */
export const PORTAL_COOLDOWN = 3

/** Gravity well singularity guard, px. */
export const WELL_MIN_R = 24
/** Gravity wells stop pulling past this radius, px. */
export const WELL_CUTOFF_R = 400
export const WELL_CUTOFF_R2 = WELL_CUTOFF_R * WELL_CUTOFF_R

/** Capsule radius around an arrow-wind segment, px. */
export const WIND_R = 60
/** Vortex singularity guard, px. */
export const VORTEX_MIN_R = 16

/** How far outside the level bounding box counts as "gone", px. */
export const OFF_TRACK_MARGIN = 2000

/**
 * How far from the start flag to look for a line to sit the sled on, px.
 * Beyond this he simply spawns level and falls.
 */
export const SPAWN_SNAP_R = 400
export const SPAWN_SNAP_R2 = SPAWN_SNAP_R * SPAWN_SNAP_R

/** Clearance between the sled runners and the line they spawn on, px. */
export const SPAWN_LIFT = CONTACT_R

/**
 * How far along the tangent to place the sled, measured from the flag, px.
 *
 * Equal to the nose–tail rest length, which puts the **tail** on the flag and
 * the whole sled ahead of it. Spawning the sled centred on the flag — or worse,
 * behind it — means a flag dropped at the top of a hill leaves the tail hanging
 * off the end of the line with nothing under it, and the rig pivots about the
 * nose and drives the head into the ground before it has moved a pixel.
 *
 * The top of the hill is exactly where a person puts the flag.
 */
export const SPAWN_AHEAD = 28.0
