/**
 * Delivery validation system.
 *
 * Documents the delivery gating rule: a quest step that requires the player
 * to carry an item can only be triggered when the player is holding that item.
 *
 * The actual gating logic lives inside findStepForNpc (systems/quests.ts),
 * which checks `carrying !== prevModel` before allowing a step to proceed.
 *
 * This file provides the named type and a helper for other systems that need
 * to reason about delivery state independently.
 */

import type { QuestStep } from "../data/quests"

/**
 * Returns true if the player is eligible to trigger the given quest step.
 *
 * For step 0: always eligible (no carrying requirement on the first step).
 * For step N (N > 0): eligible only when the player is carrying the item
 * specified by `receiveModel` on step N-1.
 *
 * @param step          - the quest step to evaluate
 * @param stepIndex     - the index of the step within its quest
 * @param prevStep      - the previous step in the quest (undefined if stepIndex === 0)
 * @param carrying      - the model id the player is currently carrying, or null
 */
export function isDeliveryEligible(
  step: QuestStep,
  stepIndex: number,
  prevStep: QuestStep | undefined,
  carrying: string | null,
): boolean {
  if (stepIndex === 0) return true
  const required = prevStep?.extraData.receiveModel
  if (!required) return true
  return carrying === required
}
