"use client"

import { useRef, useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Outlines } from "@react-three/drei"
import * as THREE from "three"
import { NPCS, PHYSICS, INITIAL_CHARACTER, ZONES } from "@/lib/game/data"
import { terrainRadius } from "@/lib/game/terrain"
import {
  propCollision,
  bridgeSurface,
  corridorSurface,
  groundOrDeck,
  type PropHit,
} from "@/lib/game/props"
import { useGameStore } from "@/lib/game/store"
import { playerState } from "@/lib/game/playerState"
import { toonGradient } from "@/lib/game/toon"

/** x1.4 for the 1.6x world — a road takes ~1.15x the old time to walk */
const MOVE_SPEED = 0.154
const TURN_SPEED = 2.6
/** world units, and neither the character nor the NPCs grew — unchanged */
const TALK_DISTANCE = 2.4
/**
 * Angular radius to enter a zone, and the wider one to leave it (hysteresis).
 * Scaled by 1/1.6 because the same world-unit footprint now subtends a smaller
 * angle on the larger planet.
 */
const ZONE_ENTER = 0.21
const ZONE_EXIT = 0.28
const ZONE_CHECK_FRAMES = 30
/** how far above the ground the camera is held when it would clip into terrain */
const CAMERA_GROUND_CLEARANCE = 0.96
/** per-frame easing of that lift, so the clamp glides instead of popping */
const CAMERA_CLAMP_LERP = 0.35

/** line-of-sight probe between the player's eye and the camera */
const CAM_LOS_SAMPLES = 8
const CAM_LOS_CLEARANCE = 0.56
const CAM_MIN_DIST = 2.08
/** pull in fast when the view is blocked, ease back out slowly */
const CAM_LOS_IN_LERP = 0.4
const CAM_LOS_OUT_LERP = 0.08

/**
 * The player as a standing capsule: the kurta is a 0.25 capsule and the satchel
 * juts a little further, so 0.34 wraps the silhouette. Height covers feet to the
 * top of the head.
 */
const PLAYER_RADIUS = 0.34
const PLAYER_HEIGHT = 1.8
/**
 * Resolve passes per frame. One is enough in the open; a second and third let
 * the player settle cleanly into an inside corner instead of jittering between
 * two walls that each push them back into the other.
 */
const COLLIDE_PASSES = 3
/**
 * Ceiling on how far collision may shift the player in one frame, across all
 * passes. A walk step is 0.154u, so a correction under this is indistinguishable
 * from ordinary movement; without it, a first contact resolves its whole depth
 * at once and reads as a shove. Anything deeper settles over the next frames.
 */
const MAX_PUSH = 0.15
/**
 * How far the player may be below a bridge deck and still be caught by it.
 * The ramps meet the bank terrain exactly, so this only has to absorb a frame
 * of downhill travel — large enough and you would get snapped up from the water.
 */
const DECK_SNAP = 0.4
/**
 * The same guard for the road, but sized to the road. Embankment fill reaches
 * 0.84u, so DECK_SNAP's 0.4 would leave the player stranded under the deepest
 * fills — exactly the stretches where the gap is worst.
 */
const ROAD_SNAP = 1.1

/** scratch for the collision work — the resolve loop allocates nothing */
const _hit: PropHit = { normal: new THREE.Vector3(), depth: 0 }

/** scratch for the camera work — keeps the frame allocation-free */
const _camDir = new THREE.Vector3()
const _eye = new THREE.Vector3()
const _losDir = new THREE.Vector3()
const _losSample = new THREE.Vector3()
const _losProbe = new THREE.Vector3()
const _camFinal = new THREE.Vector3()

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
  /** smoothed eye-to-camera distance; 0 means "not yet initialised" */
  const camDist = useRef(0)
  const stepPhase = useRef(0)

  const setNearbyNpc = useGameStore((s) => s.setNearbyNpc)
  const carrying = useGameStore((s) => s.carrying)

  // hit-test where NpcLayer actually draws them: both lift onto the road, and
  // a mismatch between the two is exactly what BUG-101 was
  const npcVecs = useMemo(
    () =>
      NPCS.map((n) => {
        const d = new THREE.Vector3(...n.position).normalize()
        return d.clone().multiplyScalar(groundOrDeck(d))
      }),
    [],
  )

  // zone entry detection: unit direction of each zone centre, plus the zone we
  // are currently inside (kept in a ref so this never re-renders the player)
  const zoneDirs = useMemo(
    () => ZONES.map((z) => new THREE.Vector3(...z.center).normalize()),
    [],
  )
  const zoneTick = useRef(0)
  const zoneId = useRef<string | null>(null)

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

    // solid props: push out of whatever this step walked into, and drop the
    // velocity heading into it, so the player slides along a wall rather than
    // stopping dead against it
    let pushLeft = MAX_PUSH
    for (let pass = 0; pass < COLLIDE_PASSES && pushLeft > 0; pass++) {
      if (!propCollision(position.current, PLAYER_RADIUS, PLAYER_HEIGHT, _hit)) break
      const push = Math.min(_hit.depth, pushLeft)
      position.current.addScaledVector(_hit.normal, push)
      pushLeft -= push
      // drop the velocity heading into the face even when the push was capped,
      // so the player stops pressing deeper while the overlap works itself out
      const into = velocity.current.dot(_hit.normal)
      if (into < 0) velocity.current.addScaledVector(_hit.normal, -into)
    }

    // ground collision: the terrain, or a bridge deck where one is overhead
    const dir = position.current.clone().normalize()
    const r = position.current.length()
    let groundR = terrainRadius(dir)
    // the road first: its deck is smoothed along its length and filled over
    // hollows, so on a corridor the real ground can sit most of a unit below
    // the asphalt. Without this the player walks that raw ground and sinks
    // through the road they can see.
    const roadR = corridorSurface(dir)
    if (roadR !== null && roadR > groundR && r >= roadR - ROAD_SNAP) groundR = roadR
    const deckR = bridgeSurface(dir)
    // stand on a deck only when already at or above it — walking underneath a
    // bridge must not snatch the player up onto it. Applied after the road so a
    // bridge wins wherever both could claim the same ground.
    if (deckR !== null && deckR > groundR && r >= deckR - DECK_SNAP) groundR = deckR
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

    // hold the ideal camera above the ground it would otherwise slice into,
    // easing the lift in so cresting a hill glides rather than snaps
    _camDir.copy(camPos.current).normalize()
    const camGround = groundOrDeck(_camDir) + CAMERA_GROUND_CLEARANCE
    const camR = camPos.current.length()
    if (camR < camGround) {
      const k = Math.min(1, CAMERA_CLAMP_LERP * dt60)
      camPos.current.setLength(camR + (camGround - camR) * k)
    }

    // march the sight line from the player's eye out to that ideal position;
    // if a ridge crosses it, pull the camera in short of the blockage
    _eye.copy(position.current).addScaledVector(upNow, 0.9)
    _losDir.copy(camPos.current).sub(_eye)
    const fullDist = _losDir.length()
    if (fullDist > 1e-4) {
      _losDir.divideScalar(fullDist)
      let blockedT = 0
      for (let i = 1; i <= CAM_LOS_SAMPLES; i++) {
        const t = i / CAM_LOS_SAMPLES
        _losSample.copy(_eye).addScaledVector(_losDir, fullDist * t)
        _losProbe.copy(_losSample).normalize()
        // groundOrDeck, not raw terrain: an embankment road is solid to the eye,
        // and with the raw probe the camera would settle in the hollow BESIDE
        // a filled road and stare through its side — the P43 black screens
        if (_losSample.length() < groundOrDeck(_losProbe) + CAM_LOS_CLEARANCE) {
          blockedT = t
          break
        }
      }
      const targetDist =
        blockedT > 0 ? Math.max(blockedT * fullDist - 0.4, CAM_MIN_DIST) : fullDist

      if (camDist.current <= 0) {
        camDist.current = targetDist
      } else {
        const rate = targetDist < camDist.current ? CAM_LOS_IN_LERP : CAM_LOS_OUT_LERP
        camDist.current += (targetDist - camDist.current) * Math.min(1, rate * dt60)
      }
      _camFinal.copy(_eye).addScaledVector(_losDir, camDist.current)
    } else {
      _camFinal.copy(camPos.current)
    }

    // final safety: the pulled-in camera must still not sit inside a hill
    _camDir.copy(_camFinal).normalize()
    const finalGround = groundOrDeck(_camDir) + CAMERA_GROUND_CLEARANCE
    if (_camFinal.length() < finalGround) _camFinal.setLength(finalGround)

    camera.position.copy(_camFinal)
    camera.up.copy(upNow)
    camera.lookAt(_eye)

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

    // publish the live transform for DOM overlays outside the R3F tree
    playerState.position.copy(position.current)
    playerState.forward.copy(forward.current)

    // zone entry, checked occasionally — angles change far slower than frames
    zoneTick.current++
    if (zoneTick.current % ZONE_CHECK_FRAMES === 0) {
      let nearestId: string | null = null
      let nearestAngle = Infinity
      let currentAngle = Infinity
      for (let i = 0; i < zoneDirs.length; i++) {
        const angle = Math.acos(Math.max(-1, Math.min(1, upNow.dot(zoneDirs[i]))))
        if (angle < nearestAngle) {
          nearestAngle = angle
          nearestId = ZONES[i].id
        }
        if (ZONES[i].id === zoneId.current) currentAngle = angle
      }
      // hold the current zone until we are well outside it, so walking the
      // boundary cannot flicker the banner
      const next =
        zoneId.current && currentAngle <= ZONE_EXIT
          ? zoneId.current
          : nearestAngle < ZONE_ENTER
            ? nearestId
            : null
      if (next !== zoneId.current) {
        zoneId.current = next
        useGameStore.getState().setCurrentZone(next)
      }
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={bodyRef}>
        {/* legs */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.7, 8]} />
          <meshToonMaterial color="#2b2723" gradientMap={toonGradient} />
          <Outlines thickness={0.03} color="#2c2620" />
        </mesh>
        {/* kurta */}
        <mesh position={[0, 0.98, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.55, 4, 8]} />
          <meshToonMaterial color="#3f7f5c" gradientMap={toonGradient} />
          <Outlines thickness={0.03} color="#2c2620" />
        </mesh>
        {/* head */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshToonMaterial color="#caa06e" gradientMap={toonGradient} />
          <Outlines thickness={0.03} color="#2c2620" />
        </mesh>
        {/* hair */}
        <mesh position={[0, 1.66, 0]}>
          <sphereGeometry args={[0.23, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshToonMaterial color="#241f19" gradientMap={toonGradient} />
          <Outlines thickness={0.03} color="#2c2620" />
        </mesh>
        {/* satchel bag, always worn */}
        <mesh position={[0.22, 1.0, -0.05]} rotation={[0, 0, 0.2]} castShadow>
          <boxGeometry args={[0.28, 0.32, 0.16]} />
          <meshToonMaterial color="#8a4a2c" gradientMap={toonGradient} />
          <Outlines thickness={0.03} color="#2c2620" />
        </mesh>
        {/* carried parcel indicator */}
        {carrying && (
          <mesh position={[0, 1.95, 0]} castShadow>
            <boxGeometry args={[0.22, 0.2, 0.22]} />
            <meshToonMaterial color="#e0a53a" gradientMap={toonGradient} />
            <Outlines thickness={0.03} color="#2c2620" />
          </mesh>
        )}
      </group>
    </group>
  )
}
