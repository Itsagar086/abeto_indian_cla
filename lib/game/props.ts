/**
 * lib/game/props.ts — backward-compatibility barrel
 *
 * All props logic has moved to lib/game/world/props.ts.
 *
 * This file re-exports everything so that all existing imports of
 * "@/lib/game/props" continue to work without any changes.
 *
 * Do NOT add new code here. Edit lib/game/world/props.ts instead.
 */

export type { PropKind, PlacedProp } from "./world/props"
export { buildProps } from "./world/props"
