/**
 * NPC interaction system.
 *
 * Pure function: given a list of NPC world positions and the player's
 * current position, returns the nearest NPC and whether it is within
 * interaction range.
 *
 * No state, no Zustand, no THREE rendering. Input in → result out.
 */

import * as THREE from "three"
import { TALK_DISTANCE } from "../config/player"
import type { Npc } from "../data/npcs"

/** Result returned by findNearestNpc. */
export type NpcProximity = {
  /** ID of the nearest NPC, regardless of distance. */
  nearestId: string
  /** Distance in world units from player to nearest NPC. */
  distance: number
  /** True if the nearest NPC is within interaction range (TALK_DISTANCE). */
  inRange: boolean
}

/**
 * Finds the nearest NPC to the player's current position.
 *
 * @param npcVecs       - pre-computed world positions of each NPC (same order as `npcs`)
 * @param npcs          - the NPC data array (used for ids)
 * @param playerPos     - the player's current world-space position
 * @returns NpcProximity, or null if no NPCs exist
 */
export function findNearestNpc(
  npcVecs: THREE.Vector3[],
  npcs: Npc[],
  playerPos: THREE.Vector3,
): NpcProximity | null {
  if (npcs.length === 0) return null

  let nearestId = npcs[0].id
  let nearestDist = Infinity

  for (let i = 0; i < npcs.length; i++) {
    const d = npcVecs[i].distanceTo(playerPos)
    if (d < nearestDist) {
      nearestDist = d
      nearestId = npcs[i].id
    }
  }

  return {
    nearestId,
    distance: nearestDist,
    inRange: nearestDist < TALK_DISTANCE,
  }
}
