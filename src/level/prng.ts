/**
 * The decoration PRNG.
 *
 * This drives parallax tree placement and ink wobble and *nothing else*. It
 * lives outside `sim/` deliberately: the simulation may never touch it, and
 * check-determinism.mjs asserts that a run is bit-identical with this stubbed
 * out entirely.
 *
 * `Math.random` appears nowhere in this project.
 */

/** FNV-1a over a string. Stable across engines — integer arithmetic only. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    // The classic 16777619 multiply, via shifts, to stay in 32-bit range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/** mulberry32. Small, fast, and good enough for scattering trees. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The decoration generator for an encoded level string. */
export function decorRng(encoded: string): () => number {
  return mulberry32(fnv1a(encoded))
}
