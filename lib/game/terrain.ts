/**
 * lib/game/terrain.ts — backward-compatibility barrel
 *
 * All terrain logic has moved to:
 *   - lib/game/world/terrain.ts   (terrain height, colour, geometry)
 *   - lib/game/world/roads.ts     (road connection data and distance query)
 *   - lib/game/utilities/helpers.ts (surface placement functions)
 *
 * This file re-exports everything so that all existing imports of
 * "@/lib/game/terrain" continue to work without any changes.
 *
 * Do NOT add new code here. Edit the appropriate file in lib/game/world/
 * or lib/game/utilities/ instead.
 */

// Terrain height, colour, and geometry
export {
  terrainRadius,
  radiusAt,
  terrainColor,
  buildPlanetGeometry,
  slopeAt,
} from "./world/terrain"

// Road connections and distance query
export { roadDistance } from "./world/roads"

// Surface placement utilities
export { surfacePoint, rng, randomDirInCap, surfaceQuaternion } from "./utilities/helpers"
