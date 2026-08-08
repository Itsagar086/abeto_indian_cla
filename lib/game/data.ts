// Original game content for "Dak Wala" — a small delivery courier game
// set on a tiny round world modelled after an Indian small-town/village.
// Every zone, character, and line of dialogue below is original writing.

export type Vec3 = [number, number, number]

/* ------------------------------------------------------------------ zones */

export type Zone = {
  id: string
  text: string
  center: Vec3
  radius: number
}

export const ZONES: Zone[] = [
  { id: "bazaar", text: "KR Market", center: [40.32, 17.6, 3.68], radius: 9 },
  { id: "mill", text: "Binny Mills", center: [-12.48, 6.72, -46.88], radius: 18 },
  { id: "ghat", text: "Cauvery Riverside", center: [14.98, -25.52, -22.93], radius: 10 },
  { id: "haveli", text: "Bengaluru Palace", center: [-23.04, -9.76, 43.2], radius: 9 },
  { id: "grove", text: "Dodda Alada Mara", center: [-14.08, -30.72, 4], radius: 13 },
  { id: "samadhi", text: "SP Road", center: [44.32, -22.72, 21.44], radius: 8 },
  { id: "workshop", text: "Gopal's Garage", center: [-34.72, -10.88, 10.08], radius: 5.5 },
  { id: "temple", text: "Nandi Betta Temple", center: [-16.32, 55.68, -6.08], radius: 8 },
  { id: "beach", text: "Sampangi Kere", center: [-20.96, 24.96, -2.88], radius: 8 },
]

/* ------------------------------------------------------------------- npcs */

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
    position: [44.75, 2.26, 0.86],
    texts: ["My tiffin break got cancelled again..."],
  },
  {
    id: "manager-verma",
    name: "Manager Verma",
    color: "#c25959",
    kind: "manager",
    outfit: "#5a4a63",
    hair: "#3a3532",
    position: [42, 15.54, 2.24],
    texts: ["Deputy Regional Assistant Sub-Manager...", "Has a nice ring to it, no?"],
  },
  {
    id: "chai-wala",
    name: "Bansi the Chai Wala",
    color: "#de9a4e",
    kind: "chaiwala",
    outfit: "#8f5a34",
    hair: "#332822",
    position: [32.58, 30.67, 3.52],
    texts: ["Ek cutting chai, extra elaichi. Always."],
  },
  {
    id: "mechanic-gopal",
    name: "Gopal the Mechanic",
    color: "#f3c258",
    kind: "mechanic",
    outfit: "#54503f",
    hair: "#40332a",
    position: [-36.77, -5.97, 7.55],
    texts: ["This scooter has more patches than paint."],
  },
  {
    id: "boss-verma-senior",
    name: "Seth Rajwada",
    color: "#7a5a9c",
    kind: "manager",
    outfit: "#3f4652",
    hair: "#6d6a66",
    position: [-6.48, 1.7, 40.72],
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
    position: [43.89, 7.46, 5.73],
    texts: ["Marigolds sell fast before a wedding season."],
  },
  {
    id: "kid-chintu",
    name: "Chintu",
    color: "#66bde6",
    kind: "kid",
    outfit: "#7fa86a",
    hair: "#251d18",
    position: [-14.26, -33.78, 1.46],
    texts: ["I bet I can climb that mango tree faster than you."],
  },
  {
    id: "coder-priya",
    name: "Priya",
    color: "#66bde6",
    kind: "kid",
    outfit: "#4c4a63",
    hair: "#20242e",
    position: [48.02, 29.78, -7.54],
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
    position: [6.67, 6.83, -37.74],
    texts: ["Bales in, bales out. Every single day."],
  },
  {
    id: "mill-worker-b",
    name: "Suresh",
    color: "#66bde6",
    kind: "worker",
    outfit: "#9a6a3a",
    hair: "#2b2926",
    position: [2.56, 14.24, -39.04],
    texts: ["New apprentice showed up late again."],
  },
  {
    id: "engineer-iyer",
    name: "Dr. Iyer",
    color: "#66bde6",
    kind: "engineer",
    outfit: "#e8e4d8",
    hair: "#403033",
    position: [-11.94, -12.18, -31.5],
    texts: ["The pump housing has to sit here... and here... and here."],
  },
  {
    id: "mill-worker-c",
    name: "Ganesh",
    color: "#66bde6",
    kind: "worker",
    outfit: "#a15f30",
    hair: "#26241f",
    position: [-11.73, -13.5, -30.96],
    texts: [],
  },
  {
    id: "sadhu-wanderer",
    name: "The Wanderer",
    color: "#e8dcc8",
    kind: "sadhu",
    outfit: "#e0763a",
    hair: "#d8ceb8",
    position: [-20.22, 28.3, -9.38],
    texts: ["I have walked past this river more times than I can count."],
  },
  {
    id: "engineer-rao",
    name: "Dr. Rao",
    color: "#66bde6",
    kind: "engineer",
    outfit: "#eceadf",
    hair: "#57514b",
    position: [17.36, 37.34, -12.37],
    texts: ["First, let's work out how much water this village actually needs..."],
  },
  {
    id: "boatman-deva",
    name: "Deva the Boatman",
    color: "#de794e",
    kind: "boatman",
    outfit: "#3f6a7c",
    hair: "#2c2a28",
    position: [25.41, 27.04, 18],
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
    position: [-13.07, 51.76, -2.83],
    texts: ["Listen closely. Even the wind carries a rhythm."],
  },
  {
    id: "amma",
    name: "Amma",
    color: "#8cc48c",
    kind: "grandmother",
    outfit: "#9c6ea0",
    hair: "#d8d4cd",
    position: [37.39, -26.42, 19.94],
    texts: ["Bless you, beta, for carrying an old woman's prayers."],
  },
  {
    id: "musician-iqbal",
    name: "Ustad Iqbal",
    color: "#de794e",
    kind: "musician",
    outfit: "#7e6ba8",
    hair: "#3a2c1e",
    position: [24.05, -23.66, -11.36],
    texts: ["Listen — this raag takes an hour just to wake up."],
  },
  {
    id: "street-dog",
    name: "Sheru",
    color: "#66bde6",
    kind: "dog",
    outfit: "#c9a26a",
    hair: "#f2e6da",
    position: [-13.39, -32.59, 16.05],
    texts: [],
  },
  {
    id: "peacock",
    name: "Peacock",
    color: "#66bde6",
    kind: "peacock",
    outfit: "#2f6f8f",
    hair: "#1f4a5f",
    position: [-20.16, -36.4, -3.5],
    texts: [],
  },
]

/* ----------------------------------------------------------------- quests */

export type QuestStep = {
  id: string
  texts: string[]
  extraData: {
    uiTitle: string
    uiIcon: string
    uiText: string
    uiColor: string
    receiveModel?: string
  }
}

export type Quest = {
  id: string
  description: string
  steps: QuestStep[]
}

export const QUESTS: Quest[] = [
  {
    id: "quest-invoice",
    description: "The Missing Invoice",
    steps: [
      {
        id: "raju-clerk",
        texts: [
          "Arre, thank goodness! I sent an angry letter to Manager Verma this morning and I need it back before he reads it properly.",
          "He's staying up at the haveli this week. Do you think you could catch it before he opens it?",
        ],
        extraData: {
          uiTitle: "Next Up",
          uiIcon: "house",
          uiText: "Find Seth Rajwada's haveli and get the letter back",
          uiColor: "#c25959",
        },
      },
      {
        id: "boss-verma-senior",
        texts: [
          "One of my clerks wrote this? I can't believe it... this is...",
          "...actually very funny. He's got a real eye for the mill's problems. Maybe he's manager material.",
          "Take this reply back to him. He works down at the bazaar.",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "clerk",
          uiText: "Take Seth Rajwada's reply to Raju in the bazaar",
          uiColor: "#c25959",
          receiveModel: "letter",
        },
      },
      {
        id: "raju-clerk",
        texts: [
          "I'm getting... promoted?",
          "Turns out complaining loudly enough gets you noticed around here.",
        ],
        extraData: {
          uiTitle: "Completed",
          uiIcon: "complete",
          uiText: "DELIVERY COMPLETE",
          uiColor: "#c25959",
        },
      },
    ],
  },
  {
    id: "quest-spare-parts",
    description: "Gopal's Spare Parts",
    steps: [
      {
        id: "mechanic-gopal",
        texts: [
          "Hey! Could you carry this toolkit over to my sister at the bazaar? She sells flowers there.",
          "I'd go myself but this scooter isn't going to fix itself.",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "flowerseller",
          uiText: "Take Gopal's toolkit to Radha in the bazaar",
          uiColor: "#f3c258",
          receiveModel: "toolkit",
        },
      },
      {
        id: "flower-radha",
        texts: [
          "Oh, Gopal's tools! He keeps forgetting these at my stall.",
          "Here — take him some sweets as thanks. And tell him to actually come visit sometime.",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "workshop",
          uiText: "Bring the sweets back to Gopal at his workshop",
          uiColor: "#f3c258",
          receiveModel: "sweets",
        },
      },
      {
        id: "mechanic-gopal",
        texts: ["Sweets? Now that's a proper thank-you.", "Alright, alright, I'll visit her this weekend."],
        extraData: {
          uiTitle: "Completed",
          uiIcon: "complete",
          uiText: "DELIVERY COMPLETE",
          uiColor: "#f3c258",
        },
      },
    ],
  },
  {
    id: "quest-pump",
    description: "The Water Pump Mix-Up",
    steps: [
      {
        id: "mill-worker-a",
        texts: [
          "Hey, can you help sort something out? A parts order got sent to the wrong desk this week.",
          "Go check with Dr. Rao — she's stationed near the temple hillside.",
        ],
        extraData: {
          uiTitle: "Next Up",
          uiIcon: "rao",
          uiText: "Find Dr. Rao near the temple hillside",
          uiColor: "#66bde6",
        },
      },
      {
        id: "engineer-rao",
        texts: [
          "Oh — yes, I opened a crate by mistake. Pipe fittings, I think, for a well pump.",
          "That's probably meant for Dr. Iyer at the mill. Which means MY valve set went to her instead!",
          "Could you swap these back? Tell her I don't need the spare gauge anymore, either.",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "iyer",
          uiText: "Take the pipe fittings to Dr. Iyer at the mill",
          uiColor: "#66bde6",
          receiveModel: "crate",
        },
      },
      {
        id: "engineer-iyer",
        texts: [
          "Ah, so that's where these went. Thank you.",
          "Wait — 40 metres of irrigation hose? That definitely wasn't on my order either. Someone in procurement is having a very confusing week.",
        ],
        extraData: {
          uiTitle: "Completed",
          uiIcon: "complete",
          uiText: "DELIVERY COMPLETE",
          uiColor: "#66bde6",
        },
      },
    ],
  },
  {
    id: "quest-offering",
    description: "An Offering for the Temple",
    steps: [
      {
        id: "amma",
        texts: [
          "Beta, could you carry this offering up to the temple for me?",
          "My knees don't take kindly to that hill anymore.",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "temple",
          uiText: "Carry Amma's offering up to the hilltop temple",
          uiColor: "#8cc48c",
          receiveModel: "offering",
        },
      },
      {
        id: "priest-baba",
        texts: ["Ah, laddoos and marigolds.", "Amma never forgets a Tuesday."],
        extraData: {
          uiTitle: "Completed",
          uiIcon: "complete",
          uiText: "DELIVERY COMPLETE",
          uiColor: "#8cc48c",
        },
      },
    ],
  },
  {
    id: "quest-diary",
    description: "The River-Found Diary",
    steps: [
      {
        id: "boatman-deva",
        texts: [
          "Look at this! Found an old tin box half-buried near the ghat steps this morning.",
          "There's a notebook inside, soaked through, but I can just make out 'Iqbal' on the cover page.",
          "I know a musician named Iqbal who plays out by the mango grove — think it's the same one?",
        ],
        extraData: {
          uiTitle: "Package Received",
          uiIcon: "musician",
          uiText: "Take the old notebook to Ustad Iqbal near the grove",
          uiColor: "#de794e",
          receiveModel: "notebook",
        },
      },
      {
        id: "musician-iqbal",
        texts: [
          "A notebook? From the river? Wait... this is my handwriting.",
          "I must have dropped it thirty years ago, right off the ghat steps.",
          "Let's see what young Iqbal had to say for himself...",
          '"Practice every single morning, no excuses."',
          '"Learn one new raag a year, not more, not less."',
          '"And never, ever perform without chai first."',
          "...two out of three isn't bad, I suppose.",
        ],
        extraData: {
          uiTitle: "Completed",
          uiIcon: "complete",
          uiText: "DELIVERY COMPLETE",
          uiColor: "#de794e",
        },
      },
    ],
  },
]

/* ------------------------------------------------------------------ emojis */

export const EMOJIS = [
  "smile",
  "laugh",
  "sad",
  "annoyed",
  "love",
  "surprised",
  "sleepy",
  "wave",
  "ok",
  "star",
] as const

/* ------------------------------------------------------- character physics */

export const PHYSICS = {
  /** x1.15 for the 1.6x world */
  jumpForce: 0.16675,
  positionForce: 0.0055,
  /**
   * Retuned x1.15 alongside jumpForce so air time is unchanged (28.4 frames
   * either way) while the apex rises 1.031 -> 1.185u. The character and every
   * prop keep their old size, so absolute jump height must NOT scale by 1.6 —
   * the player still has to clear the same 2.2u mill blocks.
   */
  gravity: -0.01173,
  damp: 0.91,
  dampIdle: 0.62,
  /** 1.35 * (1.55 / 1.4) so sprint lands on x1.55 once walk is x1.4 */
  sprintSpeed: 1.4946,
  capsuleRadius: 0.2,
  floorDetectInclination: 0.7,
}

export const INITIAL_CHARACTER = {
  position: [-16, 57.6, 22.4] as Vec3,
  /**
   * [1] feeds `+ 1.4` in Player's camera block, so 1.36 gives a 2.76 lift —
   * the old 2.4 x1.15. [2] is the trail distance, 5 x1.25.
   */
  relativeCameraPosition: [0, 1.36, 6.25] as Vec3,
  relativeCameraOffset: [-0.65, 0, 1] as Vec3,
}

export const WATER_LEVEL = 33.92
