"use client"

import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import * as THREE from "three"
import { Outlines, useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {
  buildProps,
  buildCorridors,
  deckPoint,
  metroTrainState,
  BRIDGE_HALF_WIDTH,
  GUARD_SHOW,
  GUARD_ROOT,
  GLB_BUILDINGS,
  type CorridorMesh,
  type PlacedProp,
} from "@/lib/game/props"
import { rng, terrainRadius } from "@/lib/game/terrain"
import { toonGradient } from "@/lib/game/toon"
import { KANNADA_FONT_STACK, makeSignTexture } from "@/lib/game/signage"

const INK = "#2c2620"
const EDGE = 0.035

/** seconds per lamp; every signal reads the same clock, so they stay in step */
const SIGNAL_PERIOD = 3.5
const LAMP_ON = 1
const LAMP_OFF = 0.15

/**
 * A reserved plot, DRAPED onto the terrain. The old rigid sunk cylinder was
 * placed flat at the centre height: on a sloped site (plots allow slope up to
 * 0.3) the downhill rim hovered up to ~3u in the air — the floating octagons
 * of the P47 screenshots. Every vertex now sits on the ground it covers.
 */
function CivicPad({ p }: { p: PlacedProp }) {
  const PAD_SHOW = 0.02
  const RIM_SHOW = 0.01
  const geo = useMemo(() => {
    const c = p.position.clone().normalize()
    const R = p.position.length()
    const t1 = new THREE.Vector3(0, 1, 0)
    if (Math.abs(c.y) > 0.9) t1.set(1, 0, 0)
    const u = new THREE.Vector3().crossVectors(t1, c).normalize()
    const v = new THREE.Vector3().crossVectors(c, u).normalize()
    const SECTORS = 8 // keeps the octagon look
    const RINGS = 4
    const dirAt = (rr: number, ang: number) =>
      c
        .clone()
        .addScaledVector(u, (Math.cos(ang) * rr) / R)
        .addScaledVector(v, (Math.sin(ang) * rr) / R)
        .normalize()
    const build = (r0: number, r1: number, rings: number, lift: number, color: THREE.Color) => {
      const pos: number[] = []
      const col: number[] = []
      const idx: number[] = []
      for (let ri = 0; ri <= rings; ri++) {
        const rr = r0 + ((r1 - r0) * ri) / rings
        for (let s = 0; s <= SECTORS; s++) {
          const ang = (s / SECTORS) * Math.PI * 2
          const d = dirAt(rr, ang)
          const h = terrainRadius(d) + lift
          pos.push(d.x * h, d.y * h, d.z * h)
          col.push(color.r, color.g, color.b)
        }
      }
      const W = SECTORS + 1
      for (let ri = 0; ri < rings; ri++) {
        for (let s = 0; s < SECTORS; s++) {
          const a = ri * W + s
          idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1)
        }
      }
      return { pos, col, idx }
    }
    const disc = build(0, p.scale, RINGS, PAD_SHOW, new THREE.Color(p.colorA))
    const rim = build(p.scale, p.scale * 1.06, 1, RIM_SHOW, new THREE.Color(p.colorB))
    const g = new THREE.BufferGeometry()
    const pos = [...disc.pos, ...rim.pos]
    const col = [...disc.col, ...rim.col]
    const base = disc.pos.length / 3
    const idx = [...disc.idx, ...rim.idx.map((i) => i + base)]
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [p])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshToonMaterial vertexColors gradientMap={toonGradient} />
    </mesh>
  )
}

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

/**
 * Assets from threejsassets.com are Draco-compressed; the decoder ships with
 * three and is served from public/draco (no CDN dependency).
 */
const DRACO_PATH = "/draco/"
for (const b of GLB_BUILDINGS) useGLTF.preload(b.path, DRACO_PATH)

/**
 * A GLB stood on the round world. The loaded scene is rebased so its bounding
 * box is centred in X/Z with the base exactly at y=0 — models are authored
 * with arbitrary origins (the skyscraper's sits at mid-height) and the
 * placement code must be able to trust "position = the ground point".
 * Materials are swapped for the project's toon look (keeping each mesh's own
 * base colour and vertex colours) with the standard ink outline, and a buried
 * plinth bridges the downhill gap on sloped sites so the base never shows air.
 */
function GlbBuilding({ p }: { p: PlacedProp }) {
  const { scene } = useGLTF(p.modelPath!, DRACO_PATH)
  const pos = p.position.toArray() as [number, number, number]
  const quat = new THREE.Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w)
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(scene)
    const rebase = new THREE.Matrix4().makeTranslation(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    )
    const meshes: {
      geo: THREE.BufferGeometry
      matrix: THREE.Matrix4
      color: string
      vertexColors: boolean
    }[] = []
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = m.material as THREE.MeshStandardMaterial
      meshes.push({
        geo: m.geometry as THREE.BufferGeometry,
        matrix: new THREE.Matrix4().multiplyMatrices(rebase, m.matrixWorld),
        color: mat?.color ? `#${mat.color.getHexString()}` : "#ffffff",
        vertexColors: !!(m.geometry as THREE.BufferGeometry).attributes.color,
      })
    })
    return {
      meshes,
      hx: (box.max.x - box.min.x) / 2,
      hz: (box.max.z - box.min.z) / 2,
    }
  }, [scene])
  return (
    <group position={pos} quaternion={quat} scale={p.scale}>
      {parts.meshes.map((it, i) => (
        <mesh
          key={i}
          geometry={it.geo}
          matrix={it.matrix}
          matrixAutoUpdate={false}
          castShadow
          receiveShadow
        >
          <meshToonMaterial
            color={it.color}
            vertexColors={it.vertexColors}
            gradientMap={toonGradient}
          />
          <Ink />
        </mesh>
      ))}
      {/* Shallow foundation base: sites are graded level now (P49), so the
          plinth is a visible 0.04 step with 0.56 buried — no more retaining
          wall. Scale is divided back out so the step stays constant. */}
      <mesh position={[0, 0.04 - 0.3, 0]} receiveShadow>
        <boxGeometry args={[parts.hx * 2 + 0.6, 0.6, parts.hz * 2 + 0.6]} />
        <meshToonMaterial color="#cfc4ae" gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

function PropInstance({ p }: { p: PlacedProp }) {
  const pos = p.position.toArray() as [number, number, number]
  const quat = new THREE.Quaternion(p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w)

  switch (p.kind) {
    case "cow":
      // stands where it stands and does not move — the obstacle is the point
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.56, 1.5]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* dark patch, so it reads as a cow and not a crate */}
          <mesh position={[0.28, 0.86, 0.18]}>
            <boxGeometry args={[0.1, 0.34, 0.5]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 0.95, 0.86]} castShadow>
            <boxGeometry args={[0.38, 0.38, 0.4]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 0.78, 1.06]}>
            <boxGeometry args={[0.26, 0.2, 0.12]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
          {/* horns and the hump — the Indian humped zebu, not a dairy cow */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.16, 1.16, 0.84]} rotation={[0, 0, s * 0.5]}>
              <boxGeometry args={[0.07, 0.2, 0.07]} />
              <meshToonMaterial color="#d8cfbc" gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, 1.12, 0.42]} castShadow>
            <boxGeometry args={[0.34, 0.22, 0.36]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[
            [-0.22, 0.55],
            [0.22, 0.55],
            [-0.22, -0.5],
            [0.22, -0.5],
          ].map(([x, z], k) => (
            <mesh key={k} position={[x, 0.27, z]} castShadow>
              <boxGeometry args={[0.14, 0.54, 0.16]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0, 0.72, -0.78]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.07, 0.5, 0.07]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "cat":
      // curled up on a warm patch of ground
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.22, 0.19, 0.34]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 0.16, 0.19]} castShadow>
            <boxGeometry args={[0.16, 0.15, 0.14]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.05, 0.25, 0.19]} rotation={[0, 0, s * 0.25]}>
              <boxGeometry args={[0.05, 0.07, 0.04]} />
              <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            </mesh>
          ))}
          {/* tail curled round the body */}
          <mesh position={[0.13, 0.05, -0.05]} rotation={[0, 0.7, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.3]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "stall-counter":
      // a vendor's counter: top at 0.75, the height the arrange-stock pose reaches
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.25, 0.14, 0.6]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[-0.52, 0.52].map((x) => (
            <mesh key={x} position={[x, 0.3, 0]} castShadow>
              <boxGeometry args={[0.11, 0.62, 0.5]} />
              <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}
          {/* goods on the counter: stacked glasses and a cash tin */}
          {[-0.34, -0.2, -0.06].map((x, k) => (
            <mesh key={k} position={[x, 0.81, 0.08]}>
              <cylinderGeometry args={[0.045, 0.04, 0.12, 6]} />
              <meshToonMaterial color="#e8e3d6" gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh position={[0.32, 0.81, -0.05]} castShadow>
            <boxGeometry args={[0.26, 0.14, 0.2]} />
            <meshToonMaterial color="#7d6a4a" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* the kettle */}
          <mesh position={[0.05, 0.85, -0.14]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.2, 8]} />
            <meshToonMaterial color="#8d8880" gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "flower-spread":
      // low platform of marigold and jasmine heaps, at seated-hand height
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.31, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.1, 0.62, 0.7]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {[
            [-0.34, "#e8a020"],
            [-0.06, "#f2c744"],
            [0.22, "#e8e3d6"],
            [0.44, "#d8642a"],
          ].map(([x, c], k) => (
            <mesh key={k} position={[x as number, 0.72, 0.02]} castShadow>
              <sphereGeometry args={[0.16, 7, 5]} />
              <meshToonMaterial color={c as string} gradientMap={toonGradient} />
              <Ink />
            </mesh>
          ))}
          {/* the brass scale every flower seller weighs by */}
          <mesh position={[0.44, 0.68, -0.24]}>
            <boxGeometry args={[0.03, 0.22, 0.03]} />
            <meshToonMaterial color="#b8934a" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0.44, 0.8, -0.24]}>
            <boxGeometry args={[0.3, 0.022, 0.03]} />
            <meshToonMaterial color="#b8934a" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "work-crate":
      // the thing a crouched tradesman works over: crate, tools, a part
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.72, 0.48, 0.54]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* plank lines, so it reads as a crate and not a block */}
          {[0.12, 0.3].map((y) => (
            <mesh key={y} position={[0, y, 0.28]}>
              <boxGeometry args={[0.74, 0.02, 0.01]} />
              <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            </mesh>
          ))}
          {/* the part being worked on, sitting on top */}
          <mesh position={[0, 0.53, 0.02]} castShadow>
            <boxGeometry args={[0.34, 0.12, 0.26]} />
            <meshToonMaterial color="#6b6f74" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* a spanner and a hammer head laid beside it */}
          <mesh position={[0.24, 0.5, -0.14]} rotation={[0, 0.4, 0]}>
            <boxGeometry args={[0.22, 0.025, 0.045]} />
            <meshToonMaterial color="#9aa0a6" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[-0.24, 0.5, -0.16]} rotation={[0, -0.3, 0]}>
            <boxGeometry args={[0.18, 0.03, 0.035]} />
            <meshToonMaterial color="#5a4a34" gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    case "sit-step":
      // a low stone step or wall — what the sitting pose actually rests on
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.4, 0.62]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 0.41, 0]} receiveShadow>
            <boxGeometry args={[1.36, 0.045, 0.68]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "shrine":
      // small stone shrine with a bell and an offering tray to bow to
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.6, 0.5]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          <mesh position={[0, 0.72, 0]} castShadow>
            <coneGeometry args={[0.34, 0.42, 6]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* the niche */}
          <mesh position={[0, 0.36, 0.26]}>
            <boxGeometry args={[0.26, 0.3, 0.03]} />
            <meshToonMaterial color="#3a332b" gradientMap={toonGradient} />
          </mesh>
          {/* offering tray at hand height for the bow */}
          <mesh position={[0, 0.63, 0.3]} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.04, 8]} />
            <meshToonMaterial color="#b8934a" gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* bell hanging on a post beside it */}
          <mesh position={[0.42, 0.55, 0.1]}>
            <boxGeometry args={[0.04, 1.1, 0.04]} />
            <meshToonMaterial color="#8d8880" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0.42, 0.98, 0.1]} castShadow>
            <coneGeometry args={[0.1, 0.18, 6]} />
            <meshToonMaterial color="#c9a227" gradientMap={toonGradient} />
            <Ink />
          </mesh>
        </group>
      )
    case "civic-pad":
      // draped onto the ground it covers — see CivicPad
      return <CivicPad p={p} />
    case "glb-building":
      // its own Suspense: a still-loading model must not blank the world
      return (
        <Suspense fallback={null}>
          <GlbBuilding p={p} />
        </Suspense>
      )
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
          {/* the stone marker at the foot of the tree. It was a 0.5 cube centred
              at y +0.05 and pushed 0.1 off the trunk, which at this zone's 1.4
              scale left a 0.7u block standing 0.5u proud of the grass and clear
              of the trunk — the pale box in the screenshot. Sunk and re-centred
              so it reads as a stone set at the roots. */}
          <mesh position={[0, -0.15, 0]}>
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
    case "guardrail": {
      // posts are 0.05 across and the rail 0.05 deep — all too thin to ink
      if (!p.aux) return null
      // aux carries the ground under each post. Bring both into the prop's own
      // frame: local +Y is the radial up, so each foot's y is how much higher or
      // lower its ground sits than the rail's centre.
      const inv = quat.clone().invert()
      const origin = new THREE.Vector3(...pos)
      const lf = p.aux.map((w) => w.clone().sub(origin).applyQuaternion(inv))
      const [l, r] = lf
      // each post stands upright from its own ground, showing the same height,
      // and the rail runs from one top to the other — down the grade, not level
      const dx = r.x - l.x
      const dy = r.y - l.y
      return (
        <group position={pos} quaternion={quat} scale={p.scale}>
          {lf.map((f, i) => (
            <mesh
              key={i}
              position={[f.x, f.y + (GUARD_SHOW - GUARD_ROOT) / 2, f.z]}
              castShadow
            >
              <cylinderGeometry args={[0.025, 0.025, GUARD_SHOW + GUARD_ROOT, 6]} />
              <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            </mesh>
          ))}
          <mesh
            position={[(l.x + r.x) / 2, (l.y + r.y) / 2 + GUARD_SHOW, (l.z + r.z) / 2]}
            rotation={[0, 0, Math.atan2(dy, dx)]}
            castShadow
          >
            <boxGeometry args={[Math.hypot(dx, dy) + 0.1, 0.08, 0.05]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
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
            <boxGeometry args={[span, 0.2, (p.width ?? BRIDGE_HALF_WIDTH) * 2]} />
            <meshToonMaterial color={p.colorA} gradientMap={toonGradient} />
            <Ink />
          </mesh>
          {/* darker kerb line under the deck edge, inset 0.075 either side */}
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[span, 0.06, (p.width ?? BRIDGE_HALF_WIDTH) * 2 - 0.15]} />
            <meshToonMaterial color={p.colorB} gradientMap={toonGradient} />
          </mesh>
        </group>
      )
    }
    // "bridge-rail" renders as an instanced fleet — see BridgeRails below
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
    // "metro-pillar" renders as an instanced fleet — see MetroPillars below
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
          {/* depth-biased toward the camera: the skirt's outer rim sits ON the
              ground by construction (P43 measured half its verts within 0.02u
              of the terrain), and without the bias it shimmers against the
              planet mesh. The offset settles who wins without moving geometry. */}
          <meshToonMaterial
            color={m.color}
            vertexColors={m.vertexColors ?? false}
            gradientMap={toonGradient}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------- instanced prop fleets */

const _IDENTITY_Q = new THREE.Quaternion()

/**
 * One shape drawn many times. Bridge rails and metro pillars were the two
 * biggest draw-call sinks in the scene — 1,088 and 690 calls of per-prop meshes
 * for what is the same geometry repeated at different transforms — so each
 * sub-shape becomes a single InstancedMesh. Matrices are baked once here;
 * nothing runs per frame. Culling needs no opt-out: three computes an
 * InstancedMesh bounding sphere from every instance, so the fleet culls as a
 * whole, correctly.
 */
function InstancedPart({
  matrices,
  castShadow = false,
  receiveShadow = false,
  children,
}: {
  matrices: THREE.Matrix4[]
  castShadow?: boolean
  receiveShadow?: boolean
  children: ReactNode
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.instanceMatrix.needsUpdate = true
  }, [matrices])
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, matrices.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      {children}
    </instancedMesh>
  )
}

/** world x local-translation x local-scale, the transform every part bakes */
function partMatrix(
  world: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  return new THREE.Matrix4()
    .compose(new THREE.Vector3(x, y, z), _IDENTITY_Q, new THREE.Vector3(sx, sy, sz))
    .premultiply(world)
}

/**
 * Every bridge railing on the planet: two posts and two rails per prop, as
 * three InstancedMesh — not two, because the rails differ in colour AND in
 * which of them casts a shadow, and a merged mesh could keep neither
 * distinction. Instancing shares one material per part, which is safe because
 * every bridge-rail is coloured from the same KIND_COLORS pair.
 */
function BridgeRails({ rails }: { rails: PlacedProp[] }) {
  const parts = useMemo(() => {
    const posts: THREE.Matrix4[] = []
    const tops: THREE.Matrix4[] = []
    const lows: THREE.Matrix4[] = []
    const world = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    for (const p of rails) {
      if (!p.aux) continue
      const span = p.aux[0].distanceTo(p.aux[1]) + 0.04
      world.compose(p.position, p.quaternion, scale.setScalar(p.scale))
      posts.push(partMatrix(world, -span / 2 + 0.06, 0.22, 0))
      posts.push(partMatrix(world, span / 2 - 0.06, 0.22, 0))
      // unit-length boxes stretched to each prop's span
      tops.push(partMatrix(world, 0, 0.42, 0, span))
      lows.push(partMatrix(world, 0, 0.22, 0, span))
    }
    return { posts, tops, lows }
  }, [rails])
  if (!rails.length) return null
  const colorA = rails[0].colorA
  const colorB = rails[0].colorB
  return (
    <>
      <InstancedPart matrices={parts.posts} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.55, 6]} />
        <meshToonMaterial color={colorA} gradientMap={toonGradient} />
      </InstancedPart>
      <InstancedPart matrices={parts.tops} castShadow>
        <boxGeometry args={[1, 0.08, 0.05]} />
        <meshToonMaterial color={colorA} gradientMap={toonGradient} />
      </InstancedPart>
      <InstancedPart matrices={parts.lows}>
        <boxGeometry args={[1, 0.05, 0.04]} />
        <meshToonMaterial color={colorB} gradientMap={toonGradient} />
      </InstancedPart>
    </>
  )
}

/**
 * Every metro pillar: footing, shaft and cap beam as three InstancedMesh.
 * Pillar heights vary, so the shaft is a unit-height cone stretched per
 * instance — three's shaders divide the normal by the instance scale (the
 * inverse-transpose correction in defaultnormal_vertex), so the toon shading
 * survives the stretch exactly.
 *
 * Ink: drei's <Outlines> does support InstancedMesh parents — it builds a hull
 * InstancedMesh sharing the parent's geometry, count and instanceMatrix — so
 * the footing and cap keep their outlines verbatim. The SHAFT's outline is
 * omitted: drei's outline shader transforms the hull normal by instanceMatrix
 * WITHOUT that correction, so the per-instance height scale would mis-aim the
 * silhouette push and smear the line. The shaft sits between an inked footing
 * and an inked cap, which carry the silhouette.
 */
function MetroPillars({ pillars }: { pillars: PlacedProp[] }) {
  const parts = useMemo(() => {
    const footings: THREE.Matrix4[] = []
    const shafts: THREE.Matrix4[] = []
    const caps: THREE.Matrix4[] = []
    const world = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    for (const p of pillars) {
      if (!p.aux) continue
      const height = p.aux[0].distanceTo(p.aux[1])
      world.compose(p.position, p.quaternion, scale.setScalar(p.scale))
      footings.push(partMatrix(world, 0, -0.05, 0))
      shafts.push(partMatrix(world, 0, height / 2 - 0.1, 0, 1, height + 0.2, 1))
      caps.push(partMatrix(world, 0, height - 0.09, 0))
    }
    return { footings, shafts, caps }
  }, [pillars])
  if (!pillars.length) return null
  const colorA = pillars[0].colorA
  const colorB = pillars[0].colorB
  return (
    <>
      <InstancedPart matrices={parts.footings} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.3, 0.7]} />
        <meshToonMaterial color={colorA} gradientMap={toonGradient} />
        <Ink />
      </InstancedPart>
      <InstancedPart matrices={parts.shafts} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.42, 1, 10]} />
        <meshToonMaterial color={colorA} gradientMap={toonGradient} />
      </InstancedPart>
      <InstancedPart matrices={parts.caps} castShadow>
        <boxGeometry args={[1.1, 0.15, 0.5]} />
        <meshToonMaterial color={colorB} gradientMap={toonGradient} />
        <Ink />
      </InstancedPart>
    </>
  )
}

export function PropsLayer() {
  const props = useMemo(() => buildProps(), [])
  // corridors need the metro pillars, which buildProps places
  const corridors = useMemo(() => buildCorridors(props), [props])
  const rails = useMemo(() => props.filter((p) => p.kind === "bridge-rail"), [props])
  const pillars = useMemo(() => props.filter((p) => p.kind === "metro-pillar"), [props])
  const solo = useMemo(
    () => props.filter((p) => p.kind !== "bridge-rail" && p.kind !== "metro-pillar"),
    [props],
  )
  return (
    <group>
      {solo.map((p, i) => (
        <PropInstance key={i} p={p} />
      ))}
      <BridgeRails rails={rails} />
      <MetroPillars pillars={pillars} />
      <Corridors meshes={corridors} />
      <MetroTrains />
    </group>
  )
}
