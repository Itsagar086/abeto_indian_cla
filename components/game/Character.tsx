"use client"

import { useRef, type MutableRefObject } from "react"
import * as THREE from "three"
import { Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { toonGradient } from "@/lib/game/toon"
import { BODY, emptyPose, type Pose } from "@/lib/game/character"

const INK = "#2c2620"
const EDGE = 0.022
/** interior detail lines: the same ink, as thin geometry rather than outline */
const LINE = "#3a332b"

function Ink() {
  return <Outlines thickness={EDGE} color={INK} />
}

const B = BODY

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
  skin: "#c08a55",
  hair: "#1f1a16",
  shirt: "#d9d3c4",
  pants: "#5c6470",
  shoe: "#e8e4da",
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
 * pelvis → thigh → shin → ankle → foot, each joint an independently rotatable
 * group, so any pose is reachable without touching this file.
 *
 * Sign convention matches lib/game/character.ts: pose angles are
 * forward-positive, and a three.js rotation.x about +X swings a downward limb
 * toward −Z, hence the negations.
 */
export function Character({ pose, skin = AARAV, carrying = false }: Props) {
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
  const ankleL = useRef<THREE.Group>(null)
  const ankleR = useRef<THREE.Group>(null)

  useFrame(() => {
    const p = pose.current ?? emptyPose()
    if (pelvis.current) {
      // hipY + bob, never bob alone: the JSX places this group at hipY and
      // writing the raw bob here overwrote it, dropping the whole figure
      pelvis.current.position.y = B.hipY + p.bob
      pelvis.current.rotation.z = p.torsoRoll
    }
    if (torso.current) {
      // +lean tips the chest FORWARD. It was negated here, which leaned the
      // runner and every working crouch backwards — caught by the arm IK,
      // which could not reach a crate the body was leaning away from.
      torso.current.rotation.x = p.torsoLean
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
    if (ankleL.current) ankleL.current.rotation.x = -p.ankleL
    if (ankleR.current) ankleR.current.rotation.x = -p.ankleR
  })

  /** a limb segment hanging from its joint */
  const Limb = ({ len, w, d, color }: { len: number; w: number; d: number; color: string }) => (
    <mesh position={[0, -len / 2, 0]} castShadow>
      <boxGeometry args={[w, len, d]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
      <Ink />
    </mesh>
  )

  /**
   * An interior detail line: a thin dark slab standing slightly proud of the
   * surface it sits on. <Outlines> only draws the silhouette, so without these
   * the figure reads as flat blocks; the reference gets its "drawn" quality
   * from exactly this kind of internal edge.
   */
  const DetailLine = ({
    y,
    w,
    d,
    t = 0.012,
    z = 0,
    color = LINE,
  }: {
    y: number
    w: number
    d: number
    t?: number
    z?: number
    color?: string
  }) => (
    <mesh position={[0, y, z]}>
      <boxGeometry args={[w, t, d]} />
      <meshToonMaterial color={color} gradientMap={toonGradient} />
    </mesh>
  )

  return (
    <group>
      <group ref={pelvis} position={[0, B.hipY, 0]}>
        {/* ---- pelvis / hips */}
        <mesh position={[0, B.pelvisH / 2 - 0.02, 0]} castShadow>
          <boxGeometry args={[B.pelvisW, B.pelvisH + 0.08, B.torsoD - 0.01]} />
          <meshToonMaterial color={skin.pants} gradientMap={toonGradient} />
          <Ink />
        </mesh>
        {/* belt line */}
        <DetailLine y={B.pelvisH - 0.005} w={B.pelvisW + 0.008} d={B.torsoD} t={0.022} />

        {/* ---- torso → head + arms */}
        <group ref={torso} position={[0, B.pelvisH, 0]}>
          {/* the tee: cut a touch wider than the chest so it reads oversized */}
          <mesh position={[0, B.torsoH / 2 - 0.02, 0]} castShadow>
            <boxGeometry args={[B.torsoW + 0.04, B.torsoH, B.torsoD + 0.02]} />
            <meshToonMaterial color={skin.shirt} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* collar */}
          <DetailLine y={B.neckY - B.torsoY0 - 0.02} w={B.torsoW - 0.06} d={B.torsoD + 0.03} t={0.018} />
          {/* hem of the tee, low on the hip */}
          <DetailLine y={0.03} w={B.torsoW + 0.05} d={B.torsoD + 0.03} t={0.02} />

          {/* crossbody strap: over one shoulder, across chest AND back, so the
              courier silhouette holds from behind — the usual camera angle */}
          {skin.bag && (
            <>
              <mesh position={[0, 0.24, (B.torsoD + 0.02) / 2]} rotation={[0, 0, 0.6]} castShadow>
                <boxGeometry args={[0.05, 0.46, 0.02]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
              </mesh>
              <mesh position={[0, 0.24, -(B.torsoD + 0.02) / 2]} rotation={[0, 0, -0.6]} castShadow>
                <boxGeometry args={[0.05, 0.46, 0.02]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
              </mesh>
              <mesh position={[-0.17, 0.02, 0.03]} rotation={[0, 0.22, -0.1]} castShadow>
                <boxGeometry args={[0.2, 0.19, 0.12]} />
                <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
                <Ink />
              </mesh>
              {/* flap line, so the bag has a readable form and not just a mass */}
              <mesh position={[-0.17, 0.1, 0.035]} rotation={[0, 0.22, -0.1]}>
                <boxGeometry args={[0.21, 0.05, 0.13]} />
                <meshToonMaterial color="#c33f13" gradientMap={toonGradient} />
              </mesh>
            </>
          )}

          {/* ---- head */}
          <group ref={head} position={[0, B.neckY - B.torsoY0, 0]}>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.085, 0.07, 0.085]} />
              <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
            </mesh>
            {/* skull: slightly taller than wide, like a head and not a ball */}
            <mesh position={[0, B.headY - B.neckY, 0]} scale={[1, 1.12, 1.02]} castShadow>
              <sphereGeometry args={[B.headR, 8, 6]} />
              <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
              <Ink />
            </mesh>
            {/* hair: a shaped cap with a nape block, not a hemisphere */}
            <mesh position={[0, B.headY - B.neckY + 0.012, -0.008]} scale={[1.04, 1.0, 1.06]}>
              <sphereGeometry args={[B.headR + 0.012, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
              <meshToonMaterial color={skin.hair} gradientMap={toonGradient} />
            </mesh>
            {/* FACE. Flat geometric features, sized to read at gameplay range:
                the eyes are 0.032 across, ~10px at the 6u trailing camera. */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.052, B.headY - B.neckY + 0.012, B.headR * 0.93]}>
                <boxGeometry args={[0.032, 0.026, 0.01]} />
                <meshToonMaterial color="#2b2622" gradientMap={toonGradient} />
              </mesh>
            ))}
            {/* brow line — one dark bar reads as expression at any distance */}
            <mesh position={[0, B.headY - B.neckY + 0.052, B.headR * 0.9]}>
              <boxGeometry args={[0.15, 0.014, 0.01]} />
              <meshToonMaterial color={skin.hair} gradientMap={toonGradient} />
            </mesh>
            {skin.cap && (
              <>
                <mesh position={[0, B.headY - B.neckY + 0.035, 0]} scale={[1.05, 0.8, 1.05]} castShadow>
                  <sphereGeometry args={[B.headR + 0.018, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                  <meshToonMaterial color={skin.hero} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
                {/* brim pointing BACKWARD — the cap is worn reversed */}
                <mesh position={[0, B.headY - B.neckY + 0.03, -B.headR - 0.045]} castShadow>
                  <boxGeometry args={[0.17, 0.025, 0.1]} />
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
            <group key={id} ref={arm} position={[sx * B.shoulderX, B.shoulderY - B.torsoY0, 0]}>
              <Limb len={B.upperArm} w={0.095} d={0.095} color={skin.skin} />
              {/* short sleeve over the top third of the upper arm */}
              <mesh position={[0, -0.055, 0]} castShadow>
                <boxGeometry args={[0.115, 0.13, 0.115]} />
                <meshToonMaterial color={skin.shirt} gradientMap={toonGradient} />
                <Ink />
              </mesh>
              {/* sleeve hem */}
              <DetailLine y={-0.118} w={0.12} d={0.12} t={0.014} />
              <group ref={fore} position={[0, -B.upperArm, 0]}>
                <Limb len={B.foreArm} w={0.082} d={0.082} color={skin.skin} />
                <mesh position={[0, -B.foreArm - 0.035, 0]} castShadow>
                  <boxGeometry args={[0.085, 0.09, 0.075]} />
                  <meshToonMaterial color={skin.skin} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
                {carrying && id === "R" && (
                  <mesh position={[0, -B.foreArm - 0.13, 0.05]} castShadow>
                    <boxGeometry args={[0.18, 0.16, 0.18]} />
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
          ["L", -1, thighL, shinL, ankleL],
          ["R", 1, thighR, shinR, ankleR],
        ] as const).map(([id, sx, thigh, shin, ankle]) => (
          <group key={id} ref={thigh} position={[sx * B.hipX, 0, 0]}>
            <Limb len={B.thigh} w={0.115} d={0.115} color={skin.pants} />
            {/* cargo pocket, the detail that says these are cargo pants */}
            <mesh position={[sx * 0.062, -B.thigh * 0.55, 0.01]}>
              <boxGeometry args={[0.012, 0.11, 0.085]} />
              <meshToonMaterial color={LINE} gradientMap={toonGradient} />
            </mesh>
            <group ref={shin} position={[0, -B.thigh, 0]}>
              <Limb len={B.shin} w={0.095} d={0.095} color={skin.pants} />
              {/* trouser cuff, above the shoe */}
              <DetailLine y={-B.shin + 0.055} w={0.105} d={0.105} t={0.016} />
              {/* Ankle: pitches the shoe so its sole lies on the ground rather
                  than following the shin. The IK plants this joint exactly
                  footH above the surface. */}
              <group ref={ankle} position={[0, -B.shin, 0]}>
                {/* chunky sneaker */}
                <mesh position={[0, -0.012, 0.035]} castShadow>
                  <boxGeometry args={[B.footW + 0.03, 0.105, B.footLen]} />
                  <meshToonMaterial color={skin.shoe} gradientMap={toonGradient} />
                  <Ink />
                </mesh>
                {/* sole seam: the dark band that makes a shoe read as a shoe */}
                <mesh position={[0, -B.footH + 0.018, 0.035]}>
                  <boxGeometry args={[B.footW + 0.042, 0.036, B.footLen + 0.015]} />
                  <meshToonMaterial color="#3a3630" gradientMap={toonGradient} />
                </mesh>
              </group>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}
