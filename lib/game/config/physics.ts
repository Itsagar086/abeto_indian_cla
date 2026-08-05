/**
 * Physics configuration for the player character.
 *
 * Edit these values to change how the game feels (jump height, gravity,
 * movement damping, sprint speed, etc.) without touching any logic files.
 */
export const PHYSICS = {
  jumpForce: 0.145,
  positionForce: 0.0055,
  gravity: -0.0102,
  damp: 0.91,
  dampIdle: 0.62,
  sprintSpeed: 1.35,
  capsuleRadius: 0.2,
  floorDetectInclination: 0.7,
}
