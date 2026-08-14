import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, bridgeReport } from "./props.js"

buildProps()
console.log("bridge spans:", JSON.stringify(bridgeReport(), null, 1))

// the failing point: samadhi-grove crossing, loop k=138 f=0.6 of N-grid
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const d0 = new THREE.Vector3(), d1 = new THREE.Vector3()
loopDir((138 / N) * total, d0)
loopDir((139 / N) * total, d1)
const p = d0.clone().lerp(d1, 0.6).normalize()
console.log("terrain at point:", terrainRadius(p).toFixed(2))

const byId = new Map(ZONES.map((z) => [z.id, z]))
for (const pair of [["samadhi", "grove"], ["workshop", "beach"]]) {
  const a = new THREE.Vector3(...byId.get(pair[0]).center).normalize()
  const b = new THREE.Vector3(...byId.get(pair[1]).center).normalize()
  const omega = a.angleTo(b)
  const n = new THREE.Vector3().crossVectors(a, b).normalize()
  const perp = b.clone().addScaledVector(a, -a.dot(b)).normalize()
  const t = Math.atan2(p.dot(perp), p.dot(a))
  const lat = Math.abs(Math.asin(Math.max(-1, Math.min(1, p.dot(n))))) * 34.9
  console.log(`${pair.join("-")}: omega ${omega.toFixed(3)}, point t ${t.toFixed(3)}, lateral ${lat.toFixed(2)}u`)
}
