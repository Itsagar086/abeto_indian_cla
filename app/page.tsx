"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { Scene } from "@/components/game/Scene"
import { HUD } from "@/components/game/HUD"
import { GlobeIntro } from "@/components/game/GlobeIntro"
import { Minimap } from "@/components/game/Minimap"

export default function Page() {
  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-black">
      <Canvas
        shadows
        camera={{ fov: 55, near: 0.1, far: 300 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <HUD />
      <Minimap />
      <GlobeIntro />
    </main>
  )
}
