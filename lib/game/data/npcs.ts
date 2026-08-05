/**
 * NPC definitions for the Dak Wala world.
 *
 * Edit this file to add, rename, reposition, recolour, or change the
 * idle dialogue of any character — without touching any logic files.
 *
 * - `kind`     determines the 3-D mesh shape rendered by NpcLayer
 * - `outfit`   and `hair` are hex colours for the character mesh
 * - `position` is a world-space [x, y, z] coordinate on the planet surface
 * - `texts`    are idle lines shown when the NPC has no active quest step
 * - `talkDistance` (optional) overrides the default interaction range
 */

import type { Vec3 } from "./zones"

export type NpcKind =
  | "clerk"
  | "worker"
  | "engineer"
  | "flowerseller"
  | "grandmother"
  | "mechanic"
  | "manager"
  | "kid"
  | "boatman"
  | "priest"
  | "musician"
  | "sadhu"
  | "chaiwala"
  | "dog"
  | "peacock"

export type Npc = {
  id: string
  name: string
  color: string
  kind: NpcKind
  outfit: string
  hair: string
  position: Vec3
  texts: string[]
  talkDistance?: number
}

export const NPCS: Npc[] = [
  {
    id: "raju-clerk",
    name: "Raju",
    color: "#e2a640",
    kind: "clerk",
    outfit: "#dcd3bd",
    hair: "#2b2420",
    position: [27.97, 1.41, 0.54],
    texts: ["My tiffin break got cancelled again..."],
  },
  {
    id: "manager-verma",
    name: "Manager Verma",
    color: "#c25959",
    kind: "manager",
    outfit: "#5a4a63",
    hair: "#3a3532",
    position: [26.25, 9.71, 1.40],
    texts: ["Deputy Regional Assistant Sub-Manager...", "Has a nice ring to it, no?"],
  },
  {
    id: "chai-wala",
    name: "Bansi the Chai Wala",
    color: "#de9a4e",
    kind: "chaiwala",
    outfit: "#8f5a34",
    hair: "#332822",
    position: [20.36, 19.17, 2.20],
    texts: ["Ek cutting chai, extra elaichi. Always."],
  },
  {
    id: "mechanic-gopal",
    name: "Gopal the Mechanic",
    color: "#f3c258",
    kind: "mechanic",
    outfit: "#54503f",
    hair: "#40332a",
    position: [-22.98, -3.73, 4.72],
    texts: ["This scooter has more patches than paint."],
  },
  {
    id: "boss-verma-senior",
    name: "Seth Rajwada",
    color: "#7a5a9c",
    kind: "manager",
    outfit: "#3f4652",
    hair: "#6d6a66",
    position: [-4.05, 1.06, 25.45],
    texts: ["Hmm. Interesting."],
    talkDistance: 2.2,
  },
  {
    id: "flower-radha",
    name: "Radha the Flower Seller",
    color: "#e0708c",
    kind: "flowerseller",
    outfit: "#d98b8b",
    hair: "#3a2a24",
    position: [27.43, 4.66, 3.58],
    texts: ["Marigolds sell fast before a wedding season."],
  },
  {
    id: "kid-chintu",
    name: "Chintu",
    color: "#66bde6",
    kind: "kid",
    outfit: "#7fa86a",
    hair: "#251d18",
    position: [-8.91, -21.11, 0.91],
    texts: ["I bet I can climb that mango tree faster than you."],
  },
  {
    id: "coder-priya",
    name: "Priya",
    color: "#66bde6",
    kind: "kid",
    outfit: "#4c4a63",
    hair: "#20242e",
    position: [30.01, 18.61, -4.71],
    texts: [
      "Hey! You're the delivery rider, right?",
      "Have you heard of three.js?",
      "It's a way to build whole little worlds like this one, in a browser.",
      "Basically art, except the paint is code.",
    ],
  },
  {
    id: "mill-worker-a",
    name: "Mill Worker",
    color: "#66bde6",
    kind: "worker",
    outfit: "#8a5f3a",
    hair: "#33302c",
    position: [4.17, 4.27, -23.59],
    texts: ["Bales in, bales out. Every single day."],
  },
  {
    id: "mill-worker-b",
    name: "Suresh",
    color: "#66bde6",
    kind: "worker",
    outfit: "#9a6a3a",
    hair: "#2b2926",
    position: [1.6, 8.9, -24.4],
    texts: ["New apprentice showed up late again."],
  },
  {
    id: "engineer-iyer",
    name: "Dr. Iyer",
    color: "#66bde6",
    kind: "engineer",
    outfit: "#e8e4d8",
    hair: "#403033",
    position: [-7.46, -7.61, -19.69],
    texts: ["The pump housing has to sit here... and here... and here."],
  },
  {
    id: "mill-worker-c",
    name: "Ganesh",
    color: "#66bde6",
    kind: "worker",
    outfit: "#a15f30",
    hair: "#26241f",
    position: [-7.33, -8.44, -19.35],
    texts: [],
  },
  {
    id: "sadhu-wanderer",
    name: "The Wanderer",
    color: "#e8dcc8",
    kind: "sadhu",
    outfit: "#e0763a",
    hair: "#d8ceb8",
    position: [-12.64, 17.69, -5.86],
    texts: ["I have walked past this river more times than I can count."],
  },
  {
    id: "engineer-rao",
    name: "Dr. Rao",
    color: "#66bde6",
    kind: "engineer",
    outfit: "#eceadf",
    hair: "#57514b",
    position: [10.85, 23.34, -7.73],
    texts: ["First, let's work out how much water this village actually needs..."],
  },
  {
    id: "boatman-deva",
    name: "Deva the Boatman",
    color: "#de794e",
    kind: "boatman",
    outfit: "#3f6a7c",
    hair: "#2c2a28",
    position: [15.88, 16.90, 11.25],
    texts: ["Come on, old rope... untangle already..."],
    talkDistance: 2.2,
  },
  {
    id: "priest-baba",
    name: "Baba Someshwar",
    color: "#8cc48c",
    kind: "priest",
    outfit: "#d97b3a",
    hair: "#37312c",
    position: [-8.17, 32.35, -1.77],
    texts: ["Listen closely. Even the wind carries a rhythm."],
  },
  {
    id: "amma",
    name: "Amma",
    color: "#8cc48c",
    kind: "grandmother",
    outfit: "#9c6ea0",
    hair: "#d8d4cd",
    position: [23.37, -16.51, 12.46],
    texts: ["Bless you, beta, for carrying an old woman's prayers."],
  },
  {
    id: "musician-iqbal",
    name: "Ustad Iqbal",
    color: "#de794e",
    kind: "musician",
    outfit: "#7e6ba8",
    hair: "#3a2c1e",
    position: [15.03, -14.79, -7.10],
    texts: ["Listen — this raag takes an hour just to wake up."],
  },
  {
    id: "street-dog",
    name: "Sheru",
    color: "#66bde6",
    kind: "dog",
    outfit: "#c9a26a",
    hair: "#f2e6da",
    position: [-8.37, -20.37, 10.03],
    texts: [],
  },
  {
    id: "peacock",
    name: "Peacock",
    color: "#66bde6",
    kind: "peacock",
    outfit: "#2f6f8f",
    hair: "#1f4a5f",
    position: [-12.60, -22.75, -2.19],
    texts: [],
  },
]
