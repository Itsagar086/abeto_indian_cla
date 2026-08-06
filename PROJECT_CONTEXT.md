# PROJECT_CONTEXT.md

Complete technical context for **Dak Wala — Village Courier**, an original 3D
delivery-courier game on a tiny round planet modelled after an Indian small town.

This document is written so a new AI assistant can work on the codebase without
opening the source files. All values, function names, and paths below are actual,
verified against the source and against numerical simulation of the terrain
functions (not estimated).

- **Repo root:** `d:\claude_abeto_indian_version\dak-wala-courier-game\abeto_project`
- **Current branch:** `day1/critical-bug-fixes` (main branch is `main`)
- **Stack:** Next.js 16.3.0 (App Router, Turbopack) · React 19 · TypeScript 5.7.3 ·
  three 0.185.1 · @react-three/fiber 9.7.0 · @react-three/drei 10.7.7 ·
  zustand 5.0.14 · Tailwind CSS 4.3.3
- **Dev server:** `npm run dev` → http://localhost:3000
- **Doc generated:** 2026-08-06

---

## 1. Complete folder structure

Every file in the repository (excluding `node_modules/`, `.next/`).
Line counts are actual file lengths.

```
abeto_project/
├── AGENTS.md                        (auto-generated agent guidance, re-written by `next dev`)
├── CLAUDE.md                        (1 line: `@AGENTS.md` — imports AGENTS.md)
├── PROJECT_CONTEXT.md               (this file)
├── README.md                        34 lines
├── .gitignore
├── components.json                  21 lines   (shadcn config)
├── next-env.d.ts                     6 lines   (Next.js ambient types, do not edit)
├── next.config.mjs                  11 lines
├── package.json                     43 lines
├── package-lock.json                          (npm lockfile)
├── postcss.config.mjs                8 lines
├── tsconfig.json                    33 lines
├── tsconfig.tsbuildinfo                       (UNTRACKED build cache — should be gitignored)
│
├── app/
│   ├── globals.css                 163 lines
│   ├── layout.tsx                   49 lines
│   └── page.tsx                     23 lines
│
├── components/
│   ├── game/
│   │   ├── HUD.tsx                  81 lines
│   │   ├── NpcLayer.tsx            100 lines
│   │   ├── Player.tsx              217 lines
│   │   ├── PropsLayer.tsx          210 lines
│   │   └── Scene.tsx                61 lines
│   └── ui/
│       └── button.tsx               58 lines   (UNUSED — nothing imports it)
│
├── lib/
│   ├── game/
│   │   ├── data.ts                 533 lines   ← single source of truth, imports nothing
│   │   ├── props.ts                135 lines
│   │   ├── store.ts                146 lines
│   │   └── terrain.ts              338 lines
│   └── utils.ts                      6 lines   (only consumer is button.tsx)
│
└── public/
    ├── apple-icon.png
    ├── icon-dark-32x32.png
    ├── icon-light-32x32.png
    ├── icon.svg
    ├── placeholder-logo.png
    ├── placeholder-logo.svg
    ├── placeholder-user.jpg
    ├── placeholder.jpg
    └── placeholder.svg
```

> There is **no** `hooks/` directory, no test suite, no ESLint config file, and no
> CI configuration, despite `package.json` declaring a `lint` script (`eslint .`)
> and `components.json` declaring a `@/hooks` alias.

---

## 2. What each file does — one line each

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout: HTML shell, `Metadata` (title "Dak Wala — Village Courier"), favicon set, `Viewport` light/dark, mounts `<Analytics/>` only when `NODE_ENV === 'production'`. |
| `app/page.tsx` | The only route: full-viewport `<Canvas shadows camera={{fov:55,near:0.1,far:300}}>` wrapping `<Scene/>` in `<Suspense>`, with `<HUD/>` overlaid. |
| `app/globals.css` | Tailwind 4 + `tw-animate-css` + `shadcn/tailwind.css` imports, full oklch light/dark design-token set, `@layer base` resets. Game visuals use none of these tokens. |
| `components/game/Scene.tsx` | Assembles the 3D world: sky colour `#bfe0ee`, fog, hemisphere + shadow-casting directional light, `<Planet/>`, `<Water/>`, `<PropsLayer/>`, `<NpcLayer/>`, `<Player/>`. |
| `components/game/Player.tsx` | Player character: keyboard input, spherical-gravity movement, analytic ground collision, third-person camera, nearest-NPC proximity detection, `E`-key interaction dispatcher, and the courier body mesh. |
| `components/game/NpcLayer.tsx` | Renders all 20 NPCs, snaps each to the terrain surface, orients them to the surface normal, draws three body variants (dog / peacock / humanoid) plus a `<Html>` nameplate, quest `!` marker, and "Press E" hint. |
| `components/game/PropsLayer.tsx` | Calls `buildProps()` once and renders each `PlacedProp` via a `switch` on `p.kind` into hand-built three.js primitive groups (11 prop types). |
| `components/game/HUD.tsx` | 2D DOM overlay: title card, active-quest tracker, completed counter, controls legend, dialogue box, "Press E to talk" prompt, and the coloured quest toast with a 3200 ms auto-dismiss. |
| `components/ui/button.tsx` | shadcn/base-ui `Button` with `cva` variants — **dead code, imported nowhere.** |
| `lib/game/data.ts` | All static content and tuning: `Vec3`, `Zone`/`ZONES`, `Npc`/`NPCS`, `Quest`/`QuestStep`/`QUESTS`, `EMOJIS`, `PHYSICS`, `INITIAL_CHARACTER`, `WATER_LEVEL`. Imports nothing. |
| `lib/game/terrain.ts` | Procedural round-world terrain: value noise/fBm, RBF anchor interpolation, road arcs, `terrainRadius()`, vertex colouring, planet geometry builder, and placement helpers. |
| `lib/game/props.ts` | `buildProps()` — deterministic per-zone placement of the 11 decorative prop kinds, with palettes and the underwater-cull guard. |
| `lib/game/store.ts` | Zustand store: quest progress, carried parcel, dialogue and toast state, `interact()` / `advanceDialogue()`, plus the `useNpcHasQuest()` selector hook. |
| `lib/utils.ts` | `cn()` — `twMerge(clsx(...))` class-name helper. |
| `next.config.mjs` | `typescript.ignoreBuildErrors: true` and `images.unoptimized: true`. |
| `tsconfig.json` | `strict: true`, `noEmit`, `moduleResolution: "bundler"`, path alias `@/* → ./*`. |
| `components.json` | shadcn config: style `base-nova`, rsc true, aliases for components/utils/ui/lib/hooks, lucide icons. |
| `postcss.config.mjs` | Single plugin: `@tailwindcss/postcss`. |
| `README.md` | Human-facing intro, run instructions, control list, and a short structure summary. |
| `AGENTS.md` / `CLAUDE.md` | Agent instructions injected by `next dev`; tells agents to read `node_modules/next/dist/docs/` before writing Next.js code. |

---

## 3. Key data types and interfaces in `lib/game/data.ts`

`data.ts` is the dependency root — it imports nothing and everything else depends on it.

```ts
export type Vec3 = [number, number, number]

export type Zone = {
  id: string        // stable key, e.g. "bazaar"
  text: string      // display name, e.g. "Sarafa Bazaar"
  center: Vec3      // world-space point; DIRECTION is used, magnitude is an anchor radius
  radius: number    // 5.5 .. 18 — see BUG-102, this is NOT in the same unit as it is used
}

export type NpcKind =
  | "clerk" | "worker" | "engineer" | "flowerseller" | "grandmother"
  | "mechanic" | "manager" | "kid" | "boatman" | "priest"
  | "musician" | "sadhu" | "chaiwala" | "dog" | "peacock"
// 15 kinds. NpcLayer only branches on "dog" and "peacock"; the other 13 all
// render the identical humanoid mesh. The field is otherwise decorative.

export type Npc = {
  id: string            // referenced by QuestStep.id
  name: string          // shown on the nameplate and in dialogue
  color: string         // hex — used as the HEAD/skin colour
  kind: NpcKind
  outfit: string        // hex — body capsule colour
  hair: string          // hex — hair cap colour
  position: Vec3        // authored world position; doubles as a terrain anchor
  texts: string[]       // idle barks; one is chosen at random when no quest applies
  talkDistance?: number // DEAD FIELD — never read anywhere (BUG-105)
}

export type QuestStep = {
  id: string        // the NPC id that this step must be delivered to
  texts: string[]   // dialogue lines, advanced one per E press
  extraData: {
    uiTitle: string        // toast heading, e.g. "Package Received"
    uiIcon: string         // DEAD FIELD — stored in the toast, never rendered (BUG-107)
    uiText: string         // toast body / objective text
    uiColor: string        // toast background+border hex
    receiveModel?: string  // sets `carrying` to this string on step completion
  }
}

export type Quest = {
  id: string
  description: string  // shown in the HUD quest tracker
  steps: QuestStep[]   // executed strictly in array order
}
```

Also exported: `EMOJIS` (a 10-entry `as const` string tuple — **entirely unused**),
`PHYSICS`, `INITIAL_CHARACTER`, `WATER_LEVEL`.

---

## 4. How the game store works — `lib/game/store.ts`

A single zustand store created with `create<GameState>((set, get) => ({...}))`,
exported as **`useGameStore`**. There is no persistence, no middleware, and no
devtools — refreshing the page resets all progress.

### State shape

```ts
type GameState = {
  npcQuestIndex: Record<string, { questId: string; stepIndex: number } | "done">
  activeQuestId: string | null
  carrying: string | null          // e.g. "letter" | "toolkit" | "sweets" | ...
  dialogue: { npcId, npcName, lines: string[], lineIndex: number } | null
  toast:    { title, icon, text, color } | null
  nearbyNpcId: string | null
  completedQuests: string[]
  setNearbyNpc(id: string | null): void
  interact(npcId: string): void
  advanceDialogue(): void
  closeToast(): void
}
```

Initial values: `npcQuestIndex: {}`, `activeQuestId: null`, `carrying: null`,
`dialogue: null`, `toast: null`, `nearbyNpcId: null`, `completedQuests: []`.

> **Naming trap:** the inline comment calls `npcQuestIndex` "which quest / step each
> npc is currently offering", but it is keyed by **`quest.id`**, not by NPC id.
> Read it as `questProgress`.

### `findStepForNpc(npcId, npcQuestIndex, carrying)` — module-private

The core resolver. Iterates `QUESTS` **in array order** and returns the first match:

1. Skip the quest if `npcQuestIndex[quest.id] === "done"`.
2. `stepIndex = progress ? progress.stepIndex : 0` (absent ⇒ step 0, quest not started).
3. `step = quest.steps[stepIndex]`; skip if missing or `step.id !== npcId`.
4. **Carry gate:** if `stepIndex > 0`, read `prevModel = quest.steps[stepIndex-1].extraData.receiveModel`.
   If `prevModel` is set and `carrying !== prevModel`, skip this quest.
5. Return `{ quest, step, stepIndex }`, else `null` after the loop.

### `interact(npcId)`

- Returns immediately if `dialogue` is already open (prevents re-entry).
- Looks up the NPC in `NPCS`; returns if not found.
- If `findStepForNpc` matched → opens dialogue with `found.step.texts`.
- Else if `npc.texts.length > 0` → opens dialogue with **one randomly chosen** idle bark.
- Else → nothing happens (silent NPCs: `mill-worker-c`, `street-dog`, `peacock`).

### `advanceDialogue()`

- No-op if `dialogue` is null.
- If `lineIndex < lines.length - 1` → increment `lineIndex` and return.
- Otherwise the dialogue has ended, so it re-runs `findStepForNpc` to resolve the step:
  - `isLast = stepIndex === quest.steps.length - 1`
  - `npcQuestIndex[quest.id] = isLast ? "done" : { questId, stepIndex: stepIndex + 1 }`
  - `carrying = step.extraData.receiveModel ?? (isLast ? null : carrying)`
  - `activeQuestId = isLast ? null : quest.id`
  - `completedQuests` gains `quest.id` when `isLast`
  - `toast` is populated from `step.extraData` (title/icon/text/color)
  - `dialogue = null`
- If no step matched (a pure idle bark) → just `dialogue = null`.

### `useNpcHasQuest(npcId)` — exported hook

`useGameStore(s => !!findStepForNpc(npcId, s.npcQuestIndex, s.carrying))`.
Drives the amber `!` badge above an NPC's head in `NpcLayer`. Because it calls
`findStepForNpc` inside the selector, it re-evaluates on **every** store change.

---

## 5. How terrain generation works — `lib/game/terrain.ts`

The planet is an **analytic heightfield in spherical coordinates**: for any unit
direction there is a closed-form surface radius. Nothing raycasts; the player
controller evaluates the same function the mesh was built from, so collision is exact.

### 5.1 Noise stack

- `hash3(x, y, z)` — integer hash → `[0, 1)`.
- `smooth(t)` — `t*t*(3-2*t)` smoothstep.
- `valueNoise(x, y, z)` — trilinear-interpolated `hash3` over the 8 lattice corners, remapped to `[-1, 1]`.
- `fbm(x, y, z, octaves = 4)` — amplitude ×0.5 and frequency ×2.07 per octave, normalised by total amplitude.

### 5.2 Anchors — `makeAnchors()`

Radial-basis anchors define the large landforms. Each is `{ dir, r, w }`:

| Source | Count | Weight `w` | Radius `r` |
|---|---|---|---|
| Every entry in `NPCS` (`n.position`) | 20 | `1` | `|position|` |
| Every entry in `ZONES` (`z.center`) | 9 | `1.35` | `|center|` |
| Hardcoded `oceanDirs` array | 10 | `0.85` | forced to `18.4` |

Total 39 anchors, computed once at module load into `const ANCHORS`.
The 10 ocean directions are:
`[0.2,-0.95,0.24]`, `[0.62,-0.5,0.6]`, `[-0.7,0.2,-0.68]`, `[0.86,-0.2,0.47]`,
`[-0.35,-0.75,-0.56]`, `[0.1,0.55,0.83]`, `[0.75,0.45,0.48]`, `[-0.9,0.35,-0.26]`,
`[0.3,-0.3,0.9]`, `[-0.55,-0.55,0.63]`.

Constants: `SIGMA = 0.4`, `FALLBACK_R = 18.2`, `FALLBACK_W = 0.09`.

### 5.3 Roads — `buildRoads()` / `roadDistance(dir)`

11 great-circle arcs between zone pairs, each `{ a, b, n, width }` where `n = a × b`:

```
bazaar–beach 0.9 · beach–temple 0.7 · bazaar–samadhi 0.85 · samadhi–ghat 0.8
ghat–grove 0.8 · grove–workshop 0.7 · grove–mill 0.85 · mill–ghat 0.8
haveli–bazaar 0.9 · haveli–grove 0.75 · bazaar–ghat 0.8
```

`roadDistance(dir)` returns the **normalised** distance to the nearest arc: it
projects `dir` onto each road plane, tests whether the projection lies inside the
arc segment, takes the perpendicular angle if inside or the endpoint angle if
outside, then divides by `road.width * 0.045`. Result `< 1` means "on the road".
Starts at `9` (effectively infinity).

### 5.4 `baseRadius(dir)` — Gaussian RBF interpolation

```
num = FALLBACK_R * FALLBACK_W;  den = FALLBACK_W
for each anchor:
  theta = acos(clamp(dir · anchor.dir))
  w     = anchor.w * exp(-(theta / SIGMA)^2)
  num  += w * anchor.r;  den += w
return num / den
```

The fallback term keeps the function defined on the far side of the planet.

### 5.5 `terrainRadius(dir)` — the authoritative surface function

```ts
const base   = baseRadius(dir)
const road   = roadDistance(dir)
const flat   = road < 1 ? 0.15 : road < 1.9 ? 0.15 + 0.85*((road-1)/0.9) : 1
const lumps  = fbm(x*5.1,  y*5.1,  z*5.1,  3) * 1.35
const detail = fbm(x*15.3, y*15.3, z*15.3, 3) * 0.42
const ridges = (1 - Math.abs(fbm(x*3.2+11, y*3.2+5, z*3.2+3, 2))) * 0.75
let r = base + (lumps + detail) * flat + ridges * flat * (base > 25 ? 1 : 0.35)

// beach flattening near the shoreline
if (r < WATER_LEVEL + 1.1) {
  const t = Math.max(0, (r - (WATER_LEVEL - 1.6)) / 2.7)
  r = WATER_LEVEL - 1.6 + t*t*2.7
}
return r
```

`flat` suppresses noise to 15 % along roads, producing carved flat routes.
`ridges` is doubled on high ground (`base > 25`) to make the temple mountain craggy.
The final clamp means the **absolute minimum radius is `WATER_LEVEL - 1.6 = 19.60`**.

**Measured over 4000 evenly distributed directions:**

| Metric | Value |
|---|---|
| Minimum radius | **19.60** |
| Maximum radius | **33.37** |
| Fraction below `WATER_LEVEL` (21.2) | **25.7 %** (1026 / 4000) |
| Maximum ocean depth | 1.6 units |

`radiusAt(v)` is the convenience wrapper: `terrainRadius(v.normalize())`.

### 5.6 Colouring — `terrainColor(dir, r, target)`

Palette `C`: `deepSand #c9a876`, `sand #e0c191`, `grass #7ea34f`, `grassDark #5e8339`,
`grassLight #9cbf66`, `rock #ab8f72`, `rockDark #8a6f55`, `road #c17a4a`,
`roadEdge #d7a878`, `snowless #c9b48f`.

Branching:
1. `r < WATER_LEVEL + 0.55` → `deepSand` below water, `sand` above.
2. `slope > 0.62 || r > 33.2` → `rock`, or `rockDark` when `slope > 0.8`; lerp toward `snowless` above 34.4.
3. Otherwise grass, shaded by `fbm(...*9.3, 2)` toward `grassLight`/`grassDark`, plus a sand fringe below `WATER_LEVEL + 1.5`.
4. Road overlay when `road < 1.5 && r > WATER_LEVEL + 0.3` — 0.92 lerp to `road` on the arc, feathered `roadEdge` outside.
5. A final `offsetHSL(0, 0, grain)` with `grain = fbm(...*42, 2) * 0.05`.

`slopeAt(dir, r)` samples `terrainRadius` at two tangent-offset directions
(`eps = 0.012`), forms the gradient magnitude, scales by `0.9` and clamps to 1.
It is exported but has no external consumer.

### 5.7 `buildPlanetGeometry(detail = 52)`

Creates `THREE.IcosahedronGeometry(1, detail)`, then for each vertex normalises the
position, evaluates `terrainRadius`, writes back `dir * r`, and fills a `Float32Array`
colour attribute via `terrainColor`. Finishes with `computeVertexNormals()`.
**`Scene.tsx` calls it with `detail = 64`**, which yields 40 962 vertices — each
requiring a full 39-anchor RBF evaluation plus several fBm calls, so first paint is
the dominant startup cost.

### 5.8 Placement helpers

| Export | Behaviour | Used by |
|---|---|---|
| `surfacePoint(dir, offset = 0)` | `dir * (terrainRadius(dir) + offset)` | `props.ts` |
| `rng(seed)` | LCG `s = (s*1664525 + 1013904223) >>> 0`, returns `s / 2^32` | `props.ts` |
| `randomDirInCap(center, maxAngle, rand)` | Uniform direction in an angular cap, using `tan(d)` for correct spacing | **nothing — dead code** |
| `surfaceQuaternion(dir, spin)` | Rotates `+Y` onto `dir`, then spins about local Y | `props.ts`, `NpcLayer.tsx` |

> Note `randomDirInCap` uses `Math.tan(d)` for the tangent offset — the mathematically
> correct form. `props.ts` does **not** use this helper and offsets linearly instead,
> which is the root of BUG-102.

---

## 6. How props are placed — `lib/game/props.ts`

### Types

```ts
export type PropKind =
  | "stall" | "haveli-arch" | "temple-dome" | "mill-block" | "ghat-steps"
  | "mango-tree" | "workshop-shed" | "market-umbrella" | "peepal-tree"
  | "lamp-post" | "flag"

export type PlacedProp = {
  kind: PropKind
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
  colorA: string
  colorB: string
  seed: number
}
```

### Palette

`PALETTE: Record<string, [string, string][]>` keyed by zone id. `bazaar` has four
options (`#d97b3a/#f2d9a8`, `#c25959/#f2e6d0`, `#3f7f8c/#f2e6d0`, `#9c6ea0/#f2e6d0`);
every other zone has exactly one pair. `paletteFor(zoneId, r)` falls back to
`PALETTE.bazaar` for unknown ids and indexes with `Math.floor(r() * len) % len`.

### `buildProps(): PlacedProp[]`

The internal `add(kind, zoneId, angleOffset, distFrac, scale, seed)` closure:

```ts
const zone = byId.get(zoneId); if (!zone) return
const center  = new THREE.Vector3(...zone.center).normalize()
const tangent = Math.abs(center.y) > 0.9 ? (1,0,0) : (0,1,0)
const t1 = tangent × center   (normalised)
const t2 = center  × t1       (normalised)
const dist = distFrac * zone.radius * 0.045          // ← see BUG-102
const dir  = (center + t1*cos(ang)*dist + t2*sin(ang)*dist).normalize()
const pos  = surfacePoint(dir, 0)
const quat = surfaceQuaternion(dir, ang + Math.PI)
const [a, b] = paletteFor(zoneId, rng(seed))
if (pos.length() < WATER_LEVEL + 0.3) return          // ← underwater cull guard
props.push({ kind, position: pos, quaternion: quat, scale, colorA: a, colorB: b, seed })
```

Placement is fully deterministic — the same props appear on every load.

### The authored placement calls

| Zone | Calls | Seeds |
|---|---|---|
| bazaar | 10 × `stall` at `ang = i/10*2π`, `distFrac 1.6`; 10 × `market-umbrella` at `ang+0.15`, `1.9`; 2 × `lamp-post` (0.4/0.6, 2.4/0.6); 1 × `flag` (1.0/0.3) | 100–109, 200–209, 150, 151, 152 |
| haveli | 1 × `haveli-arch` (0/0.9, scale 1.6); 2 × `lamp-post` (±0.6/1.3); 1 × `flag` (0/1.7, scale 1.2) | 300–303 |
| mill | 6 × `mill-block` at angles `[0, 0.5, 1.0, 1.6, 2.2, 2.8]`, `distFrac 1.3 + (i%2)*0.3`, scale 1.3 | 400–405 |
| workshop | 1 × `workshop-shed` (0/0.6, scale 1.2); 1 × `lamp-post` (1.4/1.2) | 500, 501 |
| temple | 1 × `temple-dome` (0/0.2, scale 1.8); 2 × `flag` (±0.9/0.9, scale 1.3) | 600–602 |
| ghat | 6 × `ghat-steps` at `i/6*2π`, `distFrac 1.2` | 700–705 |
| grove | 16 × `mango-tree`, `rng(42)` drives angle, `distFrac 0.3 + r*1.6`, scale `0.8 + r*0.5` | 800–815 |
| samadhi | 5 × `peepal-tree` at `i/5*2π`, `distFrac 1.3`, scale 1.4 | 900–904 |
| beach | 6 × `mango-tree`, `rng(77)` drives angle and `distFrac 0.5 + r*1.3`, scale 0.6 | 1000–1005 |

**71 props are authored. 57 actually render. 14 are silently discarded by the guard.**

Verified cull tally (simulated against the real `terrainRadius`):

| Zone | Kept | Culled |
|---|---:|---:|
| bazaar | 23 | 0 |
| beach | 5 | 1 |
| **ghat** | **2** | **4** |
| **grove** | **9** | **7** |
| haveli | 4 | 0 |
| **mill** | **4** | **2** |
| samadhi | 5 | 0 |
| temple | 3 | 0 |
| workshop | 2 | 0 |
| **TOTAL** | **57** | **14** |

Rendered counts by kind: `stall 10`, `market-umbrella 10`, `mango-tree 14` (of 22),
`lamp-post 5`, `peepal-tree 5`, `mill-block 4` (of 6), `flag 4`, `ghat-steps 2` (of 6),
`haveli-arch 1`, `temple-dome 1`, `workshop-shed 1`.

---

## 7. How the player controller works — `components/game/Player.tsx`

Module constants (note these **shadow** the `PHYSICS` block rather than reading it):
`MOVE_SPEED = 0.11`, `TURN_SPEED = 2.6`, `TALK_DISTANCE = 2.4`.

### Refs (no React state — nothing here triggers re-render)

`groupRef` (outer transform), `bodyRef` (bob/lean), `position` (init from
`INITIAL_CHARACTER.position` = `[-10, 36, 14]`, `|p| = 39.90`), `velocity`,
`forward` (init `(1,0,0)`), `grounded`, `camPos`, `stepPhase`.

Store subscriptions are deliberately minimal — only `setNearbyNpc` and `carrying`.

### `useKeys()`

Registers `keydown`/`keyup` on `window`, storing `e.key.toLowerCase()` into a ref map.
**There is no `blur`/`visibilitychange` reset**, so a key held while the tab loses
focus stays latched (BUG-110).

### Spawn orientation effect

Projects a reference axis onto the tangent plane at the spawn point so `forward`
starts tangent to the sphere. Uses `(1,0,0)` when `|up.y| > 0.9`, else `(0,1,0)`.

### Interact-key effect

Registered **once** with `[]` deps. Reads live state through
`useGameStore.getState()` to avoid a stale closure. Priority order on `E`:

1. `toast` open → `closeToast()` and return.
2. `dialogue` open → `advanceDialogue()` and return.
3. `nearbyNpcId` set → `interact(nearbyNpcId)`.

### `useFrame((_, rawDelta))` — the whole simulation

1. `delta = min(rawDelta, 1/30)`; `dt60 = delta * 60` (frame-rate-normalised).
2. `talking = !!useGameStore.getState().dialogue`.
3. `up = position.normalize()`; re-orthogonalise `forward` against `up` (keeps it tangent as the player walks over curvature); fall back to `(1,0,0)` if degenerate.
4. **Turning** (skipped while talking): `A`/`ArrowLeft` = +1, `D`/`ArrowRight` = −1; rotate `forward` about `up` by `turnAmount * TURN_SPEED * delta`.
5. **Movement:** `W`/`ArrowUp` = +1, `S`/`ArrowDown` = −1; `speed = MOVE_SPEED * (shift ? PHYSICS.sprintSpeed : 1)` = 0.11 or 0.1485.
6. Split velocity into radial and tangential; `tangent.lerp(forward * moveInput * speed, moveInput !== 0 ? 0.3 : 0.4)` — note the **larger** lerp when idle, so stopping is snappier than starting.
7. **Gravity/jump:** `newRadial += PHYSICS.gravity * dt60`; if `Space` and `grounded`, `newRadial = PHYSICS.jumpForce` and clear `grounded`.
8. Recompose velocity, integrate `position += velocity * dt60`.
9. **Ground collision:** `groundR = terrainRadius(position.normalize())`; if `|position| <= groundR`, snap to `dir * groundR`, set `grounded = true`, and strip the radial velocity component. Else `grounded = false`. There is no step-up, no slope limit, and no horizontal collision of any kind — props and NPCs are pure decoration.
10. **Orientation:** builds a basis `makeBasis(right, up, fwd)` and `slerp`s the group quaternion toward it at `0.25`.
11. **Walk bob:** `stepPhase += delta * (sprint ? 16 : 10)` while moving and grounded; drives `bodyRef.position.y = |sin| * 0.06` and `bodyRef.rotation.z = sin * 0.05`.
12. **Camera:** desired = `position + (-forward * 5) + (up * (1 + 1.4))`, i.e. 5 behind and 2.4 above; `camPos.lerp(desired, talking ? 0.12 : 0.09)`; sets `camera.up = up` and `lookAt(position + up*0.9)`. `relativeCameraPosition[0]` (0) and `relativeCameraOffset` are never applied.
13. **Proximity:** linear scan over all 20 NPCs measuring `npcVecs[i].distanceTo(position)`, then `setNearbyNpc(nearestDist < TALK_DISTANCE ? nearestId : null)`. `npcVecs` is memoised from the **raw authored `n.position`** — this is BUG-101.

### Mesh

A `<group>` containing: legs (`cylinderGeometry [0.13,0.13,0.7,8]`, `#2b2723`),
kurta (`capsuleGeometry [0.25,0.55,4,8]`, `#3f7f5c`), head (`sphere 0.22`, `#caa06e`),
hair (half-sphere 0.23, `#241f19`), satchel (`box [0.28,0.32,0.16]`, `#8a4a2c`), and a
conditional parcel box (`[0.22,0.2,0.22]`, `#e0a53a`) at `y = 1.95` when `carrying` is truthy.

---

## 8. How NPCs are rendered and snapped — `components/game/NpcLayer.tsx`

`NpcLayer` memoises `NPCS` and maps each to `<NpcFigure key={n.id} npc={n}/>`.

### The snap (added by commit `971edae`, "fix(BUG-003)")

```ts
const pos = new THREE.Vector3(...npc.position)
const dir = pos.clone().normalize()
pos.copy(dir.multiplyScalar(terrainRadius(dir)))   // ← discard authored magnitude
const up   = pos.clone().normalize()
const quat = surfaceQuaternion(up, 0)
```

Only the **direction** of `npc.position` survives; the radius is replaced by the
terrain height. Before this commit NPCs floated above or sank into the ground,
because the RBF smoothing (σ = 0.4) blends each NPC anchor with its neighbours and
therefore does **not** reproduce `|npc.position|` exactly.

Measured snap deltas (`terrainRadius(dir) − |npc.position|`), all 20 NPCs:

| NPC | \|pos\| | terrainR | delta |
|---|---:|---:|---:|
| raju-clerk | 28.01 | 28.06 | +0.05 |
| manager-verma | 28.02 | 28.24 | +0.22 |
| chai-wala | 28.05 | 28.17 | +0.11 |
| mechanic-gopal | 23.75 | 23.48 | −0.27 |
| boss-verma-senior | 25.79 | 26.53 | +0.74 |
| flower-radha | 28.05 | 28.28 | +0.23 |
| kid-chintu | 22.93 | 22.92 | −0.01 |
| **coder-priya** | 35.62 | 29.78 | **−5.85** |
| mill-worker-a | 24.33 | 25.81 | +1.48 |
| mill-worker-b | 26.02 | 26.52 | +0.50 |
| engineer-iyer | 22.39 | 23.33 | +0.94 |
| mill-worker-c | 22.35 | 22.88 | +0.53 |
| **sadhu-wanderer** | 22.52 | 25.78 | **+3.26** |
| engineer-rao | 26.87 | 28.41 | +1.54 |
| boatman-deva | 25.77 | 24.81 | −0.97 |
| priest-baba | 33.41 | 31.44 | −1.97 |
| **amma** | 31.21 | 28.08 | **−3.13** |
| musician-iqbal | 22.25 | 21.48 | −0.77 |
| street-dog | 24.20 | 22.48 | −1.72 |
| **peacock** | 26.10 | 23.09 | **−3.01** |

Any `|delta| > TALK_DISTANCE (2.4)` makes that NPC **impossible to interact with**,
because `Player.tsx` measures distance to the authored point while the player walks
on the snapped surface. That is 4 NPCs: `coder-priya`, `sadhu-wanderer`, `amma`,
`peacock`. See BUG-101 — **`amma` breaks an entire quest.**

### Body variants

- **dog** (`street-dog`): capsule `[0.14,0.3,4,8]` in `outfit`, head sphere 0.12 in `hair`.
- **peacock**: capsule `[0.13,0.35,4,8]` in `outfit`, cone `[0.35,0.6,10]` tail rotated `x: 0.6` in `hair`.
- **everything else** (all 13 remaining kinds): legs cylinder `[0.13,0.13,0.7,8]` `#3a3630`, body capsule `[0.24,0.5,4,8]` in `outfit`, head sphere 0.22 in `color`, hair half-sphere 0.23 in `hair`.

### Nameplate

A `<Html position={[0, isDog||isPeacock ? 0.6 : 1.95, 0]} center distanceFactor={9} occlude={false}>`
containing the name chip, the amber `!` badge when `useNpcHasQuest(npc.id)` is true,
and a "Press E" chip when `nearbyNpcId === npc.id`. Because `occlude={false}`,
nameplates render **through terrain** — NPCs on the far side of the planet are visible
as floating labels.

Nothing in `NpcFigure` is memoised: `terrainRadius` (a 39-anchor RBF + several fBm
evaluations) runs for every NPC on every re-render, and the store subscriptions mean
a re-render happens on each dialogue/toast/proximity change.

---

## 9. The quest system, end to end

### The five quests

| # | `id` | `description` | Step chain (NPC → `receiveModel`) |
|---|---|---|---|
| 1 | `quest-invoice` | The Missing Invoice | `raju-clerk` (—) → `boss-verma-senior` (`letter`) → `raju-clerk` (—) |
| 2 | `quest-spare-parts` | Gopal's Spare Parts | `mechanic-gopal` (`toolkit`) → `flower-radha` (`sweets`) → `mechanic-gopal` (—) |
| 3 | `quest-pump` | The Water Pump Mix-Up | `mill-worker-a` (—) → `engineer-rao` (`crate`) → `engineer-iyer` (—) |
| 4 | `quest-offering` | An Offering for the Temple | `amma` (`offering`) → `priest-baba` (—) |
| 5 | `quest-diary` | The River-Found Diary | `boatman-deva` (`notebook`) → `musician-iqbal` (—) |

13 steps total. Toast colours: `#c25959` (invoice), `#f3c258` (spare-parts),
`#66bde6` (pump), `#8cc48c` (offering), `#de794e` (diary).

### The full runtime loop

1. **Frame** — `Player.useFrame` scans all NPCs, calls `setNearbyNpc(id | null)` based on `TALK_DISTANCE = 2.4`.
2. **Indicator** — `NpcFigure` calls `useNpcHasQuest(id)`; if `findStepForNpc` returns non-null the amber `!` appears. `HUD` shows "Press E to talk" when `nearbyNpcId && !dialogue`.
3. **Press E** — the once-registered handler in `Player.tsx` reads fresh state: toast → dismiss; dialogue → advance; else → `interact(nearbyNpcId)`.
4. **`interact`** — resolves a quest step via `findStepForNpc` (respecting the carry gate); opens `dialogue` with either `step.texts` or one random `npc.texts` entry.
5. **Render** — `HUD` shows `dialogue.lines[dialogue.lineIndex]` under `dialogue.npcName`.
6. **Press E repeatedly** — `advanceDialogue` walks `lineIndex` to the end.
7. **Resolution** — on the final line, `advanceDialogue` re-resolves the step and commits: advance/complete `npcQuestIndex[quest.id]`, set `carrying` from `receiveModel`, set `activeQuestId`, push to `completedQuests` when last, and raise the toast.
8. **Toast** — `HUD` renders it with `background: ${color}dd`; auto-dismissed after 3200 ms by a `useEffect` timer, or immediately by pressing `E`.
9. **Tracker** — `HUD` looks up `QUESTS.find(q => q.id === activeQuestId)` for the "Delivery in progress" card, and shows `completedQuests.length / QUESTS.length`.

### The carry gate — the mechanism that makes deliveries meaningful

A step with `stepIndex > 0` is only offered when `carrying` equals the previous step's
`receiveModel`. This is what forces the player to physically travel between NPCs.
Because `carrying` is a **single global slot**, running two quests concurrently
overwrites it — see BUG-103, which is a permanent soft-lock.

---

## 10. Recently fixed, and what is still broken

### Fixed — committed

| Commit | Change |
|---|---|
| `14aa79f` | Initial working Indian Messenger Abeto prototype. |
| `971edae` | **BUG-003** — NPCs floated above / sank into the terrain. `NpcLayer.tsx` now discards the authored radius and re-projects each NPC onto `terrainRadius(dir)`. 3 insertions, 1 deletion. **Note: this fix is incomplete — see BUG-101.** |

### Fixed — uncommitted working-tree changes

| File | Change |
|---|---|
| `components/game/Player.tsx` | **Stale-closure fix on the interact key.** The `E` handler used to be re-registered whenever `dialogue`/`toast`/`interact`/`advanceDialogue`/`closeToast` changed, and captured stale values. It is now registered once with `[]` deps and pulls live state from `useGameStore.getState()`. Removed 5 now-unneeded store subscriptions, which also stops `Player` re-rendering on every dialogue change. |
| `lib/game/props.ts` | **Underwater prop guard.** Added `WATER_LEVEL` to the existing `./data` import and inserted `if (pos.length() < WATER_LEVEL + 0.3) return` immediately before `props.push(...)`, so props whose computed position sits below the waterline are skipped instead of rendering as dark shapes under the ocean shell. |

### Also repaired this session (no diff remains)

`components/game/HUD.tsx` line 1 contained three stray characters — `wdw"use client"` —
which broke the Turbopack parse with `Expected ';', '}' or <eof>`. Removed; the file
now matches its committed state exactly.

### Still broken

Summarised in §12. The headline items are **BUG-101** (4 NPCs unreachable, one of
which kills `quest-offering` outright), **BUG-102** (props scatter tens of degrees
away from their zone), and **BUG-103** (concurrent quests soft-lock via the single
`carrying` slot).

---

## 11. Imports and dependencies between files

### Internal module graph

```
lib/game/data.ts            ← imports NOTHING (dependency root)
      ↑
      ├── lib/game/terrain.ts    imports three; { NPCS, ZONES, WATER_LEVEL, type Vec3 } from ./data
      │        ↑
      │        └── lib/game/props.ts   imports three; { ZONES, WATER_LEVEL } from ./data
      │                                          ; { surfacePoint, surfaceQuaternion, rng } from ./terrain
      │
      └── lib/game/store.ts      imports zustand(create); { NPCS, QUESTS, type Quest, type QuestStep } from ./data

app/layout.tsx      → @vercel/analytics/next, next (Metadata, Viewport types), ./globals.css
app/page.tsx        → react (Suspense), @react-three/fiber (Canvas),
                      @/components/game/Scene, @/components/game/HUD
  └── Scene.tsx     → react (useMemo), three,
                      @/lib/game/terrain (buildPlanetGeometry), @/lib/game/data (WATER_LEVEL),
                      ./Player, ./NpcLayer, ./PropsLayer
        ├── Player.tsx    → react (useRef,useEffect,useMemo), @react-three/fiber (useFrame,useThree), three,
        │                   @/lib/game/data (NPCS, PHYSICS, INITIAL_CHARACTER),
        │                   @/lib/game/terrain (terrainRadius), @/lib/game/store (useGameStore)
        ├── NpcLayer.tsx  → react (useMemo), three, @react-three/drei (Html),
        │                   @/lib/game/data (NPCS, type Npc),
        │                   @/lib/game/terrain (surfaceQuaternion, terrainRadius),
        │                   @/lib/game/store (useGameStore, useNpcHasQuest)
        └── PropsLayer.tsx→ react (useMemo), three, @/lib/game/props (buildProps, type PlacedProp)
  └── HUD.tsx       → react (useEffect), @/lib/game/store (useGameStore), @/lib/game/data (QUESTS)

lib/utils.ts        → clsx, tailwind-merge
components/ui/button.tsx → @base-ui/react/button, class-variance-authority, @/lib/utils
                           (nothing imports button.tsx — dead branch)
```

The graph is acyclic and strictly layered: `data → terrain → props → PropsLayer`, and
`data → store → {HUD, NpcLayer, Player}`. `"use client"` is present on
`app/page.tsx`, `Scene.tsx`, `Player.tsx`, `NpcLayer.tsx`, `PropsLayer.tsx`, `HUD.tsx`.
`app/layout.tsx` is the only server component.

### Package dependencies (`package.json`)

**dependencies:** `@base-ui/react ^1.5.0`, `@react-three/drei ^10.7.7`,
`@react-three/fiber ^9.7.0`, `@vercel/analytics 1.6.1`,
`class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `lucide-react ^1.16.0`,
`next 16.3.0`, `react ^19`, `react-dom ^19`, `shadcn ^4.8.0`,
`tailwind-merge ^3.3.1`, `three ^0.185.1`, `tw-animate-css ^1.4.0`, `zustand ^5.0.14`.

**devDependencies:** `@tailwindcss/postcss ^4.3.3`, `@types/node ^24`,
`@types/react ^19`, `@types/react-dom ^19`, `@types/three ^0.185.3`,
`postcss ^8.5`, `tailwindcss ^4.3.3`, `typescript 5.7.3`.

**pnpm.overrides:** `hono 4.12.25`.

`lucide-react` is installed but never imported. Scripts: `dev`, `build`, `start`, `lint`.

---

## 12. Current known bugs and their status

Severity: **P0** breaks content · **P1** clearly wrong behaviour · **P2** dead code / polish.

| ID | Sev | Bug | Status |
|---|---|---|---|
| **BUG-003** | P1 | NPCs floated above / sank into terrain. | **FIXED** in `971edae` (visual only — see BUG-101). |
| **BUG-101** | **P0** | `Player.tsx` measures proximity against raw `npc.position` (`npcVecs`) while `NpcLayer.tsx` renders NPCs snapped to `terrainRadius`. Where the snap delta exceeds `TALK_DISTANCE = 2.4`, the NPC can never be talked to: `coder-priya` (5.85), `sadhu-wanderer` (3.26), `amma` (3.13), `peacock` (3.01). **`amma` is step 1 of `quest-offering`, so that quest can never be started.** This is a regression introduced by the BUG-003 fix — before it, render and hit-test used the same point. | **OPEN.** Fix: snap `npcVecs` the same way, or export one shared `npcSurfacePosition(npc)` helper used by both files. |
| **BUG-102** | **P0** | In `props.ts`, `dist = distFrac * zone.radius * 0.045` multiplies an angular offset by `zone.radius`, which is in world units (5.5–18). Large zones fling their props across the planet: a `mill-block` at `distFrac 1.3` lands **46.5° / ~16 world units** from the mill centre; `distFrac 1.6` lands **52.3°**; `grove` reaches **48°**. Props do not appear in the zone they belong to. Offsets are also applied linearly rather than via `tan()`, unlike the correct `randomDirInCap` helper. | **OPEN.** Root cause of most of BUG-104. |
| **BUG-103** | **P0** | `carrying` is a single global slot. Accepting a parcel from quest B while carrying quest A's parcel overwrites it, and A's `stepIndex` has already advanced past the giver — so A's carry gate can never be satisfied again. Example: take the `letter` from `boss-verma-senior`, then talk to `mechanic-gopal` (`carrying = "toolkit"`) — `quest-invoice` is permanently unfinishable. | **OPEN.** Fix: make `carrying` a set/array, or refuse a new parcel while one is held. |
| **BUG-104** | P1 | 14 of 71 props are silently discarded by the new water guard (`ghat` 4/6, `grove` 7/16, `mill` 2/6, `beach` 1/6). The guard skips rather than relocating, so the ghat renders only 2 of its 6 stepped terraces. | **OPEN by design** — the guard is the intended Day-1 fix; the real defect is BUG-102 + BUG-106 putting props underwater in the first place. |
| **BUG-105** | P1 | `Npc.talkDistance` is never read. Defined as `2.2` on `boss-verma-senior` and `boatman-deva`; `Player.tsx` uses the hardcoded `TALK_DISTANCE = 2.4` for everyone. | **OPEN.** |
| **BUG-106** | P1 | The `ghat` zone ("Ganga Ghat") is **entirely submerged**: `terrainRadius` at its centre is **20.00**, below `WATER_LEVEL = 21.2`. A whole named location is underwater, and 4 of its 6 props are culled. | **OPEN.** Needs the zone centre lifted or the anchor radius raised. |
| **BUG-107** | P2 | `QuestStep.extraData.uiIcon` (values `house`, `clerk`, `flowerseller`, `workshop`, `rao`, `iyer`, `temple`, `musician`, `complete`) is stored in the toast state but never rendered by `HUD.tsx`. | **OPEN.** |
| **BUG-108** | P1 | 25.7 % of the planet surface lies below `WATER_LEVEL`, and the player walks on it normally — there is no swim, drown, or slow-down handling, and the camera passes through the translucent water shell. Max ocean depth is only 1.6 units (terrain min radius 19.60 vs water 21.2). | **OPEN.** |
| **BUG-109** | P2 | `PHYSICS.positionForce`, `.damp`, `.dampIdle`, `.capsuleRadius`, `.floorDetectInclination` are never referenced. `Player.tsx` uses only `jumpForce`, `gravity`, `sprintSpeed` and hardcodes its own `MOVE_SPEED`/`TURN_SPEED`. | **OPEN.** |
| **BUG-110** | P1 | `useKeys()` never clears on `blur`/`visibilitychange`, so a key held while the tab loses focus stays latched and the player keeps walking. | **OPEN.** |
| **BUG-111** | P2 | `findStepForNpc` returns the **first** matching quest in `QUESTS` order. If two quests ever need the same NPC at their current step, the later one is unreachable until the earlier advances. No collision exists today — latent. | **OPEN (latent).** |
| **BUG-112** | P2 | `mill-worker-c` (Ganesh), `street-dog` (Sheru), and `peacock` all have `texts: []` and no quest role, so pressing `E` on them does nothing at all — no dialogue, no feedback. | **OPEN.** |
| **BUG-113** | P2 | `<Html occlude={false}>` in `NpcLayer` means nameplates render through the planet; NPCs on the far side appear as floating labels in the sky. | **OPEN.** |
| **BUG-114** | P2 | Pressing `E` while a toast is visible dismisses the toast instead of advancing dialogue, so a fast player loses one keypress after every step resolution. | **OPEN.** |
| **BUG-115** | P2 | `next.config.mjs` sets `typescript.ignoreBuildErrors: true` — type errors never fail `next build`. (`npx tsc --noEmit` currently passes clean.) | **OPEN.** |
| **BUG-116** | P2 | Per-frame allocation churn in `Player.useFrame`: multiple `.clone()`, `new THREE.Quaternion`, `new THREE.Matrix4`, `new THREE.Vector3` every frame. Same for `NpcFigure`, which re-runs `terrainRadius` (39-anchor RBF) per NPC per render with no memoisation. | **OPEN.** |
| **BUG-117** | P2 | Dead exports and files: `EMOJIS` (data.ts), `randomDirInCap` and the `slopeAt` re-export (terrain.ts), `INITIAL_CHARACTER.relativeCameraOffset`, `components/ui/button.tsx`, and the `lucide-react` dependency. | **OPEN.** |
| **BUG-118** | P2 | `tsconfig.tsbuildinfo` is untracked and not in `.gitignore`, so it shows up in every `git status`. | **OPEN.** |
| **BUG-119** | P2 | Store state is in-memory only — a page refresh wipes all quest progress. No persistence middleware. | **OPEN (by design?).** |

---

## 13. `WATER_LEVEL`, `ZONES`, `NPCS`, `QUESTS`, `PHYSICS` — contents and usage

### `WATER_LEVEL = 21.2`

A single number: the radius of the ocean sphere.

- `Scene.tsx` — `new THREE.IcosahedronGeometry(WATER_LEVEL, 5)` renders the sea as a translucent sphere (`#3f7fa8`, `opacity 0.82`, `roughness 0.2`, `metalness 0.1`).
- `terrain.ts` — shoreline flattening (`r < WATER_LEVEL + 1.1`, floor at `WATER_LEVEL − 1.6 = 19.60`); sand/deep-sand colouring (`+0.55`); beach fringe lerp (`+1.5`); road suppression below `+0.3`.
- `props.ts` — the cull guard `pos.length() < WATER_LEVEL + 0.3`.

The `+0.3` threshold is duplicated as a literal in both `terrain.ts:256` and
`props.ts:79`; there is no shared constant.

### `ZONES` — 9 entries

| `id` | `text` | `center` | `radius` | terrainR at centre |
|---|---|---|---:|---:|
| `bazaar` | Sarafa Bazaar | `[25.2, 11.0, 2.3]` | 9 | 28.17 |
| `mill` | Ashoka Textile Mill | `[-7.8, 4.2, -29.3]` | 18 | 27.08 |
| `ghat` | Ganga Ghat | `[8.1, -13.8, -12.4]` | 10 | **20.00 (underwater)** |
| `haveli` | Rajwada Haveli | `[-14.4, -6.1, 27.0]` | 9 | 27.97 |
| `grove` | Amba Mango Grove | `[-8.8, -19.2, 2.5]` | 13 | 22.95 |
| `samadhi` | Peepal Tree Ground | `[27.7, -14.2, 13.4]` | 8 | 27.89 |
| `workshop` | Gopal's Workshop | `[-21.7, -6.8, 6.3]` | 5.5 | 23.33 |
| `temple` | Hilltop Shiva Temple | `[-10.2, 34.8, -3.8]` | 8 | 31.01 |
| `beach` | Nadi Kinara | `[-13.1, 15.6, -1.8]` | 8 | 24.41 |

Used by: `terrain.ts` (`makeAnchors` at weight 1.35, and `buildRoads` for the 11 road
arcs) and `props.ts` (`byId` lookup — direction, `radius`, and `PALETTE` key).
`Zone.text` is **never rendered anywhere** — there is no location banner in the HUD.

### `NPCS` — 20 entries

Quest-critical (8): `raju-clerk` (Raju), `boss-verma-senior` (Seth Rajwada),
`mechanic-gopal` (Gopal the Mechanic), `flower-radha` (Radha the Flower Seller),
`mill-worker-a` (Mill Worker), `engineer-rao` (Dr. Rao), `engineer-iyer` (Dr. Iyer),
`amma` (Amma), `priest-baba` (Baba Someshwar), `boatman-deva` (Deva the Boatman),
`musician-iqbal` (Ustad Iqbal). *(11 NPC slots across 13 steps — `raju-clerk` and
`mechanic-gopal` each appear twice.)*

Flavour-only (9): `manager-verma`, `chai-wala` (Bansi), `kid-chintu` (Chintu),
`coder-priya` (Priya — the four-line three.js aside), `mill-worker-b` (Suresh),
`mill-worker-c` (Ganesh, silent), `sadhu-wanderer` (The Wanderer),
`street-dog` (Sheru, silent), `peacock` (silent).

Used by: `terrain.ts` (`makeAnchors` — every NPC position is a weight-1 terrain
anchor, so **moving an NPC deforms the ground**), `NpcLayer.tsx` (rendering),
`Player.tsx` (`npcVecs` proximity scan), `store.ts` (name lookup and idle barks).

### `QUESTS` — 5 quests, 13 steps

Full chains listed in §9. Used by `store.ts` (`findStepForNpc` iterates it) and
`HUD.tsx` (active-quest lookup and the `/ QUESTS.length` completion counter).

### `PHYSICS`

```ts
export const PHYSICS = {
  jumpForce: 0.145,              // USED — radial velocity on Space
  positionForce: 0.0055,         // UNUSED
  gravity: -0.0102,              // USED — added to radial velocity per dt60
  damp: 0.91,                    // UNUSED
  dampIdle: 0.62,                // UNUSED
  sprintSpeed: 1.35,             // USED — multiplies MOVE_SPEED under Shift
  capsuleRadius: 0.2,            // UNUSED (no capsule collision exists)
  floorDetectInclination: 0.7,   // UNUSED (no slope limit exists)
}
```

Only 3 of 8 fields are live; `Player.tsx` supplies its own `MOVE_SPEED = 0.11`,
`TURN_SPEED = 2.6`, and `TALK_DISTANCE = 2.4` as module constants instead.

### `INITIAL_CHARACTER`

```ts
{
  position: [-10, 36, 14],              // |p| = 39.90; terrain there = 30.93,
                                        // so the player falls 8.97 units at spawn
  relativeCameraPosition: [0, 1, 5],    // only [1] and [2] are read
  relativeCameraOffset: [-0.65, 0, 1],  // UNUSED
}
```

Spawn is directly above the temple mountain, north-west face.

---

## Quick orientation for a new assistant

- **Change content?** → `lib/game/data.ts`. Be aware that editing any `NPCS[i].position` or `ZONES[i].center` **reshapes the terrain**, because both feed `makeAnchors()`.
- **Change the world shape?** → `terrainRadius()` in `lib/game/terrain.ts`. It is the single source of truth for both the mesh and player collision.
- **Change decoration?** → `buildProps()` in `lib/game/props.ts` for placement, `PropInstance` in `PropsLayer.tsx` for geometry.
- **Change game rules?** → `findStepForNpc` / `advanceDialogue` in `lib/game/store.ts`.
- **Change feel?** → the module constants at the top of `Player.tsx` (not `PHYSICS`, which is mostly inert).
- **Verify a terrain claim numerically** — compile `lib/game/{data,terrain,props}.ts` plus a driver with `npx tsc --module esnext --target es2020 --moduleResolution bundler`, add `{"type":"module"}` beside the output, append `.js` to the emitted relative import specifiers, and run it with `node`. That is how every measured figure in this document was produced.
