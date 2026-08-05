/**
 * lib/game/data.ts — backward-compatibility barrel
 *
 * All game content has been split into focused files under lib/game/data/.
 * This file re-exports everything from those files so that all existing
 * imports of "@/lib/game/data" continue to work without any changes.
 *
 * Do NOT add new content here.
 * Edit the appropriate file under lib/game/data/ instead.
 */

// Map / world zones
export type { Vec3, Zone } from "./data/zones"
export { ZONES } from "./data/zones"

// Characters
export type { NpcKind, Npc } from "./data/npcs"
export { NPCS } from "./data/npcs"

// Quests and dialogue
export type { QuestStep, Quest } from "./data/quests"
export { QUESTS } from "./data/quests"

// Carried items
export type { ItemId, ItemDefinition } from "./data/items"
export { ITEMS } from "./data/items"

// Emoji vocabulary
export type { EmojiName } from "./data/emojis"
export { EMOJIS } from "./data/emojis"

// Physics and player config (moved to config/ in Phase 1)
export { PHYSICS } from "./config/physics"
export { INITIAL_CHARACTER } from "./config/player"
export { WATER_LEVEL } from "./config/world"
