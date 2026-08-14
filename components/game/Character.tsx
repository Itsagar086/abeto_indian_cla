"use client"

import { useRef, type MutableRefObject } from "react"
import * as THREE from "three"
import { Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { toonGradient } from "@/lib/game/toon"
import { BODY, emptyPose, type Pose } from "@/lib/game/character"

const INK = "#2c2620"
const EDGE = 0.03

function Ink() {
  return <Outlines thickness={EDGE} color={INK} />
}

/**
 * Aarav's palette. The clothing is deliberately muted so ONE hero colour
 * carries the silhouette: vermilion-saffron on the crossbody bag and the
 * backwards cap. It sits near-opposite both backgrounds on the colour wheel —
 * the terrain green (#6fae4e, hue 95°) and the sky/fog teal (#7ecfc4, hue
 * 172°) against vermilion's 15° — and is darker than both, so at distance the
 * bag reads as a solid warm mass on a cool field rather than as a tint.
 */
export type CharacterSkin = {
  skin: string
  hair: string
  /** upper garment */
  shirt: string
  /** lower garment */
  pants: string
  shoe: string
  /** bag + cap: the hero colour */
  hero: string
  /** show the crossbody courier bag */
  bag?: boolean
  /** backwards cap */
  cap?: boolean
}

export const AARAV: CharacterSkin = {
  skin: "#b5814e",
  hair: "#1f1a16",
  shirt: "#4d5a6b",
  pants: "#8b7d5f",
  shoe: "#e2ded2",
  hero: "#f4531f",
  bag: true,
  cap: true,
}

type Props = {
  /** the live pose; the owner (Player, or an NPC brain) writes into it */
  pose: MutableRefObject<Pose>
  skin?: CharacterSkin
  /** carried parcel, drawn in the hand rather than floating overhead */
  carrying?: boolean
}

/**
 * Articulated figure built from primitives only — no GLB, no rigging.
 * Hierarchy: root → pelvis → torso → (head, upper arm → forearm) and
 * pelvis → thigh → shin → foot, each joint an independently rotatable group,
 * so any pose is reachable later without touching this file.
 *
 * Sign convention matches lib/game/character.ts: pose angles are
 * forward-positive, and a three.js rotation.x about +X swings a downward limb
 * toward −Z, hence the negations.
 */
export function Character({ pose, skin = AARAV, carrying = false }: Props) {
  const B = BODY
  const pelvis = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const foreL = useRef<THREE.Group>(null)
  const foreR = useRef<THREE.Group>(null)
  const thighL = useRef<THREE.Group>(null)
  const thighR = useRef<THREE.Group>(null)
  const shinL = useRef<THREE.Group>(null)
  const shinR = useRef<THREE.Group>(null)

  useFrame(() => {
    const p = pose.current ?? emptyPose()
    if (pelvis.current) {
      pelvis.current.position.y = p.bob
      pelvis.current.rotation.z = p.torsoRoll
    }
    if (torso.current) {
      torso.current.rotation.x = -p.torsoLean
      torso.current.rotation.y = p.torsoTwist
    }
    if (head.current) {
      head.current.rotation.x = -p.headPitch
      head.current.rotation.y = p.headYaw
    }
    if (armL.current) armL.current.rotation.x = -p.shoulderL
    if (armR.current) armR.current.rotation.x = -p.shoulderR
    // elbows fold the forearm backward, i.e. the opposite sense to the hip
    if (foreL.current) foreL.current.rotation.x = p.elbowL
    if (foreR.current) foreR.current.rotation.x = p.elbowR
    if (thighL.current) thighL.current.rotation.x = -p.hipL
    if (thighR.current) thighR.current.rotation.x = -p.hipR
    if (shinL.current) shinL.current.rotation.x = p.kneeL
    if (shinR.current) shinR.current.rotation.x = p.kneeR
  })

  const Limb = ({
    len,
    w,
    d,
    color,
  }: {
    len: number
    w: number
    d: number
    color: string
  }) => (
    <mesh position={[0, -len / 2, 0]} castShadow>
      <boxGeometry args={[w, len, d]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
      <Ink />
    </mesh>
  )

  return (
    <group>
      <group ref={pelvis} position={[0, B.hipY, 0]}>
        {/* ---- pelvis block */}
        <mesh position={[0, B.pelvisH / 2, 0]} castShadow>
          <boxGeometry args={[B.pelvisW, B.pelvisH + 0.06, 0.2]} />
          <meshToonMaterial color={skin.pants} gradientMap={toonGradient} />
          <Ink />
        </mesh>

        {/* ---- torso → head + arms */}
        <group ref={torso} position={[0, B.pelvisH, 0]}>
          <mesh position={[0, B.torsoH / 2, 0]} castShadow>
            <boxGeometry args={[B.torsoW, B.torsoH, B.torsoD]} />
            <meshToonMaterial color={skin.shirt} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* tee hem, a touch wider — reads as an oversized shirt */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[B.torsoW + 0.03, 0.12, B.torsoD + 0.03]} />
            <meshToonMaterial color={skin.shirt} gradientMap={toonGradient} />
            <Ink />
          </mesh>

          {/* crossbody strap: one band over the right shoulder, crossing the
              chest AND the back, so the courier silhouette holds from any angle */}
          {skin.bag && (
            <>
              <mesh position={[0, 0.26, B.torsoD / 2]} rotation={[0, 0, 0.62]} castShadow>
                <boxGeometry args={[0.07, 0.56, 0.03]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
              </mesh>
              <mesh position={[0, 0.26, -B.torsoD / 2]} rotation={[0, 0, -0.62]} castShadow>
                <boxGeometry args={[0.07, 0.56, 0.03]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
              </mesh>
              {/* the pouch itself, riding the left hip, canted like a real bag */}
              <mesh position={[-0.2, 0.05, 0.02]} rotation={[0, 0.25, -0.12]} castShadow>
                <boxGeometry args={[0.26, 0.24, 0.16]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
                <Ink />
              </mesh>
              {/* flap, a shade darker so the bag has a readable form */}
              <mesh position={[-0.2, 0.16, 0.03]} rotation={[0, 0.25, -0.12]}>
                <boxGeometry args={[0.27, 0.08, 0.17]} />
                <meshToonMaterial color="#c33f13" gradientMap={toonGradient} />
              </mesh>
            </>
          )}

          {/* ---- head */}
          <group ref={head} position={[0, B.neckY - B.torsoY0, 0]}>
            <mesh position={[0, 0.03, 0]} castShadow>
              <boxGeometry args={[0.12, 0.1, 0.12]} />
              <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
            </mesh>
            <mesh position={[0, B.headY - B.neckY, 0]} castShadow>
              <sphereGeometry args={[B.headR, 8, 6]} />
              <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
              <Ink />
            </mesh>
            {/* hair: a low skull cap plus a nape block, visible under the cap */}
            <mesh position={[0, B.headY - B.neckY + 0.02, -0.03]}>
              <sphereGeometry args={[B.headR + 0.012, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
              <meshToonMaterial color={skin.hair} gradientMap={toonGradient} />
            </mesh>
            {skin.cap && (
              <>
                <mesh position={[0, B.headY - B.neckY + 0.05, 0]} castShadow>
                  <sphereGeometry args={[B.headR + 0.025, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                  <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
                {/* brim pointing BACKWARD — the cap is worn reversed */}
                <mesh position={[0, B.headY - B.neckY + 0.05, -B.headR - 0.05]} castShadow>
                  <boxGeometry args={[0.22, 0.035, 0.13]} />
                  <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
              </>
            )}
          </group>

          {/* ---- arms */}
          {([
            ["L", -1, armL, foreL],
            ["R", 1, armR, foreR],
          ] as const).map(([id, sx, arm, fore]) => (
            <group
              key={id}
              ref={arm}
              position={[sx * B.shoulderX, B.shoulderY - B.torsoY0, 0]}
            >
              <Limb len={B.upperArm} w={0.13} d={0.13} color={skin.shirt} />
              <group ref={fore} position={[0, -B.upperArm, 0]}>
                <Limb len={B.foreArm} w={0.11} d={0.11} color={skin.skin} />
                {/* hand */}
                <mesh position={[0, -B.foreArm - 0.04, 0]} castShadow>
                  <boxGeometry args={[0.11, 0.11, 0.11]} />
                  <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
                {carrying && id === "R" && (
                  <mesh position={[0, -B.foreArm - 0.14, 0.04]} castShadow>
                    <boxGeometry args={[0.2, 0.18, 0.2]} />
                    <meshToonMaterial color="#e0a53a" gradientMap={toonGradient} />
                    <Ink />
                  </mesh>
                )}
              </group>
            </group>
          ))}
        </group>

        {/* ---- legs */}
        {([
          ["L", -1, thighL, shinL],
          ["R", 1, thighR, shinR],
        ] as const).map(([id, sx, thigh, shin]) => (
          <group key={id} ref={thigh} position={[sx * B.hipX, 0, 0]}>
            <Limb len={B.thigh} w={0.16} d={0.16} color={skin.pants} />
            <group ref={shin} position={[0, -B.thigh, 0]}>
              {/* cargo pants stop mid-shin; the rest is sock */}
              <Limb len={B.shin} w={0.14} d={0.14} color={skin.pants} />
              {/* Chunky sneaker, forward-biased like a real shoe. The IK plants
                  the ANKLE (this group's origin) exactly footH above ground, so
                  the shoe is placed to put its sole at ankle − footH: a 0.13
                  box centred 0.015 below the ankle spans ankle+0.05 (collar)
                  down to ankle−0.08 (ground). */}
              <mesh position={[0, -B.shin - 0.015, 0.05]} castShadow>
                <boxGeometry args={[B.footW + 0.03, 0.13, B.footLen]} />
                <meshToonMaterial color={skin.shoe} gradientMap={toonGradient} />
                <Ink />
              </mesh>
              <mesh position={[0, -B.shin - B.footH + 0.0225, 0.05]}>
                <boxGeometry args={[B.footW + 0.045, 0.045, B.footLen + 0.02]} />
                <meshToonMaterial color="#3a3630" gradientMap={toonGradient} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}
