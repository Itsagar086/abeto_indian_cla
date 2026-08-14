"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Html, Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { NPCS, type Npc } from "@/lib/game/data"
import { surfaceQuaternion, terrainRadius } from "@/lib/game/terrain"
import { groundOrDeck } from "@/lib/game/props"
import { useGameStore, useNpcHasQuest } from "@/lib/game/store"
import { toonGradient } from "@/lib/game/toon"
import { BODY, emptyPose } from "@/lib/game/character"
import { ARCHETYPE, animalMotion, driftRadii, npcLook, npcMotion } from "@/lib/game/npc"

const INK = "#2c2620"
const B = BODY

function Ink() {
  return <Outlines thickness={0.03} color={INK} />
}

/* ------------------------------------------------------------ shared cost */

/**
 * ONE geometry per limb type for the whole roster — not one per villager.
 * Every human NPC is drawn from these through instanced meshes, so twenty
 * villagers cost the same handful of draw calls as one.
 */
const GEO = {
  pelvis: new THREE.BoxGeometry(B.pelvisW, B.pelvisH + 0.08, B.torsoD - 0.01),
  torso: new THREE.BoxGeometry(B.torsoW + 0.03, B.torsoH, B.torsoD + 0.02),
  sash: new THREE.BoxGeometry(0.06, 0.5, 0.025),
  head: new THREE.SphereGeometry(B.headR, 8, 6),
  hair: new THREE.SphereGeometry(B.headR + 0.012, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58),
  hat: new THREE.BoxGeometry(0.26, 0.09, 0.26),
  upperArm: new THREE.BoxGeometry(0.1, B.upperArm, 0.1),
  foreArm: new THREE.BoxGeometry(0.085, B.foreArm, 0.085),
  hand: new THREE.BoxGeometry(0.085, 0.09, 0.075),
  thigh: new THREE.BoxGeometry(0.115, B.thigh, 0.115),
  shin: new THREE.BoxGeometry(0.095, B.shin, 0.095),
  shoe: new THREE.BoxGeometry(B.footW + 0.03, 0.105, B.footLen),
}
/** rough size of each part, so one outline factor gives a constant ink width */
const PART_SIZE: Record<keyof typeof GEO, number> = {
  pelvis: 0.26, torso: 0.35, sash: 0.5, head: 0.26, hair: 0.28, hat: 0.26,
  upperArm: 0.32, foreArm: 0.26, hand: 0.09, thigh: 0.45, shin: 0.45, shoe: 0.24,
}
type PartKey = keyof typeof GEO
const PARTS = Object.keys(GEO) as PartKey[]
/** how many of each part a single villager owns */
const PART_COUNT: Record<PartKey, number> = {
  pelvis: 1, torso: 1, sash: 1, head: 1, hair: 1, hat: 1,
  upperArm: 2, foreArm: 2, hand: 2, thigh: 2, shin: 2, shoe: 2,
}
/** which look colour each part takes */
const PART_COLOR: Record<PartKey, "skin" | "hair" | "shirt" | "pants" | "shoe" | "accent"> = {
  pelvis: "pants", torso: "shirt", sash: "accent", head: "skin", hair: "hair",
  hat: "accent", upperArm: "shirt", foreArm: "skin", hand: "skin",
  thigh: "pants", shin: "pants", shoe: "shoe",
}

/** villagers past this are drawn without ink; past FREEZE they stop animating */
const OUTLINE_DIST = 26
const FREEZE_DIST = 55

const HUMANS = NPCS.map((n, i) => ({ n, i })).filter(
  ({ n }) => n.kind !== "dog" && n.kind !== "peacock",
)

/** one Object3D chain per villager: the joints, and a node per drawn part */
type Rig = {
  root: THREE.Object3D
  pelvis: THREE.Object3D
  torso: THREE.Object3D
  head: THREE.Object3D
  arm: THREE.Object3D[]
  fore: THREE.Object3D[]
  thigh: THREE.Object3D[]
  shin: THREE.Object3D[]
  ankle: THREE.Object3D[]
  /** the nodes whose world matrices become instance matrices */
  nodes: Record<PartKey, THREE.Object3D[]>
}

function makeRig(hat: number): Rig {
  const o = (x = 0, y = 0, z = 0) => {
    const n = new THREE.Object3D()
    n.position.set(x, y, z)
    return n
  }
  const root = o()
  const pelvis = o(0, B.hipY, 0)
  const torso = o(0, B.pelvisH, 0)
  const head = o(0, B.neckY - B.torsoY0, 0)
  root.add(pelvis)
  pelvis.add(torso)
  torso.add(head)

  const nodes = {
    pelvis: [o(0, B.pelvisH / 2 - 0.02, 0)],
    torso: [o(0, B.torsoH / 2 - 0.02, 0)],
    sash: [o(0, 0.22, 0.02)],
    head: [o(0, B.headY - B.neckY, 0)],
    hair: [o(0, B.headY - B.neckY + 0.012, -0.008)],
    hat: [o(0, B.headY - B.neckY + 0.115, hat === 2 ? -0.015 : 0)],
    upperArm: [] as THREE.Object3D[],
    foreArm: [] as THREE.Object3D[],
    hand: [] as THREE.Object3D[],
    thigh: [] as THREE.Object3D[],
    shin: [] as THREE.Object3D[],
    shoe: [] as THREE.Object3D[],
  } as Record<PartKey, THREE.Object3D[]>

  nodes.sash[0].rotation.z = 0.6
  // headwear: a flat cap, a wrapped scarf (wider, lower) or a tall cap
  const hatScale = hat === 1 ? [1, 0.7, 1] : hat === 2 ? [1.12, 0.85, 1.12] : [0.86, 1.5, 0.86]
  nodes.hat[0].scale.set(hatScale[0], hatScale[1], hatScale[2])
  if (hat === 0) nodes.hat[0].scale.setScalar(0.0001) // no hat: collapse it away
  pelvis.add(nodes.pelvis[0])
  torso.add(nodes.torso[0], nodes.sash[0])
  head.add(nodes.head[0], nodes.hair[0], nodes.hat[0])

  const arm: THREE.Object3D[] = []
  const fore: THREE.Object3D[] = []
  const thigh: THREE.Object3D[] = []
  const shin: THREE.Object3D[] = []
  const ankle: THREE.Object3D[] = []
  for (const sx of [-1, 1]) {
    const a = o(sx * B.shoulderX, B.shoulderY - B.torsoY0, 0)
    const f = o(0, -B.upperArm, 0)
    torso.add(a)
    a.add(f)
    const mu = o(0, -B.upperArm / 2, 0)
    const mf = o(0, -B.foreArm / 2, 0)
    const mh = o(0, -B.foreArm - 0.035, 0)
    a.add(mu)
    f.add(mf, mh)
    arm.push(a)
    fore.push(f)
    nodes.upperArm.push(mu)
    nodes.foreArm.push(mf)
    nodes.hand.push(mh)

    const th = o(sx * B.hipX, 0, 0)
    const sh = o(0, -B.thigh, 0)
    pelvis.add(th)
    th.add(sh)
    const mt = o(0, -B.thigh / 2, 0)
    const ms = o(0, -B.shin / 2, 0)
    const ank = o(0, -B.shin, 0)
    const mo = o(0, -0.012, 0.035)
    th.add(mt)
    sh.add(ms, ank)
    ank.add(mo)
    ankle.push(ank)
    thigh.push(th)
    shin.push(sh)
    nodes.thigh.push(mt)
    nodes.shin.push(ms)
    nodes.shoe.push(mo)
  }
  return { root, pelvis, torso, head, arm, fore, thigh, shin, ankle, nodes }
}

const _m = new THREE.Matrix4()
const _scale = new THREE.Matrix4()
const _camDir = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _up = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _tmp = new THREE.Vector3()

/**
 * Every human villager, drawn as 12 instanced meshes plus 12 more for the ink
 * on nearby ones — 24 draw calls for the whole roster instead of 45 EACH.
 * Off-screen and distant villagers stop posing entirely; their instances keep
 * whatever they last held, which nobody can see.
 */
function Crowd() {
  const rigs = useMemo(() => HUMANS.map(({ i }) => makeRig(npcLook(i).hat)), [])
  const bases = useMemo(
    () =>
      HUMANS.map(({ n }) => {
        // the SPAWN is a terrain anchor and is never written — this only reads it
        const dir = new THREE.Vector3(...n.position).normalize()
        const pos = dir.clone().multiplyScalar(groundOrDeck(dir))
        const t1 = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        const right = new THREE.Vector3().crossVectors(t1, dir).normalize()
        const fwd = new THREE.Vector3().crossVectors(dir, right).normalize()
        return { dir, pos, right, fwd }
      }),
    [],
  )
  const meshes = useRef<Record<string, THREE.InstancedMesh | null>>({})
  const motion = useMemo(
    () => HUMANS.map(() => ({ state: "", fwd: 0, right: 0, yaw: 0, pose: emptyPose() })),
    [],
  )

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime
    const nearIdx: number[] = []
    for (let k = 0; k < HUMANS.length; k++) {
      const base = bases[k]
      const dist = camera.position.distanceTo(base.pos)
      if (dist > FREEZE_DIST) continue
      // behind the camera and not close: nothing to see, so do not pose it
      _camDir.copy(base.pos).sub(camera.position).normalize()
      camera.getWorldDirection(_tmp)
      if (dist > 12 && _camDir.dot(_tmp) < -0.1) continue

      const { i } = HUMANS[k]
      const m = npcMotion(i, t, dist < 4, motion[k])
      const rig = rigs[k]
      const p = m.pose
      const look = npcLook(i)

      // drift is applied to the DRAWN position only; base.pos is untouched
      _up.copy(base.dir)
      _fwd.copy(base.fwd)
      _right.copy(base.right)
      _tmp
        .copy(base.pos)
        .addScaledVector(_fwd, m.fwd)
        .addScaledVector(_right, m.right)
      _tmp.setLength(groundOrDeck(_tmp.clone().normalize()))
      rig.root.position.copy(_tmp)
      rig.root.quaternion.copy(surfaceQuaternion(_tmp.clone().normalize(), m.yaw))
      rig.root.scale.setScalar(look.height)

      rig.pelvis.position.y = B.hipY + p.bob
      rig.pelvis.rotation.z = p.torsoRoll
      rig.torso.rotation.set(-p.torsoLean, p.torsoTwist, 0)
      rig.head.rotation.set(-p.headPitch, p.headYaw, 0)
      rig.arm[0].rotation.x = -p.shoulderL
      rig.arm[1].rotation.x = -p.shoulderR
      rig.fore[0].rotation.x = p.elbowL
      rig.fore[1].rotation.x = p.elbowR
      rig.thigh[0].rotation.x = -p.hipL
      rig.thigh[1].rotation.x = -p.hipR
      rig.shin[0].rotation.x = p.kneeL
      rig.shin[1].rotation.x = p.kneeR
      rig.ankle[0].rotation.x = -p.ankleL
      rig.ankle[1].rotation.x = -p.ankleR
      rig.root.updateMatrixWorld(true)

      for (const part of PARTS) {
        const im = meshes.current[part]
        if (!im) continue
        const list = rig.nodes[part]
        for (let s = 0; s < list.length; s++) {
          im.setMatrixAt(k * PART_COUNT[part] + s, list[s].matrixWorld)
        }
      }
      if (dist < OUTLINE_DIST) nearIdx.push(k)
    }

    // ink pass: only villagers inside OUTLINE_DIST, packed to the front so the
    // instance count (and the cost) tracks how many are actually near
    for (const part of PARTS) {
      const im = meshes.current[part]
      const ol = meshes.current[`${part}#ink`]
      if (im) im.instanceMatrix.needsUpdate = true
      if (!ol || !im) continue
      const grow = 1 + 0.06 / PART_SIZE[part]
      _scale.makeScale(grow, grow, grow)
      let w = 0
      for (const k of nearIdx) {
        for (let s = 0; s < PART_COUNT[part]; s++) {
          im.getMatrixAt(k * PART_COUNT[part] + s, _m)
          _m.multiply(_scale)
          ol.setMatrixAt(w++, _m)
        }
      }
      ol.count = w
      ol.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {PARTS.map((part) => {
        const total = HUMANS.length * PART_COUNT[part]
        return (
          <group key={part}>
            <instancedMesh
              ref={(r) => {
                meshes.current[part] = r
                if (r && !r.userData.painted) {
                  r.userData.painted = true
                  const c = new THREE.Color()
                  HUMANS.forEach(({ i }, k) => {
                    c.set(npcLook(i)[PART_COLOR[part]])
                    for (let s = 0; s < PART_COUNT[part]; s++) {
                      r.setColorAt(k * PART_COUNT[part] + s, c)
                    }
                  })
                  if (r.instanceColor) r.instanceColor.needsUpdate = true
                  // start folded away; the first frame places them
                  r.frustumCulled = false
                }
              }}
              args={[GEO[part], undefined, total]}
              castShadow
              receiveShadow
            >
              <meshToonMaterial gradientMap={toonGradient} />
            </instancedMesh>
            <instancedMesh
              ref={(r) => {
                meshes.current[`${part}#ink`] = r
                if (r) {
                  r.count = 0
                  r.frustumCulled = false
                }
              }}
              args={[GEO[part], undefined, total]}
            >
              <meshBasicMaterial color={INK} side={THREE.BackSide} />
            </instancedMesh>
          </group>
        )
      })}
    </>
  )
}

/* ---------------------------------------------------------------- animals */

/** Sheru: sleeps curled, stretches, resettles. Same primitives, same ink. */
function Dog({ npc, index }: { npc: Npc; index: number }) {
  const g = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const m = animalMotion(index, clock.elapsedTime)
    if (body.current) body.current.scale.setScalar(1 + m.breathe)
    if (head.current) {
      // curled: the head tucks round toward the flank
      head.current.rotation.y = m.curl * 2.1
      head.current.position.y = 0.2 - m.curl * 0.1 + m.lift
      head.current.rotation.x = -m.curl * 0.35
    }
    if (g.current) g.current.position.y = m.lift * 0.5
    if (tail.current) tail.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * (1 - m.curl) * 0.5
  })
  return (
    <group ref={g}>
      <mesh ref={body} position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.22, 0.2, 0.46]} />
        <meshToonMaterial color={npc.outfit} gradientMap={toonGradient} />
        <Ink />
      </mesh>
      <group ref={head} position={[0, 0.2, 0.26]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 0.17, 0.2]} />
          <meshToonMaterial color={npc.outfit} gradientMap={toonGradient} />
          <Ink />
        </mesh>
        <mesh position={[0, 0.02, 0.13]}>
          <boxGeometry args={[0.1, 0.08, 0.1]} />
          <meshToonMaterial color={npc.hair} gradientMap={toonGradient} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.07, 0.11, -0.02]} rotation={[0, 0, s * 0.2]}>
            <boxGeometry args={[0.05, 0.09, 0.03]} />
            <meshToonMaterial color={npc.hair} gradientMap={toonGradient} />
          </mesh>
        ))}
      </group>
      <group ref={tail} position={[0, 0.26, -0.23]}>
        <mesh position={[0, 0.02, -0.06]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.05, 0.05, 0.16]} />
          <meshToonMaterial color={npc.hair} gradientMap={toonGradient} />
        </mesh>
      </group>
      {[
        [-0.08, 0.16],
        [0.08, 0.16],
        [-0.08, -0.16],
        [0.08, -0.16],
      ].map(([x, z], k) => (
        <mesh key={k} position={[x, 0.05, z]}>
          <boxGeometry args={[0.06, 0.11, 0.07]} />
          <meshToonMaterial color={npc.outfit} gradientMap={toonGradient} />
        </mesh>
      ))}
    </group>
  )
}

/** the peacock: steps, bobs, and fans its tail on its own slow clock */
function Peacock({ npc, index }: { npc: Npc; index: number }) {
  const body = useRef<THREE.Group>(null)
  const fan = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + index
    const m = animalMotion(index, clock.elapsedTime)
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(t * 1.6)) * 0.03
      body.current.rotation.y = Math.sin(t * 0.4) * 0.5
    }
    if (fan.current) {
      const open = m.state === "stretch" || m.state === "sit" ? 1 : 0.25
      fan.current.scale.set(open, open, 1)
    }
  })
  return (
    <group ref={body}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.18, 0.24, 0.3]} />
        <meshToonMaterial color={npc.outfit} gradientMap={toonGradient} />
        <Ink />
      </mesh>
      <mesh position={[0, 0.52, 0.1]} castShadow>
        <boxGeometry args={[0.11, 0.14, 0.12]} />
        <meshToonMaterial color={npc.outfit} gradientMap={toonGradient} />
        <Ink />
      </mesh>
      <mesh position={[0, 0.62, 0.1]}>
        <boxGeometry args={[0.02, 0.09, 0.02]} />
        <meshToonMaterial color={npc.hair} gradientMap={toonGradient} />
      </mesh>
      <mesh ref={fan} position={[0, 0.45, -0.2]} rotation={[0.45, 0, 0]}>
        <coneGeometry args={[0.38, 0.62, 10]} />
        <meshToonMaterial color={npc.hair} gradientMap={toonGradient} />
        <Ink />
      </mesh>
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} position={[x, 0.1, 0.02]}>
          <boxGeometry args={[0.03, 0.16, 0.03]} />
          <meshToonMaterial color="#b8863a" gradientMap={toonGradient} />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------------- nameplates */

const _samplePos = new THREE.Vector3()
const _sampleDir = new THREE.Vector3()

function Nameplate({ npc, index }: { npc: Npc; index: number }) {
  const isAnimal = npc.kind === "dog" || npc.kind === "peacock"
  const pos = useMemo(() => {
    const d = new THREE.Vector3(...npc.position).normalize()
    return d.clone().multiplyScalar(groundOrDeck(d))
  }, [npc.position])
  const up = pos.clone().normalize()
  const quat = surfaceQuaternion(up, 0)
  const hasQuest = useNpcHasQuest(npc.id)
  const isNear = useGameStore((s) => s.nearbyNpcId === npc.id)
  const labelRef = useRef<HTMLDivElement>(null)
  const frameCount = useRef(0)
  const phase = useRef(index % 6)
  const labelAnchor = pos.clone().addScaledVector(up, isAnimal ? 0.6 : 1.95)

  useFrame(({ camera }) => {
    const el = labelRef.current
    if (!el) return
    frameCount.current++
    if (frameCount.current % 6 !== phase.current) return
    let blocked = false
    for (let i = 1; i <= 9; i++) {
      _samplePos.lerpVectors(camera.position, labelAnchor, i * 0.1)
      _sampleDir.copy(_samplePos).normalize()
      if (_samplePos.length() < terrainRadius(_sampleDir) - 0.15) {
        blocked = true
        break
      }
    }
    el.style.display = blocked ? "none" : ""
  })

  return (
    <group position={pos.toArray()} quaternion={[quat.x, quat.y, quat.z, quat.w]}>
      {npc.kind === "dog" && <Dog npc={npc} index={index} />}
      {npc.kind === "peacock" && <Peacock npc={npc} index={index} />}
      <Html position={[0, isAnimal ? 0.6 : 1.95, 0]} center distanceFactor={9} occlude={false}>
        <div ref={labelRef} className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
          <div className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap">
            {npc.name}
          </div>
          {hasQuest && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-900 shadow">
              !
            </div>
          )}
          {isNear && (
            <div className="mt-0.5 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-800 shadow">
              Press E
            </div>
          )}
        </div>
      </Html>
    </group>
  )
}

export function NpcLayer() {
  // touch the drift budget once so it is computed before the first frame
  useMemo(() => driftRadii(), [])
  return (
    <group>
      <Crowd />
      {NPCS.map((n, i) => (
        <Nameplate key={n.id} npc={n} index={i} />
      ))}
    </group>
  )
}

export { ARCHETYPE }
