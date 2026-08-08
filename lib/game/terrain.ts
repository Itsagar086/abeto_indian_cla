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
  for (const d of oceanDirs) push(d, 0.85, 18.4)
  return list
}

const ANCHORS = makeAnchors()
const SIGMA = 0.4
const FALLBACK_R = 18.2
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
    const norm = d / (road.width * 0.045)
    if (norm < best) best = norm
  }
  return best
}

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

/** surface radius at a (normalised) direction */
export function terrainRadius(dir: THREE.Vector3) {
  const base = baseRadius(dir)
  const x = dir.x
  const y = dir.y
  const z = dir.z
  // large rolling lumps + fine crunch, flattened along the roads
  const road = roadDistance(dir)
  const flat = road < 1 ? 0.15 : road < 1.9 ? 0.15 + 0.85 * ((road - 1) / 0.9) : 1
  const lumps = fbm(x * 5.1, y * 5.1, z * 5.1, 3) * 1.35
  const detail = fbm(x * 15.3, y * 15.3, z * 15.3, 3) * 0.42
  const ridges =
    (1 - Math.abs(fbm(x * 3.2 + 11, y * 3.2 + 5, z * 3.2 + 3, 2))) * 0.75
  let r = base + (lumps + detail) * flat + ridges * flat * (base > 25 ? 1 : 0.35)
  // beaches flatten out where they meet the sea
  if (r < WATER_LEVEL + 1.1) {
    const t = Math.max(0, (r - (WATER_LEVEL - 1.6)) / 2.7)
    r = WATER_LEVEL - 1.6 + t * t * 2.7
  }
  return r
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

/** slope: 0 = flat ground, 1 = vertical cliff */
function slopeAt(dir: THREE.Vector3, r: number) {
  // sample two nearby directions on the tangent plane
  const up = Math.abs(dir.y) > 0.9 ? _tmpA.set(1, 0, 0) : _tmpA.set(0, 1, 0)
  _tmpB.copy(up).cross(dir).normalize()
  _tmpC.copy(dir).cross(_tmpB).normalize()
  const eps = 0.012
  const d1 = _rv.copy(dir).addScaledVector(_tmpB, eps).normalize()
  const r1 = terrainRadius(d1)
  const d2 = _rv.copy(dir).addScaledVector(_tmpC, eps).normalize()
  const r2 = terrainRadius(d2)
  const grad = Math.sqrt((r1 - r) ** 2 + (r2 - r) ** 2) / (eps * r)
  return Math.min(1, grad * 0.9)
}

const _col = new THREE.Color()

export function terrainColor(dir: THREE.Vector3, r: number, target: THREE.Color) {
  const slope = slopeAt(dir, r)
  const road = roadDistance(dir)

  if (r < WATER_LEVEL + 0.55) {
    target.copy(r < WATER_LEVEL ? C.deepSand : C.sand)
  } else if (slope > 0.74 || r > 33.2) {
    target.copy(slope > 0.88 ? C.rockDark : C.rock)
    if (r > 34.4) target.lerp(C.snowless, Math.min(1, (r - 34.4) / 2))
  } else {
    const shade = fbm(dir.x * 9.3 + 3, dir.y * 9.3 - 7, dir.z * 9.3 + 1, 2)
    target.copy(C.grass)
    if (shade > 0.12) target.lerp(C.grassLight, Math.min(1, (shade - 0.12) * 3))
    else if (shade < -0.1) target.lerp(C.grassDark, Math.min(1, (-shade - 0.1) * 3))
    // beach fringe
    if (r < WATER_LEVEL + 1.5) target.lerp(C.sand, (WATER_LEVEL + 1.5 - r) / 0.95)
  }

  // roads: a solid grey ribbon, a pale edge band, then a short feather out
  if (road < 1.5 && r > WATER_LEVEL + 0.3) {
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
