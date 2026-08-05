"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { buildPlanetGeometry } from "@/lib/game/terrain"
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
        color="#3f7fa8"
        transparent
        opacity={0.82}
        roughness={0.2}
        metalness={0.1}
      />
    </mesh>
  )
}

export function Scene() {
  return (
    <>
      <color attach="background" args={["#bfe0ee"]} />
      <fog attach="fog" args={["#cfe6ee", 60, 140]} />

      <hemisphereLight args={["#fff3d6", "#5a6a4a", 0.65]} />
      <directionalLight
        position={[40, 60, 20]}
        intensity={1.6}
        color="#fff2d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <Planet />
      <Water />
      <PropsLayer />
      <NpcLayer />
      <Player />
    </>
  )
}
