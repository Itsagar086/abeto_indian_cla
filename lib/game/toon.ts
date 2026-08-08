import * as THREE from "three"

/**
 * Shared band map for every toon material in the game.
 *
 * A 4x1 single-channel ramp sampled with NearestFilter: the nearest sampling is
 * what turns a smooth falloff into four hard steps. Mipmaps are disabled — on a
 * texture this small they would blur the bands back into a gradient.
 */
const STEPS = new Uint8Array([90, 150, 210, 255])

export const toonGradient = new THREE.DataTexture(STEPS, STEPS.length, 1, THREE.RedFormat)
toonGradient.minFilter = THREE.NearestFilter
toonGradient.magFilter = THREE.NearestFilter
toonGradient.generateMipmaps = false
toonGradient.needsUpdate = true
