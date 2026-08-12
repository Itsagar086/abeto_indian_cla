"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {
  buildProps,
  buildCorridors,
  deckPoint,
  metroTrainState,
  type CorridorMesh,
  type PlacedProp,
} from "@/lib/game/props"
import { rng } from "@/lib/game/terrain"
import { toonGradient } from "@/lib/game/toon"
import { KANNADA_FONT_STACK, makeSignTexture } from "@/lib/game/signage"

const INK = "#2c2620"
const EDGE = 0.035

/** seconds per lamp; every signal reads the same clock, so they stay in step */
const SIGNAL_PERIOD = 3.5
const LAMP_ON = 1
const LAMP_OFF = 0.15

/** red -> green -> amber, cycling. Discs sit on the head's +Z face. */
function TrafficSignal({ p }: { p: PlacedProp }) {
  const lamps = useRef<(THREE.MeshToonMaterial | null)[]>([null, null, null])

  useFrame(({ clock }) => {
    const active = Math.floor(clock.getElapsedTime() / SIGNAL_PERIOD) % 3
    for (let i = 0; i < 3; i++) {
      const m = lamps.current[i]
      if (m) m.emissiveIntensity = i === active ? LAMP_ON : LAMP_OFF
    }
  })

  // index 0 red (top), 1 amber (middle), 2 green (bottom); cycle order is
  // red -> green -> amber, so the active index maps 0,2,1
  const discs: [string, number][] = [
    ["#d64545", 0.16],
    ["#e8b84a", 0],
    ["#57b45a", -0.16],
  ]
  const cycleSlot = [0, 2, 1]

  return (
    <group
      position={p.position.toArray() as [number, number, number]}
      quaternion={[p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w]}
      scale={p.scale}
    >
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 1.9, 6]} />
        <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[0.22, 0.55, 0.14]} />
        <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
        <Outlines thickness={EDGE} color={INK} />
      </mesh>
      {discs.map(([color, y], i) => (
        <mesh key={i} position={[0, 2 + y, 0.072]}>
          <circleGeometry args={[0.07, 12]} />
          <meshToonMaterial
            ref={(m) => {
              lamps.current[cycleSlot[i]] = m
            }}
            color={color}
            emissive={color}
            emissiveIntensity={LAMP_OFF}
            gradientMap={toonGradient}
          />
        </mesh>
      ))}
    </group>
  )
}

/** shared outline, skipped on anything too thin to survive an inverted hull */
function Ink() {
  return <Outlines thickness={EDGE} color={INK} />
}

function PropInstance({ p }: { p: PlacedProp }) {
  const pos = p.position.toArray() as [number, number, number]
  const quat = new THREE.Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w)

  switch (p.kind) {
    case "stall":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 1.1, 0.8]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 1.25, 0]} rotation={[0.15, 0, 0]} castShadow>
            <boxGeometry args={[1.4, 0.12, 1.1]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* counter board is 0.1 thick — no outline */}
          <mesh position={[0, 0.15, 0.5]}>
            <boxGeometry args={[1.2, 0.3, 0.1]} />
            <meshToonMaterial color="#8a6a4a" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "market-umbrella":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* pole is 0.06 across — no outline */}
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.8, 6]} />
            <meshToonMaterial color="#5a4a3a" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <coneGeometry args={[0.75, 0.4, 8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "haveli-arch":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* supports run 0.8 below grade so they stay buried on a slope */}
          <mesh position={[-0.9, 0.6, 0]} castShadow>
            <boxGeometry args={[0.35, 2.8, 0.35]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0.9, 0.6, 0]} castShadow>
            <boxGeometry args={[0.35, 2.8, 0.35]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 2.05, 0]} castShadow>
            <boxGeometry args={[2.2, 0.3, 0.4]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <coneGeometry args={[0.35, 0.5, 4]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "palace":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* main block. Every wall runs 0.8 below grade so the downhill edge
              cannot float and the uphill edge simply buries itself. */}
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 1.9, 1.2]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>

          {/* centre tower + pyramid roof */}
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 2.3, 0.9]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 1.78, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.62, 0.55, 4]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>

          {/* corner towers, each capped with a cone */}
          {[-1.25, 1.25].map((x, i) => (
            <group key={`t${i}`}>
              <mesh position={[x, 0.45, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.32, 0.32, 2.5, 10]} />
                <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
                <Ink />
              </mesh>
              <mesh position={[x, 2, 0]} castShadow>
                <coneGeometry args={[0.42, 0.6, 10]} />
                <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
                <Ink />
              </mesh>
            </group>
          ))}

          {/* battlements along the front top edge. -z is the gate side: the
              prop spin (ang + PI) puts the arch on this face, not the other */}
          {[-1, -0.5, 0, 0.5, 1].map((x, i) => (
            <mesh key={`b${i}`} position={[x, 1.18, -0.5]} castShadow>
              <boxGeometry args={[0.18, 0.15, 0.18]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}

          {/* entrance, facing the gate. 0.1 thick inset — no outline */}
          <mesh position={[0, 0.35, -0.61]} castShadow>
            <boxGeometry args={[0.5, 0.7, 0.1]} />
            <meshToonMaterial color="#3a2f28" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "mill-block":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.2, 2.2, 1.8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0.9, 2.6, -0.5]} castShadow>
            <cylinderGeometry args={[0.18, 0.24, 1.4, 8]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* window panes are 0.02 thick — no outline */}
          {[0, 1].map((i) => (
            <mesh key={i} position={[-0.6 + i * 1.2, 1.1, 0.91]}>
              <boxGeometry args={[0.4, 0.5, 0.02]} />
              <meshToonMaterial color="#2a3a44" gradientMap={toonGradient} />
            </mesh>
          ))}
        </group>
      )
    case "workshop-shed":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 1.5, 1.6]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 1.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.6, 0.6, 4]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* tyre is 0.08 deep — no outline */}
          <mesh position={[0.6, 0.35, 0.85]}>
            <cylinderGeometry args={[0.28, 0.28, 0.08, 16]} />
            <meshToonMaterial color="#2a2a2a" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "temple-dome":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.3, 1.5, 1.8, 8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 2.2, 0]} castShadow>
            <coneGeometry args={[1.3, 1.4, 8]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 3.05, 0]}>
            <sphereGeometry args={[0.18, 12, 12]} />
            <meshToonMaterial color="#f2d060" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[Math.cos((i / 4) * Math.PI * 2) * 1.3, 0.9, Math.sin((i / 4) * Math.PI * 2) * 1.3]}
            >
              <boxGeometry args={[0.15, 1.6, 0.15]} />
              <meshToonMaterial color="#f2e6c8" gradientMap={toonGradient} />
              <Ink />
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
              <meshToonMaterial color={i % 2 ? p.colorA : p.colorB} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}
        </group>
      )
    case "mango-tree":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.14, 1.2, 6]} />
            <meshToonMaterial color="#5a4331" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <sphereGeometry args={[0.75, 8, 8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "banyan": {
      // one organism: a broad canopy held up by a ring of aerial prop roots
      const r = rng(p.seed)
      const rootColor = new THREE.Color(p.colorA).multiplyScalar(0.72).getStyle()
      const aerials = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + (r() - 0.5) * 0.45
        const ring = 1.0 + r() * 0.4
        return {
          x: Math.cos(a) * ring,
          z: Math.sin(a) * ring,
          rad: 0.05 + r() * 0.03,
          lean: [(r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16] as [number, number, number],
        }
      })
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* main trunk */}
          <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.28, 0.45, 1.6, 7]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>

          {/* canopy: one wide mass built from overlapping spheres.
              flatShading is dropped here — r3f's meshToonMaterial element type
              does not expose it in this three version, and the toon bands
              already give the canopy hard-edged facets. */}
          <mesh position={[0, 2.4, 0]} castShadow>
            <sphereGeometry args={[1.5, 12, 10]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {([[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]] as [number, number][]).map(([sx, sz], i) => (
            <mesh key={`c${i}`} position={[sx, 2.2, sz]} castShadow>
              <sphereGeometry args={[1, 10, 8]} />
              <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}

          {/* aerial prop roots hanging from the canopy to the ground.
              0.10-0.16 across — an inverted hull would swallow them */}
          {aerials.map((a, i) => (
            <mesh key={`a${i}`} position={[a.x, 1, a.z]} rotation={a.lean} castShadow>
              <cylinderGeometry args={[a.rad, a.rad * 1.15, 2, 6]} />
              <meshToonMaterial color={rootColor} gradientMap={toonGradient} />
            </mesh>
          ))}

          {/* thick surface roots splaying from the base */}
          {[0.6, 2.7, 4.5].map((a, i) => (
            <mesh
              key={`s${i}`}
              position={[Math.cos(a) * 0.35, 0.1, Math.sin(a) * 0.35]}
              rotation={[0, -a, -1.3]}
              castShadow
            >
              <cylinderGeometry args={[0.12, 0.12, 0.5, 6]} />
              <meshToonMaterial color={rootColor} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}
        </group>
      )
    }
    case "peepal-tree":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.26, 1.8, 6]} />
            <meshToonMaterial color="#6b5540" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 2.3, 0]} castShadow>
            <sphereGeometry args={[1.15, 8, 8]} />
            <meshToonMaterial color="#4f7a34" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0.1, 0.05, 0.1]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshToonMaterial color="#c9b48f" gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "lamp-post":
      // pole (0.08 across) and bulb both skipped per the thin-geometry rule
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 1.8, 6]} />
            <meshToonMaterial color="#2c2c2c" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 1.85, 0]}>
            <sphereGeometry args={[0.13, 10, 10]} />
            <meshToonMaterial
              color="#ffdf90"
              emissive="#ffb84d"
              emissiveIntensity={0.8}
              gradientMap={toonGradient}
            />
          </mesh>
        </group>
      )
    case "flag":
      // pole and cloth are both thin — no outlines
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 2, 6]} />
            <meshToonMaterial color="#8a6a4a" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0.3, 1.75, 0]}>
            <coneGeometry args={[0.3, 0.5, 3]} />
            <meshToonMaterial color="#e0763a" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "guardrail":
      // posts are 0.05 across and the rail 0.05 deep — all too thin to ink
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* posts run 1.0 long centred at -0.15, so 0.65 is buried and only
              0.35 shows — the verge is too uneven for a surface-sitting post */}
          {[-0.4, 0.4].map((x, i) => (
            <mesh key={i} position={[x, -0.15, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 1, 6]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.9, 0.08, 0.05]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "utility-pole":
      // 0.06 across — no outline
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 1.3, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 2.6, 6]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 2.35, 0]} castShadow>
            <boxGeometry args={[0.5, 0.06, 0.06]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "grass-tuft":
      // no outline and deliberately no castShadow — there are well over a
      // hundred of these and none of them earns a shadow map pass
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {(
            [
              [-0.05, 0, [0, 0, 0.26]],
              [0.05, 0.03, [0.22, 0, -0.2]],
              [0, -0.05, [-0.24, 0, 0.06]],
            ] as [number, number, [number, number, number]][]
          ).map(([x, z, rot], i) => (
            <mesh key={i} position={[x, 0.09, z]} rotation={rot}>
              <coneGeometry args={[0.05, 0.18, 5]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
        </group>
      )
    case "wire": {
      if (!p.aux) return null
      const [a, b] = p.aux
      // the control point is the midpoint pulled toward the planet centre —
      // on a sphere that IS the sag
      const sag = a
        .clone()
        .add(b)
        .multiplyScalar(0.5)
      sag.addScaledVector(sag.clone().normalize(), -0.35)
      const curve = new THREE.QuadraticBezierCurve3(a, sag, b)
      // aux is world-space, so this mesh takes no group transform
      return (
        <mesh geometry={new THREE.TubeGeometry(curve, 8, 0.015, 4, false)}>
          <meshBasicMaterial color={p.colorA} />
        </mesh>
      )
    }
    case "traffic-signal":
      return <TrafficSignal p={p} />
    case "gopuram": {
      // four tiers shrinking ~72% a level, alternating stone and red
      const tiers = [1.3, 0.95, 0.7, 0.5]
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* base, sunk 0.6 below grade */}
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 1.5, 1.6]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {tiers.map((w, i) => (
            <mesh key={i} position={[0, 1.125 + i * 0.45, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, 0.45, w]} />
              <meshToonMaterial
                color={i % 2 === 0 ? p.colorB : p.colorA}
                gradientMap={toonGradient}
              />
              <Ink />
            </mesh>
          ))}
          {/* barrel-vault cap and gold finial */}
          <mesh position={[0, 2.825, 0]} castShadow>
            <boxGeometry args={[0.55, 0.25, 0.3]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 3.04, 0]} castShadow>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshToonMaterial color="#f2d060" gradientMap={toonGradient} />
          </mesh>
          {/* doorway on -Z, the face looking down the approach */}
          <mesh position={[0, 0.32, -0.81]}>
            <boxGeometry args={[0.45, 0.62, 0.08]} />
            <meshToonMaterial color="#2a211c" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
    case "temple-court":
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, -0.175, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.6, 0.85, 2.2]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {([[-1.1, -0.9], [1.1, -0.9], [-1.1, 0.9], [1.1, 0.9]] as [number, number][]).map(
            ([x, z], i) => (
              <mesh key={i} position={[x, 0.7, z]} castShadow>
                <boxGeometry args={[0.15, 0.9, 0.15]} />
                <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
                <Ink />
              </mesh>
            ),
          )}
          {/* mandapa roof over the back half only, toward the shrine */}
          <mesh position={[0, 1.2, 0.55]} castShadow>
            <boxGeometry args={[2.4, 0.1, 1.1]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "nandi-statue":
      // the bull looks along local +X, which aimAtZone points at the shrine
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, -0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.8, 0.6]} />
            <meshToonMaterial color="#b8a888" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* body lying along X */}
          <mesh position={[0, 0.48, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.28, 0.5, 4, 10]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* shoulder hump */}
          <mesh position={[0.05, 0.7, 0]} castShadow>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* head and horns */}
          <mesh position={[0.5, 0.56, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[-0.11, 0.11].map((z, i) => (
            <mesh key={i} position={[0.55, 0.75, z]} rotation={[0, 0, -0.3]} castShadow>
              <coneGeometry args={[0.05, 0.16, 6]} />
              <meshToonMaterial color="#d9cdb4" gradientMap={toonGradient} />
            </mesh>
          ))}
          {/* stub legs */}
          {([[-0.22, -0.16], [-0.22, 0.16], [0.22, -0.16], [0.22, 0.16]] as [number, number][]).map(
            ([x, z], i) => (
              <mesh key={i} position={[x, 0.32, z]} castShadow>
                <cylinderGeometry args={[0.07, 0.07, 0.3, 6]} />
                <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
              </mesh>
            ),
          )}
        </group>
      )
    case "temple-steps":
      // treads march downhill along local -Z
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh
              key={i}
              position={[0, -i * 0.12 - 0.36, -i * 0.4]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1.6, 0.72, 0.4]} />
              <meshToonMaterial
                color={i % 2 ? p.colorA : p.colorB}
                gradientMap={toonGradient}
              />
              <Ink />
            </mesh>
          ))}
        </group>
      )
    case "bridge-deck": {
      if (!p.aux) return null
      const span = p.aux[0].distanceTo(p.aux[1]) + 0.04
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[span, 0.2, 1.8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* darker kerb line under the deck edge */}
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[span, 0.06, 1.65]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
    case "bridge-rail": {
      if (!p.aux) return null
      const span = p.aux[0].distanceTo(p.aux[1]) + 0.04
      // guardrail proportions: two posts and a top rail, all too thin to ink
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {[-span / 2 + 0.06, span / 2 - 0.06].map((x, i) => (
            <mesh key={i} position={[x, 0.22, 0]} castShadow>
              <cylinderGeometry args={[0.025, 0.025, 0.55, 6]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[span, 0.08, 0.05]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[span, 0.05, 0.04]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
    case "bridge-pier": {
      if (!p.aux) return null
      const height = p.aux[0].distanceTo(p.aux[1])
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, height / 2 - 0.15, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.125, 0.16, height + 0.3, 8]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    }
    case "metro-pillar": {
      if (!p.aux) return null
      const height = p.aux[0].distanceTo(p.aux[1])
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* flared footing, rooted below grade */}
          <mesh position={[0, -0.05, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 0.3, 0.7]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, height / 2 - 0.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.32, 0.42, height + 0.2, 10]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* cap beam sits just under the deck */}
          <mesh position={[0, height - 0.09, 0]} castShadow>
            <boxGeometry args={[1.1, 0.15, 0.5]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    }
    case "metro-station": {
      if (!p.aux) return null
      const lift = p.aux[0].distanceTo(p.aux[1])
      const deckY = lift
      const platY = deckY - 0.25
      const roofY = platY + 1.35
      const tex = p.signText
        ? makeSignTexture(
            [
              { text: p.signText.kannada, font: `54px ${KANNADA_FONT_STACK}`, color: "#ffffff" },
              {
                text: p.signText.english,
                font: '38px "Segoe UI", system-ui, sans-serif',
                color: "#e6f2e9",
              },
            ],
            p.colorB,
            "#ffffff",
          )
        : null
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* legs carrying the platform down to the ground */}
          {[-1.3, 1.3].map((x, i) => (
            <mesh key={`l${i}`} position={[x, platY / 2 - 0.15, 0.85]} castShadow>
              <boxGeometry args={[0.3, platY + 0.3, 0.3]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}
          {/* platform slab, one step below the deck and set beside the track */}
          <mesh position={[0, platY, 0.85]} castShadow receiveShadow>
            <boxGeometry args={[3.5, 0.14, 0.9]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* canopy columns */}
          {[
            [-1.5, 0.55],
            [1.5, 0.55],
            [-1.5, 1.15],
            [1.5, 1.15],
          ].map(([x, z], i) => (
            <mesh key={`c${i}`} position={[x, platY + 0.68, z]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 1.3, 8]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, roofY, 0.85]} castShadow>
            <boxGeometry args={[3.6, 0.1, 1.15]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* name board on the outer face of the canopy */}
          <mesh position={[0, roofY - 0.4, 1.45]} castShadow>
            <boxGeometry args={[1.7, 0.55, 0.06]} />
            {[0, 1, 2, 3].map((slot) => (
              <meshToonMaterial
                key={slot}
                attach={`material-${slot}`}
                color={p.colorB}
                gradientMap={toonGradient}
              />
            ))}
            {[4, 5].map((slot) => (
              <meshToonMaterial
                key={slot}
                attach={`material-${slot}`}
                color="#ffffff"
                map={tex ?? undefined}
                gradientMap={toonGradient}
              />
            ))}
            <Ink />
          </mesh>
        </group>
      )
    }
    case "metro-track": {
      if (!p.aux) return null
      const span = p.aux[0].distanceTo(p.aux[1]) + 0.05
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[span, 0.18, 0.55]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* darker underside */}
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[span, 0.04, 0.5]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
    case "zone-signboard": {
      const tex = p.signText
        ? makeSignTexture(
            [
              { text: p.signText.kannada, font: `54px ${KANNADA_FONT_STACK}`, color: "#ffffff" },
              {
                text: p.signText.english,
                font: '38px "Segoe UI", system-ui, sans-serif',
                color: "#e6f2e9",
              },
            ],
            p.colorA,
            p.colorB,
          )
        : null
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {/* posts sunk 0.4 below grade, 1.5 showing */}
          {[-0.55, 0.55].map((x, i) => (
            <mesh key={i} position={[x, 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 1.9, 6]} />
              <meshToonMaterial color="#4a4038" gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, 1.35, 0]} castShadow>
            <boxGeometry args={[1.5, 0.75, 0.06]} />
            {/* box material order is +X -X +Y -Y +Z -Z; only the two broad
                faces carry the plate, the thin edges stay flat green */}
            {[0, 1, 2, 3].map((slot) => (
              <meshToonMaterial
                key={slot}
                attach={`material-${slot}`}
                color={p.colorA}
                gradientMap={toonGradient}
              />
            ))}
            {[4, 5].map((slot) => (
              <meshToonMaterial
                key={slot}
                attach={`material-${slot}`}
                color="#ffffff"
                map={tex ?? undefined}
                gradientMap={toonGradient}
              />
            ))}
            <Ink />
          </mesh>
        </group>
      )
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------- namma metro */

const COACHES = 3
const COACH_GAP = 0.045
const TRAIN_RIDE_HEIGHT = 0.28
const METRO_PURPLE = "#7a3f9d"
/** how far apart the two probes are when deriving the deck tangent */
const TANGENT_EPS = 0.004

// scratch, so the train costs no allocations per frame
const _tAhead = new THREE.Vector3()
const _tBehind = new THREE.Vector3()
const _tPos = new THREE.Vector3()
const _tFwd = new THREE.Vector3()
const _tUp = new THREE.Vector3()
const _tSide = new THREE.Vector3()
const _tBasis = new THREE.Matrix4()

function Coach({
  headlightRef,
  windowRef,
}: {
  headlightRef?: (m: THREE.Group | null) => void
  windowRef: (m: THREE.MeshToonMaterial | null) => void
}) {
  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.9, 0.35, 0.38]} />
        <meshToonMaterial color={METRO_PURPLE} gradientMap={toonGradient} />
        <Ink />
      </mesh>
      {/* window band — dimmed while the doors are open */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.78, 0.12, 0.4]} />
        <meshToonMaterial ref={windowRef} color="#2f3646" gradientMap={toonGradient} />
      </mesh>
      {/* livery stripe */}
      <mesh position={[0, -0.09, 0]}>
        <boxGeometry args={[0.9, 0.045, 0.4]} />
        <meshToonMaterial color="#f4f2ee" gradientMap={toonGradient} />
      </mesh>
      {/* slightly inset end caps */}
      {[-0.46, 0.46].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} castShadow>
          <boxGeometry args={[0.06, 0.3, 0.33]} />
          <meshToonMaterial color={METRO_PURPLE} gradientMap={toonGradient} />
        </mesh>
      ))}
      {/* headlamps live on a group that flips to whichever end leads */}
      <group ref={headlightRef}>
        {[-0.11, 0.11].map((z, i) => (
          <mesh key={i} position={[0.5, -0.06, z]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshToonMaterial
              color="#fff3c4"
              emissive="#ffd98a"
              emissiveIntensity={0.9}
              gradientMap={toonGradient}
            />
          </mesh>
        ))}
      </group>
    </>
  )
}

/**
 * Lives here rather than in Scene.tsx because it is welded to the viaduct it
 * rides: same corridor basis, same deck profile, same toon/outline setup as the
 * metro props a few cases above. Keeping them apart would let the deck and the
 * train drift out of alignment.
 */
function Train({ index }: { index: number }) {
  const coaches = useRef<(THREE.Group | null)[]>(new Array(COACHES).fill(null))
  const lamps = useRef<(THREE.Group | null)[]>(new Array(COACHES).fill(null))
  const windows = useRef<(THREE.MeshToonMaterial | null)[]>(new Array(COACHES).fill(null))

  useFrame(({ clock }) => {
    const state = metroTrainState(clock.getElapsedTime(), index)
    for (let i = 0; i < COACHES; i++) {
      const g = coaches.current[i]
      if (!g) continue
      // each coach is solved at its OWN curve parameter, so the set articulates
      // through bends instead of moving as one rigid body
      const t = state.t - i * COACH_GAP
      deckPoint(t, _tPos)
      deckPoint(t + TANGENT_EPS, _tAhead)
      deckPoint(t - TANGENT_EPS, _tBehind)

      _tUp.copy(_tPos).normalize()
      g.position.copy(_tPos).addScaledVector(_tUp, TRAIN_RIDE_HEIGHT)

      // heading taken from the deck itself, so coaches pitch with the grade
      _tFwd.copy(_tAhead).sub(_tBehind).normalize()
      _tUp.addScaledVector(_tFwd, -_tUp.dot(_tFwd)).normalize()
      _tSide.crossVectors(_tFwd, _tUp)
      _tBasis.makeBasis(_tFwd, _tUp, _tSide)
      g.quaternion.setFromRotationMatrix(_tBasis)

      const lamp = lamps.current[i]
      if (lamp) lamp.visible = i === 0

      const win = windows.current[i]
      if (win) win.emissiveIntensity = state.dwelling ? 0 : 0.35
    }
  })

  return (
    <group>
      {Array.from({ length: COACHES }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            coaches.current[i] = g
          }}
        >
          <Coach
            headlightRef={(m) => {
              lamps.current[i] = m
            }}
            windowRef={(m) => {
              windows.current[i] = m
            }}
          />
        </group>
      ))}
    </group>
  )
}

/** two trains sharing the loop, half a schedule apart */
function MetroTrains() {
  return (
    <>
      <Train index={0} />
      <Train index={1} />
    </>
  )
}

/**
 * The arterial cross-section. Every element type is merged into one geometry
 * per arc, so nine dual carriageways cost a few dozen draw calls instead of the
 * ~5,300 a segment-per-mesh build would need. No outlines: an inverted hull on
 * a long merged ribbon reads as a smear, not an edge.
 */
function Corridors({ meshes }: { meshes: CorridorMesh[] }) {
  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} receiveShadow>
          <meshToonMaterial
            color={m.color}
            vertexColors={m.vertexColors ?? false}
            gradientMap={toonGradient}
          />
        </mesh>
      ))}
    </group>
  )
}

export function PropsLayer() {
  const props = useMemo(() => buildProps(), [])
  // corridors need the metro pillars, which buildProps places
  const corridors = useMemo(() => buildCorridors(props), [props])
  return (
    <group>
      {props.map((p, i) => (
        <PropInstance key={i} p={p} />
      ))}
      <Corridors meshes={corridors} />
      <MetroTrains />
    </group>
  )
}
