/**
 * Terrain system for the Dak Wala world.
 *
 * Generates the spherical planet surface using radial-basis function (RBF)
 * interpolation through anchor points derived from NPC positions and zone
 * centres. Produces analytically-evaluable height and colour for any
 * direction on the sphere — no raycasting needed.
 */

import * as THREE from "three"
import { NPCS } from "../data/npcs"
import { ZONES } from "../data/zones"
import { WATER_LEVEL } from "../config/world"
import type { Vec3 } from "../data/zones"
import { roadDistance } from "./roads"
import { fbm } from "../utilities/math"


/* -------------------------------------------------------------- anchors */

type Anchor = { dir: THREE.Vector3; r: number; w: number }

function makeAnchors(): Anchor[] {
  const list: Anchor[] = []
  const push = (p: Vec3, w = 1, rOverride?: number) => {
    const v = new THREE.Vector3(p[0], p[1], p[2])
    const r = rOverride ?? v.length()
    list.push({ dir: v.clone().normalize(), r, w })
  }
  // every NPC stands on the ground → their distance is the surface radius
  for (const n of NPCS) push(n.position, 1)
  // zone centres carry the large scale landforms
  for (const z of ZONES) push(z.center, 1.35)
  // extra ocean anchors so the far side of the planet drops below sea level
  const oceanDirs: Vec3[] = [
    [ 0.2, -0.95,  0.24],
    [ 0.62, -0.5,   0.6],
    [-0.7,   0.2, -0.68],
    [ 0.86, -0.2,  0.47],
    [-0.35, -0.75, -0.56],
    [ 0.1,   0.55,  0.83],
    [ 0.75,  0.45,  0.48],
    [-0.9,   0.35, -0.26],
    [ 0.3,  -0.3,   0.9],
    [-0.55, -0.55,  0.63],
  ]
  for (const d of oceanDirs) push(d, 0.85, 18.4)
  return list
}

const ANCHORS = makeAnchors()
const SIGMA = 0.4
const FALLBACK_R = 18.2
const FALLBACK_W = 0.09

/* -------------------------------------------------------------- height */

const _d = new THREE.Vector3()

/** Base landform radius, without the fine noise detail. */
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

/** Surface radius at a (normalised) direction. */
export function terrainRadius(dir: THREE.Vector3) {
  const base = baseRadius(dir)
  const x = dir.x
  const y = dir.y
  const z = dir.z
  // large rolling lumps + fine crunch, flattened along the roads
  const road = roadDistance(dir)
  const flat = road < 1 ? 0.15 : road < 1.9 ? 0.15 + 0.85 * ((road - 1) / 0.9) : 1
  const lumps  = fbm(x * 5.1,  y * 5.1,  z * 5.1,  3) * 1.35
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

/** Convenience: surface radius for an arbitrary (unnormalised) position. */
export function radiusAt(v: THREE.Vector3) {
  _d.copy(v).normalize()
  return terrainRadius(_d)
}

/* --------------------------------------------------------------- colours */

const C = {
  deepSand:  new THREE.Color("#c9a876"),
  sand:      new THREE.Color("#e0c191"),
  grass:     new THREE.Color("#7ea34f"),
  grassDark: new THREE.Color("#5e8339"),
  grassLight:new THREE.Color("#9cbf66"),
  rock:      new THREE.Color("#ab8f72"),
  rockDark:  new THREE.Color("#8a6f55"),
  road:      new THREE.Color("#c17a4a"),
  roadEdge:  new THREE.Color("#d7a878"),
  snowless:  new THREE.Color("#c9b48f"),
}

const _tmpA = new THREE.Vector3()
const _tmpB = new THREE.Vector3()
const _tmpC = new THREE.Vector3()
// Scratch vector reused by slopeAt for sampling nearby surface directions
const _slopeV = new THREE.Vector3()

/** Slope: 0 = flat ground, 1 = vertical cliff. */
export function slopeAt(dir: THREE.Vector3, r: number) {
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
  const road  = roadDistance(dir)

  if (r < WATER_LEVEL + 0.55) {
    target.copy(r < WATER_LEVEL ? C.deepSand : C.sand)
  } else if (slope > 0.62 || r > 33.2) {
    target.copy(slope > 0.8 ? C.rockDark : C.rock)
    if (r > 34.4) target.lerp(C.snowless, Math.min(1, (r - 34.4) / 2))
  } else {
    const shade = fbm(dir.x * 9.3 + 3, dir.y * 9.3 - 7, dir.z * 9.3 + 1, 2)
    target.copy(C.grass)
    if (shade > 0.12)  target.lerp(C.grassLight, Math.min(1, (shade - 0.12) * 3))
    else if (shade < -0.1) target.lerp(C.grassDark, Math.min(1, (-shade - 0.1) * 3))
    // beach fringe
    if (r < WATER_LEVEL + 1.5) target.lerp(C.sand, (WATER_LEVEL + 1.5 - r) / 0.95)
  }

  if (road < 1.5 && r > WATER_LEVEL + 0.3) {
    _col.copy(road < 1 ? C.road : C.roadEdge)
    target.lerp(_col, road < 1 ? 0.92 : 0.55 * (1.5 - road) / 0.5)
  }

  // faint hand-painted grain
  const grain = fbm(dir.x * 42, dir.y * 42, dir.z * 42, 2) * 0.05
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
    colors[i * 3]     = col.r
    colors[i * 3 + 1] = col.g
    colors[i * 3 + 2] = col.b
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

