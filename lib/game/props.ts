import * as THREE from "three"
import { ZONES, WATER_LEVEL } from "./data"
import { surfacePoint, surfaceQuaternion, rng, roadDistance, terrainRadius } from "./terrain"

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
}

/* ------------------------------------------------------------- namma metro */

const ZONE_DIRS = ZONES.map((z) => new THREE.Vector3(...z.center).normalize())

/** closed tour of all nine zones: nearest neighbour from KR Market, then 2-opt */
function planLoop(): number[] {
  const n = ZONE_DIRS.length
  const dist = (a: number, b: number) => ZONE_DIRS[a].angleTo(ZONE_DIRS[b])
  const start = Math.max(0, ZONES.findIndex((z) => z.id === "bazaar"))

  const tour = [start]
  const left = new Set<number>()
  for (let i = 0; i < n; i++) if (i !== start) left.add(i)
  while (left.size) {
    const last = tour[tour.length - 1]
    let best = -1
    let bestD = Infinity
    for (const c of left) {
      const d = dist(last, c)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    tour.push(best)
    left.delete(best)
  }

  const length = (t: number[]) => {
    let s = 0
    for (let i = 0; i < n; i++) s += dist(t[i], t[(i + 1) % n])
    return s
  }
  for (let pass = 0; pass < 40; pass++) {
    let improved = false
    for (let i = 1; i < n - 1 && !improved; i++) {
      for (let k = i + 1; k < n && !improved; k++) {
        const cand = tour
          .slice(0, i)
          .concat(tour.slice(i, k + 1).reverse(), tour.slice(k + 1))
        if (length(cand) < length(tour) - 1e-9) {
          tour.splice(0, n, ...cand)
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return tour
}

const METRO_ORDER = planLoop()
export const METRO_ZONE_IDS = METRO_ORDER.map((i) => ZONES[i].id)
export const METRO_TOUR_LENGTH = (() => {
  let s = 0
  for (let i = 0; i < METRO_ORDER.length; i++) {
    s += ZONE_DIRS[METRO_ORDER[i]].angleTo(ZONE_DIRS[METRO_ORDER[(i + 1) % METRO_ORDER.length]])
  }
  return s
})()

/* ------------------------------------------------------------ deck profile */

const DECK_SAMPLE = 0.02
const DECK_SMOOTH = 7
const DECK_RISE = 8
const DECK_MIN_CLEAR = 6.4
const DECK_WATER = WATER_LEVEL + 4.8
/** generous on purpose: a tight limit ratchets the deck up over rough ground */
const DECK_MAX_STEP = 0.4

const PILLAR_STEP = 0.075

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
  "palace",
  "mill-block",
  "workshop-shed",
  "temple-dome",
  "ghat-steps",
  "mango-tree",
  "banyan",
  "peepal-tree",
  "zone-signboard",
])

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
function siteStations(placed: PlacedProp[]) {
  const sites: { dir: THREE.Vector3; info: StationInfo }[] = []
  const n = METRO_ORDER.length

  for (let i = 0; i < n; i++) {
    const zi = METRO_ORDER[i]
    const zoneDir = ZONE_DIRS[zi]
    const nextDir = ZONE_DIRS[METRO_ORDER[(i + 1) % n]]
    // never lead more than 40% of the way to the next zone: on the short
    // beach->temple leg a flat 0.3 rad would land in the temple's own props
    const legLength = zoneDir.angleTo(nextDir)
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
        const dir = advance(zoneDir, nextDir, lead + off)
        const ground = terrainRadius(dir)
        if (ground < WATER_LEVEL + 0.48) continue
        if (pass === 1 && roadDistance(dir) < RIBBON_CLEAR) continue
        const pos = dir.clone().multiplyScalar(ground)
        const { ok, nearest } = propClearance(pos, placed)
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
      chosen = advance(zoneDir, nextDir, lead)
      chosenPass = 5
    }

    sites.push({
      dir: chosen,
      info: {
        zone: ZONES[zi].id,
        offset: chosenOffset,
        clearance: chosenClear,
        t: 0,
        pass: chosenPass,
      },
    })
  }
  return sites
}

/* ------------------------------------------------------------- loop + deck */

function buildNetwork(placed: PlacedProp[]): MetroNet {
  const sites = siteStations(placed)
  const controls = sites.map((s) => s.dir)

  // closed spline through the station directions, resampled to even arc steps
  const curve = new THREE.CatmullRomCurve3(
    controls.map((d) => d.clone()),
    true,
    "centripetal",
  )
  const M = 4000
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < M; i++) pts.push(curve.getPoint(i / M).normalize())
  const cum = new Float64Array(M + 1)
  for (let i = 0; i < M; i++) cum[i + 1] = cum[i] + pts[i].angleTo(pts[(i + 1) % M])
  const total = cum[M]

  const n = Math.max(16, Math.round(total / DECK_SAMPLE))
  const step = total / n
  const dirs = new Float64Array(n * 3)
  {
    let seg = 0
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const target = i * step
      while (seg < M - 1 && cum[seg + 1] < target) seg++
      const span = cum[seg + 1] - cum[seg]
      const f = span > 1e-12 ? (target - cum[seg]) / span : 0
      v.copy(pts[seg]).lerp(pts[(seg + 1) % M], f).normalize()
      dirs[i * 3] = v.x
      dirs[i * 3 + 1] = v.y
      dirs[i * 3 + 2] = v.z
    }
  }

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

  // arc position of each station: the spline passes through control k at u=k/K
  const K = controls.length
  const stations = sites.map((s, k) => {
    const j = Math.min(M, Math.round((k / K) * M))
    return { ...s.info, t: cum[j] }
  })

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
export function loopDir(t: number, target: THREE.Vector3) {
  if (!NET) return target.set(0, 1, 0)
  const { dirs, n, step } = NET
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

  const steps = Math.max(8, Math.round(net.total / PILLAR_STEP))
  const step = net.total / steps
  for (let i = 0; i < steps; i++) {
    const t = i * step
    loopDir(t, dir)
    const ground = terrainRadius(dir)
    if (ground < WATER_LEVEL + 0.48) continue
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
const BRIDGE_HALF_WIDTH = 1.44
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
const BRIDGE_SPANS: BridgeSpan[] = (() => {
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
          const tA = Math.max(0, runStart - BRIDGE_RAMP)
          const tB = Math.min(omega, end + BRIDGE_RAMP)
          const worldLength = arc * BRIDGE_DECK_R
          spans.push({
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
  return spans
})()

export function bridgeReport() {
  return BRIDGE_SPANS.map((s) => ({
    road: `${ROAD_PAIRS[s.road][0]}-${ROAD_PAIRS[s.road][1]}`,
    arc: s.arc,
    worldLength: s.worldLength,
    piers: s.piers,
  }))
}

/** is this point on a road covered by a bridge, ramps included? */
function onBridge(road: number, angle: number) {
  for (const s of BRIDGE_SPANS) {
    if (s.road === road && angle >= s.tA && angle <= s.tB) return true
  }
  return false
}

/** deck height at `t` within a span: flat over water, ramping down at the banks */
function bridgeHeight(span: BridgeSpan, t: number, bankA: number, bankB: number) {
  if (t <= span.t0) {
    const f = span.t0 > span.tA ? (t - span.tA) / (span.t0 - span.tA) : 1
    return bankA + (BRIDGE_DECK_R - bankA) * f
  }
  if (t >= span.t1) {
    const f = span.tB > span.t1 ? (t - span.t1) / (span.tB - span.t1) : 1
    return BRIDGE_DECK_R + (bankB - BRIDGE_DECK_R) * f
  }
  return BRIDGE_DECK_R
}

/** decks, railings and piers for every water crossing */
function placeBridges(props: PlacedProp[]) {
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const [deckA, deckB] = KIND_COLORS["bridge-deck"] ?? ["#cfc8ba", "#a89e90"]
  const [railA, railB] = KIND_COLORS["bridge-rail"] ?? ["#f2f0e8", "#d8d5cb"]
  const [pierA, pierB] = KIND_COLORS["bridge-pier"] ?? ["#a89e90", "#8d8478"]
  let seed = 1800

  for (const span of BRIDGE_SPANS) {
    const [idA, idB] = ROAD_PAIRS[span.road]
    const za = byId.get(idA)
    const zb = byId.get(idB)
    if (!za || !zb) continue
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const omega = a.angleTo(b)

    const probe = new THREE.Vector3()
    const bankA = terrainRadius(arcPoint(a, b, omega, span.tA, probe))
    const bankB = terrainRadius(arcPoint(a, b, omega, span.tB, probe))

    const dirAt = (t: number, target: THREE.Vector3) => arcPoint(a, b, omega, t, target)
    const pointAt = (t: number, target: THREE.Vector3) =>
      dirAt(t, target).multiplyScalar(bridgeHeight(span, t, bankA, bankB))

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
        aux: [p0.clone(), p1.clone()],
      })

      // a railing down each edge, offset across the deck
      const side = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize()
      for (const s of [-1, 1]) {
        const r0 = p0.clone().addScaledVector(side, s * BRIDGE_HALF_WIDTH)
        const r1 = p1.clone().addScaledVector(side, s * BRIDGE_HALF_WIDTH)
        const rMid = r0.clone().add(r1).multiplyScalar(0.5)
        props.push({
          kind: "bridge-rail",
          position: rMid,
          quaternion: deckQuaternion(r1.clone().sub(r0), rMid.clone().normalize()),
          scale: 1,
          colorA: railA,
          colorB: railB,
          seed: seed++,
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
      const top = d.clone().multiplyScalar(bridgeHeight(span, t, bankA, bankB))
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
      // arterials carry footpaths instead of verge furniture
      if (
        (kind === "guardrail" || kind === "grass-tuft") &&
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
      const sigDir = offsetDir(dir, perp, SIGNAL_OFFSET)
      if (roadDistance(sigDir) < RIBBON_CLEAR) continue
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

    // first side, then the other, then the same two a little further out
    const attempts: [number, number][] = [
      [walk, 1],
      [walk, -1],
      [walk + SIGN_RETRY, 1],
      [walk + SIGN_RETRY, -1],
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
      const dir = offsetDir(onRoad, perp, SIGN_OFFSET * side)
      if (roadDistance(dir) < RIBBON_CLEAR) continue
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
    const dist = distFrac * 0.03125
    const dir = center
      .clone()
      .addScaledVector(t1, Math.cos(ang) * dist)
      .addScaledVector(t2, Math.sin(ang) * dist)
      .normalize()
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

  // --- temple: a South Indian hill shrine — gopuram at the summit, courtyard
  // and Nandi on the approach, stair runs descending the slope below
  add("gopuram", "temple", 0, 0.25, 1.6, 600)
  aimAtZone(props, "temple", "z") // doorway (local -Z) looks down the approach
  add("temple-court", "temple", 0, 0.55, 1.4, 601)
  aimAtZone(props, "temple", "z") // mandapa roof (+Z half) sits toward the shrine
  add("nandi-statue", "temple", 0, 0.85, 1.1, 602)
  aimAtZone(props, "temple", "x") // the bull faces the shrine along local +X
  add("temple-steps", "temple", 0, 1.25, 1.3, 603)
  aimAtZone(props, "temple", "z") // treads descend along local -Z, downhill
  // a run is 3.12u long and one distFrac unit here is 1.55u, so the second run
  // starts ~2.0 distFrac beyond the first rather than inside it
  add("temple-steps", "temple", 0, 3.3, 1.3, 604)
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

  return props
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
export function arterialDistance(dir: THREE.Vector3) {
  let best = Infinity
  for (const arc of ARTERIAL_ARCS) {
    const along = _artProbe.copy(dir).projectOnPlane(arc.n)
    if (along.lengthSq() < 1e-9) continue
    along.normalize()
    const ab = arc.a.dot(arc.b)
    const inside = along.dot(arc.a) >= ab - 1e-4 && along.dot(arc.b) >= ab - 1e-4
    const ang = inside
      ? Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(arc.n)))))
      : Math.min(dir.angleTo(arc.a), dir.angleTo(arc.b))
    if (ang < best) best = ang
  }
  return best === Infinity ? Infinity : best * terrainRadius(dir)
}

/* --- cross-section, in world units either side of the centreline --------- */

const CORRIDOR_STEP = 0.015
/** guardrails and tufts stand down inside this half-width; footpaths replace them */
export const CORRIDOR_SUPPRESS = 2.9
const ASPHALT_LIFT = 0.06
const PAINT_LIFT = 0.08
const MEDIAN_TOP = 0.2
const FOOTPATH_TOP = 0.16
/** carriageways span 0.3..2.0 either side: 1.7 wide, centred on 1.15 */
const LANE_IN = 0.3
const LANE_OUT = 2.0
const LANE_MID = 1.15
const MEDIAN_HALF = 0.25
const FOOT_IN = 2.0
const FOOT_OUT = 2.7
const MARK_HALF = 0.025
const DASH_ON = 0.35
const DASH_PERIOD = 0.8
/** median breaks this close to a metro pillar footing */
const PILLAR_CLEAR = 1.2
/**
 * A median vertex sits up to this far from its centreline sample, so the break
 * is widened by it — otherwise the 1.2u rule holds at the centreline while a
 * corner still creeps to 0.97u.
 */
const MEDIAN_REACH = Math.hypot(MEDIAN_HALF, MEDIAN_TOP)
/**
 * Cross-slope clamp. The corridor is a graded roadway, not a terrain drape:
 * an edge may sit at most tan(this) x its lateral offset away from the
 * centreline height, which stops the ribbon shearing across bumpy ground.
 */
const MAX_TWIST = 0.12

const CORRIDOR_COLORS = {
  asphalt: "#5a5a60",
  paint: "#e8e4da",
  median: "#b8b2a6",
  footpath: "#cfc4ae",
}

/** growable indexed triangle soup */
class MeshBuf {
  pos: number[] = []
  idx: number[] = []
  vert(v: THREE.Vector3) {
    this.pos.push(v.x, v.y, v.z)
    return this.pos.length / 3 - 1
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
    const ia = this.vert(a)
    const ib = this.vert(b)
    const ic = this.vert(c)
    const id = this.vert(d)
    this.idx.push(ia, ib, ic, ia, ic, id)
  }
  get empty() {
    return this.idx.length === 0
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3))
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

export type CorridorMesh = { key: string; geometry: THREE.BufferGeometry; color: string }

/** the whole arterial cross-section, merged into one geometry per element */
export function buildCorridors(props: PlacedProp[]): CorridorMesh[] {
  const pillars = props.filter((p) => p.kind === "metro-pillar").map((p) => p.position)
  const out: CorridorMesh[] = []

  ARTERIAL_ARCS.forEach((arc, ai) => {
    const steps = Math.max(2, Math.ceil(arc.omega / CORRIDOR_STEP))
    const samples: Sample[] = []
    const dir = new THREE.Vector3()
    const fwd = new THREE.Vector3()
    let run = 0

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * arc.omega
      const s = Math.sin(arc.omega)
      dir
        .copy(arc.a)
        .multiplyScalar(Math.sin(arc.omega - t) / s)
        .addScaledVector(arc.b, Math.sin(t) / s)
        .normalize()
      fwd.crossVectors(arc.n, dir).normalize()
      const right = new THREE.Vector3().crossVectors(fwd, dir).normalize()
      const ground = terrainRadius(dir)
      const centre = dir.clone().multiplyScalar(ground)
      let medianOk = true
      for (const p of pillars) {
        if (centre.distanceTo(p) < PILLAR_CLEAR + MEDIAN_REACH) {
          medianOk = false
          break
        }
      }
      if (i > 0) run += (arc.omega / steps) * ground
      samples.push({
        dir: dir.clone(),
        right,
        ground,
        dry:
          ground >= WATER_LEVEL + 0.48 &&
          // the section reaches +-FOOT_OUT, so both verges must be dry too
          terrainRadius(
            dir.clone().addScaledVector(right, FOOT_OUT / ground).normalize(),
          ) >= WATER_LEVEL + 0.48 &&
          terrainRadius(
            dir.clone().addScaledVector(right, -FOOT_OUT / ground).normalize(),
          ) >= WATER_LEVEL + 0.48,
        medianOk,
        s: run,
      })
    }

    const asphalt = new MeshBuf()
    const paint = new MeshBuf()
    const median = new MeshBuf()
    const footpath = new MeshBuf()

    const flat = (m: MeshBuf, s0: Sample, s1: Sample, oL: number, oR: number, lift: number) => {
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

    for (let i = 0; i < steps; i++) {
      const s0 = samples[i]
      const s1 = samples[i + 1]
      if (!s0.dry || !s1.dry) continue // bridges already carry the water crossings

      for (const sign of [-1, 1]) {
        const inner = sign * LANE_IN
        const outer = sign * LANE_OUT
        const oL = Math.min(inner, outer)
        const oR = Math.max(inner, outer)
        flat(asphalt, s0, s1, oL, oR, ASPHALT_LIFT)

        // solid edge line on the outer edge
        const edge = sign * (LANE_OUT - MARK_HALF * 2)
        flat(paint, s0, s1, Math.min(edge, outer), Math.max(edge, outer), PAINT_LIFT)

        // dashed lane centre line
        const phase = s0.s % DASH_PERIOD
        if (phase < DASH_ON) {
          flat(
            paint,
            s0,
            s1,
            sign * LANE_MID - MARK_HALF,
            sign * LANE_MID + MARK_HALF,
            PAINT_LIFT,
          )
        }

        // footpath
        raised(
          footpath,
          s0,
          s1,
          Math.min(sign * FOOT_IN, sign * FOOT_OUT),
          Math.max(sign * FOOT_IN, sign * FOOT_OUT),
          FOOTPATH_TOP,
        )
      }

      // median, broken around every pillar footing
      if (s0.medianOk && s1.medianOk) {
        raised(median, s0, s1, -MEDIAN_HALF, MEDIAN_HALF, MEDIAN_TOP)
      }
    }

    const pairs: [MeshBuf, string, string][] = [
      [asphalt, "asphalt", CORRIDOR_COLORS.asphalt],
      [paint, "paint", CORRIDOR_COLORS.paint],
      [median, "median", CORRIDOR_COLORS.median],
      [footpath, "footpath", CORRIDOR_COLORS.footpath],
    ]
    for (const [buf, name, color] of pairs) {
      if (buf.empty) continue
      out.push({ key: `${ai}-${name}`, geometry: buf.build(), color })
    }
  })

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
