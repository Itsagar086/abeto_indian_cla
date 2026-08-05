"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { buildProps, type PlacedProp } from "@/lib/game/props"

function PropInstance({ p }: { p: PlacedProp }) {
  const pos = p.position.toArray() as [number, number, number]
  const quat = new THREE.Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w)

  switch (p.kind) {
    case "stall":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 1.1, 0.8]} />
            <meshStandardMaterial color={p.colorB} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.25, 0]} rotation={[0.15, 0, 0]} castShadow>
            <boxGeometry args={[1.4, 0.12, 1.1]} />
            <meshStandardMaterial color={p.colorA} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.15, 0.5]}>
            <boxGeometry args={[1.2, 0.3, 0.1]} />
            <meshStandardMaterial color="#8a6a4a" roughness={0.9} />
          </mesh>
        </group>
      )
    case "market-umbrella":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.8, 6]} />
            <meshStandardMaterial color="#5a4a3a" />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <coneGeometry args={[0.75, 0.4, 8]} />
            <meshStandardMaterial color={p.colorA} roughness={0.75} />
          </mesh>
        </group>
      )
    case "haveli-arch":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[-0.9, 1, 0]} castShadow>
            <boxGeometry args={[0.35, 2, 0.35]} />
            <meshStandardMaterial color={p.colorA} roughness={0.85} />
          </mesh>
          <mesh position={[0.9, 1, 0]} castShadow>
            <boxGeometry args={[0.35, 2, 0.35]} />
            <meshStandardMaterial color={p.colorA} roughness={0.85} />
          </mesh>
          <mesh position={[0, 2.05, 0]} castShadow>
            <boxGeometry args={[2.2, 0.3, 0.4]} />
            <meshStandardMaterial color={p.colorA} roughness={0.85} />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <coneGeometry args={[0.35, 0.5, 4]} />
            <meshStandardMaterial color={p.colorB} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.05, -1.4]} receiveShadow>
            <boxGeometry args={[3.2, 0.1, 3.2]} />
            <meshStandardMaterial color={p.colorB} roughness={0.9} />
          </mesh>
        </group>
      )
    case "mill-block":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 2.2, 1.8]} />
            <meshStandardMaterial color={p.colorA} roughness={0.9} />
          </mesh>
          <mesh position={[0.9, 2.6, -0.5]} castShadow>
            <cylinderGeometry args={[0.18, 0.24, 1.4, 8]} />
            <meshStandardMaterial color={p.colorB} roughness={0.9} />
          </mesh>
          {[0, 1].map((i) => (
            <mesh key={i} position={[-0.6 + i * 1.2, 1.1, 0.91]}>
              <boxGeometry args={[0.4, 0.5, 0.02]} />
              <meshStandardMaterial color="#2a3a44" roughness={0.4} />
            </mesh>
          ))}
        </group>
      )
    case "workshop-shed":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 1.5, 1.6]} />
            <meshStandardMaterial color={p.colorA} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.6, 0.6, 4]} />
            <meshStandardMaterial color={p.colorB} roughness={0.8} />
          </mesh>
          <mesh position={[0.6, 0.35, 0.85]}>
            <cylinderGeometry args={[0.28, 0.28, 0.08, 16]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
        </group>
      )
    case "temple-dome":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.3, 1.5, 1.8, 8]} />
            <meshStandardMaterial color={p.colorA} roughness={0.6} />
          </mesh>
          <mesh position={[0, 2.2, 0]} castShadow>
            <coneGeometry args={[1.3, 1.4, 8]} />
            <meshStandardMaterial color={p.colorB} roughness={0.5} />
          </mesh>
          <mesh position={[0, 3.05, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshStandardMaterial color="#f2d060" metalness={0.6} roughness={0.3} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[Math.cos((i / 4) * Math.PI * 2) * 1.3, 0.9, Math.sin((i / 4) * Math.PI * 2) * 1.3]}
            >
              <boxGeometry args={[0.15, 1.6, 0.15]} />
              <meshStandardMaterial color="#f2e6c8" roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case "ghat-steps":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 0.15 * i, -0.3 * i]} receiveShadow>
              <boxGeometry args={[2.4, 0.15, 0.5]} />
              <meshStandardMaterial color={i % 2 ? p.colorA : p.colorB} roughness={0.9} />
            </mesh>
          ))}
        </group>
      )
    case "mango-tree":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.14, 1.2, 6]} />
            <meshStandardMaterial color="#5a4331" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <sphereGeometry args={[0.75, 8, 8]} />
            <meshStandardMaterial color={p.colorA} roughness={0.85} />
          </mesh>
        </group>
      )
    case "peepal-tree":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.26, 1.8, 6]} />
            <meshStandardMaterial color="#6b5540" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.3, 0]} castShadow>
            <sphereGeometry args={[1.15, 8, 8]} />
            <meshStandardMaterial color="#4f7a34" roughness={0.85} />
          </mesh>
          <mesh position={[0.1, 0.05, 0.1]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#c9b48f" roughness={0.9} />
          </mesh>
        </group>
      )
    case "lamp-post":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 1.8, 6]} />
            <meshStandardMaterial color="#2c2c2c" />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.13, 10, 10]} />
            <meshStandardMaterial color="#ffdf90" emissive="#ffb84d" emissiveIntensity={0.8} />
          </mesh>
        </group>
      )
    case "flag":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 2, 6]} />
            <meshStandardMaterial color="#8a6a4a" />
          </mesh>
          <mesh position={[0.3, 1.75, 0]}>
            <coneGeometry args={[0.3, 0.5, 3]} />
            <meshStandardMaterial color="#e0763a" roughness={0.7} />
          </mesh>
        </group>
      )
    default:
      return null
  }
}

export function PropsLayer() {
  const props = useMemo(() => buildProps(), [])
  return (
    <group>
      {props.map((p, i) => (
        <PropInstance key={i} p={p} />
      ))}
    </group>
  )
}
