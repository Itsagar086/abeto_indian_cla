# Dak Wala — Village Courier

A small original delivery-courier game built with Next.js, React Three Fiber
(Three.js), TypeScript, and Tailwind. You play a courier on a tiny round
world modelled after an Indian small town — deliver parcels between the
bazaar, the mill, the ghat, the haveli, the temple hill, and more.

This is an original game: its map, characters, dialogue, and quests were
written from scratch — it is not a copy or clone of any existing game.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Controls

- **W / S** — walk forward / back
- **A / D** — turn
- **Shift** — sprint
- **Space** — jump
- **E** — talk to a nearby character / advance dialogue

## Structure

- `lib/game/data.ts` — zones, NPCs, quests/dialogue, physics tuning
- `lib/game/terrain.ts` — procedural round-world terrain (heightfield + colour)
- `lib/game/props.ts` — procedural placement of buildings/props per zone
- `lib/game/store.ts` — zustand store for dialogue/quest state
- `components/game/` — Scene, Player controller, NPCs, props, HUD
