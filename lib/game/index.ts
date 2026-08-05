/**
 * lib/game/index.ts — unified public entry point
 *
 * Components and other consumers should import from "@/lib/game" or from a
 * specific sub-path (e.g. "@/lib/game/config/player") — whichever is clearest.
 *
 * Internal modules (data/, world/, systems/, state/, utilities/) should import
 * directly from each other using relative paths, NOT from this barrel.
 */

// ──── Config ────────────────────────────────────────────────────────────────
export { PHYSICS }               from "./config/physics"
export { MOVE_SPEED, TURN_SPEED, TALK_DISTANCE, INITIAL_CHARACTER } from "./config/player"
export { WATER_LEVEL, TERRAIN_DETAIL } from "./config/world"
export { TOAST_DURATION_MS }     from "./config/ui"

// ──── Data ───────────────────────────────────────────────────────────────────
export type { Vec3, Zone }       from "./data/zones"
export { ZONES }                 from "./data/zones"
export type { NpcKind, Npc }     from "./data/npcs"
export { NPCS }                  from "./data/npcs"
export type { QuestStep, Quest } from "./data/quests"
export { QUESTS }                from "./data/quests"
export type { ItemId, ItemDefinition } from "./data/items"
export { ITEMS }                 from "./data/items"
export type { EmojiName }        from "./data/emojis"
export { EMOJIS }                from "./data/emojis"

// ──── World ──────────────────────────────────────────────────────────────────
export { terrainRadius, radiusAt, terrainColor, buildPlanetGeometry, slopeAt } from "./world/terrain"
export { roadDistance }          from "./world/roads"
export type { PropKind, PlacedProp } from "./world/props"
export { buildProps }            from "./world/props"

// ──── Utilities ──────────────────────────────────────────────────────────────
export { fbm }                   from "./utilities/math"
export { surfacePoint, rng, randomDirInCap, surfaceQuaternion } from "./utilities/helpers"

// ──── Systems ────────────────────────────────────────────────────────────────
export { findStepForNpc }        from "./systems/quests"
export type { StepMatch }        from "./systems/quests"
export { findNearestNpc }        from "./systems/interaction"
export type { NpcProximity }     from "./systems/interaction"
export { isDeliveryEligible }    from "./systems/delivery"

// ──── State ──────────────────────────────────────────────────────────────────
export { useGameStore, useNpcHasQuest } from "./state/store"

// ──── Rendering config ───────────────────────────────────────────────────────
export { SKY_COLOR, FOG, WATER_MATERIAL } from "./rendering/scene"
export { HEMISPHERE_LIGHT, DIRECTIONAL_LIGHT } from "./rendering/lighting"
