# PROJECT_CONTEXT.md

Complete technical context for **Bharat Mitra — Village Courier** (formerly
"Dak Wala"), an original 3D delivery-courier game on a tiny round planet
modelled as a mini-Bengaluru. Zone identities are governed by
[WORLD_DESIGN.md](WORLD_DESIGN.md).

This document is written so a new AI assistant can work on the codebase without
opening the source files. All values, function names, and paths below are actual,
verified against the source and against numerical simulation of the terrain and
prop functions (not estimated).

- **Repo root:** `d:\claude_abeto_indian_version\dak-wala-courier-game\abeto_project`
- **Current branch:** `day3/environment-camera` (main branch is `main`)
- **Stack:** Next.js 16.3.0 (App Router, Turbopack) · React 19 · TypeScript 5.7.3 ·
  three 0.185.1 · @react-three/fiber 9.7.0 · @react-three/drei 10.7.7 ·
  zustand 5.0.14 · Tailwind CSS 4.3.3
- **Dev server:** `npm run dev` → http://localhost:3000
- **Doc generated:** 2026-08-06 · **rewritten 2026-08-13** after the 1.6× world
  scale migration, the metro/highway/collision/civic systems, and instanced
  rendering.

---

## 1. Complete folder structure

Every file in the repository (excluding `node_modules/`, `.next/`).
Line counts are actual file lengths.

```
abeto_project/
├── AGENTS.md                        (auto-generated agent guidance, re-written by `next dev`)
├── CLAUDE.md                        (2 lines: imports AGENTS.md and WORLD_DESIGN.md)
├── PROJECT_CONTEXT.md               (this file)
├── WORLD_DESIGN.md                  (zone identity bible — mini-Bengaluru; governs all environment work)
├── README.md
├── next.config.mjs · postcss.config.mjs · tsconfig.json · components.json · package.json
│
├── app/
│   ├── globals.css                 163 lines
│   ├── layout.tsx                   49 lines
│   └── page.tsx                     27 lines
│
├── components/
│   ├── game/
│   │   ├── GlobeIntro.tsx          507 lines   (cinematic globe intro, India map, stage guide)
│   │   ├── HUD.tsx                 136 lines   (quest UI + zone-entry banner)
│   │   ├── Minimap.tsx             226 lines   (canvas radar, no React per tick)
│   │   ├── NpcLayer.tsx            156 lines
│   │   ├── Player.tsx              427 lines   (movement, collision, ride height, camera)
│   │   ├── PropsLayer.tsx        1,185 lines   (per-kind renderers, instanced fleets, corridors, trains)
│   │   └── Scene.tsx               109 lines
│   └── ui/
│       └── button.tsx               58 lines   (UNUSED — nothing imports it)
│
├── lib/
│   ├── game/
│   │   ├── data.ts                 545 lines   ← single source of truth, imports nothing
│   │   ├── playerState.ts           14 lines   (mutable singleton for DOM overlays)
│   │   ├── props.ts              3,497 lines   ← placement + metro + corridors + bridges + collision + civic
│   │   ├── signage.ts              136 lines   (bilingual canvas sign textures)
│   │   ├── store.ts                153 lines
│   │   ├── terrain.ts              572 lines   (includes METRO_LOOP since P46)
│   │   └── toon.ts                  16 lines   (shared 4×1 gradient DataTexture)
│   └── utils.ts                      6 lines
│
└── public/
    ├── geo/world.geo.json · geo/india-states.geo.json   (GlobeIntro map data)
    └── (icons, placeholder images)
```

---

## 2. What each file does — one line each

| File | Purpose |
|---|---|
| `app/page.tsx` | The only route: `<GlobeIntro/>` gate, then full-viewport `<Canvas shadows>` wrapping `<Scene/>`, with `<HUD/>` + `<Minimap/>` overlaid. |
| `components/game/GlobeIntro.tsx` | Cinematic spinning-globe start screen with India highlighted (official depiction), synchronized entrance, "Chalo" button, 5-stage guide. |
| `components/game/Scene.tsx` | Assembles the world: sky, fog, hemisphere + shadow directional light (2048² map, ±40u frustum), rotating cloud group, `<Planet/>`, `<Water/>`, layers. |
| `components/game/Player.tsx` | Movement on the sphere, prop collision (capsule vs `propCollision`), ride height (`corridorSurface`/`bridgeSurface`/`groundOrDeck`), third-person camera with ground clamp + LOS pull-in, zone-entry detection, NPC proximity, `E` dispatcher. |
| `components/game/NpcLayer.tsx` | Renders 20 NPCs standing on `groundOrDeck` (road-aware), 3 body variants, occlusion-tested DOM nameplates. |
| `components/game/PropsLayer.tsx` | Renders every `PlacedProp` (switch on kind), instanced fleets (`BridgeRails`, `MetroPillars`), corridor meshes with polygonOffset, animated `TrafficSignal`, 2 metro `Train`s. |
| `components/game/Minimap.tsx` | 150px canvas radar at 10fps from `playerState` — zones, villagers, pulsing quest target pinned to rim. |
| `components/game/HUD.tsx` | Quest tracker, dialogue box, toast, controls, zone-entry banner (reads `currentZone` from the store). |
| `lib/game/data.ts` | All static content: `ZONES` (Bengaluru names), `NPCS`, `QUESTS`, `PHYSICS`, `INITIAL_CHARACTER`, `WATER_LEVEL = 33.92`. Imports nothing. |
| `lib/game/terrain.ts` | Analytic spherical heightfield: fBm noise, 39-anchor RBF, 15 road arcs, **the metro loop spline (`METRO_LOOP`, moved here in P46 so grading and corridor share one geometry)**, `terrainRadius()`, toon colouring, planet geometry, `npcSurfacePosition`, `slopeAt`. |
| `lib/game/props.ts` | The world-building module: `buildProps()` (1,079 props), road furniture, bridges, metro network, corridor meshes, civic pads, plus the runtime queries `propCollision`, `corridorSurface`, `bridgeSurface`, `groundOrDeck`. |
| `lib/game/signage.ts` | Canvas-rendered Kannada/English sign textures for `zone-signboard`. |
| `lib/game/playerState.ts` | `{ position, forward }` mutable singleton bridging R3F → DOM (Minimap). |
| `lib/game/store.ts` | Zustand: quest progress, carrying, dialogue/toast, `nearbyNpcId`, `currentZone`, `interact()`/`advanceDialogue()`. |
| `lib/game/toon.ts` | Shared 4-step gradient map for every `meshToonMaterial`. |

---

## 3. World scale — the 1.6× migration (P22/P22b)

The planet was expanded 1.6× in every world-unit dimension. Everything below
reflects post-migration values.

- `WATER_LEVEL = 33.92` (was 21.2).
- All `ZONES[].center` and `NPCS[].position` vectors ×1.6 (they are terrain
  anchors — `makeAnchors()` uses `|v|` as the anchor radius, so magnitude matters).
- `INITIAL_CHARACTER.position = [-16, 57.6, 22.4]`, `relativeCameraPosition [0, 1.36, 6.25]`.
- `PHYSICS`: `jumpForce 0.16675`, `gravity -0.01173`, `sprintSpeed 1.4946`.
- Player: `MOVE_SPEED 0.154`, `TALK_DISTANCE 2.4` (characters did not grow).
- Terrain noise: lumps ×2.16, detail ×0.672, ridges ×1.2; `FALLBACK_R 29.12`;
  ocean anchors 29.44; shoreline constants ×1.6; `ROAD_BAND 0.0365625`.
- Angular constants deliberately NOT scaled: zone-entry radii, `distFrac × 0.03125`
  prop offsets, `RIBBON_CLEAR`, `STATION_LEAD`.

**Measured terrain (160×160 directions):** min radius **31.36**, max **53.52**,
mean **38.95**, land fraction **79.7%** (above `WATER_LEVEL`).

---

## 4. Terrain — `lib/game/terrain.ts`

Analytic heightfield: `terrainRadius(dir)` is the single source of truth for the
mesh, all placement, and all collision. 39 RBF anchors (20 NPCs w=1, 9 zones
w=1.35, 10 ocean dirs w=0.85, σ=0.4).

**Roads:** `buildRoads()` holds **15 great-circle arcs** — the original 11 plus
four added in P28 to complete the arterial loop (`samadhi-grove`,
`haveli-workshop`, `workshop-beach`, `temple-mill`, each width **1.4** so their
fully-flattened core covers the highway cross-section). `roadDistance(dir)`
normalises by `width × ROAD_BAND`.

**Road flattening (P27/P46):** `flat = road < 1 ? 0.28 : road < 2.6 ? ramp : 1`
against the painted arcs, **and** (P46) a second suppression band measured from
the metro loop itself: `loopAngle(dir) × base` in world units, fully flat
inside `LOOP_FLAT_CORE 4.4`, ramping to 1 at `LOOP_FLAT_RAMP 9`. The arcs
disagree with the drawn corridor by up to ~0.5u laterally and their flat core
never covered the surfaced width — this band does. Rock-branch colouring in
the 4.5–8u verge band fell 21.9% → 14.5% (ambient dry land is 33%).

**`METRO_LOOP` (P46, moved from props.ts):** the closed CatmullRom spline
through the 9 zone centres — tour order (`planLoop` 2-opt), great-circle
control seeding (`LOOP_CONTROL_STEP 0.12`), even resample (`LOOP_SAMPLE
0.02`), `zoneT` arc positions. Lives here because `terrainRadius` grades along
it; props.ts imports it (`buildNetwork` consumes it directly). `loopAngle(dir)`
is the coarse-then-refined nearest-sample angular distance.

**Corridor grading (P47) — the ground meets the road.** The road's height
profile is owned by terrain.ts now: `profileGrid()` builds it over the loop
samples from `naturalRadius` (the landform WITHOUT grading — envelope →
10×[smooth→clamp into ground+`ROAD_MAX_FILL 1.2`]), and the public
`terrainRadius()` blends the natural ground toward a kernel-weighted average
of that profile: fully the road bed inside `GRADE_FULL 4.4`, feathered out by
`GRADE_OUT 11` (wide, or the feather itself trips the rock colouring). The
kernel spans BOTH legs at hub convergences so the ground never jumps
allegiance. Guards, each one a measured failure: ground under the surfaced
corridor is capped at the local profile — fill AND cut, feathered off across
4.5–5.5u so cut banks rise as slopes (grass sheeted over whole carriageway
stretches before the cut case was capped), wet-crossing profile samples are
excluded from the average (they cut dry banks under the waterline), and
**water is never graded at all** (the blend once raised an earthen land
bridge across a gorge floor). Terrain-above-ride-surface probes on the
carriageway: 0 of 6,160. This ended the
permanent-embankment look: edge gap at the footpath edge max 1.44 → 0.64u
with the p90 equal to the 0.16u kerb height, rock-band colouring 10.9% (was
21.9%; ambient 33%). Exports: `loopProfileAt(t)`, `loopWorldS(t)`,
`ROAD_MAX_FILL`.

**Colouring:** rock when `slopeAt > 0.55` (dark > 0.75), snow-less caps above
55.04, painted road ribbon `road < 1.5`, sand fringes, hand-painted grain.
`slopeAt` has its own scratch vector (`_slopeV`) — sharing `_rv` with
`roadDistance` once pinned half the map at slope 1.0.

---

## 5. The metro network (P17.2 / P36 / P37)

Flagship feature. Built by `buildNetwork()` in props.ts at `buildProps()` time.

- **Zone-anchored closed spline:** `CatmullRomCurve3` (centripetal) through the
  9 zone centres in tour order (2-opt TSP from bazaar), with extra control
  points seeded along each leg's great circle so the curve hugs the arcs
  (median separation **0.000u**, max 0.455u) and only rounds the corners at
  hubs. Resampled to even arc steps; loop length **9.878 rad ≈ 395 world
  units**. **Since P46 the spline itself is terrain.ts's `METRO_LOOP`** (the
  grading follows it); `buildNetwork` destructures `{dirs, n, step, total,
  zoneT}` from it and keeps everything from the deck profile down.
- **Stations are sited along the finished curve** (not control points): the
  P17.2 slide-search (dry, prop-clear, NPC-clear; road-ribbon constraint relaxes
  first) evaluated by arc length. 9 stations, all currently pass 2.
- **Deck profile:** ground → `max(_, WATER_LEVEL)` → ±7-sample smooth →
  `+DECK_RISE 8` with `DECK_MIN_CLEAR 6.4` / `DECK_WATER +4.8` floors →
  `DECK_MAX_STEP 0.4` slope limiter (wrapped passes).
- **132 `metro-pillar`** — one per step, none skipped (nudged off villagers and
  temple sightline cones; since P46 footings may stand in water like bridge
  piers, and a last-resort nudge waives only prop clearance — 12 track
  segments used to hang unsupported, the longest bare run 13u over a gorge).
  132 `metro-track` segments, 9 `metro-station`.
- **2 articulated trains** (`Train index 0/1`), 3 coaches each, every coach
  solved at its own curve parameter (`deckPoint`), velocity-continuous
  smoothstep schedule (`buildSchedule`): dwell 3.5s, ramp 2.2s, cruise 0.14 —
  full cycle **121.9s**. Headlight on lead coach, windows dim while dwelling.
- Exports: `loopDir(t)`, `deckRadius(t)`, `deckPoint(t)`, `metroTrainState(time,
  index)`, `metroStats()`, `METRO_ZONE_IDS`, `ARTERIAL_PAIRS`.

---

## 6. The highway corridor system (P23 → P46)

Dual carriageways along all 9 metro legs, riding the **same spline** as the
viaduct (P36, owned by terrain.ts since P46), so the pillar footings sit
dead-centre in the median (max lateral offset 0.0007u).

**Cross-section (P40/P40b), half-widths from the centreline:**

```
median   0 – 0.55   (+0.20 raised; 0.7×0.7 pillar footings fit with ≥0.055u margin at any rotation)
carriageway 0.55 – 3.15  (+0.06; TWO 1.30u lanes per side)
footpath 3.15 – 3.95  (+0.16 raised)
shoulder 3.95 – (3.95 + reach)  (ADAPTIVE since P46: reach = clamp(2×drop,
                       SHOULDER_FALLOFF 1.6, SHOULDER_MAX 2.8) — a ~1:2
                       embankment sized by `shoulderReach()` from the actual
                       edge-to-ground drop; smoothstep to natural ground,
                       vertex-coloured, walkable. 16.6% of sides widen past
                       the old fixed 5.55u line, to at most 6.75u)
surfaced width 7.90u · graded width 11.10–13.50u
```

**Markings (P46):** solid edge lines at 0.55 and 3.15 (continuous per dry
stretch), dashed divider at 1.85 — 0.12u wide, 0.55u dashes / 1.4u period,
paint 0.06u above the asphalt. Dashes are cut **exactly at their window
edges** (interpolated sub-segment quads — they used to quantise to whole 0.6u
segments) and the phase runs on a **global surface-arc-length** (`loopWorldS`,
radial descent included), so it never resets at a leg seam. Measured: 510
dashes, median 0.542u, 92% within ±0.10 of nominal (outliers sit on the
steep gorge-rim faces).

**Height profile (P41/P45/P46/P47):** computed ONCE around the whole closed
loop, owned by **terrain.ts** since P47 (`loopProfileAt` — see §4: the ground
is graded to it), and interpolated by every consumer (`corridorProfile` per
leg, `rideSamples`, bridge banks). **Punch-through 0.00%**, over-cap 0; the
`[road]` console line now reads fill vs the GRADED ground (max ~0.66u — the
land carries the rest). `MAX_TWIST 0.46` clamps cross-slope. Station-seam
ride steps: worst **0.0135u** (was 0.0318u). One dry rule
(`corridorSampleDry`) is shared by the mesh and ride samplers: wet needs the
centre or BOTH verges under water (a single verge graze used to punch
one-segment holes at lakeshores), and a stretch >2.5u under its OWN road's
deck is skipped (`ownDeckAbove`) so no ghost road dives beneath the gorge
viaducts — foreign viaducts overhead never suppress, and ramp feet (+1u)
keep their road.

**Overlap control (P43/P47):** per-sample fold caps (local turn radius) plus a
global **wedge trim** — any lateral reach inside the band of an earlier,
non-neighbouring stretch is surrendered (deterministic priority), so exactly
one surface survives at hub corners (0 z-fighting pairs; skirt yields to any
foreign band). P47 tightened the cut to a 0.05u hairline seam (was a 0.25u
margin plus a 0.6u sliver floor that deleted whole carriageway sides at hub
corners — invisible against the old embankment, a broken road once the
ground was graded flush). Corridor materials carry `polygonOffset(-1,-1)` against the
planet mesh.

**Geometry:** one merged `MeshBuf` per element per leg — 45 meshes,
~21,000 triangles (the shoulder is 3 smoothstep strips per side).
`CORRIDOR_SUPPRESS 6.2` stands guardrails, grass tufts **and utility poles**
down within the corridor + shoulder (measured: 0 scatter props on either).

**Bridges (P18/P32/P40/P46):** every wet stretch on every road gets a deck —
5 spans: ghat-grove 8.4u, grove-mill 16.7u, haveli-bazaar 18.8u,
samadhi-grove 16.0u, workshop-beach 17.4u (the last two are arterial crossings
at 3.95u half-width; local-road spans stay 1.44u). `BridgeSpan.halfWidth`
drives deck mesh, rails and the walkable surface. **Arterial spans since P46:**
banks sample the corridor's own profile (`spanBanks` → `loopProfileAt` +
`ASPHALT_LIFT − DECK_TOP`), the flat section spans **level with the lower
bank** (`spanDeckR` — the two crossings are gorges; the old water-level deck
dove ~12u below its own banks), and the ramps extend until the ramp foot is
dry across the full ±3.95u cross-section plus one corridor-sample overlap
(the corridor drops whole segments while a verge probe is wet, which used to
leave a 1.1u cliff neither surface covered). **P47:** ramps additionally walk
uphill past any approach steeper than `APPROACH_GRADE 0.35` (max 0.3 rad per
side) — the bridge swallows the ski-jump rim descents instead of the road
riding them. Handoff now: worst true discontinuity **0.023u** (was 1.12u).
Piers still stand on the lakebed/gorge floor and stretch to the deck.

---

## 7. Player, collision, and ride height (P31 → P44)

`Player.tsx` constants: capsule `PLAYER_RADIUS 0.34` × `PLAYER_HEIGHT 1.8`,
`COLLIDE_PASSES 3`, `MAX_PUSH 0.15` (per-frame correction ≤ one walking step),
`DECK_SNAP 0.4`, `ROAD_SNAP 1.1`.

**Prop collision — `propCollision(pos, r, h, hit)` in props.ts:** flat scan of
**560 colliders** built once from `COLLIDER_SPECS` (box / posts / shaft / rail
shapes for palace, gopuram, temple-court, mill-block, workshop-shed, stall,
haveli-arch, metro-pillar, bridge-pier, bridge-rail, mango-tree, banyan,
peepal-tree, guardrail). 3D broad-phase reject **before** tangent-plane
flattening (an antipodal rail once registered as a hit). ~1–2.4 µs/call.
Player resolves road-first, bridge-wins ground: slide along the surface
tangent, never a hard stop.

**Ride height (P46 rewrite):** `corridorSurface(dir)` projects the query onto
the centreline segment **in unit-direction space** (3D ground-point chords
kink radially on grades — the projection parameter used to jump half a segment
there) and reads the lateral offset from the projection **residual** against a
segment-orthogonalised right vector (the old lerped-right `asin` was up to
0.65u short on curves — the P41c corner overhang). Where two legs converge on
a hub it evaluates both and returns the higher (what the trimmed mesh shows);
a snapped endpoint is honoured only inside a leg (beyond a leg's end the
adjacent leg's coincident sample takes over — the snap used to plateau 0.15u
past every station seam). Band lifts ramp over `KERB_RAMP 0.3`; beyond the
footpath it rides the shoulder via `shoulderHeight()`/`shoulderReach()`, the
same curve and reach the skirt mesh is built from, ending on natural ground
at 3.95 + reach. `bridgeSurface(dir)` covers decks + ramps per span width.
`groundOrDeck(dir)` = terrain raised to road/bridge — used by player ground,
NPC placement, NPC hit-test (same call: BUG-101's lesson), and all three camera
probes (clearance ×2 + LOS march). Player stands exactly on the drawn asphalt
(0.00% sunk >0.1u).

**Camera:** trailing lerp, ground clamp at `groundOrDeck + 0.96`, 8-sample LOS
march (also `groundOrDeck`, so embankments block sight), pull-in/ease-out.

---

## 8. Prop placement — `buildProps()` (1,079 props, 29 kinds)

Order matters: zone props → road furniture → bridges → metro → civic pads.
Deterministic; same world every load.

- `add(kind, zone, ang, distFrac, scale, seed, npcAware?)` — angular offset
  `distFrac × 0.03125` (BUG-102 fixed: `zone.radius` no longer enters).
- **Siting safeguards accumulated over the sessions:** `npcClearance` (≥1.92u),
  `propClearance` (`BULKY_KINDS` need 5.6u), `FOOTPRINT` box-vs-corridor search
  for palace/workshop-shed (set back beyond `SKIRT_OUT`), temple sightline
  cones (no pillar within 4u/±45° of gopuram/temple-court entrances), pillar
  nudge windows (`PILLAR_NUDGES`, wide variant for sightline cones).
- **Zone builds:** KR Market stalls+umbrellas, Bengaluru Palace (+arch, P12.3),
  Nandi Betta temple ensemble (gopuram/court/Nandi/stairs, P19), single giant
  banyan at Dodda Alada Mara (P12.1), Binny Mills blocks, ghat steps, etc.
- **Road furniture:** guardrails (terrain-conforming: `aux` carries the ground
  under each post, rail runs down the grade — P33), utility poles + catenary
  wires (`WIRE_MAX_SPAN 14.4`), grass tufts, traffic signals, 9 bilingual
  `zone-signboard`s (canvas textures from signage.ts).
- **Civic plots (P39/P40b/P46):** `CIVIC_PLOTS` — 7 reserved pads
  (hospital 14u @haveli, college 20u @samadhi, itpark 20u, apartments 20u
  @mill, **park 19u @grove** (shrunk from 20u in P46 — the only size that
  clears the widened corridor; sites with 0.85u of true shoulder clearance,
  anchor unmoved), busstand 14u @bazaar, cycleshop 10u @workshop).
  Ring-search siting clears corridor (`PLOT_CORRIDOR 6.2`), pillars, buildings,
  villagers, water, slope ≤ 0.3, other plots. Rendered as `civic-pad` —
  sunk octagonal paver discs (0.02u proud). `civicPlotReport()` exposes the
  siting table. **All 7 place.**
  Buildings use their own `BUILDING_SETBACK 5.1` (decoupled from the skirt);
  note the P46 adaptive shoulder can reach 6.75u laterally where the drop is
  large — beyond BUILDING_SETBACK and 0.55u beyond `CORRIDOR_SUPPRESS 6.2`.

Prop census (live, post-P46): bridge-rail 276, grass-tuft 161, bridge-deck 138,
metro-track 132, metro-pillar 132, guardrail 81, bridge-pier 32,
utility-pole 21, wire 12, mango-tree 11, stall 10, market-umbrella 10,
zone-signboard 9, metro-station 9, civic-pad 7, mill-block 6, ghat-steps 6,
lamp-post 5, peepal-tree 5, flag 4, traffic-signal 3, temple-steps 2, and one
each of palace, haveli-arch, workshop-shed, gopuram, temple-court,
nandi-statue, banyan. (`temple-dome` was removed in P39 as an orphan.)

---

## 9. Rendering — `PropsLayer.tsx` (P42 instancing)

- **Instanced fleets:** `bridge-rail` (was 1,088 draw calls → **3**
  InstancedMesh: posts/top/low) and `metro-pillar` (was 690 → **5**: footing,
  height-scaled shaft, cap + 2 drei `<Outlines>` hulls — drei shares
  `instanceMatrix` by reference; the shaft's outline is omitted because drei's
  outline shader lacks the inverse-transpose normal correction under
  non-uniform scale). Matrices baked once; three auto-computes fleet bounding
  spheres, so culling stays correct. Scene ≈ 2,200 draw calls (was ~4,000).
- Everything else renders per-prop through the `PropInstance` switch with
  `meshToonMaterial` + shared `toonGradient`, drei `<Outlines>` ink
  (`EDGE 0.035` — see backlog: possibly sub-pixel).
- `Corridors` renders the 45 merged corridor meshes (`vertexColors` for the
  skirt, `polygonOffset -1`).
- Art direction: bright flat toon look (P13/P14) — sky `#bfe0ee`-family,
  4-step gradient map, ink outlines, rotating clouds.

---

## 10. Store, quests, HUD, minimap

Unchanged mechanics from Day 1 (see §11–12 of the git history for details):
zustand store with `findStepForNpc` carry-gate resolver, 5 quests / 13 steps,
single `carrying` slot (BUG-103 still open). Additions since:
`currentZone` + `setCurrentZone` (zone-entry banner, hysteresis 0.21/0.28 rad
checked every 30 frames in Player), `playerState` singleton feeding the
canvas Minimap (10fps, sqrt-spread radar, quest target pinned to rim as a
compass).

---

## 11. Verification methodology

Every measured figure in this document was produced by compiling
`lib/game/{data,terrain,props,signage}.ts` plus a driver with
`npx tsc --module esnext --target es2020 --moduleResolution bundler
--skipLibCheck`, writing `{"type":"module"}` beside the output, appending
`.js` to relative import specifiers, and running with `node`. Rendered-geometry
claims (overlaps, draw calls) were measured by raycasting the actual
`BufferGeometry` output of `buildCorridors()` / counting `<mesh>` emissions
per `PropInstance` case.

---

## 12. Current bug / backlog state

Severity: **P0** breaks content · **P1** clearly wrong · **P2** polish/debt.

### Fixed since the original document

| ID | Was | Fix |
|---|---|---|
| BUG-003 | NPCs floated/sank | snap to `terrainRadius` (now `groundOrDeck`). |
| BUG-101 | 4 NPCs unreachable, quest-offering dead | shared `npcSurfacePosition` / `groundOrDeck` for render AND hit-test. |
| BUG-102 | props flung tens of degrees from their zone | `distFrac × 0.03125` angular offset; `zone.radius` removed from the formula. |
| BUG-104 | 14 props culled underwater | obsolete — consequence of 102/106. |
| BUG-106 | ghat zone fully submerged | zone lifted above the waterline (P11). |
| BUG-006 | nameplates visible through the planet | occlusion march in NpcLayer. |
| (P25–P28) | corridor punch-through, rock stripes | MAX_TWIST 0.46, skirts, flat-ramp widening, road-list sync. |
| (P35–P37) | 0/98 pillars in median, road missed zones | corridor on the metro spline; spline re-anchored on zone centres. |
| (P41–P44) | road chatter, player under asphalt, screen judder, causeway walls | envelope profile + fill cap, `corridorSurface` ride height, interpolated lookup, kerb ramps. |
| (P42) | 40–50 fps | instanced rails/pillars: scene ~4,000 → ~2,200 draw calls. |
| (P46) | corridor-to-bridge handoff ~1.2u step | arterial banks from the loop profile, gorge decks level with the lower bank, ramps extended to full-cross-section-dry + overlap: worst true step **0.023u**. |
| (P46) | `corridorSurface` corner overhang + gorge-grade ride jumps + station-seam plateaus | unit-direction segment projection, residual-based lateral offset, two-leg max at hubs, no snap past a leg's end. Station seams 0.0318 → **0.0097u**. |
| (P46) | rock stripes flanking the corridor (21.9% of the verge band) | terrain flattening driven by the loop spline itself (`LOOP_FLAT_CORE 4.4` / `RAMP 9`): 14.5% (ambient is 33%). |
| (P46) | 12 metro-track segments unsupported (13u bare run over a gorge) | pillar footings may stand in water; last-resort nudge waives prop clearance only. 132/132 supported. |
| (P46) | dash aliasing (0.6u quantised) + per-leg phase resets | exact sub-segment dash windows on a global surface-arc-length. |
| (P46) | park civic plot failed to site | footprint 20 → 19u; sites with 0.85u shoulder clearance, anchor unmoved. |
| (P47) | the whole network rode a permanent 1.2u embankment over unmoving ground | terrain graded to the road profile (§4): edge gap max 1.44 → 0.64u, p90 = kerb height. |
| (P47) | SP Road signboard stood mid-carriageway | signboards walk outward until clear of the corridor (all 9 placed, ≥6.5u off centreline). |
| (P47) | civic pads hovered off sloped sites (~3u rim float) | pads draped vertex-by-vertex onto the terrain (CivicPad in PropsLayer). |
| (P47) | ghost road diving under the gorge viaducts | shared `corridorSampleDry` skips stretches >1u below a deck; ramps swallow >0.35 grades. |

### Open

| ID | Sev | Item |
|---|---|---|
| BUG-103 | **P0** | Single `carrying` slot — concurrent quests soft-lock permanently. |
| BUG-110 | P1 | Held keys latch when the tab loses focus (no blur/visibility reset). |
| BUG-112 | P2 | Ganesh, Sheru, peacock have no dialogue — `E` gives zero feedback. |
| BUG-105/107/109/111/113–119 | P2 | As originally documented (dead fields, uiIcon unrendered, no swim state, first-match quest resolver, toast eats a keypress, ignoreBuildErrors, per-frame allocations in NpcFigure, dead exports, tsbuildinfo untracked, no persistence). |
| NEW | P1 | **Metro viaduct deck is not in `groundOrDeck`** — camera clamps/LOS ignore it; prime suspect if black-screen reports persist. |
| NEW | P2 | 66 zone-core props (stalls, ghat steps, trees, 6 NPCs incl. Amma at 0.18u) sit inside the road's graded band — the corridor runs through zone centres by design; needs a taper-through-hubs or acceptance decision. |
| NEW | P2 | `corridorSurface` still ignores the hub wedge trim (the ride reports a phantom higher surface where the other leg's mesh was trimmed away — asphalt-vert parity p99 0.088u, worst 0.341u at one temple corner; the broad >0.05 population is the intentional kerb-ramp smoothing). |
| NEW | P2 | `ROAD_PAIRS` in props.ts hand-duplicates `buildRoads()` in terrain.ts (already caused one stale-list bug); same for `BRIDGE_ARTERIAL_HALF_WIDTH` vs `FOOT_OUT`, `MEDIAN_HALF` vs `LANE_IN`. The metro loop itself is no longer duplicated (terrain.ts owns `METRO_LOOP` since P46) — only the painted-arc list remains. |
| NEW | P2 | The gorge viaducts (P46) span level with the LOWER bank; the higher-bank ramp carries the height difference over its own length — grade fine today (banks near-equal) but unchecked if the profile shifts. 39/510 dashes are off-nominal on the steep gorge-rim faces. |
| NEW | P2 | drei `<Outlines>` default path offsets by `thickness` **pixels**; `EDGE 0.035` may be sub-pixel — if confirmed by eye, ~800 outline draw calls are deletable with no visual change. |
| NEW | P2 | Remaining instancing candidates: bridge-deck (408 calls), metro-track (396), grass-tuft, guardrail, utility-pole. |
| DESIGN | — | Zone rebuilds per WORLD_DESIGN.md: `samadhi` (should be SP Road electronics lane, is a peepal grove), `beach` (should be a stepped kere, is palm trees), plus stale NPC/quest dialogue naming the old world. |

---

## 13. `WATER_LEVEL`, `ZONES`, `NPCS`, `QUESTS`, `PHYSICS`

### `WATER_LEVEL = 33.92`

Ocean sphere radius. Consumers: Scene water mesh; terrain shoreline flattening
(floor `−2.56`), sand colouring, road-paint suppression; props culls
(`+0.48`), corridor/bridge wet detection (`+0.3` / `WET_MARK +0.4`), metro
deck floor (`+4.8`).

### `ZONES` — 9 entries (display names renamed to Bengaluru landmarks in P9.1)

| `id` | `text` | `center` | `radius` | terrainR at centre |
|---|---|---|---:|---:|
| `bazaar` | KR Market | `[40.32, 17.6, 3.68]` | 9 | 45.17 |
| `mill` | Binny Mills | `[-12.48, 6.72, -46.88]` | 18 | 43.53 |
| `ghat` | Cauvery Riverside | `[14.98, -25.52, -22.93]` | 10 | 36.84 |
| `haveli` | Bengaluru Palace | `[-23.04, -9.76, 43.2]` | 9 | 44.86 |
| `grove` | Dodda Alada Mara | `[-14.08, -30.72, 4]` | 13 | 36.88 |
| `samadhi` | SP Road | `[44.32, -22.72, 21.44]` | 8 | 44.84 |
| `workshop` | Gopal's Garage | `[-34.72, -10.88, 10.08]` | 5.5 | 37.35 |
| `temple` | Nandi Betta Temple | `[-16.32, 55.68, -6.08]` | 8 | 49.72 |
| `beach` | Sampangi Kere | `[-20.96, 24.96, -2.88]` | 8 | 39.16 |

Ids are permanent keys (palette, roads, prop placement) — **never rename them**
and **never move a `center`**: both are load-bearing (WORLD_DESIGN Rules 1–3).

### `NPCS` — 20 entries

Same cast as Day 1 (positions ×1.6). Every NPC position is a weight-1 terrain
anchor — **moving a villager deforms the ground** (Rule 4). NPCs stand on
`groundOrDeck`, so villagers near roads ride the asphalt.

### `QUESTS` — 5 quests, 13 steps

Unchanged: quest-invoice, quest-spare-parts, quest-pump, quest-offering,
quest-diary. Carry-gate mechanics as originally documented. Dialogue still
references the pre-Bengaluru world in places (see backlog DESIGN row).

### `PHYSICS`

```ts
{ jumpForce: 0.16675, gravity: -0.01173, sprintSpeed: 1.4946 }   // live
// positionForce, damp, dampIdle, capsuleRadius, floorDetectInclination — still unused
```

---

## Quick orientation for a new assistant

- **Change content?** → `lib/game/data.ts`. Editing any `NPCS[i].position` or
  `ZONES[i].center` **reshapes the terrain** (both feed `makeAnchors()`).
- **Change the world shape?** → `terrainRadius()` in terrain.ts — single source
  of truth for mesh, placement, and collision.
- **Change roads/metro/bridges/collision/civic?** → `lib/game/props.ts`; keep
  its `ROAD_PAIRS` in sync with terrain's `buildRoads()` by hand. The metro
  loop geometry itself lives in terrain.ts (`METRO_LOOP`) — change it there
  and both the grading and the corridor follow.
- **Change decoration?** → `buildProps()` for placement, `PropInstance` /
  fleet components in PropsLayer.tsx for geometry (instanced kinds need their
  matrices updated in the fleet builders, not the switch).
- **Change ride/feel?** → constants at the top of `Player.tsx`, plus
  `corridorProfile` / `corridorSurface` in props.ts for the road itself.
- **Verify numerically before claiming** — the tsc+node harness recipe in §11
  is how every figure here was produced; prefer extending it over estimating.
