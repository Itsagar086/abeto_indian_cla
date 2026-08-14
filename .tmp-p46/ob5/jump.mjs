import * as THREE from "three"
import { terrainRadius } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface, bridgeSurface, groundOrDeck } from "./props.js"

buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const d0 = new THREE.Vector3(), d1 = new THREE.Vector3()
for (const [k, f0, f1] of [[101, 0.25, 0.45], [357, 0.05, 0.3]]) {
  console.log(`--- k=${k} ---`)
  loopDir((k / N) * total, d0)
  loopDir(((k + 1) / N) * total, d1)
  for (let f = f0; f <= f1 + 1e-9; f += 0.02) {
    const d = d0.clone().lerp(d1, f).normalize()
    const cs = corridorSurface(d), bs = bridgeSurface(d), tr = terrainRadius(d)
    console.log(`f=${f.toFixed(2)}: corridor ${cs === null ? "  null" : cs.toFixed(3)}  bridge ${bs === null ? "  null" : bs.toFixed(3)}  terrain ${tr.toFixed(3)}  god ${groundOrDeck(d).toFixed(3)}`)
  }
}
