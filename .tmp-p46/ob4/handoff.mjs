import * as THREE from "three"
import { WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface, bridgeSurface, groundOrDeck } from "./props.js"

buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const dirs = [], raws = []
{
  const d = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    loopDir((i / N) * total, d)
    dirs.push(d.clone()); raws.push(terrainRadius(d))
  }
}
const wet = raws.map((r) => r < WATER_LEVEL + 0.48)
const spans = []
let i = 0
while (i < N) {
  if (wet[i]) { let j = i; while (j < N && wet[j]) j++; spans.push([i, j]); i = j } else i++
}
for (const [a, b] of spans) {
  let worst = 0, at = null
  for (let k = a - 10; k < b + 10; k++) {
    const i0 = ((k % N) + N) % N, i1 = (((k + 1) % N) + N) % N
    let prev = null, prevf = 0
    for (let f = 0; f <= 1.001; f += 0.2) {
      const d = dirs[i0].clone().lerp(dirs[i1], f).normalize()
      const h = groundOrDeck(d)
      if (prev !== null && Math.abs(h - prev) > worst) {
        worst = Math.abs(h - prev); at = { k, f, d: d.clone() }
      }
      prev = h
    }
  }
  console.log(`span ${a}-${b}: worst ${worst.toFixed(3)} at k=${at.k} f=${at.f.toFixed(1)}`)
  // dissect surfaces both sides of the worst step
  for (const df of [-0.2, 0]) {
    const i0 = (((at.k) % N) + N) % N, i1 = (((at.k + 1) % N) + N) % N
    const d = dirs[i0].clone().lerp(dirs[i1], at.f + df).normalize()
    const cs = corridorSurface(d), bs = bridgeSurface(d), tr = terrainRadius(d)
    console.log(`  f=${(at.f + df).toFixed(1)}: corridor ${cs === null ? "null" : cs.toFixed(2)}  bridge ${bs === null ? "null" : bs.toFixed(2)}  terrain ${tr.toFixed(2)}  god ${groundOrDeck(d).toFixed(2)}`)
  }
}
