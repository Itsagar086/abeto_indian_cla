import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface } from "./props.js"

buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const d = new THREE.Vector3(), ah = new THREE.Vector3(), bh = new THREE.Vector3()
const spikes = []
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
    let prev = null, prevLat = 0
    for (let lat = 3.95; lat <= 6.8; lat += 0.1) {
      const pd = d.clone().addScaledVector(right, (sgn * lat) / raw).normalize()
      const sv = corridorSurface(pd)
      if (sv === null) break
      if (prev !== null) {
        const g = Math.abs(sv - prev) / 0.1
        if (g > 1.2) {
          // nearest zone for context
          let bz = "", bd = 9
          for (const z of ZONES) {
            const zd = new THREE.Vector3(...z.center).normalize().angleTo(pd)
            if (zd < bd) { bd = zd; bz = z.id }
          }
          spikes.push({ g, t: t.toFixed(3), lat: lat.toFixed(2), sgn, zone: bz, zoneAng: bd.toFixed(2) })
        }
      }
      prev = sv; prevLat = lat
    }
  }
}
spikes.sort((a, b) => b.g - a.g)
console.log(`${spikes.length} lateral steps >1.2 gradient`)
for (const s of spikes.slice(0, 12)) console.log(`  grad ${s.g.toFixed(2)} at t=${s.t} lat=${s.lat} sgn=${s.sgn} near ${s.zone} (${s.zoneAng} rad)`)
