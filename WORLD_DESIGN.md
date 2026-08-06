# World Design Bible

## Principle

**The game world is a mini-Bengaluru on a tiny planet.**

The current map is a basic canvas. **All future environment work — buildings, props, roads, refinements — must be built to express each zone's real-world identity described below. No generic decoration.**

A prop earns its place by saying something true about its zone. A crate that could sit anywhere belongs nowhere.

## Provenance of the zone identities

Three identities below are taken verbatim from the brief: **grove** (single giant banyan), **samadhi/SP Road** (electronics lane), and **beach/Sampangi Kere** (kere with stone steps).

The remaining six are **drafts written against the real Bengaluru landmarks the zones are now named after** — I could not find a fuller blueprint in the conversation to copy from. Treat those six as proposals awaiting sign-off, not as settled canon. Correct them and this file becomes the source of truth.

## How to read a zone entry

- **Identity** — what the place actually is. This is the brief.
- **Build toward** — what the environment should become.
- **Today** — what is actually rendered right now, so the gap is visible.

`center` and `radius` are quoted for reference only. See [Rules](#rules) before touching either.

---

<a id="bazaar"></a>
### `bazaar` — KR Market

`center [25.2, 11.0, 2.3]` · `radius 9`

**Identity.** Krishna Rajendra Market — the oldest and busiest market in the city. A dense wholesale sprawl famous above all for its flower trade: mounds of marigold and jasmine sold by weight, produce stacked in every direction, narrow lanes packed shoulder to shoulder, tarpaulin and awning overhead, trade spilling out of the market building into the surrounding streets.

**Build toward.** Density and colour. Tight stall rows rather than a tidy ring; flower heaps as the signature visual; canopies overlapping into a near-continuous roof; goods stacked in the walkways. This should be the loudest, most crowded zone on the planet.

**Today.** 10 `stall`, 10 `market-umbrella`, 2 `lamp-post`, 1 `flag` — 23 rendered, the only zone losing nothing to the waterline cull. NPCs: Raju, Manager Verma, Bansi the Chai Wala, Radha the Flower Seller, Priya.

<a id="mill"></a>
### `mill` — Binny Mills

`center [-7.8, 4.2, -29.3]` · `radius 18`

**Identity.** A historic textile mill — one of the city's great industrial employers, now largely silent. Long weaving sheds, sawtooth roofs, brick chimneys, compound walls, cotton bales in the yard. The mood is working industry gone quiet, not ruin.

**Build toward.** Repetition and scale: parallel shed rows, a chimney that reads from a distance, loading yards, stacked bales, a perimeter wall. Muted industrial palette against the warm village.

**Today.** 6 `mill-block` authored, **only 4 render** — the rest are culled underwater, because this zone's large `radius` flings props far from its centre (BUG-102). NPCs: Mill Worker, Suresh, Dr. Iyer, Ganesh.

<a id="ghat"></a>
### `ghat` — Cauvery Riverside

`center [8.1, -13.8, -12.4]` · `radius 10`

**Identity.** The riverside the city drinks from. Broad stone steps descending to the water, washing stones, tethered coracles and boats, small shrines at the head of the steps, wet stone and drying cloth.

**Build toward.** Terraced stone stepping down to the waterline, jetties, boats, a shrine at the top of the steps. The steps are the whole point — they must actually meet the water.

**Today.** ⚠️ **Blocked.** 6 `ghat-steps` authored, **only 2 render**. This zone's terrain surface sits at radius **20.00**, below `WATER_LEVEL` **21.2** — the entire zone is underwater. See [Blockers](#blockers). NPC: Ustad Iqbal.

<a id="haveli"></a>
### `haveli` — Bengaluru Palace

`center [-14.4, -6.1, 27.0]` · `radius 9`

**Identity.** A 19th-century palace in Tudor/Norman revival style — fortified towers, battlements, arched windows, turrets, and wide wooded grounds behind a gated wall. Distinctly *not* a north-Indian haveli.

**Build toward.** A single grand structure with battlements and towers, a gatehouse and boundary wall, formal lawn and mature trees in the grounds. Should read as the most imposing built thing in the world.

**Today.** 1 `haveli-arch`, 2 `lamp-post`, 1 `flag` — 4 rendered. The `haveli-arch` prop is a Rajasthani-style arch and **contradicts the new identity**; it needs replacing, not just supplementing. NPC: Seth Rajwada.

<a id="grove"></a>
### `grove` — Dodda Alada Mara

`center [-8.8, -19.2, 2.5]` · `radius 13`

**Identity.** **A single giant banyan.** Not an orchard, not a wood — *one* tree, centuries old, spread over acres, held up by hundreds of aerial prop roots so that the canopy reads as a forest while being one organism. The original central trunk is long gone; the tree now grows outward from its own roots.

**Build toward.** One enormous canopy at the zone centre with a field of descending prop-root columns beneath it, dappled shade, a walking path threading between the roots, and a low wall or shrine at the base. **Remove the scattered orchard entirely** — scattered trees actively contradict this zone.

**Today.** ❌ **Contradicts the identity.** 16 scattered `mango-tree` authored, 9 rendered — an orchard where there should be one tree. Highest-priority rebuild. NPCs: Chintu, Sheru (dog), Peacock.

<a id="samadhi"></a>
### `samadhi` — SP Road

`center [27.7, -14.2, 13.4]` · `radius 8`

**Identity.** **The electronics lane.** A dense, narrow commercial strip of component shops — wire spools, switches, LEDs, motors, salvaged boards — stacked floor to ceiling and spilling onto the pavement. Signage everywhere, shutters, hand-painted boards, tangles of overhead cable.

**Build toward.** A *linear* street, not a clearing: shopfronts down both sides of a narrow lane, roll-down shutters, dense signboards, cable runs overhead, component crates on the kerb. The one zone that should feel like a corridor rather than an open space.

**Today.** ❌ **Contradicts the identity.** 5 `peepal-tree` — a quiet memorial grove where there should be a commercial lane. Full rebuild needed. The zone `id` remains `samadhi`; see [Rules](#rules). NPC: Amma.

<a id="temple"></a>
### `temple` — Nandi Betta Temple

`center [-10.2, 34.8, -3.8]` · `radius 8`

**Identity.** A hilltop temple reached by a long climb — an ancient stone shrine at a summit famous for sunrise above the cloud line, with fortification walls, a stepped approach, and long views in every direction.

**Build toward.** A stone shrine at the true summit, a stepped path climbing the slope to reach it, low fort walls along the ridge, flagpoles catching wind. The climb should be legible from the ground far below.

**Today.** 1 `temple-dome`, 2 `flag` — 3 rendered, all above water. Terrain here already peaks at radius **31.01**, the highest ground on the planet, so the hill exists and only needs dressing. NPCs: Baba Someshwar, Dr. Rao.

<a id="workshop"></a>
### `workshop` — Gopal's Garage

`center [-21.7, -6.8, 6.3]` · `radius 5.5`

**Identity.** A one-man two-wheeler repair shed. Corrugated roof, oil-stained floor, scooters in pieces, tyres stacked against the wall, tools on a bench, a hand-painted board over the door. Small, cluttered, personal.

**Build toward.** Keep it tiny and dense — this is the smallest zone (`radius 5.5`) and should stay intimate. Dismantled scooters, tyre stacks, a workbench, spare parts scattered in the yard.

**Today.** 1 `workshop-shed`, 1 `lamp-post` — 2 rendered. Closest match between prop and identity of any zone. NPC: Gopal the Mechanic.

<a id="beach"></a>
### `beach` — Sampangi Kere

`center [-13.1, 15.6, -1.8]` · `radius 8`

**Identity.** **A kere — a traditional tank/lake — with stone steps.** Not a sea beach. Terraced stone stepping down into still water, a bund along one edge, washing and bathing ghats, water plants at the margin, trees along the embankment.

**Build toward.** Stone step terraces into the water, a raised bund path, a small pavilion or mantapa at the water's edge, reeds at the shallows. Calm and still — the tonal opposite of KR Market.

**Today.** ❌ **Contradicts the identity.** 6 palm-styled `mango-tree` authored, 5 rendered — a beach where there should be a stepped tank. NPC: The Wanderer.

---

<a id="rules"></a>
## Rules

1. **Props are placed relative to a zone's `id`.** `buildProps()` in [lib/game/props.ts](lib/game/props.ts) looks zones up by `id`, and `PALETTE` is keyed by `id`. All new environment work attaches to the id.

2. **Zone `id`s must never be renamed for theming reasons.** Ids are referenced by `PALETTE`, by every `add(...)` call in `props.ts`, and by the road graph in [lib/game/terrain.ts](lib/game/terrain.ts). Renaming `samadhi` to `sproad` would silently drop its palette and its roads. The `id` is a key; the `text` field is the display name and is the *only* field to change for naming.

3. **Zone `center` values must never be moved for theming reasons.** Every `ZONES[].center` is a weight-1.35 anchor in the terrain's radial-basis field (`makeAnchors()` in `terrain.ts`). Moving a centre reshapes the ground, shifts the road arcs drawn between zone pairs, and relocates every prop anchored to it. Terrain first, theming second — never the reverse.

4. **The same applies to `NPCS[].position`** — each NPC position is also a weight-1 terrain anchor. Moving a villager deforms the landscape under them.

5. **Changing `radius` changes prop scatter, not zone size.** `radius` is currently multiplied into an *angular* offset (`distFrac * zone.radius * 0.045`), so raising it throws props further away rather than widening the zone. Do not tune it for theming until BUG-102 is fixed.

<a id="blockers"></a>
## Blockers

**BUG-106 — `ghat` / Cauvery Riverside is underwater.** The terrain surface at this zone's centre sits at radius **20.00**, below `WATER_LEVEL = 21.2`. The whole zone is submerged, and 4 of its 6 `ghat-steps` props are discarded by the waterline cull in `props.ts`. **The terrain must be lifted above the waterline before any riverside build-out begins** — otherwise every stone step placed there is deleted before it renders.

**BUG-102 — props scatter far outside their zone.** `dist = distFrac * zone.radius * 0.045` treats a world-unit radius as an angular multiplier, so large zones fling props tens of degrees away: a `mill-block` lands ~46° (≈16 world units) from the mill centre. Until this is fixed, "place a prop in a zone" is not reliable for `mill` (radius 18), `grove` (13), or `ghat` (10), and any build-out in those zones will land somewhere else.

Both are recorded in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) §12.

## Open mismatches to resolve

Beyond the zone rebuilds above, the writing has not yet caught up with the map:

- NPC and quest dialogue still names the old world — Deva speaks of "the ghat steps", quest text directs the player to "the haveli" and "the bazaar", and `quest-offering` says "up to the temple". These live in `NPCS` and `QUESTS` in [lib/game/data.ts](lib/game/data.ts).
- **Deva the Boatman stands nearest KR Market** (0.53 rad) rather than any water. A boatman belongs at Cauvery Riverside or Sampangi Kere.
- **Amma stands in SP Road**, the electronics lane, while asking the player to carry a temple offering.
- Several `id`s now read as misnomers against their display names — `samadhi` is an electronics market, `beach` is a lake, `ghat` is a riverside. Per Rule 2 these stay as-is; the mismatch is cosmetic and lives only in code.
