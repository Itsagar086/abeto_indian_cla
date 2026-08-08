"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { buildPlanetGeometry, rng } from "@/lib/game/terrain"
import { WATER_LEVEL } from "@/lib/game/data"
import { Player } from "./Player"
import { NpcLayer } from "./NpcLayer"
import { PropsLayer } from "./PropsLayer"

function Planet() {
  const geometry = useMemo(() => buildPlanetGeometry(64), [])
  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
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
    if (groupRef.current) groupRef.current.rotation.y += 0.002 * delta
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
      <directionalLight
        position={[40, 60, 20]}
        intensity={1.1}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <Planet />
      <Water />
      <Clouds />
      <PropsLayer />
      <NpcLayer />
      <Player />
    </>
  )
}
