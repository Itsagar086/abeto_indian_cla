"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { buildPlanetGeometry, radiusAt, rng } from "@/lib/game/terrain"
import { buildProps } from "@/lib/game/props"
import { WATER_LEVEL } from "@/lib/game/data"
import { Player } from "./Player"
import { NpcLayer } from "./NpcLayer"
import { PropsLayer } from "./PropsLayer"

function Planet() {
  // buildProps first: it registers the civic-plot grading with the terrain
  // mid-build, and the planet mesh must sample the GRADED ground — built
  // before registration it would show the old relief under every pad
  const geometry = useMemo(() => {
    buildProps()
    return buildPlanetGeometry(64)
  }, [])
  return (
    /**
     * The planet RECEIVES shadows but does not cast them.
     *
     * A sphere self-shadowing is the entire remaining source of acne: the sun
     * strikes much of the surface at a grazing angle (80.8 deg at the palace),
     * and at 0.0449u per shadow texel the slope-scaled depth error there is
     * 0.2423u — far past what any bias can absorb without detaching the props'
     * own shadows. Terrain-on-terrain shadowing contributes almost nothing on
     * a low-poly toon planet lit from overhead, so dropping it removes the
     * whole class of shimmer while every building, wall and tree still casts.
     */
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  )
}

/** the authored sun bearing, preserved exactly — only its shadow frustum moves */
const SUN_DIR = new THREE.Vector3(40, 60, 20).normalize()
const _sunFocus = new THREE.Vector3()
const _sunX = new THREE.Vector3()
const _sunY = new THREE.Vector3()
const _sunZ = new THREE.Vector3()
const _sunUpRef = new THREE.Vector3(0, 1, 0)
/** frustum half-extent and map size, shared with the texel snap above */
const SHADOW_HALF = 46
const SHADOW_MAP = 2048

/**
 * The sun, with a shadow frustum that follows the player.
 *
 * Measured on the committed build, three faults compounding:
 *
 *  1. The ortho frustum was a fixed +-40u box on the light->ORIGIN axis, but
 *     the planet's lit silhouette is radius ~53. 26.5% of the lit surface fell
 *     OUTSIDE the shadow map and sampled its clamped edge texel, which holds
 *     near-surface depth — so those fragments compared as occluded and
 *     rendered black. That is the hard-edged blackness.
 *  2. shadow-bias and shadow-normalBias were both 0. At the palace the light
 *     strikes the terrace 80.8 deg off its normal, and at 80u/2048 = 0.0391u
 *     per texel the slope-scaled depth error is 0.2423u. A big flat lawn at
 *     grazing incidence with no bias is textbook acne, and which bands you
 *     see changes as the camera turns — that is the flicker.
 *  3. near/far defaulted to 0.5/500 while the geometry spans 21.4..128.2 from
 *     the light: 4.7x more depth range than needed, throwing away precision.
 *
 * The light's DIRECTION is untouched — position and target move together
 * along SUN_DIR — so every zone is lit exactly as before. Only the shadow
 * camera's coverage and precision change.
 */
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useRef<THREE.Object3D>(null)
  useFrame(({ camera }) => {
    if (!light.current || !target.current) return
    // the ground under the camera, so the frustum covers what is on screen
    _sunFocus.copy(camera.position).normalize().multiplyScalar(radiusAt(_sunFocus))
    /**
     * SNAP the focus to whole shadow-map texels.
     *
     * A directional shadow frustum that slides continuously re-rasterises the
     * depth map at a slightly different sub-texel offset every frame, and the
     * shadow edges crawl — which is the shimmering, blurry "shaking" that
     * appears next to walls, pillars and kerbs whenever the camera moves. The
     * standard cure is to quantise the frustum's origin to its own texel grid
     * so the map lands on the same texels frame to frame. Built here from the
     * frustum basis rather than the world axes, because on a sphere the
     * light's up-vector rotates as the player travels.
     */
    _sunZ.copy(SUN_DIR)
    _sunX.crossVectors(_sunUpRef, _sunZ)
    if (_sunX.lengthSq() < 1e-8) _sunX.set(1, 0, 0)
    _sunX.normalize()
    _sunY.crossVectors(_sunZ, _sunX).normalize()
    const texel = (2 * SHADOW_HALF) / SHADOW_MAP
    const qx = Math.round(_sunFocus.dot(_sunX) / texel) * texel
    const qy = Math.round(_sunFocus.dot(_sunY) / texel) * texel
    const qz = _sunFocus.dot(_sunZ)
    _sunFocus.copy(_sunX).multiplyScalar(qx).addScaledVector(_sunY, qy).addScaledVector(_sunZ, qz)
    light.current.position.copy(_sunFocus).addScaledVector(SUN_DIR, 70)
    target.current.position.copy(_sunFocus)
    target.current.updateMatrixWorld()
    // bound here, not as a prop: target.current is null on the first render
    if (light.current.target !== target.current) light.current.target = target.current
  })
  return (
    <>
      <object3D ref={target} />
      <directionalLight
        ref={light}
        intensity={1.1}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        // hugging the ground under the camera instead of 0.5/500
        shadow-camera-near={1}
        shadow-camera-far={150}
        // sized against the measured 0.2423u slope error at grazing incidence
        shadow-bias={-0.0004}
        shadow-normalBias={0.09}
      />
    </>
  )
}

function Water() {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(WATER_LEVEL, 5), [])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#4fa8b8"
        transparent
        opacity={0.75}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  )
}

/** flat unlit puffs drifting slowly around the planet */
function Clouds() {
  const groupRef = useRef<THREE.Group>(null)

  const puffs = useMemo(() => {
    const r = rng(9137)
    return Array.from({ length: 12 }, () => {
      // even-ish spread over the sphere, then a deterministic wobble
      const y = r() * 2 - 1
      const a = r() * Math.PI * 2
      const s = Math.sqrt(Math.max(0, 1 - y * y))
      const radius = 46 + r() * 6
      const lobes = Array.from({ length: 2 + Math.floor(r() * 2) }, (_, i) => ({
        offset: [(i - 0.5) * (2.2 + r() * 1.6), (r() - 0.5) * 0.8, (r() - 0.5) * 1.6] as const,
        size: 1.7 + r() * 1.3,
      }))
      return {
        position: [Math.cos(a) * s * radius, y * radius, Math.sin(a) * s * radius] as const,
        spin: r() * Math.PI * 2,
        lobes,
      }
    })
  }, [])

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.018 * delta
  })

  return (
    <group ref={groupRef}>
      {puffs.map((c, i) => (
        <group key={i} position={c.position} rotation={[0, c.spin, 0]} scale={[1, 0.3, 1]}>
          {c.lobes.map((l, j) => (
            <mesh key={j} position={l.offset}>
              <sphereGeometry args={[l.size, 10, 8]} />
              <meshBasicMaterial color="#f4faf7" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export function Scene() {
  return (
    <>
      <color attach="background" args={["#7ecfc4"]} />
      <fog attach="fog" args={["#7ecfc4", 60, 140]} />

      {/* hemisphere + ambient together keep the night side readable, never black */}
      <hemisphereLight args={["#bfeee6", "#8a7a5a", 0.75]} />
      <ambientLight intensity={0.35} color="#cfe8e2" />
      <Sun />

      <Planet />
      <Water />
      <Clouds />
      <PropsLayer />
      <NpcLayer />
      <Player />
    </>
  )
}
