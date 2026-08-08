"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { NPCS, QUESTS, ZONES } from "@/lib/game/data"
import { useGameStore } from "@/lib/game/store"
import { playerState } from "@/lib/game/playerState"

const SIZE = 150
const FPS = 10
/**
 * Angular sweep the radar covers. Tightened from PI/3 to PI/4.2 for the 1.6x
 * planet so the dial still shows a similar range in world units.
 */
const THETA_MAX = Math.PI / 4.2
const EDGE = 8
const USABLE = SIZE / 2 - EDGE
const PULSE_PERIOD = 1.2

const SURFACE = "rgba(28, 19, 13, 0.72)"
const RIM = "rgba(224, 193, 145, 0.32)"
const GRID = "rgba(224, 193, 145, 0.12)"
const ZONE_DOT = "#e0c191"
const NPC_COLOR = "#f5ead6"
const TARGET_COLOR = "#f3c258"
const PLAYER_DOT = "#d97b3a"

// scratch vectors — a draw tick allocates nothing
const _up = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _tan = new THREE.Vector3()
const _v = new THREE.Vector3()

/** reusable projection result, so project() returns without allocating */
const _proj = { theta: 0, px: 0, py: 0, ok: false }

/**
 * Bearing of a world direction relative to the player, on the tangent plane.
 * px is the component to the player's right, py the component straight ahead.
 */
function project(world: THREE.Vector3) {
  _dir.copy(world).normalize()
  const d = Math.max(-1, Math.min(1, _up.dot(_dir)))
  _proj.theta = Math.acos(d)
  _tan.copy(_dir).addScaledVector(_up, -d)
  if (_tan.lengthSq() < 1e-10) {
    _proj.ok = false // directly underfoot or antipodal
    return _proj
  }
  _tan.normalize()
  _proj.px = _tan.dot(_right)
  _proj.py = _tan.dot(_fwd)
  _proj.ok = true
  return _proj
}

/** sqrt spreads nearby targets out instead of bunching them at the centre */
function radiusFor(theta: number) {
  return Math.sqrt(Math.min(theta / THETA_MAX, 1)) * USABLE
}

/**
 * The NPC the active quest currently wants, read straight from the store
 * without subscribing: activeQuestId -> that quest's current step -> its npc.
 */
function resolveTargetId(): string | null {
  const { activeQuestId, npcQuestIndex } = useGameStore.getState()
  if (!activeQuestId) return null
  const quest = QUESTS.find((q) => q.id === activeQuestId)
  if (!quest) return null
  const progress = npcQuestIndex[quest.id]
  if (!progress || progress === "done") return null
  return quest.steps[progress.stepIndex]?.id ?? null
}

/** a ~7px standing figure: 2px head over a short body line */
function personGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  alpha: number,
) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5 * scale
  ctx.lineCap = "round"

  ctx.beginPath()
  ctx.arc(x, y - 2.6 * scale, 1 * scale, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x, y - 1.3 * scale)
  ctx.lineTo(x, y + 2.7 * scale)
  ctx.stroke()

  ctx.globalAlpha = 1
}

function draw(ctx: CanvasRenderingContext2D, vignette: CanvasGradient, time: number) {
  const R = SIZE / 2

  ctx.clearRect(0, 0, SIZE, SIZE)

  // dial
  ctx.beginPath()
  ctx.arc(R, R, R - 1, 0, Math.PI * 2)
  ctx.fillStyle = SURFACE
  ctx.fill()
  ctx.fillStyle = vignette
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = RIM
  ctx.stroke()

  // range rings at a third and two thirds of the sweep
  ctx.strokeStyle = GRID
  for (const frac of [1 / 3, 2 / 3]) {
    ctx.beginPath()
    ctx.arc(R, R, radiusFor(THETA_MAX * frac), 0, Math.PI * 2)
    ctx.stroke()
  }

  // player-local basis on the sphere: up is radial, fwd is the tangent heading
  _up.copy(playerState.position).normalize()
  _fwd.copy(playerState.forward)
  _fwd.addScaledVector(_up, -_fwd.dot(_up))
  if (_fwd.lengthSq() < 1e-8) return
  _fwd.normalize()
  _right.crossVectors(_fwd, _up).normalize()

  // zones, demoted to faint background markers
  ctx.globalAlpha = 0.25
  ctx.fillStyle = ZONE_DOT
  for (const zone of ZONES) {
    _v.set(zone.center[0], zone.center[1], zone.center[2])
    const p = project(_v)
    if (!p.ok || p.theta > THETA_MAX) continue
    const r = radiusFor(p.theta)
    ctx.beginPath()
    ctx.arc(R + p.px * r, R - p.py * r, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // villagers in range. The terrain snap in NpcLayer only changes an npc's
  // radius, never its direction, so the authored position is the right bearing.
  const targetId = resolveTargetId()
  for (const npc of NPCS) {
    if (npc.id === targetId) continue // drawn below, in gold
    _v.set(npc.position[0], npc.position[1], npc.position[2])
    const p = project(_v)
    if (!p.ok || p.theta > THETA_MAX) continue
    const r = radiusFor(p.theta)
    personGlyph(ctx, R + p.px * r, R - p.py * r, 1, NPC_COLOR, 0.9)
  }

  // the delivery target: always shown, pinned to the rim when out of range so
  // it doubles as a compass
  if (targetId) {
    const npc = NPCS.find((n) => n.id === targetId)
    if (npc) {
      _v.set(npc.position[0], npc.position[1], npc.position[2])
      const p = project(_v)
      if (p.ok) {
        const r = Math.min(radiusFor(p.theta), USABLE)
        const pulse = 0.72 + 0.28 * Math.sin((time * Math.PI * 2) / PULSE_PERIOD)
        personGlyph(ctx, R + p.px * r, R - p.py * r, 1.35, TARGET_COLOR, pulse)
      }
    }
  }

  // the player, always dead centre, always facing up the dial
  ctx.beginPath()
  ctx.moveTo(R, R - 6)
  ctx.lineTo(R - 4.5, R + 5)
  ctx.lineTo(R + 4.5, R + 5)
  ctx.closePath()
  ctx.fillStyle = PLAYER_DOT
  ctx.fill()
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // built once so the tick allocates nothing
    const R = SIZE / 2
    const vignette = ctx.createRadialGradient(R, R, USABLE * 0.55, R, R, R)
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)")
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)")

    const started = performance.now()
    const tick = () => draw(ctx, vignette, (performance.now() - started) / 1000)
    tick()
    const id = setInterval(tick, 1000 / FPS)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-30 select-none rounded-full"
      style={{ width: SIZE, height: SIZE, boxShadow: "0 2px 12px rgba(0, 0, 0, 0.45)" }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: SIZE, height: SIZE, display: "block", borderRadius: "50%" }}
      />
    </div>
  )
}
