/**
 * AUTHORED costumes — one hand-written entry per villager.
 *
 * This replaced a Math.sin hash over colour palettes. The hash gave twenty
 * different-looking strangers; it could not give twenty recognisable people,
 * because a flower seller is not a colour, she is a sari, a gajra and a bindi.
 * Every entry below is built so the villager reads from silhouette alone.
 *
 * Garment slots are deliberately few and reused, because each one is an
 * instanced draw call shared by the whole roster: a `skirt` is a sari, a
 * dhoti, a lungi or a robe depending on length and colour; a `vest` is a
 * waistcoat, an apron, an overall bib or a safari jacket.
 */

/** 0 none · 1 cloth cap · 2 head wrap / turban · 3 tall cap · 4 hard hat · 5 sun hat */
export type HatKind = 0 | 1 | 2 | 3 | 4 | 5
/** 0 none · 1 waistcoat · 2 apron · 3 open overshirt · 4 overall bib */
export type VestKind = 0 | 1 | 2 | 3 | 4
/** 0 none · 1 shoulder cloth (pallu, gamchha) · 2 sacred thread · 3 bag strap */
export type SashKind = 0 | 1 | 2 | 3
/** 0 none · 1 stubble · 2 full · 3 long */
export type BeardKind = 0 | 1 | 2 | 3

export type NpcLook = {
  skin: string
  hair: string
  /** upper garment */
  shirt: string
  /** lower garment where legs show */
  pants: string
  shoe: string
  /** overall scale of the 1.8u figure */
  height: number
  /** torso/pelvis width multiplier — portly, average or slight */
  build: number
  /** hem height in world units above the foot; 0 = trousers, no skirt */
  skirt: number
  skirtColor: string
  vest: VestKind
  vestColor: string
  hat: HatKind
  hatColor: string
  sash: SashKind
  sashColor: string
  /** short sleeves are the default; 0 = sleeveless (vest / bare-armed) */
  sleeve: number
  glasses: boolean
  beard: BeardKind
  moustache: boolean
  /** bindi or tilak colour; "" for none */
  mark: string
  barefoot: boolean
  /** animation offset so nobody breathes or steps in sync */
  phase: number
}

const D = {
  skinLight: "#c99a67",
  skinMid: "#b5814e",
  skinDeep: "#9a6636",
  skinWeathered: "#8d5a2e",
  hairBlack: "#1f1a16",
  hairGrey: "#8d8880",
  hairWhite: "#d8d3c8",
  white: "#e8e3d6",
  offWhite: "#dcd6c6",
  ink: "#2f2b26",
}

export const LOOKS: Record<string, NpcLook> = {
  // ---- KR Market -------------------------------------------------------
  /** government-office clerk: half-sleeve shirt tucked in, lanyard, sandals */
  "raju-clerk": {
    skin: D.skinMid, hair: D.hairBlack, shirt: "#a8c4d8", pants: "#4a4d55",
    shoe: "#3a3630", height: 0.99, build: 0.98, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 3, sashColor: "#8a7a5c",
    sleeve: 1, glasses: false, beard: 0, moustache: true, mark: "", barefoot: false,
    phase: 0.07,
  },
  /** the safari suit — the uniform of every mid-level Indian manager */
  "manager-verma": {
    skin: D.skinMid, hair: "#3a332b", shirt: "#c8bd9c", pants: "#c8bd9c",
    shoe: "#2f2b26", height: 1.0, build: 1.12, skirt: 0, skirtColor: "",
    vest: 3, vestColor: "#bdb08e", hat: 0, hatColor: "", sash: 0, sashColor: "",
    sleeve: 1, glasses: true, beard: 0, moustache: true, mark: "", barefoot: false,
    phase: 0.31,
  },
  /** vest under an open checked shirt, lungi to the knee, towel on the shoulder */
  "chai-wala": {
    skin: D.skinDeep, hair: D.hairBlack, shirt: D.white, pants: "#7a6a52",
    shoe: "#5a5048", height: 0.97, build: 1.0, skirt: 0.62, skirtColor: "#9c8b6a",
    vest: 3, vestColor: "#7e5a4a", hat: 0, hatColor: "", sash: 1, sashColor: "#e2ded2",
    sleeve: 0, glasses: false, beard: 1, moustache: true, mark: "", barefoot: false,
    phase: 0.53,
  },
  /** magenta sari with a gold border, jasmine in her bun, red bindi */
  "flower-radha": {
    skin: D.skinMid, hair: D.hairBlack, shirt: "#c2185b", pants: "#c2185b",
    shoe: "#8a6a4a", height: 0.95, build: 1.0, skirt: 0.08, skirtColor: "#c2185b",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 1, sashColor: "#e8b93a",
    sleeve: 1, glasses: false, beard: 0, moustache: false, mark: "#c0392b",
    barefoot: true, phase: 0.79,
  },
  /** office wear, laptop-bag strap, earphones — a techie commuting home */
  "coder-priya": {
    skin: D.skinLight, hair: "#20242e", shirt: "#2f8f9c", pants: "#2f3340",
    shoe: "#3a3630", height: 0.96, build: 0.94, skirt: 0.72, skirtColor: "#2f8f9c",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 3, sashColor: "#3b3f4a",
    sleeve: 1, glasses: true, beard: 0, moustache: false, mark: "", barefoot: false,
    phase: 0.18,
  },
  /** bare-chested, gamchha over the shoulder, checked lungi, sun-dark */
  "boatman-deva": {
    skin: D.skinWeathered, hair: "#2b2420", shirt: D.skinWeathered, pants: "#6a7a6a",
    shoe: "#000000", height: 1.0, build: 1.02, skirt: 0.55, skirtColor: "#7c8f76",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 1, sashColor: "#d8cfae",
    sleeve: 0, glasses: false, beard: 1, moustache: true, mark: "", barefoot: true,
    phase: 0.44,
  },

  // ---- Binny Mills -----------------------------------------------------
  /** cotton work shirt, dhoti hitched up, gamchha tied round the head */
  "mill-worker-a": {
    skin: D.skinDeep, hair: "#2b2420", shirt: "#7d94a6", pants: "#b8ad92",
    shoe: "#000000", height: 1.0, build: 0.98, skirt: 0.5, skirtColor: "#cfc4a8",
    vest: 0, vestColor: "", hat: 2, hatColor: "#d8cfae", sash: 0, sashColor: "",
    sleeve: 1, glasses: false, beard: 1, moustache: true, mark: "", barefoot: true,
    phase: 0.62,
  },
  /** older hand: olive shirt, work trousers, cloth cap */
  "mill-worker-b": {
    skin: D.skinMid, hair: "#4a423a", shirt: "#6e7a52", pants: "#54503f",
    shoe: "#4a4238", height: 1.02, build: 1.05, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 1, hatColor: "#5c5647", sash: 0, sashColor: "",
    sleeve: 1, glasses: false, beard: 0, moustache: true, mark: "", barefoot: false,
    phase: 0.24,
  },
  /** the youngest hand: sleeveless vest, gamchha at the waist, bare feet */
  "mill-worker-c": {
    skin: D.skinDeep, hair: "#191410", shirt: D.offWhite, pants: "#8a7f66",
    shoe: "#000000", height: 0.97, build: 0.92, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 1, sashColor: "#c9bf9c",
    sleeve: 0, glasses: false, beard: 0, moustache: false, mark: "", barefoot: true,
    phase: 0.88,
  },
  /** engineer: white short sleeves, tie, hard hat, heavy black frames */
  "engineer-iyer": {
    skin: D.skinLight, hair: "#2b2420", shirt: D.white, pants: "#3f4450",
    shoe: "#2f2b26", height: 1.0, build: 1.0, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 4, hatColor: "#e8b93a", sash: 2, sashColor: "#8c2f2f",
    sleeve: 1, glasses: true, beard: 0, moustache: true, mark: "", barefoot: false,
    phase: 0.36,
  },

  // ---- elsewhere -------------------------------------------------------
  /** prosperous: cream kurta, maroon bandhgala waistcoat, gold watch, portly */
  "boss-verma-senior": {
    skin: D.skinLight, hair: D.hairWhite, shirt: "#efe6cf", pants: "#efe6cf",
    shoe: "#4a3a2a", height: 1.03, build: 1.3, skirt: 0.42, skirtColor: "#efe6cf",
    vest: 1, vestColor: "#7b2d3b", hat: 0, hatColor: "", sash: 0, sashColor: "",
    sleeve: 1, glasses: true, beard: 0, moustache: true, mark: "", barefoot: false,
    phase: 0.71,
  },
  /** kid: untucked school shirt, khaki shorts, scuffed canvas shoes */
  "kid-chintu": {
    skin: D.skinMid, hair: "#171310", shirt: D.white, pants: "#a8925c",
    shoe: "#d8d3c4", height: 0.78, build: 0.9, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 0, sashColor: "",
    sleeve: 1, glasses: false, beard: 0, moustache: false, mark: "", barefoot: false,
    phase: 0.11,
  },
  /** saffron robe off one shoulder, rudraksha, matted topknot, long grey beard */
  "sadhu-wanderer": {
    skin: D.skinWeathered, hair: "#6b6259", shirt: "#e07b2a", pants: "#e07b2a",
    shoe: "#000000", height: 1.02, build: 0.96, skirt: 0.34, skirtColor: "#e07b2a",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 1, sashColor: "#c96a1e",
    sleeve: 0, glasses: false, beard: 3, moustache: true, mark: "#d8cfae",
    barefoot: true, phase: 0.95,
  },
  /** senior engineer: safari shirt, sun hat, trimmed white beard, drawings */
  "engineer-rao": {
    skin: D.skinLight, hair: D.hairGrey, shirt: "#cbc3a4", pants: "#5a5442",
    shoe: "#4a4238", height: 1.0, build: 1.06, skirt: 0, skirtColor: "",
    vest: 0, vestColor: "", hat: 5, hatColor: "#ddd3ac", sash: 0, sashColor: "",
    sleeve: 1, glasses: true, beard: 2, moustache: true, mark: "", barefoot: false,
    phase: 0.49,
  },
  /** white dhoti, bare chest, sacred thread, tilak, shaved head, white beard */
  "priest-baba": {
    skin: D.skinMid, hair: D.hairWhite, shirt: D.skinMid, pants: D.white,
    shoe: "#000000", height: 1.0, build: 1.04, skirt: 0.34, skirtColor: D.white,
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 2, sashColor: "#f2ede0",
    sleeve: 0, glasses: false, beard: 2, moustache: true, mark: "#e0742a",
    barefoot: true, phase: 0.27,
  },
  /** older woman: plain cotton sari, grey shawl, small bun, spectacles */
  amma: {
    skin: "#b08055", hair: D.hairGrey, shirt: "#e4dccb", pants: "#e4dccb",
    shoe: "#7a6a58", height: 0.9, build: 1.0, skirt: 0.08, skirtColor: "#e4dccb",
    vest: 0, vestColor: "", hat: 0, hatColor: "", sash: 1, sashColor: "#9aa79a",
    sleeve: 1, glasses: true, beard: 0, moustache: false, mark: "#c0392b",
    barefoot: true, phase: 0.66,
  },
  /** musician: long pale kurta, churidar, black Rampuri cap, white beard */
  "musician-iqbal": {
    skin: D.skinMid, hair: D.hairWhite, shirt: "#bcd0b4", pants: "#e0dac9",
    shoe: "#6a5a44", height: 1.0, build: 1.04, skirt: 0.55, skirtColor: "#bcd0b4",
    vest: 0, vestColor: "", hat: 3, hatColor: "#2b2723", sash: 0, sashColor: "",
    sleeve: 1, glasses: false, beard: 2, moustache: true, mark: "", barefoot: false,
    phase: 0.83,
  },
  /** dark blue overalls, sleeves rolled, oil stains, red rag at the hip */
  "mechanic-gopal": {
    skin: D.skinDeep, hair: "#221c18", shirt: "#3b4a63", pants: "#3b4a63",
    shoe: "#2f2b26", height: 1.0, build: 1.0, skirt: 0, skirtColor: "",
    vest: 4, vestColor: "#33415a", hat: 0, hatColor: "", sash: 3, sashColor: "#b5382c",
    sleeve: 0, glasses: false, beard: 1, moustache: true, mark: "", barefoot: false,
    phase: 0.41,
  },

  // ---- animals get a look only for the nameplate colour ------------------
  "street-dog": {
    skin: "#c49a5e", hair: "#7a5a34", shirt: "#c49a5e", pants: "#c49a5e",
    shoe: "", height: 1, build: 1, skirt: 0, skirtColor: "", vest: 0, vestColor: "",
    hat: 0, hatColor: "", sash: 0, sashColor: "", sleeve: 0, glasses: false,
    beard: 0, moustache: false, mark: "", barefoot: true, phase: 0.15,
  },
  peacock: {
    skin: "#1f6f8b", hair: "#2f8f6f", shirt: "#1f6f8b", pants: "#1f6f8b",
    shoe: "", height: 1, build: 1, skirt: 0, skirtColor: "", vest: 0, vestColor: "",
    hat: 0, hatColor: "", sash: 0, sashColor: "", sleeve: 0, glasses: false,
    beard: 0, moustache: false, mark: "", barefoot: true, phase: 0.58,
  },
}

const FALLBACK: NpcLook = LOOKS["raju-clerk"]

export function lookFor(id: string): NpcLook {
  return LOOKS[id] ?? FALLBACK
}
