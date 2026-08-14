import * as THREE from "three"
import { WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface } from "./props.js"

buildProps()
const stats = metroStats()
const total = stats.total
// worst corridor height step crossing each station seam, fine-grained
const d = new THREE.Vector3()
let worst = 0, worstAt = ""
for (const st of stats.stations) {
  let prev = null, w = 0
  for (let dt = -0.02; dt <= 0.02; dt += 0.0005) {
    loopDir(st.t + dt, d)
    if (terrainRadius(d) < WATER_LEVEL + 0.48) { prev = null; continue }
    const h = corridorSurface(d)
    if (h === null) { prev = null; continue }
    if (prev !== null) w = Math.max(w, Math.abs(h - prev))
    prev = h
  }
  if (w > worst) { worst = w; worstAt = st.zone }
  console.log(`station ${st.zone}: worst step across seam ${w.toFixed(4)}u`)
}
console.log(`WORST: ${worst.toFixed(4)}u at ${worstAt} (was 0.0318u before the whole-loop profile)`)
