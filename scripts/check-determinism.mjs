/**
 * The gate that matters.
 *
 * A level string must produce a bit-identical run on every device and every
 * browser, forever. That is not a nice-to-have — it is the feature that makes
 * sharing work at all, and it fails silently and late if it is ever violated.
 *
 * Pure Node, no browser, no bundler: `sim/` is imported directly, which is only
 * possible because it imports nothing from outside itself. Check 12 asserts
 * that stays true.
 *
 *   node --experimental-strip-types scripts/check-determinism.mjs
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { BRUSH, CONTACT_R, buildWorld, spawn, step } from '../src/sim/index.ts'
import { decodeLevel, encodeLevel } from '../src/level/format.ts'
import { decorRng } from '../src/level/prng.ts'
import { fixtureDescent, fixturePortal } from '../src/level/fixtures.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIM_DIR = join(ROOT, 'src', 'sim')
const TICKS = 3000

// ── bit-level checksum ───────────────────────────────────────────────────────
// Hash the raw IEEE-754 bits, not a rounded string. Two runs that differ in the
// last mantissa bit must be caught, because that is exactly how this breaks.

const _buf = new ArrayBuffer(8)
const _f64 = new Float64Array(_buf)
const _u32 = new Uint32Array(_buf)

function mix(h, x) {
  h ^= x >>> 0
  return Math.imul(h, 16777619) >>> 0
}

function mixFloat(h, v) {
  _f64[0] = v
  return mix(mix(h, _u32[0]), _u32[1])
}

const STATE_CODE = { running: 1, crashed: 2, gone: 3 }

/** Run a level and return its checksum, plus enough trace to assert coverage. */
function run(level, ticks = TICKS) {
  const world = buildWorld(level)
  const rig = spawn(world)
  let h = 0x811c9dc5
  const trace = []
  let maxJump = 0
  let jumpTick = -1

  for (let t = 0; t < ticks; t++) {
    const bx = rig.pts[0].x
    const by = rig.pts[0].y

    step(rig, world)

    for (const p of rig.pts) {
      h = mixFloat(h, p.x)
      h = mixFloat(h, p.y)
      h = mixFloat(h, p.px)
      h = mixFloat(h, p.py)
    }
    h = mix(h, rig.tick)
    h = mix(h, STATE_CODE[rig.state])

    // A portal transit is the only thing that moves the rig a long way in one
    // tick, so the largest single-tick jump is how the transit is detected.
    // sqrt, not hypot: withTraps booby-traps hypot, and this runs under it.
    const jdx = rig.pts[0].x - bx
    const jdy = rig.pts[0].y - by
    const jump = Math.sqrt(jdx * jdx + jdy * jdy)
    if (jump > maxJump) {
      maxJump = jump
      jumpTick = rig.tick
    }

    trace.push([rig.pts[0].x, rig.pts[0].y, rig.pts[1].x, rig.pts[1].y])
    if (rig.state !== 'running') break
  }

  return { h: h >>> 0, ticks: rig.tick, state: rig.state, trace, maxJump, jumpTick, world }
}

// ── fixtures ────────────────────────────────────────────────────────────────
// Imported rather than defined here, so the gate and the tuning harness are
// provably checking the same two tracks.

// ── checks ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures = []

function check(n, name, fn) {
  let ok = false
  let detail = ''
  try {
    const r = fn()
    ok = r === true || r === undefined
    if (typeof r === 'string') {
      ok = false
      detail = r
    }
  } catch (err) {
    ok = false
    detail = err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n   ') : String(err)
  }
  if (ok) {
    passed++
    console.log(`  ✓ ${String(n).padStart(2)} · ${name}`)
  } else {
    failed++
    failures.push(`${n} · ${name}${detail ? `\n   ${detail}` : ''}`)
    console.log(`  ✗ ${String(n).padStart(2)} · ${name}${detail ? `\n     ${detail}` : ''}`)
  }
}

const descent = fixtureDescent()
const portal = fixturePortal()

const baseDescent = run(descent)
const basePortal = run(portal)

console.log('\nsled · determinism gate\n')
console.log(
  `  descent: ${baseDescent.ticks} ticks, ended "${baseDescent.state}", checksum ${baseDescent.h.toString(16).padStart(8, '0')}`,
)
console.log(
  `  portal:  ${basePortal.ticks} ticks, ended "${basePortal.state}", checksum ${basePortal.h.toString(16).padStart(8, '0')}\n`,
)

// 1 & 4 — the same level, run twice in the same process.
check(1, 'descent · identical across two runs', () => {
  const b = run(descent)
  return b.h === baseDescent.h ? true : `${b.h} !== ${baseDescent.h}`
})

check(2, 'descent · identical after encode -> decode', () => {
  const b = run(decodeLevel(encodeLevel(descent)))
  return b.h === baseDescent.h ? true : `${b.h} !== ${baseDescent.h}`
})

check(3, 'descent · no randomness, no transcendentals at runtime', () => {
  return withTraps(() => {
    const b = run(descent)
    return b.h === baseDescent.h ? true : `${b.h} !== ${baseDescent.h}`
  })
})

check(4, 'portal · identical across two runs', () => {
  const b = run(portal)
  return b.h === basePortal.h ? true : `${b.h} !== ${basePortal.h}`
})

check(5, 'portal · identical after encode -> decode', () => {
  const b = run(decodeLevel(encodeLevel(portal)))
  return b.h === basePortal.h ? true : `${b.h} !== ${basePortal.h}`
})

check(6, 'portal · no randomness, no transcendentals at runtime', () => {
  return withTraps(() => {
    const b = run(portal)
    return b.h === basePortal.h ? true : `${b.h} !== ${basePortal.h}`
  })
})

check(7, 'wire · round-trip is stable, and seeds identical decoration', () => {
  for (const [name, lvl] of [['descent', descent], ['portal', portal]]) {
    const once = encodeLevel(lvl)
    const twice = encodeLevel(decodeLevel(once))
    if (once !== twice) return `${name}: ${once} !== ${twice}`

    // Parallax and ink wobble are seeded from the encoded string, so everyone
    // opening the same link must get the same page. Decoration never feeds back
    // into physics — check 12 is what proves the sim cannot even reach it.
    const a = decorRng(once)
    const b = decorRng(twice)
    for (let i = 0; i < 32; i++) {
      const va = a()
      const vb = b()
      if (va !== vb) return `${name}: decoration diverged at draw ${i} (${va} !== ${vb})`
    }
  }
  return true
})

check(8, 'wire · decoded level deep-equals the original', () => {
  for (const [name, lvl] of [['descent', descent], ['portal', portal]]) {
    const back = decodeLevel(encodeLevel(lvl))
    const a = JSON.stringify(lvl)
    const b = JSON.stringify(back)
    if (a !== b) return `${name}:\n   in  ${a}\n   out ${b}`
  }
  return true
})

check(9, 'coverage · the descent actually touches every brush', () => {
  const missing = []
  const present = new Set(descent.l.map((s) => s[0]))
  for (const id of Object.values(BRUSH)) {
    if (!present.has(id)) missing.push(`brush ${id} absent from the fixture`)
  }

  // Solid brushes: did a RIDE point come within contact range of one?
  for (const id of [BRUSH.INK, BRUSH.ICE, BRUSH.TAR, BRUSH.BOOST, BRUSH.KILL]) {
    const segs = descent.l.filter((s) => s[0] === id)
    if (!touchedAny(baseDescent.trace, segs)) missing.push(`brush ${id} never contacted`)
  }
  // Water is a half-plane, so submersion is the test, not proximity.
  const water = descent.l.filter((s) => s[0] === BRUSH.WATER)
  if (!submergedAny(baseDescent.trace, water)) missing.push('water never entered')

  return missing.length === 0 ? true : missing.join('; ')
})

check(10, 'coverage · the portal fixture actually transits, and stamps are live', () => {
  const notes = []
  if (basePortal.maxJump < 100) {
    notes.push(`no portal transit detected (largest single-tick jump ${basePortal.maxJump.toFixed(2)} px)`)
  }
  if (baseDescent.world.wells.length !== 1) notes.push('descent well missing from the world')
  if (baseDescent.world.winds.length !== 1) notes.push('descent arrow wind missing from the world')
  if (basePortal.world.portals.length !== 1) notes.push('portal missing from the world')
  // Both wind branches must be live somewhere, or the runtime trap in checks 3
  // and 6 silently covers only one of them.
  if (baseDescent.world.winds[0]?.kind !== 0) notes.push('descent wind is not an arrow')
  if (basePortal.world.winds[0]?.kind !== 1) notes.push('portal fixture vortex missing')
  if (!withinAny(basePortal.trace, basePortal.world.winds)) notes.push('vortex never entered')
  return notes.length === 0 ? true : notes.join('; ')
})

check(11, 'static · no transcendentals anywhere in sim/', () => {
  const banned =
    /\bMath\s*\.\s*(sin|cos|tan|asin|acos|atan|atan2|pow|exp|expm1|log|log2|log10|log1p|hypot|cbrt|sinh|cosh|tanh|random)\b/
  const hits = []
  for (const { file, code } of simSources()) {
    code.split('\n').forEach((line, i) => {
      const m = banned.exec(line)
      if (m) hits.push(`${file}:${i + 1} uses Math.${m[1]}`)
    })
  }
  return hits.length === 0 ? true : hits.join('; ')
})

check(12, 'static · sim/ imports nothing from outside itself', () => {
  const hits = []
  // Note this reads `specifiers`, not `code`: the transcendental grep blanks
  // string bodies, which would erase every module path before this ever saw it
  // and leave the check passing unconditionally.
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'y' / export * from 'y'
    /\bimport\s+['"]([^'"]+)['"]/g, // bare side-effect import
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const { file, specifiers } of simSources()) {
    for (const re of patterns) {
      for (const m of specifiers.matchAll(re)) {
        const spec = m[1]
        if (!spec.startsWith('./') || spec.includes('..')) {
          hits.push(`${file} imports "${spec}"`)
        }
      }
    }
  }
  return hits.length === 0 ? true : hits.join('; ')
})

check(13, 'wire · v1 level strings still decode', () => {
  // A real string produced by this project before the portal flags field
  // existed. Positional decoding means a new field is not backward compatible
  // on its own, so this is the check that stops a format change quietly
  // orphaning every link anyone has already shared.
  const V1 =
    'AQIEBgjAAmAaAL8CX6AG8AEAAACgBsACAgAA6AfoAgAAANgEmAIEAACgBqABAAAA2ASgAQYAAKAGoAEAAADoB_ABAAAA4BIACs8PnwHADAAMnzjvEJAD7wEM0A_gA8ACvwIIkCbQDwCQAwACzyjvC7AJArAJsAmQAwAoAA'
  const lvl = decodeLevel(V1)
  const notes = []
  if (lvl.l.length !== 13) notes.push(`expected 13 lines, got ${lvl.l.length}`)
  if (lvl.g.length !== 1) notes.push(`expected 1 well, got ${lvl.g.length}`)
  if (lvl.w.length !== 1) notes.push(`expected 1 wind, got ${lvl.w.length}`)
  if (lvl.s[0] !== 80 || lvl.s[1] !== 24) notes.push(`start moved: ${JSON.stringify(lvl.s)}`)
  // Upgrading it to the current version must not change what it means.
  const round = decodeLevel(encodeLevel(lvl))
  if (JSON.stringify(round) !== JSON.stringify(lvl)) notes.push('v1 -> v2 round trip changed the level')
  // And it must still run.
  const r = run(lvl, 400)
  if (r.ticks < 100) notes.push(`v1 level only ran ${r.ticks} ticks`)
  return notes.length === 0 ? true : notes.join('; ')
})

check(14, 'portals · the one-way flag actually blocks the return trip', () => {
  // Portal B is deliberately long enough that the rig lands on top of it — the
  // configuration that produced the inescapable loop in spec §9.8. Bidirectional
  // it must ping-pong; one-way it must not. If both behave the same the flag is
  // decorative, which is worse than not having it.
  const build = (flags) => ({
    v: 1,
    r: [0, 0, 0, 0],
    s: [80, 40],
    l: [
      [BRUSH.INK, 0, 0, 600, 300],
      [BRUSH.INK, 900, 500, 2000, 700],
      [BRUSH.INK, 2000, 700, 2600, 700],
    ],
    p: [[400, 150, 400, 250, 1200, 480, 1228, 576, flags]],
    g: [],
    w: [],
  })

  const transits = (level) => {
    const world = buildWorld(level)
    const rig = spawn(world)
    let n = 0
    for (let t = 0; t < 2000; t++) {
      const bx = rig.pts[0].x
      const by = rig.pts[0].y
      step(rig, world)
      const dx = rig.pts[0].x - bx
      const dy = rig.pts[0].y - by
      if (Math.sqrt(dx * dx + dy * dy) > 100) n++
      if (rig.state !== 'running') break
    }
    return n
  }

  const both = transits(build(0))
  const one = transits(build(1))
  const notes = []
  if (both < 2) notes.push(`bidirectional pair should ping-pong, saw ${both} transit(s)`)
  if (one !== 1) notes.push(`one-way pair should transit exactly once, saw ${one}`)
  return notes.length === 0 ? true : notes.join('; ')
})

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Run fn with every non-deterministic and every non-correctly-rounded Math
 * entry point booby-trapped.
 *
 * IEEE-754 requires correct rounding for + - * / and sqrt, and requires
 * *nothing* of the transcendentals — engines genuinely differ. A portal built
 * on atan2 works in one browser and silently breaks in another. The grep in
 * check 11 catches the source; this catches anything that reaches them at
 * runtime by another route.
 *
 * Math.random is trapped here too. The decoration PRNG that drives parallax and
 * ink wobble needs no stub: it lives in level/, and check 12 proves the sim
 * cannot import it, which is a stronger guarantee than zeroing it would be.
 */
function withTraps(fn) {
  const names = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'pow', 'exp', 'log', 'log2', 'log10', 'hypot', 'cbrt', 'random',
  ]
  const saved = {}
  for (const n of names) {
    saved[n] = Math[n]
    Math[n] = () => {
      throw new Error(`sim reached Math.${n}`)
    }
  }
  try {
    return fn()
  } finally {
    for (const n of names) Math[n] = saved[n]
  }
}

function simSources() {
  return readdirSync(SIM_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => {
      const src = readFileSync(join(SIM_DIR, f), 'utf8')
      return {
        file: `src/sim/${f}`,
        /** Comments and string bodies gone — for grepping code. */
        code: strip(src, true),
        /** Comments gone, strings intact — for reading module paths. */
        specifiers: strip(src, false),
      }
    })
}

/**
 * Remove comments before grepping, and optionally string bodies too.
 *
 * Comments have to go or the gate fires on its own documentation: every one of
 * these files explains in prose why atan2 is forbidden, and a naive grep cannot
 * tell an explanation apart from a call.
 *
 * String bodies have to *stay* for the import check, which is exactly what
 * reads them — hence the flag rather than one stripper for both.
 */
function strip(src, stripStrings) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
    } else if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c
      const start = i
      i++
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      i++
      out += stripStrings ? ' ' : src.slice(start, i)
    } else {
      out += c
      i++
    }
  }
  return out
}

/** Did either RIDE point pass within contact range of any of these segments? */
function touchedAny(trace, segs) {
  const r = CONTACT_R + 0.75
  for (const [nx, ny, tx, ty] of trace) {
    for (const [, ax, ay, bx, by] of segs) {
      if (pointSegDist2(nx, ny, ax, ay, bx, by) <= r * r) return true
      if (pointSegDist2(tx, ty, ax, ay, bx, by) <= r * r) return true
    }
  }
  return false
}

/** Did either RIDE point pass inside any of these wind fields? */
function withinAny(trace, winds) {
  for (const [nx, ny, tx, ty] of trace) {
    for (const w of winds) {
      const r = w.kind === 1 ? w.radius : 60
      for (const [px, py] of [[nx, ny], [tx, ty]]) {
        // A vortex measures from its centre; an arrow from its whole segment.
        const d2 =
          w.kind === 1
            ? (px - w.ax) * (px - w.ax) + (py - w.ay) * (py - w.ay)
            : pointSegDist2(px, py, w.ax, w.ay, w.bx, w.by)
        if (d2 <= r * r) return true
      }
    }
  }
  return false
}

/** Did either RIDE point go under any of these water surfaces? */
function submergedAny(trace, waters) {
  for (const [nx, ny, tx, ty] of trace) {
    for (const [, ax, ay, bx, by] of waters) {
      const lo = Math.min(ax, bx)
      const hi = Math.max(ax, bx)
      for (const [px, py] of [[nx, ny], [tx, ty]]) {
        if (px < lo || px > hi) continue
        const span = bx - ax
        const surface = Math.abs(span) < 1e-9 ? Math.min(ay, by) : ay + ((by - ay) * (px - ax)) / span
        if (py > surface) return true
      }
    }
  }
  return false
}

function pointSegDist2(x, y, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const ab2 = abx * abx + aby * aby
  if (ab2 < 1e-9) {
    const dx0 = x - ax
    const dy0 = y - ay
    return dx0 * dx0 + dy0 * dy0
  }
  let t = ((x - ax) * abx + (y - ay) * aby) / ab2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = x - (ax + abx * t)
  const dy = y - (ay + aby * t)
  return dx * dx + dy * dy
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.error('determinism gate FAILED:\n')
  for (const f of failures) console.error(`  ${f}\n`)
  process.exit(1)
}
