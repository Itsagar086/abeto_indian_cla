import * as THREE from "three"
import { WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface } from "./props.js"

// item 3: embankment slope + reach census along the loop
buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const d = new THREE.Vector3(), ah = new THREE.Vector3(), bh = new THREE.Vector3()
let maxGrad = 0, engaged = 0, beyondSkirt = 0, atCap = 0, sides = 0
let maxReach = 0
for (let i = 0; i < N; i++) {
  const t = (i / N) * total
  loopDir(t, d)
  const raw = terrainRadius(d)
  if (raw < WATER_LEVEL + 0.48) continue
  loopDir(t + 0.004, ah); loopDir(t - 0.004, bh)
  const f = ah.clone().sub(bh); f.addScaledVector(d, -f.dot(d))
  if (f.lengthSq() < 1e-12) continue
  const right = new THREE.Vector3().crossVectors(f.normalize(), d).normalize()
  for (const sgn of [1, -1]) {
    sides++
    // walk outward from footpath edge; measure gradient and where surface ends
    let prev = null
    let reachEnd = 3.95
    for (let lat = 3.95; lat <= 6.8; lat += 0.1) {
      const pd = d.clone().addScaledVector(right, (sgn * lat) / raw).normalize()
      const sv = corridorSurface(pd)
      if (sv === null) break
      reachEnd = lat
      if (prev !== null) maxGrad = Math.max(maxGrad, Math.abs(sv - prev) / 0.1)
      prev = sv
    }
    const reach = reachEnd - 3.95
    maxReach = Math.max(maxReach, reach)
    if (reach > 1.65) engaged++
    if (3.95 + reach > 5.56) beyondSkirt++
    if (reach > 2.75) atCap++
  }
}
console.log(`sides probed ${sides}: max embankment gradient ${maxGrad.toFixed(2)} (1:2 = 0.50 avg, smoothstep mid ~0.75x drop/reach)`)
console.log(`reach > nominal 1.6u on ${engaged} sides (${((engaged / sides) * 100).toFixed(1)}%), max reach ${maxReach.toFixed(2)}u`)
console.log(`reach beyond old SKIRT_OUT 5.55 on ${beyondSkirt} sides (${((beyondSkirt / sides) * 100).toFixed(1)}%), at 2.8u cap on ${atCap}`)
