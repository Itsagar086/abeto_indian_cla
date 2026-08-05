/**
 * Pure math utilities for terrain generation.
 *
 * These functions have zero dependencies — they are pure number-in, number-out.
 * They can be tested, replaced, or reused in other contexts without touching
 * any game, world, or rendering code.
 *
 * Contains:
 *   - hash3       — deterministic integer hash → float in [0, 1]
 *   - smooth      — cubic smoothstep (Ken Perlin's improved variant)
 *   - valueNoise  — 3-D trilinear lattice noise
 *   - fbm         — fractional Brownian motion (multi-octave noise sum)
 */

/** Deterministic float hash for three integer coordinates. Range: [0, 1]. */
function hash3(x: number, y: number, z: number): number {
  let h = x * 374761393 + y * 668265263 + z * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Cubic smoothstep: f(0)=0, f(1)=1, zero first derivative at endpoints. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 3-D value noise via trilinear interpolation over a hash lattice. Range: [-1, 1]. */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const zf = smooth(z - zi)
  let n = 0
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const w =
          (i ? xf : 1 - xf) * (j ? yf : 1 - yf) * (k ? zf : 1 - zf)
        n += w * hash3(xi + i, yi + j, zi + k)
      }
    }
  }
  return n * 2 - 1
}

/**
 * Fractional Brownian motion — layered multi-octave value noise.
 *
 * @param x, y, z  - 3-D input coordinates
 * @param octaves  - number of frequency layers (more = finer detail)
 * @returns        - noise value in approximately [-1, 1]
 */
export function fbm(x: number, y: number, z: number, octaves = 4): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2.07
  }
  return sum / norm
}
