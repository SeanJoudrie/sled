# Sled

**Draw a line. He rides it.**

A Line Rider–like set on ruled notebook paper. You draw a track with a small set
of pens and highlighters, place a few stamps, and press play. A hand-drawn rider
on a sled runs it under deterministic physics.

The run is a pure function of the drawing, so a level is a short string, a share
link needs no backend, and **the replay is the level**.

---

## Status

Phase 1 of 9. What exists is the simulation core, the level format, the
determinism gate, and a deliberately bare harness to watch the ride in.

| | |
| --- | --- |
| ✅ **Sim core** | 5-point rig, 6 constraints, 7 brushes, 3 stamps, swept collision |
| ✅ **Level format** | half-pixel integers → delta → zig-zag → varint → base64url |
| ✅ **Determinism gate** | 12 checks, green |
| ✅ **Tuning harness** | bare line segments, no paper, no editor |
| ⬜ **Phases 3–9** | paper & rendering, editor, rider art, share UI |

The harness looks unfinished on purpose. Making it pretty before the ride feels
right is how you end up tuning to a nice-looking thing that plays badly.

## Running it

```sh
npm install
npm run dev        # the tuning harness
npm run verify     # the determinism gate — 12 checks
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
  prng.ts           decoration PRNG — never touched by the sim
  fixtures.ts       the two fixture levels
src/main.ts         phase 1 tuning harness
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

Two fixtures — a long descent covering all seven brushes plus a well and arrow
wind, and a ramp through a rotating portal pair plus a vortex — run for up to
3,000 ticks against a checksum taken over the raw IEEE-754 bits of every point,
every tick.

| # | Check |
| --- | --- |
| 1, 4 | identical across two runs in the same process |
| 2, 5 | identical after an encode → decode round trip |
| 3, 6 | identical with every transcendental and `Math.random` booby-trapped |
| 7 | round-trip is stable, and seeds identical decoration |
| 8 | decoded level deep-equals the original |
| 9 | the descent actually contacts every brush |
| 10 | the portal fixture actually transits, and every stamp is live |
| 11 | no transcendentals anywhere in `sim/` |
| 12 | `sim/` imports nothing from outside itself |

Checks 9 and 10 exist because a fixture that stops covering a mechanic makes the
other eleven checks pass on a track that no longer exercises it — which is how a
gate goes quietly green over a mechanic nobody is testing any more.

## Locked decisions

1. **The run is deterministic.** No input steers the rider. All the craft is in
   the drawing. Chosen over a driving game deliberately: it makes the level
   string a complete replay, kills input recording, and reproduces exactly on
   any device.
2. **No physics library.** Hand-rolled Verlet.
3. **Colour means behaviour.** A plain ink line is geometry; every coloured line
   *does* something, so a level is readable without a legend.
4. **The palette is a middle-school pencil case** — ballpoint, red pen, blue
   pen, three highlighters. Nothing outside it.
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
