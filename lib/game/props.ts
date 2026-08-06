import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data"
import { surfacePoint, surfaceQuaternion, rng } from "./terrain"

export type PropKind =
  | "stall"
  | "haveli-arch"
  | "temple-dome"
  | "mill-block"
  | "ghat-steps"
  | "mango-tree"
  | "workshop-shed"
  | "market-umbrella"
  | "peepal-tree"
  | "lamp-post"
  | "flag"

export type PlacedProp = {
  kind: PropKind
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
  colorA: string
  colorB: string
  seed: number
}

const PALETTE: Record<string, [string, string][]> = {
  bazaar: [
    ["#d97b3a", "#f2d9a8"],
    ["#c25959", "#f2e6d0"],
    ["#3f7f8c", "#f2e6d0"],
    ["#9c6ea0", "#f2e6d0"],
  ],
  haveli: [["#c9a876", "#8a5a3a"]],
  mill: [["#9a8a6a", "#5a5044"]],
  workshop: [["#7a7264", "#4a4438"]],
  temple: [["#e8d9a8", "#c9973a"]],
  ghat: [["#c9b48f", "#8a7355"]],
  grove: [["#5e8339", "#3f5c26"]],
  samadhi: [["#c9b48f", "#7a6a52"]],
  beach: [["#e0c191", "#c9a876"]],
}

function paletteFor(zoneId: string, r: () => number): [string, string] {
  const options = PALETTE[zoneId] ?? PALETTE.bazaar
  return options[Math.floor(r() * options.length) % options.length]
}

export function buildProps(): PlacedProp[] {
  const props: PlacedProp[] = []
  const byId = new Map(ZONES.map((z) => [z.id, z]))

  const add = (
    kind: PropKind,
    zoneId: string,
    angleOffset: number,
    distFrac: number,
    scale: number,
    seed: number,
  ) => {
    const zone = byId.get(zoneId)
    if (!zone) return
    const center = new THREE.Vector3(...zone.center).normalize()
    const tangent = new THREE.Vector3(0, 1, 0)
    if (Math.abs(center.y) > 0.9) tangent.set(1, 0, 0)
    const t1 = new THREE.Vector3().crossVectors(tangent, center).normalize()
    const t2 = new THREE.Vector3().crossVectors(center, t1).normalize()
    const ang = angleOffset
    const dist = distFrac * zone.radius * 0.045
    const dir = center
      .clone()
      .addScaledVector(t1, Math.cos(ang) * dist)
      .addScaledVector(t2, Math.sin(ang) * dist)
      .normalize()
    const pos = surfacePoint(dir, 0)
    const quat = surfaceQuaternion(dir, ang + Math.PI)
    const [a, b] = paletteFor(zoneId, rng(seed))
    if (pos.length() < WATER_LEVEL + 0.3) return
    props.push({ kind, position: pos, quaternion: quat, scale, colorA: a, colorB: b, seed })
  }

  // --- bazaar: market stalls ringed around the square, with umbrellas
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2
    add("stall", "bazaar", ang, 1.6, 1, 100 + i)
    add("market-umbrella", "bazaar", ang + 0.15, 1.9, 1, 200 + i)
  }
  add("lamp-post", "bazaar", 0.4, 0.6, 1, 150)
  add("lamp-post", "bazaar", 2.4, 0.6, 1, 151)
  add("flag", "bazaar", 1.0, 0.3, 1, 152)

  // --- haveli: grand arch entrance + walls
  add("haveli-arch", "haveli", 0, 0.9, 1.6, 300)
  add("lamp-post", "haveli", 0.6, 1.3, 1, 301)
  add("lamp-post", "haveli", -0.6, 1.3, 1, 302)
  add("flag", "haveli", 0, 1.7, 1.2, 303)

  // --- mill: rows of factory blocks
  const millAngles = [0, 0.5, 1.0, 1.6, 2.2, 2.8]
  millAngles.forEach((a, i) => add("mill-block", "mill", a, 1.3 + (i % 2) * 0.3, 1.3, 400 + i))

  // --- workshop: single shed + parts
  add("workshop-shed", "workshop", 0, 0.6, 1.2, 500)
  add("lamp-post", "workshop", 1.4, 1.2, 1, 501)

  // --- temple: dome + flags on the summit
  add("temple-dome", "temple", 0, 0.2, 1.8, 600)
  add("flag", "temple", 0.9, 0.9, 1.3, 601)
  add("flag", "temple", -0.9, 0.9, 1.3, 602)

  // --- ghat: stepped stone terraces down to the water
  for (let i = 0; i < 6; i++) {
    add("ghat-steps", "ghat", (i / 6) * Math.PI * 2, 1.2, 1, 700 + i)
  }

  // --- grove: mango trees scattered
  const grove = rng(42)
  for (let i = 0; i < 16; i++) {
    add("mango-tree", "grove", grove() * Math.PI * 2, 0.3 + grove() * 1.6, 0.8 + grove() * 0.5, 800 + i)
  }

  // --- samadhi: peepal trees + quiet stone markers
  for (let i = 0; i < 5; i++) {
    add("peepal-tree", "samadhi", (i / 5) * Math.PI * 2, 1.3, 1.4, 900 + i)
  }

  // --- beach: a couple of leaning palms via mango-tree reuse, thin scale
  const beach = rng(77)
  for (let i = 0; i < 6; i++) {
    add("mango-tree", "beach", beach() * Math.PI * 2, 0.5 + beach() * 1.3, 0.6, 1000 + i)
  }

  return props
}
