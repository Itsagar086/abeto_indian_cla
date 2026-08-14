import * as THREE from "three"
import { buildProps, loopDir, metroStats, corridorSurface } from "./props.js"
import { terrainRadius } from "./terrain.js"

buildProps()
const stats = metroStats()
const st = stats.stations.find((s) => s.zone === "haveli")
const d = new THREE.Vector3()
let prev = null
for (let dt = -0.02; dt <= 0.02; dt += 0.0005) {
  loopDir(st.t + dt, d)
  const h = corridorSurface(d)
  const s = h === null ? "null" : h.toFixed(4)
  const dh = prev !== null && h !== null ? (h - prev).toFixed(4) : ""
  if (Math.abs(dt) < 0.004 || (dh && Math.abs(+dh) > 0.03))
    console.log(`dt=${dt.toFixed(4)} h=${s} step=${dh} raw=${terrainRadius(d).toFixed(3)}`)
  prev = h
}
