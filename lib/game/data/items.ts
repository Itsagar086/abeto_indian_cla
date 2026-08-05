/**
 * Carried item definitions for Dak Wala.
 *
 * Items are the physical objects the player carries between NPCs during quests.
 * The `id` of each item matches the `receiveModel` string used in quests.ts.
 *
 * Edit this file to add new item types, rename items, or add descriptions
 * without touching any quest logic.
 */

export type ItemId =
  | "letter"
  | "toolkit"
  | "sweets"
  | "crate"
  | "offering"
  | "notebook"

export type ItemDefinition = {
  id: ItemId
  displayName: string
  description: string
}

export const ITEMS: ItemDefinition[] = [
  {
    id: "letter",
    displayName: "Letter",
    description: "A sealed reply from Seth Rajwada to Raju the clerk.",
  },
  {
    id: "toolkit",
    displayName: "Gopal's Toolkit",
    description: "A well-worn set of mechanic's tools, smelling faintly of engine oil.",
  },
  {
    id: "sweets",
    displayName: "Box of Sweets",
    description: "A small tin of homemade mithai, tied with string.",
  },
  {
    id: "crate",
    displayName: "Pipe Fittings Crate",
    description: "A wooden crate of brass pipe fittings, mislabelled and misdelivered.",
  },
  {
    id: "offering",
    displayName: "Temple Offering",
    description: "A carefully wrapped bundle of laddoos and fresh marigolds.",
  },
  {
    id: "notebook",
    displayName: "River-Found Notebook",
    description: "A waterlogged notebook recovered from a tin box near the ghat steps.",
  },
]
