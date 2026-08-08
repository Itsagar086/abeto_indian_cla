import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data"
import { surfacePoint, surfaceQuaternion, rng } from "./terrain"

export type PropKind =
  | "stall"
  | "haveli-arch"
  | "palace"
  | "temple-dome"
  | "mill-block"
  | "ghat-steps"
  | "mango-tree"
  | "banyan"
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

/** props whose colours belong to the object itself, not to its zone palette */
const KIND_COLORS: Partial<Record<PropKind, [string, string]>> = {
  banyan: ["#6b4a2f", "#4e7a34"],
  palace: ["#e8dcc0", "#8a4a3a"],
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
    // a pure angular offset in radians. zone.radius is a world-unit value and
    // must never enter here — multiplying by it flung props tens of degrees
    // away from the zone they belong to (BUG-102).
    const dist = distFrac * 0.05
    const dir = center
      .clone()
      .addScaledVector(t1, Math.cos(ang) * dist)
      .addScaledVector(t2, Math.sin(ang) * dist)
      .normalize()
    const pos = surfacePoint(dir, 0)
    const quat = surfaceQuaternion(dir, ang + Math.PI)
    const [a, b] = KIND_COLORS[kind] ?? paletteFor(zoneId, rng(seed))
    if (pos.length() < WATER_LEVEL + 0.3) return
    props.push({ kind, position: pos, quaternion: quat, scale, colorA: a, colorB: b, seed })
  }

  // --- bazaar: market stalls ringed around the square, with umbrellas
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2
    add("stall", "bazaar", ang, 1.4, 1, 100 + i)
    add("market-umbrella", "bazaar", ang + 0.15, 1.8, 1, 200 + i)
  }
  add("lamp-post", "bazaar", 0.4, 0.6, 1, 150)
  add("lamp-post", "bazaar", 2.4, 0.6, 1, 151)
  add("flag", "bazaar", 1.0, 0.3, 1, 152)

  // --- haveli: Bengaluru Palace behind a gated approach, all on one bearing
  add("palace", "haveli", 0, 0.3, 1.6, 300)
  // gate on the SAME bearing (angle 0) as the palace, nearer and deliberately
  // shorter than its towers, with the lamps flanking the approach
  add("haveli-arch", "haveli", 0, 1.1, 1.0, 301)
  add("lamp-post", "haveli", 0.2, 1.0, 1, 302)
  add("lamp-post", "haveli", -0.2, 1.0, 1, 303)
  add("flag", "haveli", 0.05, 0.25, 1.1, 304)

  // --- mill: rows of factory blocks
  // evenly around the full circle — clustering them in one arc made the 2.2u
  // wide blocks intersect each other
  const millAngles = [0, 1.047, 2.094, 3.142, 4.189, 5.236]
  millAngles.forEach((a, i) => add("mill-block", "mill", a, 2.0, 1.3, 400 + i))

  // --- workshop: single shed + parts
  add("workshop-shed", "workshop", 0, 0.6, 1.2, 500)
  add("lamp-post", "workshop", 1.4, 1.2, 1, 501)

  // --- temple: dome + flags on the summit
  add("temple-dome", "temple", 0, 0.3, 1.8, 600)
  // pushed clear of the dome's ~2.7u footprint
  add("flag", "temple", 0.9, 2.0, 1.3, 601)
  add("flag", "temple", -0.9, 2.0, 1.3, 602)

  // --- ghat: stepped stone terraces down to the water
  for (let i = 0; i < 6; i++) {
    add("ghat-steps", "ghat", (i / 6) * Math.PI * 2, 1.2, 1, 700 + i)
  }

  // --- grove: Dodda Alada Mara is ONE tree — a single giant banyan at the
  // centre, with a few small companions out at the fringe of its canopy
  add("banyan", "grove", 0, 0.15, 2.6, 800)
  const groveCompanions = [0.4, 1.6, 2.7, 3.9, 5.1]
  groveCompanions.forEach((a, i) => add("mango-tree", "grove", a, 2.2, 0.7, 801 + i))

  // --- samadhi: peepal trees + quiet stone markers
  for (let i = 0; i < 5; i++) {
    add("peepal-tree", "samadhi", (i / 5) * Math.PI * 2, 1.2, 1.4, 900 + i)
  }

  // --- beach: a couple of leaning palms via mango-tree reuse, thin scale
  const beach = rng(77)
  for (let i = 0; i < 6; i++) {
    add("mango-tree", "beach", beach() * Math.PI * 2, 0.8 + beach() * 1.0, 0.6, 1000 + i)
  }

  return props
}
