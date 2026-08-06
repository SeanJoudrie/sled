# Sled — build spec

> Exhaustive on purpose. Where a formula, a constant, a hex, or a phase order is
> given, it is load-bearing — do not "improve" it.
>
> **Every constant here is post-phase-1.** An earlier draft of this document
> carried the values the simulation was *designed* with rather than the ones it
> was *tuned* to, and they differ by up to an order of magnitude. §9 records what
> changed and why. Where anything disagrees with an older copy, this file wins.

---

## 1 · Identity

| Field | Value |
| --- | --- |
| Product name | **Sled** |
| Tagline | *doodle a hill, watch him ride it* |
| Token prefix | `sled` (`--sled-*`) |
| On-screen claim | **"Draw a line. He rides it."** |
| Footer claim | **"Fixed-step Verlet, bit-identical on every device · no physics library"** |

**Non-goals, explicitly:** no player control during a run, no accounts, no
server, no database, no public submission queue, no sound in v1.

---

## 2 · Units and the determinism law

- 1 world unit = 1 CSS pixel at zoom 1.
- The simulation advances in **ticks**. 60 ticks per simulated second.
- Every constant is **per tick** or **per tick²**. There is no `dt` term
  anywhere in the integrator — it is folded into the constants.
- Rendering is decoupled: accumulate elapsed time, run whole ticks while the
  accumulator exceeds one tick, cap at `MAX_TICKS_PER_FRAME` so a stalled tab
  cannot spiral.

The seven rules of the determinism law, and how CI enforces them, are in the
README. The one worth repeating here: **IEEE-754 requires correct rounding for
`+ - * /` and `sqrt`, and requires nothing whatsoever of the transcendentals.**
Every rotation in this document is therefore built from normalised direction
vectors and complex multiplication.

---

## 3 · Art direction

### 3.1 The page

Ruled notebook paper, aged very slightly. Three layers, back to front:

1. **Paper ground**, filled flat.
2. **Grain and creases**, generated once at load into an offscreen 256×256
   canvas of value noise, tiled, at **3% maximum contrast**, plus two or three
   soft diagonal crease bands at 2%. Never animated, never regenerated. If you
   can see it as texture rather than feel it as paper, it is too strong.
3. **Rules**, horizontal every 28 px, plus one vertical margin rule at x = 96.
   Both live in **world space** and pan with the paper, so the level sits *on*
   the page rather than in front of it.

### 3.2 The pencil case — the entire palette

| Token | Hex | Instrument | Means |
| --- | --- | --- | --- |
| `--sled-paper` | `#F6F2E8` | — | the page |
| `--sled-grain` | `#B9AE94` | — | texture and creases, ≤3% alpha |
| `--sled-rule` | `#C7D2E0` | printed | ruled lines |
| `--sled-margin-rule` | `#E0A79E` | printed | the vertical margin |
| `--sled-ink` | `#1E2430` | blue-black ballpoint | **solid line**, rider, UI |
| `--sled-pencil` | `#A9A395` | pencil | **scenery**, parallax trees |
| `--sled-red` | `#C4362E` | red pen | **kill** |
| `--sled-blue` | `#2F62B8` | blue pen | **water** |
| `--sled-yellow` | `#F2C744` | highlighter | **boost** |
| `--sled-cyan` | `#7FD4E8` | highlighter | **ice** |
| `--sled-brown` | `#8A6A3F` | highlighter | **tar** |
| `--sled-green` | `#6FBF73` | highlighter | **portal A** |
| `--sled-pink` | `#E87FA8` | highlighter | **portal B** |

Nothing else. If a new mechanic needs a colour, it does not ship until a pen is
freed up. Purple is reserved for note lines (§10).

### 3.3 Ink vs highlighter

Two stroke functions; every brush declares which it uses.

**Ink** — `lineWidth 2.4`, `lineCap round`, full alpha, `source-over`. Hand-drawn
wobble: on commit, subdivide into ~12 px pieces and offset each interior vertex
perpendicular by `±0.45 px` from the level-seeded PRNG. The wobble is baked at
commit time and stored **only in the render cache, never in level data** — the
physics always uses the straight segment, so wobble cannot affect a run.

**Highlighter** — `lineWidth 11`, `lineCap square`, `globalAlpha 0.5`,
`globalCompositeOperation 'multiply'`. Drawn twice with a 0.8 px offset between
passes, for the doubled-edge density a real marker leaves. No wobble — a
highlighter is dragged, not sketched.

Ordering, back to front: paper → rules → parallax → highlighter → ink → stamps →
rider. Highlighter always sits *under* ink, so an ink line crossing a boost
reads correctly.

### 3.4 Parallax

Three bands of scribbled conifers in pencil grey, at 0.30 / 0.16 / 0.08 alpha,
translating at **0.25 / 0.45 / 0.70** of camera x. Positions come from the
level-seeded PRNG, so they are identical for everyone opening the same link and
cost nothing to store.

They exist for one reason: velocity is unreadable against a blank page. Without
them a fast run and a slow run look the same.

Trees are decoration. Nothing about them may ever feed back into physics.

---

## 4 · The rig

Five points. Positions at rest, rider facing +x, origin at the sled nose, y down.

| Point | Rest | Role |
| --- | --- | --- |
| `nose` | `(0, 0)` | **RIDE** — collides |
| `tail` | `(-20, 0)` | **RIDE** — collides |
| `seat` | `(-10, -11)` | structural only |
| `head` | `(-10, -27)` | **CRASH** — contact ends the run |
| `hand` | `(2, -18)` | decorative only |

Only `head` crashes in v1. "He crashes when his head hits the ground" is
intuitive, readable, and the most forgiving thing to tune.

### 4.1 Constraints

Solved in this exact order, **6 iterations per tick**.

| A | B | Rest | Stiffness |
| --- | --- | --- | --- |
| `nose` | `tail` | 20.000 | 1.00 |
| `nose` | `seat` | 14.866 | 1.00 |
| `tail` | `seat` | 14.866 | 1.00 |
| `seat` | `head` | 16.000 | 0.92 |
| `nose` | `head` | 28.792 | **0.60** |
| `seat` | `hand` | 13.892 | 0.50 |

The first three form a rigid triangle — that is the sled. `nose–head` is soft, so
he leans in a dip and rights himself after. `seat–hand` is floppy on purpose.

Standard symmetric relaxation, both points moved equally (mass is uniform).

### 4.2 The posture rule

`applyPosture` is **not** a distance constraint and cannot be one. See §9.3.

It works in the sled's own frame: forward `u` = normalised `nose − tail`, up
`n` = `(u.y, −u.x)`. It corrects only the component of `head − seat` along `n`,
pulling it toward `POSTURE_REST_UP` at `POSTURE_K`. The along-sled component is
left completely free, which is what preserves leaning.

### 4.3 Spawn

The start flag keeps the position the player put it at, but takes its
**orientation** from the nearest solid line within `SPAWN_SNAP_R`. See §9.4.

---

## 5 · Integration

Position Verlet. Velocity is implicit in `(x − px)`.

```
vx = (p.x - p.px) * AIR
vy = (p.y - p.py) * AIR
if (submerged) { vx *= 1 - WATER_DRAG; vy *= 1 - WATER_DRAG }
p.px = p.x
p.py = p.y
p.x += vx + fx
p.y += vy + fy + GRAVITY - (submerged ? BUOYANCY : 0)
```

Tick order, which is part of the definition of the simulation — reordering these
changes every existing level string:

1. integrate (stamp forces, water)
2. portals
3. constraints ×6
4. posture
5. contact
6. crash / off-track

### 5.1 Constants

| | Value | |
| --- | --- | --- |
| `GRAVITY` | `0.12` | px/tick², ≈200 px of fall in the first second |
| `AIR` | `0.999` | per-tick velocity retention |
| `ITERATIONS` | `6` | constraint passes per tick |
| `MAX_TICKS_PER_FRAME` | `5` | stall guard |
| `EPS_LEN` | `1e-9` | degenerate-length guard |
| `CONTACT_R` | **`2.0`** | contact band, px — see §9.6 |
| `HEAD_CRASH_R` | **`2.0`** | gameplay tolerance, held *separately* |
| `BUOYANCY` | **`0.06`** | half gravity: he sinks, does not bob |
| `WATER_DRAG` | **`0.012`** | ≈50% of speed lost per second under |
| `POSTURE_K` | `0.12` | soft pull toward upright |
| `POSTURE_REST_UP` | `16.0` | head offset along the sled's up, at rest |
| `PORTAL_COOLDOWN` | `3` | ticks; stops a facing pair trapping the rig |
| `WELL_MIN_R` | `24` | well singularity guard |
| `WELL_CUTOFF_R` | `400` | wells stop pulling past this |
| `WIND_R` | `60` | arrow-wind capsule radius |
| `VORTEX_MIN_R` | `16` | vortex singularity guard |
| `OFF_TRACK_MARGIN` | `2000` | leaving the level by this much ends the run |
| `SPAWN_SNAP_R` | `400` | how far to look for a line to sit on |

---

## 6 · Collision

Point versus line segment, for RIDE points only, against collidable brushes
only, **in level-array order**.

Contact is **swept first, proximity second** — both are needed, for different
reasons, and §9.1 and §9.6 are the two bugs that prove it.

On contact: push out along the normal, then decompose velocity, zero the normal
component, damp the tangential by `friction` and add `boost`. Velocity is read
*after* the positional push, so the push is absorbed rather than injected as
free speed.

**Restitution is zero for every brush.** A bouncing sled feels wrong and makes
tracks unpredictable to author.

**Crash test**, after collisions: the head within `HEAD_CRASH_R` of any
collidable segment, or any point within `CONTACT_R` of a kill segment, ends the
run. The head's test is swept for the same reason contact is.

---

## 7 · The seven brushes

| # | Brush | Colour | Class | Collides | friction | boost |
| --- | --- | --- | --- | :-: | --- | --- |
| 0 | **Ink** | ink | ink | ✓ | `0.004` | — |
| 1 | **Ice** | cyan | highlighter | ✓ | `0.0` | — |
| 2 | **Tar** | brown | highlighter | ✓ | `0.038` | — |
| 3 | **Boost** | yellow | highlighter | ✓ | `0.003` | `+0.08` |
| 4 | **Kill** | red | ink | ✓ | `0.004` | — |
| 5 | **Water** | blue | ink | ✗ | surface line, half-plane below | |
| 6 | **Scenery** | pencil | ink | ✗ | drawing only | |

Friction is **per tick of contact**, and a resting sled touches 60×/second — so
these are derived from per-second targets (ink keeps ~80%, tar ~10%), not picked
directly. See §9.2.

**Boost direction** is the segment as drawn, A→B. Drawing a boost line
right-to-left boosts backwards. This is a feature and the toolbar must say so.

**Water** does not collide. It defines a half-plane: a point is submerged when
its x lies within the segment's span and its y is below the surface at that x.
If two water lines overlap in x, the **first in level order wins** — never sum
them.

---

## 8 · The three stamps

### 8.1 Portal pair

Two segments drawn as a linked pair, green and pink. When a RIDE point crosses
one, the **whole rig** transports to the other, rotated by the angle between
them, with velocity rotated to match.

The rotation is `q = uB · conj(uA)`, built from normalised directions:

```
qc = ubx*uax + uby*uay
qs = uby*uax - ubx*uay
```

Then, for **every** point in the rig — never just the crossing point:

```
rx = p.x - A.ax;  ry = p.y - A.ay
p.x = B.ax + (rx*qc - ry*qs)
p.y = B.ay + (rx*qs + ry*qc)
// the identical transform on the previous position is what carries momentum
rpx = p.px - A.ax;  rpy = p.py - A.ay
p.px = B.ax + (rpx*qc - rpy*qs)
p.py = B.ay + (rpx*qs + rpy*qc)
```

Do not recompute velocity by any other route. Portals are **bidirectional**;
crossing B transports to A with the inverse rotation `(qc, −qs)`. After a
transit, `portalCooldown = 3` ticks, or a facing pair traps the rig.

### 8.2 Gravity well

Inverse square, `strength / max(r, 24)²`, cutoff 400 px. At r = 100 with the
default strength of 1200 the pull equals gravity exactly; at r = 50 it is four
times gravity. Toolbar sizes `600` / `1200` / `2400`.

Applied to **every** point in the rig, including non-colliding ones, or the rig
tears against its own constraints.

### 8.3 Wind

**Arrow** — uniform push along the segment, inside a capsule of radius 60.
**Vortex** — tangential, linear falloff to zero at the rim; centre is the
segment's start, radius its length.

Both are static fields. Nothing here simulates a fluid — that would be
non-deterministic and it is not what the mechanic needs.

---

## 9 · What phase 1 cost

Every one of these survived a green determinism gate. Do not reintroduce them.

1. **Collision tunnelled.** A point dropped 70 px arrives at 4.1 px/tick against
   a thin contact band — above the line one tick, below it the next, never
   *within* it. Contact is now **swept**: the tick's motion is tested as a
   segment crossing, with proximity kept for a resting sled. The head's crash
   test needs the same, or he sails through the ground head-first.
2. **Friction was an order of magnitude too strong.** Tar at `0.30` left
   0.0000001 of the speed after one second — it read as hitting a wall, not as
   bogging down. The whole table was re-derived from per-second targets.
3. **The rider rode upside down.** A point held by two distance constraints in
   2D has **two solutions**, mirrored across the line through its anchors, and
   both satisfy the constraints exactly. Nothing stopped the head popping to the
   underside on the first landing. Distance constraints cannot express which
   side he sits on; `applyPosture` does, in the sled's own frame.
4. **He nose-planted on every spawn.** Dropped in flat onto a slope, the
   downhill runner touches first, stops dead against zero restitution, and the
   tail rotates over it. The start flag now adopts the **tangent of the line
   beneath it** — which is also what a player means by putting the flag there.
5. **The head collapsed without `nose–head`.** Held only by `seat–head` it is
   free anywhere on a 16 px circle about the seat, and its momentum carries it
   through the sled into the ground. Posture and distance are complementary: the
   distance stops it sinking, the posture stops it mirroring.
6. **Points could sink through a line and stay there.** The swept test catches
   motion; the constraint solve and the posture rule reposition points with *no
   motion to sweep*, and anything nudged past the contact band is invisible to
   both tests. `CONTACT_R` is 2.0 — thicker than any one-tick correction.
7. **`Math.sin`/`cos`/`atan2` are not bit-identical across JS engines.** A
   portal built with `atan2` works in Chrome and silently breaks in Safari. CI
   greps for this, and the fixtures trap it at runtime as well.
8. **A portal pair downstream on the same track is inescapable.** Portals are
   bidirectional: he rides into B going forward, is thrown back to A, and
   ping-pongs until he tumbles. Correct behaviour — but people will draw it, so
   it needs a one-way flag or an editor warning. **The flag has to exist in the
   level format before any level strings are shared, or it cannot be added.**
9. **A closed portal loop is a perpetual motion machine.** It descends, the
   teleport returns the height for free, and speed climbs every lap (measured
   6.3 → 8.2 → 10.0 px/tick) until he tumbles.

Two more, found while standing the project up on its own:

10. **A fixture can stop covering a mechanic and take the gate with it.** The
    first vortex bug was invisible because no fixture contained a vortex, so the
    runtime trap never reached that branch and only the static grep guarded it.
    Checks 9 and 10 assert coverage for exactly this reason.
11. **A static gate that strips string literals cannot read import paths.** The
    import check passed unconditionally for its first few runs because it shared
    a comment-stripper with the transcendental grep, which blanks string bodies.
    Both gates are now mutation-tested, and so should any gate added later be —
    a gate nobody has ever seen fail is not known to work.

---

## 10 · Level format

```ts
type Level = {
  v: 1
  r: [body, face, hat, beard]                      // rider parts
  s: [x, y]                                        // start flag
  l: Array<[brush, x1, y1, x2, y2]>                // lines
  p: Array<[ax, ay, bx, by, cx, cy, dx, dy]>       // portal pairs
  g: Array<[x, y, strength]>                       // wells
  w: Array<[x1, y1, x2, y2, strength, kind]>       // wind
}
```

All coordinates are integers in **half-pixel units** (world × 2). 0.5 is exact
in binary floating point, so a round-trip cannot drift. Nothing float-valued is
ever serialised.

Encoding: sort nothing (array order is load-bearing) → delta-encode consecutive
coordinates, one running cursor per axis → zig-zag varint → base64url, no
padding, with the format version as a raw leading byte.

**Wind strengths ride the wire as integer thousandths** — a float zig-zags to
zero.

A 200-segment track lands around 500 bytes. Share is `#l=<string>` and requires
no backend of any kind.

The level hash is FNV-1a over the encoded string, feeding `mulberry32`. It
drives **only** parallax placement and ink wobble, it lives outside `sim/`, and
CI proves the simulation cannot even import it.

---

## 11 · Phase order

1. ✅ **Sim core**, no art, no editor. One hardcoded track, placeholder rig as
   bare line segments. Tune until a hill, a jump and a landing all feel right.
2. ✅ **Determinism gate green**, including the static gates — before there is
   anything to retrofit.
3. ⬜ Paper, rules, ink/highlighter rendering, parallax.
4. ⬜ Editor: draw, undo, erase, pan, zoom, play, reset. Ink only.
5. ⬜ The remaining six brushes.
6. ⬜ Rider system + click-to-cycle, on placeholder parts.
7. ⬜ The three stamps in the editor. Portals last — the only subtle maths.
8. ⬜ Share link wired to the URL.
9. ⬜ Hand-drawn parts replace the placeholders. Content only, zero code.

**Open, awaiting a verdict on feel** — nobody has judged the ride yet:

- Does he **carry speed like a sled**, or is he floaty / draggy?
- Is `HEAD_CRASH_R = 2.0` too unforgiving on landings?
- Is the **ice vs tar** contrast dramatic enough to justify two brushes?
- Any **stutter or height pop** at a portal transit is a bug, not tuning.

---

## 12 · Deliberately out of scope

Do not build these. They are noted so nothing forecloses them.

| Later | Note |
| --- | --- |
| **Note lines** (marble sequencer) | Purple is reserved. Determinism makes the song reproducible, so this gets *better* later. |
| **Rope / cloth** | Same Verlet integrator; nearly free once §4–5 exist. |
| **Oscillating platform** | Must use a **triangle wave**, never `sin`. |
| **Second rider** | Rig array becomes rig-of-arrays; collision order rules still apply. |
| **Falling sand** | A full cellular automaton, and the easiest thing here to make subtly non-deterministic. v3 at the earliest. |
| **Curated levels** | Five hardcoded share strings, autoplaying — the level *is* the replay, so this costs almost nothing. |
| **Public submissions** | Creates a moderation surface. Curated links have none. Do not open this without a plan for it. |
