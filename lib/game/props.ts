import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data"
import { surfacePoint, surfaceQuaternion, rng, roadDistance } from "./terrain"

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
  | "guardrail"
  | "utility-pole"
  | "grass-tuft"
  | "wire"
  | "traffic-signal"

export type PlacedProp = {
  kind: PropKind
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
  colorA: string
  colorB: string
  seed: number
  /** world-space endpoints. Only "wire" uses this, and it ignores `position`. */
  aux?: [THREE.Vector3, THREE.Vector3]
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
  guardrail: ["#f2f0e8", "#d8d5cb"],
  "utility-pole": ["#6a5a48", "#4d4136"],
  "grass-tuft": ["#7dbb5a", "#5f9444"],
  wire: ["#2a2a2a", "#1e1e1e"],
  "traffic-signal": ["#2f2b26", "#1d1a17"],
}

function paletteFor(zoneId: string, r: () => number): [string, string] {
  const options = PALETTE[zoneId] ?? PALETTE.bazaar
  return options[Math.floor(r() * options.length) % options.length]
}

/**
 * The same zone pairs buildRoads() arcs between in terrain.ts. Re-declared here
 * rather than imported because that list is module-private there; if it ever
 * changes, this must change with it.
 */
export const ROAD_PAIRS: [string, string][] = [
  ["bazaar", "beach"],
  ["beach", "temple"],
  ["bazaar", "samadhi"],
  ["samadhi", "ghat"],
  ["ghat", "grove"],
  ["grove", "workshop"],
  ["grove", "mill"],
  ["mill", "ghat"],
  ["haveli", "bazaar"],
  ["haveli", "grove"],
  ["bazaar", "ghat"],
]

const ROAD_STEP = 0.06
const RAIL_OFFSET = 0.055
const POLE_OFFSET = 0.07
/** minimum roadDistance any furniture must keep from every road ribbon */
const RIBBON_CLEAR = 1.15
/**
 * Wires only span adjacent poles this close — a longer gap means a pole was
 * rejected in between, and a wire across it would cut through terrain.
 *
 * Poles sit 4 steps apart (0.24 rad), which at terrain radii of 21.5-31 is a
 * 5.2-7.8u chord; a single missing pole doubles that to 10.2u or more. 9.0
 * therefore accepts every genuine neighbour and rejects every gap.
 */
const WIRE_MAX_SPAN = 9
/** height the wire attaches at, just under the 2.6 pole tip */
const POLE_TIP = 2.5
/** signals stand this far out along each road leaving KR Market */
const SIGNAL_ANGLE = 0.32
const SIGNAL_OFFSET = 0.06
/** verge band the tufts scatter across, in radians either side of the arc */
const TUFT_NEAR = 0.05
const TUFT_SPAN = 0.035
const _UP_Y = new THREE.Vector3(0, 1, 0)

/** rotate `dir` by `phi` radians toward `axis` (both unit, mutually perpendicular) */
function offsetDir(dir: THREE.Vector3, axis: THREE.Vector3, phi: number) {
  return dir.clone().multiplyScalar(Math.cos(phi)).addScaledVector(axis, Math.sin(phi)).normalize()
}

/**
 * Spin value that makes a prop's local +X point along `tangent` once
 * surfaceQuaternion has stood it up along `dir` — used so guardrails run with
 * the road instead of across it.
 */
function spinAlong(dir: THREE.Vector3, tangent: THREE.Vector3) {
  const q0 = new THREE.Quaternion().setFromUnitVectors(_UP_Y, dir)
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(q0)
  const cross = new THREE.Vector3().crossVectors(xAxis, tangent)
  return Math.atan2(cross.dot(dir), xAxis.dot(tangent))
}

/** great-circle tangent at `dir`, pointing toward `toward` */
function arcTangent(dir: THREE.Vector3, toward: THREE.Vector3) {
  const t = toward.clone().addScaledVector(dir, -dir.dot(toward))
  return t.lengthSq() < 1e-10 ? null : t.normalize()
}

/** rails, poles and verge tufts walked along every road arc */
function placeRoadFurniture(props: PlacedProp[]) {
  const byId = new Map(ZONES.map((z) => [z.id, z]))

  ROAD_PAIRS.forEach(([idA, idB], roadIndex) => {
    const za = byId.get(idA)
    const zb = byId.get(idB)
    if (!za || !zb) return

    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const omega = a.angleTo(b)
    if (omega < ROAD_STEP * 2) return
    const sinO = Math.sin(omega)
    const steps = Math.floor(omega / ROAD_STEP)

    const rand = rng(4200 + roadIndex * 17)
    const poleSide = roadIndex % 2 === 0 ? 1 : -1
    let seed = 5000 + roadIndex * 300

    const push = (kind: PropKind, dir: THREE.Vector3, spin: number): PlacedProp | null => {
      // nothing may stand on a road ribbon or its very edge. Checked against
      // every arc, so this also clears the pile-ups where roads converge on a
      // zone centre and a rail offset from one road lands on another.
      if (roadDistance(dir) < RIBBON_CLEAR) return null
      const pos = surfacePoint(dir, 0)
      if (pos.length() < WATER_LEVEL + 0.3) return null
      const [colorA, colorB] = KIND_COLORS[kind] ?? ["#cccccc", "#999999"]
      const prop: PlacedProp = {
        kind,
        position: pos,
        quaternion: surfaceQuaternion(dir, spin),
        scale: 1,
        colorA,
        colorB,
        seed: seed++,
      }
      props.push(prop)
      return prop
    }

    /** poles that actually survived placement, in order along the arc */
    const polesOnArc: THREE.Vector3[] = []

    // interior steps only — the endpoints are the zone centres themselves
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      const dir = a
        .clone()
        .multiplyScalar(Math.sin((1 - t) * omega) / sinO)
        .addScaledVector(b, Math.sin(t * omega) / sinO)
        .normalize()
      const tangent = arcTangent(dir, b)
      if (!tangent) continue
      const perp = new THREE.Vector3().crossVectors(dir, tangent).normalize()

      // guardrail, alternating sides, lying along the road
      const railDir = offsetDir(dir, perp, RAIL_OFFSET * (i % 2 === 0 ? 1 : -1))
      const railTan = arcTangent(railDir, b)
      if (railTan) push("guardrail", railDir, spinAlong(railDir, railTan))

      // utility pole every fourth step, always the same side of a given road
      if (i % 4 === 0) {
        const poleDir = offsetDir(dir, perp, POLE_OFFSET * poleSide)
        const poleTan = arcTangent(poleDir, b)
        if (poleTan) {
          const placed = push("utility-pole", poleDir, spinAlong(poleDir, poleTan))
          if (placed) polesOnArc.push(placed.position)
        }
      }

      // two tufts scattered across both verges
      for (let k = 0; k < 2; k++) {
        const side = rand() < 0.5 ? -1 : 1
        const tuftDir = offsetDir(dir, perp, (TUFT_NEAR + rand() * TUFT_SPAN) * side)
        push("grass-tuft", tuftDir, rand() * Math.PI * 2)
      }
    }

    // string a wire between each surviving pair of neighbouring poles. A gap
    // wider than WIRE_MAX_SPAN means a pole in between was rejected, and a
    // wire across it would cut through the ground.
    const [wireA, wireB] = KIND_COLORS.wire ?? ["#2a2a2a", "#1e1e1e"]
    for (let i = 0; i + 1 < polesOnArc.length; i++) {
      const pa = polesOnArc[i]
      const pb = polesOnArc[i + 1]
      if (pa.distanceTo(pb) > WIRE_MAX_SPAN) continue
      const topA = pa.clone().addScaledVector(pa.clone().normalize(), POLE_TIP)
      const topB = pb.clone().addScaledVector(pb.clone().normalize(), POLE_TIP)
      props.push({
        kind: "wire",
        position: topA.clone().add(topB).multiplyScalar(0.5),
        quaternion: new THREE.Quaternion(),
        scale: 1,
        colorA: wireA,
        colorB: wireB,
        seed: seed++,
        aux: [topA, topB],
      })
    }
  })

  // --- traffic signals on the three roads leaving KR Market
  const bazaar = byId.get("bazaar")
  if (bazaar) {
    const bDir = new THREE.Vector3(...bazaar.center).normalize()
    const [sigA, sigB] = KIND_COLORS["traffic-signal"] ?? ["#2f2b26", "#1d1a17"]
    const legs: [string, number][] = [
      ["haveli", 1300],
      ["ghat", 1301],
      ["samadhi", 1302],
    ]
    for (const [otherId, sigSeed] of legs) {
      const other = byId.get(otherId)
      if (!other) continue
      const oDir = new THREE.Vector3(...other.center).normalize()
      const outward = arcTangent(bDir, oDir)
      if (!outward) continue
      // walk SIGNAL_ANGLE out from the market along this leg
      const dir = bDir
        .clone()
        .multiplyScalar(Math.cos(SIGNAL_ANGLE))
        .addScaledVector(outward, Math.sin(SIGNAL_ANGLE))
        .normalize()
      const tangent = arcTangent(dir, oDir)
      if (!tangent) continue
      const perp = new THREE.Vector3().crossVectors(dir, tangent).normalize()
      const sigDir = offsetDir(dir, perp, SIGNAL_OFFSET)
      if (roadDistance(sigDir) < RIBBON_CLEAR) continue
      const pos = surfacePoint(sigDir, 0)
      if (pos.length() < WATER_LEVEL + 0.3) continue
      const sigTan = arcTangent(sigDir, oDir)
      if (!sigTan) continue
      // local +X onto the perpendicular puts local +Z down the road, so the
      // signal head faces oncoming traffic
      const sigPerp = new THREE.Vector3().crossVectors(sigDir, sigTan).normalize()
      props.push({
        kind: "traffic-signal",
        position: pos,
        quaternion: surfaceQuaternion(sigDir, spinAlong(sigDir, sigPerp)),
        scale: 1,
        colorA: sigA,
        colorB: sigB,
        seed: sigSeed,
      })
    }
  }
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

  placeRoadFurniture(props)

  return props
}
