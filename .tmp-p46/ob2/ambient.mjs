import * as THREE from "three"
import { WATER_LEVEL } from "./data.js"
import { terrainRadius, slopeAt, loopAngle } from "./terrain.js"

// ambient rock fraction on dry land far from the loop (>12u), vs near band
let rockFar = 0, nFar = 0, rockNear = 0, nNear = 0
const d = new THREE.Vector3()
let s = 12345
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
for (let i = 0; i < 40000; i++) {
  d.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1)
  if (d.lengthSq() < 1e-4 || d.lengthSq() > 1) continue
  d.normalize()
  const r = terrainRadius(d)
  if (r < WATER_LEVEL + 1) continue
  const lat = loopAngle(d) * r
  const rock = slopeAt(d, r) > 0.55 ? 1 : 0
  if (lat > 12) { nFar++; rockFar += rock }
  else if (lat > 4.5 && lat < 8) { nNear++; rockNear += rock }
}
console.log(`ambient dry land >12u from loop: ${((rockFar / nFar) * 100).toFixed(1)}% rock (${nFar})`)
console.log(`band 4.5-8u from loop:          ${((rockNear / nNear) * 100).toFixed(1)}% rock (${nNear})`)
