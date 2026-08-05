"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { buildPlanetGeometry } from "@/lib/game/world/terrain"
import { WATER_LEVEL, TERRAIN_DETAIL } from "@/lib/game/config/world"
import { SKY_COLOR, FOG, WATER_MATERIAL } from "@/lib/game/rendering/scene"
import { HEMISPHERE_LIGHT, DIRECTIONAL_LIGHT } from "@/lib/game/rendering/lighting"
import { Player } from "./Player"
import { NpcLayer } from "./NpcLayer"
import { PropsLayer } from "./PropsLayer"

function Planet() {
  const geometry = useMemo(() => buildPlanetGeometry(TERRAIN_DETAIL), [])
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
        color={WATER_MATERIAL.color}
        transparent
        opacity={WATER_MATERIAL.opacity}
        roughness={WATER_MATERIAL.roughness}
        metalness={WATER_MATERIAL.metalness}
      />
    </mesh>
  )
}

export function Scene() {
  return (
    <>
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[FOG.color, FOG.near, FOG.far]} />

      <hemisphereLight
        args={[HEMISPHERE_LIGHT.skyColor, HEMISPHERE_LIGHT.groundColor, HEMISPHERE_LIGHT.intensity]}
      />
      <directionalLight
        position={DIRECTIONAL_LIGHT.position}
        intensity={DIRECTIONAL_LIGHT.intensity}
        color={DIRECTIONAL_LIGHT.color}
        castShadow
        shadow-mapSize={DIRECTIONAL_LIGHT.shadow.mapSize}
        shadow-camera-left={DIRECTIONAL_LIGHT.shadow.camera.left}
        shadow-camera-right={DIRECTIONAL_LIGHT.shadow.camera.right}
        shadow-camera-top={DIRECTIONAL_LIGHT.shadow.camera.top}
        shadow-camera-bottom={DIRECTIONAL_LIGHT.shadow.camera.bottom}
      />

      <Planet />
      <Water />
      <PropsLayer />
      <NpcLayer />
      <Player />
    </>
  )
}
