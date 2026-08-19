import * as THREE from "three"
import { ZONES, NPCS, WATER_LEVEL } from "./data"
import {
  surfacePoint,
  surfaceQuaternion,
  rng,
  roadDistance,
  terrainRadius,
  terrainColor,
  npcSurfacePosition,
  slopeAt,
  METRO_LOOP,
  ROAD_MAX_FILL,
  loopProfileAt,
  loopWorldS,
  loopAngle,
  registerPlotGrading,
  PLOT_GRADE_RAMP,
} from "./terrain"

export type PropKind =
  | "stall"
  | "haveli-arch"
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
  | "zone-signboard"
  | "metro-pillar"
  | "metro-track"
  | "metro-station"
  | "bridge-deck"
  | "bridge-rail"
  | "bridge-pier"
  | "gopuram"
  | "temple-court"
  | "nandi-statue"
  | "temple-steps"
  | "civic-pad"
  | "glb-building"
  | "cow"
  | "cat"
  | "stall-counter"
  | "flower-spread"
  | "work-crate"
  | "sit-step"
  | "shrine"

export type PlacedProp = {
  kind: PropKind
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
  colorA: string
  colorB: string
  seed: number
  /**
   * World-space endpoints. "wire" uses them directly and ignores `position`;
   * "metro-pillar" carries [footing, deck] and "metro-track" [endA, endB] so
   * the renderer can derive height and span.
   */
  aux?: [THREE.Vector3, THREE.Vector3]
  /** bilingual plate copy. Only "zone-signboard" uses this. */
  signText?: { kannada: string; english: string }
  /**
   * Half-width in world units. Bridge decks and rails carry it because an
   * arterial crossing is wider than a local-road one; nothing else uses it.
   */
  width?: number
  /** GLB under public/, e.g. "/models/x.glb". Only "glb-building" uses this. */
  modelPath?: string
  /** keep only meshes whose name starts with this — splits multi-object files */
  part?: string
  /** multiplied over the model's baked colours, so one model gives many looks */
  tint?: string
  /** false for trees and street pieces, which need no foundation slab */
  plinth?: boolean
  /**
   * Per-prop collision box (model units, multiplied by `scale`). Buildings
   * carry their own footprint because every GLB differs, while COLLIDER_SPECS
   * is keyed by kind.
   */
  box?: { hx: number; hz: number; top: number }
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
  guardrail: ["#f2f0e8", "#d8d5cb"],
  "utility-pole": ["#6a5a48", "#4d4136"],
  "grass-tuft": ["#7dbb5a", "#5f9444"],
  wire: ["#2a2a2a", "#1e1e1e"],
  "traffic-signal": ["#2f2b26", "#1d1a17"],
  "zone-signboard": ["#1e5a3a", "#ffffff"],
  "metro-pillar": ["#b8b2a6", "#9a948a"],
  "metro-track": ["#9a948a", "#7f7a71"],
  "metro-station": ["#cfcabf", "#1e5a3a"],
  "bridge-deck": ["#cfc8ba", "#a89e90"],
  "bridge-rail": ["#f2f0e8", "#d8d5cb"],
  "bridge-pier": ["#a89e90", "#8d8478"],
  gopuram: ["#c9a876", "#b0453a"],
  "nandi-statue": ["#4a4442", "#4a4442"],
  "temple-court": ["#c9b48f", "#a89272"],
  "temple-steps": ["#c9b48f", "#a89272"],
  // paver tone with a slightly darker rim, so a reserved plot reads as ground
  // that has been claimed rather than as a building
  "civic-pad": ["#cfc4ae", "#a4998a"],
  cow: ["#e6e0d3", "#4a443c"],
  cat: ["#7a6f62", "#2f2a25"],
  "stall-counter": ["#a8865c", "#6d5636"],
  "flower-spread": ["#c9bfa4", "#e8a020"],
  "work-crate": ["#8a7250", "#5a4a34"],
  "sit-step": ["#bdb5a4", "#928a7c"],
  shrine: ["#d8cdb4", "#c0392b"],
}

/* ------------------------------------------------------------- namma metro */

const ZONE_DIRS = ZONES.map((z) => new THREE.Vector3(...z.center).normalize())

const METRO_ORDER = METRO_LOOP.order
export const METRO_ZONE_IDS = METRO_ORDER.map((i) => ZONES[i].id)
export const METRO_TOUR_LENGTH = (() => {
  let s = 0
  for (let i = 0; i < METRO_ORDER.length; i++) {
    s += ZONE_DIRS[METRO_ORDER[i]].angleTo(ZONE_DIRS[METRO_ORDER[(i + 1) % METRO_ORDER.length]])
  }
  return s
})()

/* ------------------------------------------------------------ deck profile */

const DECK_SMOOTH = 7
const DECK_RISE = 8
const DECK_MIN_CLEAR = 6.4
const DECK_WATER = WATER_LEVEL + 4.8
/** generous on purpose: a tight limit ratchets the deck up over rough ground */
const DECK_MAX_STEP = 0.4
/** the metro viaduct must clear a road bridge by this much (train + deck) */
const BRIDGE_HEADROOM = 4.2
/** how far the road runs onto each ramp end before the deck takes over */
const DECK_OVERLAP = 0.04

const PILLAR_STEP = 0.075
/** slide offsets tried when a footing lands on a villager, nearest first */
const PILLAR_NUDGES = [0.01, -0.01, 0.02, -0.02, 0.03, -0.03]
/**
 * Reaching past a temple approach cone can need more room than stepping off a
 * villager does — a cone is 4u across — so that case gets a longer window. It is
 * kept separate rather than widening the list above, because a longer window
 * also rescues footings that P24 deliberately skipped, and that would add
 * pillars and shift every downstream seed for no sightline gain. Every value
 * stays under PILLAR_STEP so a footing never walks onto the next one's ground.
 */
const PILLAR_NUDGES_WIDE = [
  ...PILLAR_NUDGES, 0.04, -0.04, 0.05, -0.05, 0.06, -0.06,
]

/* ---------------------------------------------------------- station siting */

const STATION_LEAD = 0.3
const SLIDE_STEP = 0.02
const SLIDE_MAX = 0.2
/** required world clearance from big props (scale >= 1) and from small ones */
const CLEAR_BIG = 5.6
const CLEAR_SMALL = 1.92

export type StationInfo = {
  zone: string
  offset: number
  clearance: number
  t: number
  /** which siting pass succeeded: 1 = all constraints, 2 = ribbon relaxed */
  pass: number
}

type MetroNet = {
  dirs: Float64Array
  deck: Float64Array
  raw: Float64Array
  n: number
  step: number
  total: number
  stations: StationInfo[]
  legs: Leg[]
  cycle: number
}

type Leg = {
  start: number
  dwellEnd: number
  end: number
  startT: number
  dist: number
  rampTime: number
  cruiseTime: number
  rampDist: number
}

let NET: MetroNet | null = null

/**
 * Buildings and trees need real room; street furniture only needs not to be
 * inside the pier. Classified by kind rather than by `scale`, because every
 * guardrail, pole and grass tuft is pushed with scale 1 — a literal
 * scale-based rule would demand 3.5u from every tuft and no site would exist.
 */
const BULKY_KINDS = new Set<PropKind>([
  "stall",
  "market-umbrella",
  "haveli-arch",
  "mill-block",
  "workshop-shed",
  "ghat-steps",
  "mango-tree",
  "banyan",
  "peepal-tree",
  "zone-signboard",
])

/**
 * Ground-footprint half-extents [x, z] in local units, before the prop's own
 * `scale`, measured off the geometry in PropsLayer. Only kinds listed here are
 * re-sited away from the arterial corridors; adding a kind opts it in.
 *
 * workshop-shed the roof cone is a 4-gon spun PI/4, so its vertices sit at 1.6
 */
const FOOTPRINT: Partial<Record<PropKind, [number, number]>> = {
  "workshop-shed": [1.6, 1.6],
}

/**
 * How far a building's wall line must stand off the corridor centreline.
 * Decoupled from SKIRT_OUT: when the shoulder widened to 5.55 the setback
 * silently rode along, pushing shopfronts 1.6u from the footpath. 5.1 is the
 * measured knee — the shoulder's rise above natural ground is at most 0.26u
 * there (vs 0.71u at the old 4.55), which the buildings' 0.8u below-grade
 * walls absorb, and a Bengaluru street wants its shopfronts close.
 */
const BUILDING_SETBACK = 5.1

/** perimeter samples per box edge when testing a footprint against a corridor */
const FOOT_SAMPLES = 8
const _footV = new THREE.Vector3()

/**
 * Does this footprint clear every corridor, testing the box outline rather than
 * the centre? A circumscribed radius is not enough: corridors converge at each
 * zone centre, and in that wedge the distance field bends enough that a centre
 * measuring 4.64u clear still had a corner 2.24u in.
 */
function footprintClear(dir: THREE.Vector3, box: [number, number], scale: number, spin: number) {
  const quat = surfaceQuaternion(dir, spin)
  const origin = surfacePoint(dir, 0)
  const [hx, hz] = box
  for (let e = 0; e < 4; e++) {
    for (let i = 0; i <= FOOT_SAMPLES; i++) {
      const t = (i / FOOT_SAMPLES) * 2 - 1
      if (e === 0) _footV.set(t * hx, 0, hz)
      else if (e === 1) _footV.set(t * hx, 0, -hz)
      else if (e === 2) _footV.set(hx, 0, t * hz)
      else _footV.set(-hx, 0, t * hz)
      _footV.multiplyScalar(scale).applyQuaternion(quat).add(origin).normalize()
      if (arterialDistance(_footV) < BUILDING_SETBACK) return false
    }
  }
  return true
}

/** how far out the corridor search will walk, and in what increments */
const SITE_DIST_STEP = 0.25
const SITE_MAX_DIST = 12
/** bearings tried at each distance: authored first, then alternating outward */
const SITE_TURNS = (() => {
  const turns = [0]
  for (let i = 1; i <= 16; i++) turns.push((i * Math.PI) / 16, (-i * Math.PI) / 16)
  return turns
})()

/**
 * Where the villagers actually stand. Structures must not be dropped on top of
 * them: an NPC is person-sized, so the small-prop rule applies. Built lazily so
 * it never runs before terrain.ts has finished initialising.
 */
let _npcSpots: THREE.Vector3[] | null = null
function npcSpots() {
  if (!_npcSpots) _npcSpots = NPCS.map((n) => npcSurfacePosition(n.position))
  return _npcSpots
}

/** distance from `pos` to the nearest villager, and whether it clears */
function npcClearance(pos: THREE.Vector3) {
  let nearest = Infinity
  for (const p of npcSpots()) {
    const d = pos.distanceTo(p)
    if (d < nearest) nearest = d
  }
  return { ok: nearest >= CLEAR_SMALL, nearest }
}

/** smallest distance from `pos` to any already-placed prop, and whether it clears */
function propClearance(pos: THREE.Vector3, placed: PlacedProp[]) {
  let nearest = Infinity
  let ok = true
  for (const p of placed) {
    if (p.kind === "wire") continue // no footprint, floats in the air
    const d = pos.distanceTo(p.position)
    if (d < nearest) nearest = d
    if (d < (BULKY_KINDS.has(p.kind) ? CLEAR_BIG : CLEAR_SMALL)) ok = false
  }
  return { ok, nearest }
}

/** structures whose entrance must keep a clear view down its own approach */
const SIGHTLINE_KINDS = new Set<PropKind>(["gopuram", "temple-court"])
/** how far down the approach the view is protected, and the cone's half-angle */
const SIGHTLINE_REACH = 4
const SIGHTLINE_HALF = Math.PI / 4

type Sightline = { at: THREE.Vector3; up: THREE.Vector3; face: THREE.Vector3 }

/**
 * The approach cones in front of the temple entrances. aimAtZone (P19) put each
 * doorway on local -Z, so that axis carried through the prop's own quaternion is
 * the direction the entrance looks — outward from the summit, down the stepped
 * climb. Reading it back off the quaternion rather than recomputing the tangent
 * keeps this true to however the piece was actually aimed.
 */
function sightlines(placed: PlacedProp[]): Sightline[] {
  const out: Sightline[] = []
  for (const p of placed) {
    if (!SIGHTLINE_KINDS.has(p.kind)) continue
    const up = p.position.clone().normalize()
    const face = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion)
    face.addScaledVector(up, -face.dot(up)) // flatten onto the ground plane
    if (face.lengthSq() < 1e-10) continue
    out.push({ at: p.position.clone(), up, face: face.normalize() })
  }
  return out
}

/** does `spot` stand inside a protected approach cone? */
function blocksSightline(spot: THREE.Vector3, lines: Sightline[]) {
  const limit = Math.cos(SIGHTLINE_HALF)
  for (const s of lines) {
    const v = spot.clone().sub(s.at)
    v.addScaledVector(s.up, -v.dot(s.up))
    const d = v.length()
    if (d < 1e-6 || d > SIGHTLINE_REACH) continue
    if (v.divideScalar(d).dot(s.face) >= limit) return true
  }
  return false
}

/** rotate `from` toward `toward` by `angle` radians along their great circle */
function advance(from: THREE.Vector3, toward: THREE.Vector3, angle: number) {
  const tan = arcTangent(from, toward)
  if (!tan) return from.clone()
  return from.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tan, Math.sin(angle)).normalize()
}

/**
 * A station sits STATION_LEAD out from its zone centre along the loop. If that
 * lands on a building, a road ribbon or in the water it slides along the loop
 * until it is clear.
 */
function siteStations(
  placed: PlacedProp[],
  /** samples the finished loop by arc length — stations ride the curve now */
  onLoop: (t: number, target: THREE.Vector3) => THREE.Vector3,
  /** arc-length position of each zone centre along that loop, in METRO_ORDER */
  zoneT: number[],
  total: number,
) {
  const sites: { dir: THREE.Vector3; info: StationInfo; t: number }[] = []
  const n = METRO_ORDER.length
  const _stationV = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const zi = METRO_ORDER[i]
    // never lead more than 40% of the way to the next zone: on the short
    // beach->temple leg a flat 0.3 rad would land in the temple's own props
    const legLength = (((zoneT[(i + 1) % n] - zoneT[i]) % total) + total) % total
    const lead = Math.min(STATION_LEAD, 0.4 * legLength)

    const offsets: number[] = [0]
    for (let s = SLIDE_STEP; s <= SLIDE_MAX + 1e-9; s += SLIDE_STEP) {
      offsets.push(s, -s)
    }

    /**
     * Three passes, loosening one constraint at a time. The metro parallels the
     * road network by construction — both connect the same nine zones — so on
     * some legs no site within the slide range is off every ribbon. An elevated
     * station straddling a road is realistic, so that is the constraint that
     * gives way first; prop clearance and dry land never do.
     */
    let chosen: THREE.Vector3 | null = null
    let chosenOffset = 0
    let chosenClear = 0
    let chosenPass = 0
    let best: { dir: THREE.Vector3; off: number; clear: number } | null = null

    for (let pass = 1; pass <= 3 && !chosen; pass++) {
      for (const off of offsets) {
        // read the candidate off the loop instead of walking the great circle:
        // the curve is now anchored on the zone centres, so a station placed by
        // arc length lands exactly on the track it is meant to serve
        const dir = onLoop(zoneT[i] + lead + off, _stationV).clone()
        const ground = terrainRadius(dir)
        if (ground < WATER_LEVEL + 0.48) continue
        if (pass === 1 && roadDistance(dir) < RIBBON_CLEAR) continue
        const pos = dir.clone().multiplyScalar(ground)
        const prop = propClearance(pos, placed)
        const npc = npcClearance(pos)
        const ok = prop.ok && npc.ok
        const nearest = Math.min(prop.nearest, npc.nearest)
        if (!best || nearest > best.clear) best = { dir, off, clear: nearest }
        if (ok) {
          chosen = dir
          chosenOffset = off
          chosenClear = nearest
          chosenPass = pass
          break
        }
      }
    }

    if (!chosen && best) {
      chosen = best.dir
      chosenOffset = best.off
      chosenClear = best.clear
      chosenPass = 4
    }
    if (!chosen) {
      chosen = onLoop(zoneT[i] + lead, _stationV).clone()
      chosenPass = 5
    }

    // the station's own arc position: where it actually sits on the loop, which
    // is now simply where it was sampled from
    const t = (((zoneT[i] + lead + chosenOffset) % total) + total) % total
    sites.push({
      dir: chosen,
      t,
      info: {
        zone: ZONES[zi].id,
        offset: chosenOffset,
        clearance: chosenClear,
        t,
        pass: chosenPass,
      },
    })
  }
  return sites
}

/* ------------------------------------------------------------- loop + deck */

function buildNetwork(placed: PlacedProp[]): MetroNet {
  /**
   * Closed spline through the ZONE CENTRES, in tour order, resampled to even arc
   * steps. It used to be threaded through the station directions instead, which
   * sit ~0.3 rad along each leg — so the curve never passed through a zone at
   * all, and once buildCorridors began following it (P36) the road inherited
   * that drift and wandered up to 13u from the hubs it connects. Anchoring on
   * the zones puts the track, the road, the painted ribbon and the terrain
   * grading back on the same zone-to-zone route; stations are then sited along
   * this curve rather than defining it.
   *
   * The spline geometry itself (control seeding, resample, zone arc positions)
   * lives in terrain.ts as METRO_LOOP so the terrain grading and this network
   * are guaranteed to follow the same curve.
   */
  const { dirs, n, step, total, zoneT } = METRO_LOOP

  // ground profile -> smoothed -> lifted -> slope limited (raising only)
  const raw = new Float64Array(n)
  const probe = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    probe.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2])
    raw[i] = terrainRadius(probe)
  }
  const base = new Float64Array(n)
  for (let i = 0; i < n; i++) base[i] = Math.max(raw[i], WATER_LEVEL)
  const smooth = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let k = -DECK_SMOOTH; k <= DECK_SMOOTH; k++) {
      sum += base[(((i + k) % n) + n) % n] // the loop is closed, so wrap
    }
    smooth[i] = sum / (DECK_SMOOTH * 2 + 1)
  }
  const deck = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    deck[i] = Math.max(smooth[i] + DECK_RISE, raw[i] + DECK_MIN_CLEAR, DECK_WATER)
    // Clear the ROAD BRIDGES too, not just the ground. Over a gorge the raw
    // terrain is the gorge floor, so a viaduct sized off it came down to
    // 1.17u above the bridge deck — under the height of the character walking
    // it, which is why the pillars looked no taller than he is.
    probe.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2])
    const road = bridgeSurface(probe)
    if (road !== null) deck[i] = Math.max(deck[i], road + BRIDGE_HEADROOM)
  }
  // two wrapped passes each way so the closed loop meets itself smoothly
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n
      deck[i] = Math.max(deck[i], deck[p] - DECK_MAX_STEP)
    }
    for (let i = n - 1; i >= 0; i--) {
      const q = (i + 1) % n
      deck[i] = Math.max(deck[i], deck[q] - DECK_MAX_STEP)
    }
  }

  // Stations ride the finished curve. They are sited only now, because the
  // curve no longer depends on them — the dependency used to run the other way.
  const sites = siteStations(
    placed,
    (t, target) => sampleLoopDirs(dirs, n, step, t, target),
    zoneT,
    total,
  )
  const stations = sites.map((s) => s.info)

  const legs = buildSchedule(stations, total)
  const cycle = legs.length ? legs[legs.length - 1].end : 1

  return { dirs, deck, raw, n, step, total, stations, legs, cycle }
}

/* ---------------------------------------------------------------- schedule */

const TRAIN_DWELL = 3.5
const TRAIN_RAMP = 2.2
const TRAIN_CRUISE = 0.14

function buildSchedule(stations: StationInfo[], total: number): Leg[] {
  const legs: Leg[] = []
  const k = stations.length
  let clock = 0
  for (let i = 0; i < k; i++) {
    const startT = stations[i].t
    const dist = (((stations[(i + 1) % k].t - startT) % total) + total) % total
    let rampTime = TRAIN_RAMP
    let rampDist = (TRAIN_CRUISE * TRAIN_RAMP) / 2
    let cruiseTime = 0
    if (dist >= rampDist * 2) {
      cruiseTime = (dist - rampDist * 2) / TRAIN_CRUISE
    } else {
      // too short to reach cruise: shrink both ramps so they exactly cover it
      rampTime = dist / TRAIN_CRUISE
      rampDist = dist / 2
    }
    const start = clock
    const dwellEnd = start + TRAIN_DWELL
    const end = dwellEnd + rampTime * 2 + cruiseTime
    legs.push({ start, dwellEnd, end, startT, dist, rampTime, cruiseTime, rampDist })
    clock = end
  }
  return legs
}

/** distance covered `e` seconds into a leg's run — velocity-continuous */
function legDistance(leg: Leg, e: number) {
  if (e <= leg.rampTime) {
    const x = leg.rampTime > 0 ? e / leg.rampTime : 1
    return TRAIN_CRUISE * leg.rampTime * (x * x * x - (x * x * x * x) / 2)
  }
  if (e <= leg.rampTime + leg.cruiseTime) {
    return leg.rampDist + TRAIN_CRUISE * (e - leg.rampTime)
  }
  const y = leg.rampTime > 0 ? Math.min(1, (e - leg.rampTime - leg.cruiseTime) / leg.rampTime) : 1
  return (
    leg.rampDist +
    leg.cruiseTime * TRAIN_CRUISE +
    TRAIN_CRUISE * leg.rampTime * (y - y * y * y + (y * y * y * y) / 2)
  )
}

/* ------------------------------------------------------------ public reads */

export function metroReady() {
  return NET !== null
}

export function metroStats() {
  if (!NET) return null
  let minLand = Infinity
  let maxLand = -Infinity
  let minAll = Infinity
  let maxAll = -Infinity
  for (let i = 0; i < NET.n; i++) {
    const h = NET.deck[i] - NET.raw[i]
    minAll = Math.min(minAll, h)
    maxAll = Math.max(maxAll, h)
    if (NET.raw[i] >= WATER_LEVEL) {
      minLand = Math.min(minLand, h)
      maxLand = Math.max(maxLand, h)
    }
  }
  return {
    total: NET.total,
    samples: NET.n,
    stations: NET.stations,
    cycle: NET.cycle,
    minLand,
    maxLand,
    minAll,
    maxAll,
  }
}

/** unit direction on the loop at arc parameter t */
/**
 * Direction at arc length `t` on a resampled loop. Split out from loopDir so
 * station siting can read the curve while it is still being built, before NET
 * exists — the two must sample identically or a station drifts off its track.
 */
function sampleLoopDirs(
  dirs: Float64Array,
  n: number,
  step: number,
  t: number,
  target: THREE.Vector3,
) {
  let x = t / step
  x = ((x % n) + n) % n
  const i = Math.floor(x)
  const f = x - i
  const j = (i + 1) % n
  target.set(
    dirs[i * 3] + (dirs[j * 3] - dirs[i * 3]) * f,
    dirs[i * 3 + 1] + (dirs[j * 3 + 1] - dirs[i * 3 + 1]) * f,
    dirs[i * 3 + 2] + (dirs[j * 3 + 2] - dirs[i * 3 + 2]) * f,
  )
  return target.normalize()
}

export function loopDir(t: number, target: THREE.Vector3) {
  if (!NET) return target.set(0, 1, 0)
  return sampleLoopDirs(NET.dirs, NET.n, NET.step, t, target)
}

/**
 * The same point, read straight off METRO_LOOP instead of the network.
 *
 * NET is only assigned inside placeMetro(), but placeBridges() runs BEFORE it —
 * so an arterial (onLoop) span asking loopDir() during placement got the
 * (0,1,0) fallback and stacked its entire deck at the north pole, which is why
 * the bridges vanished. The geometry is identical either way: buildNetwork
 * destructures these very arrays.
 */
export function loopDirRaw(t: number, target: THREE.Vector3) {
  return sampleLoopDirs(METRO_LOOP.dirs, METRO_LOOP.n, METRO_LOOP.step, t, target)
}

/** deck radius at arc parameter t */
export function deckRadius(t: number) {
  if (!NET) return WATER_LEVEL + 3
  const { deck, n, step } = NET
  let x = t / step
  x = ((x % n) + n) % n
  const i = Math.floor(x)
  const f = x - i
  const j = (i + 1) % n
  return deck[i] + (deck[j] - deck[i]) * f
}

/** world-space point on the deck at t */
export function deckPoint(t: number, target: THREE.Vector3) {
  return loopDir(t, target).multiplyScalar(deckRadius(t))
}

const _trainStates = [
  { t: 0, dwelling: false },
  { t: 0, dwelling: false },
]

/** where train `index` is at `time`; the second train runs half a cycle ahead */
export function metroTrainState(time: number, index: number) {
  const out = _trainStates[index] ?? _trainStates[0]
  if (!NET || !NET.legs.length) {
    out.t = 0
    out.dwelling = true
    return out
  }
  const cycle = NET.cycle
  const shifted = time + (index * cycle) / 2
  const p = ((shifted % cycle) + cycle) % cycle
  for (let i = 0; i < NET.legs.length; i++) {
    const leg = NET.legs[i]
    if (p >= leg.end) continue
    if (p < leg.dwellEnd) {
      out.t = leg.startT
      out.dwelling = true
    } else {
      out.t = leg.startT + legDistance(leg, p - leg.dwellEnd)
      out.dwelling = false
    }
    return out
  }
  const last = NET.legs[NET.legs.length - 1]
  out.t = last.startT + last.dist
  out.dwelling = false
  return out
}

/* ---------------------------------------------------------------- placement */

/** frame whose +X follows the deck and whose +Y leans away from the planet */
function deckQuaternion(along: THREE.Vector3, radial: THREE.Vector3) {
  const x = along.clone().normalize()
  const y = radial.clone().addScaledVector(x, -radial.dot(x)).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
}

/** the whole viaduct: pillars, deck segments and nine stations */
function placeMetro(props: PlacedProp[]) {
  NET = buildNetwork(props)
  const net = NET

  const [pillarA, pillarB] = KIND_COLORS["metro-pillar"] ?? ["#b8b2a6", "#9a948a"]
  const [trackA, trackB] = KIND_COLORS["metro-track"] ?? ["#9a948a", "#7f7a71"]
  const [stationA, stationB] = KIND_COLORS["metro-station"] ?? ["#cfcabf", "#1e5a3a"]

  const dir = new THREE.Vector3()
  let seed = 1500

  // the temple props are already in `props` by the time the viaduct is laid
  const lines = sightlines(props)

  const steps = Math.max(8, Math.round(net.total / PILLAR_STEP))
  const step = net.total / steps
  for (let i = 0; i < steps; i++) {
    const nominal = i * step
    loopDir(nominal, dir)
    const nominalGround = terrainRadius(dir)
    // Footings may stand IN water — the same rule the bridge piers use. The
    // old dry-only rule skipped ~14 consecutive footings at each gorge
    // crossing and the deck read as grey slabs hanging from nothing (the
    // P46 "stray floating slabs"; every unsupported piece was a track
    // segment over a skipped-pillar run).

    let t = nominal
    const nominalSpot = dir.clone().multiplyScalar(nominalGround)
    const coned = blocksSightline(nominalSpot, lines)
    if (!npcClearance(nominalSpot).ok || coned) {
      // A footing slides if it would land on a villager or inside a temple
      // approach cone, and only to a spot that is clear of villagers, not
      // on top of a prop — nudging blindly once put a pillar 0.07u into the
      // temple steps — and not itself in a cone.
      let moved = false
      for (const nudge of coned ? PILLAR_NUDGES_WIDE : PILLAR_NUDGES) {
        const probe = nominal + nudge
        loopDir(probe, dir)
        const g = terrainRadius(dir)
        const spot = dir.clone().multiplyScalar(g)
        if (!npcClearance(spot).ok) continue
        if (propClearance(spot, props).nearest < CLEAR_SMALL) continue
        if (blocksSightline(spot, lines)) continue
        t = probe
        moved = true
        break
      }
      if (!moved) {
        // Last resort: take the least-bad nudge, waiving only the prop
        // clearance — a footing brushing a bush beats a deck hanging in the
        // air. Villagers and the temple sightline stay inviolable.
        for (const nudge of PILLAR_NUDGES_WIDE) {
          const probe = nominal + nudge
          loopDir(probe, dir)
          const spot = dir.clone().multiplyScalar(terrainRadius(dir))
          if (!npcClearance(spot).ok) continue
          if (blocksSightline(spot, lines)) continue
          t = probe
          moved = true
          break
        }
      }
      // villagers or the sightline block the whole window: a genuine gap
      if (!moved) continue
    }

    loopDir(t, dir)
    const ground = terrainRadius(dir)
    const base = dir.clone().multiplyScalar(ground)
    const top = dir.clone().multiplyScalar(deckRadius(t))
    const ahead = new THREE.Vector3()
    loopDir(t + 0.01, ahead)
    const tangent = ahead.sub(dir).normalize()
    props.push({
      kind: "metro-pillar",
      position: base,
      quaternion: surfaceQuaternion(dir, spinAlong(dir, tangent)),
      scale: 1,
      colorA: pillarA,
      colorB: pillarB,
      seed: seed++,
      aux: [base, top],
    })
  }

  // deck: one segment per pillar step, wrapping closed
  for (let i = 0; i < steps; i++) {
    const t = i * step
    const endA = new THREE.Vector3()
    const endB = new THREE.Vector3()
    deckPoint(t, endA)
    deckPoint(t + step, endB)
    const mid = endA.clone().add(endB).multiplyScalar(0.5)
    props.push({
      kind: "metro-track",
      position: mid,
      quaternion: deckQuaternion(endB.clone().sub(endA), mid.clone().normalize()),
      scale: 1,
      colorA: trackA,
      colorB: trackB,
      seed: seed++,
      aux: [endA.clone(), endB.clone()],
    })
  }

  net.stations.forEach((st, i) => {
    loopDir(st.t, dir)
    const ground = dir.clone().multiplyScalar(terrainRadius(dir))
    const deck = dir.clone().multiplyScalar(deckRadius(st.t))
    const ahead = new THREE.Vector3()
    loopDir(st.t + 0.01, ahead)
    const tangent = ahead.sub(dir).normalize()
    props.push({
      kind: "metro-station",
      position: ground,
      quaternion: surfaceQuaternion(dir, spinAlong(dir, tangent)),
      scale: 1,
      colorA: stationA,
      colorB: stationB,
      seed: 1600 + i,
      aux: [ground, deck],
      signText: ZONE_SIGNS[st.zone],
    })
  })
}

function paletteFor(zoneId: string, r: () => number): [string, string] {
  const options = PALETTE[zoneId] ?? PALETTE.bazaar
  return options[Math.floor(r() * options.length) % options.length]
}

/**
 * The same zone pairs buildRoads() arcs between in terrain.ts. Re-declared here
 * rather than imported because that list is module-private there; if it ever
 * changes, this must change with it.
 *
 * It did change and this did not: P28 added the last four to complete the
 * arterial loop, and because bridges, road furniture and signposts all walk this
 * list, those roads got none of it — including two that cross open water, which
 * left the roads running straight into Sampangi Kere and the grove channel with
 * no deck. Keep the order identical to terrain.ts: signboards pick a road with
 * find(), so reordering would re-site them.
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
  ["samadhi", "grove"],
  ["haveli", "workshop"],
  ["workshop", "beach"],
  ["temple", "mill"],
]

const ROAD_STEP = 0.06
/**
 * Guardrail post spacing either side of the rail centre, and how much of a post
 * shows above its own ground. Shared with PropsLayer, which builds the rail from
 * the two ground samples in `aux`.
 */
export const GUARD_POST_X = 0.4
export const GUARD_SHOW = 0.35
export const GUARD_ROOT = 0.65
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
const WIRE_MAX_SPAN = 14.4
/** height the wire attaches at, just under the 2.6 pole tip */
const POLE_TIP = 4
/** signals stand this far out along each road leaving KR Market */
const SIGNAL_ANGLE = 0.32
const SIGNAL_OFFSET = 0.06

/** BBMP-style bilingual plates at each zone's road entry */
const SIGN_ANGLE = 0.24
const SIGN_OFFSET = 0.05
const SIGN_RETRY = 0.03

const ZONE_SIGNS: Record<string, { kannada: string; english: string }> = {
  bazaar: { kannada: "ಕೆ.ಆರ್. ಮಾರುಕಟ್ಟೆ", english: "K.R. Market" },
  mill: { kannada: "ಬಿನ್ನಿ ಮಿಲ್", english: "Binny Mills" },
  ghat: { kannada: "ಕಾವೇರಿ ನದಿತೀರ", english: "Cauvery Riverside" },
  haveli: { kannada: "ಬೆಂಗಳೂರು ಅರಮನೆ", english: "Bengaluru Palace" },
  grove: { kannada: "ದೊಡ್ಡ ಆಲದ ಮರ", english: "Dodda Alada Mara" },
  samadhi: { kannada: "ಎಸ್.ಪಿ. ರಸ್ತೆ", english: "S.P. Road" },
  workshop: { kannada: "ಗೋಪಾಲನ ಗ್ಯಾರೇಜ್", english: "Gopal's Garage" },
  temple: { kannada: "ನಂದಿ ಬೆಟ್ಟ ದೇವಸ್ಥಾನ", english: "Nandi Betta Temple" },
  beach: { kannada: "ಸಂಪಂಗಿ ಕೆರೆ", english: "Sampangi Kere" },
}

/** result of a signboard placement attempt, for reporting */
export type SignPlacement = { zone: string; placed: boolean; attempt: number }
export const signPlacements: SignPlacement[] = []
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
export function spinAlong(dir: THREE.Vector3, tangent: THREE.Vector3) {
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

/**
 * Re-aim the prop just pushed so a chosen local axis points at its zone centre.
 * add() always spins by `ang + PI`, which is fine for scatter but useless when
 * a piece has a front — Nandi must look at the shrine, stairs must run downhill.
 */
function aimAtZone(props: PlacedProp[], zoneId: string, axis: "x" | "z") {
  const prop = props[props.length - 1]
  const zone = ZONES.find((z) => z.id === zoneId)
  if (!prop || !zone) return
  const centre = new THREE.Vector3(...zone.center).normalize()
  const dir = prop.position.clone().normalize()
  const toward = arcTangent(dir, centre)
  if (!toward) return
  if (axis === "x") {
    // local +X onto the inward tangent
    prop.quaternion.copy(surfaceQuaternion(dir, spinAlong(dir, toward)))
  } else {
    // putting +X on the perpendicular leaves +Z on the inward tangent
    const perp = new THREE.Vector3().crossVectors(dir, toward).normalize()
    prop.quaternion.copy(surfaceQuaternion(dir, spinAlong(dir, perp)))
  }
}

/* ----------------------------------------------------------- road bridges */

const WET_MARK = WATER_LEVEL + 0.4
const BRIDGE_SAMPLE = 0.02
const MIN_SPAN = 0.03
/** ramp length at each bank, in radians */
const BRIDGE_RAMP = 0.04
const BRIDGE_DECK_R = WATER_LEVEL + 0.96
/**
 * Half the bridge, from centreline to railing. The deck mesh, the railings and
 * the walkable surface all derive from this one number: they were three separate
 * literals, and the deck had drifted to 0.9 while the rails stood at 1.44, so
 * the player walked off the deck edge before ever reaching a rail.
 */
export const BRIDGE_HALF_WIDTH = 1.44
/**
 * An arterial crossing carries the full corridor cross-section, so its deck
 * matches the surfaced half-width rather than the local-road default — a 1.44u
 * deck under a 3.95u road pinches the carriageway to a third of its width at
 * every water crossing. Local roads keep the narrow deck.
 *
 * Written out rather than read from FOOT_OUT, which the corridor section
 * declares further down this file; the two must be kept in step by hand.
 */
export const BRIDGE_ARTERIAL_HALF_WIDTH = 3.95
/** roughly one pier per this many world units of wet span */
const PIER_SPACING = 2.4

export type BridgeSpan = {
  road: number
  /** wet section */
  t0: number
  t1: number
  /** including the dry approach ramps */
  tA: number
  tB: number
  arc: number
  worldLength: number
  piers: number
  /** deck half-width: arterial crossings are wider than local-road ones */
  halfWidth: number
  /**
   * TRUE for the arterial crossings: their t values are positions along the
   * metro LOOP, not angles along a zone-to-zone arc. The road follows the
   * loop, so its bridges must too — built on the arcs they slid up to 4.1u
   * off the deck the moment the loop was offset past the hubs (P54).
   */
  onLoop?: boolean
}

/** point on a road arc at angle `t` from `a`, toward `b` */
function arcPoint(
  a: THREE.Vector3,
  b: THREE.Vector3,
  omega: number,
  t: number,
  target: THREE.Vector3,
) {
  const s = Math.sin(omega)
  return target
    .copy(a)
    .multiplyScalar(Math.sin(omega - t) / s)
    .addScaledVector(b, Math.sin(t) / s)
    .normalize()
}

/** every stretch of every road that runs below the waterline */
let _bridgeSpans: BridgeSpan[] | null = null

/**
 * Every wet stretch that needs a deck. LOCAL roads are scanned along their own
 * great-circle arcs, as always. The ARTERIAL crossings are scanned along the
 * metro loop instead, because that is what the road actually follows — see
 * BridgeSpan.onLoop. Lazy rather than module-load so the scan sees the
 * finished terrain (plot grading registers mid-build).
 */
function bridgeSpans(): BridgeSpan[] {
  if (_bridgeSpans) return _bridgeSpans
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const spans: BridgeSpan[] = []
  const dir = new THREE.Vector3()

  ROAD_PAIRS.forEach(([idA, idB], road) => {
    const za = byId.get(idA)
    const zb = byId.get(idB)
    if (!za || !zb) return
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const omega = a.angleTo(b)
    if (omega < MIN_SPAN) return

    let runStart: number | null = null
    const steps = Math.ceil(omega / BRIDGE_SAMPLE)
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(i * BRIDGE_SAMPLE, omega)
      const wet = terrainRadius(arcPoint(a, b, omega, t, dir)) < WET_MARK
      if (wet && runStart === null) runStart = t
      if ((!wet || i === steps) && runStart !== null) {
        const end = wet ? t : t - BRIDGE_SAMPLE
        const arc = end - runStart
        if (arc >= MIN_SPAN) {
          let tA = Math.max(0, runStart - BRIDGE_RAMP)
          let tB = Math.min(omega, end + BRIDGE_RAMP)
          const worldLength = arc * BRIDGE_DECK_R
          const [pa, pb] = ROAD_PAIRS[road]
          // Arterial crossings are NOT built here — they are scanned along
          // the loop below, because the road follows the loop and not this
          // arc. Skip them so a wet stretch is never decked twice.
          const arterial = METRO_ZONE_IDS.some((id, k) => {
            const next = METRO_ZONE_IDS[(k + 1) % METRO_ZONE_IDS.length]
            return (id === pa && next === pb) || (id === pb && next === pa)
          })
          if (arterial) {
            runStart = null
            continue
          }
          spans.push({
            halfWidth: BRIDGE_HALF_WIDTH,
            road,
            t0: runStart,
            t1: end,
            tA,
            tB,
            arc,
            worldLength,
            piers: Math.max(1, Math.round(worldLength / PIER_SPACING)),
          })
        }
        runStart = null
      }
    }
  })

  // ---- arterial crossings, scanned along the LOOP itself
  {
    const total = METRO_LOOP.total
    const probe = new THREE.Vector3()
    const right = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const behind = new THREE.Vector3()
    const q = new THREE.Vector3()
    const loopAt = (t: number) => loopDirRaw(t, probe)
    /** the corridor's own dry rule: centre plus both verges must be clear */
    const edgeWet = (t: number) => {
      loopAt(t)
      const r = terrainRadius(probe)
      if (r < WET_MARK) return true
      const d = probe.clone()
      sampleLoopDirs(METRO_LOOP.dirs, METRO_LOOP.n, METRO_LOOP.step, t + 0.01, ahead)
      sampleLoopDirs(METRO_LOOP.dirs, METRO_LOOP.n, METRO_LOOP.step, t - 0.01, behind)
      const fwd = ahead.clone().sub(behind)
      fwd.addScaledVector(d, -fwd.dot(d))
      if (fwd.lengthSq() < 1e-12) return false
      right.crossVectors(fwd.normalize(), d).normalize()
      for (const s of [1, -1]) {
        q.copy(d).addScaledVector(right, (s * BRIDGE_ARTERIAL_HALF_WIDTH) / r).normalize()
        if (terrainRadius(q) < WET_MARK) return true
      }
      return false
    }
    const gradeAt = (t: number) => {
      const d = 0.02
      const r = loopProfileAt(t)
      return Math.abs(loopProfileAt(t + d) - loopProfileAt(t - d)) / (2 * d * r)
    }

    const steps = Math.ceil(total / BRIDGE_SAMPLE)
    let runStart: number | null = null
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(i * BRIDGE_SAMPLE, total)
      const wet = terrainRadius(loopAt(t)) < WET_MARK
      if (wet && runStart === null) runStart = t
      if ((!wet || i === steps) && runStart !== null) {
        const end = wet ? t : t - BRIDGE_SAMPLE
        const arc = end - runStart
        if (arc >= MIN_SPAN) {
          let tA = runStart - BRIDGE_RAMP
          let tB = end + BRIDGE_RAMP
          // The deck lands where the ground under the FULL cross-section is
          // dry, and no further. There is no ramp to build any more: the road
          // is already at deck height on both banks, so a long approach would
          // only sprawl the structure into the neighbouring junction — which
          // is what turned an 18u crossing into 45u of platform.
          while (edgeWet(tA) && runStart - tA < 0.25) tA -= BRIDGE_SAMPLE
          while (edgeWet(tB) && tB - end < 0.25) tB += BRIDGE_SAMPLE
          // one corridor sample of overlap, as on the arc scan
          tA -= CORRIDOR_STEP
          tB += CORRIDOR_STEP
          const worldLength = arc * BRIDGE_DECK_R
          spans.push({
            halfWidth: BRIDGE_ARTERIAL_HALF_WIDTH,
            road: -1,
            onLoop: true,
            t0: runStart,
            t1: end,
            tA,
            tB,
            arc,
            worldLength,
            piers: Math.max(1, Math.round(worldLength / PIER_SPACING)),
          })
        }
        runStart = null
      }
    }
  }
  _bridgeSpans = spans
  return spans
}

export function bridgeReport() {
  return bridgeSpans().map((s) => ({
    road: s.onLoop ? "arterial(loop)" : `${ROAD_PAIRS[s.road][0]}-${ROAD_PAIRS[s.road][1]}`,
    arc: s.arc,
    worldLength: s.worldLength,
    piers: s.piers,
    t0: s.t0,
    t1: s.t1,
    tA: s.tA,
    tB: s.tB,
    halfWidth: s.halfWidth,
  }))
}

/** continuous loop arc position of the point on the loop nearest to `dir` */
function nearestLoopT(dir: THREE.Vector3) {
  const { dirs, n, step } = METRO_LOOP
  let bd = -2
  let bi = 0
  for (let i = 0; i < n; i++) {
    const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2]
    if (d > bd) {
      bd = d
      bi = i
    }
  }
  // refine within the two adjacent segments so t is continuous, not quantised
  // to the 0.02 rad sample grid (that alone would be a 0.1u bank height error)
  const sx = (i: number) => dirs[(((i % n) + n) % n) * 3]
  const sy = (i: number) => dirs[(((i % n) + n) % n) * 3 + 1]
  const sz = (i: number) => dirs[(((i % n) + n) % n) * 3 + 2]
  let bestT = bi * step
  let bestD2 = Infinity
  for (const j of [bi - 1, bi + 1]) {
    const ax = sx(bi), ay = sy(bi), az = sz(bi)
    const bx2 = sx(j) - ax, by2 = sy(j) - ay, bz2 = sz(j) - az
    const len2 = bx2 * bx2 + by2 * by2 + bz2 * bz2
    if (len2 < 1e-12) continue
    let f = ((dir.x - ax) * bx2 + (dir.y - ay) * by2 + (dir.z - az) * bz2) / len2
    f = Math.max(0, Math.min(1, f))
    const px = ax + bx2 * f - dir.x
    const py = ay + by2 * f - dir.y
    const pz = az + bz2 * f - dir.z
    const d2 = px * px + py * py + pz * pz
    if (d2 < bestD2) {
      bestD2 = d2
      bestT = (bi + (j < bi ? -f : f)) * step
    }
  }
  return bestT
}

/**
 * Bank heights for a span. An arterial crossing hands off to the corridor,
 * whose deck rides the smoothed fill profile — up to 1.2u above the raw ground
 * the banks used to sample, which was exactly the step measured at every wet
 * arterial span. Sample the corridor's own profile instead, offset so deck top
 * meets carriageway top. Local-road spans still meet the raw ground.
 */
function spanBanks(
  span: BridgeSpan,
  a: THREE.Vector3,
  b: THREE.Vector3,
  omega: number,
): readonly [number, number] {
  const probe = new THREE.Vector3()
  const bank = (t: number) => {
    // an arterial span's t IS a loop position, so the profile is read
    // directly — no nearest-point search, no arc-to-loop translation
    if (span.onLoop) return loopProfileAt(t) + ASPHALT_LIFT - DECK_TOP
    arcPoint(a, b, omega, t, probe)
    return terrainRadius(probe)
  }
  return [bank(span.tA), bank(span.tB)]
}

/** is this point on a road covered by a bridge, ramps included? */
function onBridge(road: number, angle: number) {
  for (const s of bridgeSpans()) {
    if (s.road === road && angle >= s.tA && angle <= s.tB) return true
  }
  return false
}

/** deck height at `t` within a span: flat over water, ramping down at the banks */
function bridgeHeight(
  span: BridgeSpan,
  t: number,
  bankA: number,
  bankB: number,
  deckR = BRIDGE_DECK_R,
) {
  if (span.onLoop) {
    // The deck IS the road. Since the profile now flies straight across a
    // crossing instead of diving into it (see terrain.ts), the carriageway
    // already runs at bridge height — so the deck simply carries the road
    // line, and the two can never disagree by construction.
    return loopProfileAt(t) + ASPHALT_LIFT - DECK_TOP
  }
  if (t <= span.t0) {
    const f = span.t0 > span.tA ? (t - span.tA) / (span.t0 - span.tA) : 1
    return bankA + (deckR - bankA) * f
  }
  if (t >= span.t1) {
    const f = span.tB > span.t1 ? (t - span.t1) / (span.tB - span.t1) : 1
    return deckR + (bankB - deckR) * f
  }
  return deckR
}

/**
 * Flat-section height for a span. The two arterial crossings are gorges — the
 * old fixed water-level deck made the road dive ~12u below its own banks and
 * climb back out. An arterial deck spans LEVEL with its lower bank instead (a
 * viaduct; the piers grow to reach it). Local-road spans stay skimming the
 * water, which suits their low beach-level banks.
 */
function spanDeckR(span: BridgeSpan, bankA: number, bankB: number) {
  if (span.halfWidth !== BRIDGE_ARTERIAL_HALF_WIDTH) return BRIDGE_DECK_R
  return Math.max(BRIDGE_DECK_R, Math.min(bankA, bankB))
}

/** decks, railings and piers for every water crossing */
function placeBridges(props: PlacedProp[]) {
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const [deckA, deckB] = KIND_COLORS["bridge-deck"] ?? ["#cfc8ba", "#a89e90"]
  const [railA, railB] = KIND_COLORS["bridge-rail"] ?? ["#f2f0e8", "#d8d5cb"]
  const [pierA, pierB] = KIND_COLORS["bridge-pier"] ?? ["#a89e90", "#8d8478"]
  let seed = 1800

  for (const span of bridgeSpans()) {
    let a = new THREE.Vector3()
    let b = new THREE.Vector3()
    let omega = 0
    if (!span.onLoop) {
      const [idA, idB] = ROAD_PAIRS[span.road]
      const za = byId.get(idA)
      const zb = byId.get(idB)
      if (!za || !zb) continue
      a = new THREE.Vector3(...za.center).normalize()
      b = new THREE.Vector3(...zb.center).normalize()
      omega = a.angleTo(b)
    }

    const [bankA, bankB] = spanBanks(span, a, b, omega)
    const deckR = spanDeckR(span, bankA, bankB)

    // an arterial span walks the LOOP; a local-road span walks its own arc
    const dirAt = (t: number, target: THREE.Vector3) =>
      span.onLoop ? loopDirRaw(t, target) : arcPoint(a, b, omega, t, target)
    const pointAt = (t: number, target: THREE.Vector3) =>
      dirAt(t, target).multiplyScalar(bridgeHeight(span, t, bankA, bankB, deckR))

    const steps = Math.max(2, Math.ceil((span.tB - span.tA) / BRIDGE_SAMPLE))
    const step = (span.tB - span.tA) / steps

    for (let i = 0; i < steps; i++) {
      const t = span.tA + i * step
      const p0 = pointAt(t, new THREE.Vector3())
      const p1 = pointAt(t + step, new THREE.Vector3())
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      const along = p1.clone().sub(p0)
      const quat = deckQuaternion(along, mid.clone().normalize())

      props.push({
        kind: "bridge-deck",
        position: mid,
        quaternion: quat,
        scale: 1,
        colorA: deckA,
        colorB: deckB,
        seed: seed++,
        width: span.halfWidth,
        aux: [p0.clone(), p1.clone()],
      })

      // a railing down each edge, offset across the deck
      const side = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize()
      for (const s of [-1, 1]) {
        const r0 = p0.clone().addScaledVector(side, s * span.halfWidth)
        const r1 = p1.clone().addScaledVector(side, s * span.halfWidth)
        const rMid = r0.clone().add(r1).multiplyScalar(0.5)
        props.push({
          kind: "bridge-rail",
          position: rMid,
          quaternion: deckQuaternion(r1.clone().sub(r0), rMid.clone().normalize()),
          scale: 1,
          colorA: railA,
          colorB: railB,
          seed: seed++,
          width: span.halfWidth,
          aux: [r0, r1],
        })
      }
    }

    // piers standing on the lakebed, spaced across the wet part only
    for (let k = 0; k < span.piers; k++) {
      const f = (k + 0.5) / span.piers
      const t = span.t0 + (span.t1 - span.t0) * f
      const d = dirAt(t, new THREE.Vector3())
      const bed = d.clone().multiplyScalar(terrainRadius(d))
      const top = d.clone().multiplyScalar(bridgeHeight(span, t, bankA, bankB, deckR))
      props.push({
        kind: "bridge-pier",
        position: bed,
        quaternion: surfaceQuaternion(d, 0),
        scale: 1,
        colorA: pierA,
        colorB: pierB,
        seed: seed++,
        aux: [bed, top],
      })
    }

    // ABUTMENTS. The two approach ramps carried nothing: the deck simply rose
    // off the bank with open air beneath it, which is what makes a bridge read
    // as unattached however exactly its ends meet the ground. Stand a support
    // wherever the ramp is far enough off the ground to show daylight, on both
    // sides of every crossing.
    const ABUT_MIN = 0.35
    const ABUT_STEP = BRIDGE_SAMPLE
    for (const [from, to] of [
      [span.tA, span.t0],
      [span.t1, span.tB],
    ] as const) {
      if (to <= from) continue
      for (let t = from + ABUT_STEP * 0.5; t < to; t += ABUT_STEP) {
        const d = dirAt(t, new THREE.Vector3())
        const g = terrainRadius(d)
        const h = bridgeHeight(span, t, bankA, bankB, deckR)
        if (h - g < ABUT_MIN) continue
        const bed = d.clone().multiplyScalar(g)
        props.push({
          kind: "bridge-pier",
          position: bed,
          quaternion: surfaceQuaternion(d, 0),
          scale: 1,
          colorA: pierA,
          colorB: pierB,
          seed: seed++,
          aux: [bed, d.clone().multiplyScalar(h)],
        })
      }
    }
  }
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
      // arterials carry footpaths instead of verge furniture. Poles are in the
      // list too: they were exempt, and stood mid-carriageway where the spline
      // road drifts from the great-circle arcs this distance is measured on.
      if (
        (kind === "guardrail" || kind === "grass-tuft" || kind === "utility-pole") &&
        arterialDistance(dir) < CORRIDOR_SUPPRESS
      ) {
        return null
      }
      const pos = surfacePoint(dir, 0)
      if (pos.length() < WATER_LEVEL + 0.48) return null
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
      // A guardrail spans 0.8u between its posts, and the verge can drop most of
      // a unit across that — a rail held level then reads as a leaning fence with
      // one post barely showing. Sample the ground under each post so the
      // renderer can stand both upright and run the rail down the grade.
      if (kind === "guardrail") {
        const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(prop.quaternion)
        const foot = (sx: number) => {
          const probe = dir.clone().addScaledVector(axisX, sx / pos.length()).normalize()
          return probe.multiplyScalar(terrainRadius(probe))
        }
        prop.aux = [foot(-GUARD_POST_X), foot(GUARD_POST_X)]
      }
      props.push(prop)
      return prop
    }

    /** poles that actually survived placement, in order along the arc */
    const polesOnArc: THREE.Vector3[] = []

    // interior steps only — the endpoints are the zone centres themselves
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      // a bridge carries the road here — its own railings take over, and loose
      // furniture would be left standing in open water
      if (onBridge(roadIndex, t * omega)) continue
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
      // Walk the pole outward (either side) until it clears the drawn
      // corridor, not just the painted ribbon — the fixed 0.06 rad offset
      // stood a signal mid-carriageway, same failure as the signboards.
      let sigDir: THREE.Vector3 | null = null
      outer: for (const side of [1, -1]) {
        for (let k = SIGNAL_OFFSET; k <= 0.26; k += 0.03) {
          const cand = offsetDir(dir, perp, k * side)
          if (roadDistance(cand) < RIBBON_CLEAR) continue
          if (arterialDistance(cand) < CORRIDOR_SUPPRESS) continue
          sigDir = cand
          break outer
        }
      }
      if (!sigDir) continue
      const pos = surfacePoint(sigDir, 0)
      if (pos.length() < WATER_LEVEL + 0.48) continue
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

  // --- one bilingual signboard at each zone's road entry
  signPlacements.length = 0
  const [signA, signB] = KIND_COLORS["zone-signboard"] ?? ["#1e5a3a", "#ffffff"]
  ZONES.forEach((zone, zi) => {
    const copy = ZONE_SIGNS[zone.id]
    if (!copy) return
    const pair = ROAD_PAIRS.find(([x, y]) => x === zone.id || y === zone.id)
    if (!pair) return
    const otherId = pair[0] === zone.id ? pair[1] : pair[0]
    const other = byId.get(otherId)
    if (!other) return

    const zDir = new THREE.Vector3(...zone.center).normalize()
    const oDir = new THREE.Vector3(...other.center).normalize()
    const outward = arcTangent(zDir, oDir)
    if (!outward) return

    // Never walk past 40% of the arc: on a short road 0.24 rad would carry the
    // board over the midpoint and leave it sitting closer to the neighbouring
    // zone than to its own. The same 40% is applied against the CLOSEST zone in
    // any direction, not just this arc's partner — a long road can still pass
    // near an unrelated zone (beach's road to KR Market skirts the temple).
    const arcLength = zDir.angleTo(oDir)
    let nearestOther = Math.PI
    for (const o of ZONES) {
      if (o.id === zone.id) continue
      nearestOther = Math.min(
        nearestOther,
        zDir.angleTo(new THREE.Vector3(...o.center).normalize()),
      )
    }
    const walk = Math.min(SIGN_ANGLE, 0.4 * arcLength, 0.4 * nearestOther)

    // first side, then the other, then the same two further and further out
    const attempts: [number, number][] = [
      [walk, 1],
      [walk, -1],
      [walk + SIGN_RETRY, 1],
      [walk + SIGN_RETRY, -1],
      [walk + SIGN_RETRY * 2, 1],
      [walk + SIGN_RETRY * 2, -1],
      [walk + SIGN_RETRY * 3, 1],
      [walk + SIGN_RETRY * 3, -1],
    ]
    for (let attempt = 0; attempt < attempts.length; attempt++) {
      const [along, side] = attempts[attempt]
      const onRoad = zDir
        .clone()
        .multiplyScalar(Math.cos(along))
        .addScaledVector(outward, Math.sin(along))
        .normalize()
      const tangent = arcTangent(onRoad, oDir)
      if (!tangent) continue
      const perp = new THREE.Vector3().crossVectors(onRoad, tangent).normalize()
      // Walk the board outward until it stands clear of the drawn corridor,
      // not just the painted ribbon — the fixed 0.05 rad offset left the SP
      // Road board mid-carriageway (the corridor follows the spline, not the
      // arc this walk measures on, and is far wider than the ribbon).
      let dir: THREE.Vector3 | null = null
      // range widened in P54: with the arterial offset past the hubs, a board
      // near a zone centre can need to sit further out to clear the corridor
      for (let k = SIGN_OFFSET; k <= 0.42; k += 0.03) {
        const cand = offsetDir(onRoad, perp, k * side)
        if (roadDistance(cand) < RIBBON_CLEAR) continue
        if (arterialDistance(cand) < CORRIDOR_SUPPRESS) continue
        dir = cand
        break
      }
      if (!dir) continue
      const pos = surfacePoint(dir, 0)
      if (pos.length() < WATER_LEVEL + 0.48) continue
      const boardTan = arcTangent(dir, oDir)
      if (!boardTan) continue
      // local +X onto the perpendicular leaves local +Z down the road, so the
      // plate faces someone walking the arc
      const boardPerp = new THREE.Vector3().crossVectors(dir, boardTan).normalize()
      props.push({
        kind: "zone-signboard",
        position: pos,
        quaternion: surfaceQuaternion(dir, spinAlong(dir, boardPerp)),
        scale: 1,
        colorA: signA,
        colorB: signB,
        seed: 1400 + zi,
        signText: copy,
      })
      signPlacements.push({ zone: zone.id, placed: true, attempt: attempt + 1 })
      return
    }
    signPlacements.push({ zone: zone.id, placed: false, attempt: attempts.length })
  })
}

let _builtProps: PlacedProp[] | null = null

export function buildProps(): PlacedProp[] {
  // ONE world per session. Building twice used to be merely wasteful; since
  // plot grading registers with the terrain mid-build, a second build would
  // site everything on already-graded ground and drift from the first.
  if (_builtProps) return _builtProps
  const props: PlacedProp[] = []
  _builtProps = props
  const byId = new Map(ZONES.map((z) => [z.id, z]))

  const add = (
    kind: PropKind,
    zoneId: string,
    angleOffset: number,
    distFrac: number,
    scale: number,
    seed: number,
    /** slide outward/inward if the authored spot would land on a villager */
    npcAware = false,
  ) => {
    const zone = byId.get(zoneId)
    if (!zone) return
    const center = new THREE.Vector3(...zone.center).normalize()
    const tangent = new THREE.Vector3(0, 1, 0)
    if (Math.abs(center.y) > 0.9) tangent.set(1, 0, 0)
    const t1 = new THREE.Vector3().crossVectors(tangent, center).normalize()
    const t2 = new THREE.Vector3().crossVectors(center, t1).normalize()
    const ang = angleOffset
    const atAng = (a: number, df: number) => {
      // a pure angular offset in radians. zone.radius is a world-unit value and
      // must never enter here — multiplying by it flung props tens of degrees
      // away from the zone they belong to (BUG-102).
      const dist = df * 0.03125
      return center
        .clone()
        .addScaledVector(t1, Math.cos(a) * dist)
        .addScaledVector(t2, Math.sin(a) * dist)
        .normalize()
    }
    const at = (df: number) => atAng(ang, df)

    let dir = at(distFrac)
    if (npcAware && !npcClearance(surfacePoint(dir, 0)).ok) {
      for (const nudge of [0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6]) {
        const cand = at(distFrac + nudge)
        if (npcClearance(surfacePoint(cand, 0)).ok) {
          dir = cand
          break
        }
      }
    }

    // Corridor siting. An arterial runs through every metro zone's centre, so a
    // structure anchored near that centre sits in the carriageway. Anything with
    // a FOOTPRINT must stand its own radius clear of the corridor's outer edge.
    //
    // Unlike the npc nudge above this also sweeps the bearing: the workshop shed
    // is on the same bearing as a corridor, so no distance along it ever escapes.
    // Distance-major ordering keeps the authored bearing when it can work and
    // otherwise takes the nearest site that clears, so props stay in their zone.
    const box = FOOTPRINT[kind]
    if (box !== undefined && !footprintClear(dir, box, scale, ang + Math.PI)) {
      const fits = (cand: THREE.Vector3) => {
        // cheap gate first: the centre lies inside the box, so a centre inside
        // the band can never yield a clear footprint, and this skips the
        // perimeter walk for the great majority of candidates
        if (arterialDistance(cand) < BUILDING_SETBACK) return false
        const spot = surfacePoint(cand, 0)
        // the same two conditions add() already enforces on every prop
        if (spot.length() < WATER_LEVEL + 0.48) return false
        if (!npcClearance(spot).ok) return false
        return footprintClear(cand, box, scale, ang + Math.PI)
      }

      let sited: THREE.Vector3 | null = null
      // Hold the authored bearing and walk outward first. Ensembles are composed
      // along one bearing — the haveli gate sits on the palace approach's,
      // deliberately — so keeping it is worth the extra 1.0u it costs.
      for (let df = distFrac; df <= SITE_MAX_DIST && !sited; df += SITE_DIST_STEP) {
        const cand = at(df)
        if (fits(cand)) sited = cand
      }
      // Only if the bearing itself runs down a corridor, as the workshop shed's
      // does for its whole length, sweep round. Distance-major, so the shed stays
      // as close as it can to the smallest zone on the planet.
      if (!sited) {
        search: for (let df = distFrac; df <= SITE_MAX_DIST; df += SITE_DIST_STEP) {
          for (const turn of SITE_TURNS) {
            const cand = atAng(ang + turn, df)
            if (!fits(cand)) continue
            sited = cand
            break search
          }
        }
      }
      if (sited) dir = sited
    }

    const pos = surfacePoint(dir, 0)
    const quat = surfaceQuaternion(dir, ang + Math.PI)
    const [a, b] = KIND_COLORS[kind] ?? paletteFor(zoneId, rng(seed))
    if (pos.length() < WATER_LEVEL + 0.48) return
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

  // --- haveli: Bengaluru Palace. The palace itself, its grounds and its
  // boundary wall are authored GLB work in placePalace(); what stays here is
  // the gate ensemble on bearing 0, which placePalace() lines its approach up
  // with. The old procedural `palace` box-and-cone stood here and was deleted
  // in P57 — palace_.glb now occupies that ground.
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

  // --- temple: a South Indian hill shrine — gopuram at the summit, courtyard
  // and Nandi on the approach, stair runs descending the slope below
  add("gopuram", "temple", 0, 0.25, 1.6, 600, true)
  aimAtZone(props, "temple", "z") // doorway (local -Z) looks down the approach
  add("temple-court", "temple", 0, 0.55, 1.4, 601, true)
  aimAtZone(props, "temple", "z") // mandapa roof (+Z half) sits toward the shrine
  add("nandi-statue", "temple", 0, 0.85, 1.1, 602, true)
  aimAtZone(props, "temple", "x") // the bull faces the shrine along local +X
  add("temple-steps", "temple", 0, 1.25, 1.3, 603)
  aimAtZone(props, "temple", "z") // treads descend along local -Z, downhill
  // A run is 3.12u long and the second must start beyond the first. 3.3 was
  // tuned when distFrac scaled by 0.05; P22b changed that to 0.03125, pulling
  // this run back into a roadside guardrail. 3.3 x 1.6 restores its world
  // position under the new scale.
  add("temple-steps", "temple", 0, 5.3, 1.3, 604)
  aimAtZone(props, "temple", "z")
  // distFrac 1.3 clears the gopuram's 1.28u half-width, but the approach axis
  // is fully occupied (court 0.85, Nandi 1.32, steps 1.94), so the flags are
  // swung out to +-0.9 to stand off the axis instead of between the pieces
  add("flag", "temple", 0.9, 1.3, 1.3, 605)
  add("flag", "temple", -0.9, 1.3, 1.3, 606)

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
  placeBridges(props)
  placeMetro(props)
  // last, so a plot can see every pillar, building and villager it must avoid
  placeCivicPads(props)
  // after the pads: buildings stand on the SITED pad centres
  placeGlbBuildings(props)
  placeStreetAnimals(props)
  placeWorkstations(props)
  // streets first, then the palace (it needs to see the streets), then the
  // ground is graded under every pad at once, and only then are the stairs
  // fitted -- they must read the FINAL relief or they fit a slope that the
  // grading is about to flatten
  placeZoneBuildings(props)
  placePalace(props)
  gradeBuildingPads(props)
  placeStairs(props)
  placeRoadside(props)

  return props
}

/**
 * Grade every building pad level, the same way the civic plots are graded,
 * and re-seat anything the new ground moved under.
 *
 * Civic pads are re-registered alongside: registerPlotGrading REPLACES its
 * site list, so the two sets have to go in together or the plots lose their
 * grading. Re-sampling a civic pad's level on already-graded ground returns
 * the same number, so this is idempotent for them.
 */
function gradeBuildingPads(props: PlacedProp[]) {
  if (!_buildPads.length) return
  const civic = _plotSiting
    .filter((p) => p.ok)
    .map((p) => ({ dir: p.dir.clone(), radius: p.radius }))
  const before = props.map((p) =>
    p.kind === "wire" ? 0 : terrainRadius(_reseatV.copy(p.position).normalize()),
  )
  // what the ground looked like under each building BEFORE its pad graded
  const beforeRel = _builtRefs.map((b) =>
    rectRelief(b.prop.position, b.prop.quaternion as THREE.Quaternion, b.hl, b.hd),
  )
  registerPlotGrading([...civic, ..._buildPads])
  _padReseats = 0
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    if (p.kind === "wire") continue
    // only things actually STANDING on the ground follow it; decks, pillars
    // and wires are span-borne and keep the height their span gave them
    if (Math.abs(p.position.length() - before[i]) > 0.05) continue
    const after = terrainRadius(_reseatV.copy(p.position).normalize())
    if (Math.abs(after - before[i]) < 1e-9) continue
    p.position.setLength(after)
    _padReseats++
  }
  // and afterwards: how level the pad actually came out, and how much earth
  // had to move to get there
  for (let i = 0; i < _builtRefs.length; i++) {
    const b = _builtRefs[i]
    const q = b.prop.quaternion as THREE.Quaternion
    const rel = rectRelief(b.prop.position, q, b.hl, b.hd)
    const row = _zoneBuilt[b.row]
    if (!row) continue
    row.reliefAfter = rel.drop
    row.cutFill = Math.max(
      Math.abs(rel.lo - beforeRel[i].lo),
      Math.abs(rel.hi - beforeRel[i].hi),
    )
    // the model's base plane is its own origin; the gap is the worst distance
    // from that plane to the finished ground anywhere under the footprint
    const base = b.prop.position.length()
    row.plinthDepth = Math.max(base - rel.lo, rel.hi - base)
  }
}
let _padReseats = 0
export function padReseatCount() {
  return _padReseats
}

/* ------------------------------------------------------------ workstations */

/**
 * The objects each villager's job actually requires, placed AROUND their
 * spawn — never by moving them, since every NPC position is a weight-1
 * terrain anchor (WORLD_DESIGN rule 4). Offsets are in the villager's own
 * tangent frame and chosen so the hands of the existing animation land on the
 * work surface; the harness measures that gap rather than trusting it.
 *
 * `fwd` is how far in front of the villager the piece sits, `lift` lets a
 * seat sit under them rather than ahead of them.
 */
type Workstation = { kind: PropKind; fwd: number; right?: number; spin?: number }

export const WORKSTATIONS: Record<string, Workstation> = {
  // vendors work over a counter in front of them
  "chai-wala": { kind: "stall-counter", fwd: 0.66 },
  amma: { kind: "stall-counter", fwd: 0.66 },
  // Radha sits behind a low flower spread rather than a raised counter
  "flower-radha": { kind: "flower-spread", fwd: 0.6 },
  // tradesmen crouch over a crate
  "mechanic-gopal": { kind: "work-crate", fwd: 0.52 },
  "mill-worker-a": { kind: "work-crate", fwd: 0.52 },
  "mill-worker-b": { kind: "work-crate", fwd: 0.52 },
  "mill-worker-c": { kind: "work-crate", fwd: 0.52 },
  "engineer-iyer": { kind: "work-crate", fwd: 0.52 },
  "boatman-deva": { kind: "work-crate", fwd: 0.52 },
  // idlers need something to sit ON, directly beneath them
  "boss-verma-senior": { kind: "sit-step", fwd: 0.06 },
  "kid-chintu": { kind: "sit-step", fwd: 0.06 },
  "sadhu-wanderer": { kind: "sit-step", fwd: 0.06 },
  "musician-iqbal": { kind: "sit-step", fwd: 0.06 },
  // the priest bows to a shrine
  "priest-baba": { kind: "shrine", fwd: 0.95 },
}

function placeWorkstations(props: PlacedProp[]) {
  let seed = 9400
  for (const npc of NPCS) {
    const w = WORKSTATIONS[npc.id]
    if (!w) continue
    const dir = new THREE.Vector3(...npc.position).normalize()
    const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(t1, dir).normalize()
    const fwd = new THREE.Vector3().crossVectors(dir, right).normalize()
    const r = terrainRadius(dir)
    const at = dir
      .clone()
      .addScaledVector(fwd, w.fwd / r)
      .addScaledVector(right, (w.right ?? 0) / r)
      .normalize()
    const [colorA, colorB] = KIND_COLORS[w.kind] ?? ["#cccccc", "#999999"]
    props.push({
      kind: w.kind,
      position: at.clone().multiplyScalar(terrainRadius(at)),
      // face the villager: local +Z points back at them
      quaternion: surfaceQuaternion(at, spinAlong(at, new THREE.Vector3().crossVectors(at, fwd)) + (w.spin ?? 0)),
      scale: 1,
      colorA,
      colorB,
      seed: seed++,
    })
  }
}

/**
 * Cows and cats. They are PROPS, not NPCS: every entry in NPCS is a weight-1
 * anchor in the terrain's radial-basis field (WORLD_DESIGN rule 4), so adding
 * a cow to that list would dent the landscape under it. As props they cost the
 * terrain nothing. The cow keeps its collider — it is meant to be an obstacle
 * you walk around, the way a real Bengaluru street cow is.
 */
function placeStreetAnimals(props: PlacedProp[]) {
  const net = NET
  if (!net) return
  const [cowA, cowB] = KIND_COLORS.cow ?? ["#e6e0d3", "#4a443c"]
  const [catA, catB] = KIND_COLORS.cat ?? ["#7a6f62", "#2f2a25"]
  const dir = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  let seed = 9300

  // beside the arterial, just outside the graded shoulder
  const spots: [number, number][] = [
    [0.14, 1],
    [0.38, -1],
    [0.62, 1],
    [0.86, -1],
  ]
  spots.forEach(([f, side], k) => {
    const t = f * net.total
    loopDir(t, dir)
    loopDir(t + 0.01, ahead)
    const fwd = ahead.clone().sub(dir)
    fwd.addScaledVector(dir, -fwd.dot(dir))
    if (fwd.lengthSq() < 1e-12) return
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
    const g = terrainRadius(dir)
    // walk out until clear of the drawn corridor, then one step more
    for (let lat = 6.4; lat <= 9.5; lat += 0.4) {
      const d = dir.clone().addScaledVector(right, (side * lat) / g).normalize()
      const r = terrainRadius(d)
      if (r < WATER_LEVEL + 0.6) continue
      if (corridorSurface(d) !== null) continue
      const at = d.clone().multiplyScalar(r)
      if (propClearance(at, props).nearest < 1.2) continue
      if (!npcClearance(at).ok) continue
      const kind: PropKind = k === 3 ? "cat" : "cow"
      props.push({
        kind,
        position: at,
        // face along the road, so a cow reads as standing in the traffic lane
        quaternion: surfaceQuaternion(d, spinAlong(d, fwd)),
        scale: 1,
        colorA: kind === "cow" ? cowA : catA,
        colorB: kind === "cow" ? cowB : catB,
        seed: seed++,
      })
      break
    }
  })
}

/* --------------------------------------------------------- glb buildings */

export type GlbBuildingSpec = {
  /** GLB under public/, e.g. "/models/glass-skyscraper-01.glb" */
  path: string
  /** civic plot id (CIVIC_PLOTS) whose sited pad this building stands on */
  plot: string
  /** uniform scale; 1 = the asset's authored real-world metres */
  scale: number
  /** collision half-extents + height in MODEL units (multiplied by scale) */
  box: { hx: number; hz: number; top: number }
}

/**
 * Buildings are data, not code: one entry per structure. The renderer
 * (PropsLayer GlbBuilding) rebases each model so its bounding box is centred
 * in X/Z with the base at y=0, converts materials to the project toon look,
 * and stands it on a plinth — so an entry needs only path, plot, scale, box.
 */
export const GLB_BUILDINGS: GlbBuildingSpec[] = [
  {
    path: "/models/glass-skyscraper-01.glb",
    plot: "itpark",
    scale: 0.4,
    box: { hx: 3.8, hz: 4.1, top: 26.3 },
  },
  {
    path: "/models/apartments.glb",
    plot: "apartments",
    scale: 0.4,
    box: { hx: 3.6, hz: 2.9, top: 12.3 },
  },
  // SUBSTITUTE: the brief asked for midrise-office-01.glb, which is not in
  // public/models — deco-hotel-three-bay is the closest midrise block on hand
  {
    path: "/models/deco-hotel-three-bay.glb",
    plot: "hospital",
    scale: 0.4,
    box: { hx: 3.72, hz: 3.12, top: 11.26 },
  },
  // SUBSTITUTE: station-building.glb is not in public/models either —
  // deco-shopfront-row at 0.6 reads as a campus block row
  {
    path: "/models/deco-shopfront-row.glb",
    plot: "college",
    scale: 0.6,
    box: { hx: 4.1, hz: 2.62, top: 5.27 },
  },
  {
    path: "/models/bus-shelter-01.glb",
    plot: "busstand",
    scale: 1,
    box: { hx: 2.1, hz: 0.75, top: 2.98 },
  },
  {
    path: "/models/corner-store-01.glb",
    plot: "cycleshop",
    scale: 0.5,
    box: { hx: 3.28, hz: 3.53, top: 6.2 },
  },
]


/* ------------------------------------------------------- zone build-out */

const M = "/models/"
/** the player, for the "how many of me is that building" rule */
export const PLAYER_H = 1.8

/**
 * One entry per source model.
 *
 * `src` is the model's WORLD-space bounding box as three.js loads it — node
 * rotations included, which matters: the Quaternius and J-Toastie exports
 * carry a -90 deg X on their root, so "Building Red Corner" is a 3.47u tower
 * and not the 1.34u shed its raw vertex bounds suggest.
 *
 * `scale` is then chosen so the thing stands OVER the player rather than
 * beside his knee. Everything without `low` clears 5u — 2.8 player-heights.
 */
export type ModelSpec = {
  path: string
  /** mesh-name prefix, for the multi-object files (the five palms) */
  part?: string
  /** world-space source size [w, h, d] at scale 1 */
  src: [number, number, number]
  scale: number
  /** deliberately short: shelters, seating, walls, cars, paving, steps */
  low?: boolean
  /** trees and street pieces stand on soil, not on a foundation slab */
  plinth?: boolean
  /** local +Z runs ALONG the frontage line instead of facing it (vehicles) */
  faceAlong?: boolean
  /** collider half-extents in MODEL units, when the bbox lies (palm fronds) */
  hx?: number
  hz?: number
  /**
   * Does this want its ground graded level? Buildings do -- a plumb wall on a
   * hillside reads as a lean. Trees, benches, cars and paving do NOT: they sit
   * on whatever the ground is doing, and giving each of them a pad put flat
   * discs at different levels next to each other, which plotGrade resolves
   * "nearest wins" -- a hard 5u step right under a palm.
   */
  pad?: boolean
}

export const MODELS: Record<string, ModelSpec> = {
  /* --- buildings ------------------------------------------------------- */
  "shopfront-long": { path: `${M}Hotel Building.glb`, src: [6.951, 2.394, 2.837], scale: 2.15 },
  "shopfront-row": { path: `${M}deco-shopfront-row.glb`, src: [8.2, 5.27, 5.23], scale: 1.35 },
  "general-store": { path: `${M}bld-general-store-01.glb`, src: [3.42, 3.16, 3.77], scale: 1.9 },
  "corner-store": { path: `${M}corner-store-01.glb`, src: [6.56, 6.2, 7.05], scale: 1.15 },
  bungalow: { path: `${M}bungalow-house.glb`, src: [5.96, 5.09, 5.525], scale: 1.25 },
  shack: { path: `${M}bait-shack.glb`, src: [2.74, 3.463, 3.118], scale: 1.7 },
  shed: { path: `${M}big-red-barn.glb`, src: [8.92, 5.4, 7.798], scale: 1.0 },
  "apartments-narrow": { path: `${M}apartments2.glb`, src: [2.007, 3.05, 2.0], scale: 2.5 },
  midrise: { path: `${M}deco-hotel-three-bay.glb`, src: [7.44, 11.26, 6.24], scale: 0.78 },
  "corner-tower": {
    path: `${M}Building Red Corner by J-Toastie - 9JuFwnivP0.glb`,
    src: [1.328, 3.465, 1.34],
    scale: 2.1,
  },
  "neon-blade": { path: `${M}hotel-neon-blade.glb`, src: [1.34, 6.484, 0.98], scale: 1.15 },
  workshop: { path: `${M}Big Building by Quaternius.glb`, src: [4.705, 5.677, 4.391], scale: 1.3 },
  stoop: { path: `${M}Autumn Stoop_door.glb`, src: [1.491, 2.145, 1.114], scale: 2.6 },
  palace: { path: `${M}palace_.glb`, src: [29.085, 22.716, 38.855], scale: 0.4 },

  /* --- trees ----------------------------------------------------------- */
  palm1: {
    pad: false,
    path: `${M}Palm Trees by Quaternius - VYslw9DEi6.glb`, part: "PalmTree_1",
    src: [5.092, 5.103, 4.947], scale: 1.3, plinth: false, hx: 0.4, hz: 0.4,
  },
  palm2: {
    pad: false,
    path: `${M}Palm Trees by Quaternius - VYslw9DEi6.glb`, part: "PalmTree_2",
    src: [5.583, 5.28, 4.769], scale: 1.25, plinth: false, hx: 0.4, hz: 0.4,
  },
  palm3: {
    pad: false,
    path: `${M}Palm Trees by Quaternius - VYslw9DEi6.glb`, part: "PalmTree_3",
    src: [4.473, 4.666, 4.222], scale: 1.4, plinth: false, hx: 0.4, hz: 0.4,
  },
  palm4: {
    pad: false,
    path: `${M}Palm Trees by Quaternius - VYslw9DEi6.glb`, part: "PalmTree_4",
    src: [4.747, 3.65, 4.952], scale: 1.75, plinth: false, hx: 0.4, hz: 0.4,
  },
  palm5: {
    pad: false,
    path: `${M}Palm Trees by Quaternius - VYslw9DEi6.glb`, part: "PalmTree_5",
    src: [3.492, 1.796, 3.622], scale: 3.0, plinth: false, hx: 0.4, hz: 0.4,
  },
  /* the one conifer on the planet, clipped and columnar, and only because the
     real Bengaluru Palace grounds are lined with exactly this shape */
  cypress: {
    pad: false,
    path: `${M}arborvitae_conifer.glb`, src: [1.645, 3.325, 1.864], scale: 1.7,
    plinth: false, hx: 0.45, hz: 0.45,
  },

  /* --- deliberately low ------------------------------------------------ */
  stairs: { path: `${M}Stairs.glb`, src: [1.875, 1.392, 3.115], scale: 1.6, low: true, plinth: false, pad: false },
  wall: {
    path: `${M}Stone Wall by Quaternius - tdeAOh3LQV.glb`, src: [1.56, 0.446, 0.247],
    scale: 3.6, low: true, plinth: false, pad: false,
  },
  gatepost: {
    path: `${M}Fence End by J-Toastie - tQ5zhPd5UC.glb`, src: [1.352, 0.788, 0.286],
    scale: 2.0, low: true, plinth: false, pad: false,
  },
  paving: {
    path: `${M}Path Straight by Quaternius - ZuRHRsKWoz.glb`, src: [0.496, 0.045, 0.978],
    scale: 4.0, low: true, plinth: false, pad: false,
  },
  bench: { path: `${M}bench-01.glb`, src: [1.4, 0.952, 0.475], scale: 1.0, low: true, plinth: false, pad: false },
  "cafe-set": {
    path: `${M}cafe-table-chairs.glb`, src: [1.8, 0.871, 0.846], scale: 1.0,
    low: true, plinth: false,
  },
  wagon: {
    path: `${M}container-flat-wagon.glb`, src: [1.25, 1.388, 3.635], scale: 1.2,
    low: true, plinth: false, faceAlong: true, pad: false,
  },
  sedan: {
    path: `${M}car-sedan-01.glb`, src: [1.157, 0.809, 2.938], scale: 1.0,
    low: true, plinth: false, faceAlong: true, pad: false,
  },
  "police-car": {
    path: `${M}Police Car.glb`, src: [1.778, 1.239, 3.73], scale: 1.0,
    low: true, plinth: false, faceAlong: true, pad: false,
  },
  "sports-car": {
    path: `${M}sports_car.glb`, src: [1.872, 1.203, 3.927], scale: 1.0,
    low: true, plinth: false, faceAlong: true, pad: false,
  },
  "broken-car": {
    path: `${M}Broken Car for garage.glb`, src: [2.641, 1.76, 5.494], scale: 1.0,
    low: true, plinth: false, faceAlong: true, pad: false,
  },
  "work-bench": {
    path: `${M}Bench for garage.glb`, src: [2.511, 1.621, 1.225], scale: 1.0,
    low: true, plinth: false, pad: false,
  },
}

/** height above its own pad, world units */
export const modelH = (m: ModelSpec) => m.src[1] * m.scale
/**
 * Footprint half-sizes along and across a frontage line.
 *
 * `hx`/`hz` win where given: a palm's bounding box is its frond spread, and
 * grading a 6.6u disc flat under every palm cut up to 8.1u of hillside for a
 * tree that occupies a 0.8u trunk. Fronds overhang; they do not need a pad.
 */
const alongHalf = (m: ModelSpec) =>
  (m.faceAlong ? (m.hz ?? m.src[2] / 2) : (m.hx ?? m.src[0] / 2)) * m.scale
const acrossHalf = (m: ModelSpec) =>
  (m.faceAlong ? (m.hx ?? m.src[0] / 2) : (m.hz ?? m.src[2] / 2)) * m.scale
/** collider box, in MODEL units — the prop carries its own scale */
const modelBox = (m: ModelSpec) => ({
  hx: m.hx ?? m.src[0] / 2,
  hz: m.hz ?? m.src[2] / 2,
  top: m.src[1],
})
/**
 * Smallest distance from the corridor centreline a FRONTAGE LINE may sit at.
 *
 * A pad's grading reaches `hz + 0.9 + PLOT_GRADE_RAMP` from the facade, and
 * the widest the drawn shoulder ever gets is 6.75u, so 0.9 + 3 + 6.9 = 10.8u
 * is the closest a facade can stand without its earthworks pulling the road
 * surface toward the plot level -- which would undo the road repairs of
 * P46-P54. Comes out at 12.5u. Measured afterwards; see the road-untouched
 * check, which reports 0 road probes inside any pad.
 */
/**
 * Widest the drawn shoulder ever gets (6.75u) plus margin.
 *
 * The margin is not decoration: arterialDistance is loopAngle x terrainRadius,
 * and a pad's own grading LOWERS terrainRadius under it, so a pad measured at
 * exactly 6.9u before grading came out at 5.40u after (measured). 8.6u of
 * pre-grading clearance holds the post-grading figure above the shoulder.
 */
const ROAD_KEEPOUT = 9.0
const SETBACK_FLOOR = 1.0 + PLOT_GRADE_RAMP + ROAD_KEEPOUT

/**
 * A street: an arc running parallel to the arterial at a FIXED setback, with
 * its buildings sitting on it at even spacing and every facade square to it.
 *
 * The spiral search this replaced dropped buildings at whatever bearing
 * happened to pass its tests, which is why the zones read as a scatter rather
 * than as places with streets.
 */
type Street = {
  /** which side of the arterial the frontage stands on */
  side: 1 | -1
  /**
   * Setback: distance from the corridor centreline to the FRONTAGE LINE
   * itself -- the facade plane, not the building centres. Each building is
   * then seated its own half-depth behind it, so a 6.8u-deep shopfront row
   * and a 2.7u-deep tower still present the same street wall.
   */
  dist: number
  /** clear gap between neighbours along the line — small is shoulder-to-shoulder */
  gap: number
  items: { model: string; tint: string }[]
}

export const ZONE_STREETS: Record<string, Street[]> = {
  /* KR Market — the densest place on the planet. Both sides of the road,
     shoulder to shoulder, so it reads as a market lane and not a clearing. */
  bazaar: [
    {
      side: 1, dist: 9, gap: 0.8, items: [
        { model: "general-store", tint: "#c8543f" },
        { model: "apartments-narrow", tint: "#d9c08f" },
        { model: "corner-tower", tint: "#d88a4a" },
        { model: "general-store", tint: "#e0b350" },
      ],
    },
    {
      side: -1, dist: 9, gap: 0.8, items: [
        { model: "shopfront-row", tint: "#d8b48a" },
        { model: "stoop", tint: "#b8926a" },
        { model: "corner-tower", tint: "#9fb4a2" },
        { model: "apartments-narrow", tint: "#c47f5a" },
        { model: "general-store", tint: "#b8563f" },
      ],
    },
    // a back lane behind the market frontage -- KR Market is not one street
    {
      side: 1, dist: 18, gap: 1.0, items: [
        { model: "shopfront-row", tint: "#c6a276" },
        { model: "corner-store", tint: "#a8926a" },
        { model: "corner-tower", tint: "#7f95a8" },
        { model: "shack", tint: "#d0a869" },
      ],
    },
  ],
  /* SP Road — a corridor, not an open space: narrow tall frontages tight to
     the kerb on both sides, sign blades between them. */
  samadhi: [
    {
      side: 1, dist: 8, gap: 0.5, items: [
        { model: "corner-tower", tint: "#b8563f" },
        { model: "corner-tower", tint: "#5f7f96" },
        { model: "neon-blade", tint: "#e0533a" },
        { model: "corner-tower", tint: "#c9a24a" },
        { model: "apartments-narrow", tint: "#c9b48f" },
      ],
    },
    {
      side: -1, dist: 8, gap: 0.5, items: [
        { model: "midrise", tint: "#8fa6b8" },
        { model: "corner-tower", tint: "#6f8a5f" },
        { model: "neon-blade", tint: "#3fa3c8" },
        { model: "corner-tower", tint: "#a8566f" },
        { model: "apartments-narrow", tint: "#93a3ad" },
      ],
    },
    // the second rank of the electronics lane
    {
      side: -1, dist: 17, gap: 0.8, items: [
        { model: "corner-tower", tint: "#4f7f96" },
        { model: "apartments-narrow", tint: "#b8a07a" },
        { model: "corner-tower", tint: "#96604f" },
        { model: "neon-blade", tint: "#c8a83f" },
        { model: "general-store", tint: "#7f8a6f" },
      ],
    },
  ],
  /* Binny Mills — repetition and scale: parallel shed rows one side, worker
     housing and the goods siding on the other. */
  mill: [
    {
      side: -1, dist: 10.8, gap: 2.5, items: [
        { model: "shed", tint: "#8a8f93" },
        { model: "bungalow", tint: "#a89a80" },
      ],
    },
    {
      side: 1, dist: 10.8, gap: 2.5, items: [
        { model: "shed", tint: "#7f8a7a" },
        { model: "bungalow", tint: "#d6c8a8" },
        { model: "bungalow", tint: "#b9a98c" },
        { model: "wagon", tint: "#7a6a52" },
        { model: "wagon", tint: "#5f6f7a" },
      ],
    },
    // the mill's own frontage on the far side, set well back
    {
      side: -1, dist: 17, gap: 3.0, items: [
        { model: "shed", tint: "#7a8288" },
        { model: "bungalow", tint: "#c2b294" },
        { model: "palm4", tint: "#568444" },
      ],
    },
  ],
  /* Nandi Betta — the climb is the point. Two shacks well apart at the foot;
     the stairs up the hill are placeStairs() work. */
  temple: [
    {
      side: -1, dist: 10.8, gap: 7, items: [
        { model: "shack", tint: "#d8b06a" },
        { model: "shack", tint: "#c8a05a" },
        { model: "palm3", tint: "#4e7a36" },
      ],
    },
  ],
  /* Dodda Alada Mara — a park. Palms along the far edge, seating near the
     footpath. No buildings at all. */
  grove: [
    {
      side: 1, dist: 11.5, gap: 4, items: [
        { model: "palm1", tint: "#5c8a3f" },
        { model: "palm3", tint: "#4e7a36" },
        { model: "palm2", tint: "#67965a" },
        { model: "palm4", tint: "#568444" },
        { model: "palm1", tint: "#6a9c5a" },
        { model: "palm5", tint: "#4f7f44" },
      ],
    },
    {
      side: 1, dist: 8.5, gap: 4.5, items: [
        { model: "bench", tint: "#8a6a4a" },
        { model: "cafe-set", tint: "#b8a68a" },
        { model: "bench", tint: "#7a5f42" },
        { model: "cafe-set", tint: "#a2907a" },
      ],
    },
  ],
  /* Cauvery Riverside — houses set back from the water; the descent itself is
     placeStairs() work. */
  ghat: [
    {
      side: -1, dist: 10.8, gap: 3, items: [
        { model: "shack", tint: "#c08a5a" },
        { model: "bungalow", tint: "#cbb894" },
        { model: "shack", tint: "#a8926a" },
        { model: "palm2", tint: "#5f9150" },
      ],
    },
  ],
  /* Gopal's Garage — one shed and a yard of dismantled two-wheelers. */
  workshop: [
    {
      side: 1, dist: 10.8, gap: 1.6, items: [
        { model: "workshop", tint: "#b0a08a" },
        { model: "broken-car", tint: "#8a5f4a" },
        { model: "broken-car", tint: "#6a7a86" },
        { model: "work-bench", tint: "#7a6a52" },
      ],
    },
  ],
  /* Sampangi Kere — a bund with palms along it, and nothing else. */
  beach: [
    {
      side: 1, dist: 10.8, gap: 4, items: [
        { model: "palm2", tint: "#5f9150" },
        { model: "palm4", tint: "#4f7f44" },
        { model: "palm5", tint: "#6a9c5a" },
        { model: "palm3", tint: "#568444" },
        { model: "palm1", tint: "#67965a" },
      ],
    },
  ],
}

/** everything the build-out stood up, for reporting */
export type ZonePlacement = {
  zone: string
  line: number
  model: string
  tint: string
  /** world units from the corridor centreline */
  road: number
  /** the street's authored setback, for comparison */
  setback: number
  /** height in world units */
  height: number
  /** degrees between this facade's normal and the frontage line's normal */
  facade: number
  /** arc position along the line, relative to the zone's own arc position */
  along: number
  /** how many grading discs this building registered */
  chainN: number
  /** ground drop across the footprint before pad grading */
  reliefBefore: number
  /** and after it -- this is what "graded level" has to mean */
  reliefAfter: number
  /** deepest cut or fill the grading made under this footprint */
  cutFill: number
  /** how far the finished ground is from the model's base plane */
  plinthDepth: number
  ok: boolean
}
let _zoneBuilt: ZonePlacement[] = []
export function zoneBuildReport() {
  return _zoneBuilt
}
/** pads this pass wants graded level, handed to terrain.ts with the civic ones */
export type BuildPad = { dir: THREE.Vector3; radius: number; level?: number }
let _buildPads: BuildPad[] = []
export function buildPadReport() {
  return _buildPads
}
/** stairs, with the slope each one actually found */
export type StairFit = {
  where: string
  /** the stair's own rise, world units */
  rise: number
  /** the terrain drop across its own footprint */
  drop: number
  /** vertical mismatch at the bottom step and at the top step */
  bottom: number
  top: number
  ok: boolean
}
let _stairFits: StairFit[] = []
export function stairReport() {
  return _stairFits
}
/** the palace grounds, with the distances the layout came out at */
let _palace: Record<string, number | string> = {}
export function palaceReport() {
  return _palace
}

/**
 * A point on a frontage line: `s` world units along the arterial from the
 * zone's own arc position, pushed `dist` sideways onto the line.
 */
function frontageAt(tz: number, R: number, s: number, side: number, dist: number) {
  const t = tz + s / R
  const cl = loopDirRaw(t, new THREE.Vector3())
  const ahead = loopDirRaw(t + 0.004, new THREE.Vector3())
  const fwd = ahead.clone().sub(cl)
  fwd.addScaledVector(cl, -fwd.dot(cl))
  if (fwd.lengthSq() < 1e-12) return null
  fwd.normalize()
  const right = new THREE.Vector3().crossVectors(fwd, cl).normalize()
  const g0 = terrainRadius(cl)
  const at = (k: number) =>
    cl.clone().addScaledVector(right, (side * k) / g0).normalize()
  // Pushing sideways by `dist` does NOT put the point `dist` from the road:
  // on the inside of a bend the road curls back toward you, and a line asked
  // for 12.5u came out anywhere from 7.6u to 14.2u (measured). Solve for the
  // offset that gives the TRUE distance instead, so the frontage really is
  // parallel to the arterial and its grading really does stay off the road.
  let dir = at(dist)
  if (arterialDistance(dir) < dist) {
    let lo = dist
    let hi = dist * 2.6 + 8
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (arterialDistance(at(mid)) < dist) lo = mid
      else hi = mid
    }
    dir = at(hi)
    // the solve is not always possible: pushed far enough, a point can come
    // back within reach of the NEXT leg of the loop and the distance stops
    // rising. Say so rather than quietly returning a 7.6u "12.5u" setback.
    if (arterialDistance(dir) < dist - 0.15) return null
  }
  return { dir, cl, fwd, right }
}

/**
 * Unit tangent of a FRONTAGE LINE at arc position `s`, in the tangent plane at
 * `at`. Taken from the line itself rather than from the road, because the
 * offset line's bearing drifts from the road's once the sphere curves.
 */
function lineTangent(tz: number, R: number, s: number, side: number, dist: number, at: THREE.Vector3) {
  const a = frontageAt(tz, R, s - 0.6, side, dist)
  const b = frontageAt(tz, R, s + 0.6, side, dist)
  if (!a || !b) return null
  const v = b.dir.clone().sub(a.dir)
  v.addScaledVector(at, -v.dot(at))
  return v.lengthSq() < 1e-14 ? null : v.normalize()
}

/**
 * Worst ground drop across a RECTANGULAR footprint, sampled on its own rim in
 * its own frame. The circular version asked a 16.7 x 6.8u shopfront row about
 * ground 10u out to either side, which it never actually stands on.
 */
function rectRelief(origin: THREE.Vector3, quat: THREE.Quaternion, hx: number, hz: number) {
  let lo = Infinity
  let hi = -Infinity
  const v = new THREE.Vector3()
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      if (i > 0 && i < 6 && j > 0 && j < 6) continue
      v.set((i / 3 - 1) * hx, 0, (j / 3 - 1) * hz).applyQuaternion(quat).add(origin)
      const r = terrainRadius(v.normalize())
      if (r < lo) lo = r
      if (r > hi) hi = r
    }
  }
  return { lo, hi, drop: hi - lo }
}

/**
 * The grading pads for one building: a CHAIN of depth-sized discs down its
 * own length, not one disc round its centre.
 *
 * A single disc big enough to cover a 16.7u frontage has a 9.9u radius, and
 * with the 3u ramp its influence reaches 12.9u -- straight through the
 * carriageway, which would drag the road surface to the plot level and break
 * the very roads P46-P54 spent their time repairing. Depth-sized discs keep
 * the whole influence inside `hd + 0.9 + PLOT_GRADE_RAMP` of the frontage.
 */
/**
 * Disc radius and count for a footprint's grading chain.
 *
 * A disc of radius r covers the full DEPTH of the strip only within
 * sqrt(r^2 - hz^2) of its own centre. Spacing on r instead left the corners of
 * a 7.5 x 6.9u bungalow 0.73u outside the flat core, sitting in the ramp --
 * which is where its 2.6u plinth came from.
 */
function padSpacing(hx: number, hz: number) {
  const r = hz + 1.0
  const half = Math.max(0.4, Math.sqrt(Math.max(0, r * r - hz * hz)))
  return { r, n: Math.max(hx > half ? 2 : 1, Math.ceil(hx / half)) }
}

function padChain(origin: THREE.Vector3, quat: THREE.Quaternion, hx: number, hz: number) {
  const { r, n: _n } = padSpacing(hx, hz)
  const n = _n
  const out: { dir: THREE.Vector3; radius: number; off: number }[] = []
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -hx + ((2 * hx) / (n - 1 || 1)) * i
    v.set(x, 0, 0).applyQuaternion(quat).add(origin)
    out.push({ dir: v.clone().normalize(), radius: r, off: x })
  }
  return out
}

/**
 * Would this pad chain's grading reach the road?
 *
 * SETBACK_FLOOR guarantees it for the building's centre, but a chain end on
 * the outside of a bend curls back toward the arterial -- measured at 4.23u
 * from the centreline, inside the carriageway, which would have tilted the
 * road toward the plot level.
 */
function padChainClearsRoad(chain: { dir: THREE.Vector3; radius: number }[]) {
  for (const q of chain) {
    if (arterialDistance(q.dir) - q.radius - PLOT_GRADE_RAMP < ROAD_KEEPOUT) return false
  }
  return true
}
/** worst ground drop across a footprint, sampled on its own rim */
function padRelief(dir: THREE.Vector3, radius: number) {
  const g = terrainRadius(dir)
  const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(t1, dir).normalize()
  const v = new THREE.Vector3().crossVectors(dir, u).normalize()
  let lo = g
  let hi = g
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const d = dir
      .clone()
      .addScaledVector(u, (Math.cos(a) * radius) / g)
      .addScaledVector(v, (Math.sin(a) * radius) / g)
      .normalize()
    const r = terrainRadius(d)
    if (r < lo) lo = r
    if (r > hi) hi = r
  }
  return { level: g, lo, hi, drop: hi - lo }
}

/**
 * Kinds a building plot may overlap. Bridge and metro geometry is span-borne
 * or sits inside the corridor band the setback has already cleared, and a
 * guardrail lives on the shoulder — none of them are things a shopfront can
 * be standing "on".
 */
const PLOT_IGNORE = new Set<PropKind>([
  "bridge-rail", "bridge-deck", "bridge-pier", "metro-track", "wire", "guardrail",
])
/** verge scatter: cleared off the plot rather than blocking it */
const PLOT_SCATTER = new Set<PropKind>(["grass-tuft", "mango-tree", "peepal-tree"])

const _fpV = new THREE.Vector3()
/**
 * Is the ground under this footprint clear, and what scatter has to go?
 *
 * A circle round the centre is the wrong test for a 16u shopfront row: it
 * demands a 20u clearing for a building only 6.8u deep, which is why every
 * dense frontage came back NO ROOM. This projects each nearby prop into the
 * building's OWN frame and tests the rectangle instead — which is also what
 * lets a market street stand shoulder to shoulder.
 *
 * Returns the scatter to sweep, or null if something solid is in the way.
 */
function footprintFree(
  origin: THREE.Vector3,
  quat: THREE.Quaternion,
  hx: number,
  hz: number,
  props: PlacedProp[],
) {
  const inv = quat.clone().invert()
  const reach = Math.hypot(hx, hz) + 3.2
  const sweep: PlacedProp[] = []
  for (const p of props) {
    if (PLOT_IGNORE.has(p.kind)) continue
    if (p.position.distanceTo(origin) > reach) continue
    _fpV.copy(p.position).sub(origin).applyQuaternion(inv)
    const scatter = PLOT_SCATTER.has(p.kind)
    const own = scatter ? 0.3 : BULKY_KINDS.has(p.kind) ? 1.9 : 0.9
    if (Math.abs(_fpV.x) < hx + own && Math.abs(_fpV.z) < hz + own) {
      if (!scatter) return null
      sweep.push(p)
    }
  }
  return sweep
}

/** does any part of this footprint lie on a drawn road surface? */
function footprintOffRoad(
  origin: THREE.Vector3,
  quat: THREE.Quaternion,
  hx: number,
  hz: number,
) {
  const v = new THREE.Vector3()
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      v.set((i / 2 - 1) * hx, 0, (j / 2 - 1) * hz).applyQuaternion(quat).add(origin)
      if (corridorSurface(v.normalize()) !== null) return false
    }
  }
  return true
}

/** is any villager standing inside this footprint? */
function footprintFreeOfNpcs(
  origin: THREE.Vector3,
  quat: THREE.Quaternion,
  hx: number,
  hz: number,
) {
  const inv = quat.clone().invert()
  for (const p of npcSpots()) {
    _fpV.copy(p).sub(origin).applyQuaternion(inv)
    if (Math.abs(_fpV.x) < hx + 1.9 && Math.abs(_fpV.z) < hz + 1.9) return false
  }
  return true
}

/** drop props off a plot, in place */
function sweepScatter(props: PlacedProp[], gone: PlacedProp[]) {
  for (const g of gone) {
    const i = props.indexOf(g)
    if (i >= 0) props.splice(i, 1)
  }
  _sweptScatter += gone.length
}
let _sweptScatter = 0
export function sweptScatterCount() {
  return _sweptScatter
}

/** smallest distance from a world point to any villager spawn */
function npcNearest(at: THREE.Vector3) {
  let n = Infinity
  for (const p of npcSpots()) n = Math.min(n, at.distanceTo(p))
  return n
}

/**
 * Stand the zones up along their frontage lines.
 *
 * Everything on one line shares its setback and its facing; a slot that will
 * not take a building slides ALONG the line rather than off it, so the street
 * survives even where the ground does not.
 */
/** placed buildings, kept so the grading pass can measure what it did to them */
let _builtRefs: { row: number; prop: PlacedProp; hl: number; hd: number }[] = []

function placeZoneBuildings(props: PlacedProp[]) {
  const report: ZonePlacement[] = []
  const pads: BuildPad[] = []
  /**
   * Every graded pad on the planet, civic ones included, with the level it
   * grades to. plotGrade resolves overlaps "nearest wins", so two pads whose
   * influence overlaps at different levels put a hard step between them --
   * measured at 2.82u under three SP Road frontages, where a back-lane pad
   * 4.2u further out reached across the front rank. Pads may therefore only
   * overlap when they agree on height.
   */
  const allPads: { dir: THREE.Vector3; radius: number; level: number }[] = _plotSiting
    .filter((q) => q.ok)
    .map((q) => ({ dir: q.dir.clone(), radius: q.radius, level: terrainRadius(q.dir) }))
  _builtRefs = []
  _terraces = []
  _sweptScatter = 0
  let seed = 9600

  for (const zone of ZONES) {
    const streets = ZONE_STREETS[zone.id]
    if (!streets) continue
    const c = new THREE.Vector3(...zone.center).normalize()
    const R = terrainRadius(c)
    const tz = nearestLoopT(c)

    for (let li = 0; li < streets.length; li++) {
      const st = streets[li]
      // centre the whole run on the zone's own arc position
      let run = st.gap * Math.max(0, st.items.length - 1)
      for (const it of st.items) run += 2 * alongHalf(MODELS[it.model])
      let cursor = -run / 2
      const linePads: (BuildPad & { level: number; along: number })[] = []
      /** the last building accepted on this line, so the terrace can continue */
      let prevOn: { along: number; level: number; reach: number } | null = null

      for (const it of st.items) {
        const m = MODELS[it.model]
        const hl = alongHalf(m)
        const hd = acrossHalf(m)
        type Hit = {
          s: number
          f: NonNullable<ReturnType<typeof frontageAt>>
          relief: number
          quat: THREE.Quaternion
          toward: THREE.Vector3
          sweep: PlacedProp[]
          lineFwd: THREE.Vector3
          chain: { dir: THREE.Vector3; radius: number; off: number }[]
        }
        let hit: Hit | null = null

        // Slide ALONG the line, never off it -- and both ways, so a building
        // blocked by an existing stall can back up as well as advance.
        for (let a = 0; a < 41 && !hit; a++) {
          _rej.tried++
          const off = a === 0 ? 0 : (a & 1 ? 1 : -1) * Math.ceil(a / 2) * 1.4
          const s = cursor + hl + off
          // the LINE is the facade; the centre sits its own half-depth behind.
          // SETBACK_FLOOR keeps every pad's grading ramp off the carriageway.
          const centreDist = Math.max(st.dist, SETBACK_FLOOR) + hd
          const f = frontageAt(tz, R, s, st.side, centreDist)
          if (!f) continue
          const g = terrainRadius(f.dir)
          if (g < WATER_LEVEL + 1.0) { _rej.wet++; continue }
          // the near FACE, not the centre, must clear the corridor band
          if (arterialDistance(f.dir) < CORRIDOR_SUPPRESS + hd) { _rej.corridor++; continue }
          if (slopeAt(f.dir, g) > 0.7) { _rej.slope++; continue }
          // Square to the LINE, measured on the line itself. Aiming at the
          // centreline point instead leaves 11-16 deg of error, because the
          // line's own tangent is not the road's tangent once it has been
          // pushed sideways across a curving sphere.
          const lf = lineTangent(tz, R, s, st.side, centreDist, f.dir)
          if (!lf) continue
          // roadward normal of the line, in the tangent plane at f.dir
          const inward = new THREE.Vector3().crossVectors(lf, f.dir).normalize()
          if (inward.dot(f.right) * st.side > 0) inward.negate()
          const toward = m.faceAlong ? lf.clone() : inward
          const spin = spinAlong(f.dir, new THREE.Vector3().crossVectors(f.dir, toward))
          const quat = surfaceQuaternion(f.dir, spin)
          const at = f.dir.clone().multiplyScalar(g)
          // grading a pad is fine; carving a hillside is not
          const rel = rectRelief(at, quat, hl, hd)
          if (rel.drop > 4.2) { _rej.relief++; continue }
          // The whole FOOTPRINT must be dry, not just the centre. Terrain
          // grading is skipped below WATER_LEVEL + 0.48 on purpose (a graded
          // bank would cut dry land under the waterline), so a corner hanging
          // over the shore never gets levelled -- that is exactly where the
          // 2.69u plinth at the ghat came from.
          if (rel.lo < WATER_LEVEL + 0.9) { _rej.wet++; continue }
          if (!footprintOffRoad(at, quat, hl, hd)) { _rej.corridor++; continue }
          // The chain is stepped off the accepted centre in the building's own
          // frame. Re-solving each disc's position on the frontage line looked
          // tidier but the true-distance solve is not continuous in s, so a
          // disc could land 8u from the building it was meant to level --
          // measured: a general store keeping a 2.18u plinth while its own two
          // pads sat somewhere else entirely.
          const chain = padChain(at, quat, hl, hd)
          if (!padChainClearsRoad(chain)) { _rej.corridor++; continue }
          const sweep = footprintFree(at, quat, hl, hd, props)
          if (!sweep) { _rej.props++; continue }
          if (!footprintFreeOfNpcs(at, quat, hl, hd)) { _rej.npc++; continue }
          // pads may abut along a line -- that IS a terrace -- but must not
          // reach into a civic plot, which grades to its own level
          let clash = false
          for (const q of _plotSiting) {
            if (!q.ok) continue
            if (q.dir.angleTo(f.dir) * g < q.radius + Math.hypot(hl, hd) + 0.9) {
              clash = true
              break
            }
          }
          if (clash) { _rej.plot++; continue }
          // A neighbour close enough to share a terrace must be close enough
          // in HEIGHT too. Otherwise the two pads abut at different levels and
          // plotGrade's nearest-wins rule puts a 5u step between them.
          if (
            m.pad !== false &&
            prevOn &&
            s - prevOn.along < prevOn.reach + hl + hd + 3.9 &&
            Math.abs(g - prevOn.level) > 0.9
          ) {
            _rej.relief++
            continue
          }
          if (m.pad !== false) {
            let stepped = false
            for (const q of chain) {
              for (const e of allPads) {
                if (Math.abs(e.level - g) <= 0.9) continue
                if (e.dir.angleTo(q.dir) * g < e.radius + q.radius + PLOT_GRADE_RAMP) {
                  stepped = true
                  break
                }
              }
              if (stepped) break
            }
            if (stepped) { _rej.plot++; continue }
          }
          hit = { s, f, relief: rel.drop, quat, toward, sweep, lineFwd: lf, chain }
        }

        if (!hit) {
          report.push({
            zone: zone.id, line: li, model: it.model, tint: it.tint, road: NaN,
            setback: st.dist, height: modelH(m), facade: NaN, along: NaN,
            chainN: 0, reliefBefore: NaN, reliefAfter: NaN, cutFill: NaN, plinthDepth: NaN,
            ok: false,
          })
          cursor += 2 * hl + st.gap
          continue
        }

        const { dir } = hit.f
        const g = terrainRadius(dir)
        const at = dir.clone().multiplyScalar(g)
        sweepScatter(props, hit.sweep)
        props.push({
          kind: "glb-building",
          position: at,
          quaternion: hit.quat,
          scale: m.scale,
          colorA: it.tint,
          colorB: it.tint,
          seed: seed++,
          modelPath: m.path,
          part: m.part,
          tint: it.tint,
          plinth: m.plinth,
          box: modelBox(m),
        })
        if (m.pad !== false) {
          prevOn = { along: hit.s, level: g, reach: hl + hd + 0.9 }
          for (const q of hit.chain) allPads.push({ dir: q.dir, radius: q.radius, level: g })
        }
        if (m.pad !== false)
        for (const q of hit.chain) {
          linePads.push({ dir: q.dir, radius: q.radius, level: g, along: hit.s + q.off })
        }
        // the facade normal AS BUILT, against the line's own tangent: 90 deg
        // apart is square to the line
        const builtZ = new THREE.Vector3(0, 0, 1).applyQuaternion(hit.quat)
        const ang = (Math.acos(Math.min(1, Math.max(-1, builtZ.dot(hit.lineFwd)))) * 180) / Math.PI
        report.push({
          zone: zone.id, line: li, model: it.model, tint: it.tint,
          // where this building's own FACADE lands, for comparing to setback
          road: arterialDistance(dir) - hd, setback: st.dist, height: modelH(m),
          // square to the line means the facade normal is 90 deg off its
          // tangent; a vehicle is deliberately parallel to it instead
          facade: m.faceAlong ? Math.abs(ang) : Math.abs(90 - ang),
          along: hit.s, chainN: m.pad === false ? 0 : hit.chain.length,
          reliefBefore: hit.relief, reliefAfter: NaN, cutFill: NaN,
          plinthDepth: NaN, ok: true,
        })
        _builtRefs.push({ row: report.length - 1, prop: props[props.length - 1], hl, hd })
        cursor = hit.s + hl + st.gap
      }

      // one terrace per line: every pad on it grades to the SAME level, so a
      // shoulder-to-shoulder row comes out as one continuous frontage instead
      // of a staircase of separate slabs
      // Only NEIGHBOURS share a level. Levelling a whole line together forced
      // an 8.8u cut where two members sat 50u apart on different ground; a
      // terrace is a run of adjoining plots, and a gap in the frontage is
      // where one terrace ends and the next begins.
      const runs: (typeof linePads)[] = []
      const sortedPads = [...linePads].sort((x, y) => x.along - y.along)
      for (const q of sortedPads) {
        const last = runs[runs.length - 1]
        const prev = last?.[last.length - 1]
        // adjoining AND at much the same height. Adjacency alone let a run
        // span 5.3u of hillside, and one shared level then cut 5.5u under its
        // far end and buried that building 2.8u deep in its own plinth.
        const near = prev && q.along - prev.along <= prev.radius + q.radius + 3
        const level = prev && Math.abs(q.level - prev.level) <= 0.9
        if (near && level) last.push(q)
        else runs.push([q])
      }
      for (const run of runs) {
        const levels = run.map((q) => q.level).sort((x, y) => x - y)
        const level = levels[levels.length >> 1]
        let worst = 0
        for (const q of run) {
          worst = Math.max(worst, Math.abs(q.level - level))
          pads.push({ dir: q.dir, radius: q.radius, level })
        }
        _terraces.push({ zone: zone.id, line: li, level, n: run.length, spread: worst })
      }
    }
  }
  _zoneBuilt = report
  _buildPads = pads
}
const _pput = { tried: 0, wet: 0, clear: 0, road: 0 }
export function palacePutReport() {
  return _pput
}
const _prej = { tried: 0, wet: 0, slope: 0, relief: 0, props: 0, npc: 0, plot: 0 }
export function palaceRejectReport() {
  return _prej
}
const _rej = { tried: 0, wet: 0, corridor: 0, slope: 0, relief: 0, props: 0, npc: 0, plot: 0 }
export function rejectReport() {
  return _rej
}

/** one entry per frontage line that got built, for reporting */
export type Terrace = { zone: string; line: number; level: number; n: number; spread: number }
let _terraces: Terrace[] = []
export function terraceReport() {
  return _terraces
}

/**
 * Bengaluru Palace and its grounds.
 *
 * The palace is the zone's CENTREPIECE, so it is sited by ring search out
 * from the haveli centre rather than hung on a frontage line — the arterial
 * was rerouted past the hubs in P54 and the zone centres are the open ground
 * that reroute created. Everything else is then laid out on the approach
 * axis: the great-circle line from the palace door to the nearest point of
 * the road.
 *
 *      road ── gate gap in the boundary wall ── approach ── forecourt ── door
 *                        cypresses and lamps flanking
 *                     lawn between the wall and the palace face
 */
function placePalace(props: PlacedProp[]) {
  const zone = ZONES.find((z) => z.id === "haveli")
  if (!zone) return
  const m = MODELS.palace
  const c = new THREE.Vector3(...zone.center).normalize()
  const R = terrainRadius(c)
  const halfDepth = acrossHalf(m)
  const halfWide = alongHalf(m)
  const t1 = Math.abs(c.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u0 = new THREE.Vector3().crossVectors(t1, c).normalize()
  const v0 = new THREE.Vector3().crossVectors(c, u0).normalize()

  let best: {
    dir: THREE.Vector3
    quat: THREE.Quaternion
    axis: THREE.Vector3
    sweep: PlacedProp[]
    ring: number
  } | null = null

  // Graded passes: first insist on room for a real approach between the door
  // and the road, then drop that, then allow the pad to be cut deeper. A
  // palace with a 4u drive is not a palace, but no palace at all is worse.
  const PASSES = [
    { approach: 9, relief: 4.8 },
    { approach: 0, relief: 4.8 },
    { approach: 0, relief: 7.0 },
  ]
  let usedPass = -1
  for (let pi = 0; pi < PASSES.length; pi++) {
  if (best) break
  const { approach: wantApproach, relief: maxRelief } = PASSES[pi]
  usedPass = pi
  for (let ring = 0; ring <= 46 && !best; ring++) {
    const rr = ring * 0.7
    const steps = ring === 0 ? 1 : 12 + ring * 3
    for (let si = 0; si < steps && !best; si++) {
      const ang = (si / steps) * Math.PI * 2
      const dir = c
        .clone()
        .addScaledVector(u0, (Math.cos(ang) * rr) / R)
        .addScaledVector(v0, (Math.sin(ang) * rr) / R)
        .normalize()
      _prej.tried++
      const g = terrainRadius(dir)
      if (g < WATER_LEVEL + 1.5) {
        _prej.wet++
        continue
      }
      if (slopeAt(dir, g) > 0.7) {
        _prej.slope++
        continue
      }
      // faces the road squarely: local +Z runs down the approach axis
      const road = loopDirRaw(nearestLoopT(dir), new THREE.Vector3())
      const axis = arcTangent(dir, road)
      if (!axis) continue
      const quat = surfaceQuaternion(
        dir,
        spinAlong(dir, new THREE.Vector3().crossVectors(dir, axis)),
      )
      const at = dir.clone().multiplyScalar(g)
      // the front face must stand clear of the road, and no part of the
      // footprint may lie on any drawn road surface
      // same earthworks rule as SETBACK_FLOOR, but stated against the
      // palace's own depth: its pad chain reaches halfDepth + 0.9 + ramp
      if (arterialDistance(dir) < halfDepth + SETBACK_FLOOR + wantApproach) {
        _prej.plot++
        continue
      }
      if (!footprintOffRoad(at, quat, halfWide, halfDepth)) {
        _prej.plot++
        continue
      }
      if (!padChainClearsRoad(padChain(at, quat, halfWide, halfDepth))) {
        _prej.plot++
        continue
      }
      const prel = rectRelief(at, quat, halfWide, halfDepth)
      if (prel.drop > maxRelief) {
        _prej.relief++
        continue
      }
      if (prel.lo < WATER_LEVEL + 0.9) {
        _prej.wet++
        continue
      }
      const sweep = footprintFree(at, quat, halfWide, halfDepth, props)
      if (!sweep) {
        _prej.props++
        continue
      }
      if (!footprintFreeOfNpcs(at, quat, halfWide, halfDepth)) {
        _prej.npc++
        continue
      }
      best = { dir, quat, axis, sweep, ring }
    }
  }
  }

  if (!best) {
    _palace = { sited: "NO ROOM" }
    return
  }

  const { dir: pDir, quat: pQuat, axis } = best
  sweepScatter(props, best.sweep)
  const pG = terrainRadius(pDir)
  const pAt = pDir.clone().multiplyScalar(pG)
  let seed = 9700

  props.push({
    kind: "glb-building",
    position: pAt,
    quaternion: pQuat,
    scale: m.scale,
    colorA: "#e2d6bb",
    colorB: "#e2d6bb",
    seed: seed++,
    modelPath: m.path,
    tint: "#e2d6bb",
    box: modelBox(m),
  })
  for (const q of padChain(pAt, pQuat, halfWide, halfDepth)) {
    _buildPads.push({ dir: q.dir, radius: q.radius, level: pG })
  }

  /**
   * A point on the grounds: `u` world units down the approach axis from the
   * palace centre (toward the road), `v` across it.
   */
  const lateral = new THREE.Vector3().crossVectors(pDir, axis).normalize()
  const ground = (u: number, v: number) =>
    pDir
      .clone()
      .addScaledVector(axis, u / pG)
      .addScaledVector(lateral, v / pG)
      .normalize()

  /** stand one GLB on the grounds, square to the approach */
  const put = (u: number, v: number, spec: ModelSpec, tint: string, minClear: number, along = false) => {
    const d = ground(u, v)
    const gg = terrainRadius(d)
    _pput.tried++
    if (gg < WATER_LEVEL + 0.5) { _pput.wet++; return false }
    const at = d.clone().multiplyScalar(gg)
    if (minClear > 0) {
      let near = Infinity
      for (const q of props) {
        // consecutive paving slabs are MEANT to touch; everything else is not
        if (q.modelPath === spec.path) continue
        if (q.kind === "wire" || PLOT_SCATTER.has(q.kind)) continue
        near = Math.min(near, at.distanceTo(q.position))
      }
      if (near < minClear) { _pput.clear++; return false }
    }
    const ax = arcTangent(d, pDir.clone().addScaledVector(axis, 0.3))
    const face = along ? new THREE.Vector3().crossVectors(d, ax ?? axis) : (ax ?? axis)
    const q = surfaceQuaternion(d, spinAlong(d, new THREE.Vector3().crossVectors(d, face)))
    // nothing on the grounds may overhang the carriageway, paving included
    if (!footprintOffRoad(at, q, alongHalf(spec), acrossHalf(spec))) { _pput.road++; return false }
    props.push({
      kind: "glb-building",
      position: at,
      quaternion: q,
      scale: spec.scale,
      colorA: tint,
      colorB: tint,
      seed: seed++,
      modelPath: spec.path,
      part: spec.part,
      tint,
      plinth: spec.plinth,
      box: modelBox(spec),
    })
    return true
  }

  const paving = MODELS.paving
  const tileLen = paving.src[2] * paving.scale
  const tileWide = paving.src[0] * paving.scale
  const doorU = halfDepth

  // how far down the axis the road is: walk out until the corridor is reached
  let roadU = doorU
  for (let u = doorU; u <= doorU + 60; u += 0.5) {
    if (arterialDistance(ground(u, 0)) <= CORRIDOR_SUPPRESS + 0.4) break
    roadU = u
  }

  // forecourt: two rows of three tiles right at the door
  let laid = 0
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col <= 1; col++) {
      if (put(doorU + 0.4 + row * tileLen, col * tileWide, paving, "#cfc4ae", 1.3)) laid++
    }
  }
  const courtOuter = doorU + 0.4 + 2 * tileLen

  // approach: tiles from the forecourt out to the road
  let approachEnd = courtOuter
  for (let u = courtOuter + tileLen / 2; u <= roadU; u += tileLen) {
    if (put(u, 0, paving, "#cfc4ae", 1.3)) {
      laid++
      approachEnd = u + tileLen / 2
    }
  }

  // boundary wall across the frontage, with a gate gap on the approach axis
  const wall = MODELS.wall
  const segLen = wall.src[0] * wall.scale
  const GATE_HALF = tileWide * 0.9
  const wallU = Math.min(roadU - 1.0, courtOuter + (roadU - courtOuter) * 0.62)
  let walls = 0
  for (let k = -5; k <= 5; k++) {
    const v = k * (segLen + 0.1)
    if (Math.abs(v) < GATE_HALF + segLen / 2) continue
    if (put(wallU, v, wall, "#c9c0ae", 1.2, true)) walls++
  }
  let posts = 0
  for (const sgn of [-1, 1]) {
    if (put(wallU, sgn * (GATE_HALF + 0.3), MODELS.gatepost, "#bdb3a0", 1.2)) posts++
  }

  // cypresses flanking the approach, clear of the paving
  const CY_TINT = ["#4f7a44", "#3f6b3a", "#5a8a4e"]
  let trees = 0
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      // flank the forecourt as well as the approach: the approach is only as
      // long as the ground between the palace and the road allows
      const u = doorU - 1.0 + i * 3.4
      if (put(u, sgn * (halfWide + 1.6), MODELS.cypress, CY_TINT[i % 3], 1.6)) trees++
    }
  }

  // lamps on the approach, using the existing procedural kind
  let lamps = 0
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const u = doorU + 1.6 + i * 5.2
      if (u > roadU) break
      const d = ground(u, sgn * 3.6)
      const gg = terrainRadius(d)
      if (gg < WATER_LEVEL + 0.5) continue
      const at = d.clone().multiplyScalar(gg)
      if (propClearance(at, props).nearest < 1.1) continue
      props.push({
        kind: "lamp-post",
        position: at,
        quaternion: surfaceQuaternion(d, 0),
        scale: 1,
        colorA: KIND_COLORS["lamp-post"]?.[0] ?? "#8a8478",
        colorB: KIND_COLORS["lamp-post"]?.[1] ?? "#e8dcb0",
        seed: seed++,
      })
      lamps++
    }
  }

  // does the approach actually connect? the largest step between consecutive
  // paved centres, and how far the last tile still is from the road
  _palace = {
    "sited at ring": +(best.ring * 0.7).toFixed(2),
    "siting pass (0 = full approach, 2 = deep cut)": usedPass,
    "palace height": +modelH(m).toFixed(2),
    "palace height in players": +(modelH(m) / PLAYER_H).toFixed(2),
    "palace footprint": `${(halfWide * 2).toFixed(1)} x ${(halfDepth * 2).toFixed(1)}`,
    "palace centre from arterial": +arterialDistance(pDir).toFixed(2),
    "door from arterial": +(arterialDistance(pDir) - halfDepth).toFixed(2),
    "forecourt depth": +(2 * tileLen).toFixed(2),
    "approach length door to road": +(approachEnd - doorU).toFixed(2),
    "approach ends this far from the corridor band":
      +(arterialDistance(ground(approachEnd, 0)) - CORRIDOR_SUPPRESS).toFixed(2),
    "paving tile pitch": +tileLen.toFixed(2),
    "wall at": +wallU.toFixed(2),
    "gate gap width": +(2 * (GATE_HALF + 0.3)).toFixed(2),
    "lawn, wall to palace face": +(wallU - doorU).toFixed(2),
    "paving tiles": laid,
    "wall segments": walls,
    "gate posts": posts,
    cypresses: trees,
    lamps,
  }
}


/**
 * Stairs, and only on ground that has somewhere to go.
 *
 * Stairs.glb rises 1.392u over 3.115u of run — a fixed 24 degrees. Standing
 * one on the flat is nonsense, so each is fitted to a patch of hillside whose
 * own drop matches its rise, and any that cannot find one is simply not
 * placed. The prop is seated at the LOW end's ground height, so the bottom
 * step lands exactly on the lower ground and the whole error shows up at the
 * top step, where it is reported.
 */
function placeStairs(props: PlacedProp[]) {
  const fits: StairFit[] = []
  const m = MODELS.stairs
  const runLen = m.src[2] * m.scale
  const rise = m.src[1] * m.scale
  const half = runLen / 2

  const sites: { where: string; at: THREE.Vector3; from: number; to: number }[] = []
  const zoneOf = (id: string) => ZONES.find((z) => z.id === id)
  const ghat = zoneOf("ghat")
  const temple = zoneOf("temple")
  if (ghat) {
    for (let i = 0; i < 4; i++) {
      sites.push({
        where: `ghat descent ${i + 1}`,
        at: new THREE.Vector3(...ghat.center).normalize(),
        from: 2 + i * 0.4, to: 18,
      })
    }
  }
  if (temple) {
    for (let i = 0; i < 3; i++) {
      sites.push({
        where: `temple climb ${i + 1}`,
        at: new THREE.Vector3(...temple.center).normalize(),
        from: 3 + i * 0.4, to: 20,
      })
    }
  }
  // any civic plot whose pad stands clear above the ground beside it
  for (const p of _plotSiting) {
    if (!p.ok) continue
    const rel = padRelief(p.dir, p.radius + PLOT_GRADE_RAMP)
    if (rel.level - rel.lo < rise * 0.6) continue
    sites.push({
      where: `${p.id} pad`,
      at: p.dir.clone(),
      from: p.radius + 0.5,
      to: p.radius + PLOT_GRADE_RAMP + 3,
    })
  }

  let seed = 9900
  const taken: THREE.Vector3[] = []
  for (const site of sites) {
    const base = site.at
    const R = terrainRadius(base)
    const t1 = Math.abs(base.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(t1, base).normalize()
    const v = new THREE.Vector3().crossVectors(base, u).normalize()
    let best: { mid: THREE.Vector3; up: THREE.Vector3; gLo: number; drop: number; err: number } | null = null

    for (let rr = site.from; rr <= site.to && !(best && best.err < 0.02); rr += 0.6) {
      for (let ai = 0; ai < 32; ai++) {
        const a = (ai / 32) * Math.PI * 2
        const mid = base
          .clone()
          .addScaledVector(u, (Math.cos(a) * rr) / R)
          .addScaledVector(v, (Math.sin(a) * rr) / R)
          .normalize()
        const gm = terrainRadius(mid)
        if (gm < WATER_LEVEL) continue
        if (arterialDistance(mid) < CORRIDOR_SUPPRESS + 1.2) continue
        const e1 = new THREE.Vector3().crossVectors(t1, mid).normalize()
        const e2 = new THREE.Vector3().crossVectors(mid, e1).normalize()
        for (let hi = 0; hi < 24; hi++) {
          const h = (hi / 24) * Math.PI * 2
          const dirH = e1.clone().multiplyScalar(Math.cos(h)).addScaledVector(e2, Math.sin(h)).normalize()
          const lo = mid.clone().addScaledVector(dirH, -half / gm).normalize()
          const up = mid.clone().addScaledVector(dirH, half / gm).normalize()
          const gLo = terrainRadius(lo)
          const gHi = terrainRadius(up)
          if (gLo < WATER_LEVEL + 0.02) continue
          const drop = gHi - gLo
          const err = Math.abs(drop - rise)
          if (err > 0.15) continue
          if (best && err >= best.err) continue
          const at = mid.clone().multiplyScalar(gLo)
          if (propClearance(at, props).nearest < 2.2) continue
          if (npcNearest(at) < 2.2) continue
          let clash = false
          for (const tk of taken) {
            if (tk.distanceTo(at) < 3.2) {
              clash = true
              break
            }
          }
          if (clash) continue
          best = { mid, up: dirH, gLo, drop, err }
        }
      }
    }

    if (!best) {
      fits.push({ where: site.where, rise, drop: NaN, bottom: NaN, top: NaN, ok: false })
      continue
    }
    const spin = spinAlong(best.mid, new THREE.Vector3().crossVectors(best.mid, best.up))
    const at = best.mid.clone().multiplyScalar(best.gLo)
    props.push({
      kind: "glb-building",
      position: at,
      quaternion: surfaceQuaternion(best.mid, spin),
      scale: m.scale,
      colorA: "#cfc4ae",
      colorB: "#cfc4ae",
      seed: seed++,
      modelPath: m.path,
      tint: "#c8bfa9",
      plinth: false,
      box: modelBox(m),
    })
    taken.push(at)
    fits.push({
      where: site.where,
      rise,
      drop: best.drop,
      bottom: 0,
      top: Math.abs(best.drop - rise),
      ok: true,
    })
  }
  _stairFits = fits
}

/**
 * Parked vehicles, seating and palm groups along the frontages. They sit just
 * OUTSIDE the corridor suppression band, so they read as kerbside without
 * ever standing on the carriageway.
 */
function placeRoadside(props: PlacedProp[]) {
  const net = NET
  if (!net) return
  type Spot = { t: number; side: number; model: string; tint: string }
  const spots: Spot[] = []
  const CARS: [string, string][] = [
    ["sedan", "#c8543f"], ["sedan", "#4a6f8a"], ["sedan", "#e0c060"],
    ["police-car", "#e8e4da"], ["sports-car", "#b83f52"], ["sedan", "#7a9c6a"],
  ]
  const SEATS: [string, string][] = [["bench", "#8a6a4a"], ["bench", "#6f5638"]]
  for (let i = 0; i < 12; i++) {
    const t = ((i + 0.35) / 12) * net.total
    const [model, tint] = i % 3 === 2 ? SEATS[i % SEATS.length] : CARS[i % CARS.length]
    spots.push({ t, side: i % 2 === 0 ? 1 : -1, model, tint })
  }
  // palm groups all the way round the loop — the cheapest way to make the
  // roadsides read as Bengaluru rather than as bare embankment
  const PALMS: [string, string][] = [
    ["palm1", "#5c8a3f"], ["palm2", "#67965a"], ["palm3", "#4e7a36"],
    ["palm4", "#568444"], ["palm5", "#6a9c5a"],
  ]
  for (let i = 0; i < 14; i++) {
    const t = ((i + 0.8) / 14) * net.total
    for (let k = 0; k < 3; k++) {
      const [model, tint] = PALMS[(i + k * 2) % PALMS.length]
      spots.push({ t: t + (k * 3.4) / 23, side: i % 2 === 0 ? -1 : 1, model, tint })
    }
  }

  let seed = 9800
  const dir = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  for (const s of spots) {
    const m = MODELS[s.model]
    loopDir(s.t, dir)
    loopDir(s.t + 0.01, ahead)
    const fwd = ahead.clone().sub(dir)
    fwd.addScaledVector(dir, -fwd.dot(dir))
    if (fwd.lengthSq() < 1e-12) continue
    fwd.normalize()
    const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
    const g = terrainRadius(dir)
    let done = false
    for (let lat = CORRIDOR_SUPPRESS + 0.6; lat <= CORRIDOR_SUPPRESS + 6 && !done; lat += 0.5) {
      const d = dir.clone().addScaledVector(right, (s.side * lat) / g).normalize()
      const gr = terrainRadius(d)
      if (gr < WATER_LEVEL + 0.8) continue
      if (slopeAt(d, gr) > 0.32) continue
      if (corridorSurface(d) !== null) continue
      const at = d.clone().multiplyScalar(gr)
      if (propClearance(at, props).nearest < 2.2) continue
      if (!npcClearance(at).ok) continue
      props.push({
        kind: "glb-building",
        position: at,
        // vehicles park nose-down-the-road; trees just stand
        quaternion: surfaceQuaternion(d, m.faceAlong ? spinAlong(d, fwd) : 0),
        scale: m.scale,
        colorA: s.tint,
        colorB: s.tint,
        seed: seed++,
        modelPath: m.path,
        part: m.part,
        tint: s.tint,
        plinth: m.plinth,
        box: modelBox(m),
      })
      done = true
    }
  }
}


function placeGlbBuildings(props: PlacedProp[]) {
  let seed = 9100
  for (const b of GLB_BUILDINGS) {
    const site = _plotSiting?.find((s) => s.id === b.plot && s.ok)
    if (!site) continue
    const dir = site.dir.clone().normalize()
    // facade: local +Z faces the nearest point of the corridor centreline.
    // spinAlong aligns local +X, so pass the in-plane perpendicular — the
    // same convention the signboards use.
    const road = loopDir(nearestLoopT(dir), new THREE.Vector3())
    const toward = arcTangent(dir, road)
    const spin = toward ? spinAlong(dir, new THREE.Vector3().crossVectors(dir, toward)) : 0
    // terrainRadius, not groundOrDeck: plots always sit clear of roads and
    // decks, and groundOrDeck would re-enter buildProps via the ride cache
    const h = terrainRadius(dir)
    props.push({
      kind: "glb-building",
      position: dir.clone().multiplyScalar(h),
      quaternion: surfaceQuaternion(dir, spin),
      scale: b.scale,
      colorA: "#ffffff",
      colorB: "#ffffff",
      seed: seed++,
      modelPath: b.path,
      box: b.box,
    })
  }
}

/* ------------------------------------------------------- arterial corridor */

/** the nine consecutive zone pairs of the metro tour — the arterial network */
export const ARTERIAL_PAIRS: [string, string][] = METRO_ZONE_IDS.map((id, i) => [
  id,
  METRO_ZONE_IDS[(i + 1) % METRO_ZONE_IDS.length],
])

type Arterial = { a: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3; omega: number }

const ARTERIAL_ARCS: Arterial[] = (() => {
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const arcs: Arterial[] = []
  for (const [ia, ib] of ARTERIAL_PAIRS) {
    const za = byId.get(ia)
    const zb = byId.get(ib)
    if (!za || !zb) continue
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    arcs.push({ a, b, n: new THREE.Vector3().crossVectors(a, b).normalize(), omega: a.angleTo(b) })
  }
  return arcs
})()

const _artProbe = new THREE.Vector3()

/** lateral world distance from `dir` to the nearest arterial centreline */
/**
 * World distance to the arterial CENTRELINE — the line the corridor is
 * actually drawn from, i.e. the metro loop.
 *
 * This used to measure to the great-circle arcs between zone centres, which
 * was near enough while the loop hugged them. Once the loop was offset to pass
 * the hubs tangentially (P54) the two diverge by up to 9u, and every consumer
 * of this — road-furniture suppression, civic plot clearance, signboard and
 * signal placement — was aiming at empty ground while the road ran elsewhere.
 */
export function arterialDistance(dir: THREE.Vector3) {
  return loopAngle(dir) * terrainRadius(dir)
}

/* --- cross-section, in world units either side of the centreline --------- */

const CORRIDOR_STEP = 0.015
/** guardrails and tufts stand down inside this half-width; footpaths replace them */
// full shoulder reach 5.55 (SKIRT_OUT), plus the <=0.455u the spline road
// drifts from the great-circle arcs arterialDistance measures against (P37),
// plus margin. At 4.8 furniture planted at raw-terrain height stood buried
// inside the raised embankment band the wider shoulder now covers.
export const CORRIDOR_SUPPRESS = 6.2
const ASPHALT_LIFT = 0.06
const PAINT_LIFT = 0.12
const MEDIAN_TOP = 0.2
const FOOTPATH_TOP = 0.16
/**
 * Highway cross-section, half-widths from the centreline.
 *
 * The median widened from 0.25 to 0.55 because it never held what it was for:
 * a pillar footing is 0.7 across and P35 measured every one of them spilling
 * past the old edge into the carriageway. 0.50 contained them but only by 12mm
 * at worst — a footing turned toward 45 degrees reaches 0.495u — so it carries
 * 0.55 to leave the margin a real one. Carriageways then doubled to 2.6u so
 * each side carries two lanes rather than one, which is what the dashed divider
 * at LANE_MID now separates.
 */
const LANE_IN = 0.55
const LANE_OUT = 3.15
/** dashed divider between the two lanes of one carriageway */
const LANE_MID = (LANE_IN + LANE_OUT) / 2
const MEDIAN_HALF = 0.55
const FOOT_IN = 3.15
const FOOT_OUT = 3.95
/** half-width of a painted line: 0.12u lines read as markings, 0.05u did not */
const MARK_HALF = 0.06
const DASH_ON = 0.55
const DASH_PERIOD = 1.4
/** median breaks this close to a metro pillar footing */
const PILLAR_CLEAR = 1.2
/**
 * A median vertex sits up to this far from its centreline sample, so the break
 * is widened by it — otherwise the 1.2u rule holds at the centreline while a
 * corner still creeps to 0.97u.
 */
const MEDIAN_REACH = Math.hypot(MEDIAN_HALF, MEDIAN_TOP)
/** half-width of a metro pillar's 0.7 x 0.7 footing box */
const FOOTING_HALF = 0.35
/**
 * Skip a footing outright beyond this 3D range. Flattening onto the tangent
 * plane discards radial separation, so without a real distance gate a footing on
 * the far side of the planet reads as adjacent — the same trap P31 hit.
 */
const FOOTING_SKIP_SQ = (FOOTING_HALF + MEDIAN_REACH + PILLAR_CLEAR) ** 2
/** half-step used for the central-difference tangent along the loop */
const TANGENT_EPS = 0.004

/**
 * Gap between a point and a pillar footing, in the tangent plane at that point.
 * 0 means the point is inside the box.
 */
function footingGap(
  pt: THREE.Vector3,
  up: THREE.Vector3,
  f: { at: THREE.Vector3; axisX: THREE.Vector3; axisZ: THREE.Vector3 },
) {
  const d = _footGap.copy(pt).sub(f.at)
  d.addScaledVector(up, -d.dot(up))
  const ox = Math.max(0, Math.abs(d.dot(f.axisX)) - FOOTING_HALF)
  const oz = Math.max(0, Math.abs(d.dot(f.axisZ)) - FOOTING_HALF)
  return Math.hypot(ox, oz)
}

const _footGap = new THREE.Vector3()
/**
 * Cross-slope clamp. The corridor is a graded roadway, not a terrain drape:
 * an edge may sit at most tan(this) x its lateral offset from the centreline
 * height. 0.12 was a guess and far too tight for this terrain — 64% of the
 * corridor demanded more, so the ground erupted through the deck. Measured
 * requirement: p90 = 0.46 rad, which is what this now allows.
 */
const MAX_TWIST = 0.46
/**
 * The verge apron reaches this far out, blending the deck edge into the ground.
 * Held at 0.6u beyond the footpath, as it was before the widening.
 */
// ROAD_MAX_FILL (the 1.2u fill cap vs the natural ground) is owned by
// terrain.ts since P47, alongside the profile it bounds.
/**
 * Lateral distance over which the shoulder smoothsteps from the footpath edge
 * down to the natural ground, so remaining fill reads as an embankment rather
 * than a wall (the old 0.6u linear face hit 63 degrees at full fill).
 */
const SHOULDER_FALLOFF = 1.6
const SKIRT_OUT = FOOT_OUT + SHOULDER_FALLOFF
/**
 * Hard sprawl limit for the adaptive embankment (below). Sized for the worst
 * measured edge drop (~1.4u) at a 1:2 slope; NOTE this exceeds SKIRT_OUT by
 * 1.2u laterally, so where the drop is large the skirt reaches to 6.75u —
 * beyond BUILDING_SETBACK (5.1) though still inside CORRIDOR_SUPPRESS (6.2).
 */
const SHOULDER_MAX = 2.8

const CORRIDOR_COLORS = {
  asphalt: "#5a5a60",
  paint: "#e8e4da",
  median: "#b8b2a6",
  footpath: "#cfc4ae",
}

/** growable indexed triangle soup, optionally carrying per-vertex colour */
class MeshBuf {
  pos: number[] = []
  idx: number[] = []
  col: number[] = []
  vert(v: THREE.Vector3, c?: THREE.Color) {
    this.pos.push(v.x, v.y, v.z)
    if (c) this.col.push(c.r, c.g, c.b)
    return this.pos.length / 3 - 1
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    const ia = this.vert(a)
    const ib = this.vert(b)
    const ic = this.vert(c)
    const id = this.vert(d)
    this.idx.push(ia, ib, ic, ia, ic, id)
  }
  /** same winding as quad(), with a colour per corner */
  quadC(
    a: THREE.Vector3,
    ca: THREE.Color,
    b: THREE.Vector3,
    cb: THREE.Color,
    c: THREE.Vector3,
    cc: THREE.Color,
    d: THREE.Vector3,
    cd: THREE.Color,
  ) {
    const ia = this.vert(a, ca)
    const ib = this.vert(b, cb)
    const ic = this.vert(c, cc)
    const id = this.vert(d, cd)
    this.idx.push(ia, ib, ic, ia, ic, id)
  }
  get empty() {
    return this.idx.length === 0
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3))
    if (this.col.length) g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeVertexNormals()
    return g
  }
}

type Sample = {
  dir: THREE.Vector3
  right: THREE.Vector3
  ground: number
  dry: boolean
  medianOk: boolean
  s: number
  /**
   * Fan-fold guard: on the inside of a bend, cross-sections cross each other
   * once the lateral offset passes the local turn radius, and the doubled
   * surface z-fights with itself — P43 measured 24 fighting pairs at the
   * bazaar corner. These cap how far each side of the section may reach;
   * Infinity on straights.
   */
  capL: number
  capR: number
  /** like capL/capR but for the apron, which yields to ANY foreign band */
  skirtCapL: number
  skirtCapR: number
}

/** point `o` units to the right of the centreline, `lift` above the ground */
function crossPoint(s: Sample, o: number, lift: number, groundAt: number) {
  const h = groundAt + lift
  return s.dir.clone().addScaledVector(s.right, o / h).normalize().multiplyScalar(h)
}

/** ground height at lateral offset `o`, clamped to the cross-slope limit */
function edgeGround(s: Sample, o: number) {
  const probe = s.dir.clone().addScaledVector(s.right, o / s.ground).normalize()
  const raw = terrainRadius(probe)
  const limit = Math.abs(o) * Math.tan(MAX_TWIST)
  return s.ground + Math.max(-limit, Math.min(limit, raw - s.ground))
}

export type CorridorMesh = {
  key: string
  geometry: THREE.BufferGeometry
  color: string
  /** the verge apron carries terrain colours per vertex */
  vertexColors?: boolean
}


/**
 * Half-window of the deck's height smoothing, in corridor samples (~0.6u each),
 * and the light second pass that follows it.
 */

const _dryProbe = new THREE.Vector3()

/**
 * Is a deck of THIS road pair hanging well above here? Only the leg's OWN
 * bridge may suppress it — the generic "any deck overhead" test also erased
 * corridor stretches passing legitimately under another road's viaduct (the
 * haveli-bazaar span hangs over the loop near the haveli hub, and the road
 * below it vanished).
 */
function ownDeckAbove(dir: THREE.Vector3, ground: number, idA: string, idB: string) {
  for (const d of decks()) {
    let t: number
    let lateral: number
    if (d.span.onLoop) {
      // an arterial deck belongs to the corridor by construction — the
      // corridor and the deck are both on the loop
      t = nearestLoopT(dir)
      const total = METRO_LOOP.total
      while (t < d.span.tA - total / 2) t += total
      while (t > d.span.tA + total / 2) t -= total
      if (t < d.span.tA || t > d.span.tB) continue
      lateral = loopAngle(dir) * d.deckR
    } else {
      const [pa, pb] = ROAD_PAIRS[d.span.road]
      if (!((pa === idA && pb === idB) || (pa === idB && pb === idA))) continue
      t = Math.atan2(dir.dot(d.perp), dir.dot(d.a))
      if (t < d.span.tA || t > d.span.tB) continue
      lateral = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(d.n))))) * d.deckR
    }
    if (lateral > d.span.halfWidth) continue
    // An arterial deck owns its span outright. Height is not the test: the
    // deck meets the road exactly at both ramp feet, so between them the deck
    // IS the road. Judging by height instead let the corridor carry on
    // underneath the deck and then stop dead in mid-air over the gorge, which
    // is what dropped the player into the water.
    //
    // The claim stops short of the feet by DECK_OVERLAP so the road runs a
    // little way ONTO each ramp end. There the two surfaces are the same
    // height, so the overlap is invisible — and without it neither covers the
    // foot itself and there is a hole at each end of every bridge.
    if (d.span.onLoop) return t > d.span.tA + DECK_OVERLAP && t < d.span.tB - DECK_OVERLAP
    // 2.5u: only the genuinely diving ghost road is culled — at +1 the rule
    // also bit under the descending ramp feet and punched 1u holes in the
    // road right before each bridge (measured, all four dry-land holes)
    if (bridgeHeight(d.span, t, d.bankA, d.bankB, d.deckR) + DECK_TOP > ground + 2.5) return true
  }
  return false
}

/**
 * ONE dry rule for a corridor cross-section, shared by the mesh sampler and
 * the ride sampler so the drawn road and the walkable road always agree.
 */
function corridorSampleDry(
  dir: THREE.Vector3,
  right: THREE.Vector3,
  ground: number,
  idA: string,
  idB: string,
) {
  // the deck height itself must clear the water — near a crossing the graded
  // terrain can read dry while the profile is still down in the gorge
  if (ground < WATER_LEVEL + 0.3) return false
  // tested against the real ground: a filled hollow must not let the road
  // march out over water. The centre, or BOTH verges, must be wet — a single
  // verge grazing a lakeshore used to punch a one-segment hole in an
  // otherwise dry road, which reads far worse than a kerb over the shallows
  if (terrainRadius(dir) < WATER_LEVEL + 0.48) return false
  const wetL =
    terrainRadius(_dryProbe.copy(dir).addScaledVector(right, FOOT_OUT / ground).normalize()) <
    WATER_LEVEL + 0.48
  const wetR =
    terrainRadius(_dryProbe.copy(dir).addScaledVector(right, -FOOT_OUT / ground).normalize()) <
    WATER_LEVEL + 0.48
  if (wetL && wetR) return false
  // this leg's own deck well overhead carries the stretch (the level gorge
  // viaducts) — don't draw the diving ghost road underneath it
  if (ownDeckAbove(dir, ground, idA, idB)) return false
  return true
}

/**
 * The road's height profile is owned by terrain.ts since P47 (the ground is
 * graded to it); this just samples `loopProfileAt` per leg step.
 */
function corridorProfile(tA: number, span: number, steps: number) {
  const out: number[] = []
  for (let i = 0; i <= steps; i++) out.push(loopProfileAt(tA + (i / steps) * span))
  return out
}

/** the whole arterial cross-section, merged into one geometry per element */
export function buildCorridors(props: PlacedProp[]): CorridorMesh[] {
  const out: CorridorMesh[] = []
  // The corridor rides the metro's own spline, so it can only be built once the
  // network exists. buildProps() lays the viaduct before this is ever called.
  const net = NET
  if (!net) return out

  const footings = props
    .filter((p) => p.kind === "metro-pillar")
    .map((p) => ({
      at: p.position,
      axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion),
      axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion),
    }))

  // Each arterial leg is the stretch of loop between the two stations that
  // bracket it. stations[] is built in METRO_ORDER, the same order ARTERIAL_PAIRS
  // derives from, and each carries its own arc-length position `t`.
  const tOf = new Map(net.stations.map((s) => [s.zone, s.t]))

  /** raised kerbs stop this far from a station: the junction plaza */
  const JUNCTION_CLEAR = 6.5
  const junctionDirs = net.stations.map((s) => loopDir(s.t, new THREE.Vector3()).clone())
  /**
   * Bridge mouths get the same treatment as junctions.
   *
   * The deck has no median -- it is a flat carriageway between parapets --
   * while the road it meets carries a MEDIAN_TOP kerb down its centreline. So
   * walking the centre line onto a bridge you step MEDIAN_TOP - ASPHALT_LIFT
   * = 0.140u down at the mouth. That is the whole of the handoff figure that
   * went 0.005u -> 0.140u; it was not P56 that did it, it appeared when the
   * deck was tied to the road profile and stopped standing proud of the road.
   * Ending the kerb short of the deck, the way it already ends short of a
   * junction, removes the step instead of papering over it.
   */
  const mouthDirs: THREE.Vector3[] = []
  for (const d of bridgeSpans()) {
    if (!d.onLoop) continue
    mouthDirs.push(loopDir(d.tA, new THREE.Vector3()).clone())
    mouthDirs.push(loopDir(d.tB, new THREE.Vector3()).clone())
  }
  /** how far back from a deck end the median and footpath stop */
  const MOUTH_CLEAR = 2.4

  const legsData: { ai: number; samples: Sample[]; steps: number }[] = []

  ARTERIAL_PAIRS.forEach(([idA, idB], ai) => {
    const tA = tOf.get(idA)
    const tB = tOf.get(idB)
    if (tA === undefined || tB === undefined) return
    // walk forward along the closed loop, wrapping at the seam
    const span = (((tB - tA) % net.total) + net.total) % net.total
    if (span < CORRIDOR_STEP) return

    const steps = Math.max(2, Math.ceil(span / CORRIDOR_STEP))
    const samples: Sample[] = []
    const dir = new THREE.Vector3()
    const deckProfile = corridorProfile(tA, span, steps)
    const ahead = new THREE.Vector3()
    const behind = new THREE.Vector3()
    const fwd = new THREE.Vector3()

    for (let i = 0; i <= steps; i++) {
      const t = tA + (i / steps) * span
      loopDir(t, dir)
      // central difference for the tangent: the resampled loop is piecewise
      // linear, and a one-sided difference kinks at every sample boundary
      loopDir(t + TANGENT_EPS, ahead)
      loopDir(t - TANGENT_EPS, behind)
      fwd.copy(ahead).sub(behind)
      fwd.addScaledVector(dir, -fwd.dot(dir))
      if (fwd.lengthSq() < 1e-12) continue
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
      // the rideable profile, not raw ground: see corridorProfile
      const ground = deckProfile[i]
      const centre = dir.clone().multiplyScalar(ground)
      // Break the median where a pillar's footing actually reaches into it,
      // measured box-to-band the way every clearance test has since P29 — the
      // old centre-distance test opened gaps for pillars nowhere near the strip
      // and, once the two curves diverged, was aimed at the wrong place anyway.
      let medianOk = true
      for (const f of footings) {
        if (centre.distanceToSquared(f.at) > FOOTING_SKIP_SQ) continue
        if (footingGap(centre, dir, f) < MEDIAN_HALF) {
          medianOk = false
          break
        }
      }
      samples.push({
        dir: dir.clone(),
        right,
        capL: Infinity,
        capR: Infinity,
        skirtCapL: Infinity,
        skirtCapR: Infinity,
        ground,
        dry: corridorSampleDry(dir, right, ground, idA, idB),
        medianOk,
        // GLOBAL ride distance, not a per-leg run: dash windows key off this
        s: loopWorldS(t),
      })
    }

    // Local turn radius per sample, from the angle between neighbouring chords.
    // The inner side of the bend is capped at just under that radius: on a
    // circular arc, cross-sections whose lateral reach stays below the radius
    // can never cross, so the fold (and its z-fight) never exists. The trimmed
    // area is exactly the area the neighbouring sections already cover.
    for (let i = 1; i < samples.length - 1; i++) {
      const sm = samples[i]
      const v1 = samples[i].dir.clone().sub(samples[i - 1].dir)
      const v2 = samples[i + 1].dir.clone().sub(samples[i].dir)
      const f1 = v1.clone().addScaledVector(sm.dir, -v1.dot(sm.dir))
      const f2 = v2.clone().addScaledVector(sm.dir, -v2.dot(sm.dir))
      if (f1.lengthSq() < 1e-14 || f2.lengthSq() < 1e-14) continue
      f1.normalize()
      f2.normalize()
      const turn = Math.asin(
        Math.max(-1, Math.min(1, f1.clone().cross(f2).dot(sm.dir))),
      )
      if (Math.abs(turn) < 1e-6) continue
      const ds = 0.5 * (v1.length() + v2.length()) * sm.ground
      const cap = (ds / Math.abs(turn)) * 0.95
      // turning toward the right makes the right side the inside of the bend;
      // cross(f1, f2) points along -dir in that case
      if (turn < 0) sm.capR = Math.min(sm.capR, cap)
      else sm.capL = Math.min(sm.capL, cap)
    }

    legsData.push({ ai, samples, steps })
  })

  // Requested P44 debug output — the cap, verified live on every build. There
  // is no debug flag or HUD channel in this project, so console.log only.
  {
    let maxFill = 0
    let over = 0
    let maxGrade = 0
    for (const leg of legsData) {
      for (let i = 0; i < leg.samples.length; i++) {
        const smp = leg.samples[i]
        if (!smp.dry) continue
        const fill = smp.ground - terrainRadius(smp.dir)
        if (fill > maxFill) maxFill = fill
        if (fill > ROAD_MAX_FILL + 1e-6) over++
        const prev = leg.samples[i - 1]
        if (i > 0 && prev.dry) {
          const stepW = smp.dir.angleTo(prev.dir) * smp.ground
          if (stepW > 1e-6) {
            maxGrade = Math.max(maxGrade, Math.abs(smp.ground - prev.ground) / stepW)
          }
        }
      }
    }
    console.log(
      `[road] max fill ${maxFill.toFixed(2)}u (cap ${ROAD_MAX_FILL}), over-cap samples ${over}, max grade ${maxGrade.toFixed(2)}`,
    )
  }

  /**
   * Wedge trim. At sharp tour corners the incoming and outgoing stretches of
   * ribbon double-cover the wedge between them with no local fold at all —
   * P43's raycast found 56 doubly-covered probes at the bazaar corner, 24 of
   * them z-fighting. Any lateral reach that lands inside the band of an
   * EARLIER, non-neighbouring stretch is surrendered to it, so exactly one
   * surface survives at every point, deterministically. The skirt additionally
   * yields to ANY foreign band in either direction: an apron under someone
   * else's asphalt is only ever a z-fight.
   */
  {
    type Seg = { c0: THREE.Vector3; c1: THREE.Vector3; gi: number }
    const segs: Seg[] = []
    const flat: { s: Sample; gi: number }[] = []
    let gi = 0
    for (const leg of legsData) {
      for (let i = 0; i < leg.samples.length; i++) {
        flat.push({ s: leg.samples[i], gi: gi + i })
        if (i < leg.samples.length - 1) {
          segs.push({
            c0: leg.samples[i].dir.clone().multiplyScalar(leg.samples[i].ground),
            c1: leg.samples[i + 1].dir
              .clone()
              .multiplyScalar(leg.samples[i + 1].ground),
            gi: gi + i,
          })
        }
      }
      gi += leg.samples.length
    }
    const totalIdx = gi
    const wrapFar = (a: number, b: number) => {
      const d = Math.abs(a - b)
      return Math.min(d, totalIdx - d) > 8
    }
    const _wp = new THREE.Vector3()
    const _wab = new THREE.Vector3()
    const distToSeg = (pt: THREE.Vector3, sg: Seg) => {
      _wab.copy(sg.c1).sub(sg.c0)
      const len2 = _wab.lengthSq()
      const t =
        len2 < 1e-12
          ? 0
          : Math.max(0, Math.min(1, _wp.copy(pt).sub(sg.c0).dot(_wab) / len2))
      return _wp.copy(sg.c0).addScaledVector(_wab, t).distanceTo(pt)
    }
    for (const { s, gi: si } of flat) {
      const centre = s.dir.clone().multiplyScalar(s.ground)
      const near = segs.filter(
        (sg) => wrapFar(si, sg.gi) && sg.c0.distanceTo(centre) < 14,
      )
      if (!near.length) continue
      for (const sign of [1, -1] as const) {
        let firstEarlier = Infinity
        let firstAny = Infinity
        for (let o = 0.5; o <= FOOT_OUT + SHOULDER_MAX + 1e-6; o += 0.5) {
          const pt = centre.clone().addScaledVector(s.right, sign * o)
          for (const sg of near) {
            if (distToSeg(pt, sg) >= FOOT_OUT - 0.05) continue
            if (o < firstAny) firstAny = o
            if (sg.gi < si && o < firstEarlier) firstEarlier = o
          }
          if (firstEarlier < Infinity) break
        }
        const toCap = (first: number) => {
          if (first === Infinity) return Infinity
          // Meet the neighbouring band with a hairline seam instead of
          // surrendering the whole side: the old 0.25u margin + 0.6u sliver
          // floor cut entire carriageway sides at hub corners, and with the
          // ground now graded flush the missing tarmac read as a broken road
          // (it used to hide against the embankment). 0.05 keeps the bands
          // from overlapping, so the P43 z-fight guarantee stands.
          return Math.max(0, first - 0.05)
        }
        const cap = toCap(firstEarlier)
        const skirtCap = toCap(firstAny)
        if (sign === 1) {
          s.capR = Math.min(s.capR, cap)
          s.skirtCapR = Math.min(s.skirtCapR, skirtCap)
        } else {
          s.capL = Math.min(s.capL, cap)
          s.skirtCapL = Math.min(s.skirtCapL, skirtCap)
        }
      }
    }
  }

  legsData.forEach(({ ai, samples, steps }) => {
    const asphalt = new MeshBuf()
    const paint = new MeshBuf()
    const median = new MeshBuf()
    const footpath = new MeshBuf()
    const skirt = new MeshBuf()

    /**
     * Ground colour where the apron meets the land, so it reads as earth.
     * Near hubs the straight-out probe often lands on ANOTHER leg's painted
     * terrain ribbon and the apron came out road-grey — the dark rounded
     * patches of P43 (21% of near-hub skirt verts). Walk outward past any
     * paint before sampling; if paint persists, take the last probe anyway.
     */
    const groundColour = (s: Sample, o: number) => {
      const c = new THREE.Color()
      const step = Math.sign(o) || 1
      for (let k = 0; ; k++) {
        const probe = s.dir
          .clone()
          .addScaledVector(s.right, (o + step * k * 0.8) / s.ground)
          .normalize()
        if (roadDistance(probe) >= 1.5 || k === 6) {
          terrainColor(probe, terrainRadius(probe), c)
          return c
        }
      }
    }
    /**
     * Verge apron. The deck is graded, the land is not, so its outer edge sits
     * above or below the ground by a variable amount. This closes that step
     * with a sloped face — a cut bank where the land is higher, fill where it
     * is lower — instead of leaving a torn edge for terrain to show through.
     */
    /**
     * Point on the shoulder at lateral `o`: smoothstepped from the footpath's
     * outer top down to the natural ground across SHOULDER_FALLOFF, so an
     * embankment curves into the land instead of dropping as a flat wall.
     *
     * The vertex is placed with crossPoint's convention — lateral offset
     * divided by the point's OWN height — so at f = 0 this reproduces the
     * footpath's outer-top vertex exactly and the shoulder shares its edge
     * with the footpath mesh (review caught a 0.03–0.33u crack when the two
     * used different conventions). `fOverride` pins the trimmed outer edge to
     * the ground (f = 1): a shoulder cut short by the hub wedge trim must
     * still bury its edge in the terrain, not hang mid-blend in the air.
     */
    const shoulderPoint = (s: Sample, o: number, reach: number, fOverride?: number) => {
      const probe = s.dir.clone().addScaledVector(s.right, o / s.ground).normalize()
      const rawH = terrainRadius(probe)
      const eProbe = s.dir
        .clone()
        .addScaledVector(s.right, (Math.sign(o) * FOOT_OUT) / s.ground)
        .normalize()
      const h =
        fOverride === 1
          ? rawH
          : shoulderHeight(s.ground, terrainRadius(eProbe), rawH, Math.abs(o), reach)
      return s.dir.clone().addScaledVector(s.right, o / h).normalize().multiplyScalar(h)
    }

    /** embankment reach for this sample/side — same probes the ride surface uses */
    const skirtReach = (s: Sample, sign: 1 | -1) => {
      const eProbe = s.dir
        .clone()
        .addScaledVector(s.right, (sign * FOOT_OUT) / s.ground)
        .normalize()
      const oProbe = s.dir
        .clone()
        .addScaledVector(s.right, (sign * SKIRT_OUT) / s.ground)
        .normalize()
      return shoulderReach(s.ground, terrainRadius(eProbe), terrainRadius(oProbe))
    }

    const skirtSide = (s0: Sample, s1: Sample, sign: 1 | -1) => {
      const reach0 = skirtReach(s0, sign)
      const reach1 = skirtReach(s1, sign)
      const rMax = Math.max(reach0, reach1)
      const trimmed = foldTrim(
        s0,
        s1,
        Math.min(sign * FOOT_OUT, sign * (FOOT_OUT + rMax)),
        Math.max(sign * FOOT_OUT, sign * (FOOT_OUT + rMax)),
        true,
      )
      if (!trimmed) return
      const inner = sign === 1 ? trimmed[0] : trimmed[1]
      const outerT = sign === 1 ? trimmed[1] : trimmed[0]
      // each sample runs out to its own reach, capped by the wedge trim
      const outFor = (reach: number) =>
        sign === 1
          ? Math.min(sign * (FOOT_OUT + reach), outerT)
          : Math.max(sign * (FOOT_OUT + reach), outerT)
      const o0max = outFor(reach0)
      const o1max = outFor(reach1)
      const pin0 = Math.abs(o0max) < FOOT_OUT + reach0 - 1e-4
      const pin1 = Math.abs(o1max) < FOOT_OUT + reach1 - 1e-4
      // three strips trace the smoothstep; one flat quad cannot curve
      const STRIPS = 3
      const rows0: THREE.Vector3[] = []
      const rows1: THREE.Vector3[] = []
      const cols0: THREE.Color[] = []
      const cols1: THREE.Color[] = []
      for (let k = 0; k <= STRIPS; k++) {
        const a0 = inner + ((o0max - inner) * k) / STRIPS
        const a1 = inner + ((o1max - inner) * k) / STRIPS
        rows0.push(shoulderPoint(s0, a0, reach0, k === STRIPS && pin0 ? 1 : undefined))
        rows1.push(shoulderPoint(s1, a1, reach1, k === STRIPS && pin1 ? 1 : undefined))
        cols0.push(groundColour(s0, a0))
        cols1.push(groundColour(s1, a1))
      }
      for (let k = 0; k < STRIPS; k++) {
        // wind by increasing lateral offset so normals face outward
        if (sign === 1) {
          skirt.quadC(
            rows0[k], cols0[k + 1], rows0[k + 1], cols0[k + 1],
            rows1[k + 1], cols1[k + 1], rows1[k], cols1[k + 1],
          )
        } else {
          skirt.quadC(
            rows0[k + 1], cols0[k + 1], rows0[k], cols0[k + 1],
            rows1[k], cols1[k + 1], rows1[k + 1], cols1[k + 1],
          )
        }
      }
    }

    /** trim a lateral span to both samples' fold caps; null = fully folded */
    const foldTrim = (s0: Sample, s1: Sample, oL: number, oR: number, skirtToo = false) => {
      let capL = Math.min(s0.capL, s1.capL)
      let capR = Math.min(s0.capR, s1.capR)
      if (skirtToo) {
        capL = Math.min(capL, s0.skirtCapL, s1.skirtCapL)
        capR = Math.min(capR, s0.skirtCapR, s1.skirtCapR)
      }
      const L = Math.max(oL, -capL)
      const R = Math.min(oR, capR)
      return L < R - 1e-6 ? ([L, R] as const) : null
    }

    const flat = (m: MeshBuf, s0: Sample, s1: Sample, oL: number, oR: number, lift: number) => {
      const trimmed = foldTrim(s0, s1, oL, oR)
      if (!trimmed) return
      ;[oL, oR] = trimmed
      const g0L = edgeGround(s0, oL)
      const g0R = edgeGround(s0, oR)
      const g1L = edgeGround(s1, oL)
      const g1R = edgeGround(s1, oR)
      m.quad(
        crossPoint(s0, oL, lift, g0L),
        crossPoint(s0, oR, lift, g0R),
        crossPoint(s1, oR, lift, g1R),
        crossPoint(s1, oL, lift, g1L),
      )
    }

    const raised = (m: MeshBuf, s0: Sample, s1: Sample, oL: number, oR: number, top: number) => {
      const trimmed = foldTrim(s0, s1, oL, oR)
      if (!trimmed) return
      ;[oL, oR] = trimmed
      const g0L = edgeGround(s0, oL)
      const g0R = edgeGround(s0, oR)
      const g1L = edgeGround(s1, oL)
      const g1R = edgeGround(s1, oR)
      const t0L = crossPoint(s0, oL, top, g0L)
      const t0R = crossPoint(s0, oR, top, g0R)
      const t1R = crossPoint(s1, oR, top, g1R)
      const t1L = crossPoint(s1, oL, top, g1L)
      const b0L = crossPoint(s0, oL, ASPHALT_LIFT, g0L)
      const b0R = crossPoint(s0, oR, ASPHALT_LIFT, g0R)
      const b1R = crossPoint(s1, oR, ASPHALT_LIFT, g1R)
      const b1L = crossPoint(s1, oL, ASPHALT_LIFT, g1L)
      m.quad(t0L, t0R, t1R, t1L) // top
      m.quad(t0R, b0R, b1R, t1R) // outer face
      m.quad(b0L, t0L, t1L, b1L) // inner face
    }

    /**
     * A sample interpolated between two real ones, for cutting a dash exactly
     * at its window edge instead of quantising to whole 0.6u segments (which
     * drew dashes only in 0.6/1.2u lengths — the aliasing of P44). Caps take
     * the conservative min of both parents; over-trimming a 0.12u-wide dash
     * by a hair is invisible, an untrimmed one poking into a fold is not.
     */
    const lerpSample = (s0: Sample, s1: Sample, f: number): Sample => ({
      dir: s0.dir.clone().lerp(s1.dir, f).normalize(),
      right: s0.right.clone().lerp(s1.right, f).normalize(),
      ground: s0.ground + (s1.ground - s0.ground) * f,
      capL: Math.min(s0.capL, s1.capL),
      capR: Math.min(s0.capR, s1.capR),
      skirtCapL: Math.min(s0.skirtCapL, s1.skirtCapL),
      skirtCapR: Math.min(s0.skirtCapR, s1.skirtCapR),
      dry: true,
      medianOk: true,
      s: s0.s + (s1.s - s0.s) * f,
    })

    /** dash-window overlaps with [sA, sB], as fractions of the segment */
    const dashSpans = (sA: number, sB: number) => {
      const out: [number, number][] = []
      if (sB <= sA + 1e-6) return out
      for (let k = Math.floor(sA / DASH_PERIOD); k * DASH_PERIOD < sB; k++) {
        const lo = Math.max(sA, k * DASH_PERIOD)
        const hi = Math.min(sB, k * DASH_PERIOD + DASH_ON)
        if (hi > lo + 1e-4) out.push([(lo - sA) / (sB - sA), (hi - sA) / (sB - sA)])
      }
      return out
    }

    for (let i = 0; i < steps; i++) {
      const s0 = samples[i]
      const s1 = samples[i + 1]
      if (!s0.dry || !s1.dry) continue // bridges already carry the water crossings
      const dashes = dashSpans(s0.s, s1.s)
      // Inside a junction the raised kerbs are dropped. Two legs meet here and
      // the trim leaves each of them fragments of footpath and median, which
      // read as pale bands lying across the paving — the "broken road". A real
      // junction is open tarmac, so the underlay carries it alone.
      const nearJunction =
        junctionDirs.some((j) => j.angleTo(s0.dir) * s0.ground < JUNCTION_CLEAR) ||
        mouthDirs.some((j) => j.angleTo(s0.dir) * s0.ground < MOUTH_CLEAR)

      for (const sign of [-1, 1]) {
        const inner = sign * LANE_IN
        const outer = sign * LANE_OUT
        const oL = Math.min(inner, outer)
        const oR = Math.max(inner, outer)
        flat(asphalt, s0, s1, oL, oR, ASPHALT_LIFT)

        // solid edge lines, one at each carriageway edge
        const outerEdge = sign * (LANE_OUT - MARK_HALF * 2)
        flat(paint, s0, s1, Math.min(outerEdge, outer), Math.max(outerEdge, outer), PAINT_LIFT)
        const innerEdge = sign * (LANE_IN + MARK_HALF * 2)
        flat(paint, s0, s1, Math.min(inner, innerEdge), Math.max(inner, innerEdge), PAINT_LIFT)

        // dashed divider between this carriageway's two lanes, cut exactly
        // at each dash window's edges
        for (const [f0, f1] of dashes) {
          const d0 = f0 <= 1e-6 ? s0 : lerpSample(s0, s1, f0)
          const d1 = f1 >= 1 - 1e-6 ? s1 : lerpSample(s0, s1, f1)
          flat(
            paint,
            d0,
            d1,
            sign * LANE_MID - MARK_HALF,
            sign * LANE_MID + MARK_HALF,
            PAINT_LIFT,
          )
        }

        // footpath — but not through a junction, see nearJunction
        if (!nearJunction) {
          raised(
            footpath,
            s0,
            s1,
            Math.min(sign * FOOT_IN, sign * FOOT_OUT),
            Math.max(sign * FOOT_IN, sign * FOOT_OUT),
            FOOTPATH_TOP,
          )
        }
      }

      // median, broken around every pillar footing — and stopping short of a
      // junction, like a real one does
      if (s0.medianOk && s1.medianOk && !nearJunction) {
        raised(median, s0, s1, -MEDIAN_HALF, MEDIAN_HALF, MEDIAN_TOP)
      }

      skirtSide(s0, s1, 1)
      skirtSide(s0, s1, -1)
    }

    const pairs: [MeshBuf, string, string, boolean][] = [
      [asphalt, "asphalt", CORRIDOR_COLORS.asphalt, false],
      [paint, "paint", CORRIDOR_COLORS.paint, false],
      [median, "median", CORRIDOR_COLORS.median, false],
      [footpath, "footpath", CORRIDOR_COLORS.footpath, false],
      [skirt, "skirt", "#ffffff", true],
    ]
    for (const [buf, name, color, vertexColors] of pairs) {
      if (buf.empty) continue
      out.push({ key: `${ai}-${name}`, geometry: buf.build(), color, vertexColors })
    }
  })

  /**
   * THE UNDERLAY. One continuous full-width band of asphalt following the
   * whole loop, laid 0.03u BELOW the ride surface.
   *
   * The corridor is built as nine legs cut at the stations, and each is then
   * trimmed laterally by the fold caps and the hub wedge trim so that exactly
   * one surface survives wherever two overlap. That is what stopped the
   * z-fighting, but it also means the paving is only as continuous as the
   * trimming allows: measured, 3.2% of the places a road should be drawn had
   * no triangle over them at all, in patches up to 12u long around the hubs.
   * That is the torn road.
   *
   * This band is built from the LOOP, not from the legs, so it has no seams to
   * trim and no corners to surrender. Being below the legs it never wins a
   * depth test against them — it shows only through a gap — so the markings,
   * median and footpaths draw exactly as before and nothing new can z-fight.
   */
  {
    const under = new MeshBuf()
    const steps = Math.max(16, Math.ceil(net.total / CORRIDOR_STEP))
    const dir = new THREE.Vector3()
    const ahead = new THREE.Vector3()
    const behind = new THREE.Vector3()
    const probe = new THREE.Vector3()
    let prev: { l: THREE.Vector3; r: THREE.Vector3 } | null = null

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * net.total
      loopDir(t, dir)
      loopDir(t + TANGENT_EPS, ahead)
      loopDir(t - TANGENT_EPS, behind)
      const fwd = ahead.clone().sub(behind)
      fwd.addScaledVector(dir, -fwd.dot(dir))
      if (fwd.lengthSq() < 1e-12) {
        prev = null
        continue
      }
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
      const ground = loopProfileAt(t)

      // the same water and deck rules the legs use, so the band stops exactly
      // where they do and never paves the river or the underside of a viaduct
      const wet =
        ground < WATER_LEVEL + 0.3 ||
        terrainRadius(dir) < WATER_LEVEL + 0.48 ||
        terrainRadius(
          probe.copy(dir).addScaledVector(right, FOOT_OUT / ground).normalize(),
        ) < WATER_LEVEL + 0.48 ||
        terrainRadius(
          probe.copy(dir).addScaledVector(right, -FOOT_OUT / ground).normalize(),
        ) < WATER_LEVEL + 0.48
      // no pair: an arterial deck overhead suppresses the band, a local road
      // bridge crossing above it does not
      if (wet || ownDeckAbove(dir, ground, "", "")) {
        prev = null
        continue
      }

      const at = (o: number) => {
        const p = dir.clone().addScaledVector(right, o / ground).normalize()
        const h = (corridorSurface(p) ?? terrainRadius(p) + ASPHALT_LIFT) - 0.03
        return p.multiplyScalar(h)
      }
      const cur = { l: at(-FOOT_OUT), r: at(FOOT_OUT) }
      if (prev) under.quad(prev.l, prev.r, cur.r, cur.l)
      prev = cur
    }
    if (!under.empty) {
      out.push({ key: "underlay", geometry: under.build(), color: CORRIDOR_COLORS.asphalt })
    }
  }

  return out
}

/** counts for reporting */
export function corridorStats(meshes: CorridorMesh[]) {
  let tris = 0
  let verts = 0
  for (const m of meshes) {
    tris += (m.geometry.getIndex()?.count ?? 0) / 3
    verts += m.geometry.getAttribute("position").count
  }
  return { meshes: meshes.length, tris, verts }
}

/* --------------------------------------------- player collision (read-only) */

/**
 * Solid props, with a crude stand-in for each one's shape, read off the geometry
 * in PropsLayer. Deliberately simple: the player is a capsule and this only has
 * to stop them walking through a wall, so a box or a cylinder per kind is
 * enough. `top` is height above the prop's own base.
 */
type ColliderSpec =
  | { shape: "box"; hx: number; hz: number; top: number }
  /** an opening between uprights, so the player can walk through the gate */
  | { shape: "posts"; xs: number[]; r: number; top: number }
  /** vertical, spanning aux[0] (base) to aux[1] (top) */
  | { shape: "shaft"; r: number }
  /** horizontal, following aux[0] -> aux[1] */
  | { shape: "rail"; r: number; top: number }

const COLLIDER_SPECS: Partial<Record<PropKind, ColliderSpec>> = {
  // ten tiers, cap and finial: see the gopuram case in PropsLayer
  gopuram: { shape: "box", hx: 0.8, hz: 0.8, top: 5.9 },
  "temple-court": { shape: "box", hx: 1.3, hz: 1.1, top: 1.2 },
  "mill-block": { shape: "box", hx: 1.1, hz: 0.9, top: 2.2 },
  "workshop-shed": { shape: "box", hx: 1.0, hz: 0.8, top: 1.5 },
  stall: { shape: "box", hx: 0.55, hz: 0.4, top: 1.1 },
  // uprights at +-0.9 rather than one slab: this is a gateway on the palace
  // approach and sealing it would wall off the thing it leads to
  "haveli-arch": { shape: "posts", xs: [-0.9, 0.9], r: 0.25, top: 2.8 },
  "metro-pillar": { shape: "shaft", r: 0.42 },
  "bridge-pier": { shape: "shaft", r: 0.16 },
  "bridge-rail": { shape: "rail", r: 0.12, top: 0.5 },
  // Trees stop you at the trunk, not the canopy — a single upright, using the
  // cylinder's wider bottom radius. Walking under a mango's foliage is fine;
  // walking through its bole is not. The banyan's aerial roots are left open,
  // so the grove stays a place you can wander into.
  "mango-tree": { shape: "posts", xs: [0], r: 0.14, top: 1.2 },
  banyan: { shape: "posts", xs: [0], r: 0.45, top: 1.6 },
  "peepal-tree": { shape: "posts", xs: [0], r: 0.26, top: 1.8 },
  // guardrails carry the ground under each post in aux since P33, which is the
  // same two-point form bridge-rail already uses
  guardrail: { shape: "rail", r: 0.12, top: GUARD_SHOW },
  // placeholder dims — every glb-building carries its real box on the prop
  // itself (PlacedProp.box), because each model's footprint differs
  "glb-building": { shape: "box", hx: 1, hz: 1, top: 1 },
  // the cow is a deliberate obstacle; the cat is scenery you can walk through
  cow: { shape: "box", hx: 0.42, hz: 0.85, top: 1.25 },
}

type Collider = {
  at: THREE.Vector3
  /** broad-phase radius about `at` */
  bound: number
  /** the band of world radii this thing occupies */
  r0: number
  r1: number
  form: "circle" | "box" | "segment"
  rad: number
  axisX: THREE.Vector3
  axisZ: THREE.Vector3
  hx: number
  hz: number
  end: THREE.Vector3
}

const _zeroAxis = new THREE.Vector3()

function makeCollider(
  form: Collider["form"],
  at: THREE.Vector3,
  r0: number,
  r1: number,
  bound: number,
  extra: Partial<Collider> = {},
): Collider {
  return {
    at,
    bound,
    r0,
    r1,
    form,
    rad: 0,
    axisX: _zeroAxis,
    axisZ: _zeroAxis,
    hx: 0,
    hz: 0,
    end: at,
    ...extra,
  }
}

let _colliders: Collider[] | null = null
let _cachedProps: PlacedProp[] | null = null

/** buildProps is not cheap; the collision tables want it once, not per query */
function cachedProps() {
  if (!_cachedProps) _cachedProps = buildProps()
  return _cachedProps
}

function colliders(): Collider[] {
  if (_colliders) return _colliders
  const out: Collider[] = []
  for (const p of cachedProps()) {
    const spec = COLLIDER_SPECS[p.kind]
    if (!spec) continue
    const base = p.position.length()

    if (spec.shape === "box") {
      // a prop may carry its own box (glb buildings — every model differs)
      const hx = (p.box?.hx ?? spec.hx) * p.scale
      const hz = (p.box?.hz ?? spec.hz) * p.scale
      out.push(
        makeCollider("box", p.position, base - 0.5, base + (p.box?.top ?? spec.top) * p.scale, Math.hypot(hx, hz), {
          axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion),
          axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion),
          hx,
          hz,
        }),
      )
    } else if (spec.shape === "posts") {
      const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion)
      const rad = spec.r * p.scale
      for (const x of spec.xs) {
        const at = p.position.clone().addScaledVector(axisX, x * p.scale)
        out.push(makeCollider("circle", at, base - 0.5, base + spec.top * p.scale, rad, { rad }))
      }
    } else if (spec.shape === "shaft") {
      if (!p.aux) continue
      const rad = spec.r * p.scale
      out.push(makeCollider("circle", p.aux[0], p.aux[0].length(), p.aux[1].length(), rad, { rad }))
    } else {
      if (!p.aux) continue
      const [a, b] = p.aux
      const rad = spec.r * p.scale
      const lo = Math.min(a.length(), b.length())
      const hi = Math.max(a.length(), b.length())
      out.push(
        makeCollider("segment", a, lo - 0.05, hi + spec.top * p.scale, a.distanceTo(b) + rad, {
          rad,
          end: b,
        }),
      )
    }
  }
  _colliders = out
  return out
}

/** how many colliders are live, and of which kinds — for reporting */
export function colliderStats() {
  const byKind = new Map<string, number>()
  for (const p of cachedProps()) {
    if (COLLIDER_SPECS[p.kind]) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1)
  }
  return { total: colliders().length, byKind: [...byKind.entries()].sort() }
}

export type PropHit = { normal: THREE.Vector3; depth: number }

const _pcUp = new THREE.Vector3()
const _pcDelta = new THREE.Vector3()
const _pcOff = new THREE.Vector3()
const _pcSeg = new THREE.Vector3()

/**
 * Deepest overlap between a standing capsule at `pos` and any solid prop.
 * `normal` comes back tangent to the sphere and pointing away from the
 * obstacle, so the caller can push out along it and keep sliding.
 */
export function propCollision(
  pos: THREE.Vector3,
  radius: number,
  height: number,
  hit: PropHit,
): boolean {
  const r = pos.length()
  if (r < 1e-6) return false
  _pcUp.copy(pos).divideScalar(r)
  let found = false
  hit.depth = 0

  for (const c of colliders()) {
    // the vertical bands must overlap: nothing you stand on top of, or walk
    // underneath, should stop you
    if (r + height <= c.r0 || r >= c.r1) continue

    // Reject in full 3D first. Flattening onto the tangent plane below throws
    // away radial separation, which on a sphere makes anything directly above,
    // below or antipodal look like it is standing right next to you — a rail on
    // the far side of the planet was registering as a hit.
    if (c.form === "segment") {
      _pcSeg.copy(c.end).sub(c.at)
      const len2 = _pcSeg.lengthSq()
      _pcDelta.copy(pos).sub(c.at)
      const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, _pcDelta.dot(_pcSeg) / len2))
      _pcDelta.addScaledVector(_pcSeg, -t)
      const reach = radius + c.rad
      if (_pcDelta.lengthSq() > reach * reach) continue
    } else {
      _pcDelta.copy(pos).sub(c.at)
      // +1 of slack so a step of terrain between player and prop base cannot
      // reject a contact that is genuinely there
      const reach = c.bound + radius + 1
      if (_pcDelta.lengthSq() > reach * reach) continue
    }
    // now measure in the tangent plane, so nothing pushes the player up or down
    _pcDelta.addScaledVector(_pcUp, -_pcDelta.dot(_pcUp))

    let depth: number
    if (c.form === "box") {
      const lx = _pcDelta.dot(c.axisX)
      const lz = _pcDelta.dot(c.axisZ)
      const cx = Math.max(-c.hx, Math.min(c.hx, lx))
      const cz = Math.max(-c.hz, Math.min(c.hz, lz))
      let ox = lx - cx
      let oz = lz - cz
      const d = Math.hypot(ox, oz)
      if (d > radius) continue
      if (d < 1e-6) {
        // dead inside the box: leave by whichever face is nearest
        if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) {
          ox = lx >= 0 ? 1 : -1
          oz = 0
          depth = radius + c.hx - Math.abs(lx)
        } else {
          ox = 0
          oz = lz >= 0 ? 1 : -1
          depth = radius + c.hz - Math.abs(lz)
        }
        _pcOff.copy(c.axisX).multiplyScalar(ox).addScaledVector(c.axisZ, oz)
      } else {
        depth = radius - d
        _pcOff.copy(c.axisX).multiplyScalar(ox / d).addScaledVector(c.axisZ, oz / d)
      }
    } else {
      const d = _pcDelta.length()
      const reach = radius + c.rad
      if (d > reach) continue
      if (d < 1e-6) continue // exactly on the axis: no usable push direction
      depth = reach - d
      _pcOff.copy(_pcDelta).divideScalar(d)
    }

    if (depth <= hit.depth) continue
    _pcOff.addScaledVector(_pcUp, -_pcOff.dot(_pcUp))
    if (_pcOff.lengthSq() < 1e-12) continue
    hit.normal.copy(_pcOff).normalize()
    hit.depth = depth
    found = true
  }
  return found
}

/* ------------------------------------------------------- walkable bridges */

/** the walkable surface runs right out to that span's own railings */
/** the deck box is 0.2 thick and centred on the span height */
const DECK_TOP = 0.1

type DeckSpan = {
  span: BridgeSpan
  a: THREE.Vector3
  n: THREE.Vector3
  /** in-plane perpendicular to `a`, pointing toward b */
  perp: THREE.Vector3
  bankA: number
  bankB: number
  deckR: number
}

let _decks: DeckSpan[] | null = null
let _decksSawNet = false

function decks(): DeckSpan[] {
  // rebuilt if first queried before the network existed: arterial banks would
  // have cached their raw-terrain fallback and kept the 1.2u handoff step
  if (_decks && (_decksSawNet || !NET)) return _decks
  _decksSawNet = !!NET
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const out: DeckSpan[] = []
  const probe = new THREE.Vector3()
  for (const span of bridgeSpans()) {
    if (span.onLoop) {
      // no arc frame: the query maps straight onto the loop
      const [bankA, bankB] = spanBanks(span, probe, probe, 0)
      out.push({
        span,
        a: new THREE.Vector3(),
        n: new THREE.Vector3(),
        perp: new THREE.Vector3(),
        bankA,
        bankB,
        deckR: spanDeckR(span, bankA, bankB),
      })
      continue
    }
    const [idA, idB] = ROAD_PAIRS[span.road]
    const za = byId.get(idA)
    const zb = byId.get(idB)
    if (!za || !zb) continue
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const omega = a.angleTo(b)
    const perp = b.clone().addScaledVector(a, -a.dot(b))
    if (perp.lengthSq() < 1e-12) continue
    const [bankA, bankB] = spanBanks(span, a, b, omega)
    out.push({
      span,
      a,
      n: new THREE.Vector3().crossVectors(a, b).normalize(),
      perp: perp.normalize(),
      bankA,
      bankB,
      deckR: spanDeckR(span, bankA, bankB),
    })
  }
  _decks = out
  return out
}

/**
 * Radius of the walkable bridge surface beneath `dir`, or null where there is
 * no deck. Ramps are included, and at a ramp's foot the deck height equals the
 * bank terrain, so walking on is continuous rather than a step up.
 */
export function bridgeSurface(dir: THREE.Vector3): number | null {
  let best: number | null = null
  for (const d of decks()) {
    let t: number
    let lateral: number
    if (d.span.onLoop) {
      // the arterial decks ride the loop, so the query is projected onto it
      t = nearestLoopT(dir)
      // unwrap into the span's window, which may straddle the loop seam
      const total = METRO_LOOP.total
      while (t < d.span.tA - total / 2) t += total
      while (t > d.span.tA + total / 2) t -= total
      if (t < d.span.tA || t > d.span.tB) continue
      lateral = loopAngle(dir) * terrainRadius(dir)
    } else {
      t = Math.atan2(dir.dot(d.perp), dir.dot(d.a))
      if (t < d.span.tA || t > d.span.tB) continue
      lateral = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(d.n)))))
    }
    const height = bridgeHeight(d.span, t, d.bankA, d.bankB, d.deckR)
    // lateral offset from the centreline, as a world distance at deck height
    if (!d.span.onLoop) lateral *= height
    if (lateral > d.span.halfWidth) continue
    const surface = height + DECK_TOP
    if (best === null || surface > best) best = surface
  }
  return best
}

/* ------------------------------------------------------- civic plot reserve */

export type CivicPlot = {
  id: string
  district: string
  anchorZone: string
  /**
   * Intended centre. The placer nudges outward from here when the site does not
   * clear everything already standing — the shift is reported, never silent.
   */
  dir: [number, number, number]
  /**
   * Size across, in world units — the same language P38's land survey used
   * ("a 20u footprint"). The pad's disc radius is half this.
   */
  footprint: number
  /**
   * What this plot needs to be NEAR, not just what it needs to avoid. The
   * ring search only ever optimised "flat, clear, safe", which put the bus
   * stand on a hilltop with no road in sight. "required" scores every
   * candidate and takes the best frontage; "prefer" breaks ties toward the
   * road but still accepts an inland site.
   */
  roadside?: "required" | "prefer"
}

/** where a roadside plot's EDGE should sit relative to the shoulder edge */
const FRONTAGE_MIN = 1
const FRONTAGE_MAX = 3

/**
 * Reserved ground for buildings that do not exist yet. Each entry is a plot the
 * zoning plan has claimed; the pad rendered on it is a marker, not a structure.
 */
export const CIVIC_PLOTS: CivicPlot[] = [
  { id: "hospital", district: "civic", anchorZone: "haveli", dir: [-0.478, -0.018, 0.878], footprint: 14, roadside: "prefer" },
  { id: "college", district: "tech", anchorZone: "samadhi", dir: [0.824, -0.524, 0.218], footprint: 20 },
  { id: "itpark", district: "tech", anchorZone: "samadhi", dir: [0.9201, -0.3883, 0.051], footprint: 20 },
  { id: "apartments", district: "industrial", anchorZone: "mill", dir: [0.173, 0.512, -0.841], footprint: 20 },
  // 20u could not clear the widened corridor from any reachable ring site
  // (P45b, failed by 0.28u); 19u is the largest size that sites with the
  // required 0.3u+ of true shoulder clearance. Anchor unmoved.
  { id: "park", district: "green", anchorZone: "grove", dir: [-0.663, -0.747, -0.049], footprint: 19 },
  { id: "busstand", district: "transit", anchorZone: "bazaar", dir: [0.8613, 0.2795, -0.4244], footprint: 14, roadside: "required" },
  { id: "cycleshop", district: "service", anchorZone: "workshop", dir: [-0.8402, -0.5365, 0.0787], footprint: 10, roadside: "prefer" },
]

/** clearances a reserved plot must keep, beyond its own radius */
/**
 * Plot setback from the corridor centreline: the full shoulder reach (5.55u,
 * SKIRT_OUT) plus slack for the spline-vs-arc gap arterialDistance leaves.
 */
const PLOT_CORRIDOR = 5.55 + 0.65
const PLOT_PILLAR = 0.5
const PLOT_BUILDING = 2
const PLOT_NPC = 1.5
const PLOT_PLOT = 2
/**
 * How far the search will walk from the intended centre, and in what rings.
 * 34 rings reaches 51u: the tech district asks for two 20u plots near samadhi,
 * and with 22u of mutual separation plus the corridor the second one has to
 * travel to find room.
 */
const PLOT_RING = 1.5
const PLOT_RINGS = 34
/** ground under a plot may not tilt more than this */
const PLOT_SLOPE = 0.3

/** kinds that occupy ground a plot may not overlap. Verge scatter is not one. */
const PLOT_BLOCKERS = new Set<PropKind>([
  "gopuram", "temple-court", "nandi-statue", "temple-steps", "mill-block",
  "workshop-shed", "stall", "market-umbrella", "haveli-arch", "banyan", "mango-tree",
  "peepal-tree", "ghat-steps", "zone-signboard", "metro-station",
])

export type PlotSiting = {
  id: string
  district: string
  anchorZone: string
  dir: THREE.Vector3
  radius: number
  ground: number
  band: number
  slope: number
  /** world units the placer had to walk from the requested centre */
  shift: number
  corridor: number
  pillar: number
  building: number
  buildingWhat: string
  npc: number
  plot: number
  ok: boolean
}

/** ground spread and wetness across a plot's disc */
function plotRelief(dir: THREE.Vector3, radius: number) {
  const r = terrainRadius(dir)
  const t1 = (Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
    .clone().cross(dir).normalize()
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize()
  let lo = r, hi = r, wet = false
  // rim and an inner ring, so a hump or hollow inside the disc is caught too
  for (const frac of [1, 0.6]) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const p = dir.clone()
        .addScaledVector(t1, (Math.cos(a) * radius * frac) / r)
        .addScaledVector(t2, (Math.sin(a) * radius * frac) / r)
        .normalize()
      const pr = terrainRadius(p)
      if (pr < WATER_LEVEL + 1) wet = true
      lo = Math.min(lo, pr)
      hi = Math.max(hi, pr)
    }
  }
  return { r, band: hi - lo, wet }
}

/** every clearance a plot centre would have, negative meaning it overlaps */
function plotClearances(
  dir: THREE.Vector3,
  radius: number,
  placed: PlacedProp[],
  pads: { dir: THREE.Vector3; radius: number }[],
) {
  const r = terrainRadius(dir)
  const at = dir.clone().multiplyScalar(r)
  const corridor = arterialDistance(dir) - PLOT_CORRIDOR - radius
  let pillar = Infinity
  let building = Infinity
  let buildingWhat = "-"
  for (const p of placed) {
    if (p.kind === "metro-pillar") {
      pillar = Math.min(pillar, at.distanceTo(p.position))
    } else if (PLOT_BLOCKERS.has(p.kind)) {
      const d = at.distanceTo(p.position)
      if (d < building) {
        building = d
        buildingWhat = `${p.kind}(${p.seed})`
      }
    }
  }
  let npc = Infinity
  for (const s of npcSpots()) npc = Math.min(npc, at.distanceTo(s))
  let plot = Infinity
  for (const o of pads) {
    plot = Math.min(plot, o.dir.angleTo(dir) * r - o.radius - radius - PLOT_PLOT)
  }
  return {
    corridor,
    pillar: pillar - radius - PLOT_PILLAR,
    building: building - radius - PLOT_BUILDING,
    buildingWhat,
    npc: npc - radius - PLOT_NPC,
    plot,
  }
}

/**
 * Walk outward from the requested centre in rings until the whole disc sits on
 * dry, gentle ground clear of the corridor, the viaduct, every building, every
 * villager and every other plot.
 */
function siteCivicPlot(
  want: THREE.Vector3,
  radius: number,
  placed: PlacedProp[],
  pads: { dir: THREE.Vector3; radius: number }[],
  roadside?: "required" | "prefer",
) {
  const t1 = (Math.abs(want.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
    .clone().cross(want).normalize()
  const t2 = new THREE.Vector3().crossVectors(want, t1).normalize()
  const base = terrainRadius(want)
  type Site = ReturnType<typeof plotClearances> extends never ? never : {
    dir: THREE.Vector3
    relief: ReturnType<typeof plotRelief>
    clear: ReturnType<typeof plotClearances>
    shift: number
  }
  let best: Site | null = null
  let bestScore = Infinity

  for (let ring = 0; ring <= PLOT_RINGS; ring++) {
    const out = ring * PLOT_RING
    const steps = ring === 0 ? 1 : ring * 8
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      const cand =
        ring === 0
          ? want.clone()
          : want.clone()
              .addScaledVector(t1, (Math.cos(a) * out) / base)
              .addScaledVector(t2, (Math.sin(a) * out) / base)
              .normalize()
      const relief = plotRelief(cand, radius)
      if (relief.wet) continue
      if (slopeAt(cand, relief.r) > PLOT_SLOPE) continue
      const c = plotClearances(cand, radius, placed, pads)
      if (c.corridor < 0 || c.pillar < 0 || c.building < 0 || c.npc < 0 || c.plot < 0) continue
      const site = { dir: cand, relief, clear: c, shift: want.angleTo(cand) * relief.r }
      if (!roadside) return site

      // How far this pad's EDGE would sit from the shoulder edge. Measured on
      // the metro loop, which is what the corridor is actually drawn from —
      // arterialDistance follows the painted arcs and disagrees by up to 0.5u.
      const frontage = loopAngle(cand) * relief.r - radius - SKIRT_OUT
      const miss =
        frontage < FRONTAGE_MIN
          ? FRONTAGE_MIN - frontage
          : frontage > FRONTAGE_MAX
            ? frontage - FRONTAGE_MAX
            : 0
      // frontage dominates; the walk from the intended centre only breaks ties
      const score = miss * 10 + site.shift * (roadside === "required" ? 0.05 : 1)
      if (score < bestScore) {
        bestScore = score
        best = site
      }
      // a site inside the target band cannot be beaten on frontage; take it
      if (miss === 0 && roadside === "prefer") return site
      if (miss === 0 && ring > 2) return best
    }
  }
  return best
}

let _plotSiting: PlotSiting[] = []

/** the siting each plot ended up with, for reporting */
export function civicPlotReport() {
  return _plotSiting
}

/** reserve every civic plot as a visible pad */
function placeCivicPads(props: PlacedProp[]) {
  const [padA, padB] = KIND_COLORS["civic-pad"] ?? ["#cfc4ae", "#a89e90"]
  const pads: { dir: THREE.Vector3; radius: number }[] = []
  const report: PlotSiting[] = []
  let seed = 9000

  for (const plot of CIVIC_PLOTS) {
    const radius = plot.footprint / 2
    const want = new THREE.Vector3(...plot.dir).normalize()
    const sited = siteCivicPlot(want, radius, props, pads, plot.roadside)
    if (!sited) {
      report.push({
        id: plot.id, district: plot.district, anchorZone: plot.anchorZone,
        dir: want, radius, ground: terrainRadius(want), band: NaN, slope: NaN,
        shift: NaN, corridor: NaN, pillar: NaN, building: NaN, buildingWhat: "-",
        npc: NaN, plot: NaN, ok: false,
      })
      continue
    }
    pads.push({ dir: sited.dir, radius })
    report.push({
      id: plot.id, district: plot.district, anchorZone: plot.anchorZone,
      dir: sited.dir, radius, ground: sited.relief.r, band: sited.relief.band,
      slope: slopeAt(sited.dir, sited.relief.r), shift: sited.shift,
      corridor: sited.clear.corridor, pillar: sited.clear.pillar,
      building: sited.clear.building, buildingWhat: sited.clear.buildingWhat,
      npc: sited.clear.npc, plot: sited.clear.plot, ok: true,
    })
  }
  _plotSiting = report

  // Grade every sited plot level (terrain.ts) BEFORE any pad or building is
  // positioned — the pads used to drape over 2.8–9.0u of relief and read as
  // torn floating patches, and a plumb tower on the 13° itpark slope read as
  // a 13° lean. Everything sampled from here on sees the graded ground.
  registerPlotGrading(pads)

  // Re-seat props the grading moved the ground under (anything inside a
  // pad's ramp — measured up to 4.4u of float at the college pad). Guardrails
  // recompute their post feet, poles carry their wires along; the remaining
  // aux kinds (tracks, decks, pillars) are span-borne and never pad-adjacent.
  const reach = PLOT_GRADE_RAMP
  const nearPad = (pDir: THREE.Vector3, len: number) => {
    for (const pad of pads) if (pDir.angleTo(pad.dir) * len <= pad.radius + reach) return true
    return false
  }
  const poleTops: [THREE.Vector3, THREE.Vector3][] = []
  for (const p of props) {
    if (p.kind === "wire") continue
    const pDir = _reseatV.copy(p.position).normalize()
    if (!nearPad(pDir, p.position.length())) continue
    if (p.kind === "utility-pole") {
      const dirC = pDir.clone()
      const oldTop = p.position.clone().addScaledVector(dirC, POLE_TIP)
      p.position.setLength(terrainRadius(dirC))
      poleTops.push([oldTop, p.position.clone().addScaledVector(dirC, POLE_TIP)])
      continue
    }
    if (p.kind === "guardrail") {
      const dirC = pDir.clone()
      p.position.setLength(terrainRadius(dirC))
      const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion)
      const len = p.position.length()
      const foot = (sx: number) => {
        const probe = dirC.clone().addScaledVector(axisX, sx / len).normalize()
        return probe.multiplyScalar(terrainRadius(probe))
      }
      p.aux = [foot(-GUARD_POST_X), foot(GUARD_POST_X)]
      continue
    }
    if (p.aux) continue
    p.position.setLength(terrainRadius(pDir))
  }
  // wires follow their poles: endpoints matching a moved pole's old top slide
  // to the new one, and the sag midpoint re-centres
  if (poleTops.length) {
    for (const p of props) {
      if (p.kind !== "wire" || !p.aux) continue
      let moved = false
      for (const [oldTop, newTop] of poleTops) {
        if (p.aux[0].distanceTo(oldTop) < 0.01) {
          p.aux[0] = newTop.clone()
          moved = true
        }
        if (p.aux[1].distanceTo(oldTop) < 0.01) {
          p.aux[1] = newTop.clone()
          moved = true
        }
      }
      if (moved) p.position.copy(p.aux[0]).add(p.aux[1]).multiplyScalar(0.5)
    }
  }

  // pads last, sitting flush on the freshly graded (flat) ground
  let padSeed = 9000
  for (const pad of pads) {
    props.push({
      kind: "civic-pad",
      position: surfacePoint(pad.dir, 0),
      quaternion: surfaceQuaternion(pad.dir, 0),
      // the pad is a disc of this radius; the renderer drapes it per-vertex
      scale: pad.radius,
      colorA: padA,
      colorB: padB,
      seed: padSeed++,
    })
  }
}

const _reseatV = new THREE.Vector3()

/* ------------------------------------------------- what you stand on */

type RideSample = {
  dir: THREE.Vector3
  right: THREE.Vector3
  /** the smoothed deck height, straight out of corridorProfile */
  ground: number
  dry: boolean
  /** which arterial this belongs to; neighbours are only neighbours within one */
  leg: number
}

let _ride: RideSample[] | null = null

/**
 * Centreline samples of every arterial, carrying the same smoothed profile the
 * corridor mesh is built from. Built once, from corridorProfile — the smoothing
 * lives in one place and this only reads it.
 */
function rideSamples(): RideSample[] {
  if (_ride) return _ride
  // guarantees the metro network exists, which is what the legs are cut from
  cachedProps()
  const net = NET
  const out: RideSample[] = []
  if (!net) return out
  const tOf = new Map(net.stations.map((s) => [s.zone, s.t]))
  const dir = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const behind = new THREE.Vector3()
  const fwd = new THREE.Vector3()

  ARTERIAL_PAIRS.forEach(([idA, idB], leg) => {
    const tA = tOf.get(idA)
    const tB = tOf.get(idB)
    if (tA === undefined || tB === undefined) return
    const span = (((tB - tA) % net.total) + net.total) % net.total
    if (span < CORRIDOR_STEP) return
    const steps = Math.max(2, Math.ceil(span / CORRIDOR_STEP))
    const profile = corridorProfile(tA, span, steps)

    for (let i = 0; i <= steps; i++) {
      const t = tA + (i / steps) * span
      loopDir(t, dir)
      loopDir(t + TANGENT_EPS, ahead)
      loopDir(t - TANGENT_EPS, behind)
      fwd.copy(ahead).sub(behind)
      fwd.addScaledVector(dir, -fwd.dot(dir))
      if (fwd.lengthSq() < 1e-12) continue
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
      const ground = profile[i]
      out.push({
        dir: dir.clone(),
        right,
        ground,
        dry: corridorSampleDry(dir, right, ground, idA, idB),
        leg,
      })
    }
  })
  _ride = out
  return out
}

const _rideProbe = new THREE.Vector3()

/**
 * Height of the road surface under `dir`, or null off the corridor.
 *
 * The corridor is not one height: the deck is smoothed along its length, but
 * across its width MAX_TWIST ties each edge back toward the real ground, and the
 * footpath stands proud of the carriageway. This walks the same cross-section
 * the mesh is built from, so what you stand on is what you see.
 */
/**
 * Kerb ramp half-width for the RIDE surface only. The drawn kerbs stay square;
 * underfoot the 0.14u median step and 0.10u footpath step ramp over this span,
 * because a full step in a single frame reads as a screen judder, not a kerb.
 */
const KERB_RAMP = 0.3

/** ride-height lift at lateral |o|, with ramped band transitions */
function rideLift(a: number) {
  const mix = (from: number, to: number, edge: number) => {
    const t = Math.min(1, Math.max(0, (a - (edge - KERB_RAMP / 2)) / KERB_RAMP))
    return from + (to - from) * t
  }
  if (a < MEDIAN_HALF + KERB_RAMP / 2) return mix(MEDIAN_TOP, ASPHALT_LIFT, MEDIAN_HALF)
  return mix(ASPHALT_LIFT, FOOTPATH_TOP, LANE_OUT)
}

const _rideC0 = new THREE.Vector3()
const _rideC1 = new THREE.Vector3()
const _rideAB = new THREE.Vector3()
const _ridePW = new THREE.Vector3()
const _rideR = new THREE.Vector3()

/** two legs run this close only where they converge on a hub */
const HUB_OVERLAP_DOT = Math.cos(0.06)

export function corridorSurface(dir: THREE.Vector3): number | null {
  const samples = rideSamples()
  let bestI = -1
  let bestDot = -2
  // where two legs overlap near a hub the WALKABLE surface is the higher one
  // (that is what the wedge-trimmed mesh shows) — nearest-leg-only answers
  // popped 0.3-0.6u crossing the bisector between converging legs (measured)
  let otherI = -1
  let otherDot = -2
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const d = s.dir.dot(dir)
    if (d > bestDot) {
      if (bestI >= 0 && samples[bestI].leg !== s.leg && bestDot > otherDot) {
        otherDot = bestDot
        otherI = bestI
      }
      bestDot = d
      bestI = i
    } else if (s.leg !== (bestI >= 0 ? samples[bestI].leg : -1) && d > otherDot) {
      otherDot = d
      otherI = i
    }
  }
  if (bestI < 0) return null
  const primary = corridorSurfaceAt(samples, bestI, dir)
  // otherI can be stale if bestI later switched onto its leg mid-scan
  if (otherI < 0 || otherDot < HUB_OVERLAP_DOT || samples[otherI].leg === samples[bestI].leg)
    return primary
  // the secondary only counts on a true segment hit: its snapped-endpoint
  // fallback plateaus at the endpoint height with a polluted lateral frame,
  // and taking a max against that stepped 0.15u at station seams (measured)
  const secondary = corridorSurfaceAt(samples, otherI, dir, true)
  if (primary === null) return secondary
  if (secondary === null) return primary
  return Math.max(primary, secondary)
}

function corridorSurfaceAt(
  samples: RideSample[],
  bestI: number,
  dir: THREE.Vector3,
  requireSegment = false,
): number | null {
  // Interpolate along whichever adjacent segment the point projects into.
  // Snapping to the nearest sample changed the whole frame every 0.6u of
  // travel, and the resulting height steps were the P44 "screen dancing".
  //
  // The projection runs on the UNIT directions, not the 3D ground points: on a
  // steep grade consecutive ground-point chords kink RADIALLY, the projection
  // parameter jumps half a segment at the kink, and the ride surface stepped
  // 0.26u mid-carriageway at the gorge approaches (measured). The unit-dir
  // polyline has only the loop's own gentle tangential kinks.
  let s0 = samples[bestI]
  let s1 = s0
  let t = 0
  for (const j of [bestI - 1, bestI + 1]) {
    if (j < 0 || j >= samples.length) continue
    const n = samples[j]
    if (n.leg !== s0.leg) continue
    const a2 = j < bestI ? n : samples[bestI]
    const b2 = j < bestI ? samples[bestI] : n
    _rideAB.copy(b2.dir).sub(a2.dir)
    const len2 = _rideAB.lengthSq()
    if (len2 < 1e-12) continue
    const tt = _rideProbe.copy(dir).sub(a2.dir).dot(_rideAB) / len2
    if (tt >= 0 && tt <= 1) {
      s0 = a2
      s1 = b2
      t = tt
      break
    }
  }
  if (s0 === s1) {
    if (requireSegment) return null
    // No segment contains the query. Beyond the END of a leg that is not an
    // outside-corner wedge but open air — the snap used to hold the endpoint
    // height as a phantom plateau past every station seam (0.15u step when it
    // let go). Legs tile the loop, so the adjacent leg's coincident endpoint
    // sample carries the seam instead. Interior corner wedges (both
    // neighbours on this leg) still snap.
    const prevSame = bestI > 0 && samples[bestI - 1].leg === s0.leg
    const nextSame = bestI < samples.length - 1 && samples[bestI + 1].leg === s0.leg
    if (!prevSame || !nextSame) return null
  }
  if (!s0.dry || !s1.dry) return null
  const ground = s0.ground + (s1.ground - s0.ground) * t

  // Lateral offset from the projection residual: subtract the point's
  // along-segment component and measure what remains against a right vector
  // orthogonalised to the segment. The old lerped-right asin estimate ignored
  // the segment frame and read up to 0.65u short on curves — the mesh hung
  // past where the ride surface ended (P41c corner overhang).
  _rideC0.copy(s0.dir).lerp(s1.dir, t) // centreline dir at t (chord point)
  _ridePW.copy(dir).sub(_rideC0) // residual, in radian-scale units
  const right = _rideR.copy(s0.right).lerp(s1.right, t)
  if (s0 !== s1) {
    _rideAB.copy(s1.dir).sub(s0.dir)
    const len2 = _rideAB.lengthSq()
    if (len2 > 1e-12) right.addScaledVector(_rideAB, -right.dot(_rideAB) / len2)
  }
  if (right.lengthSq() < 1e-12) return null
  right.normalize()
  const o = _ridePW.dot(right) * ground
  const a = Math.abs(o)
  if (a > FOOT_OUT + SHOULDER_MAX) return null

  // the probe direction IS the query point — no reconstruction error
  const raw = terrainRadius(dir)
  if (a > FOOT_OUT) {
    // the walkable shoulder: the SAME curve and reach the skirt mesh uses
    const eDir = _rideProbe
      .copy(dir)
      .addScaledVector(right, (Math.sign(o) * FOOT_OUT - o) / ground)
      .normalize()
    const edgeRaw = terrainRadius(eDir)
    const oDir = _rideProbe
      .copy(dir)
      .addScaledVector(right, (Math.sign(o) * SKIRT_OUT - o) / ground)
      .normalize()
    const reach = shoulderReach(ground, edgeRaw, terrainRadius(oDir))
    if (a > FOOT_OUT + reach) return null
    return shoulderHeight(ground, edgeRaw, raw, a, reach)
  }
  // the median kerb is not drawn across a bridge mouth, so it must not be felt
  // there either -- that mismatch IS the 0.140u handoff step
  const lift = mouthFade(dir, ground) * rideLift(a) + (1 - mouthFade(dir, ground)) * ASPHALT_LIFT
  const limit = a * Math.tan(MAX_TWIST)
  return ground + Math.max(-limit, Math.min(limit, raw - ground)) + lift
}

/**
 * 1 well away from a deck end, 0 at one: the factor that flattens the ride
 * cross-section back to plain asphalt as the road hands over to a bridge.
 *
 * Kept lazily and cached, because corridorSurface runs on every player frame.
 */
let _mouths: THREE.Vector3[] | null = null
const MOUTH_FADE = 3.2
function mouthFade(dir: THREE.Vector3, ground: number) {
  if (!_mouths) {
    _mouths = []
    for (const d of bridgeSpans()) {
      if (!d.onLoop) continue
      _mouths.push(loopDir(d.tA, new THREE.Vector3()).clone())
      _mouths.push(loopDir(d.tB, new THREE.Vector3()).clone())
    }
  }
  let f = 1
  for (const m of _mouths) {
    const lat = m.angleTo(dir) * ground
    if (lat >= MOUTH_FADE) continue
    f = Math.min(f, smoothstep01(lat / MOUTH_FADE))
  }
  return f
}

/** module-scope smoothstep for the shoulder curve */
function smoothstep01(t: number) {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/**
 * THE shoulder height curve — the only definition. Both the drawn skirt mesh
 * and the walkable ride surface call this, so the two cannot drift apart.
 * `edgeRaw` is the natural ground at the footpath's outer edge (the twist
 * clamp anchors there); `pointRaw` the ground under the queried point.
 */
function shoulderHeight(
  ground: number,
  edgeRaw: number,
  pointRaw: number,
  a: number,
  reach = SHOULDER_FALLOFF,
) {
  const edgeH = shoulderEdgeH(ground, edgeRaw)
  const f = smoothstep01((a - FOOT_OUT) / reach)
  return edgeH * (1 - f) + pointRaw * f
}

/** the footpath outer-top height the embankment descends from */
function shoulderEdgeH(ground: number, edgeRaw: number) {
  const limit = FOOT_OUT * Math.tan(MAX_TWIST)
  return ground + Math.max(-limit, Math.min(limit, edgeRaw - ground)) + FOOTPATH_TOP
}

/**
 * How far past the footpath edge the embankment reaches: 2x the drop to the
 * natural ground (~1:2 average slope) — never narrower than SHOULDER_FALLOFF,
 * never wider than SHOULDER_MAX. `outerRaw` is the ground probed at the
 * nominal outer line (FOOT_OUT + SHOULDER_FALLOFF); both the skirt mesh and
 * the ride surface size the shoulder with THIS function so they agree.
 */
function shoulderReach(ground: number, edgeRaw: number, outerRaw: number) {
  const drop = shoulderEdgeH(ground, edgeRaw) - outerRaw
  return Math.min(SHOULDER_MAX, Math.max(SHOULDER_FALLOFF, 2 * drop))
}

/**
 * The surface anything standing here rests on: the ground, raised to the road
 * or a bridge deck where one covers it. Used for placing things and for camera
 * clearance — collision wants the snap guard instead, and does its own.
 */
export function groundOrDeck(dir: THREE.Vector3) {
  let g = terrainRadius(dir)
  const road = corridorSurface(dir)
  if (road !== null && road > g) g = road
  const deck = bridgeSurface(dir)
  if (deck !== null && deck > g) g = deck
  return g
}
