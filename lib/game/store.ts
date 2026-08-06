import { create } from "zustand"
import { NPCS, QUESTS, type Quest, type QuestStep } from "./data"

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

  /** the zone the player is standing in, or null when between zones */
  currentZoneId: string | null
  setCurrentZone: (id: string | null) => void

  interact: (npcId: string) => void
  advanceDialogue: () => void
  closeToast: () => void

  completedQuests: string[]
}

/** find the next quest step (if any) this npc should offer right now */
function findStepForNpc(
  npcId: string,
  npcQuestIndex: GameState["npcQuestIndex"],
  carrying: string | null,
): { quest: Quest; step: QuestStep; stepIndex: number } | null {
  for (const quest of QUESTS) {
    const progress = npcQuestIndex[quest.id]
    if (progress === "done") continue
    const stepIndex = progress ? progress.stepIndex : 0
    const step = quest.steps[stepIndex]
    if (!step || step.id !== npcId) continue
    // gate steps that expect the player to be carrying the previous parcel
    if (stepIndex > 0) {
      const prevModel = quest.steps[stepIndex - 1].extraData.receiveModel
      if (prevModel && carrying !== prevModel) continue
    }
    return { quest, step, stepIndex }
  }
  return null
}

export const useGameStore = create<GameState>((set, get) => ({
  npcQuestIndex: {},
  activeQuestId: null,
  carrying: null,
  dialogue: null,
  toast: null,
  nearbyNpcId: null,
  completedQuests: [],
  currentZoneId: null,

  setNearbyNpc: (id) => set({ nearbyNpcId: id }),

  setCurrentZone: (id) => set({ currentZoneId: id }),

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

/** the quest step an npc would offer right now, for rendering an indicator above their head */
export function useNpcHasQuest(npcId: string) {
  return useGameStore((s) => {
    const found = findStepForNpc(npcId, s.npcQuestIndex, s.carrying)
    return !!found
  })
}
