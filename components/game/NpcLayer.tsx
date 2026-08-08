"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { NPCS, type Npc } from "@/lib/game/data"
import { npcSurfacePosition, surfaceQuaternion, terrainRadius } from "@/lib/game/terrain"
import { useGameStore, useNpcHasQuest } from "@/lib/game/store"

/** shared scratch vectors so the per-frame line-of-sight test allocates nothing */
const _samplePos = new THREE.Vector3()
const _sampleDir = new THREE.Vector3()

function NpcFigure({ npc }: { npc: Npc }) {
  const pos = npcSurfacePosition(npc.position)
  const up = pos.clone().normalize()
  const quat = surfaceQuaternion(up, 0)
  const hasQuest = useNpcHasQuest(npc.id)
  const isNear = useGameStore((s) => s.nearbyNpcId === npc.id)
  const isDog = npc.kind === "dog"
  const isPeacock = npc.kind === "peacock"

  // hide the nameplate when the terrain blocks the line of sight to it
  const labelRef = useRef<HTMLDivElement>(null)
  const frameCount = useRef(0)
  // stagger which frame each npc re-tests on, so the cost spreads across frames
  const phase = useRef(Math.floor(Math.random() * 6))
  // where the label actually floats — mirrors the <Html> offset below
  const labelAnchor = pos.clone().addScaledVector(up, isDog || isPeacock ? 0.6 : 1.95)

  useFrame(({ camera }) => {
    const el = labelRef.current
    if (!el) return
    frameCount.current++
    if (frameCount.current % 6 !== phase.current) return

    // march along the camera -> label ray; if any sample sits under the terrain
    // surface, something solid is in the way. The 0.1-0.9 range and the 0.15
    // epsilon keep the camera's own ground and the npc's own feet from
    // self-occluding, and damp flicker at grazing angles.
    let blocked = false
    for (let i = 1; i <= 9; i++) {
      _samplePos.lerpVectors(camera.position, labelAnchor, i * 0.1)
      const sampleRadius = _samplePos.length()
      _sampleDir.copy(_samplePos).normalize()
      if (sampleRadius < terrainRadius(_sampleDir) - 0.15) {
        blocked = true
        break
      }
    }
    el.style.display = blocked ? "none" : ""
  })

  return (
    <group position={pos.toArray()} quaternion={[quat.x, quat.y, quat.z, quat.w]}>
      {isDog ? (
        <group>
          <mesh position={[0, 0.22, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
            <meshStandardMaterial color={npc.outfit} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.3, 0.22]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color={npc.hair} roughness={0.9} />
          </mesh>
        </group>
      ) : isPeacock ? (
        <group>
          <mesh position={[0, 0.35, 0]} castShadow>
            <capsuleGeometry args={[0.13, 0.35, 4, 8]} />
            <meshStandardMaterial color={npc.outfit} roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.65, -0.25]} rotation={[0.6, 0, 0]}>
            <coneGeometry args={[0.35, 0.6, 10]} />
            <meshStandardMaterial color={npc.hair} roughness={0.6} />
          </mesh>
        </group>
      ) : (
        <group>
          {/* legs */}
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.7, 8]} />
            <meshStandardMaterial color="#3a3630" roughness={0.9} />
          </mesh>
          {/* body / outfit */}
          <mesh position={[0, 0.95, 0]} castShadow>
            <capsuleGeometry args={[0.24, 0.5, 4, 8]} />
            <meshStandardMaterial color={npc.outfit} roughness={0.85} />
          </mesh>
          {/* head */}
          <mesh position={[0, 1.5, 0]} castShadow>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color={npc.color} roughness={0.8} />
          </mesh>
          {/* hair */}
          <mesh position={[0, 1.6, 0]}>
            <sphereGeometry args={[0.23, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={npc.hair} roughness={0.9} />
          </mesh>
        </group>
      )}

      <Html position={[0, isDog || isPeacock ? 0.6 : 1.95, 0]} center distanceFactor={9} occlude={false}>
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
  const npcs = useMemo(() => NPCS, [])
  return (
    <group>
      {npcs.map((n) => (
        <NpcFigure key={n.id} npc={n} />
      ))}
    </group>
  )
}
