/**
 * THREE.js placement utilities for the Dak Wala world.
 *
 * These functions place objects on the spherical planet surface.
 * They depend on THREE.js and on terrainRadius (from world/terrain).
 *
 * Contains:
 *   - surfacePoint      — world-space position on the planet surface
 *   - rng               — deterministic pseudo-random number generator
 *   - randomDirInCap    — random direction within an angular cone
 *   - surfaceQuaternion — orientation quaternion standing up on the surface
 */

import * as THREE from "three"
import { terrainRadius } from "../world/terrain"

/**
 * Returns a world-space position on the planet surface at `dir`,
 * lifted by `offset` units above the ground.
 */
export function surfacePoint(dir: THREE.Vector3, offset = 0): THREE.Vector3 {
  const r = terrainRadius(dir) + offset
  return dir.clone().multiplyScalar(r)
}

/**
 * Returns a deterministic pseudo-random number generator seeded by `seed`.
 * Each call to the returned function advances the sequence.
 */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Returns a random unit direction inside a spherical cap centred on `center`,
 * with maximum angular radius `maxAngle` (radians).
 * Distribution is uniform across the cap's solid angle.
 *
 * @param rand - a `() => number` in [0, 1) — use rng() to produce this
 */
export function randomDirInCap(
  center: THREE.Vector3,
  maxAngle: number,
  rand: () => number,
): THREE.Vector3 {
  const dir = center.clone().normalize()
  const tangent = new THREE.Vector3(0, 1, 0)
  if (Math.abs(dir.y) > 0.9) tangent.set(1, 0, 0)
  const t1 = new THREE.Vector3().crossVectors(tangent, dir).normalize()
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize()
  const a = rand() * Math.PI * 2
  const d = Math.sqrt(rand()) * maxAngle
  return dir
    .clone()
    .addScaledVector(t1, Math.cos(a) * Math.tan(d))
    .addScaledVector(t2, Math.sin(a) * Math.tan(d))
    .normalize()
}

/**
 * Returns a quaternion that rotates an object so that its local +Y axis
 * points away from the planet centre (i.e. "standing up" on the surface),
 * then applies an additional spin rotation around that axis.
 *
 * @param spin - rotation in radians around the surface normal
 */
export function surfaceQuaternion(dir: THREE.Vector3, spin: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  )
  return q.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin),
  )
}
