import * as THREE from "three"

/**
 * Procedural articulated human — the maths half. No React, no geometry, so the
 * verification harness can run forward kinematics on the exact angles the
 * renderer applies (Character.tsx) and prove the planted foot neither floats
 * nor skates.
 *
 * Proportions are stylised, not anatomical: chunky limbs and an oversized head
 * so one silhouette reads at distance in a cel-shaded world. Total height is
 * 1.8u to match PLAYER_HEIGHT, head 0.38u across ≈ 1/5 of the figure.
 *
 * Frame convention: +Z is forward (the direction the character faces), +Y up,
 * origin on the ground between the feet. Joint angles below are all
 * FORWARD-POSITIVE; the component negates where a three.js rotation.x needs
 * the opposite sign, and `legFK` uses the identical convention so the two
 * cannot drift.
 */

export const BODY = {
  height: 1.8,
  footH: 0.08,
  footLen: 0.26,
  footW: 0.14,
  shin: 0.35,
  thigh: 0.37,
  /** hip pivot height with the leg in its neutral, slightly bent stance */
  hipY: 0.76,
  hipX: 0.11,
  pelvisW: 0.3,
  pelvisH: 0.1,
  torsoY0: 0.86,
  torsoH: 0.44,
  torsoW: 0.42,
  torsoD: 0.26,
  shoulderY: 1.24,
  shoulderX: 0.24,
  upperArm: 0.27,
  foreArm: 0.25,
  neckY: 1.3,
  headR: 0.19,
  headY: 1.55,
} as const

/** neutral hip-to-ankle drop; the leg keeps a little bend here, never locked */
export const STAND = BODY.hipY - BODY.footH
const LEG_MAX = (BODY.thigh + BODY.shin) * 0.999

/**
 * Forward travel of one foot during its stance, so a step is 2x this. Pushed
 * to the longest the legs can carry (the pelvis drop below buys the reach),
 * because this game moves the player 9.2u/s: a short stride would cycle the
 * legs at ~24 steps/s. See the note in characterPose about the residual.
 */
export const STRIDE_WALK = 0.38
export const STRIDE_RUN = 0.46
/** how high the swinging foot lifts */
const SWING_LIFT = 0.13

export type Pose = {
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  shoulderL: number
  shoulderR: number
  elbowL: number
  elbowR: number
  torsoTwist: number
  torsoLean: number
  torsoRoll: number
  headPitch: number
  headYaw: number
  /** vertical offset of the whole figure (bob), world units */
  bob: number
}

export function emptyPose(): Pose {
  return {
    hipL: 0, hipR: 0, kneeL: 0, kneeR: 0,
    shoulderL: 0, shoulderR: 0, elbowL: 0, elbowR: 0,
    torsoTwist: 0, torsoLean: 0, torsoRoll: 0,
    headPitch: 0, headYaw: 0, bob: 0,
  }
}

/**
 * Two-link IK: where must hip and knee sit for the ankle to land `dz` forward
 * of and `dy` below the hip. This is what keeps the foot ON the ground rather
 * than near it — the caller passes the real ground height under that foot.
 */
export function legIK(dz: number, dy: number) {
  let d = Math.hypot(dz, dy)
  if (d > LEG_MAX) d = LEG_MAX
  if (d < 1e-4) d = 1e-4
  const { thigh, shin } = BODY
  const theta = Math.atan2(dz, dy)
  const cosA = (thigh * thigh + d * d - shin * shin) / (2 * thigh * d)
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)))
  const cosK = (thigh * thigh + shin * shin - d * d) / (2 * thigh * shin)
  const interior = Math.acos(Math.max(-1, Math.min(1, cosK)))
  return { hip: theta + a, knee: Math.PI - interior }
}

/**
 * Forward kinematics for one leg: ankle offset from the hip, given the same
 * forward-positive angles the renderer uses. `legIK` and this must invert each
 * other — the harness asserts exactly that.
 */
export function legFK(hip: number, knee: number) {
  const { thigh, shin } = BODY
  // thigh: (0,-thigh,0) rotated about X by -hip
  const kz = thigh * Math.sin(hip)
  const ky = -thigh * Math.cos(hip)
  // shin continues, rotated by -(hip - knee): a positive knee folds the shin
  // backward relative to the thigh
  const s = hip - knee
  return { z: kz + shin * Math.sin(s), y: ky - shin * Math.cos(s) }
}

/**
 * Where a foot will be, forward of the root, at this phase — known from the
 * gait alone, before any IK. The caller samples the ground THERE, so the
 * planted foot meets the slope it is actually over rather than the one it was
 * over last frame (that lag measured 0.146u of float on steep ground).
 */
export function footPlanZ(phase: number, gait: number, side: "L" | "R") {
  const walkW = Math.min(1, gait)
  const runW = Math.max(0, Math.min(1, gait - 1))
  const stride = STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * runW
  return footTarget(side === "L" ? phase : phase + 0.5, stride).z * walkW
}

/** foot trajectory for one leg at gait phase p in [0,1) */
function footTarget(p: number, stride: number) {
  const q = ((p % 1) + 1) % 1
  if (q < 0.5) {
    // stance: the foot is planted; it travels backward under the body at
    // exactly the rate the body advances, which is what kills foot skating
    const k = q / 0.5
    return { z: stride * (1 - 2 * k), lift: 0 }
  }
  const k = (q - 0.5) / 0.5
  return { z: stride * (2 * k - 1), lift: Math.sin(Math.PI * k) * SWING_LIFT }
}

export type PoseInput = {
  /** 0 = standing, 1 = walking, 2 = running (fractional values blend) */
  gait: number
  /** gait cycle position, advanced from DISTANCE travelled, not from time */
  phase: number
  /** seconds, for breathing and sway */
  time: number
  /** 0 = grounded, 1 = airborne */
  air: number
  /** upward velocity while airborne, for tuck vs extend */
  rising: number
  /** 0..1, one arm steadies the bag */
  carry: number
  /** ground height under each foot, relative to the root (metres, + = higher) */
  groundL?: number
  groundR?: number
}

/**
 * The whole pose in one pass. Idle, walk and run are one continuous blend
 * (gait 0..2) rather than three clips, so there is nothing to snap between;
 * jump and carry ride on top as modifiers.
 */
export function characterPose(inp: PoseInput, out: Pose = emptyPose()): Pose {
  const walkW = Math.min(1, inp.gait)
  const runW = Math.max(0, Math.min(1, inp.gait - 1))
  const stride = STRIDE_WALK + (STRIDE_RUN - STRIDE_WALK) * runW
  const armSwing = (0.55 + 0.45 * runW) * walkW
  const t = inp.time

  // ---- body height FIRST: the legs solve against it, so whatever the torso
  // does vertically (breathing, gait bob, a run's crouch) the planted foot
  // stays exactly on the ground instead of riding up and down with it
  const breath = Math.sin(t * 1.6) * 0.012 * (1 - walkW)
  const hipDrop = 0.02 * walkW + 0.03 * runW
  out.bob = breath - hipDrop + Math.cos(inp.phase * Math.PI * 4) * 0.018 * walkW

  // ---- legs: IK to a real ground contact, so no float and no skate
  const fL = footTarget(inp.phase, stride)
  const fR = footTarget(inp.phase + 0.5, stride)
  const zL = fL.z * walkW
  const zR = fR.z * walkW
  let dyL = STAND + out.bob - fL.lift * walkW - (inp.groundL ?? 0)
  let dyR = STAND + out.bob - fR.lift * walkW - (inp.groundR ?? 0)
  // PELVIS DROP. A neutral stance already sits at 94% of leg extension, so a
  // long stride or a foot over lower ground puts the IK target out of reach —
  // the solver clamps, the foot stops tracking, and that reads as skating and
  // floating (measured 0.28u slip / 0.16u float before this). Lower the whole
  // figure by whatever the worst leg is short by; the foot then lands exactly
  // where it should, and the body squats as a real body does astride a slope.
  const reachDrop = (dz: number, dy: number) => {
    const az = Math.abs(dz)
    if (az >= LEG_MAX) return dy // hopeless; the clamp below handles it
    const maxDy = Math.sqrt(LEG_MAX * LEG_MAX - dz * dz)
    return Math.max(0, dy - maxDy)
  }
  const drop = Math.max(reachDrop(zL, dyL), reachDrop(zR, dyR))
  if (drop > 0) {
    out.bob -= drop
    dyL -= drop
    dyR -= drop
  }
  const legL = legIK(zL, dyL)
  const legR = legIK(zR, dyR)
  out.hipL = legL.hip
  out.kneeL = legL.knee
  out.hipR = legR.hip
  out.kneeR = legR.knee

  // ---- arms swing opposite the legs
  const swing = Math.sin(inp.phase * Math.PI * 2)
  const idleSway = Math.sin(t * 1.1) * 0.04
  out.shoulderL = -swing * armSwing + idleSway
  out.shoulderR = swing * armSwing - idleSway
  // elbows stay bent; a run folds them much harder
  const elbowBase = 0.25 + 0.7 * runW * walkW
  out.elbowL = elbowBase + Math.max(0, -swing) * 0.35 * armSwing
  out.elbowR = elbowBase + Math.max(0, swing) * 0.35 * armSwing

  // ---- torso: counter-rotates against the legs, leans into a run
  out.torsoTwist = -swing * 0.16 * walkW
  out.torsoLean = 0.06 + 0.3 * runW * walkW
  out.torsoRoll = Math.cos(inp.phase * Math.PI * 2) * 0.05 * walkW

  // ---- head stays level: it counters the torso rather than riding it
  out.headPitch = -out.torsoLean * 0.8
  out.headYaw = -out.torsoTwist * 0.6 + Math.sin(t * 0.5) * 0.05 * (1 - walkW)

  // ---- jump: tuck going up, reach for the ground coming down
  if (inp.air > 0) {
    const tuck = inp.rising > 0 ? 1 : 0
    const a = inp.air
    const tuckHip = tuck ? 0.9 : 0.25
    const tuckKnee = tuck ? 1.4 : 0.35
    out.hipL += (tuckHip - out.hipL) * a
    out.hipR += (tuckHip * 0.7 - out.hipR) * a
    out.kneeL += (tuckKnee - out.kneeL) * a
    out.kneeR += (tuckKnee * 0.8 - out.kneeR) * a
    out.shoulderL += (-1.1 - out.shoulderL) * a
    out.shoulderR += (-1.1 - out.shoulderR) * a
    out.elbowL += (0.6 - out.elbowL) * a
    out.elbowR += (0.6 - out.elbowR) * a
    out.torsoLean += (0.18 - out.torsoLean) * a
    out.bob *= 1 - a
  }

  // ---- carry: the left arm comes up and steadies the bag strap
  if (inp.carry > 0) {
    const c = inp.carry
    out.shoulderL += (-0.75 - out.shoulderL) * c
    out.elbowL += (1.5 - out.elbowL) * c
  }
  return out
}

/** world-space ankle height above the character root, for verification */
export function ankleHeight(pose: Pose, side: "L" | "R") {
  const hip = side === "L" ? pose.hipL : pose.hipR
  const knee = side === "L" ? pose.kneeL : pose.kneeR
  return BODY.hipY + pose.bob + legFK(hip, knee).y
}

const _fkV = new THREE.Vector3()

/** world-space ankle offset (forward, up) from the root, for verification */
export function ankleOffset(pose: Pose, side: "L" | "R") {
  const hip = side === "L" ? pose.hipL : pose.hipR
  const knee = side === "L" ? pose.kneeL : pose.kneeR
  const fk = legFK(hip, knee)
  return _fkV.set(
    side === "L" ? -BODY.hipX : BODY.hipX,
    BODY.hipY + pose.bob + fk.y,
    fk.z,
  )
}
