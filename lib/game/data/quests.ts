/**
 * Quest and delivery chain definitions for the Dak Wala world.
 *
 * Edit this file to add, reorder, or rewrite quests and their dialogue
 * without touching any logic files.
 *
 * Quest structure:
 *   - Each Quest has a list of Steps.
 *   - Each Step is tied to an NPC by id.
 *   - Steps are resolved in order: the player must visit each NPC in sequence.
 *   - `receiveModel` (optional) causes the player to start carrying an item
 *     after this step's dialogue finishes. The next step will be gated until
 *     the player is carrying that item.
 *
 * UI fields in `extraData`:
 *   - `uiTitle`  — small label above the notification (e.g. "Next Up", "Completed")
 *   - `uiIcon`   — icon key used by the HUD (string identifier)
 *   - `uiText`   — main body text of the quest notification
 *   - `uiColor`  — accent hex colour for the quest toast
 */

export type QuestStep = {
  id: string      // NPC id that triggers this step
  texts: string[] // Dialogue lines spoken by the NPC at this step
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
