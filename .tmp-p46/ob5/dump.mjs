import * as THREE from "three"
import { buildProps, loopDir, metroStats, rideSamples } from "./props.js"

buildProps()
const total = metroStats().total
const N = Math.ceil(total / 0.015)
const d0 = new THREE.Vector3(), d1 = new THREE.Vector3()
loopDir((101 / N) * total, d0)
loopDir((102 / N) * total, d1)
const p = d0.clone().lerp(d1, 0.32).normalize()
const samples = rideSamples()
const near = samples
  .map((s, i) => ({ i, s, ang: s.dir.angleTo(p) }))
  .filter((x) => x.ang < 0.06)
  .sort((a, b) => a.ang - b.ang)
for (const x of near.slice(0, 10))
  console.log(`sample[${x.i}] leg=${x.s.leg} ang=${(x.ang * 29).toFixed(2)}u ground=${x.s.ground.toFixed(3)} dry=${x.s.dry}`)
console.log("stations:", metroStats().stations.map((s) => `${s.zone}@${s.t.toFixed(3)}`).join(" "))
console.log("query t equiv:", ((101.32 / N) * total).toFixed(3))
