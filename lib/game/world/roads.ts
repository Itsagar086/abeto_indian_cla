/**
 * Road definitions for the Dak Wala world.
 *
 * Edit the `pairs` array to change which zones are connected by roads,
 * and the `width` values to change how wide each road appears on the terrain.
 * No logic changes are needed when adding or removing road connections.
 *
 * Road width is a normalised value: 1.0 = standard width (0.045 radians on the sphere).
 */

import * as THREE from "three"
import { ZONES } from "../data/zones"

type Road = {
  a: THREE.Vector3   // normalised direction to zone A
  b: THREE.Vector3   // normalised direction to zone B
  n: THREE.Vector3   // normal to the great-circle plane of the road arc
  width: number      // road half-width multiplier
}

/**
 * Zone connection list.
 * Each entry is [zoneIdA, zoneIdB, width?].
 * Width defaults to 0.8 if omitted.
 *
 * Edit this data to add, remove, or resize roads.
 */
const ROAD_PAIRS: [string, string, number?][] = [
  ["bazaar",  "beach",    0.9],
  ["beach",   "temple",   0.7],
  ["bazaar",  "samadhi",  0.85],
  ["samadhi", "ghat",     0.8],
  ["ghat",    "grove",    0.8],
  ["grove",   "workshop", 0.7],
  ["grove",   "mill",     0.85],
  ["mill",    "ghat",     0.8],
  ["haveli",  "bazaar",   0.9],
  ["haveli",  "grove",    0.75],
  ["bazaar",  "ghat",     0.8],
]

function buildRoads(): Road[] {
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const roads: Road[] = []
  for (const [x, y, w] of ROAD_PAIRS) {
    const za = byId.get(x)
    const zb = byId.get(y)
    if (!za || !zb) continue
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const n = new THREE.Vector3().crossVectors(a, b).normalize()
    roads.push({ a, b, n, width: w ?? 0.8 })
  }
  return roads
}

const ROADS = buildRoads()

// Scratch vector — reused across frames to avoid allocations
const _rv = new THREE.Vector3()

/**
 * Returns the normalised angular distance (0 = on road, >1 = off road)
 * from a unit direction vector to the nearest road arc.
 */
export function roadDistance(dir: THREE.Vector3): number {
  let best = 9
  for (const road of ROADS) {
    const along = _rv.copy(dir).projectOnPlane(road.n)
    if (along.lengthSq() < 1e-8) continue
    along.normalize()
    const ab = road.a.dot(road.b)
    // Is the projected point inside the arc segment?
    const inside =
      along.dot(road.a) >= ab - 1e-4 &&
      along.dot(road.b) >= ab - 1e-4
    let d: number
    if (inside) {
      d = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(road.n)))))
    } else {
      d = Math.min(dir.angleTo(road.a), dir.angleTo(road.b))
    }
    const norm = d / (road.width * 0.045)
    if (norm < best) best = norm
  }
  return best
}
