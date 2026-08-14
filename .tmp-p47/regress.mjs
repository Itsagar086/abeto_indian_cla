import * as THREE from "three"
import { NPCS, ZONES, WATER_LEVEL } from "./data.js"
import { terrainRadius, roadDistance } from "./terrain.js"
import {
  buildProps, buildCorridors, metroStats, loopDir,
  corridorSurface, groundOrDeck, civicPlotReport, colliderStats,
} from "./props.js"

// [road] console block prints during buildCorridors — leave it visible
const props = buildProps()
const meshes = buildCorridors(props)
const stats = metroStats()
const total = stats.total
const N = Math.ceil(total / 0.015)

// 1. punch-through: drawn ride surface below natural terrain (carriageway band)
{
  let below = 0, n = 0, worst = 0
  const d = new THREE.Vector3(), ah = new THREE.Vector3(), bh = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const t = (i / N) * total
    loopDir(t, d)
    const raw = terrainRadius(d)
    if (raw < WATER_LEVEL + 0.48) continue
    loopDir(t + 0.004, ah); loopDir(t - 0.004, bh)
    const f = ah.clone().sub(bh); f.addScaledVector(d, -f.dot(d))
    if (f.lengthSq() < 1e-12) continue
    const right = new THREE.Vector3().crossVectors(f.normalize(), d).normalize()
    for (const lat of [-3, -1.85, 0, 1.85, 3]) {
      const pd = d.clone().addScaledVector(right, lat / raw).normalize()
      const sv = corridorSurface(pd)
      if (sv === null) continue
      n++
      const gap = sv - terrainRadius(pd)
      if (gap < -0.005) { below++; worst = Math.min(worst, gap) }
    }
  }
  console.log(`punch-through: ${below}/${n} probes below ground (${((below / n) * 100).toFixed(2)}%), worst ${worst.toFixed(3)}u`)
}

// 2. mesh-vs-ride parity: asphalt verts vs corridorSurface at same dir
{
  let worst = 0, n = 0
  for (const am of meshes.filter((x) => x.key.endsWith("-asphalt"))) {
    const pos = am.geometry.attributes.position
    for (let i = 0; i < pos.count; i += 9) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
      const sv = corridorSurface(v.clone().normalize())
      if (sv === null) continue
      n++
      worst = Math.max(worst, Math.abs(v.length() - sv))
    }
  }
  console.log(`mesh-vs-ride parity: ${n} asphalt verts sampled, worst |mesh - ride| ${worst.toFixed(3)}u`)
}

// 3. triangles
{
  let tris = 0
  for (const m2 of meshes) tris += m2.geometry.index ? m2.geometry.index.count / 3 : 0
  console.log(`corridor triangles: ${tris}`)
}

// 4. plots
{
  const rep = civicPlotReport()
  console.log(`civic plots ok: ${rep.filter((p) => p.ok).length}/${rep.length} (${rep.map((p) => `${p.id}${p.ok ? "" : "❌"}`).join(", ")})`)
}

// 5. scatter on roads: props standing inside the corridor's surfaced band
{
  const KINDS_ON_ROAD = new Set()
  let count = 0
  for (const p of props) {
    if (["metro-pillar", "metro-track", "metro-station", "bridge-deck", "bridge-rail", "bridge-pier", "civic-pad", "wire", "traffic-signal"].includes(p.kind)) continue
    const d = p.position.clone().normalize()
    const sv = corridorSurface(d)
    if (sv === null) continue
    // inside the surfaced width? corridorSurface extends to the shoulder; use
    // height correspondence: props on the carriageway would sit at/below surface
    if (p.position.length() < sv + 0.01) { count++; KINDS_ON_ROAD.add(p.kind) }
  }
  console.log(`props buried under the drawn corridor surface: ${count} (${[...KINDS_ON_ROAD].join(", ") || "none"})`)
}

// 6. prop census
{
  const byKind = new Map()
  for (const p of props) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1)
  console.log("census:", [...byKind.entries()].sort().map(([k, v]) => `${k}:${v}`).join(" "))
  console.log(`total props: ${props.length}`)
}

// 7. colliders
console.log("colliders:", JSON.stringify(colliderStats?.() ?? "n/a"))

// 8. NPC standing check: no NPC below ground or floating
{
  let bad = 0
  for (const npc of NPCS) {
    const d = new THREE.Vector3(...npc.position).normalize()
    const g = groundOrDeck(d)
    const r = new THREE.Vector3(...npc.position).length()
    if (Math.abs(g - terrainRadius(d)) > 2.5) bad++ // stands on something 2.5u above terrain?
  }
  console.log(`npcs standing on strongly-raised surface: ${bad}`)
}
