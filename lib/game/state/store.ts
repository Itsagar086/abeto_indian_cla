/**
 * Game state store.
 *
 * Owns all runtime state via Zustand and connects the game systems
 * (quest resolution, delivery gating) to the UI layer.
 *
 * Public API (used by components):
 *   - useGameStore  — Zustand hook for reactive state
 *   - useNpcHasQuest(npcId) — derived selector: does this NPC have a quest step to offer?
 *
 * This is the only file in the project that uses Zustand.
 */

import { create } from "zustand"
import { NPCS } from "../data/npcs"
import { findStepForNpc } from "../systems/quests"

type DialogueState = {
  npcId: string
  npcName: string
  lines: string[]
  lineIndex: number
} | null

type ToastState = {
  title: string
  icon: string
  text: string
  color: string
} | null

type GameState = {
  /* progress: which quest / step each npc is currently offering */
  npcQuestIndex: Record<string, { questId: string; stepIndex: number } | "done">
  activeQuestId: string | null
  carrying: string | null // model id currently being carried

  dialogue: DialogueState
  toast: ToastState

  nearbyNpcId: string | null
  setNearbyNpc: (id: string | null) => void

  interact: (npcId: string) => void
  advanceDialogue: () => void
  closeToast: () => void

  completedQuests: string[]
}

export const useGameStore = create<GameState>((set, get) => ({
  npcQuestIndex: {},
  activeQuestId: null,
  carrying: null,
  dialogue: null,
  toast: null,
  nearbyNpcId: null,
  completedQuests: [],

  setNearbyNpc: (id) => set({ nearbyNpcId: id }),

  interact: (npcId) => {
    const { npcQuestIndex, carrying, dialogue } = get()
    if (dialogue) return // already talking

    const found = findStepForNpc(npcId, npcQuestIndex, carrying)
    const npc = NPCS.find((n) => n.id === npcId)
    if (!npc) return

    if (found) {
      set({
        dialogue: {
          npcId,
          npcName: npc.name,
          lines: found.step.texts,
          lineIndex: 0,
        },
      })
    } else if (npc.texts.length > 0) {
      set({
        dialogue: {
          npcId,
          npcName: npc.name,
          lines: [npc.texts[Math.floor(Math.random() * npc.texts.length)]],
          lineIndex: 0,
        },
      })
    }
  },

  advanceDialogue: () => {
    const { dialogue, npcQuestIndex, carrying } = get()
    if (!dialogue) return

    if (dialogue.lineIndex < dialogue.lines.length - 1) {
      set({ dialogue: { ...dialogue, lineIndex: dialogue.lineIndex + 1 } })
      return
    }

    // dialogue finished — resolve any quest step tied to this npc
    const found = findStepForNpc(dialogue.npcId, npcQuestIndex, carrying)
    if (found) {
      const { quest, step, stepIndex } = found
      const isLast = stepIndex === quest.steps.length - 1
      const nextIndex: GameState["npcQuestIndex"] = {
        ...npcQuestIndex,
        [quest.id]: isLast ? "done" : { questId: quest.id, stepIndex: stepIndex + 1 },
      }
      set({
        npcQuestIndex: nextIndex,
        dialogue: null,
        carrying: step.extraData.receiveModel ?? (isLast ? null : carrying),
        activeQuestId: isLast ? null : quest.id,
        completedQuests: isLast
          ? [...get().completedQuests, quest.id]
          : get().completedQuests,
        toast: {
          title: step.extraData.uiTitle,
          icon: step.extraData.uiIcon,
          text: step.extraData.uiText,
          color: step.extraData.uiColor,
        },
      })
    } else {
      set({ dialogue: null })
    }
  },

  closeToast: () => set({ toast: null }),
}))

/** The quest step an NPC would offer right now — used to render the (!) indicator. */
export function useNpcHasQuest(npcId: string) {
  return useGameStore((s) => {
    const found = findStepForNpc(npcId, s.npcQuestIndex, s.carrying)
    return !!found
  })
}
