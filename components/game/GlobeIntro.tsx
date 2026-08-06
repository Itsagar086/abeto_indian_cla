"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"

/* ------------------------------------------------------------------ tuning */

const TEX_W = 2048
const TEX_H = 1024

// India's mainland centroid, measured from public/geo/world.geo.json
const INDIA_LON = 79.594
const INDIA_LAT = 22.925

/**
 * Rotations that bring that centroid round to face the camera at +Z.
 *
 * THREE.SphereGeometry maps u = (lon + 180) / 360 and v = (90 - lat) / 180,
 * giving x = -cos(2πu)·sin(πv), y = cos(πv), z = sin(2πu)·sin(πv). Spinning
 * about Y by (π/2 - 2πu) puts the meridian on +Z; tilting the parent about X
 * by the latitude lifts it onto the equator. Verified numerically: the
 * centroid lands on (0, 0, 1).
 */
const TARGET_SPIN_Y = Math.PI / 2 - 2 * Math.PI * ((INDIA_LON + 180) / 360)
const TILT_X = (INDIA_LAT * Math.PI) / 180
/** start 1.5 turns back, so India begins facing away and swings round to front */
const START_SPIN_Y = TARGET_SPIN_Y - Math.PI * 3

const SETTLE_SECONDS = 4
const CAM_START = 3.6
const CAM_END = 2.85
const PULSE_PERIOD = 1.2
/** radians/sec the globe keeps turning behind the guide panel */
const GUIDE_DRIFT = 0.06

const STAGES: { title: string; body: string }[] = [
  {
    title: "A Tiny Round World",
    body: "You are the courier of a small village planet. Gravity pulls to its heart — walk in any direction and you will come back home.",
  },
  {
    title: "Moving Around",
    body: "W / S or arrow keys — walk forward and back. A / D — turn. Hold Shift to sprint. Space to jump.",
  },
  {
    title: "Meet the Villagers",
    body: "Villagers with an amber ! above their head have a delivery for you. Walk close and press E to talk. Press E again to continue the conversation.",
  },
  {
    title: "Deliveries",
    body: "You carry one parcel at a time — you will see it on your back. Deliver it to the right person before accepting another job.",
  },
  {
    title: "Your Mission",
    body: "Complete all 5 deliveries across the bazaar, the temple hill, the mango grove and beyond. Shubh yatra, Mitra!",
  },
]

const OCEAN = "#10333d"
const LAND = "#e0c191"
const INDIA_FILL = "#f4a63a"
const STATE_LINE = "rgba(150, 88, 20, 0.45)"
const KARNATAKA = "#ffd76a"
const BACKDROP = "#0b1a2e"

/* --------------------------------------------------- geojson -> canvas texture */

type Ring = number[][]
type Poly = Ring[]

function polygonsOf(geometry: any): Poly[] {
  if (!geometry) return []
  if (geometry.type === "Polygon") return [geometry.coordinates]
  if (geometry.type === "MultiPolygon") return geometry.coordinates
  return []
}

/** equirectangular trace; starts a new subpath across the antimeridian so
 *  dateline-spanning countries don't smear a band across the texture */
function tracePolygon(ctx: CanvasRenderingContext2D, poly: Poly) {
  for (const ring of poly) {
    let prevLon: number | null = null
    for (let i = 0; i < ring.length; i++) {
      const lon = ring[i][0]
      const lat = ring[i][1]
      const x = ((lon + 180) / 360) * TEX_W
      const y = ((90 - lat) / 180) * TEX_H
      if (i === 0 || (prevLon !== null && Math.abs(lon - prevLon) > 180)) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
      prevLon = lon
    }
  }
}

function paint(
  ctx: CanvasRenderingContext2D,
  features: any[],
  fill: string,
  stroke?: string,
  lineWidth = 2,
) {
  ctx.beginPath()
  for (const f of features) for (const poly of polygonsOf(f?.geometry)) tracePolygon(ctx, poly)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.lineJoin = "round"
    ctx.stroke()
  }
}

function toTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function newCanvas() {
  const canvas = document.createElement("canvas")
  canvas.width = TEX_W
  canvas.height = TEX_H
  return canvas
}

/** stroke a feature set without filling it */
function outline(ctx: CanvasRenderingContext2D, features: any[], stroke: string, lineWidth: number) {
  ctx.beginPath()
  for (const f of features) for (const poly of polygonsOf(f?.geometry)) tracePolygon(ctx, poly)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.lineJoin = "round"
  ctx.stroke()
}

/** world map, with India in its official depiction drawn over the top;
 *  falls back to a plain sand globe when the world geojson is missing */
function buildBaseTexture(world: any | null, states: any | null) {
  const canvas = newCanvas()
  const ctx = canvas.getContext("2d")!
  const worldFeatures: any[] = world?.features ?? []

  if (worldFeatures.length) {
    ctx.fillStyle = OCEAN
    ctx.fillRect(0, 0, TEX_W, TEX_H)
    paint(ctx, worldFeatures, LAND)
  } else {
    ctx.fillStyle = LAND
    ctx.fillRect(0, 0, TEX_W, TEX_H)
  }

  // India is the union of every state/UT, traced into a single path so shared
  // borders merge into one silhouette. Drawn on top of the world land layer,
  // which is what reconciles the base map with the official depiction.
  const stateFeatures: any[] = states?.features ?? []
  if (stateFeatures.length) {
    paint(ctx, stateFeatures, INDIA_FILL)
    outline(ctx, stateFeatures, STATE_LINE, 1.5)
  }
  return toTexture(canvas)
}

/** transparent overlay holding only Karnataka; null when unavailable */
function buildKarnatakaTexture(states: any | null) {
  const features: any[] = (states?.features ?? []).filter((f: any) => {
    const p = f?.properties ?? {}
    return /karnataka/i.test(String(p.ST_NM ?? p.st_nm ?? p.NAME_1 ?? p.NAME ?? p.name ?? ""))
  })
  if (!features.length) return null

  const canvas = newCanvas()
  const ctx = canvas.getContext("2d")!
  ctx.clearRect(0, 0, TEX_W, TEX_H)
  // stroked as well as filled — the state is only ~26px wide at this resolution
  paint(ctx, features, KARNATAKA, KARNATAKA, 3)
  return toTexture(canvas)
}

/* -------------------------------------------------------------------- scene */

function Starfield() {
  const geometry = useMemo(() => {
    const COUNT = 700
    const positions = new Float32Array(COUNT * 3)
    let seed = 20260806 >>> 0
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < COUNT; i++) {
      const y = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const r = 16 + rand() * 12
      const s = Math.sqrt(Math.max(0, 1 - y * y))
      positions[i * 3] = Math.cos(a) * s * r
      positions[i * 3 + 1] = y * r
      positions[i * 3 + 2] = Math.sin(a) * s * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    return g
  }, [])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.07} color="#cfe3ef" sizeAttenuation transparent opacity={0.7} />
    </points>
  )
}

function Globe({
  base,
  karnataka,
  guide,
}: {
  base: THREE.Texture
  karnataka: THREE.Texture | null
  guide: boolean
}) {
  const spinRef = useRef<THREE.Group>(null)
  const pulseRef = useRef<THREE.MeshBasicMaterial>(null)
  const startRef = useRef<number | null>(null)
  const driftRef = useRef(0)

  useFrame(({ clock, camera }, delta) => {
    if (startRef.current === null) startRef.current = clock.getElapsedTime()
    const t = clock.getElapsedTime() - startRef.current

    // once the guide takes over, the globe becomes a slowly turning backdrop
    if (guide) driftRef.current += delta * GUIDE_DRIFT

    // ease the spin home over the first few seconds, then sway very gently
    const p = Math.min(1, t / SETTLE_SECONDS)
    const eased = 1 - Math.pow(1 - p, 3)
    const sway = p >= 1 ? Math.sin((t - SETTLE_SECONDS) * 0.32) * 0.022 : 0
    if (spinRef.current) {
      spinRef.current.rotation.y =
        START_SPIN_Y + (TARGET_SPIN_Y - START_SPIN_Y) * eased + sway + driftRef.current
    }
    camera.position.z = CAM_START + (CAM_END - CAM_START) * eased

    if (pulseRef.current) {
      pulseRef.current.opacity = 0.675 + 0.325 * Math.sin((t * Math.PI * 2) / PULSE_PERIOD)
    }
  })

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 2, 4]} intensity={1.1} color="#fff2d6" />
      <Starfield />

      <group rotation={[TILT_X, 0, 0]}>
        <group ref={spinRef}>
          <mesh>
            <sphereGeometry args={[1, 96, 64]} />
            <meshStandardMaterial map={base} roughness={1} metalness={0} />
          </mesh>
          {karnataka && (
            <mesh>
              <sphereGeometry args={[1.005, 96, 64]} />
              <meshBasicMaterial
                ref={pulseRef}
                map={karnataka}
                transparent
                depthWrite={false}
                opacity={1}
              />
            </mesh>
          )}
        </group>
      </group>

      {/* atmosphere rim */}
      <mesh>
        <sphereGeometry args={[1.07, 48, 32]} />
        <meshBasicMaterial
          color="#5fa8c8"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

/* ------------------------------------------------------------------ overlay */

export function GlobeIntro() {
  const [phase, setPhase] = useState<"globe" | "guide" | "gone">("globe")
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState(0)
  const [geo, setGeo] = useState<{ base: THREE.Texture; karnataka: THREE.Texture | null } | null>(
    null,
  )
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const grab = (url: string) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

    // a failed fetch resolves to null, which still yields a plain sand globe —
    // the intro must never block entry into the game
    Promise.all([grab("/geo/world.geo.json"), grab("/geo/india-states.geo.json")]).then(
      ([world, states]) => {
        if (cancelled) return
        setGeo({ base: buildBaseTexture(world, states), karnataka: buildKarnatakaTexture(states) })
        // both files resolved and both textures are built — including the
        // fallback path, where a failed fetch still yields a usable globe
        setReady(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      geo?.base.dispose()
      geo?.karnataka?.dispose()
    },
    [geo],
  )

  if (phase === "gone") return null

  // CHALO hands over to the guide — the globe stays on as a dimmed backdrop
  const chalo = () => setPhase("guide")

  // fade via the ref so the transition runs without a re-render, then unmount
  const begin = () => {
    if (overlayRef.current) overlayRef.current.style.opacity = "0"
    setTimeout(() => setPhase("gone"), 600)
  }

  const isLastStage = step === STAGES.length - 1

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 select-none font-sans opacity-100 transition-opacity duration-[600ms]"
      style={{ backgroundColor: BACKDROP }}
    >
      <style>{`
        @keyframes gi-rise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes gi-rise-btn {
          from { opacity: 0; transform: translateY(10px); pointer-events: none; }
          to   { opacity: 1; transform: none; pointer-events: auto; }
        }
        @keyframes gi-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes gi-dot {
          0%, 100% { opacity: 0.25; transform: scale(0.8); }
          50%      { opacity: 1;    transform: scale(1); }
        }
      `}</style>

      {/* nothing but the backdrop until the globe is genuinely ready */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2 w-2 rounded-full"
              style={{
                background: "#d97b3a",
                animation: `gi-dot 1200ms ease-in-out ${i * 160}ms infinite`,
              }}
            />
          ))}
        </div>
      )}

      {ready && geo && (
        <div
          className="absolute inset-0 transition-opacity duration-[600ms]"
          style={{ opacity: phase === "guide" ? 0.25 : 1 }}
        >
          {/* nested: a filled animation would otherwise override the dim above */}
          <div className="h-full w-full" style={{ animation: "gi-fade 600ms ease-out both" }}>
            <Canvas
              camera={{ fov: 42, position: [0, 0, CAM_START], near: 0.1, far: 100 }}
              gl={{ antialias: true }}
            >
              <Globe base={geo.base} karnataka={geo.karnataka} guide={phase === "guide"} />
            </Canvas>
          </div>
        </div>
      )}

      {/* these mount only once ready, so their delays are measured from then */}
      {ready && phase === "globe" && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 top-[11vh] flex flex-col items-center gap-2 px-6 text-center"
            style={{ animation: "gi-rise 900ms ease-out 1500ms both" }}
          >
            <div className="text-5xl font-bold tracking-wide" style={{ color: "#f7ecd8" }}>
              Namaste
            </div>
            <div
              className="text-[12px] font-medium uppercase tracking-[0.18em]"
              style={{ color: "#e0c191" }}
            >
              Welcome to Bharat Mitra — Village Courier
            </div>
          </div>

          <div
            className="absolute inset-x-0 bottom-[12vh] flex justify-center"
            style={{ animation: "gi-rise-btn 900ms ease-out 4200ms both" }}
          >
            <button
              type="button"
              onClick={chalo}
              className="rounded-full px-10 py-2.5 text-sm font-bold tracking-[0.15em] text-white shadow-lg transition-all hover:brightness-110 active:translate-y-px"
              style={{ background: "#d97b3a" }}
            >
              CHALO
            </button>
          </div>
        </>
      )}

      {ready && phase === "guide" && (
        <div
          className="absolute inset-0 flex items-center justify-center px-6"
          style={{ animation: "gi-rise 500ms ease-out both" }}
        >
          <div
            className="w-full max-w-[520px] rounded-2xl border px-7 py-6 shadow-xl backdrop-blur-sm"
            style={{
              background: "rgba(28, 19, 13, 0.88)",
              borderColor: "rgba(217, 123, 58, 0.35)",
            }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-[0.2em]"
              style={{ color: "#d97b3a" }}
            >
              Step {step + 1} of {STAGES.length}
            </div>
            <div className="mt-1.5 text-2xl font-bold tracking-wide" style={{ color: "#f7ecd8" }}>
              {STAGES[step].title}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/75">{STAGES[step].body}</p>

            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {STAGES.map((s, i) => (
                  <div
                    key={s.title}
                    className="h-2 w-2 rounded-full transition-all"
                    style={
                      i === step
                        ? { background: "#d97b3a", transform: "scale(1.15)" }
                        : {
                            background: "transparent",
                            boxShadow: "inset 0 0 0 1px rgba(224, 193, 145, 0.45)",
                          }
                    }
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="text-xs font-medium text-white/55 underline-offset-4 transition-colors hover:text-white/85 hover:underline"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (isLastStage ? begin() : setStep(step + 1))}
                  className="rounded-full px-7 py-2 text-sm font-bold tracking-[0.12em] text-white shadow-lg transition-all hover:brightness-110 active:translate-y-px"
                  style={{ background: "#d97b3a" }}
                >
                  {isLastStage ? "Let's Begin" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
