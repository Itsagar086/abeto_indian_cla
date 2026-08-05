/**
 * Player configuration.
 *
 * Edit these values to change player movement speed, turn speed, interaction
 * range, spawn position, and camera offsets without touching any logic files.
 */

/** Base movement speed (units per frame at 60fps). */
export const MOVE_SPEED = 0.11

/** Rotation speed in radians per second. */
export const TURN_SPEED = 2.6

/** Maximum distance from an NPC at which the player can interact. */
export const TALK_DISTANCE = 2.4

/**
 * Player spawn configuration.
 * All positions are in world-space coordinates on the spherical planet.
 */
export const INITIAL_CHARACTER = {
  position: [-10, 36, 14] as [number, number, number],
  relativeCameraPosition: [0, 1, 5] as [number, number, number],
  relativeCameraOffset: [-0.65, 0, 1] as [number, number, number],
}
