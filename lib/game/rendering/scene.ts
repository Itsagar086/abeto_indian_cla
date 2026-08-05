/**
 * Scene visual configuration.
 *
 * Edit these values to change the sky colour, atmospheric fog, and water
 * appearance without touching any component or logic files.
 */

/** Background (sky) colour hex. */
export const SKY_COLOR = "#bfe0ee"

/** Atmospheric fog configuration. */
export const FOG = {
  color: "#cfe6ee",
  near:  60,
  far:   140,
} as const

/** Water sphere material properties. */
export const WATER_MATERIAL = {
  color:     "#3f7fa8",
  opacity:   0.82,
  roughness: 0.2,
  metalness: 0.1,
} as const
