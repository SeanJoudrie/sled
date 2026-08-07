# Sled

**Draw a line. He rides it.**

A Line Rider–like set on ruled notebook paper. You draw a track with a small set
of pens and highlighters, place a few stamps, and press play. A hand-drawn rider
on a sled runs it under deterministic physics.

The run is a pure function of the drawing, so a level is a short string, a share
link needs no backend, and **the replay is the level**.

---

## Status

You can draw a track and watch him ride it, and the level travels in the URL.

| | |
| --- | --- |
| ✅ **Sim core** | 5-point rig, 6 constraints, 8 brushes, 3 stamps, swept collision |
| ✅ **Level format** | half-pixel integers → delta → zig-zag → varint → base64url |
| ✅ **Determinism gate** | 15 checks, green |
| ✅ **The page** | paper, grain and crinkle, ruled lines, ink vs highlighter, doodles |
| ✅ **Editor** | draw, undo/redo, erase, pan, zoom, play, reset — all eight brushes |
| ✅ **Share link** | the level lives in the URL; no backend of any kind |
| ⬜ **Stamps in the editor** | portals, wells and wind run and round-trip, but nothing can place one yet |
| ⬜ **The rider** | still bare segments; the layered part manifest and the art are the last phases |

## Controls

Built for a phone: round buttons in the corners, nothing that needs scrolling.

| Corner | |
| --- | --- |
| bottom left | **Draw** (pencil) · **Material** (shows the current pen) · **Erase** · **More** |
| bottom right | **Play**, and **Share** — which becomes **Reset** while a run is going |
| top left | **Undo** · **Redo** |
| top right | what a drag will do, and the speed once a run starts |

**Draw is a mode.** Tap the pencil to draw; tap it again and a one-finger drag
moves the page instead. Drawing and panning both want the same gesture, and a
phone has no right button or space bar to tell them apart. A mouse keeps its
shortcuts either way — space-drag and middle-drag always pan, right-drag always
erases.

**Material** opens a sheet of all eight pens, each with its name and its stroke
class. Picking one hands you back the pencil.

| Pen | |
| --- | --- |
| **Ink** | plain geometry, a little friction |
| **Ice** | frictionless |
| **Tar** | kills speed |
| **Boost** | pushes along the line, in the direction you drew it |
| **Spikes** | red, small teeth — touching one ends the run |
| **Water** | a surface line; everything below it is wet |
| **Scenery** | drawing only, no physics |
| **Finish** | green tape. Cross it and you win |

| Keyboard | |
| --- | --- |
| `D` / `E` / `H` / `F` | draw · erase · move · start flag |
| `1`–`8` | pick a pen |
| `Enter` | play / pause |
| `Esc` | back to editing |
| `⌘Z` / `⇧⌘Z` | undo / redo, 100 deep, whole strokes |
| wheel or pinch | zoom, `0.25×`–`4×` in 1/16 steps |
| double-tap | reframe the level |
| `?debug` | show the tick counter and publish the camera zoom |

Drawing a boost line right-to-left boosts **backwards** — the impulse runs along
the segment as drawn. That is a feature, and the chevrons drawn along the line
say which way it went, so you do not have to remember.

**You can look around during a run.** Drag to move the page and pinch to zoom
without stopping it; the camera stops following the moment you touch it, and
picks the sled back up on the next run. A *tap* is what returns you to editing.

## The page

The background is the margin of a notebook, drawn badly on purpose: two kinds of
tree, houses, blocky buildings, a four-line Eiffel Tower, five-pointed stars, a
shooting star, a ringed planet, comets, and that S everyone drew and nobody can
name. Three parallax bands of them, so you can see how fast you are going —
against a blank page a fast run and a slow run look identical.

**They are re-rolled every time the page loads**, from a session seed rather than
the level hash. Two people opening the same link get the same track and different
doodles, which is the right way round: the doodles are the page, the track is the
level.

The paper has a crinkle worked into its grain — the same noise field run through
a ridge function, so it reads as a sheet that has been folded and flattened. The
ruled lines stay perfectly straight; only the tone crumples.

The rider wears a red scarf. It hangs when he is slow and streams out flat when
he is fast, which is a speedometer you do not have to read. It is a five-link
Verlet chain in render space, stepped by the frame loop and never by the tick, so
it cannot touch a run.

## Running it

Live at **<https://seanjoudrie.github.io/sled/>**. Every push to `main`
republishes it.

```sh
npm install
npm run dev        # the editor
npm run verify     # the determinism gate — 15 checks
npm test           # typecheck + verify
npm run build      # typecheck + production build
```

`npm run verify` needs Node 22.6+ — it imports the TypeScript in `src/sim/`
directly using Node's type stripping, with no build step and no browser.

## Layout

```
src/sim/            the simulation — imports nothing outside itself
  consts.ts         every tunable, in per-tick units
  types.ts          Level, World, and the brush table
  rig.ts            points, constraints, spawn, applyPosture
  world.ts          Level -> World, clamps anything off the wire
  collide.ts        swept + resting contact, friction, water, crash
  stamps.ts         wells, wind, portals
  step.ts           the fixed-step tick
  index.ts          the public surface
src/level/
  format.ts         encode / decode / share link
  stroke.ts         strokes — the authoring form of a drawn line
  prng.ts           decoration PRNG — never touched by the sim
  fixtures.ts       the two fixture levels
src/render/         all render state; never written back to the sim
  paper.ts          paper, grain, crinkle, creases, ruled lines
  strokes.ts        ink vs highlighter, water, spikes, finish tape
  doodles.ts        the margin drawings — trees, houses, stars, that S
  parallax.ts       three bands of them, parallaxed in both axes
  scarf.ts          a five-link chain on the rider's neck
  camera.ts         pan, zoom, and the follow during a run
  scene.ts          one frame, composed
src/editor/
  model.ts          strokes, undo/redo, erase, level derivation
  toolbar.ts        the corner buttons and the material sheet
src/main.ts         input, gestures, the loop
scripts/check-determinism.mjs
docs/spec.md        the build spec
```

## The determinism law

A level string must produce a bit-identical run on every device and every
browser, forever. This is not a nice-to-have — it is the feature that makes
sharing work, and it fails silently and late if violated.

1. Fixed timestep, always. No variable-delta integration anywhere, no `dt` term
   in the integrator. Every constant is per tick or per tick².
2. **No `Math.sin`, `cos`, `tan`, `atan2`, `pow`, `exp`, `log` or `hypot` inside
   `sim/`.** IEEE-754 requires correct rounding for `+ - * /` and `Math.sqrt`,
   and requires *nothing* of the transcendentals. Engines genuinely differ, so a
   portal built on `atan2` works in Chrome and silently breaks in Safari. Every
   rotation is built from normalised direction vectors and one complex multiply.
3. No `Math.random` in the simulation. Decoration uses `mulberry32` seeded from
   the level hash, and may never feed back into physics.
4. No iteration over a `Set` or `Map` in the sim. Fixed-order arrays only.
5. Collision resolves in level-array order, which is stable because level data
   is an ordered array and edits append.
6. All level coordinates are integers in half-pixel units, so parsing cannot
   introduce drift.
7. Never branch on floating-point equality — compare against `EPS_LEN`.

`npm run verify` enforces all of this. Both static gates are mutation-tested:
injecting a transcendental, an outward import, or a `Math.random` into `sim/`
each fail the run, and prose *mentioning* `atan2` does not.

## What the gate checks

Two fixtures — a long descent covering the physical brushes plus a well and
arrow wind, and a ramp through a rotating portal pair plus a vortex, ending on a
finish tape — run for up to 3,000 ticks against a checksum taken over the raw
IEEE-754 bits of every point, every tick. Between them they touch all eight
brushes and all three stamps.

| # | Check |
| --- | --- |
| 1, 4 | identical across two runs in the same process |
| 2, 5 | identical after an encode → decode round trip |
| 3, 6 | identical with every transcendental and `Math.random` booby-trapped |
| 7 | round-trip is stable, and seeds identical decoration |
| 8 | decoded level deep-equals the original |
| 9 | the fixtures between them actually contact every brush |
| 10 | the portal fixture actually transits, and every stamp is live |
| 11 | no transcendentals anywhere in `sim/` |
| 12 | `sim/` imports nothing from outside itself |
| 13 | v1 level strings still decode, and mean the same thing |
| 14 | the portal one-way flag actually blocks the return trip |
| 15 | no stale pen count in the shipped meta tags |

Checks 9 and 10 exist because a fixture that stops covering a mechanic makes the
other checks pass on a track that no longer exercises it — which is how a gate
goes quietly green over a mechanic nobody is testing any more.

Check 13 holds a real level string produced before the format grew a field.
Positional decoding means adding one is not backward compatible on its own, so
this is what stops a format change silently orphaning every link already shared.

Check 14 runs a portal pair in the configuration known to trap the rig, twice —
bidirectional and one-way — and asserts they behave *differently*. A flag that
is read but not obeyed is worse than no flag.

## Locked decisions

1. **The run is deterministic.** No input steers the rider. All the craft is in
   the drawing. Chosen over a driving game deliberately: it makes the level
   string a complete replay, kills input recording, and reproduces exactly on
   any device.
2. **No physics library.** Hand-rolled Verlet.
3. **Colour means behaviour.** A plain ink line is geometry; every coloured line
   *does* something, so a level is readable without a legend.
4. **The palette is a middle-school pencil case** — ballpoint, red pen, blue
   pen, pencil, four highlighters. Nothing outside it.
5. **Ink and highlighter render differently.** Ink is thin and opaque;
   highlighter is fat, translucent, multiply-blended — and the ink line draws
   *through* it, because you highlight over writing.
6. **The rider is data, not code.** A layered manifest, so hand-drawn parts drop
   in as a content change with zero code change.
7. **Units are per-tick, never per-second.**
8. **Single theme.** It is a sheet of paper; a dark notebook page is not a
   thing. `color-scheme: light`, no inversion.

See [`docs/spec.md`](docs/spec.md) for the full build spec, the brush and stamp
tables, and the nine things phase 1 cost to learn.
