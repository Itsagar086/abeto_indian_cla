/**
 * World configuration.
 *
 * Edit these values to change the visual and physical properties of the world
 * (water level, terrain generation detail) without touching any logic files.
 */

/**
 * Radius of the water sphere.
 * Terrain below this radius is considered ocean / underwater.
 */
export const WATER_LEVEL = 21.2

/**
 * Subdivision detail for planet geometry (IcosahedronGeometry detail parameter).
 * Higher values produce smoother terrain at the cost of more vertices.
 * Current value: 64 subdivisions.
 */
export const TERRAIN_DETAIL = 64
