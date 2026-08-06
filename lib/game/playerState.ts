import * as THREE from "three"
import { INITIAL_CHARACTER } from "./data"

/**
 * The player's live transform, written once per frame by <Player/> and read by
 * DOM overlays that sit outside the R3F tree (the minimap).
 *
 * Deliberately a plain mutable singleton — no React, no zustand — so a
 * per-frame write can never schedule a re-render.
 */
export const playerState = {
  position: new THREE.Vector3(...INITIAL_CHARACTER.position),
  forward: new THREE.Vector3(1, 0, 0),
}
