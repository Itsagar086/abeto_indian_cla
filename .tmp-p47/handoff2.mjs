import * as THREE from "three"
import { WATER_LEVEL } from "./data.js"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, groundOrDeck } from "./props.js"

buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const dirs = [], raws = []
{
  const d = new THREE.Vector3()
  for (let i = 0; i < N; i++) { loopDir((i / N) * total, d); dirs.push(d.clone()); raws.push(terrainRadius(d)) }
}
const wet = raws.map((r) => r < WATER_LEVEL + 0.48)
const spans = []
let i = 0
while (i < N) {
  if (wet[i]) { let j = i; while (j < N && wet[j]) j++; spans.push([i, j]); i = j } else i++
}
// fine scan: step 0.006u — a discontinuity keeps its size, a grade shrinks 20x
for (const [a, b] of spans) {
  let disc = 0, discAt = 0, maxGrade = 0
  for (let k = a - 12; k < b + 12; k++) {
    const i0 = ((k % N) + N) % N, i1 = (((k + 1) % N) + N) % N
    let prev = null
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const d = dirs[i0].clone().lerp(dirs[i1], f).normalize()
      const h = groundOrDeck(d)
      if (prev !== null) {
        const dh = Math.abs(h - prev)
        if (dh > disc) { disc = dh; discAt = k + f }
        maxGrade = Math.max(maxGrade, dh / 0.006)
      }
      prev = h
    }
  }
  console.log(`span ${a}-${b}: worst per-0.006u jump ${disc.toFixed(3)}u at k=${discAt.toFixed(2)} (grade-equivalent ${(disc / 0.006).toFixed(1)})`)
}
