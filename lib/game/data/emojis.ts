/**
 * Emoji vocabulary for the Dak Wala world.
 *
 * This list defines the named emotion states that NPCs and the player
 * can express. Edit to add or remove emotion types.
 */
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

export type EmojiName = (typeof EMOJIS)[number]
