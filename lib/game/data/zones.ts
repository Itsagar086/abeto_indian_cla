/**
 * Zone definitions for the Dak Wala world.
 *
 * A zone is a named area on the planet with a centre position and radius.
 * Edit this file to add, remove, or relocate areas of the map.
 * Changing zones also affects terrain anchors, road connections, and prop placement.
 */

/** 3-component world-space position [x, y, z]. */
export type Vec3 = [number, number, number]

export type Zone = {
  id: string
  text: string
  center: Vec3
  radius: number
}

export const ZONES: Zone[] = [
  { id: "bazaar",   text: "Sarafa Bazaar",         center: [ 25.2,  11.0,   2.3], radius:  9 },
  { id: "mill",     text: "Ashoka Textile Mill",    center: [ -7.8,   4.2, -29.3], radius: 18 },
  { id: "ghat",     text: "Ganga Ghat",             center: [  8.1, -13.8, -12.4], radius: 10 },
  { id: "haveli",   text: "Rajwada Haveli",         center: [-14.4,  -6.1,  27.0], radius:  9 },
  { id: "grove",    text: "Amba Mango Grove",       center: [ -8.8, -19.2,   2.5], radius: 13 },
  { id: "samadhi",  text: "Peepal Tree Ground",     center: [ 27.7, -14.2,  13.4], radius:  8 },
  { id: "workshop", text: "Gopal's Workshop",       center: [-21.7,  -6.8,   6.3], radius:  5.5 },
  { id: "temple",   text: "Hilltop Shiva Temple",   center: [-10.2,  34.8,  -3.8], radius:  8 },
  { id: "beach",    text: "Nadi Kinara",            center: [-13.1,  15.6,  -1.8], radius:  8 },
]
