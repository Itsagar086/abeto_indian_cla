import * as THREE from "three"
import { buildProps, buildCorridors, corridorSurface } from "./props.js"

// item 7: parse the paint meshes (one per leg). Quads = 4 sequential verts.
const props = buildProps()
const meshes = buildCorridors(props)
const paintMeshes = meshes.filter((m) => m.key.endsWith("-paint"))
const asphaltMeshes = meshes.filter((m) => m.key.endsWith("-asphalt"))

let allRuns = []
let totalQuads = 0
let minSep = Infinity
for (const pm of paintMeshes) {
  const pos = pm.geometry.attributes.position
  const nQuads = pos.count / 4
  totalQuads += nQuads
  const quads = []
  for (let q = 0; q < nQuads; q++) {
    const v = []
    for (let k = 0; k < 4; k++)
      v.push(new THREE.Vector3(pos.getX(q * 4 + k), pos.getY(q * 4 + k), pos.getZ(q * 4 + k)))
    quads.push(v)
  }
  const keyOf = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`
  const startMap = new Map()
  for (let i = 0; i < quads.length; i++)
    startMap.set(keyOf(quads[i][0]) + "|" + keyOf(quads[i][1]), i)
  const nextOf = new Array(quads.length).fill(-1)
  const hasPrev = new Array(quads.length).fill(false)
  for (let i = 0; i < quads.length; i++) {
    const k = keyOf(quads[i][3]) + "|" + keyOf(quads[i][2])
    const j = startMap.get(k)
    if (j !== undefined && j !== i) { nextOf[i] = j; hasPrev[j] = true }
  }
  for (let i = 0; i < quads.length; i++) {
    if (hasPrev[i]) continue
    let len = 0, j = i
    while (j !== -1) {
      const v = quads[j]
      len += v[0].clone().add(v[1]).multiplyScalar(0.5)
        .distanceTo(v[3].clone().add(v[2]).multiplyScalar(0.5))
      j = nextOf[j]
    }
    allRuns.push(len)
  }
  // z-fight probe: paint vert height above the ride surface (== asphalt top
  // in the carriageway band) at the SAME direction — designed 0.06 everywhere
  for (let q = 0; q < quads.length; q += 5) {
    const p = quads[q][0]
    const cs = corridorSurface(p.clone().normalize())
    if (cs !== null) minSep = Math.min(minSep, p.length() - cs)
  }
}
allRuns.sort((a, b) => a - b)
const edges = allRuns.filter((r) => r > 3)
const dashes = allRuns.filter((r) => r <= 3)
console.log(`paint quads ${totalQuads}, runs ${allRuns.length}`)
console.log(`edge-line runs (>3u): ${edges.length}, total ${edges.reduce((s, r) => s + r, 0).toFixed(1)}u, longest ${edges[edges.length - 1]?.toFixed(1)}u`)
const dl = dashes
const med = dl[Math.floor(dl.length / 2)]
const full = dl.filter((x) => Math.abs(x - 0.55) < 0.06).length
console.log(`dashes: ${dl.length}, median ${med.toFixed(3)}u (nominal 0.55), within ±0.06: ${((full / dl.length) * 100).toFixed(1)}%, min ${dl[0].toFixed(3)}, max ${dl[dl.length - 1].toFixed(3)}`)
console.log(`paint-vs-asphalt radial separation (sampled min): ${minSep.toFixed(3)}u (designed 0.060)`)
