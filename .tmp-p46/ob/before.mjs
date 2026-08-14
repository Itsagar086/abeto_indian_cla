import * as THREE from "three"
import { NPCS, ZONES, WATER_LEVEL } from "./data.js"
import { terrainRadius, slopeAt } from "./terrain.js"
import { buildProps, loopDir, metroStats, corridorSurface, groundOrDeck, ARTERIAL_PAIRS } from "./props.js"

const O = []
const props = buildProps()
const stats = metroStats()
const total = stats.total
const N = Math.ceil(total / 0.015)
const dirs = [], rights = [], raws = []
{
  const d = new THREE.Vector3(), ah = new THREE.Vector3(), bh = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const t = (i / N) * total
    loopDir(t, d); loopDir(t + 0.004, ah); loopDir(t - 0.004, bh)
    dirs.push(d.clone()); raws.push(terrainRadius(d))
    const f = ah.clone().sub(bh); f.addScaledVector(d, -f.dot(d))
    rights.push(f.lengthSq() < 1e-12 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3().crossVectors(f.normalize(), d).normalize())
  }
}
const tOf = new Map(stats.stations.map((s) => [s.zone, s.t]))
const legOf = (i) => {
  const t = (i / N) * total
  for (const [a, b] of ARTERIAL_PAIRS) {
    const tA = tOf.get(a), tB = tOf.get(b)
    const span = (((tB - tA) % total) + total) % total
    const off = (((t - tA) % total) + total) % total
    if (off <= span) return `${a}-${b}`
  }
  return "?"
}

O.push("1. EDGE GAP — drawn surface/shoulder edge vs natural terrain beneath (BEFORE)")
for (const lat of [3.95, 5.55]) {
  const gaps = []
  const byLeg = new Map()
  for (let i = 0; i < N; i++) {
    if (raws[i] < WATER_LEVEL + 0.48) continue
    for (const sgn of [1, -1]) {
      const pd = dirs[i].clone().addScaledVector(rights[i], (sgn * lat) / raws[i]).normalize()
      const sv = corridorSurface(pd)
      if (sv === null) continue
      const gap = sv - terrainRadius(pd)
      gaps.push(gap)
      const leg = legOf(i)
      byLeg.set(leg, Math.max(byLeg.get(leg) ?? 0, gap))
    }
  }
  gaps.sort((a, b) => a - b)
  const q = (f) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * f))]
  O.push(`   lateral ${lat}u: ${gaps.length} probes — max ${gaps[gaps.length - 1].toFixed(2)}u  p90 ${q(0.9).toFixed(2)}u  med ${q(0.5).toFixed(2)}u`)
  const worst = [...byLeg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  O.push(`     worst legs: ${worst.map(([k, v]) => `${k} ${v.toFixed(2)}u`).join(", ")}`)
}

O.push("")
O.push("2b. ROCK STRIPES — slopeAt in the band beside the road (4.5-8u lateral)")
{
  let rock = 0, n = 0
  for (let i = 0; i < N; i += 2) {
    if (raws[i] < WATER_LEVEL + 1) continue
    for (const sgn of [1, -1]) for (const lat of [5, 6, 7]) {
      const pd = dirs[i].clone().addScaledVector(rights[i], (sgn * lat) / raws[i]).normalize()
      const r = terrainRadius(pd)
      if (r < WATER_LEVEL + 1) continue
      n++
      if (slopeAt(pd, r) > 0.55) rock++
    }
  }
  O.push(`   ${((rock / n) * 100).toFixed(1)}% of ${n} probes are rock-branch (slope > 0.55)`)
}

O.push("")
O.push("4. BRIDGE HANDOFF (BEFORE) — biggest walkable-surface step near each span")
{
  const wet = raws.map((r) => r < WATER_LEVEL + 0.48)
  // group wet runs into spans, measure max groundOrDeck substep within +-10 samples
  const seen = []
  let i = 0
  while (i < N) {
    if (wet[i]) {
      let j = i
      while (j < N && wet[j]) j++
      seen.push([i, j])
      i = j
    } else i++
  }
  for (const [a, b] of seen) {
    let worst = 0
    for (let k = a - 10; k < b + 10; k++) {
      const i0 = ((k % N) + N) % N, i1 = (((k + 1) % N) + N) % N
      let prev = null
      for (let f = 0; f <= 1; f += 0.2) {
        const d = dirs[i0].clone().lerp(dirs[i1], f).normalize()
        const h = groundOrDeck(d)
        if (prev !== null) worst = Math.max(worst, Math.abs(h - prev))
        prev = h
      }
    }
    O.push(`   wet span at ${legOf(a)} (samples ${a}-${b}): worst step ${worst.toFixed(3)}u`)
  }
}

O.push("")
O.push("5. FLOATING PROPS — base sitting above the surface beneath it (BEFORE)")
{
  const rows = []
  for (const p of props) {
    if (p.kind === "wire") continue
    const d = p.position.clone().normalize()
    const surf = groundOrDeck(d)
    const gap = p.position.length() - surf
    if (gap > 0.35) rows.push({ gap, s: `${p.kind}(${p.seed}) floats ${gap.toFixed(2)}u` })
  }
  rows.sort((a, b) => b.gap - a.gap)
  const byKind = new Map()
  for (const r of rows) {
    const k = r.s.split("(")[0]
    byKind.set(k, (byKind.get(k) ?? 0) + 1)
  }
  O.push(`   ${rows.length} props float >0.35u: ${[...byKind.entries()].map(([k, v]) => `${k} x${v}`).join(", ") || "none"}`)
  for (const r of rows.slice(0, 8)) O.push(`     ${r.s}`)
}
console.log(O.join("\n"))
