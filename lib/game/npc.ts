import * as THREE from "three"
import { NPCS, WATER_LEVEL } from "./data"
import { corridorSurface, groundOrDeck, propCollision } from "./props"
import { characterPose, emptyPose, type Pose } from "./character"

/**
 * NPC brains and looks. Pure logic, no React, so the harness can assert the
 * two hard constraints without a browser: a villager's SPAWN never moves (it
 * is a terrain RBF anchor — see WORLD_DESIGN rule 4), and the visual drift
 * around it never enters the road corridor, the water, or a building.
 */

export type Archetype =
  | "VENDOR"
  | "TRADESMAN"
  | "IDLER"
  | "DEVOTEE"
  | "COMMUTER"
  | "ANIMAL"

/** one archetype per villager, from the role their dialogue already implies */
export const ARCHETYPE: Record<string, Archetype> = {
  // stalls and stock
  "flower-radha": "VENDOR",
  "chai-wala": "VENDOR",
  "manager-verma": "VENDOR",
  amma: "VENDOR",
  // hands-on work
  "mechanic-gopal": "TRADESMAN",
  "mill-worker-a": "TRADESMAN",
  "mill-worker-b": "TRADESMAN",
  "mill-worker-c": "TRADESMAN",
  // sitting, talking, watching
  "kid-chintu": "IDLER",
  "sadhu-wanderer": "IDLER",
  "musician-iqbal": "IDLER",
  "boatman-deva": "IDLER",
  "boss-verma-senior": "IDLER",
  // temple
  "priest-baba": "DEVOTEE",
  // desks and rounds
  "raju-clerk": "COMMUTER",
  "coder-priya": "COMMUTER",
  "engineer-iyer": "COMMUTER",
  "engineer-rao": "COMMUTER",
  // animals
  "street-dog": "ANIMAL",
  peacock: "ANIMAL",
}

/* ------------------------------------------------------------------ looks */

export type NpcLook = {
  skin: string
  hair: string
  shirt: string
  pants: string
  shoe: string
  /** sash / dupatta / bag — the one saturated note per villager */
  accent: string
  /** overall scale, 0.9–1.1 of the 1.8u reference */
  height: number
  /** headwear: 0 none, 1 cap, 2 turban/scarf, 3 tall cap */
  hat: number
  /** per-npc animation offset, so nobody breathes or steps in sync */
  phase: number
}

const SKINS = ["#c39160", "#b5814e", "#9d6a3c", "#a8763f", "#8d5c31"]
const HAIRS = ["#1f1a16", "#2b2420", "#141110", "#3a2f26", "#5c5148"]
const SHIRTS = [
  "#4d5a6b", "#7d6b8a", "#c8543f", "#3f7f5c", "#d8cbb0",
  "#5e7ba6", "#b5763a", "#7a8b52", "#a53f52", "#40707d",
]
const PANTS = ["#8b7d5f", "#4a4640", "#6a6250", "#2f3a45", "#7a6a58"]
const SHOES = ["#e2ded2", "#3a3630", "#7a5c3a", "#4a4a52"]
const ACCENTS = ["#f4531f", "#f2a03d", "#d8324b", "#2f8f7f", "#e8d24a", "#8e4fb0"]

/** deterministic per-index hash, so the roster is identical every load */
function h(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function npcLook(index: number): NpcLook {
  const npc = NPCS[index]
  const pick = <T,>(arr: T[], salt: number) => arr[Math.floor(h(index, salt) * arr.length) % arr.length]
  return {
    // the authored per-npc colours still lead; the palettes fill the rest
    skin: pick(SKINS, 1),
    hair: npc.hair ?? pick(HAIRS, 2),
    shirt: npc.outfit ?? pick(SHIRTS, 3),
    pants: pick(PANTS, 4),
    shoe: pick(SHOES, 5),
    accent: npc.color ?? pick(ACCENTS, 6),
    height: 0.9 + h(index, 7) * 0.2,
    hat: Math.floor(h(index, 8) * 4),
    phase: h(index, 9),
  }
}

/* ------------------------------------------------------- where they may go */

/**
 * How far each villager may drift from their spawn. Their spawn direction is
 * a terrain anchor and is NEVER written; this is a purely visual budget, and
 * it is trimmed per villager until every point on its rim is legal ground —
 * off the road corridor, out of the water, clear of every solid prop.
 */
export const DRIFT_STEPS = [1.6, 1.2, 0.8, 0.4, 0]

const _p = new THREE.Vector3()
const _hit = { normal: new THREE.Vector3(), depth: 0 }

function legal(pos: THREE.Vector3) {
  _p.copy(pos).normalize()
  const g = groundOrDeck(_p)
  if (g < WATER_LEVEL + 0.5) return false
  if (corridorSurface(_p) !== null) return false
  _hit.depth = 0
  if (propCollision(pos, 0.36, 1.8, _hit)) return false
  return true
}

let _drift: number[] | null = null

/** per-villager drift radius, computed once against the finished world */
export function driftRadii(): number[] {
  if (_drift) return _drift
  const out: number[] = []
  for (let i = 0; i < NPCS.length; i++) {
    const dir = new THREE.Vector3(...NPCS[i].position).normalize()
    const base = dir.clone().multiplyScalar(groundOrDeck(dir))
    const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(t1, dir).normalize()
    const v = new THREE.Vector3().crossVectors(dir, u).normalize()
    let radius = 0
    for (const r of DRIFT_STEPS) {
      if (r === 0) break
      let ok = true
      for (let a = 0; a < 8 && ok; a++) {
        const ang = (a / 8) * Math.PI * 2
        const cand = base
          .clone()
          .addScaledVector(u, Math.cos(ang) * r)
          .addScaledVector(v, Math.sin(ang) * r)
        cand.setLength(groundOrDeck(cand.clone().normalize()))
        if (!legal(cand)) ok = false
      }
      if (ok) {
        radius = r
        break
      }
    }
    out.push(radius)
  }
  _drift = out
  return out
}

/* ------------------------------------------------------------- behaviours */

export type NpcMotion = {
  state: string
  /** drift from spawn, in the villager's own tangent frame (world units) */
  fwd: number
  right: number
  /** heading, radians about the surface normal */
  yaw: number
  pose: Pose
}

const CYCLE: Record<Archetype, number> = {
  VENDOR: 11,
  TRADESMAN: 9,
  IDLER: 14,
  DEVOTEE: 24,
  COMMUTER: 18,
  ANIMAL: 16,
}

const _in = {
  gait: 0, phase: 0, time: 0, air: 0, rising: 0, carry: 0, groundL: 0, groundR: 0,
}

/**
 * One villager's motion at time `t`. Deterministic in (index, t, playerNear),
 * so it needs no per-frame mutable state and cannot desynchronise — the
 * "state machine" is a time-driven selector plus one reactive input.
 */
export function npcMotion(
  index: number,
  t: number,
  playerNear: boolean,
  out: NpcMotion = { state: "", fwd: 0, right: 0, yaw: 0, pose: emptyPose() },
): NpcMotion {
  const npc = NPCS[index]
  const arch = ARCHETYPE[npc.id] ?? "IDLER"
  const look = npcLook(index)
  const drift = driftRadii()[index]
  // every villager runs on their own clock
  const life = CYCLE[arch]
  const local = t + look.phase * life
  const u = ((local % life) + life) % life // 0..life
  const f = u / life // 0..1
  const pose = out.pose

  _in.gait = 0
  _in.phase = 0
  _in.time = local
  _in.air = 0
  _in.rising = 0
  _in.carry = 0
  _in.groundL = 0
  _in.groundR = 0
  out.fwd = 0
  out.right = 0
  out.yaw = 0

  switch (arch) {
    case "VENDOR": {
      // stand at the stall; periodically arrange stock; wave when approached
      characterPose(_in, pose)
      if (playerNear) {
        out.state = "greet"
        const w = Math.sin(t * 4.5) * 0.5
        pose.shoulderR = -1.5 + w * 0.3
        pose.elbowR = 1.1 - w * 0.4
        pose.headYaw += 0.25
      } else if (f < 0.35) {
        out.state = "arrange"
        const k = Math.sin((f / 0.35) * Math.PI * 4)
        pose.torsoLean += 0.45
        pose.shoulderL = -0.9 + k * 0.35
        pose.shoulderR = -0.9 - k * 0.35
        pose.elbowL = 1.3
        pose.elbowR = 1.3
        pose.headPitch -= 0.4
      } else {
        out.state = "tend"
        pose.shoulderL = -0.15
        pose.shoulderR = -0.15
        pose.elbowL = 0.6
        pose.elbowR = 0.6
      }
      break
    }
    case "TRADESMAN": {
      characterPose(_in, pose)
      if (f < 0.6) {
        // crouched at the work, hammering
        out.state = "work"
        pose.hipL = 1.25
        pose.hipR = 1.15
        pose.kneeL = 2.1
        pose.kneeR = 1.95
        pose.bob -= 0.34
        pose.torsoLean += 0.55
        pose.headPitch -= 0.5
        const hammer = Math.sin(t * 7 + look.phase * 6)
        pose.shoulderR = -0.5 - Math.max(0, hammer) * 0.8
        pose.elbowR = 1.2 + Math.max(0, hammer) * 0.9
        pose.shoulderL = -0.6
        pose.elbowL = 1.4
      } else if (f < 0.78) {
        // stand and wipe the hands
        out.state = "wipe"
        const k = Math.sin(t * 3)
        pose.shoulderL = -0.7
        pose.shoulderR = -0.7
        pose.elbowL = 1.5 + k * 0.25
        pose.elbowR = 1.5 - k * 0.25
        pose.headPitch -= 0.3
      } else {
        // stretch out the back
        out.state = "stretch"
        const k = Math.sin(((f - 0.78) / 0.22) * Math.PI)
        pose.shoulderL = -2.4 * k
        pose.shoulderR = -2.4 * k
        pose.elbowL = 0.2
        pose.elbowR = 0.2
        pose.torsoLean -= 0.3 * k
        pose.headPitch += 0.4 * k
      }
      break
    }
    case "IDLER": {
      characterPose(_in, pose)
      out.state = "sit"
      // sitting on a step: hips and knees folded, body dropped onto them
      pose.hipL = 1.5
      pose.hipR = 1.45
      pose.kneeL = 1.5
      pose.kneeR = 1.55
      pose.bob -= 0.42
      pose.shoulderL = -0.35
      pose.shoulderR = -0.35
      pose.elbowL = 0.9
      pose.elbowR = 0.85
      pose.torsoLean += 0.12
      // chatting: a slow turn toward a neighbour, with the odd nod
      const chat = Math.sin(local * 0.6)
      out.yaw = chat * 0.35
      pose.headYaw += chat * 0.5
      pose.headPitch += Math.sin(local * 2.2) * 0.12
      if (playerNear) {
        // look up as the player passes
        out.state = "look"
        pose.headPitch += 0.35
        pose.headYaw += 0.4
      }
      break
    }
    case "DEVOTEE": {
      // a slow circuit near the shrine, pausing to bow
      if (f < 0.7) {
        out.state = "circuit"
        const c = f / 0.7
        const ang = c * Math.PI * 2
        const r = drift * 0.8
        out.fwd = Math.cos(ang) * r
        out.right = Math.sin(ang) * r
        out.yaw = ang + Math.PI / 2
        _in.gait = 0.85
        // distance actually covered around the circle drives the stride
        _in.phase = (c * 2 * Math.PI * r) / (4 * 0.38)
        characterPose(_in, pose)
        pose.shoulderL = -0.2
        pose.shoulderR = -0.2
        pose.elbowL = 1.2
        pose.elbowR = 1.2
      } else {
        out.state = "bow"
        characterPose(_in, pose)
        const k = Math.sin(((f - 0.7) / 0.3) * Math.PI)
        pose.torsoLean += 1.0 * k
        pose.headPitch -= 0.5 * k
        pose.shoulderL = -0.5 - 0.6 * k
        pose.shoulderR = -0.5 - 0.6 * k
        pose.elbowL = 1.9
        pose.elbowR = 1.9
        pose.bob -= 0.1 * k
      }
      break
    }
    case "COMMUTER": {
      // out along a short fixed route, wait, check the watch, walk back
      const r = drift
      if (f < 0.3) {
        out.state = "outbound"
        const c = f / 0.3
        out.fwd = c * r
        out.yaw = 0
        _in.gait = 1
        _in.phase = (c * r) / (4 * 0.38)
        characterPose(_in, pose)
      } else if (f < 0.45) {
        out.state = "wait"
        out.fwd = r
        characterPose(_in, pose)
        const c = (f - 0.45 / 3) / 0.15
        if (c > 0.35 && c < 0.75) {
          // check the watch
          pose.shoulderL = -1.05
          pose.elbowL = 1.85
          pose.headPitch -= 0.45
        }
      } else if (f < 0.75) {
        out.state = "return"
        const c = (f - 0.45) / 0.3
        out.fwd = (1 - c) * r
        out.yaw = Math.PI
        _in.gait = 1
        _in.phase = (c * r) / (4 * 0.38)
        characterPose(_in, pose)
      } else {
        out.state = "idle"
        characterPose(_in, pose)
      }
      break
    }
    default: {
      out.state = "animal"
      characterPose(_in, pose)
      break
    }
  }
  return out
}

/**
 * The dog's and peacock's small cycle, returned as plain numbers the renderer
 * maps onto their own primitive rigs.
 */
export function animalMotion(index: number, t: number) {
  const look = npcLook(index)
  const life = CYCLE.ANIMAL
  const u = ((t + look.phase * life) % life + life) % life
  const f = u / life
  if (f < 0.55) return { state: "sleep", curl: 1, lift: 0, breathe: Math.sin(t * 1.1) * 0.02 }
  if (f < 0.7) {
    const k = Math.sin(((f - 0.55) / 0.15) * Math.PI)
    return { state: "stretch", curl: 1 - k, lift: k * 0.12, breathe: 0 }
  }
  if (f < 0.85) return { state: "sit", curl: 0.35, lift: 0.06, breathe: Math.sin(t * 1.6) * 0.03 }
  const k = Math.sin(((f - 0.85) / 0.15) * Math.PI)
  return { state: "resettle", curl: 0.35 + k * 0.65, lift: 0.06 * (1 - k), breathe: 0 }
}
