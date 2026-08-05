"use client"

import { useEffect } from "react"
import { useGameStore } from "@/lib/game/store"
import { QUESTS } from "@/lib/game/data"

export function HUD() {
  const dialogue = useGameStore((s) => s.dialogue)
  const toast = useGameStore((s) => s.toast)
  const nearbyNpcId = useGameStore((s) => s.nearbyNpcId)
  const activeQuestId = useGameStore((s) => s.activeQuestId)
  const completedQuests = useGameStore((s) => s.completedQuests)
  const closeToast = useGameStore((s) => s.closeToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(closeToast, 3200)
    return () => clearTimeout(t)
  }, [toast, closeToast])

  const activeQuest = QUESTS.find((q) => q.id === activeQuestId)

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      {/* top-left: title + quest tracker */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="rounded-xl bg-black/45 px-3 py-1.5 text-white backdrop-blur-sm">
          <div className="text-sm font-bold tracking-wide">Dak Wala</div>
          <div className="text-[10px] text-white/70">village courier</div>
        </div>
        {activeQuest && (
          <div className="max-w-[220px] rounded-xl bg-black/40 px-3 py-2 text-white backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-wide text-amber-300">Delivery in progress</div>
            <div className="text-xs font-medium">{activeQuest.description}</div>
          </div>
        )}
        <div className="rounded-xl bg-black/30 px-3 py-1.5 text-white/80 backdrop-blur-sm">
          <div className="text-[10px]">
            Deliveries completed: {completedQuests.length} / {QUESTS.length}
          </div>
        </div>
      </div>

      {/* top-right: controls */}
      <div className="absolute right-4 top-4 rounded-xl bg-black/35 px-3 py-2 text-[10px] text-white/85 backdrop-blur-sm">
        <div>W / S — walk, run</div>
        <div>A / D — turn</div>
        <div>Shift — sprint</div>
        <div>Space — jump</div>
        <div>E — talk / continue</div>
      </div>

      {/* bottom-center: dialogue */}
      {dialogue && (
        <div className="absolute bottom-8 left-1/2 w-[min(92vw,480px)] -translate-x-1/2 rounded-2xl border border-white/20 bg-black/70 px-5 py-4 text-white shadow-xl backdrop-blur-sm">
          <div className="mb-1 text-xs font-bold text-amber-300">{dialogue.npcName}</div>
          <div className="text-sm leading-snug">{dialogue.lines[dialogue.lineIndex]}</div>
          <div className="mt-2 text-right text-[10px] text-white/50">press E to continue</div>
        </div>
      )}

      {/* interact prompt when near an npc, no dialogue open */}
      {!dialogue && nearbyNpcId && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-800 shadow">
          Press E to talk
        </div>
      )}

      {/* toast: quest step / delivery notifications */}
      {toast && (
        <div
          className="absolute left-1/2 top-20 w-[min(90vw,340px)] -translate-x-1/2 rounded-xl border px-4 py-3 text-white shadow-xl backdrop-blur-sm transition-all"
          style={{ background: `${toast.color}dd`, borderColor: `${toast.color}` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/85">{toast.title}</div>
          <div className="text-sm font-medium">{toast.text}</div>
        </div>
      )}
    </div>
  )
}
