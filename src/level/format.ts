/**
 * The level string.
 *
 * Integers in half-pixel units -> delta -> zig-zag -> varint -> base64url.
 *
 * Half-pixel units matter: 0.5 is exact in binary floating point, so a
 * round-trip through the wire cannot introduce drift. Nothing float-valued is
 * ever serialised. A 200-segment track lands around 500 bytes, which fits in a
 * URL comfortably and means sharing needs no backend of any kind.
 *
 * Array order is load-bearing — collisions resolve in it — so the encoder
 * sorts nothing, ever.
 */

import type { BrushId, Level, WindKind } from '../sim/index.ts'
import { asBrushId } from '../sim/index.ts'

export const FORMAT_VERSION = 1

/** Wind strengths ride the wire as integer thousandths: a float zig-zags to zero. */
const WIND_STRENGTH_SCALE = 1000

// ── varint / zig-zag ─────────────────────────────────────────────────────────

function zig(n: number): number {
  return n < 0 ? -n * 2 - 1 : n * 2
}

function unzig(u: number): number {
  return u % 2 === 1 ? -(u + 1) / 2 : u / 2
}

class Writer {
  readonly bytes: number[] = []

  /** One raw byte, unencoded. Used only for the version prefix. */
  raw(b: number): void {
    this.bytes.push(b & 0xff)
  }

  /** A signed integer, zig-zagged then varint-encoded. */
  int(n: number): void {
    let u = zig(Math.round(n))
    while (u >= 0x80) {
      this.bytes.push((u % 0x80) + 0x80)
      u = Math.floor(u / 0x80)
    }
    this.bytes.push(u)
  }
}

class Reader {
  private i = 0
  private readonly bytes: Uint8Array

  // A plain assignment rather than a parameter property: parameter properties
  // are not type-erasable, and the determinism gate imports this file directly
  // under Node's strip-only TypeScript mode.
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  raw(): number {
    if (this.i >= this.bytes.length) throw new Error('level: truncated')
    return this.bytes[this.i++]!
  }

  int(): number {
    let u = 0
    let shift = 1
    for (;;) {
      if (this.i >= this.bytes.length) throw new Error('level: truncated')
      const b = this.bytes[this.i++]!
      u += (b % 0x80) * shift
      if (b < 0x80) break
      shift *= 0x80
      if (shift > 2 ** 45) throw new Error('level: varint too long')
    }
    return unzig(u)
  }

  get done(): boolean {
    return this.i >= this.bytes.length
  }
}

// ── base64url ────────────────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_REV = (() => {
  const m = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) m[B64.charCodeAt(i)] = i
  return m
})()

function toB64url(bytes: readonly number[]): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]!
    const b2 = bytes[i + 2]!
    out += B64[b0 >> 2]! + B64[((b0 & 3) << 4) | (b1 >> 4)]!
    out += B64[((b1 & 15) << 2) | (b2 >> 6)]! + B64[b2 & 63]!
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const b0 = bytes[i]!
    out += B64[b0 >> 2]! + B64[(b0 & 3) << 4]!
  } else if (rem === 2) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]!
    out += B64[b0 >> 2]! + B64[((b0 & 3) << 4) | (b1 >> 4)]! + B64[(b1 & 15) << 2]!
  }
  return out
}

function fromB64url(s: string): Uint8Array {
  const n = s.length
  const full = Math.floor(n / 4)
  const rem = n % 4
  if (rem === 1) throw new Error('level: bad length')
  const out = new Uint8Array(full * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0))

  const at = (i: number): number => {
    const c = s.charCodeAt(i)
    const v = c < 128 ? B64_REV[c]! : -1
    if (v < 0) throw new Error('level: bad character')
    return v
  }

  let o = 0
  let i = 0
  for (let k = 0; k < full; k++, i += 4) {
    const a = at(i), b = at(i + 1), c = at(i + 2), d = at(i + 3)
    out[o++] = (a << 2) | (b >> 4)
    out[o++] = ((b & 15) << 4) | (c >> 2)
    out[o++] = ((c & 3) << 6) | d
  }
  if (rem === 2) {
    out[o++] = (at(i) << 2) | (at(i + 1) >> 4)
  } else if (rem === 3) {
    const a = at(i), b = at(i + 1), c = at(i + 2)
    out[o++] = (a << 2) | (b >> 4)
    out[o++] = ((b & 15) << 4) | (c >> 2)
  }
  return out
}

// ── encode ───────────────────────────────────────────────────────────────────

/** World units -> half-pixel integers. */
function q(v: number): number {
  return Math.round(v * 2)
}

export function encodeLevel(level: Level): string {
  const w = new Writer()
  w.raw(FORMAT_VERSION)

  for (let i = 0; i < 4; i++) w.int(Math.trunc(level.r[i] ?? 0))

  // One running cursor per axis. Consecutive coordinates on a drawn track are
  // close together, so the deltas stay tiny.
  let cx = 0
  let cy = 0
  const px = (v: number) => {
    const n = q(v)
    w.int(n - cx)
    cx = n
  }
  const py = (v: number) => {
    const n = q(v)
    w.int(n - cy)
    cy = n
  }

  px(level.s[0])
  py(level.s[1])

  w.int(level.l.length)
  for (const [brush, x1, y1, x2, y2] of level.l) {
    w.int(brush)
    px(x1); py(y1); px(x2); py(y2)
  }

  w.int(level.p.length)
  for (const p of level.p) {
    px(p[0]); py(p[1]); px(p[2]); py(p[3])
    px(p[4]); py(p[5]); px(p[6]); py(p[7])
  }

  w.int(level.g.length)
  for (const [x, y, strength] of level.g) {
    px(x); py(y)
    w.int(Math.round(strength))
  }

  w.int(level.w.length)
  for (const [x1, y1, x2, y2, strength, kind] of level.w) {
    px(x1); py(y1); px(x2); py(y2)
    w.int(Math.round(strength * WIND_STRENGTH_SCALE))
    w.int(kind)
  }

  return toB64url(w.bytes)
}

// ── decode ───────────────────────────────────────────────────────────────────

/** Guards a length read off the wire before it is used to size a loop. */
function count(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new Error('level: bad count')
  return n
}

export function decodeLevel(s: string): Level {
  const r = new Reader(fromB64url(s))
  const version = r.raw()
  if (version !== FORMAT_VERSION) {
    throw new Error(`level: unsupported version ${version}`)
  }

  const rider: [number, number, number, number] = [r.int(), r.int(), r.int(), r.int()]

  let cx = 0
  let cy = 0
  const px = (): number => {
    cx += r.int()
    return cx * 0.5 // exact in binary floating point
  }
  const py = (): number => {
    cy += r.int()
    return cy * 0.5
  }

  const start: [number, number] = [px(), py()]

  const l: Level['l'] = []
  for (let i = count(r.int()); i > 0; i--) {
    const brush: BrushId = asBrushId(r.int())
    l.push([brush, px(), py(), px(), py()])
  }

  const p: Level['p'] = []
  for (let i = count(r.int()); i > 0; i--) {
    p.push([px(), py(), px(), py(), px(), py(), px(), py()])
  }

  const g: Level['g'] = []
  for (let i = count(r.int()); i > 0; i--) {
    g.push([px(), py(), r.int()])
  }

  const w: Level['w'] = []
  for (let i = count(r.int()); i > 0; i--) {
    const x1 = px(), y1 = py(), x2 = px(), y2 = py()
    const strength = r.int() / WIND_STRENGTH_SCALE
    const kind = (r.int() === 1 ? 1 : 0) as WindKind
    w.push([x1, y1, x2, y2, strength, kind])
  }

  return { v: 1, r: rider, s: start, l, p, g, w }
}

/**
 * Snap a level to what a round-trip would produce.
 *
 * Anything drawn at sub-half-pixel precision is quantised the moment it is
 * shared, so the editor holds the quantised form from the start rather than
 * letting a level change under its author the first time they copy the link.
 */
export function quantiseLevel(level: Level): Level {
  return decodeLevel(encodeLevel(level))
}

// ── the share link ───────────────────────────────────────────────────────────

const HASH_KEY = 'l='

export function levelToHash(level: Level): string {
  return `#${HASH_KEY}${encodeLevel(level)}`
}

/** Pull a level out of a URL hash. Returns null for any hash that has none. */
export function levelFromHash(hash: string): Level | null {
  const i = hash.indexOf(HASH_KEY)
  if (i < 0) return null
  const encoded = hash.slice(i + HASH_KEY.length)
  if (encoded.length === 0) return null
  return decodeLevel(encoded)
}

/** As above, but a malformed link yields null instead of throwing. */
export function tryLevelFromHash(hash: string): Level | null {
  try {
    return levelFromHash(hash)
  } catch {
    return null
  }
}
