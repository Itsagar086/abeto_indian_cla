import * as THREE from "three"
import { buildProps, metroStats } from "./props.js"

const props = buildProps()
const total = metroStats().total
const pillars = props.filter((p) => p.kind === "metro-pillar")
const tracks = props.filter((p) => p.kind === "metro-track")
console.log(`pillars ${pillars.length}, track segments ${tracks.length}`)
// unsupported runs: track midpoints with no pillar within 0.06 rad angularly
const pDirs = pillars.map((p) => p.position.clone().normalize())
let unsupported = 0, maxRun = 0, run = 0
for (const tr of tracks) {
  const d = tr.position.clone().normalize()
  const near = pDirs.some((pd) => pd.angleTo(d) < 0.06)
  if (!near) { unsupported++; run++; maxRun = Math.max(maxRun, run) } else run = 0
}
console.log(`track segments with no pillar within 0.06 rad: ${unsupported}, longest consecutive run ${maxRun} (~${(maxRun * total / tracks.length * 29).toFixed(1)}u)`)
