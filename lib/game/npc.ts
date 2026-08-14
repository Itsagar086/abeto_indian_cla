import * as THREE from "three"
import { NPCS, WATER_LEVEL } from "./data"
import { METRO_LOOP } from "./terrain"
import { civicPlotReport, corridorSurface, groundOrDeck, propCollision, spinAlong } from "./props"
import { characterPose, emptyPose, reachFor, type Pose } from "./character"
import { lookFor, type NpcLook } from "./looks"

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
  amma: "VENDOR",
  // Hands-on work. Iyer and Deva moved here in P52: an engineer setting a
  // pump housing and a boatman fighting a knot are both crouched over a thing
  // with their hands, which is exactly what TRADESMAN animates.
  "mechanic-gopal": "TRADESMAN",
  "mill-worker-a": "TRADESMAN",
  "mill-worker-b": "TRADESMAN",
  "mill-worker-c": "TRADESMAN",
  "engineer-iyer": "TRADESMAN",
  "boatman-deva": "TRADESMAN",
  // sitting, talking, watching
  "kid-chintu": "IDLER",
  "sadhu-wanderer": "IDLER",
  "musician-iqbal": "IDLER",
  "boss-verma-senior": "IDLER",
  // temple
  "priest-baba": "DEVOTEE",
  // Desks and rounds. Verma moved here from VENDOR: a Deputy Regional
  // Assistant Sub-Manager does not mind a stall, he walks about with a board.
  "raju-clerk": "COMMUTER",
  "coder-priya": "COMMUTER",
  "manager-verma": "COMMUTER",
  "engineer-rao": "COMMUTER",
  // animals
  "street-dog": "ANIMAL",
  peacock: "ANIMAL",
}

/* ------------------------------------------------------------------ looks */

/**
 * Costumes are AUTHORED, one entry per villager, in looks.ts. This used to be
 * a Math.sin hash over colour palettes, which is precisely why nobody looked
 * like who they were: a hash can make twenty strangers, but only an author can
 * make a flower seller.
 */
export type { NpcLook } from "./looks"
export { LOOKS } from "./looks"

export function npcLook(index: number): NpcLook {
  return lookFor(NPCS[index]?.id ?? "")
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

/* ---------------------------------------------------------------- routes */

/** villagers who are heading somewhere specific rather than just pacing */
const LANDMARK: Record<string, string> = {
  // Priya is waiting for the bus home from SP Road
  "coder-priya": "busstand",
}

export type NpcRoute = {
  /** walk target in the villager's tangent frame, already inside the budget */
  fwd: number
  right: number
  /** heading that faces the way they walk, and the one that faces the road */
  walkYaw: number
  waitYaw: number
  /** how far the landmark actually is, Infinity when there is none */
  landmarkDist: number
}

let _routes: NpcRoute[] | null = null

export function npcRoutes(): NpcRoute[] {
  if (_routes) return _routes
  const out: NpcRoute[] = []
  const budgets = driftRadii()
  for (let i = 0; i < NPCS.length; i++) {
    const dir = new THREE.Vector3(...NPCS[i].position).normalize()
    const pos = dir.clone().multiplyScalar(groundOrDeck(dir))
    const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(t1, dir).normalize()
    const fwd = new THREE.Vector3().crossVectors(dir, right).normalize()
    const budget = budgets[i]

    // nearest point of the arterial, for "face the road"
    const { dirs, n } = METRO_LOOP
    let bd = -2
    const road = new THREE.Vector3()
    for (let k = 0; k < n; k++) {
      const d = dir.x * dirs[k * 3] + dir.y * dirs[k * 3 + 1] + dir.z * dirs[k * 3 + 2]
      if (d > bd) {
        bd = d
        road.set(dirs[k * 3], dirs[k * 3 + 1], dirs[k * 3 + 2])
      }
    }
    const toRoad = road.clone().addScaledVector(dir, -dir.dot(road))
    const waitYaw =
      toRoad.lengthSq() > 1e-9
        ? spinAlong(dir, new THREE.Vector3().crossVectors(dir, toRoad.normalize()))
        : 0

    // walk direction: toward the landmark if there is one, else straight ahead
    let f = budget
    let r = 0
    let landmarkDist = Infinity
    const lm = LANDMARK[NPCS[i].id]
    if (lm) {
      const plot = civicPlotReport().find((p) => p.id === lm && p.ok)
      if (plot) {
        const pd = plot.dir.clone().normalize()
        const target = pd.clone().multiplyScalar(groundOrDeck(pd))
        landmarkDist = pos.distanceTo(target)
        const to = target.clone().sub(pos)
        to.addScaledVector(dir, -to.dot(dir))
        if (to.lengthSq() > 1e-9) {
          to.normalize()
          // the budget is a hard cap: an anchor may not be walked to its
          // landmark, only leaned toward it
          f = to.dot(fwd) * budget
          r = to.dot(right) * budget
        }
      }
    }
    const walkDir = fwd.clone().multiplyScalar(f).addScaledVector(right, r)
    const walkYaw =
      walkDir.lengthSq() > 1e-9
        ? spinAlong(dir, new THREE.Vector3().crossVectors(dir, walkDir.normalize()))
        : 0
    out.push({ fwd: f, right: r, walkYaw, waitYaw, landmarkDist })
  }
  _routes = out
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
 * The work surface each villager reaches for, in their own frame: the height
 * of the top and the forward distance to the middle of it. These mirror the
 * WORKSTATIONS placed in props.ts — the animation aims at the object rather
 * than gesturing near it, which is what "hammers nothing" meant before.
 */
const REACH: Record<string, { y: number; z: number }> = {
  "chai-wala": { y: 0.83, z: 0.5 },
  amma: { y: 0.83, z: 0.5 },
  "flower-radha": { y: 0.78, z: 0.48 },
  "mechanic-gopal": { y: 0.56, z: 0.44 },
  "mill-worker-a": { y: 0.56, z: 0.44 },
  "mill-worker-b": { y: 0.56, z: 0.44 },
  "mill-worker-c": { y: 0.56, z: 0.44 },
  "engineer-iyer": { y: 0.56, z: 0.44 },
  "boatman-deva": { y: 0.56, z: 0.44 },
  "priest-baba": { y: 0.63, z: 0.62 },
}

/** put both hands on the work surface, allowing for the lean and the scale */
function handsOn(
  pose: Pose,
  id: string,
  height: number,
  dz = 0,
  dy = 0,
  spread = 0.06,
) {
  const r = REACH[id]
  if (!r) return
  const zy = (r.y + dy) * height
  const zz = (r.z + dz) * height
  const l = reachFor(zz, zy, pose.bob, pose.torsoLean, -1)
  const rr = reachFor(zz + spread, zy, pose.bob, pose.torsoLean, 1)
  pose.shoulderL = l.shoulder
  pose.elbowL = l.elbow
  pose.shoulderR = rr.shoulder
  pose.elbowR = rr.elbow
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
        // arranging the stock: both hands ON the counter, working along it
        out.state = "arrange"
        const k = Math.sin((f / 0.35) * Math.PI * 4)
        pose.torsoLean += 0.5
        pose.headPitch -= 0.45
        handsOn(pose, npc.id, look.height, k * 0.07, 0.02)
      } else {
        // tending: hands resting on the near edge of the counter
        out.state = "tend"
        pose.torsoLean += 0.18
        handsOn(pose, npc.id, look.height, -0.08, 0.04)
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
        // the hammer stroke LANDS on the crate: the down position is the work
        // surface itself, the up position is one swing above it
        const hammer = Math.max(0, Math.sin(t * 5 + look.phase * 6))
        handsOn(pose, npc.id, look.height, 0, hammer * 0.34, 0.1)
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
        // bowing to the shrine: hands come together at the offering tray
        out.state = "bow"
        characterPose(_in, pose)
        const k = Math.sin(((f - 0.7) / 0.3) * Math.PI)
        pose.torsoLean += 1.0 * k
        pose.headPitch -= 0.5 * k
        pose.bob -= 0.1 * k
        handsOn(pose, npc.id, look.height, -0.1 * (1 - k), 0.1 * (1 - k), 0.02)
      }
      break
    }
    case "COMMUTER": {
      // out along a short fixed route — toward the bus stand for those who
      // have one — then wait facing the road, check the watch, and walk back
      const route = npcRoutes()[index]
      const len = Math.hypot(route.fwd, route.right)
      if (f < 0.25) {
        out.state = "outbound"
        const c = f / 0.25
        out.fwd = c * route.fwd
        out.right = c * route.right
        out.yaw = route.walkYaw
        _in.gait = 1
        _in.phase = (c * len) / (4 * 0.38)
        characterPose(_in, pose)
      } else if (f < 0.62) {
        // the long half of the cycle: standing at the stop, waiting
        out.state = "wait"
        out.fwd = route.fwd
        out.right = route.right
        out.yaw = route.waitYaw
        characterPose(_in, pose)
        const c = (f - 0.25) / 0.37
        if (c > 0.3 && c < 0.5) {
          // check the watch, again
          pose.shoulderL = -1.05
          pose.elbowL = 1.85
          pose.headPitch -= 0.45
          pose.headYaw += 0.2
        } else if (c > 0.62 && c < 0.8) {
          // crane down the road for a bus that is not coming
          pose.torsoTwist += 0.25
          pose.headYaw += 0.55
          pose.shoulderR = -0.25
        } else {
          pose.shoulderL = -0.1
          pose.shoulderR = -0.1
          pose.elbowL = 0.45
          pose.elbowR = 0.4
        }
      } else if (f < 0.85) {
        out.state = "return"
        const c = (f - 0.62) / 0.23
        out.fwd = (1 - c) * route.fwd
        out.right = (1 - c) * route.right
        out.yaw = route.walkYaw + Math.PI
        _in.gait = 1
        _in.phase = (c * len) / (4 * 0.38)
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
