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
2. **Grain and crinkle**, generated once at load into an offscreen 256×256
   canvas, tiled, at **3% maximum contrast** for both together. Never animated,
   never regenerated. Screen space — it is the sheet everything is printed on,
   and sliding it under the camera turns a still texture into visible crawl.
3. **Folds**, in **world space**, so they belong to the page and pan with it. A
   fold is a pair — a soft shadow at 4.5% and a thin catch of light on one side
   — because that is what a crease does to a flat surface. Horizontals every
   1120 world px, verticals every 1680, roughly a sheet folded in thirds.
   An earlier version put two diagonal bands in *screen* space, which made them
   the one element on the page that visibly did not belong to it.

   These ran at 2.5% and 1.8% and were, in practice, invisible — not findable in
   a screenshot at any zoom while actively looking for them. Something you cannot
   locate when you are hunting for it is not subtle, it is absent, and it was
   costing a per-frame pass to be absent. If you can see them as texture rather
   than feel them as paper they are too strong; if you cannot find them at all
   they are not there.
4. **Rules**, horizontal every 28 px, plus a vertical margin rule **every
   1680 px**, landing with the vertical folds so a long track reads as running
   across consecutive sheets. Both live in **world space** and pan with the
   paper, so the level sits *on* the page rather than in front of it.

   The margin rule used to exist at exactly one world x. Pan a couple of screens
   right — which a descent does constantly — and the most recognisable feature of
   ruled paper was gone for good, leaving generic lined paper forever.

   Rules fade out as their on-screen spacing drops below ~17 px: zoomed out far
   enough, 28 px rules land a few pixels apart and the page stops reading as
   ruled paper and starts reading as corduroy.

### 3.2 The pencil case — the entire palette

| Token | Hex | Instrument | Means |
| --- | --- | --- | --- |
| `--sled-paper` | `#F6F2E8` | — | the page |
| `--sled-grain` | `#B9AE94` | — | texture and creases, ≤3% alpha |
| `--sled-rule` | `#C7D2E0` | printed | ruled lines |
| `--sled-margin-rule` | `#E0A79E` | printed | the vertical margin |
| `--sled-ink` | `#1E2430` | blue-black ballpoint | **solid line**, rider, UI |
| `--sled-pencil` | `#A9A395` | pencil | **scenery**, parallax trees |
| `--sled-red` | `#C4362E` | red pen | **spikes**, the scarf |
| `--sled-blue` | `#2F62B8` | blue pen | **water** |
| `--sled-yellow` | `#F2C744` | highlighter | **boost** |
| `--sled-cyan` | `#7FD4E8` | highlighter | **ice** |
| `--sled-brown` | `#8A6A3F` | highlighter | **tar** |
| `--sled-green` | `#6FBF73` | highlighter | **finish**, portal A |
| `--sled-pink` | `#E87FA8` | highlighter | **portal B** |

Nothing else. If a new mechanic needs a colour, it does not ship until a pen is
freed up. Purple is reserved for note lines (§10).

### 3.3 Ink vs highlighter

Two stroke functions; every brush declares which it uses.

**Ink** — `lineWidth 2.4`, `lineCap round`, full alpha, `source-over`. Hand-drawn
wobble: subdivide into ~12 px pieces and offset each interior vertex
perpendicular by `±0.45 px`. Stored **only in the render cache, never in level
data** — the physics always uses the straight segment, so wobble cannot affect a
run.

The wobble PRNG is seeded **per segment**, from that segment's own two endpoints.
Not from the level hash, which changes on every stroke and would re-roll every
line already on the page each time you drew another. And not from the whole
stroke, because the eraser splits strokes: a whole-stroke seed changes the moment
a stroke loses a segment, so trimming the end of a long line made the rest of it
visibly redraw itself. A segment's wobble is now a pure function of the two
points the level actually stores, which is the right unit regardless. Nothing is
lost by not sharing a stream between segments — every endpoint is pinned to zero
offset, so they meet exactly whatever the seeds do.

**Every draw function takes `alpha` as a multiplier, never as a value.** Canvas
`globalAlpha` *replaces*, so a function that assigns it silently cancels whatever
the caller asked for. Setting it on the context before calling `drawStrokes` did
nothing at all, which is why the eraser's ghost preview had never once been
translucent.

**Highlighter** — `lineWidth 11`, `lineCap square`, `globalAlpha 0.5`,
`globalCompositeOperation 'multiply'`. Drawn twice with a 0.8 px offset between
passes, for the doubled-edge density a real marker leaves. No wobble — a
highlighter is dragged, not sketched.

Ordering, back to front: paper and grain → creases → rules → parallax → water
body → finish tape and highlighter → spikes and ink → stamps → flag → rider and
scarf → eraser ring. Highlighter always sits *under* ink, so an ink line crossing
a boost reads correctly.

### 3.4 The crinkle

The grain tile is value noise on a 64×64 lattice, smoothed. The crinkle is the
*same* lattice run through a ridge function — `1 - |2v - 1|`, cubed — and added
on top. The ridge turns smooth blobs into creased facets, which is what makes the
page read as a sheet that has been folded and flattened rather than as clean
stock. Fibre contributes 1.8% alpha and crinkle 2.2%, so the pair stays inside
the 3% ceiling §3.1 sets.

Sharing one lattice is not laziness: an independent second noise field would put
crinkle highlights in places the fibre says are flat, and the sheet would stop
reading as one surface.

The crinkle is **tone only**. Rules and creases are drawn afterwards, straight,
at a hairline. A crinkle that bent them would stop reading as paper and start
reading as a warp filter.

### 3.5 Parallax and the doodles

Three bands in pencil grey at 0.38 / 0.25 / 0.15 alpha, translating at
**0.25 / 0.45 / 0.70** of camera x and **0.14 / 0.24 / 0.40** of camera y.

They exist for one reason: velocity is unreadable against a blank page. Without
them a fast run and a slow run look the same.

What is *in* them is the margin of a notebook. Ground props stand on the band's
ground line — two kinds of tree, houses, blocky buildings, and a four-line Eiffel
Tower. Sky props float above it — five-pointed stars, a shooting star with speed
lines, a Saturn-ringed planet, comets, and that S everyone drew and nobody can
name.

**They are deliberately bad.** A handful of straight-ish strokes each, no
shading, no perspective. If one of them starts looking accomplished it is wrong —
the point is that a kid drew it in the margin, not that someone illustrated it.

Placement comes from a **session seed**, rolled once per page load rather than
from the level hash, so the scenery you sled past differs every time you open the
toy. This is the one piece of decoration that is deliberately *not* reproducible
from the level string: two people opening the same link see the same track and
different doodles, which is correct, because the doodles are the page and the
track is the level.

Scenery is decoration. Nothing about it may ever feed back into physics, and the
seed lives outside `sim/` where CI can prove the simulation cannot reach it.

### 3.6 The eraser

The eraser takes the **segments** it touches and splits the stroke, leaving every
maximal run of untouched segments as a stroke in its own right. A stroke whose
every segment is touched disappears, so scrubbing a whole line still removes it.

It used to delete whole strokes. The unit a person thinks they *drew* and the
unit they want to *fix* are different things: you draw one long confident hill —
which is exactly what the empty-page hint tells you to do — the landing is
slightly wrong, and the only options were to delete the entire hill or live with
it. The workaround was to draw in short stubs, which makes worse-looking tracks:
the tool was teaching a bad habit to protect its data model.

The radius is **15 screen pixels**, divided by zoom to get world units, so it is
the same size under your finger at every zoom. One undo snapshot per drag, not
per stroke and not per segment — the unit of undo is the gesture.

What is about to go is ghosted at 22%, split at exactly the same segment
boundaries the erase will use. Ghosting the whole stroke would promise to remove
a line the eraser is only going to trim.

### 3.7 The camera during a run

The camera follows the sled, critically damped, and eases toward **0.85× the
zoom the run started at** as speed rises.

Both halves of that sentence are corrections. It used to ease toward an absolute
1.0, which meant pressing play on a phone framed at the 0.5 fit-zoom roughly
doubled the view inside a second — unasked, every single run. Anchoring the
pull-back to the starting zoom makes it a modulation of what you were already
looking at. And 0.85 rather than 0.7 because the parallax and the scarf already
carry speed; a third simultaneous speed signal that also moves the camera is one
too many.

**The follow stops the moment the player touches it**, for the rest of that run.
Drag moves the page and pinch zooms, neither ends the run, and a *tap* is what
returns you to editing. Playback used to end on pointer-down, which meant the one
gesture available while watching was the one that stopped the thing you were
watching — no panning, no looking ahead at the jump you were about to hit. In a
loop that is build → watch → adjust, *watch* was the step with no controls in it.

### 3.8 The rider

A hatted figure sitting on a toboggan: a runner with a small upturn at the front,
one leg stroke, a torso, an arm to the handle, a head and a woolly hat.

Everything is built off the rig's **own frame** — `u` along nose→tail, `up`
perpendicular to it — so the figure leans, rolls and lands with the sled instead
of being pasted on at screen angles. No new state and no new points: the five the
simulation already has are the joints.

It was bare constraint segments for four phases. The paper had grain and a
crinkle, the margin had a recognisable Eiffel Tower, the scarf was a five-link
Verlet chain — and the character the product is named around, the one the camera
is locked onto, was three lines and a circle. The most-looked-at object on screen
was the least-designed one.

**The rig is 28 px long and 27 px tall, and that governs everything.** A first
pass with a knee joint, a brimmed hat and a tall curl put six overlapping strokes
inside a thumbnail, and the curl swallowed the legs. At this size detail
subtracts: few strokes, large. Three specific traps, each of which cost a
screenshot to find — a quadratic only reaches half way to its control point, so a
hat control at 2.3 R peaked barely above the crown and read as a thick head
outline; stopping the torso at the shoulder left the head attached to nothing;
and running a 3 px torso into a 5 px circle filled the head in.

The constraint overlay lives on under `?debug`, because a rig that is folding or
mirroring should be visible rather than inferred.

### 3.9 The scarf

A five-link Verlet chain pinned to the rider's head, stepped in **render space**
at frame rate, drawn in red. Gravity `0.42`, drag `0.86`, and a wind impulse of
`0.62` per unit of rig speed pushed opposite the direction of travel.

It is a speedometer you do not have to read. Standing still it dangles; at speed
it streams out flat behind him. It is render state, never simulation state — it
is stepped by the frame loop, not the tick, so it cannot influence a run and does
not need to be deterministic.

**Both axes, and the vertical one is not optional.** A first pass moved the
scenery horizontally only, on the theory that the ruled lines already carried
vertical speed. They do not. Descending is most of what happens in this game,
and a fixed treeline sat dead still through the fastest part of every run.

The vertical factor is gentler than the horizontal one, because a hill drops
much further than it runs and matching the two makes the scenery streak. The
pattern wraps in both axes; the vertical repeat is deliberately long (1100 px of
parallax space) because three bands already put three ridgelines on screen, and
a short repeat stacks more on top of those until the background stops reading as
distance and starts reading as wallpaper.

Scenery is decoration. Nothing about it may ever feed back into physics.

---

## 4 · The rig

Five points. Positions at rest, rider facing +x, origin at the sled nose, y down.

| Point | Rest | Role |
| --- | --- | --- |
| `nose` | `(0, 0)` | **RIDE** — collides |
| `tail` | `(-28, 0)` | **RIDE** — collides |
| `seat` | `(-14, -11)` | structural only |
| `head` | `(-14, -27)` | **CRASH** — contact ends the run |
| `hand` | `(0, -18)` | decorative only |

The base is 28 px, not the 20 it started at. The rider's mass sits 27 px up, so
a 20 px base only had to lean about **20°** past a runner before it went over;
28 px buys **27°**. That is the difference between a hard landing being
survivable and being a coin flip.

Only `head` crashes in v1. "He crashes when his head hits the ground" is
intuitive, readable, and the most forgiving thing to tune.

### 4.1 Constraints

Solved in this exact order, **6 iterations per tick**.

| A | B | Rest | Stiffness |
| --- | --- | --- | --- |
| `nose` | `tail` | 28.000 | 1.00 |
| `nose` | `seat` | 17.804 | 1.00 |
| `tail` | `seat` | 17.804 | 1.00 |
| `seat` | `head` | 16.000 | 0.92 |
| `nose` | `head` | 30.414 | **0.60** |
| `seat` | `hand` | 15.652 | 0.50 |

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
| `GRAVITY` | **`0.105`** | px/tick², ≈175 px of fall in the first second |
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
| `SPAWN_AHEAD` | **`28.0`** | nudge downhill, so the tail is not behind the flag |

`GRAVITY` was `0.12` through phase 1. It came down because a jump is the thing
people build tracks *for*, and at `0.12` the arc was over before it read as one.
Note that friction here is a per-tick tangential damping factor and does **not**
depend on normal force, so loosening gravity buys hang time without also making
the ground slippery. Anything below about `0.09` starts reading as the moon.

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

**End tests**, after collisions, in this order: **finished** (any point sweeping
across a finish segment) → **crashed** (the head within `HEAD_CRASH_R` of any
collidable segment, or any point within `CONTACT_R` of a spike segment) →
**gone** (off-track). The head's test is swept for the same reason contact is.

Finish is tested first on purpose. A tape drawn over the end of a track will
sometimes overlap the geometry it ends at, and the run the player was trying to
complete must not resolve as a crash on a technicality.

---

## 7 · The eight brushes

| # | Brush | Colour | Class | Collides | friction | boost |
| --- | --- | --- | --- | :-: | --- | --- |
| 0 | **Ink** | ink | ink | ✓ | `0.004` | — |
| 1 | **Ice** | cyan | highlighter | ✓ | `0.0` | — |
| 2 | **Tar** | brown | highlighter | ✓ | `0.038` | — |
| 3 | **Boost** | yellow | highlighter | ✓ | `0.003` | `+0.08` |
| 4 | **Spikes** | red | ink | ✓ | `0.004` | — |
| 5 | **Water** | blue | ink | ✗ | surface line, half-plane below | |
| 6 | **Scenery** | pencil | ink | ✗ | drawing only | |
| 7 | **Finish** | green | highlighter | ✗ | ends the run, won | |

**Spikes** are brush 4. It used to be called Kill and it is exactly the same
mechanic under a name that says what it looks like: a solid red line with small
teeth combed along it every 13 px. Touching one ends the run.

The teeth stand on whichever side is **up**, never on whichever side happens to
be left of the direction you drew in. Keyed to stroke direction, a line drawn
right-to-left put its teeth underneath while the lethal segment stayed exactly
where it was — the drawing actively misreported where the danger was, which is
the one thing the teeth exist to prevent. There is no
half-measure — no health, no slow-down zone — because a track author needs to
know that a line either kills or does not.

**Finish** is brush 7, and it is the only way to *win*. A fat green highlighter
band with tick marks, no collision at all: the rig passes straight through it and
the run ends `finished`. It is checked **before** the crash test in the tick, so
a finish tape drawn across a spike wall is a win rather than a death — the
generous reading is the right one for the last line of a track.

Friction is **per tick of contact**, and a resting sled touches 60×/second — so
these are derived from per-second targets (ink keeps ~80%, tar ~10%), not picked
directly. See §9.2.

**Boost direction** is the segment as drawn, A→B. Drawing a boost line
right-to-left boosts backwards. This is a feature, and it has to be visible on
the line itself — chevrons every 26 px, drawn in ink over the yellow band. A
band drawn one way is pixel-identical to one drawn the other, so four words in a
sheet you opened ten minutes ago were the only record of which one you made.

**Scenery renders dashed.** It is the one entry in a list built on *colour means
behaviour* that means the absence of behaviour — the one thing a colour cannot
say. A broken line can: nothing anyone has ever drawn treats a dashed line as a
surface.

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
  p: Array<[ax, ay, bx, by, cx, cy, dx, dy, flags]>  // portal pairs
  g: Array<[x, y, strength]>                       // wells
  w: Array<[x1, y1, x2, y2, strength, kind]>       // wind
}
```

All coordinates are integers in **half-pixel units** (world × 2). 0.5 is exact
in binary floating point, so a round-trip cannot drift. Nothing float-valued is
ever serialised.

**Portal `flags`:** bit 0 makes the pair one-way, A to B only. Bidirectional is
the default and the interesting case, but two portals downstream on the same
track trap the rig and a closed loop is a perpetual motion machine (§9.8, §9.9),
so the escape hatch had to exist before level strings went into circulation.

**The format is at v2.** v1 had no portal flags. Decoding is positional, so an
added field is not backward compatible on its own — the version byte is what
makes it safe. This build writes v2 and reads both; v1 portals decode as
bidirectional, which is what they did when they were written. The gate holds a
real v1 string and asserts it still decodes and still runs.

Encoding: sort nothing (array order is load-bearing) → delta-encode consecutive
coordinates, one running cursor per axis → zig-zag varint → base64url, no
padding, with the format version as a raw leading byte.

**Wind strengths ride the wire as integer thousandths** — a float zig-zags to
zero.

**The decoder rejects trailing bytes.** A messenger that concatenates something
onto the end of a URL produces exactly that, and without the check it decoded
"successfully" into a level quietly different from the one that was sent — which
meant the careful damaged-link handling below never fired for the likeliest kind
of damage.

A 200-segment track lands around 500 bytes. Share is `#l=<string>` and requires
no backend of any kind.

The level hash is FNV-1a over the encoded string, feeding `mulberry32`. It
drives **only** ink wobble, it lives outside `sim/`, and CI proves the simulation
cannot even import it. Doodle placement uses a *session* seed instead — rolled
once at page load, so the margin is different every visit (§3.5).

---

## 11 · Phase order

1. ✅ **Sim core**, no art, no editor. One hardcoded track, placeholder rig as
   bare line segments. Tune until a hill, a jump and a landing all feel right.
2. ✅ **Determinism gate green**, including the static gates — before there is
   anything to retrofit.
3. ✅ Paper, rules, ink/highlighter rendering, parallax.
4. ✅ Editor: draw, undo, erase, pan, zoom, play, reset.
5. ✅ All eight brushes — one properties table, eight rows, so this landed with
   the editor rather than after it.
6. ⬜ Rider system + click-to-cycle. The figure is drawn (§3.8) but it is one
   fixed drawing, not a manifest — nothing can be swapped yet.
7. ⬜ The three stamps in the editor. Portals last — the only subtle maths.
   They already run and round-trip; there is just no UI to place one.
8. ✅ Share link wired to the URL. A malformed link is **never** written over:
   overwriting the hash destroys the only copy of the level someone was sent,
   and a messenger truncating a long URL is exactly how that happens.
9. ⬜ Hand-drawn parts replace the drawn-in-code figure. Content only, zero code.

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
