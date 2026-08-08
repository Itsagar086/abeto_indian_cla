"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Outlines } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { buildProps, type PlacedProp } from "@/lib/game/props"
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
