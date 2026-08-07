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
  { id: "bazaar", text: "KR Market", center: [25.2, 11.0, 2.3], radius: 9 },
  { id: "mill", text: "Binny Mills", center: [-7.8, 4.2, -29.3], radius: 18 },
  { id: "ghat", text: "Cauvery Riverside", center: [9.36, -15.95, -14.33], radius: 10 },
  { id: "haveli", text: "Bengaluru Palace", center: [-14.4, -6.1, 27.0], radius: 9 },
  { id: "grove", text: "Dodda Alada Mara", center: [-8.8, -19.2, 2.5], radius: 13 },
  { id: "samadhi", text: "SP Road", center: [27.7, -14.2, 13.4], radius: 8 },
  { id: "workshop", text: "Gopal's Garage", center: [-21.7, -6.8, 6.3], radius: 5.5 },
  { id: "temple", text: "Nandi Betta Temple", center: [-10.2, 34.8, -3.8], radius: 8 },
  { id: "beach", text: "Sampangi Kere", center: [-13.1, 15.6, -1.8], radius: 8 },
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
  jumpForce: 0.145,
  positionForce: 0.0055,
  gravity: -0.0102,
  damp: 0.91,
  dampIdle: 0.62,
  sprintSpeed: 1.35,
  capsuleRadius: 0.2,
  floorDetectInclination: 0.7,
}

export const INITIAL_CHARACTER = {
  position: [-10, 36, 14] as Vec3,
  relativeCameraPosition: [0, 1, 5] as Vec3,
  relativeCameraOffset: [-0.65, 0, 1] as Vec3,
}

export const WATER_LEVEL = 21.2
