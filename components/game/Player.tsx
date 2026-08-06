"use client"

import { useRef, useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { NPCS, PHYSICS, INITIAL_CHARACTER } from "@/lib/game/data"
import { terrainRadius } from "@/lib/game/terrain"
import { useGameStore } from "@/lib/game/store"

const MOVE_SPEED = 0.11
const TURN_SPEED = 2.6
const TALK_DISTANCE = 2.4

function useKeys() {
  const keys = useRef<Record<string, boolean>>({})
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true
    }
    const up = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])
  return keys
}

export function Player() {
  const { camera } = useThree()
  const keys = useKeys()
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)

  const position = useRef(new THREE.Vector3(...INITIAL_CHARACTER.position))
  const velocity = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3(1, 0, 0))
  const grounded = useRef(false)
  const camPos = useRef(new THREE.Vector3())
  const stepPhase = useRef(0)

  const setNearbyNpc = useGameStore((s) => s.setNearbyNpc)
  const carrying = useGameStore((s) => s.carrying)

  const npcVecs = useMemo(() => NPCS.map((n) => new THREE.Vector3(...n.position)), [])

  // initialise forward so it's tangent to the sphere at spawn
  useEffect(() => {
    const up = position.current.clone().normalize()
    const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    forward.current.copy(ref.sub(up.clone().multiplyScalar(ref.dot(up)))).normalize()
  }, [])

  // interact key — registered once, reads live state via getState() to avoid stale closure
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e") return
      const { dialogue, toast, nearbyNpcId, closeToast, advanceDialogue, interact } =
        useGameStore.getState()
      if (toast) {
        closeToast()
        return
      }
      if (dialogue) {
        advanceDialogue()
        return
      }
      if (nearbyNpcId) interact(nearbyNpcId)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30)
    const dt60 = delta * 60
    const k = keys.current
    const talking = !!useGameStore.getState().dialogue

    const up = position.current.clone().normalize()

    // keep `forward` tangent to the (curved) surface as the player moves
    forward.current.sub(up.clone().multiplyScalar(forward.current.dot(up)))
    if (forward.current.lengthSq() < 1e-6) forward.current.set(1, 0, 0)
    forward.current.normalize()

    if (!talking) {
      const turnLeft = k["a"] || k["arrowleft"]
      const turnRight = k["d"] || k["arrowright"]
      const turnAmount =
        (turnLeft ? 1 : 0) - (turnRight ? 1 : 0)
      if (turnAmount !== 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(up, turnAmount * TURN_SPEED * delta)
        forward.current.applyQuaternion(q)
      }
    }

    const moveKey = !talking && (k["w"] || k["arrowup"])
    const backKey = !talking && (k["s"] || k["arrowdown"])
    const sprint = k["shift"]
    const moveInput = (moveKey ? 1 : 0) - (backKey ? 1 : 0)
    const speed = MOVE_SPEED * (sprint ? PHYSICS.sprintSpeed : 1)

    // tangential velocity
    const radial = velocity.current.dot(up)
    const tangent = velocity.current.clone().sub(up.clone().multiplyScalar(radial))
    const targetTangent = forward.current.clone().multiplyScalar(moveInput * speed)
    tangent.lerp(targetTangent, moveInput !== 0 ? 0.3 : 0.4)

    // gravity + jump
    let newRadial = radial + PHYSICS.gravity * dt60
    if (!talking && k[" "] && grounded.current) {
      newRadial = PHYSICS.jumpForce
      grounded.current = false
    }

    velocity.current.copy(tangent).addScaledVector(up, newRadial)
    position.current.addScaledVector(velocity.current, dt60)

    // ground collision against the analytic terrain surface
    const dir = position.current.clone().normalize()
    const groundR = terrainRadius(dir)
    const r = position.current.length()
    if (r <= groundR) {
      position.current.copy(dir.multiplyScalar(groundR))
      grounded.current = true
      velocity.current.sub(up.clone().multiplyScalar(velocity.current.dot(up)))
    } else {
      grounded.current = false
    }

    // orient the body: up = surface normal, forward = facing direction
    const upNow = position.current.clone().normalize()
    const m = new THREE.Matrix4()
    const right = new THREE.Vector3().crossVectors(upNow, forward.current).normalize()
    const fwd = new THREE.Vector3().crossVectors(right, upNow).normalize()
    m.makeBasis(right, upNow, fwd)
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m)

    if (groupRef.current) {
      groupRef.current.position.copy(position.current)
      groupRef.current.quaternion.slerp(targetQuat, 0.25)
    }

    // little walking bob
    const isMoving = moveInput !== 0 && grounded.current
    stepPhase.current += isMoving ? delta * (sprint ? 16 : 10) : 0
    if (bodyRef.current) {
      bodyRef.current.position.y = isMoving ? Math.abs(Math.sin(stepPhase.current)) * 0.06 : 0
      bodyRef.current.rotation.z = isMoving ? Math.sin(stepPhase.current) * 0.05 : 0
    }

    // camera: trail behind the player along -forward, offset up
    const behind = forward.current.clone().multiplyScalar(-INITIAL_CHARACTER.relativeCameraPosition[2])
    const camUp = upNow.clone().multiplyScalar(INITIAL_CHARACTER.relativeCameraPosition[1] + 1.4)
    const desired = position.current.clone().add(behind).add(camUp)
    camPos.current.lerp(desired, talking ? 0.12 : 0.09)
    camera.position.copy(camPos.current)
    camera.up.copy(upNow)
    camera.lookAt(position.current.clone().addScaledVector(upNow, 0.9))

    // nearest NPC for the interaction prompt
    let nearestId: string | null = null
    let nearestDist = Infinity
    NPCS.forEach((n, i) => {
      const d = npcVecs[i].distanceTo(position.current)
      if (d < nearestDist) {
        nearestDist = d
        nearestId = n.id
      }
    })
    setNearbyNpc(nearestDist < TALK_DISTANCE ? nearestId : null)
  })

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* legs */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.7, 8]} />
          <meshStandardMaterial color="#2b2723" roughness={0.9} />
        </mesh>
        {/* kurta */}
        <mesh position={[0, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.55, 4, 8]} />
          <meshStandardMaterial color="#3f7f5c" roughness={0.85} />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color="#caa06e" roughness={0.8} />
        </mesh>
        {/* hair */}
        <mesh position={[0, 1.66, 0]}>
          <sphereGeometry args={[0.23, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color="#241f19" roughness={0.9} />
        </mesh>
        {/* satchel bag, always worn */}
        <mesh position={[0.22, 1.0, -0.05]} rotation={[0, 0, 0.2]} castShadow>
          <boxGeometry args={[0.28, 0.32, 0.16]} />
          <meshStandardMaterial color="#8a4a2c" roughness={0.85} />
        </mesh>
        {/* carried parcel indicator */}
        {carrying && (
          <mesh position={[0, 1.95, 0]} castShadow>
            <boxGeometry args={[0.22, 0.2, 0.22]} />
            <meshStandardMaterial color="#e0a53a" roughness={0.7} />
          </mesh>
        )}
      </group>
    </group>
  )
}
