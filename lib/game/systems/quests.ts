/**
 * Quest step resolution system.
 *
 * Pure function: given the current game state (which NPC, what has been
 * completed, what is being carried), returns the quest step that NPC
 * should currently offer — or null if none.
 *
 * No state, no Zustand, no THREE. Input in → result out.
 */

import { QUESTS } from "../data/quests"
import type { Quest, QuestStep } from "../data/quests"

/** Shape returned when a quest step is found for an NPC. */
export type StepMatch = {
  quest: Quest
  step: QuestStep
  stepIndex: number
}

/**
 * Returns the next quest step (if any) that `npcId` should offer right now,
 * given the player's current progress and what they are carrying.
 *
 * Steps are gated:
 *   - Step 0: always available (if this NPC starts the quest)
 *   - Step N (N > 0): only available when the player is carrying the item
 *     specified by `receiveModel` on step N-1
 *
 * @param npcId          - the NPC being interacted with
 * @param npcQuestIndex  - current progress record from the game store
 * @param carrying       - item model id the player is currently carrying, or null
 */
export function findStepForNpc(
  npcId: string,
  npcQuestIndex: Record<string, { questId: string; stepIndex: number } | "done">,
  carrying: string | null,
): StepMatch | null {
  for (const quest of QUESTS) {
    const progress = npcQuestIndex[quest.id]
    if (progress === "done") continue

    const stepIndex = progress ? progress.stepIndex : 0
    const step = quest.steps[stepIndex]

    // This NPC is not the one required at this step
    if (!step || step.id !== npcId) continue

    // Gate: player must be carrying the item from the previous step
    if (stepIndex > 0) {
      const prevModel = quest.steps[stepIndex - 1].extraData.receiveModel
      if (prevModel && carrying !== prevModel) continue
    }

    return { quest, step, stepIndex }
  }

  return null
}
