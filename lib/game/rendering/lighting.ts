/**
 * Lighting configuration.
 *
 * Edit these values to change the hemisphere light (ambient sky/ground colour)
 * and the directional sun light (intensity, angle, shadows) without touching
 * any component or logic files.
 */

/** Hemisphere light — fills ambient sky and ground colour. */
export const HEMISPHERE_LIGHT = {
  skyColor:    "#fff3d6",
  groundColor: "#5a6a4a",
  intensity:   0.65,
} as const

/** Directional sun light. */
export const DIRECTIONAL_LIGHT = {
  position:  [40, 60, 20] as [number, number, number],
  intensity: 1.6,
  color:     "#fff2d6",
  shadow: {
    mapSize: [2048, 2048] as [number, number],
    camera: {
      left:   -40,
      right:   40,
      top:     40,
      bottom: -40,
    },
  },
} as const
