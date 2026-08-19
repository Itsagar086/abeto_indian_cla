import * as THREE from "three"
import { NPCS, ZONES, WATER_LEVEL, type Vec3 } from "./data"

/**
 * The village sits on a small, irregular round world — every NPC and zone
 * sits at a known distance from the planet centre. We build the surface as
 * a radial-basis interpolation through those anchor radii, which gives us a
 * low riverside ghat, a market plateau, a memorial bluff, and a temple
 * mountain, and lets us evaluate exact ground height analytically for the
 * character controller, with no raycasting.
 */

/* ---------------------------------------------------------------- noise */

function hash3(x: number, y: number, z: number) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const zf = smooth(z - zi)
  let n = 0
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
        const w =
          (i ? xf : 1 - xf) * (j ? yf : 1 - yf) * (k ? zf : 1 - zf)
        n += w * hash3(xi + i, yi + j, zi + k)
      }
    }
  }
  return n * 2 - 1
}

function fbm(x: number, y: number, z: number, octaves = 4) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, z * freq)
    norm += amp
    amp *= 0.5
    freq *= 2.07
  }
  return sum / norm
}

/* -------------------------------------------------------------- anchors */

type Anchor = { dir: THREE.Vector3; r: number; w: number }

function makeAnchors(): Anchor[] {
  const list: Anchor[] = []
  const push = (p: Vec3, w = 1, rOverride?: number) => {
    const v = new THREE.Vector3(p[0], p[1], p[2])
    const r = rOverride ?? v.length()
    list.push({ dir: v.clone().normalize(), r, w })
  }
  // every NPC stands on the ground -> their distance is the surface radius
  for (const n of NPCS) push(n.position, 1)
  // zone centres carry the large scale landforms
  for (const z of ZONES) push(z.center, 1.35)
  // extra ocean anchors so the far side of the planet drops below sea level
  const oceanDirs: Vec3[] = [
    [0.2, -0.95, 0.24],
    [0.62, -0.5, 0.6],
    [-0.7, 0.2, -0.68],
    [0.86, -0.2, 0.47],
    [-0.35, -0.75, -0.56],
    [0.1, 0.55, 0.83],
    [0.75, 0.45, 0.48],
    [-0.9, 0.35, -0.26],
    [0.3, -0.3, 0.9],
    [-0.55, -0.55, 0.63],
  ]
  for (const d of oceanDirs) push(d, 0.85, 29.44)
  return list
}

const ANCHORS = makeAnchors()
const SIGMA = 0.4
const FALLBACK_R = 29.12
const FALLBACK_W = 0.09

/* ----------------------------------------------------------------- roads */

type Road = { a: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3; width: number }

function buildRoads(): Road[] {
  const byId = new Map(ZONES.map((z) => [z.id, z]))
  const pairs: [string, string, number?][] = [
    ["bazaar", "beach", 0.9],
    ["beach", "temple", 0.7],
    ["bazaar", "samadhi", 0.85],
    ["samadhi", "ghat", 0.8],
    ["ghat", "grove", 0.8],
    ["grove", "workshop", 0.7],
    ["grove", "mill", 0.85],
    ["mill", "ghat", 0.8],
    ["haveli", "bazaar", 0.9],
    ["haveli", "grove", 0.75],
    ["bazaar", "ghat", 0.8],
    // The metro loop runs an arterial along all nine consecutive zone pairs, but
    // four of them had no road here, so those segments crossed unflattened ground
    // and the corridor tore through it.
    //
    // 1.4 rather than the 0.7-0.9 the other roads use. Width sets how far out the
    // fully-suppressed core reaches, and these four carry a corridor 2.7u wide to
    // the footpath edge: at 0.8 the noise ramps back up *inside* that footprint
    // and the corridor tears worse than with no road at all. 1.4 puts the whole
    // cross-section in the core. The painted ribbon widens too, but the corridor
    // covers it -- only 0.1-0.5u of pale verge shows, less than beach-temple.
    ["samadhi", "grove", 1.4],
    ["haveli", "workshop", 1.4],
    ["workshop", "beach", 1.4],
    ["temple", "mill", 1.4],
  ]
  const roads: Road[] = []
  for (const [x, y, w] of pairs) {
    const za = byId.get(x)
    const zb = byId.get(y)
    if (!za || !zb) continue
    const a = new THREE.Vector3(...za.center).normalize()
    const b = new THREE.Vector3(...zb.center).normalize()
    const n = new THREE.Vector3().crossVectors(a, b).normalize()
    roads.push({ a, b, n, width: w ?? 0.8 })
  }
  return roads
}

/**
 * Angular half-width scale for road ribbons. The planet grew 1.6x while roads
 * only widen 1.3x in world units, so the angular figure shrinks: 0.045 x (1.3/1.6).
 */
const ROAD_BAND = 0.0365625

const ROADS = buildRoads()

const _rv = new THREE.Vector3()

/** angular distance (radians) from a unit direction to the nearest road arc */
export function roadDistance(dir: THREE.Vector3) {
  let best = 9
  for (const road of ROADS) {
    const along = _rv.copy(dir).projectOnPlane(road.n)
    if (along.lengthSq() < 1e-8) continue
    along.normalize()
    const ab = road.a.dot(road.b)
    // inside the arc segment?
    const inside = along.dot(road.a) >= ab - 1e-4 && along.dot(road.b) >= ab - 1e-4
    let d: number
    if (inside) {
      d = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(road.n)))))
    } else {
      d = Math.min(dir.angleTo(road.a), dir.angleTo(road.b))
    }
    const norm = d / (road.width * ROAD_BAND)
    if (norm < best) best = norm
  }
  return best
}

/* ---------------------------------------------------------- metro loop */

/**
 * The metro/arterial loop lives HERE, not in props.ts, because the terrain
 * grading must follow the same geometry the corridor is drawn from. It used
 * to be built inside buildNetwork() while the flattening followed the
 * hand-duplicated ROADS arc list above — the two disagree by up to ~0.5u
 * laterally and the arcs' flat core (~±2u) never covered the corridor's
 * surfaced width (±3.95u), which stood shoulder cliffs and rock stripes
 * along every leg. The loop needs only ZONES, so it moves below props in
 * the dependency graph and props.ts imports it.
 */

const ZONE_DIRS_T = ZONES.map((z) => new THREE.Vector3(...z.center).normalize())

/** closed tour of all nine zones: nearest neighbour from KR Market, then 2-opt */
function planLoop(): number[] {
  const n = ZONE_DIRS_T.length
  const dist = (a: number, b: number) => ZONE_DIRS_T[a].angleTo(ZONE_DIRS_T[b])
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

/**
 * The arterial passes each zone TANGENTIALLY, not through its centre.
 *
 * The loop is seeded from the zone centres, which are terrain anchors and may
 * never move — so instead the control points NEAR each hub are pushed sideways
 * with a smoothstep falloff, and the ribbon bows around the zone. Before this,
 * the centreline passed 0.0–0.4u from every zone centre and ran straight
 * through the market, the mill sheds and the temple ensemble: 74 props and
 * villagers stood inside the surfaced width. After, 8.4–9.0u (beach 6.6u,
 * pulled back by its neighbours' bows) and 2 remain.
 *
 * `side` is +1 or −1 about the local road direction, chosen per zone by
 * measuring which side leaves more buildable ground inside the zone radius.
 */
const HUB_OFFSET: Record<string, { side: number; dist: number }> = {
  bazaar: { side: -1, dist: 9 },
  mill: { side: -1, dist: 9 },
  ghat: { side: 1, dist: 9 },
  haveli: { side: -1, dist: 9 },
  grove: { side: 1, dist: 9 },
  samadhi: { side: -1, dist: 9 },
  workshop: { side: 1, dist: 9 },
  temple: { side: -1, dist: 9 },
  // Sampangi Kere gains nothing from this — its ground is too steep to build
  // on either way — but it is offset for a consistent ribbon.
  beach: { side: 1, dist: 9 },
}
/** angular window over which a hub's push falls off to nothing */
const HUB_OFFSET_WINDOW = 0.5

/** even arc-length resample spacing (radians) — one sample ≈ 0.8 world units */
const LOOP_SAMPLE = 0.02
/**
 * Spacing of the extra spline controls seeded along each leg's great circle.
 * Smaller hugs the arc more tightly, larger rounds each hub more generously.
 */
const LOOP_CONTROL_STEP = 0.12

export type MetroLoop = {
  /** zone indices (into ZONES) in tour order */
  order: number[]
  /** unit directions of the resampled closed loop, xyz-packed */
  dirs: Float64Array
  n: number
  /** arc length between consecutive samples (radians) */
  step: number
  /** total loop arc length (radians) */
  total: number
  /** arc position of each zone centre along the loop, in `order` order */
  zoneT: number[]
}

export const METRO_LOOP: MetroLoop = (() => {
  const order = planLoop()
  // Catmull-Rom through the zone centres alone bows off the geodesics, so each
  // leg is also seeded with controls along its own great circle: the curve hugs
  // the arc between hubs and only rounds the corner at each one.
  const controls: THREE.Vector3[] = []
  const zoneControl: number[] = []
  for (let i = 0; i < order.length; i++) {
    const a = ZONE_DIRS_T[order[i]]
    const b = ZONE_DIRS_T[order[(i + 1) % order.length]]
    const om = a.angleTo(b)
    const sin = Math.sin(om)
    zoneControl.push(controls.length)
    const k = Math.max(1, Math.round(om / LOOP_CONTROL_STEP))
    for (let j = 0; j < k; j++) {
      const t = (j / k) * om
      controls.push(
        sin < 1e-9
          ? a.clone()
          : a
              .clone()
              .multiplyScalar(Math.sin(om - t) / sin)
              .addScaledVector(b, Math.sin(t) / sin)
              .normalize(),
      )
    }
  }

  // ---- push the controls near each hub aside, so the road passes tangentially
  for (let i = 0; i < order.length; i++) {
    const zi = order[i]
    const off = HUB_OFFSET[ZONES[zi].id]
    if (!off?.dist) continue
    const Z = ZONE_DIRS_T[zi]
    // the anchor's own radius: terrainRadius() cannot be called here, it is
    // built ON this loop
    const R = new THREE.Vector3(...ZONES[zi].center).length()
    const prev = ZONE_DIRS_T[order[(i - 1 + order.length) % order.length]]
    const next = ZONE_DIRS_T[order[(i + 1) % order.length]]
    const din = Z.clone().sub(prev)
    din.addScaledVector(Z, -din.dot(Z))
    const dout = next.clone().sub(Z)
    dout.addScaledVector(Z, -dout.dot(Z))
    if (din.lengthSq() < 1e-12 || dout.lengthSq() < 1e-12) continue
    // road direction through the hub = bisector of the two legs
    const fwd = din.normalize().add(dout.normalize())
    if (fwd.lengthSq() < 1e-12) continue
    fwd.normalize()
    const perp = new THREE.Vector3().crossVectors(fwd, Z).normalize()
    for (const c of controls) {
      const ang = c.angleTo(Z)
      if (ang > HUB_OFFSET_WINDOW) continue
      const x = ang / HUB_OFFSET_WINDOW
      const fall = 1 - x * x * (3 - 2 * x)
      c.addScaledVector(perp, (off.side * off.dist * fall) / R).normalize()
    }
  }

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

  const n = Math.max(16, Math.round(total / LOOP_SAMPLE))
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

  // the closed spline passes through control k at u = k/K, so sample
  // j = k/K * M is that control and cum[j] its arc position
  const K = controls.length
  const zoneT = zoneControl.map((k) => cum[Math.min(M, Math.round((k / K) * M))])

  return { order, dirs, n, step, total, zoneT }
})()

/** angular distance (radians) from a unit direction to the nearest loop sample */
export function loopAngle(dir: THREE.Vector3) {
  const { dirs, n } = METRO_LOOP
  let bd = -2
  let bi = 0
  for (let i = 0; i < n; i += 4) {
    const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2]
    if (d > bd) {
      bd = d
      bi = i
    }
  }
  for (let k = bi - 3; k <= bi + 3; k++) {
    const i = ((k % n) + n) % n
    const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2]
    if (d > bd) bd = d
  }
  return Math.acos(Math.max(-1, Math.min(1, bd)))
}

/**
 * Noise suppression band around the loop, in world units. The corridor's
 * surfaced width ends at 3.95u and its shoulder at 5.55u (props.ts), so the
 * fully-flat core covers the whole surfaced width with margin and the ramp
 * releases well outside the shoulder.
 */
const LOOP_FLAT_CORE = 4.4
const LOOP_FLAT_RAMP = 9

/* -------------------------------------------------------------- height */

const _d = new THREE.Vector3()

/** base landform radius, without the fine noise detail */
function baseRadius(dir: THREE.Vector3) {
  let num = FALLBACK_R * FALLBACK_W
  let den = FALLBACK_W
  for (let i = 0; i < ANCHORS.length; i++) {
    const a = ANCHORS[i]
    const dot = Math.max(-1, Math.min(1, dir.dot(a.dir)))
    const theta = Math.acos(dot)
    const t = theta / SIGMA
    const w = a.w * Math.exp(-t * t)
    num += w * a.r
    den += w
  }
  return num / den
}

/**
 * The landform WITHOUT the corridor grading — noise, anchors, shoreline. The
 * road profile is built from THIS, and the public terrainRadius() then grades
 * the ground toward that profile, so the two never chase each other.
 */
function naturalRadius(dir: THREE.Vector3) {
  const base = baseRadius(dir)
  const x = dir.x
  const y = dir.y
  const z = dir.z
  // large rolling lumps + fine crunch, flattened along the roads.
  // The ramp back to full noise was 0.15 -> 1 over road 1..1.9, which packed the
  // whole amplitude change into ~1.1 world units and stood a wall of artificial
  // cross-slope along every verge: it drove the corridor punch-through and the
  // brown rock stripes flanking the roads. Widened to 1..2.6 with a higher floor,
  // which is the same suppression spread thin enough to read as a graded shoulder.
  const road = roadDistance(dir)
  let flat = road < 1 ? 0.28 : road < 2.6 ? 0.28 + 0.72 * ((road - 1) / 1.6) : 1
  // the drawn corridor follows the metro loop, not the painted arcs — grade
  // along the geometry that is actually surfaced (skip when already at floor)
  if (flat > 0.28) {
    const lat = loopAngle(dir) * base
    if (lat < LOOP_FLAT_RAMP) {
      const loopFlat =
        lat < LOOP_FLAT_CORE
          ? 0.28
          : 0.28 + 0.72 * ((lat - LOOP_FLAT_CORE) / (LOOP_FLAT_RAMP - LOOP_FLAT_CORE))
      if (loopFlat < flat) flat = loopFlat
    }
  }
  const lumps = fbm(x * 5.1, y * 5.1, z * 5.1, 3) * 2.16
  const detail = fbm(x * 15.3, y * 15.3, z * 15.3, 3) * 0.672
  const ridges =
    (1 - Math.abs(fbm(x * 3.2 + 11, y * 3.2 + 5, z * 3.2 + 3, 2))) * 1.2
  let r = base + (lumps + detail) * flat + ridges * flat * (base > 40 ? 1 : 0.35)
  // beaches flatten out where they meet the sea
  if (r < WATER_LEVEL + 1.76) {
    const t = Math.max(0, (r - (WATER_LEVEL - 2.56)) / 4.32)
    r = WATER_LEVEL - 2.56 + t * t * 4.32
  }
  return r
}

/* -------------------------------------------- corridor grading (P47) */

/**
 * The road's height profile, owned by the terrain so the GROUND can be graded
 * to it. It used to live only in props.ts: the road deck rode a smoothed fill
 * envelope up to 1.2u above ground that never moved, and the whole network
 * read as a causeway on a permanent embankment — every zone showed a road
 * hovering over its own land. Here the ground itself is pulled up to the
 * profile across the corridor band, so road and land meet.
 */
export const ROAD_MAX_FILL = 1.2
/** smoothing windows in loop samples (0.02 rad ≈ 0.8u each) */
const PROFILE_SMOOTH = 9
const PROFILE_ITERATIONS = 10
const PROFILE_ITER_SMOOTH = 2
/** ground equals the road bed out to here (world units from the centreline) */
const GRADE_FULL = 4.4
/** grading feathers back to the natural landform by here — wide, or the
 * feather itself is steep enough to trip the rock colouring into stripes */
const GRADE_OUT = 11

let _profileH: Float64Array | null = null
let _profileCumS: Float64Array | null = null

function profileGrid(): Float64Array {
  if (_profileH) return _profileH
  const { dirs, n, step } = METRO_LOOP
  const probe = new THREE.Vector3()
  const raw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    probe.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2])
    raw[i] = naturalRadius(probe)
  }
  const wrap = (i: number) => ((i % n) + n) % n
  const mean = (src: Float64Array, w: number) => {
    const out = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let s = 0
      for (let k = -w; k <= w; k++) s += src[wrap(i + k)]
      out[i] = s / (2 * w + 1)
    }
    return out
  }
  // crest-clearing envelope start, then constrained smoothing: smooth, clamp
  // into [ground, ground + fill cap], repeat — ends on the clamp so the fill
  // bound is exact (P45 pipeline, moved here at the loop's own resolution)
  const roll = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let m = -Infinity
    for (let k = -PROFILE_SMOOTH; k <= PROFILE_SMOOTH; k++) {
      const v = raw[wrap(i + k)]
      if (v > m) m = v
    }
    roll[i] = m
  }
  let h = mean(roll, PROFILE_SMOOTH)
  for (let it = 0; it < PROFILE_ITERATIONS; it++) {
    h = mean(h, PROFILE_ITER_SMOOTH)
    for (let i = 0; i < n; i++) {
      if (h[i] < raw[i]) h[i] = raw[i]
      else if (h[i] > raw[i] + ROAD_MAX_FILL) h[i] = raw[i] + ROAD_MAX_FILL
    }
  }
  // A CROSSING IS STRUCTURE, NOT EARTH. ROAD_MAX_FILL is an earth-fill rule,
  // and applying it over water dragged the road down into every gorge, so the
  // bridge then had to climb back out — 27u of ramp for an 18u crossing, and
  // a deck that sprawled into the neighbouring junction. Over water the
  // profile instead flies straight between the two banks, and the deck simply
  // follows it, so road and bridge are the same line by construction.
  {
    // Springs from a real BANK, not the water.s edge: the natural ground is
    // already diving as it approaches a shoreline, so a line starting there
    // inherits the dive and leaves a 0.67u kink at the bridge mouth.
    const wet = (i: number) => raw[i] < WATER_LEVEL + 3.2
    let start = 0
    while (start < n && wet(start)) start++
    if (start < n) {
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n
        if (!wet(i)) continue
        let len = 0
        while (wet((start + k + len) % n)) len++
        const a = h[(start + k - 1 + n) % n]
        const b = h[(start + k + len) % n]
        for (let j = 0; j < len; j++) {
          const idx = (start + k + j) % n
          const f = (j + 1) / (len + 1)
          const line = a + (b - a) * f
          if (line > h[idx]) h[idx] = line
        }
        k += len - 1
      }
    }
  }
  _profileH = h
  // cumulative WORLD arc length along the profile surface (radial term
  // included) — dash phase and any along-road measure key off this
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const along = step * 0.5 * (h[i] + h[(i + 1) % n])
    cum[i + 1] = cum[i] + Math.hypot(along, h[(i + 1) % n] - h[i])
  }
  _profileCumS = cum
  return h
}

const _lpProbe = new THREE.Vector3()

/** rideable corridor height at loop arc position t — seam-free, cap exact */
export function loopProfileAt(t: number) {
  const h = profileGrid()
  const { dirs, n, step } = METRO_LOOP
  let x = t / step
  x = ((x % n) + n) % n
  const i = Math.floor(x)
  const f = x - i
  const j = (i + 1) % n
  let v = h[i] + (h[j] - h[i]) * f
  // re-clamp at the query point so the fill cap holds exactly everywhere
  _lpProbe
    .set(
      dirs[i * 3] + (dirs[j * 3] - dirs[i * 3]) * f,
      dirs[i * 3 + 1] + (dirs[j * 3 + 1] - dirs[i * 3 + 1]) * f,
      dirs[i * 3 + 2] + (dirs[j * 3 + 2] - dirs[i * 3 + 2]) * f,
    )
    .normalize()
  const raw = naturalRadius(_lpProbe)
  if (v < raw) v = raw
  // the fill cap is earth only: over water the road is carried by a bridge,
  // so re-clamping here would pull the deck straight back into the river
  else if (raw >= WATER_LEVEL + 3.2 && v > raw + ROAD_MAX_FILL) v = raw + ROAD_MAX_FILL
  return v
}

/**
 * World distance ridden along the corridor from t=0 to t. GLOBAL and
 * unwrapped (the final leg's t runs past the closed loop's seam), so dash
 * phase never resets at a leg seam.
 */
export function loopWorldS(t: number) {
  profileGrid()
  const cum = _profileCumS!
  const n = cum.length - 1
  const totalAngular = n * METRO_LOOP.step
  const wraps = Math.floor(t / totalAngular)
  const x = (t - wraps * totalAngular) / METRO_LOOP.step
  const i = Math.min(n - 1, Math.floor(x))
  const f = x - i
  return wraps * cum[n] + cum[i] + (cum[i + 1] - cum[i]) * f
}

/* ---------------------------------------------------- civic plot grading */

/**
 * Civic plot sites are graded LEVEL the same way the corridor band is graded
 * to the road profile: flat core covering the pad, smoothstep ramp back to
 * the natural landform. Sites are only known once props.ts has run its ring
 * search (it needs pillars, buildings and villagers), so it registers them
 * here mid-build; everything sampled afterwards — the planet mesh included —
 * sees the graded ground. Ungraded, the pads sat on 2.8–9.0u of relief and
 * read as torn floating patches, and a plumb tower on a 13° sloped pad read
 * as a 13° lean.
 */
export type PlotGradeSite = {
  dir: THREE.Vector3
  radius: number
  /**
   * Force the level instead of sampling it. A row of shopfronts standing
   * shoulder to shoulder has to be ONE terrace: sampled per building, each
   * pad grades to its own ground and the "nearest wins" rule below puts a
   * hard step down the middle of the row.
   */
  level?: number
}
let _plotGrades: { dir: THREE.Vector3; radius: number; level: number }[] = []
/** ramp width from pad edge back to natural ground, world units */
export const PLOT_GRADE_RAMP = 3

export function registerPlotGrading(sites: PlotGradeSite[]) {
  // levels are sampled BEFORE the list is installed, so each plot's level is
  // the road-graded (but plot-ungraded) ground at its own centre
  const grades = sites.map((s) => {
    const dir = s.dir.clone().normalize()
    return { dir, radius: s.radius, level: s.level ?? terrainRadius(dir) }
  })
  _plotGrades = grades
}

/**
 * Surface radius at a (normalised) direction: the natural landform, graded
 * toward the road profile inside the corridor band. The road-height term is a
 * kernel-weighted average over nearby loop samples, so where two legs meet at
 * a hub the ground blends BOTH smoothly instead of jumping allegiance at the
 * bisector.
 */
export function terrainRadius(dir: THREE.Vector3) {
  const nat = naturalRadius(dir)
  // Water is never graded. Blending near the crossings either cut dry banks
  // under the waterline or raised an earthen land bridge across the gorge
  // floor (both measured) — the embankment simply stops at the water's edge,
  // and the wet topology stays exactly the natural one the bridge spans were
  // scanned from. Also skips the scan for most of the planet (ocean).
  if (nat < WATER_LEVEL + 0.48) return nat
  const h = profileGrid()
  const { dirs, n, step } = METRO_LOOP
  // conservative angular window: GRADE_OUT at the lowest ground the loop sees
  const cosMax = 0.9285 // cos(GRADE_OUT / 29)
  let bd = -2
  let bi = 0
  let wsum = 0
  let psum = 0
  for (let i = 0; i < n; i++) {
    const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2]
    if (d > bd) {
      bd = d
      bi = i
    }
    if (d > cosMax) {
      // wet-crossing samples are excluded: the profile dives under the
      // bridges there, and letting it feed the average CUT the dry banks
      // below the waterline — a new wet pocket opened right where the deck
      // ends (measured, workshop-beach)
      if (h[i] < WATER_LEVEL + 0.3) continue
      const lat = Math.acos(Math.min(1, d)) * nat
      if (lat < GRADE_OUT) {
        const w = 1 - lat / GRADE_OUT
        wsum += w
        psum += w * h[i]
      }
    }
  }
  // NOTE both far-from-road exits still pass through plotGrade — plots sit
  // 6u+ off the corridor, exactly where these fire
  if (wsum <= 1e-6) return plotGrade(dir, nat, nat)
  const latMin = Math.acos(Math.max(-1, Math.min(1, bd))) * nat
  if (latMin >= GRADE_OUT) return plotGrade(dir, nat, nat)
  const road = psum / wsum
  const x = (latMin - GRADE_FULL) / (GRADE_OUT - GRADE_FULL)
  let f = x <= 0 ? 1 : x >= 1 ? 0 : 1 - x * x * (3 - 2 * x)
  // fade the grading out where few dry samples remain (mid-crossing), so the
  // ill-conditioned average never steers the ground
  if (wsum < 2) f *= wsum / 2
  // plot grading first, the corridor cap below stays authoritative: a pad
  // ramp may reach toward a road edge, and ground the ramp lifts must still
  // never rise above the deck
  let r = plotGrade(dir, nat + (road - nat) * f, nat)
  // The averaged road height overshoots the actual deck in profile sags,
  // where a second leg feeds the kernel at a hub, AND on hillside cuts (the
  // feathered blend leaves the cut floor above the deck — grass sheeted over
  // whole carriageway stretches). Under the surfaced corridor the ground may
  // never rise above the profile itself (continuous nearest-t sample), fill
  // or cut alike. Wet crossings are exempt: there the profile dives under
  // the bridge and the gorge must keep its walls.
  if (latMin < 5.5) {
    // continuous t: project onto the two adjacent loop segments in unit space
    let bestT = bi * step
    let bestD2 = Infinity
    const sx = (i: number) => dirs[(((i % n) + n) % n) * 3]
    const sy = (i: number) => dirs[(((i % n) + n) % n) * 3 + 1]
    const sz = (i: number) => dirs[(((i % n) + n) % n) * 3 + 2]
    for (const j of [bi - 1, bi + 1]) {
      const ax = sx(bi), ay = sy(bi), az = sz(bi)
      const bx = sx(j) - ax, by = sy(j) - ay, bz = sz(j) - az
      const len2 = bx * bx + by * by + bz * bz
      if (len2 < 1e-12) continue
      let ft = ((dir.x - ax) * bx + (dir.y - ay) * by + (dir.z - az) * bz) / len2
      ft = Math.max(0, Math.min(1, ft))
      const px = ax + bx * ft - dir.x
      const py = ay + by * ft - dir.y
      const pz = az + bz * ft - dir.z
      const d2 = px * px + py * py + pz * pz
      if (d2 < bestD2) {
        bestD2 = d2
        bestT = (bi + (j < bi ? -ft : ft)) * step
      }
    }
    const prof = loopProfileAt(bestT)
    if (prof >= WATER_LEVEL + 0.3 && r > prof) {
      // feather the cap off across the shoulder (4.5 → 5.5u) so a cut bank
      // rises as a slope past the road edge instead of a cliff at 5.5u
      const s = latMin <= 4.5 ? 0 : latMin - 4.5
      const k = s <= 0 ? 0 : s * s * (3 - 2 * s)
      r = prof + (r - prof) * k
    }
  }
  return r
}

/** level the ground toward the nearest registered plot's pad level */
function plotGrade(dir: THREE.Vector3, r: number, nat: number) {
  let bestF = 0
  let bestLevel = 0
  for (let i = 0; i < _plotGrades.length; i++) {
    const g = _plotGrades[i]
    const d = dir.dot(g.dir)
    if (d < 0.9) continue
    const lat = Math.acos(Math.min(1, d)) * nat
    const x = (lat - g.radius) / PLOT_GRADE_RAMP
    const f = x <= 0 ? 1 : x >= 1 ? 0 : 1 - x * x * (3 - 2 * x)
    // nearest wins: plots keep mutual clearance, but two RAMPS may brush
    if (f > bestF) {
      bestF = f
      bestLevel = g.level
    }
  }
  return bestF > 0 ? r + (bestLevel - r) * bestF : r
}

/** convenience: surface radius for an arbitrary (unnormalised) position */
export function radiusAt(v: THREE.Vector3) {
  _d.copy(v).normalize()
  return terrainRadius(_d)
}

/* --------------------------------------------------------------- colours */

const C = {
  deepSand: new THREE.Color("#d9bd8a"),
  sand: new THREE.Color("#ecd9a8"),
  grass: new THREE.Color("#6fae4e"),
  grassDark: new THREE.Color("#568a39"),
  grassLight: new THREE.Color("#8fc76a"),
  rock: new THREE.Color("#b09a7e"),
  rockDark: new THREE.Color("#8f7a62"),
  road: new THREE.Color("#8a8a92"),
  roadEdge: new THREE.Color("#e8e4da"),
  snowless: new THREE.Color("#c9b48f"),
}

const _tmpA = new THREE.Vector3()
const _tmpB = new THREE.Vector3()
const _tmpC = new THREE.Vector3()
/**
 * slopeAt's own probe vector. It must NOT be `_rv`: slopeAt passes this
 * straight into terrainRadius, which calls roadDistance, which uses `_rv` as
 * its own scratch — the offset direction was being overwritten mid-evaluation
 * and the resulting bogus gradients pinned the slope at 1.0 over half the map.
 */
const _slopeV = new THREE.Vector3()

/** slope: 0 = flat ground, 1 = vertical cliff */
function slopeAt(dir: THREE.Vector3, r: number) {
  // sample two nearby directions on the tangent plane
  const up = Math.abs(dir.y) > 0.9 ? _tmpA.set(1, 0, 0) : _tmpA.set(0, 1, 0)
  _tmpB.copy(up).cross(dir).normalize()
  _tmpC.copy(dir).cross(_tmpB).normalize()
  const eps = 0.012
  const d1 = _slopeV.copy(dir).addScaledVector(_tmpB, eps).normalize()
  const r1 = terrainRadius(d1)
  const d2 = _slopeV.copy(dir).addScaledVector(_tmpC, eps).normalize()
  const r2 = terrainRadius(d2)
  const grad = Math.sqrt((r1 - r) ** 2 + (r2 - r) ** 2) / (eps * r)
  return Math.min(1, grad * 0.9)
}

const _col = new THREE.Color()

export function terrainColor(dir: THREE.Vector3, r: number, target: THREE.Color) {
  const slope = slopeAt(dir, r)
  const road = roadDistance(dir)

  if (r < WATER_LEVEL + 0.88) {
    target.copy(r < WATER_LEVEL ? C.deepSand : C.sand)
  } else if (slope > 0.55 || r > 53.12) {
    target.copy(slope > 0.75 ? C.rockDark : C.rock)
    if (r > 55.04) target.lerp(C.snowless, Math.min(1, (r - 55.04) / 3.2))
  } else {
    const shade = fbm(dir.x * 9.3 + 3, dir.y * 9.3 - 7, dir.z * 9.3 + 1, 2)
    target.copy(C.grass)
    if (shade > 0.12) target.lerp(C.grassLight, Math.min(1, (shade - 0.12) * 3))
    else if (shade < -0.1) target.lerp(C.grassDark, Math.min(1, (-shade - 0.1) * 3))
    // beach fringe
    if (r < WATER_LEVEL + 2.4) target.lerp(C.sand, (WATER_LEVEL + 2.4 - r) / 1.52)
  }

  // roads: a solid grey ribbon, a pale edge band, then a short feather out
  if (road < 1.5 && r > WATER_LEVEL + 0.48) {
    _col.copy(road < 1 ? C.road : C.roadEdge)
    target.lerp(_col, road < 1 ? 0.95 : road < 1.3 ? 0.8 : 0.8 * ((1.5 - road) / 0.2))
  }

  // faint hand-painted grain
  const grain = fbm(dir.x * 42, dir.y * 42, dir.z * 42, 2) * 0.03
  target.offsetHSL(0, 0, grain)
  return target
}

/* ------------------------------------------------------------- geometry */

export function buildPlanetGeometry(detail = 52) {
  const geo = new THREE.IcosahedronGeometry(1, detail)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const count = pos.count
  const colors = new Float32Array(count * 3)
  const dir = new THREE.Vector3()
  const col = new THREE.Color()
  for (let i = 0; i < count; i++) {
    dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const r = terrainRadius(dir)
    pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r)
    terrainColor(dir, r, col)
    colors[i * 3] = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/* -------------------------------------------------- placement utilities */

/**
 * Where an npc actually stands: the authored position supplies the direction,
 * the terrain supplies the radius. Shared by the renderer and the proximity
 * check so a villager is never hit-tested somewhere they are not drawn.
 */
export function npcSurfacePosition(position: Vec3) {
  const dir = new THREE.Vector3(position[0], position[1], position[2]).normalize()
  return dir.multiplyScalar(terrainRadius(dir))
}

/** put an object on the ground at a direction, oriented to the surface */
export function surfacePoint(dir: THREE.Vector3, offset = 0) {
  const r = terrainRadius(dir) + offset
  return dir.clone().multiplyScalar(r)
}

/** deterministic rng */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** random unit direction inside an angular cap around `center` */
export function randomDirInCap(
  center: THREE.Vector3,
  maxAngle: number,
  rand: () => number,
) {
  const dir = center.clone().normalize()
  const tangent = new THREE.Vector3(0, 1, 0)
  if (Math.abs(dir.y) > 0.9) tangent.set(1, 0, 0)
  const t1 = new THREE.Vector3().crossVectors(tangent, dir).normalize()
  const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize()
  const a = rand() * Math.PI * 2
  const d = Math.sqrt(rand()) * maxAngle
  return dir
    .clone()
    .addScaledVector(t1, Math.cos(a) * Math.tan(d))
    .addScaledVector(t2, Math.sin(a) * Math.tan(d))
    .normalize()
}

/** quaternion that stands an object up along the surface normal */
export function surfaceQuaternion(dir: THREE.Vector3, spin: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  )
  return q.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin),
  )
}

export { slopeAt }
