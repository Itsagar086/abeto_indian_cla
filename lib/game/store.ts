/**
 * lib/game/store.ts — backward-compatibility barrel
 *
 * All state logic has moved to lib/game/state/store.ts.
 *
 * This file re-exports everything so that all existing imports of
 * "@/lib/game/store" continue to work without any changes.
 *
 * Do NOT add new code here. Edit lib/game/state/store.ts instead.
 */

export { useGameStore, useNpcHasQuest } from "./state/store"
