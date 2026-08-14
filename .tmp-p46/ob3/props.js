import * as THREE from "three";
import { ZONES, NPCS, WATER_LEVEL } from "./data.js";
import { surfacePoint, surfaceQuaternion, rng, roadDistance, terrainRadius, terrainColor, npcSurfacePosition, slopeAt, METRO_LOOP, } from "./terrain.js";
const PALETTE = {
    bazaar: [
        ["#d97b3a", "#f2d9a8"],
        ["#c25959", "#f2e6d0"],
        ["#3f7f8c", "#f2e6d0"],
        ["#9c6ea0", "#f2e6d0"],
    ],
    haveli: [["#c9a876", "#8a5a3a"]],
    mill: [["#9a8a6a", "#5a5044"]],
    workshop: [["#7a7264", "#4a4438"]],
    temple: [["#e8d9a8", "#c9973a"]],
    ghat: [["#c9b48f", "#8a7355"]],
    grove: [["#5e8339", "#3f5c26"]],
    samadhi: [["#c9b48f", "#7a6a52"]],
    beach: [["#e0c191", "#c9a876"]],
};
/** props whose colours belong to the object itself, not to its zone palette */
const KIND_COLORS = {
    banyan: ["#6b4a2f", "#4e7a34"],
    palace: ["#e8dcc0", "#8a4a3a"],
    guardrail: ["#f2f0e8", "#d8d5cb"],
    "utility-pole": ["#6a5a48", "#4d4136"],
    "grass-tuft": ["#7dbb5a", "#5f9444"],
    wire: ["#2a2a2a", "#1e1e1e"],
    "traffic-signal": ["#2f2b26", "#1d1a17"],
    "zone-signboard": ["#1e5a3a", "#ffffff"],
    "metro-pillar": ["#b8b2a6", "#9a948a"],
    "metro-track": ["#9a948a", "#7f7a71"],
    "metro-station": ["#cfcabf", "#1e5a3a"],
    "bridge-deck": ["#cfc8ba", "#a89e90"],
    "bridge-rail": ["#f2f0e8", "#d8d5cb"],
    "bridge-pier": ["#a89e90", "#8d8478"],
    gopuram: ["#c9a876", "#b0453a"],
    "nandi-statue": ["#4a4442", "#4a4442"],
    "temple-court": ["#c9b48f", "#a89272"],
    "temple-steps": ["#c9b48f", "#a89272"],
    // paver tone with a slightly darker rim, so a reserved plot reads as ground
    // that has been claimed rather than as a building
    "civic-pad": ["#cfc4ae", "#a4998a"],
};
/* ------------------------------------------------------------- namma metro */
const ZONE_DIRS = ZONES.map((z) => new THREE.Vector3(...z.center).normalize());
const METRO_ORDER = METRO_LOOP.order;
export const METRO_ZONE_IDS = METRO_ORDER.map((i) => ZONES[i].id);
export const METRO_TOUR_LENGTH = (() => {
    let s = 0;
    for (let i = 0; i < METRO_ORDER.length; i++) {
        s += ZONE_DIRS[METRO_ORDER[i]].angleTo(ZONE_DIRS[METRO_ORDER[(i + 1) % METRO_ORDER.length]]);
    }
    return s;
})();
/* ------------------------------------------------------------ deck profile */
const DECK_SMOOTH = 7;
const DECK_RISE = 8;
const DECK_MIN_CLEAR = 6.4;
const DECK_WATER = WATER_LEVEL + 4.8;
/** generous on purpose: a tight limit ratchets the deck up over rough ground */
const DECK_MAX_STEP = 0.4;
const PILLAR_STEP = 0.075;
/** slide offsets tried when a footing lands on a villager, nearest first */
const PILLAR_NUDGES = [0.01, -0.01, 0.02, -0.02, 0.03, -0.03];
/**
 * Reaching past a temple approach cone can need more room than stepping off a
 * villager does — a cone is 4u across — so that case gets a longer window. It is
 * kept separate rather than widening the list above, because a longer window
 * also rescues footings that P24 deliberately skipped, and that would add
 * pillars and shift every downstream seed for no sightline gain. Every value
 * stays under PILLAR_STEP so a footing never walks onto the next one's ground.
 */
const PILLAR_NUDGES_WIDE = [
    ...PILLAR_NUDGES, 0.04, -0.04, 0.05, -0.05, 0.06, -0.06,
];
/* ---------------------------------------------------------- station siting */
const STATION_LEAD = 0.3;
const SLIDE_STEP = 0.02;
const SLIDE_MAX = 0.2;
/** required world clearance from big props (scale >= 1) and from small ones */
const CLEAR_BIG = 5.6;
const CLEAR_SMALL = 1.92;
let NET = null;
/**
 * Buildings and trees need real room; street furniture only needs not to be
 * inside the pier. Classified by kind rather than by `scale`, because every
 * guardrail, pole and grass tuft is pushed with scale 1 — a literal
 * scale-based rule would demand 3.5u from every tuft and no site would exist.
 */
const BULKY_KINDS = new Set([
    "stall",
    "market-umbrella",
    "haveli-arch",
    "palace",
    "mill-block",
    "workshop-shed",
    "ghat-steps",
    "mango-tree",
    "banyan",
    "peepal-tree",
    "zone-signboard",
]);
/**
 * Ground-footprint half-extents [x, z] in local units, before the prop's own
 * `scale`, measured off the geometry in PropsLayer. Only kinds listed here are
 * re-sited away from the arterial corridors; adding a kind opts it in.
 *
 * palace        corner-tower cones reach x +-1.67, entrance face z -0.66
 * workshop-shed the roof cone is a 4-gon spun PI/4, so its vertices sit at 1.6
 */
const FOOTPRINT = {
    palace: [1.67, 0.66],
    "workshop-shed": [1.6, 1.6],
};
/**
 * How far a building's wall line must stand off the corridor centreline.
 * Decoupled from SKIRT_OUT: when the shoulder widened to 5.55 the setback
 * silently rode along, pushing shopfronts 1.6u from the footpath. 5.1 is the
 * measured knee — the shoulder's rise above natural ground is at most 0.26u
 * there (vs 0.71u at the old 4.55), which the buildings' 0.8u below-grade
 * walls absorb, and a Bengaluru street wants its shopfronts close.
 */
const BUILDING_SETBACK = 5.1;
/** perimeter samples per box edge when testing a footprint against a corridor */
const FOOT_SAMPLES = 8;
const _footV = new THREE.Vector3();
/**
 * Does this footprint clear every corridor, testing the box outline rather than
 * the centre? A circumscribed radius is not enough: corridors converge at each
 * zone centre, and in that wedge the distance field bends enough that a centre
 * measuring 4.64u clear still had a corner 2.24u in.
 */
function footprintClear(dir, box, scale, spin) {
    const quat = surfaceQuaternion(dir, spin);
    const origin = surfacePoint(dir, 0);
    const [hx, hz] = box;
    for (let e = 0; e < 4; e++) {
        for (let i = 0; i <= FOOT_SAMPLES; i++) {
            const t = (i / FOOT_SAMPLES) * 2 - 1;
            if (e === 0)
                _footV.set(t * hx, 0, hz);
            else if (e === 1)
                _footV.set(t * hx, 0, -hz);
            else if (e === 2)
                _footV.set(hx, 0, t * hz);
            else
                _footV.set(-hx, 0, t * hz);
            _footV.multiplyScalar(scale).applyQuaternion(quat).add(origin).normalize();
            if (arterialDistance(_footV) < BUILDING_SETBACK)
                return false;
        }
    }
    return true;
}
/** how far out the corridor search will walk, and in what increments */
const SITE_DIST_STEP = 0.25;
const SITE_MAX_DIST = 12;
/** bearings tried at each distance: authored first, then alternating outward */
const SITE_TURNS = (() => {
    const turns = [0];
    for (let i = 1; i <= 16; i++)
        turns.push((i * Math.PI) / 16, (-i * Math.PI) / 16);
    return turns;
})();
/**
 * Where the villagers actually stand. Structures must not be dropped on top of
 * them: an NPC is person-sized, so the small-prop rule applies. Built lazily so
 * it never runs before terrain.ts has finished initialising.
 */
let _npcSpots = null;
function npcSpots() {
    if (!_npcSpots)
        _npcSpots = NPCS.map((n) => npcSurfacePosition(n.position));
    return _npcSpots;
}
/** distance from `pos` to the nearest villager, and whether it clears */
function npcClearance(pos) {
    let nearest = Infinity;
    for (const p of npcSpots()) {
        const d = pos.distanceTo(p);
        if (d < nearest)
            nearest = d;
    }
    return { ok: nearest >= CLEAR_SMALL, nearest };
}
/** smallest distance from `pos` to any already-placed prop, and whether it clears */
function propClearance(pos, placed) {
    let nearest = Infinity;
    let ok = true;
    for (const p of placed) {
        if (p.kind === "wire")
            continue; // no footprint, floats in the air
        const d = pos.distanceTo(p.position);
        if (d < nearest)
            nearest = d;
        if (d < (BULKY_KINDS.has(p.kind) ? CLEAR_BIG : CLEAR_SMALL))
            ok = false;
    }
    return { ok, nearest };
}
/** structures whose entrance must keep a clear view down its own approach */
const SIGHTLINE_KINDS = new Set(["gopuram", "temple-court"]);
/** how far down the approach the view is protected, and the cone's half-angle */
const SIGHTLINE_REACH = 4;
const SIGHTLINE_HALF = Math.PI / 4;
/**
 * The approach cones in front of the temple entrances. aimAtZone (P19) put each
 * doorway on local -Z, so that axis carried through the prop's own quaternion is
 * the direction the entrance looks — outward from the summit, down the stepped
 * climb. Reading it back off the quaternion rather than recomputing the tangent
 * keeps this true to however the piece was actually aimed.
 */
function sightlines(placed) {
    const out = [];
    for (const p of placed) {
        if (!SIGHTLINE_KINDS.has(p.kind))
            continue;
        const up = p.position.clone().normalize();
        const face = new THREE.Vector3(0, 0, -1).applyQuaternion(p.quaternion);
        face.addScaledVector(up, -face.dot(up)); // flatten onto the ground plane
        if (face.lengthSq() < 1e-10)
            continue;
        out.push({ at: p.position.clone(), up, face: face.normalize() });
    }
    return out;
}
/** does `spot` stand inside a protected approach cone? */
function blocksSightline(spot, lines) {
    const limit = Math.cos(SIGHTLINE_HALF);
    for (const s of lines) {
        const v = spot.clone().sub(s.at);
        v.addScaledVector(s.up, -v.dot(s.up));
        const d = v.length();
        if (d < 1e-6 || d > SIGHTLINE_REACH)
            continue;
        if (v.divideScalar(d).dot(s.face) >= limit)
            return true;
    }
    return false;
}
/** rotate `from` toward `toward` by `angle` radians along their great circle */
function advance(from, toward, angle) {
    const tan = arcTangent(from, toward);
    if (!tan)
        return from.clone();
    return from.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tan, Math.sin(angle)).normalize();
}
/**
 * A station sits STATION_LEAD out from its zone centre along the loop. If that
 * lands on a building, a road ribbon or in the water it slides along the loop
 * until it is clear.
 */
function siteStations(placed, 
/** samples the finished loop by arc length — stations ride the curve now */
onLoop, 
/** arc-length position of each zone centre along that loop, in METRO_ORDER */
zoneT, total) {
    const sites = [];
    const n = METRO_ORDER.length;
    const _stationV = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
        const zi = METRO_ORDER[i];
        // never lead more than 40% of the way to the next zone: on the short
        // beach->temple leg a flat 0.3 rad would land in the temple's own props
        const legLength = (((zoneT[(i + 1) % n] - zoneT[i]) % total) + total) % total;
        const lead = Math.min(STATION_LEAD, 0.4 * legLength);
        const offsets = [0];
        for (let s = SLIDE_STEP; s <= SLIDE_MAX + 1e-9; s += SLIDE_STEP) {
            offsets.push(s, -s);
        }
        /**
         * Three passes, loosening one constraint at a time. The metro parallels the
         * road network by construction — both connect the same nine zones — so on
         * some legs no site within the slide range is off every ribbon. An elevated
         * station straddling a road is realistic, so that is the constraint that
         * gives way first; prop clearance and dry land never do.
         */
        let chosen = null;
        let chosenOffset = 0;
        let chosenClear = 0;
        let chosenPass = 0;
        let best = null;
        for (let pass = 1; pass <= 3 && !chosen; pass++) {
            for (const off of offsets) {
                // read the candidate off the loop instead of walking the great circle:
                // the curve is now anchored on the zone centres, so a station placed by
                // arc length lands exactly on the track it is meant to serve
                const dir = onLoop(zoneT[i] + lead + off, _stationV).clone();
                const ground = terrainRadius(dir);
                if (ground < WATER_LEVEL + 0.48)
                    continue;
                if (pass === 1 && roadDistance(dir) < RIBBON_CLEAR)
                    continue;
                const pos = dir.clone().multiplyScalar(ground);
                const prop = propClearance(pos, placed);
                const npc = npcClearance(pos);
                const ok = prop.ok && npc.ok;
                const nearest = Math.min(prop.nearest, npc.nearest);
                if (!best || nearest > best.clear)
                    best = { dir, off, clear: nearest };
                if (ok) {
                    chosen = dir;
                    chosenOffset = off;
                    chosenClear = nearest;
                    chosenPass = pass;
                    break;
                }
            }
        }
        if (!chosen && best) {
            chosen = best.dir;
            chosenOffset = best.off;
            chosenClear = best.clear;
            chosenPass = 4;
        }
        if (!chosen) {
            chosen = onLoop(zoneT[i] + lead, _stationV).clone();
            chosenPass = 5;
        }
        // the station's own arc position: where it actually sits on the loop, which
        // is now simply where it was sampled from
        const t = (((zoneT[i] + lead + chosenOffset) % total) + total) % total;
        sites.push({
            dir: chosen,
            t,
            info: {
                zone: ZONES[zi].id,
                offset: chosenOffset,
                clearance: chosenClear,
                t,
                pass: chosenPass,
            },
        });
    }
    return sites;
}
/* ------------------------------------------------------------- loop + deck */
function buildNetwork(placed) {
    /**
     * Closed spline through the ZONE CENTRES, in tour order, resampled to even arc
     * steps. It used to be threaded through the station directions instead, which
     * sit ~0.3 rad along each leg — so the curve never passed through a zone at
     * all, and once buildCorridors began following it (P36) the road inherited
     * that drift and wandered up to 13u from the hubs it connects. Anchoring on
     * the zones puts the track, the road, the painted ribbon and the terrain
     * grading back on the same zone-to-zone route; stations are then sited along
     * this curve rather than defining it.
     *
     * The spline geometry itself (control seeding, resample, zone arc positions)
     * lives in terrain.ts as METRO_LOOP so the terrain grading and this network
     * are guaranteed to follow the same curve.
     */
    const { dirs, n, step, total, zoneT } = METRO_LOOP;
    // ground profile -> smoothed -> lifted -> slope limited (raising only)
    const raw = new Float64Array(n);
    const probe = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
        probe.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
        raw[i] = terrainRadius(probe);
    }
    const base = new Float64Array(n);
    for (let i = 0; i < n; i++)
        base[i] = Math.max(raw[i], WATER_LEVEL);
    const smooth = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -DECK_SMOOTH; k <= DECK_SMOOTH; k++) {
            sum += base[(((i + k) % n) + n) % n]; // the loop is closed, so wrap
        }
        smooth[i] = sum / (DECK_SMOOTH * 2 + 1);
    }
    const deck = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        deck[i] = Math.max(smooth[i] + DECK_RISE, raw[i] + DECK_MIN_CLEAR, DECK_WATER);
    }
    // two wrapped passes each way so the closed loop meets itself smoothly
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
            const p = (i - 1 + n) % n;
            deck[i] = Math.max(deck[i], deck[p] - DECK_MAX_STEP);
        }
        for (let i = n - 1; i >= 0; i--) {
            const q = (i + 1) % n;
            deck[i] = Math.max(deck[i], deck[q] - DECK_MAX_STEP);
        }
    }
    // Stations ride the finished curve. They are sited only now, because the
    // curve no longer depends on them — the dependency used to run the other way.
    const sites = siteStations(placed, (t, target) => sampleLoopDirs(dirs, n, step, t, target), zoneT, total);
    const stations = sites.map((s) => s.info);
    const legs = buildSchedule(stations, total);
    const cycle = legs.length ? legs[legs.length - 1].end : 1;
    return { dirs, deck, raw, n, step, total, stations, legs, cycle };
}
/* ---------------------------------------------------------------- schedule */
const TRAIN_DWELL = 3.5;
const TRAIN_RAMP = 2.2;
const TRAIN_CRUISE = 0.14;
function buildSchedule(stations, total) {
    const legs = [];
    const k = stations.length;
    let clock = 0;
    for (let i = 0; i < k; i++) {
        const startT = stations[i].t;
        const dist = (((stations[(i + 1) % k].t - startT) % total) + total) % total;
        let rampTime = TRAIN_RAMP;
        let rampDist = (TRAIN_CRUISE * TRAIN_RAMP) / 2;
        let cruiseTime = 0;
        if (dist >= rampDist * 2) {
            cruiseTime = (dist - rampDist * 2) / TRAIN_CRUISE;
        }
        else {
            // too short to reach cruise: shrink both ramps so they exactly cover it
            rampTime = dist / TRAIN_CRUISE;
            rampDist = dist / 2;
        }
        const start = clock;
        const dwellEnd = start + TRAIN_DWELL;
        const end = dwellEnd + rampTime * 2 + cruiseTime;
        legs.push({ start, dwellEnd, end, startT, dist, rampTime, cruiseTime, rampDist });
        clock = end;
    }
    return legs;
}
/** distance covered `e` seconds into a leg's run — velocity-continuous */
function legDistance(leg, e) {
    if (e <= leg.rampTime) {
        const x = leg.rampTime > 0 ? e / leg.rampTime : 1;
        return TRAIN_CRUISE * leg.rampTime * (x * x * x - (x * x * x * x) / 2);
    }
    if (e <= leg.rampTime + leg.cruiseTime) {
        return leg.rampDist + TRAIN_CRUISE * (e - leg.rampTime);
    }
    const y = leg.rampTime > 0 ? Math.min(1, (e - leg.rampTime - leg.cruiseTime) / leg.rampTime) : 1;
    return (leg.rampDist +
        leg.cruiseTime * TRAIN_CRUISE +
        TRAIN_CRUISE * leg.rampTime * (y - y * y * y + (y * y * y * y) / 2));
}
/* ------------------------------------------------------------ public reads */
export function metroReady() {
    return NET !== null;
}
export function metroStats() {
    if (!NET)
        return null;
    let minLand = Infinity;
    let maxLand = -Infinity;
    let minAll = Infinity;
    let maxAll = -Infinity;
    for (let i = 0; i < NET.n; i++) {
        const h = NET.deck[i] - NET.raw[i];
        minAll = Math.min(minAll, h);
        maxAll = Math.max(maxAll, h);
        if (NET.raw[i] >= WATER_LEVEL) {
            minLand = Math.min(minLand, h);
            maxLand = Math.max(maxLand, h);
        }
    }
    return {
        total: NET.total,
        samples: NET.n,
        stations: NET.stations,
        cycle: NET.cycle,
        minLand,
        maxLand,
        minAll,
        maxAll,
    };
}
/** unit direction on the loop at arc parameter t */
/**
 * Direction at arc length `t` on a resampled loop. Split out from loopDir so
 * station siting can read the curve while it is still being built, before NET
 * exists — the two must sample identically or a station drifts off its track.
 */
function sampleLoopDirs(dirs, n, step, t, target) {
    let x = t / step;
    x = ((x % n) + n) % n;
    const i = Math.floor(x);
    const f = x - i;
    const j = (i + 1) % n;
    target.set(dirs[i * 3] + (dirs[j * 3] - dirs[i * 3]) * f, dirs[i * 3 + 1] + (dirs[j * 3 + 1] - dirs[i * 3 + 1]) * f, dirs[i * 3 + 2] + (dirs[j * 3 + 2] - dirs[i * 3 + 2]) * f);
    return target.normalize();
}
export function loopDir(t, target) {
    if (!NET)
        return target.set(0, 1, 0);
    return sampleLoopDirs(NET.dirs, NET.n, NET.step, t, target);
}
/** deck radius at arc parameter t */
export function deckRadius(t) {
    if (!NET)
        return WATER_LEVEL + 3;
    const { deck, n, step } = NET;
    let x = t / step;
    x = ((x % n) + n) % n;
    const i = Math.floor(x);
    const f = x - i;
    const j = (i + 1) % n;
    return deck[i] + (deck[j] - deck[i]) * f;
}
/** world-space point on the deck at t */
export function deckPoint(t, target) {
    return loopDir(t, target).multiplyScalar(deckRadius(t));
}
const _trainStates = [
    { t: 0, dwelling: false },
    { t: 0, dwelling: false },
];
/** where train `index` is at `time`; the second train runs half a cycle ahead */
export function metroTrainState(time, index) {
    const out = _trainStates[index] ?? _trainStates[0];
    if (!NET || !NET.legs.length) {
        out.t = 0;
        out.dwelling = true;
        return out;
    }
    const cycle = NET.cycle;
    const shifted = time + (index * cycle) / 2;
    const p = ((shifted % cycle) + cycle) % cycle;
    for (let i = 0; i < NET.legs.length; i++) {
        const leg = NET.legs[i];
        if (p >= leg.end)
            continue;
        if (p < leg.dwellEnd) {
            out.t = leg.startT;
            out.dwelling = true;
        }
        else {
            out.t = leg.startT + legDistance(leg, p - leg.dwellEnd);
            out.dwelling = false;
        }
        return out;
    }
    const last = NET.legs[NET.legs.length - 1];
    out.t = last.startT + last.dist;
    out.dwelling = false;
    return out;
}
/* ---------------------------------------------------------------- placement */
/** frame whose +X follows the deck and whose +Y leans away from the planet */
function deckQuaternion(along, radial) {
    const x = along.clone().normalize();
    const y = radial.clone().addScaledVector(x, -radial.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
/** the whole viaduct: pillars, deck segments and nine stations */
function placeMetro(props) {
    NET = buildNetwork(props);
    const net = NET;
    const [pillarA, pillarB] = KIND_COLORS["metro-pillar"] ?? ["#b8b2a6", "#9a948a"];
    const [trackA, trackB] = KIND_COLORS["metro-track"] ?? ["#9a948a", "#7f7a71"];
    const [stationA, stationB] = KIND_COLORS["metro-station"] ?? ["#cfcabf", "#1e5a3a"];
    const dir = new THREE.Vector3();
    let seed = 1500;
    // the temple props are already in `props` by the time the viaduct is laid
    const lines = sightlines(props);
    const steps = Math.max(8, Math.round(net.total / PILLAR_STEP));
    const step = net.total / steps;
    for (let i = 0; i < steps; i++) {
        const nominal = i * step;
        loopDir(nominal, dir);
        const nominalGround = terrainRadius(dir);
        if (nominalGround < WATER_LEVEL + 0.48)
            continue;
        let t = nominal;
        const nominalSpot = dir.clone().multiplyScalar(nominalGround);
        const coned = blocksSightline(nominalSpot, lines);
        if (!npcClearance(nominalSpot).ok || coned) {
            // A footing slides if it would land on a villager or inside a temple
            // approach cone, and only to a spot that is dry, clear of villagers, not
            // on top of a prop — nudging blindly once put a pillar 0.07u into the
            // temple steps — and not itself in a cone.
            let moved = false;
            for (const nudge of coned ? PILLAR_NUDGES_WIDE : PILLAR_NUDGES) {
                const probe = nominal + nudge;
                loopDir(probe, dir);
                const g = terrainRadius(dir);
                if (g < WATER_LEVEL + 0.48)
                    continue;
                const spot = dir.clone().multiplyScalar(g);
                if (!npcClearance(spot).ok)
                    continue;
                if (propClearance(spot, props).nearest < CLEAR_SMALL)
                    continue;
                if (blocksSightline(spot, lines))
                    continue;
                t = probe;
                moved = true;
                break;
            }
            // nowhere clear in the window: leave the gap, the deck spans it
            if (!moved)
                continue;
        }
        loopDir(t, dir);
        const ground = terrainRadius(dir);
        const base = dir.clone().multiplyScalar(ground);
        const top = dir.clone().multiplyScalar(deckRadius(t));
        const ahead = new THREE.Vector3();
        loopDir(t + 0.01, ahead);
        const tangent = ahead.sub(dir).normalize();
        props.push({
            kind: "metro-pillar",
            position: base,
            quaternion: surfaceQuaternion(dir, spinAlong(dir, tangent)),
            scale: 1,
            colorA: pillarA,
            colorB: pillarB,
            seed: seed++,
            aux: [base, top],
        });
    }
    // deck: one segment per pillar step, wrapping closed
    for (let i = 0; i < steps; i++) {
        const t = i * step;
        const endA = new THREE.Vector3();
        const endB = new THREE.Vector3();
        deckPoint(t, endA);
        deckPoint(t + step, endB);
        const mid = endA.clone().add(endB).multiplyScalar(0.5);
        props.push({
            kind: "metro-track",
            position: mid,
            quaternion: deckQuaternion(endB.clone().sub(endA), mid.clone().normalize()),
            scale: 1,
            colorA: trackA,
            colorB: trackB,
            seed: seed++,
            aux: [endA.clone(), endB.clone()],
        });
    }
    net.stations.forEach((st, i) => {
        loopDir(st.t, dir);
        const ground = dir.clone().multiplyScalar(terrainRadius(dir));
        const deck = dir.clone().multiplyScalar(deckRadius(st.t));
        const ahead = new THREE.Vector3();
        loopDir(st.t + 0.01, ahead);
        const tangent = ahead.sub(dir).normalize();
        props.push({
            kind: "metro-station",
            position: ground,
            quaternion: surfaceQuaternion(dir, spinAlong(dir, tangent)),
            scale: 1,
            colorA: stationA,
            colorB: stationB,
            seed: 1600 + i,
            aux: [ground, deck],
            signText: ZONE_SIGNS[st.zone],
        });
    });
}
function paletteFor(zoneId, r) {
    const options = PALETTE[zoneId] ?? PALETTE.bazaar;
    return options[Math.floor(r() * options.length) % options.length];
}
/**
 * The same zone pairs buildRoads() arcs between in terrain.ts. Re-declared here
 * rather than imported because that list is module-private there; if it ever
 * changes, this must change with it.
 *
 * It did change and this did not: P28 added the last four to complete the
 * arterial loop, and because bridges, road furniture and signposts all walk this
 * list, those roads got none of it — including two that cross open water, which
 * left the roads running straight into Sampangi Kere and the grove channel with
 * no deck. Keep the order identical to terrain.ts: signboards pick a road with
 * find(), so reordering would re-site them.
 */
export const ROAD_PAIRS = [
    ["bazaar", "beach"],
    ["beach", "temple"],
    ["bazaar", "samadhi"],
    ["samadhi", "ghat"],
    ["ghat", "grove"],
    ["grove", "workshop"],
    ["grove", "mill"],
    ["mill", "ghat"],
    ["haveli", "bazaar"],
    ["haveli", "grove"],
    ["bazaar", "ghat"],
    ["samadhi", "grove"],
    ["haveli", "workshop"],
    ["workshop", "beach"],
    ["temple", "mill"],
];
const ROAD_STEP = 0.06;
/**
 * Guardrail post spacing either side of the rail centre, and how much of a post
 * shows above its own ground. Shared with PropsLayer, which builds the rail from
 * the two ground samples in `aux`.
 */
export const GUARD_POST_X = 0.4;
export const GUARD_SHOW = 0.35;
export const GUARD_ROOT = 0.65;
const RAIL_OFFSET = 0.055;
const POLE_OFFSET = 0.07;
/** minimum roadDistance any furniture must keep from every road ribbon */
const RIBBON_CLEAR = 1.15;
/**
 * Wires only span adjacent poles this close — a longer gap means a pole was
 * rejected in between, and a wire across it would cut through terrain.
 *
 * Poles sit 4 steps apart (0.24 rad), which at terrain radii of 21.5-31 is a
 * 5.2-7.8u chord; a single missing pole doubles that to 10.2u or more. 9.0
 * therefore accepts every genuine neighbour and rejects every gap.
 */
const WIRE_MAX_SPAN = 14.4;
/** height the wire attaches at, just under the 2.6 pole tip */
const POLE_TIP = 4;
/** signals stand this far out along each road leaving KR Market */
const SIGNAL_ANGLE = 0.32;
const SIGNAL_OFFSET = 0.06;
/** BBMP-style bilingual plates at each zone's road entry */
const SIGN_ANGLE = 0.24;
const SIGN_OFFSET = 0.05;
const SIGN_RETRY = 0.03;
const ZONE_SIGNS = {
    bazaar: { kannada: "ಕೆ.ಆರ್. ಮಾರುಕಟ್ಟೆ", english: "K.R. Market" },
    mill: { kannada: "ಬಿನ್ನಿ ಮಿಲ್", english: "Binny Mills" },
    ghat: { kannada: "ಕಾವೇರಿ ನದಿತೀರ", english: "Cauvery Riverside" },
    haveli: { kannada: "ಬೆಂಗಳೂರು ಅರಮನೆ", english: "Bengaluru Palace" },
    grove: { kannada: "ದೊಡ್ಡ ಆಲದ ಮರ", english: "Dodda Alada Mara" },
    samadhi: { kannada: "ಎಸ್.ಪಿ. ರಸ್ತೆ", english: "S.P. Road" },
    workshop: { kannada: "ಗೋಪಾಲನ ಗ್ಯಾರೇಜ್", english: "Gopal's Garage" },
    temple: { kannada: "ನಂದಿ ಬೆಟ್ಟ ದೇವಸ್ಥಾನ", english: "Nandi Betta Temple" },
    beach: { kannada: "ಸಂಪಂಗಿ ಕೆರೆ", english: "Sampangi Kere" },
};
export const signPlacements = [];
/** verge band the tufts scatter across, in radians either side of the arc */
const TUFT_NEAR = 0.05;
const TUFT_SPAN = 0.035;
const _UP_Y = new THREE.Vector3(0, 1, 0);
/** rotate `dir` by `phi` radians toward `axis` (both unit, mutually perpendicular) */
function offsetDir(dir, axis, phi) {
    return dir.clone().multiplyScalar(Math.cos(phi)).addScaledVector(axis, Math.sin(phi)).normalize();
}
/**
 * Spin value that makes a prop's local +X point along `tangent` once
 * surfaceQuaternion has stood it up along `dir` — used so guardrails run with
 * the road instead of across it.
 */
function spinAlong(dir, tangent) {
    const q0 = new THREE.Quaternion().setFromUnitVectors(_UP_Y, dir);
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(q0);
    const cross = new THREE.Vector3().crossVectors(xAxis, tangent);
    return Math.atan2(cross.dot(dir), xAxis.dot(tangent));
}
/** great-circle tangent at `dir`, pointing toward `toward` */
function arcTangent(dir, toward) {
    const t = toward.clone().addScaledVector(dir, -dir.dot(toward));
    return t.lengthSq() < 1e-10 ? null : t.normalize();
}
/**
 * Re-aim the prop just pushed so a chosen local axis points at its zone centre.
 * add() always spins by `ang + PI`, which is fine for scatter but useless when
 * a piece has a front — Nandi must look at the shrine, stairs must run downhill.
 */
function aimAtZone(props, zoneId, axis) {
    const prop = props[props.length - 1];
    const zone = ZONES.find((z) => z.id === zoneId);
    if (!prop || !zone)
        return;
    const centre = new THREE.Vector3(...zone.center).normalize();
    const dir = prop.position.clone().normalize();
    const toward = arcTangent(dir, centre);
    if (!toward)
        return;
    if (axis === "x") {
        // local +X onto the inward tangent
        prop.quaternion.copy(surfaceQuaternion(dir, spinAlong(dir, toward)));
    }
    else {
        // putting +X on the perpendicular leaves +Z on the inward tangent
        const perp = new THREE.Vector3().crossVectors(dir, toward).normalize();
        prop.quaternion.copy(surfaceQuaternion(dir, spinAlong(dir, perp)));
    }
}
/* ----------------------------------------------------------- road bridges */
const WET_MARK = WATER_LEVEL + 0.4;
const BRIDGE_SAMPLE = 0.02;
const MIN_SPAN = 0.03;
/** ramp length at each bank, in radians */
const BRIDGE_RAMP = 0.04;
const BRIDGE_DECK_R = WATER_LEVEL + 0.96;
/**
 * Half the bridge, from centreline to railing. The deck mesh, the railings and
 * the walkable surface all derive from this one number: they were three separate
 * literals, and the deck had drifted to 0.9 while the rails stood at 1.44, so
 * the player walked off the deck edge before ever reaching a rail.
 */
export const BRIDGE_HALF_WIDTH = 1.44;
/**
 * An arterial crossing carries the full corridor cross-section, so its deck
 * matches the surfaced half-width rather than the local-road default — a 1.44u
 * deck under a 3.95u road pinches the carriageway to a third of its width at
 * every water crossing. Local roads keep the narrow deck.
 *
 * Written out rather than read from FOOT_OUT, which the corridor section
 * declares further down this file; the two must be kept in step by hand.
 */
export const BRIDGE_ARTERIAL_HALF_WIDTH = 3.95;
/** roughly one pier per this many world units of wet span */
const PIER_SPACING = 2.4;
/** point on a road arc at angle `t` from `a`, toward `b` */
function arcPoint(a, b, omega, t, target) {
    const s = Math.sin(omega);
    return target
        .copy(a)
        .multiplyScalar(Math.sin(omega - t) / s)
        .addScaledVector(b, Math.sin(t) / s)
        .normalize();
}
/** every stretch of every road that runs below the waterline */
const BRIDGE_SPANS = (() => {
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const spans = [];
    const dir = new THREE.Vector3();
    ROAD_PAIRS.forEach(([idA, idB], road) => {
        const za = byId.get(idA);
        const zb = byId.get(idB);
        if (!za || !zb)
            return;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        const omega = a.angleTo(b);
        if (omega < MIN_SPAN)
            return;
        let runStart = null;
        const steps = Math.ceil(omega / BRIDGE_SAMPLE);
        for (let i = 0; i <= steps; i++) {
            const t = Math.min(i * BRIDGE_SAMPLE, omega);
            const wet = terrainRadius(arcPoint(a, b, omega, t, dir)) < WET_MARK;
            if (wet && runStart === null)
                runStart = t;
            if ((!wet || i === steps) && runStart !== null) {
                const end = wet ? t : t - BRIDGE_SAMPLE;
                const arc = end - runStart;
                if (arc >= MIN_SPAN) {
                    const tA = Math.max(0, runStart - BRIDGE_RAMP);
                    const tB = Math.min(omega, end + BRIDGE_RAMP);
                    const worldLength = arc * BRIDGE_DECK_R;
                    const [pa, pb] = ROAD_PAIRS[road];
                    // read off METRO_ZONE_IDS, not ARTERIAL_PAIRS: this runs at module
                    // load and ARTERIAL_PAIRS is declared further down the file
                    const arterial = METRO_ZONE_IDS.some((id, k) => {
                        const next = METRO_ZONE_IDS[(k + 1) % METRO_ZONE_IDS.length];
                        return (id === pa && next === pb) || (id === pb && next === pa);
                    });
                    spans.push({
                        halfWidth: arterial ? BRIDGE_ARTERIAL_HALF_WIDTH : BRIDGE_HALF_WIDTH,
                        road,
                        t0: runStart,
                        t1: end,
                        tA,
                        tB,
                        arc,
                        worldLength,
                        piers: Math.max(1, Math.round(worldLength / PIER_SPACING)),
                    });
                }
                runStart = null;
            }
        }
    });
    return spans;
})();
export function bridgeReport() {
    return BRIDGE_SPANS.map((s) => ({
        road: `${ROAD_PAIRS[s.road][0]}-${ROAD_PAIRS[s.road][1]}`,
        arc: s.arc,
        worldLength: s.worldLength,
        piers: s.piers,
    }));
}
/** is this point on a road covered by a bridge, ramps included? */
function onBridge(road, angle) {
    for (const s of BRIDGE_SPANS) {
        if (s.road === road && angle >= s.tA && angle <= s.tB)
            return true;
    }
    return false;
}
/** deck height at `t` within a span: flat over water, ramping down at the banks */
function bridgeHeight(span, t, bankA, bankB) {
    if (t <= span.t0) {
        const f = span.t0 > span.tA ? (t - span.tA) / (span.t0 - span.tA) : 1;
        return bankA + (BRIDGE_DECK_R - bankA) * f;
    }
    if (t >= span.t1) {
        const f = span.tB > span.t1 ? (t - span.t1) / (span.tB - span.t1) : 1;
        return BRIDGE_DECK_R + (bankB - BRIDGE_DECK_R) * f;
    }
    return BRIDGE_DECK_R;
}
/** decks, railings and piers for every water crossing */
function placeBridges(props) {
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const [deckA, deckB] = KIND_COLORS["bridge-deck"] ?? ["#cfc8ba", "#a89e90"];
    const [railA, railB] = KIND_COLORS["bridge-rail"] ?? ["#f2f0e8", "#d8d5cb"];
    const [pierA, pierB] = KIND_COLORS["bridge-pier"] ?? ["#a89e90", "#8d8478"];
    let seed = 1800;
    for (const span of BRIDGE_SPANS) {
        const [idA, idB] = ROAD_PAIRS[span.road];
        const za = byId.get(idA);
        const zb = byId.get(idB);
        if (!za || !zb)
            continue;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        const omega = a.angleTo(b);
        const probe = new THREE.Vector3();
        const bankA = terrainRadius(arcPoint(a, b, omega, span.tA, probe));
        const bankB = terrainRadius(arcPoint(a, b, omega, span.tB, probe));
        const dirAt = (t, target) => arcPoint(a, b, omega, t, target);
        const pointAt = (t, target) => dirAt(t, target).multiplyScalar(bridgeHeight(span, t, bankA, bankB));
        const steps = Math.max(2, Math.ceil((span.tB - span.tA) / BRIDGE_SAMPLE));
        const step = (span.tB - span.tA) / steps;
        for (let i = 0; i < steps; i++) {
            const t = span.tA + i * step;
            const p0 = pointAt(t, new THREE.Vector3());
            const p1 = pointAt(t + step, new THREE.Vector3());
            const mid = p0.clone().add(p1).multiplyScalar(0.5);
            const along = p1.clone().sub(p0);
            const quat = deckQuaternion(along, mid.clone().normalize());
            props.push({
                kind: "bridge-deck",
                position: mid,
                quaternion: quat,
                scale: 1,
                colorA: deckA,
                colorB: deckB,
                seed: seed++,
                width: span.halfWidth,
                aux: [p0.clone(), p1.clone()],
            });
            // a railing down each edge, offset across the deck
            const side = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
            for (const s of [-1, 1]) {
                const r0 = p0.clone().addScaledVector(side, s * span.halfWidth);
                const r1 = p1.clone().addScaledVector(side, s * span.halfWidth);
                const rMid = r0.clone().add(r1).multiplyScalar(0.5);
                props.push({
                    kind: "bridge-rail",
                    position: rMid,
                    quaternion: deckQuaternion(r1.clone().sub(r0), rMid.clone().normalize()),
                    scale: 1,
                    colorA: railA,
                    colorB: railB,
                    seed: seed++,
                    width: span.halfWidth,
                    aux: [r0, r1],
                });
            }
        }
        // piers standing on the lakebed, spaced across the wet part only
        for (let k = 0; k < span.piers; k++) {
            const f = (k + 0.5) / span.piers;
            const t = span.t0 + (span.t1 - span.t0) * f;
            const d = dirAt(t, new THREE.Vector3());
            const bed = d.clone().multiplyScalar(terrainRadius(d));
            const top = d.clone().multiplyScalar(bridgeHeight(span, t, bankA, bankB));
            props.push({
                kind: "bridge-pier",
                position: bed,
                quaternion: surfaceQuaternion(d, 0),
                scale: 1,
                colorA: pierA,
                colorB: pierB,
                seed: seed++,
                aux: [bed, top],
            });
        }
    }
}
/** rails, poles and verge tufts walked along every road arc */
function placeRoadFurniture(props) {
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    ROAD_PAIRS.forEach(([idA, idB], roadIndex) => {
        const za = byId.get(idA);
        const zb = byId.get(idB);
        if (!za || !zb)
            return;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        const omega = a.angleTo(b);
        if (omega < ROAD_STEP * 2)
            return;
        const sinO = Math.sin(omega);
        const steps = Math.floor(omega / ROAD_STEP);
        const rand = rng(4200 + roadIndex * 17);
        const poleSide = roadIndex % 2 === 0 ? 1 : -1;
        let seed = 5000 + roadIndex * 300;
        const push = (kind, dir, spin) => {
            // nothing may stand on a road ribbon or its very edge. Checked against
            // every arc, so this also clears the pile-ups where roads converge on a
            // zone centre and a rail offset from one road lands on another.
            if (roadDistance(dir) < RIBBON_CLEAR)
                return null;
            // arterials carry footpaths instead of verge furniture. Poles are in the
            // list too: they were exempt, and stood mid-carriageway where the spline
            // road drifts from the great-circle arcs this distance is measured on.
            if ((kind === "guardrail" || kind === "grass-tuft" || kind === "utility-pole") &&
                arterialDistance(dir) < CORRIDOR_SUPPRESS) {
                return null;
            }
            const pos = surfacePoint(dir, 0);
            if (pos.length() < WATER_LEVEL + 0.48)
                return null;
            const [colorA, colorB] = KIND_COLORS[kind] ?? ["#cccccc", "#999999"];
            const prop = {
                kind,
                position: pos,
                quaternion: surfaceQuaternion(dir, spin),
                scale: 1,
                colorA,
                colorB,
                seed: seed++,
            };
            // A guardrail spans 0.8u between its posts, and the verge can drop most of
            // a unit across that — a rail held level then reads as a leaning fence with
            // one post barely showing. Sample the ground under each post so the
            // renderer can stand both upright and run the rail down the grade.
            if (kind === "guardrail") {
                const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(prop.quaternion);
                const foot = (sx) => {
                    const probe = dir.clone().addScaledVector(axisX, sx / pos.length()).normalize();
                    return probe.multiplyScalar(terrainRadius(probe));
                };
                prop.aux = [foot(-GUARD_POST_X), foot(GUARD_POST_X)];
            }
            props.push(prop);
            return prop;
        };
        /** poles that actually survived placement, in order along the arc */
        const polesOnArc = [];
        // interior steps only — the endpoints are the zone centres themselves
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            // a bridge carries the road here — its own railings take over, and loose
            // furniture would be left standing in open water
            if (onBridge(roadIndex, t * omega))
                continue;
            const dir = a
                .clone()
                .multiplyScalar(Math.sin((1 - t) * omega) / sinO)
                .addScaledVector(b, Math.sin(t * omega) / sinO)
                .normalize();
            const tangent = arcTangent(dir, b);
            if (!tangent)
                continue;
            const perp = new THREE.Vector3().crossVectors(dir, tangent).normalize();
            // guardrail, alternating sides, lying along the road
            const railDir = offsetDir(dir, perp, RAIL_OFFSET * (i % 2 === 0 ? 1 : -1));
            const railTan = arcTangent(railDir, b);
            if (railTan)
                push("guardrail", railDir, spinAlong(railDir, railTan));
            // utility pole every fourth step, always the same side of a given road
            if (i % 4 === 0) {
                const poleDir = offsetDir(dir, perp, POLE_OFFSET * poleSide);
                const poleTan = arcTangent(poleDir, b);
                if (poleTan) {
                    const placed = push("utility-pole", poleDir, spinAlong(poleDir, poleTan));
                    if (placed)
                        polesOnArc.push(placed.position);
                }
            }
            // two tufts scattered across both verges
            for (let k = 0; k < 2; k++) {
                const side = rand() < 0.5 ? -1 : 1;
                const tuftDir = offsetDir(dir, perp, (TUFT_NEAR + rand() * TUFT_SPAN) * side);
                push("grass-tuft", tuftDir, rand() * Math.PI * 2);
            }
        }
        // string a wire between each surviving pair of neighbouring poles. A gap
        // wider than WIRE_MAX_SPAN means a pole in between was rejected, and a
        // wire across it would cut through the ground.
        const [wireA, wireB] = KIND_COLORS.wire ?? ["#2a2a2a", "#1e1e1e"];
        for (let i = 0; i + 1 < polesOnArc.length; i++) {
            const pa = polesOnArc[i];
            const pb = polesOnArc[i + 1];
            if (pa.distanceTo(pb) > WIRE_MAX_SPAN)
                continue;
            const topA = pa.clone().addScaledVector(pa.clone().normalize(), POLE_TIP);
            const topB = pb.clone().addScaledVector(pb.clone().normalize(), POLE_TIP);
            props.push({
                kind: "wire",
                position: topA.clone().add(topB).multiplyScalar(0.5),
                quaternion: new THREE.Quaternion(),
                scale: 1,
                colorA: wireA,
                colorB: wireB,
                seed: seed++,
                aux: [topA, topB],
            });
        }
    });
    // --- traffic signals on the three roads leaving KR Market
    const bazaar = byId.get("bazaar");
    if (bazaar) {
        const bDir = new THREE.Vector3(...bazaar.center).normalize();
        const [sigA, sigB] = KIND_COLORS["traffic-signal"] ?? ["#2f2b26", "#1d1a17"];
        const legs = [
            ["haveli", 1300],
            ["ghat", 1301],
            ["samadhi", 1302],
        ];
        for (const [otherId, sigSeed] of legs) {
            const other = byId.get(otherId);
            if (!other)
                continue;
            const oDir = new THREE.Vector3(...other.center).normalize();
            const outward = arcTangent(bDir, oDir);
            if (!outward)
                continue;
            // walk SIGNAL_ANGLE out from the market along this leg
            const dir = bDir
                .clone()
                .multiplyScalar(Math.cos(SIGNAL_ANGLE))
                .addScaledVector(outward, Math.sin(SIGNAL_ANGLE))
                .normalize();
            const tangent = arcTangent(dir, oDir);
            if (!tangent)
                continue;
            const perp = new THREE.Vector3().crossVectors(dir, tangent).normalize();
            const sigDir = offsetDir(dir, perp, SIGNAL_OFFSET);
            if (roadDistance(sigDir) < RIBBON_CLEAR)
                continue;
            const pos = surfacePoint(sigDir, 0);
            if (pos.length() < WATER_LEVEL + 0.48)
                continue;
            const sigTan = arcTangent(sigDir, oDir);
            if (!sigTan)
                continue;
            // local +X onto the perpendicular puts local +Z down the road, so the
            // signal head faces oncoming traffic
            const sigPerp = new THREE.Vector3().crossVectors(sigDir, sigTan).normalize();
            props.push({
                kind: "traffic-signal",
                position: pos,
                quaternion: surfaceQuaternion(sigDir, spinAlong(sigDir, sigPerp)),
                scale: 1,
                colorA: sigA,
                colorB: sigB,
                seed: sigSeed,
            });
        }
    }
    // --- one bilingual signboard at each zone's road entry
    signPlacements.length = 0;
    const [signA, signB] = KIND_COLORS["zone-signboard"] ?? ["#1e5a3a", "#ffffff"];
    ZONES.forEach((zone, zi) => {
        const copy = ZONE_SIGNS[zone.id];
        if (!copy)
            return;
        const pair = ROAD_PAIRS.find(([x, y]) => x === zone.id || y === zone.id);
        if (!pair)
            return;
        const otherId = pair[0] === zone.id ? pair[1] : pair[0];
        const other = byId.get(otherId);
        if (!other)
            return;
        const zDir = new THREE.Vector3(...zone.center).normalize();
        const oDir = new THREE.Vector3(...other.center).normalize();
        const outward = arcTangent(zDir, oDir);
        if (!outward)
            return;
        // Never walk past 40% of the arc: on a short road 0.24 rad would carry the
        // board over the midpoint and leave it sitting closer to the neighbouring
        // zone than to its own. The same 40% is applied against the CLOSEST zone in
        // any direction, not just this arc's partner — a long road can still pass
        // near an unrelated zone (beach's road to KR Market skirts the temple).
        const arcLength = zDir.angleTo(oDir);
        let nearestOther = Math.PI;
        for (const o of ZONES) {
            if (o.id === zone.id)
                continue;
            nearestOther = Math.min(nearestOther, zDir.angleTo(new THREE.Vector3(...o.center).normalize()));
        }
        const walk = Math.min(SIGN_ANGLE, 0.4 * arcLength, 0.4 * nearestOther);
        // first side, then the other, then the same two a little further out
        const attempts = [
            [walk, 1],
            [walk, -1],
            [walk + SIGN_RETRY, 1],
            [walk + SIGN_RETRY, -1],
        ];
        for (let attempt = 0; attempt < attempts.length; attempt++) {
            const [along, side] = attempts[attempt];
            const onRoad = zDir
                .clone()
                .multiplyScalar(Math.cos(along))
                .addScaledVector(outward, Math.sin(along))
                .normalize();
            const tangent = arcTangent(onRoad, oDir);
            if (!tangent)
                continue;
            const perp = new THREE.Vector3().crossVectors(onRoad, tangent).normalize();
            const dir = offsetDir(onRoad, perp, SIGN_OFFSET * side);
            if (roadDistance(dir) < RIBBON_CLEAR)
                continue;
            const pos = surfacePoint(dir, 0);
            if (pos.length() < WATER_LEVEL + 0.48)
                continue;
            const boardTan = arcTangent(dir, oDir);
            if (!boardTan)
                continue;
            // local +X onto the perpendicular leaves local +Z down the road, so the
            // plate faces someone walking the arc
            const boardPerp = new THREE.Vector3().crossVectors(dir, boardTan).normalize();
            props.push({
                kind: "zone-signboard",
                position: pos,
                quaternion: surfaceQuaternion(dir, spinAlong(dir, boardPerp)),
                scale: 1,
                colorA: signA,
                colorB: signB,
                seed: 1400 + zi,
                signText: copy,
            });
            signPlacements.push({ zone: zone.id, placed: true, attempt: attempt + 1 });
            return;
        }
        signPlacements.push({ zone: zone.id, placed: false, attempt: attempts.length });
    });
}
export function buildProps() {
    const props = [];
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const add = (kind, zoneId, angleOffset, distFrac, scale, seed, 
    /** slide outward/inward if the authored spot would land on a villager */
    npcAware = false) => {
        const zone = byId.get(zoneId);
        if (!zone)
            return;
        const center = new THREE.Vector3(...zone.center).normalize();
        const tangent = new THREE.Vector3(0, 1, 0);
        if (Math.abs(center.y) > 0.9)
            tangent.set(1, 0, 0);
        const t1 = new THREE.Vector3().crossVectors(tangent, center).normalize();
        const t2 = new THREE.Vector3().crossVectors(center, t1).normalize();
        const ang = angleOffset;
        const atAng = (a, df) => {
            // a pure angular offset in radians. zone.radius is a world-unit value and
            // must never enter here — multiplying by it flung props tens of degrees
            // away from the zone they belong to (BUG-102).
            const dist = df * 0.03125;
            return center
                .clone()
                .addScaledVector(t1, Math.cos(a) * dist)
                .addScaledVector(t2, Math.sin(a) * dist)
                .normalize();
        };
        const at = (df) => atAng(ang, df);
        let dir = at(distFrac);
        if (npcAware && !npcClearance(surfacePoint(dir, 0)).ok) {
            for (const nudge of [0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6]) {
                const cand = at(distFrac + nudge);
                if (npcClearance(surfacePoint(cand, 0)).ok) {
                    dir = cand;
                    break;
                }
            }
        }
        // Corridor siting. An arterial runs through every metro zone's centre, so a
        // structure anchored near that centre sits in the carriageway. Anything with
        // a FOOTPRINT must stand its own radius clear of the corridor's outer edge.
        //
        // Unlike the npc nudge above this also sweeps the bearing: the workshop shed
        // is on the same bearing as a corridor, so no distance along it ever escapes.
        // Distance-major ordering keeps the authored bearing when it can work and
        // otherwise takes the nearest site that clears, so props stay in their zone.
        const box = FOOTPRINT[kind];
        if (box !== undefined && !footprintClear(dir, box, scale, ang + Math.PI)) {
            const fits = (cand) => {
                // cheap gate first: the centre lies inside the box, so a centre inside
                // the band can never yield a clear footprint, and this skips the
                // perimeter walk for the great majority of candidates
                if (arterialDistance(cand) < BUILDING_SETBACK)
                    return false;
                const spot = surfacePoint(cand, 0);
                // the same two conditions add() already enforces on every prop
                if (spot.length() < WATER_LEVEL + 0.48)
                    return false;
                if (!npcClearance(spot).ok)
                    return false;
                return footprintClear(cand, box, scale, ang + Math.PI);
            };
            let sited = null;
            // Hold the authored bearing and walk outward first. Ensembles are composed
            // along one bearing — the palace gate sits on the palace's, deliberately —
            // so keeping it is worth the extra 1.0u this costs the palace.
            for (let df = distFrac; df <= SITE_MAX_DIST && !sited; df += SITE_DIST_STEP) {
                const cand = at(df);
                if (fits(cand))
                    sited = cand;
            }
            // Only if the bearing itself runs down a corridor, as the workshop shed's
            // does for its whole length, sweep round. Distance-major, so the shed stays
            // as close as it can to the smallest zone on the planet.
            if (!sited) {
                search: for (let df = distFrac; df <= SITE_MAX_DIST; df += SITE_DIST_STEP) {
                    for (const turn of SITE_TURNS) {
                        const cand = atAng(ang + turn, df);
                        if (!fits(cand))
                            continue;
                        sited = cand;
                        break search;
                    }
                }
            }
            if (sited)
                dir = sited;
        }
        const pos = surfacePoint(dir, 0);
        const quat = surfaceQuaternion(dir, ang + Math.PI);
        const [a, b] = KIND_COLORS[kind] ?? paletteFor(zoneId, rng(seed));
        if (pos.length() < WATER_LEVEL + 0.48)
            return;
        props.push({ kind, position: pos, quaternion: quat, scale, colorA: a, colorB: b, seed });
    };
    // --- bazaar: market stalls ringed around the square, with umbrellas
    for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        add("stall", "bazaar", ang, 1.4, 1, 100 + i);
        add("market-umbrella", "bazaar", ang + 0.15, 1.8, 1, 200 + i);
    }
    add("lamp-post", "bazaar", 0.4, 0.6, 1, 150);
    add("lamp-post", "bazaar", 2.4, 0.6, 1, 151);
    add("flag", "bazaar", 1.0, 0.3, 1, 152);
    // --- haveli: Bengaluru Palace behind a gated approach, all on one bearing
    add("palace", "haveli", 0, 0.3, 1.6, 300, true);
    // gate on the SAME bearing (angle 0) as the palace, nearer and deliberately
    // shorter than its towers, with the lamps flanking the approach
    add("haveli-arch", "haveli", 0, 1.1, 1.0, 301);
    add("lamp-post", "haveli", 0.2, 1.0, 1, 302);
    add("lamp-post", "haveli", -0.2, 1.0, 1, 303);
    add("flag", "haveli", 0.05, 0.25, 1.1, 304);
    // --- mill: rows of factory blocks
    // evenly around the full circle — clustering them in one arc made the 2.2u
    // wide blocks intersect each other
    const millAngles = [0, 1.047, 2.094, 3.142, 4.189, 5.236];
    millAngles.forEach((a, i) => add("mill-block", "mill", a, 2.0, 1.3, 400 + i));
    // --- workshop: single shed + parts
    add("workshop-shed", "workshop", 0, 0.6, 1.2, 500);
    add("lamp-post", "workshop", 1.4, 1.2, 1, 501);
    // --- temple: a South Indian hill shrine — gopuram at the summit, courtyard
    // and Nandi on the approach, stair runs descending the slope below
    add("gopuram", "temple", 0, 0.25, 1.6, 600, true);
    aimAtZone(props, "temple", "z"); // doorway (local -Z) looks down the approach
    add("temple-court", "temple", 0, 0.55, 1.4, 601, true);
    aimAtZone(props, "temple", "z"); // mandapa roof (+Z half) sits toward the shrine
    add("nandi-statue", "temple", 0, 0.85, 1.1, 602, true);
    aimAtZone(props, "temple", "x"); // the bull faces the shrine along local +X
    add("temple-steps", "temple", 0, 1.25, 1.3, 603);
    aimAtZone(props, "temple", "z"); // treads descend along local -Z, downhill
    // A run is 3.12u long and the second must start beyond the first. 3.3 was
    // tuned when distFrac scaled by 0.05; P22b changed that to 0.03125, pulling
    // this run back into a roadside guardrail. 3.3 x 1.6 restores its world
    // position under the new scale.
    add("temple-steps", "temple", 0, 5.3, 1.3, 604);
    aimAtZone(props, "temple", "z");
    // distFrac 1.3 clears the gopuram's 1.28u half-width, but the approach axis
    // is fully occupied (court 0.85, Nandi 1.32, steps 1.94), so the flags are
    // swung out to +-0.9 to stand off the axis instead of between the pieces
    add("flag", "temple", 0.9, 1.3, 1.3, 605);
    add("flag", "temple", -0.9, 1.3, 1.3, 606);
    // --- ghat: stepped stone terraces down to the water
    for (let i = 0; i < 6; i++) {
        add("ghat-steps", "ghat", (i / 6) * Math.PI * 2, 1.2, 1, 700 + i);
    }
    // --- grove: Dodda Alada Mara is ONE tree — a single giant banyan at the
    // centre, with a few small companions out at the fringe of its canopy
    add("banyan", "grove", 0, 0.15, 2.6, 800);
    const groveCompanions = [0.4, 1.6, 2.7, 3.9, 5.1];
    groveCompanions.forEach((a, i) => add("mango-tree", "grove", a, 2.2, 0.7, 801 + i));
    // --- samadhi: peepal trees + quiet stone markers
    for (let i = 0; i < 5; i++) {
        add("peepal-tree", "samadhi", (i / 5) * Math.PI * 2, 1.2, 1.4, 900 + i);
    }
    // --- beach: a couple of leaning palms via mango-tree reuse, thin scale
    const beach = rng(77);
    for (let i = 0; i < 6; i++) {
        add("mango-tree", "beach", beach() * Math.PI * 2, 0.8 + beach() * 1.0, 0.6, 1000 + i);
    }
    placeRoadFurniture(props);
    placeBridges(props);
    placeMetro(props);
    // last, so a plot can see every pillar, building and villager it must avoid
    placeCivicPads(props);
    return props;
}
/* ------------------------------------------------------- arterial corridor */
/** the nine consecutive zone pairs of the metro tour — the arterial network */
export const ARTERIAL_PAIRS = METRO_ZONE_IDS.map((id, i) => [
    id,
    METRO_ZONE_IDS[(i + 1) % METRO_ZONE_IDS.length],
]);
const ARTERIAL_ARCS = (() => {
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const arcs = [];
    for (const [ia, ib] of ARTERIAL_PAIRS) {
        const za = byId.get(ia);
        const zb = byId.get(ib);
        if (!za || !zb)
            continue;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        arcs.push({ a, b, n: new THREE.Vector3().crossVectors(a, b).normalize(), omega: a.angleTo(b) });
    }
    return arcs;
})();
const _artProbe = new THREE.Vector3();
/** lateral world distance from `dir` to the nearest arterial centreline */
export function arterialDistance(dir) {
    let best = Infinity;
    for (const arc of ARTERIAL_ARCS) {
        const along = _artProbe.copy(dir).projectOnPlane(arc.n);
        if (along.lengthSq() < 1e-9)
            continue;
        along.normalize();
        const ab = arc.a.dot(arc.b);
        const inside = along.dot(arc.a) >= ab - 1e-4 && along.dot(arc.b) >= ab - 1e-4;
        const ang = inside
            ? Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(arc.n)))))
            : Math.min(dir.angleTo(arc.a), dir.angleTo(arc.b));
        if (ang < best)
            best = ang;
    }
    return best === Infinity ? Infinity : best * terrainRadius(dir);
}
/* --- cross-section, in world units either side of the centreline --------- */
const CORRIDOR_STEP = 0.015;
/** guardrails and tufts stand down inside this half-width; footpaths replace them */
// full shoulder reach 5.55 (SKIRT_OUT), plus the <=0.455u the spline road
// drifts from the great-circle arcs arterialDistance measures against (P37),
// plus margin. At 4.8 furniture planted at raw-terrain height stood buried
// inside the raised embankment band the wider shoulder now covers.
export const CORRIDOR_SUPPRESS = 6.2;
const ASPHALT_LIFT = 0.06;
const PAINT_LIFT = 0.12;
const MEDIAN_TOP = 0.2;
const FOOTPATH_TOP = 0.16;
/**
 * Highway cross-section, half-widths from the centreline.
 *
 * The median widened from 0.25 to 0.55 because it never held what it was for:
 * a pillar footing is 0.7 across and P35 measured every one of them spilling
 * past the old edge into the carriageway. 0.50 contained them but only by 12mm
 * at worst — a footing turned toward 45 degrees reaches 0.495u — so it carries
 * 0.55 to leave the margin a real one. Carriageways then doubled to 2.6u so
 * each side carries two lanes rather than one, which is what the dashed divider
 * at LANE_MID now separates.
 */
const LANE_IN = 0.55;
const LANE_OUT = 3.15;
/** dashed divider between the two lanes of one carriageway */
const LANE_MID = (LANE_IN + LANE_OUT) / 2;
const MEDIAN_HALF = 0.55;
const FOOT_IN = 3.15;
const FOOT_OUT = 3.95;
/** half-width of a painted line: 0.12u lines read as markings, 0.05u did not */
const MARK_HALF = 0.06;
const DASH_ON = 0.55;
const DASH_PERIOD = 1.4;
/** median breaks this close to a metro pillar footing */
const PILLAR_CLEAR = 1.2;
/**
 * A median vertex sits up to this far from its centreline sample, so the break
 * is widened by it — otherwise the 1.2u rule holds at the centreline while a
 * corner still creeps to 0.97u.
 */
const MEDIAN_REACH = Math.hypot(MEDIAN_HALF, MEDIAN_TOP);
/** half-width of a metro pillar's 0.7 x 0.7 footing box */
const FOOTING_HALF = 0.35;
/**
 * Skip a footing outright beyond this 3D range. Flattening onto the tangent
 * plane discards radial separation, so without a real distance gate a footing on
 * the far side of the planet reads as adjacent — the same trap P31 hit.
 */
const FOOTING_SKIP_SQ = (FOOTING_HALF + MEDIAN_REACH + PILLAR_CLEAR) ** 2;
/** half-step used for the central-difference tangent along the loop */
const TANGENT_EPS = 0.004;
/**
 * Gap between a point and a pillar footing, in the tangent plane at that point.
 * 0 means the point is inside the box.
 */
function footingGap(pt, up, f) {
    const d = _footGap.copy(pt).sub(f.at);
    d.addScaledVector(up, -d.dot(up));
    const ox = Math.max(0, Math.abs(d.dot(f.axisX)) - FOOTING_HALF);
    const oz = Math.max(0, Math.abs(d.dot(f.axisZ)) - FOOTING_HALF);
    return Math.hypot(ox, oz);
}
const _footGap = new THREE.Vector3();
/**
 * Cross-slope clamp. The corridor is a graded roadway, not a terrain drape:
 * an edge may sit at most tan(this) x its lateral offset from the centreline
 * height. 0.12 was a guess and far too tight for this terrain — 64% of the
 * corridor demanded more, so the ground erupted through the deck. Measured
 * requirement: p90 = 0.46 rad, which is what this now allows.
 */
const MAX_TWIST = 0.46;
/**
 * The verge apron reaches this far out, blending the deck edge into the ground.
 * Held at 0.6u beyond the footpath, as it was before the widening.
 */
/**
 * Hard vertical budget between the road surface and the ground under it —
 * tune the causeway look with this one number. The uncapped envelope reached
 * 5.8u of fill (roads on walls); an earlier soft cap measured against MEAN
 * ground still let 1.61u through. This cap is enforced against the RAW ground
 * at every sample, as the last step of every smoothing iteration, so it is
 * exact: no sample exceeds it.
 *
 * Fill only — the DOWNWARD bound is the ground itself, not ground − cap. That
 * is the project's existing cut rule: a deck below the terrain puts grass
 * through the asphalt (the P25–P28 punch-through saga), so the road may never
 * cut. Where the cap forces the road off its smooth line, it descends and
 * follows the ground, inheriting the ground's roughness there by design.
 */
const ROAD_MAX_FILL = 1.2;
/**
 * Lateral distance over which the shoulder smoothsteps from the footpath edge
 * down to the natural ground, so remaining fill reads as an embankment rather
 * than a wall (the old 0.6u linear face hit 63 degrees at full fill).
 */
const SHOULDER_FALLOFF = 1.6;
const SKIRT_OUT = FOOT_OUT + SHOULDER_FALLOFF;
/**
 * Hard sprawl limit for the adaptive embankment (below). Sized for the worst
 * measured edge drop (~1.4u) at a 1:2 slope; NOTE this exceeds SKIRT_OUT by
 * 1.2u laterally, so where the drop is large the skirt reaches to 6.75u —
 * beyond BUILDING_SETBACK (5.1) though still inside CORRIDOR_SUPPRESS (6.2).
 */
const SHOULDER_MAX = 2.8;
const CORRIDOR_COLORS = {
    asphalt: "#5a5a60",
    paint: "#e8e4da",
    median: "#b8b2a6",
    footpath: "#cfc4ae",
};
/** growable indexed triangle soup, optionally carrying per-vertex colour */
class MeshBuf {
    constructor() {
        this.pos = [];
        this.idx = [];
        this.col = [];
    }
    vert(v, c) {
        this.pos.push(v.x, v.y, v.z);
        if (c)
            this.col.push(c.r, c.g, c.b);
        return this.pos.length / 3 - 1;
    }
    quad(a, b, c, d) {
        const ia = this.vert(a);
        const ib = this.vert(b);
        const ic = this.vert(c);
        const id = this.vert(d);
        this.idx.push(ia, ib, ic, ia, ic, id);
    }
    /** same winding as quad(), with a colour per corner */
    quadC(a, ca, b, cb, c, cc, d, cd) {
        const ia = this.vert(a, ca);
        const ib = this.vert(b, cb);
        const ic = this.vert(c, cc);
        const id = this.vert(d, cd);
        this.idx.push(ia, ib, ic, ia, ic, id);
    }
    get empty() {
        return this.idx.length === 0;
    }
    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
        if (this.col.length)
            g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
        g.setIndex(this.idx);
        g.computeVertexNormals();
        return g;
    }
}
/** point `o` units to the right of the centreline, `lift` above the ground */
function crossPoint(s, o, lift, groundAt) {
    const h = groundAt + lift;
    return s.dir.clone().addScaledVector(s.right, o / h).normalize().multiplyScalar(h);
}
/** ground height at lateral offset `o`, clamped to the cross-slope limit */
function edgeGround(s, o) {
    const probe = s.dir.clone().addScaledVector(s.right, o / s.ground).normalize();
    const raw = terrainRadius(probe);
    const limit = Math.abs(o) * Math.tan(MAX_TWIST);
    return s.ground + Math.max(-limit, Math.min(limit, raw - s.ground));
}
/**
 * Half-window of the deck's height smoothing, in corridor samples (~0.6u each),
 * and the light second pass that follows it.
 *
 * The corridor used to take terrainRadius() raw along its length: MAX_TWIST
 * clamps the cross-slope but nothing touched the ride. Measured on the shipped
 * profile that gave a crest-or-sag reversal every 8.2u and grade changes up to
 * 0.47 — a roller coaster, not a graded highway.
 */
const CORRIDOR_SMOOTH = 12;
/** moving average over +-w samples of an open array, clamping at the ends */
function runningMean(src, w) {
    if (w <= 0)
        return src.slice();
    const out = [];
    for (let i = 0; i < src.length; i++) {
        let sum = 0;
        let n = 0;
        for (let k = -w; k <= w; k++) {
            const j = i + k;
            if (j < 0 || j >= src.length)
                continue;
            sum += src[j];
            n++;
        }
        out.push(sum / n);
    }
    return out;
}
/** rolling maximum over +-w samples, clamping at the ends */
function rollingMax(src, w) {
    const out = [];
    for (let i = 0; i < src.length; i++) {
        let m = -Infinity;
        for (let k = -w; k <= w; k++) {
            const j = i + k;
            if (j < 0 || j >= src.length)
                continue;
            if (src[j] > m)
                m = src[j];
        }
        out.push(m);
    }
    return out;
}
/**
 * Rideable deck height for one leg, one entry per sample.
 *
 * A smoothed UPPER ENVELOPE of the ground: rolling maximum, then a moving
 * average of it. The P41 pipeline (mean, then max against raw) kept the ride
 * clear of the ground but re-inserted a bump at EVERY crest above the mean —
 * playtest read it as "completely uneven, lots of up and down". The envelope
 * has no such bumps: crests live inside it, hollows are spanned.
 *
 * With the averaging half-window no wider than the max half-window, every
 * averaged term still contains raw[i] in its own max window, so the profile is
 * >= the ground at every sample by construction — smoothness without cutting.
 *
 * The window is sampled past both ends of the leg so neighbouring legs smooth
 * into each other and no crease forms at a station.
 */
/**
 * Constrained smoothing: smooth, then project into [ground, ground+cap],
 * repeated. A single clamp after smoothing would reintroduce the kinks the
 * smoothing removed; iterating converges to a profile that is both smooth and
 * inside the cap. Ends on the clamp so the bound is exact.
 */
const PROFILE_ITERATIONS = 10;
const PROFILE_ITER_SMOOTH = 3;
function corridorProfile(tA, span, steps) {
    const pad = CORRIDOR_SMOOTH * 2 + PROFILE_ITERATIONS * PROFILE_ITER_SMOOTH;
    const probe = new THREE.Vector3();
    const raw = [];
    for (let i = -pad; i <= steps + pad; i++) {
        loopDir(tA + (i / steps) * span, probe);
        raw.push(terrainRadius(probe));
    }
    // smooth upward-biased start: the crest-clearing envelope
    let h = runningMean(rollingMax(raw, CORRIDOR_SMOOTH), CORRIDOR_SMOOTH);
    // relax toward smooth-within-bounds; the clamp runs last so the cap is exact
    for (let it = 0; it < PROFILE_ITERATIONS; it++) {
        h = runningMean(h, PROFILE_ITER_SMOOTH);
        for (let i = 0; i < h.length; i++) {
            if (h[i] < raw[i])
                h[i] = raw[i];
            else if (h[i] > raw[i] + ROAD_MAX_FILL)
                h[i] = raw[i] + ROAD_MAX_FILL;
        }
    }
    return h.slice(pad, pad + steps + 1);
}
/** the whole arterial cross-section, merged into one geometry per element */
export function buildCorridors(props) {
    const out = [];
    // The corridor rides the metro's own spline, so it can only be built once the
    // network exists. buildProps() lays the viaduct before this is ever called.
    const net = NET;
    if (!net)
        return out;
    const footings = props
        .filter((p) => p.kind === "metro-pillar")
        .map((p) => ({
        at: p.position,
        axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion),
        axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion),
    }));
    // Each arterial leg is the stretch of loop between the two stations that
    // bracket it. stations[] is built in METRO_ORDER, the same order ARTERIAL_PAIRS
    // derives from, and each carries its own arc-length position `t`.
    const tOf = new Map(net.stations.map((s) => [s.zone, s.t]));
    const legsData = [];
    ARTERIAL_PAIRS.forEach(([idA, idB], ai) => {
        const tA = tOf.get(idA);
        const tB = tOf.get(idB);
        if (tA === undefined || tB === undefined)
            return;
        // walk forward along the closed loop, wrapping at the seam
        const span = (((tB - tA) % net.total) + net.total) % net.total;
        if (span < CORRIDOR_STEP)
            return;
        const steps = Math.max(2, Math.ceil(span / CORRIDOR_STEP));
        const samples = [];
        const dir = new THREE.Vector3();
        const deckProfile = corridorProfile(tA, span, steps);
        const ahead = new THREE.Vector3();
        const behind = new THREE.Vector3();
        const fwd = new THREE.Vector3();
        let run = 0;
        for (let i = 0; i <= steps; i++) {
            const t = tA + (i / steps) * span;
            loopDir(t, dir);
            // central difference for the tangent: the resampled loop is piecewise
            // linear, and a one-sided difference kinks at every sample boundary
            loopDir(t + TANGENT_EPS, ahead);
            loopDir(t - TANGENT_EPS, behind);
            fwd.copy(ahead).sub(behind);
            fwd.addScaledVector(dir, -fwd.dot(dir));
            if (fwd.lengthSq() < 1e-12)
                continue;
            fwd.normalize();
            const right = new THREE.Vector3().crossVectors(fwd, dir).normalize();
            // the rideable profile, not raw ground: see corridorProfile
            const ground = deckProfile[i];
            const wet = terrainRadius(dir);
            const centre = dir.clone().multiplyScalar(ground);
            // Break the median where a pillar's footing actually reaches into it,
            // measured box-to-band the way every clearance test has since P29 — the
            // old centre-distance test opened gaps for pillars nowhere near the strip
            // and, once the two curves diverged, was aimed at the wrong place anyway.
            let medianOk = true;
            for (const f of footings) {
                if (centre.distanceToSquared(f.at) > FOOTING_SKIP_SQ)
                    continue;
                if (footingGap(centre, dir, f) < MEDIAN_HALF) {
                    medianOk = false;
                    break;
                }
            }
            if (i > 0)
                run += (span / steps) * ground;
            samples.push({
                dir: dir.clone(),
                right,
                capL: Infinity,
                capR: Infinity,
                skirtCapL: Infinity,
                skirtCapR: Infinity,
                ground,
                dry: 
                // tested against the real ground: a filled hollow must not let the
                // road march out over water
                wet >= WATER_LEVEL + 0.48 &&
                    // the section reaches +-FOOT_OUT, so both verges must be dry too
                    terrainRadius(dir.clone().addScaledVector(right, FOOT_OUT / ground).normalize()) >= WATER_LEVEL + 0.48 &&
                    terrainRadius(dir.clone().addScaledVector(right, -FOOT_OUT / ground).normalize()) >= WATER_LEVEL + 0.48,
                medianOk,
                s: run,
            });
        }
        // Local turn radius per sample, from the angle between neighbouring chords.
        // The inner side of the bend is capped at just under that radius: on a
        // circular arc, cross-sections whose lateral reach stays below the radius
        // can never cross, so the fold (and its z-fight) never exists. The trimmed
        // area is exactly the area the neighbouring sections already cover.
        for (let i = 1; i < samples.length - 1; i++) {
            const sm = samples[i];
            const v1 = samples[i].dir.clone().sub(samples[i - 1].dir);
            const v2 = samples[i + 1].dir.clone().sub(samples[i].dir);
            const f1 = v1.clone().addScaledVector(sm.dir, -v1.dot(sm.dir));
            const f2 = v2.clone().addScaledVector(sm.dir, -v2.dot(sm.dir));
            if (f1.lengthSq() < 1e-14 || f2.lengthSq() < 1e-14)
                continue;
            f1.normalize();
            f2.normalize();
            const turn = Math.asin(Math.max(-1, Math.min(1, f1.clone().cross(f2).dot(sm.dir))));
            if (Math.abs(turn) < 1e-6)
                continue;
            const ds = 0.5 * (v1.length() + v2.length()) * sm.ground;
            const cap = (ds / Math.abs(turn)) * 0.95;
            // turning toward the right makes the right side the inside of the bend;
            // cross(f1, f2) points along -dir in that case
            if (turn < 0)
                sm.capR = Math.min(sm.capR, cap);
            else
                sm.capL = Math.min(sm.capL, cap);
        }
        legsData.push({ ai, samples, steps });
    });
    // Requested P44 debug output — the cap, verified live on every build. There
    // is no debug flag or HUD channel in this project, so console.log only.
    {
        let maxFill = 0;
        let over = 0;
        let maxGrade = 0;
        for (const leg of legsData) {
            for (let i = 0; i < leg.samples.length; i++) {
                const smp = leg.samples[i];
                if (!smp.dry)
                    continue;
                const fill = smp.ground - terrainRadius(smp.dir);
                if (fill > maxFill)
                    maxFill = fill;
                if (fill > ROAD_MAX_FILL + 1e-6)
                    over++;
                const prev = leg.samples[i - 1];
                if (i > 0 && prev.dry) {
                    const stepW = smp.dir.angleTo(prev.dir) * smp.ground;
                    if (stepW > 1e-6) {
                        maxGrade = Math.max(maxGrade, Math.abs(smp.ground - prev.ground) / stepW);
                    }
                }
            }
        }
        console.log(`[road] max fill ${maxFill.toFixed(2)}u (cap ${ROAD_MAX_FILL}), over-cap samples ${over}, max grade ${maxGrade.toFixed(2)}`);
    }
    /**
     * Wedge trim. At sharp tour corners the incoming and outgoing stretches of
     * ribbon double-cover the wedge between them with no local fold at all —
     * P43's raycast found 56 doubly-covered probes at the bazaar corner, 24 of
     * them z-fighting. Any lateral reach that lands inside the band of an
     * EARLIER, non-neighbouring stretch is surrendered to it, so exactly one
     * surface survives at every point, deterministically. The skirt additionally
     * yields to ANY foreign band in either direction: an apron under someone
     * else's asphalt is only ever a z-fight.
     */
    {
        const segs = [];
        const flat = [];
        let gi = 0;
        for (const leg of legsData) {
            for (let i = 0; i < leg.samples.length; i++) {
                flat.push({ s: leg.samples[i], gi: gi + i });
                if (i < leg.samples.length - 1) {
                    segs.push({
                        c0: leg.samples[i].dir.clone().multiplyScalar(leg.samples[i].ground),
                        c1: leg.samples[i + 1].dir
                            .clone()
                            .multiplyScalar(leg.samples[i + 1].ground),
                        gi: gi + i,
                    });
                }
            }
            gi += leg.samples.length;
        }
        const totalIdx = gi;
        const wrapFar = (a, b) => {
            const d = Math.abs(a - b);
            return Math.min(d, totalIdx - d) > 8;
        };
        const _wp = new THREE.Vector3();
        const _wab = new THREE.Vector3();
        const distToSeg = (pt, sg) => {
            _wab.copy(sg.c1).sub(sg.c0);
            const len2 = _wab.lengthSq();
            const t = len2 < 1e-12
                ? 0
                : Math.max(0, Math.min(1, _wp.copy(pt).sub(sg.c0).dot(_wab) / len2));
            return _wp.copy(sg.c0).addScaledVector(_wab, t).distanceTo(pt);
        };
        for (const { s, gi: si } of flat) {
            const centre = s.dir.clone().multiplyScalar(s.ground);
            const near = segs.filter((sg) => wrapFar(si, sg.gi) && sg.c0.distanceTo(centre) < 14);
            if (!near.length)
                continue;
            for (const sign of [1, -1]) {
                let firstEarlier = Infinity;
                let firstAny = Infinity;
                for (let o = 0.5; o <= FOOT_OUT + SHOULDER_MAX + 1e-6; o += 0.5) {
                    const pt = centre.clone().addScaledVector(s.right, sign * o);
                    for (const sg of near) {
                        if (distToSeg(pt, sg) >= FOOT_OUT - 0.05)
                            continue;
                        if (o < firstAny)
                            firstAny = o;
                        if (sg.gi < si && o < firstEarlier)
                            firstEarlier = o;
                    }
                    if (firstEarlier < Infinity)
                        break;
                }
                const toCap = (first) => {
                    if (first === Infinity)
                        return Infinity;
                    const c = first - 0.25;
                    return c < 0.6 ? 0 : c; // slivers read worse than a clean cut
                };
                const cap = toCap(firstEarlier);
                const skirtCap = toCap(firstAny);
                if (sign === 1) {
                    s.capR = Math.min(s.capR, cap);
                    s.skirtCapR = Math.min(s.skirtCapR, skirtCap);
                }
                else {
                    s.capL = Math.min(s.capL, cap);
                    s.skirtCapL = Math.min(s.skirtCapL, skirtCap);
                }
            }
        }
    }
    legsData.forEach(({ ai, samples, steps }) => {
        const asphalt = new MeshBuf();
        const paint = new MeshBuf();
        const median = new MeshBuf();
        const footpath = new MeshBuf();
        const skirt = new MeshBuf();
        /**
         * Ground colour where the apron meets the land, so it reads as earth.
         * Near hubs the straight-out probe often lands on ANOTHER leg's painted
         * terrain ribbon and the apron came out road-grey — the dark rounded
         * patches of P43 (21% of near-hub skirt verts). Walk outward past any
         * paint before sampling; if paint persists, take the last probe anyway.
         */
        const groundColour = (s, o) => {
            const c = new THREE.Color();
            const step = Math.sign(o) || 1;
            for (let k = 0;; k++) {
                const probe = s.dir
                    .clone()
                    .addScaledVector(s.right, (o + step * k * 0.8) / s.ground)
                    .normalize();
                if (roadDistance(probe) >= 1.5 || k === 6) {
                    terrainColor(probe, terrainRadius(probe), c);
                    return c;
                }
            }
        };
        /**
         * Verge apron. The deck is graded, the land is not, so its outer edge sits
         * above or below the ground by a variable amount. This closes that step
         * with a sloped face — a cut bank where the land is higher, fill where it
         * is lower — instead of leaving a torn edge for terrain to show through.
         */
        /**
         * Point on the shoulder at lateral `o`: smoothstepped from the footpath's
         * outer top down to the natural ground across SHOULDER_FALLOFF, so an
         * embankment curves into the land instead of dropping as a flat wall.
         *
         * The vertex is placed with crossPoint's convention — lateral offset
         * divided by the point's OWN height — so at f = 0 this reproduces the
         * footpath's outer-top vertex exactly and the shoulder shares its edge
         * with the footpath mesh (review caught a 0.03–0.33u crack when the two
         * used different conventions). `fOverride` pins the trimmed outer edge to
         * the ground (f = 1): a shoulder cut short by the hub wedge trim must
         * still bury its edge in the terrain, not hang mid-blend in the air.
         */
        const shoulderPoint = (s, o, reach, fOverride) => {
            const probe = s.dir.clone().addScaledVector(s.right, o / s.ground).normalize();
            const rawH = terrainRadius(probe);
            const eProbe = s.dir
                .clone()
                .addScaledVector(s.right, (Math.sign(o) * FOOT_OUT) / s.ground)
                .normalize();
            const h = fOverride === 1
                ? rawH
                : shoulderHeight(s.ground, terrainRadius(eProbe), rawH, Math.abs(o), reach);
            return s.dir.clone().addScaledVector(s.right, o / h).normalize().multiplyScalar(h);
        };
        /** embankment reach for this sample/side — same probes the ride surface uses */
        const skirtReach = (s, sign) => {
            const eProbe = s.dir
                .clone()
                .addScaledVector(s.right, (sign * FOOT_OUT) / s.ground)
                .normalize();
            const oProbe = s.dir
                .clone()
                .addScaledVector(s.right, (sign * SKIRT_OUT) / s.ground)
                .normalize();
            return shoulderReach(s.ground, terrainRadius(eProbe), terrainRadius(oProbe));
        };
        const skirtSide = (s0, s1, sign) => {
            const reach0 = skirtReach(s0, sign);
            const reach1 = skirtReach(s1, sign);
            const rMax = Math.max(reach0, reach1);
            const trimmed = foldTrim(s0, s1, Math.min(sign * FOOT_OUT, sign * (FOOT_OUT + rMax)), Math.max(sign * FOOT_OUT, sign * (FOOT_OUT + rMax)), true);
            if (!trimmed)
                return;
            const inner = sign === 1 ? trimmed[0] : trimmed[1];
            const outerT = sign === 1 ? trimmed[1] : trimmed[0];
            // each sample runs out to its own reach, capped by the wedge trim
            const outFor = (reach) => sign === 1
                ? Math.min(sign * (FOOT_OUT + reach), outerT)
                : Math.max(sign * (FOOT_OUT + reach), outerT);
            const o0max = outFor(reach0);
            const o1max = outFor(reach1);
            const pin0 = Math.abs(o0max) < FOOT_OUT + reach0 - 1e-4;
            const pin1 = Math.abs(o1max) < FOOT_OUT + reach1 - 1e-4;
            // three strips trace the smoothstep; one flat quad cannot curve
            const STRIPS = 3;
            const rows0 = [];
            const rows1 = [];
            const cols0 = [];
            const cols1 = [];
            for (let k = 0; k <= STRIPS; k++) {
                const a0 = inner + ((o0max - inner) * k) / STRIPS;
                const a1 = inner + ((o1max - inner) * k) / STRIPS;
                rows0.push(shoulderPoint(s0, a0, reach0, k === STRIPS && pin0 ? 1 : undefined));
                rows1.push(shoulderPoint(s1, a1, reach1, k === STRIPS && pin1 ? 1 : undefined));
                cols0.push(groundColour(s0, a0));
                cols1.push(groundColour(s1, a1));
            }
            for (let k = 0; k < STRIPS; k++) {
                // wind by increasing lateral offset so normals face outward
                if (sign === 1) {
                    skirt.quadC(rows0[k], cols0[k + 1], rows0[k + 1], cols0[k + 1], rows1[k + 1], cols1[k + 1], rows1[k], cols1[k + 1]);
                }
                else {
                    skirt.quadC(rows0[k + 1], cols0[k + 1], rows0[k], cols0[k + 1], rows1[k], cols1[k + 1], rows1[k + 1], cols1[k + 1]);
                }
            }
        };
        /** trim a lateral span to both samples' fold caps; null = fully folded */
        const foldTrim = (s0, s1, oL, oR, skirtToo = false) => {
            let capL = Math.min(s0.capL, s1.capL);
            let capR = Math.min(s0.capR, s1.capR);
            if (skirtToo) {
                capL = Math.min(capL, s0.skirtCapL, s1.skirtCapL);
                capR = Math.min(capR, s0.skirtCapR, s1.skirtCapR);
            }
            const L = Math.max(oL, -capL);
            const R = Math.min(oR, capR);
            return L < R - 1e-6 ? [L, R] : null;
        };
        const flat = (m, s0, s1, oL, oR, lift) => {
            const trimmed = foldTrim(s0, s1, oL, oR);
            if (!trimmed)
                return;
            [oL, oR] = trimmed;
            const g0L = edgeGround(s0, oL);
            const g0R = edgeGround(s0, oR);
            const g1L = edgeGround(s1, oL);
            const g1R = edgeGround(s1, oR);
            m.quad(crossPoint(s0, oL, lift, g0L), crossPoint(s0, oR, lift, g0R), crossPoint(s1, oR, lift, g1R), crossPoint(s1, oL, lift, g1L));
        };
        const raised = (m, s0, s1, oL, oR, top) => {
            const trimmed = foldTrim(s0, s1, oL, oR);
            if (!trimmed)
                return;
            [oL, oR] = trimmed;
            const g0L = edgeGround(s0, oL);
            const g0R = edgeGround(s0, oR);
            const g1L = edgeGround(s1, oL);
            const g1R = edgeGround(s1, oR);
            const t0L = crossPoint(s0, oL, top, g0L);
            const t0R = crossPoint(s0, oR, top, g0R);
            const t1R = crossPoint(s1, oR, top, g1R);
            const t1L = crossPoint(s1, oL, top, g1L);
            const b0L = crossPoint(s0, oL, ASPHALT_LIFT, g0L);
            const b0R = crossPoint(s0, oR, ASPHALT_LIFT, g0R);
            const b1R = crossPoint(s1, oR, ASPHALT_LIFT, g1R);
            const b1L = crossPoint(s1, oL, ASPHALT_LIFT, g1L);
            m.quad(t0L, t0R, t1R, t1L); // top
            m.quad(t0R, b0R, b1R, t1R); // outer face
            m.quad(b0L, t0L, t1L, b1L); // inner face
        };
        for (let i = 0; i < steps; i++) {
            const s0 = samples[i];
            const s1 = samples[i + 1];
            if (!s0.dry || !s1.dry)
                continue; // bridges already carry the water crossings
            for (const sign of [-1, 1]) {
                const inner = sign * LANE_IN;
                const outer = sign * LANE_OUT;
                const oL = Math.min(inner, outer);
                const oR = Math.max(inner, outer);
                flat(asphalt, s0, s1, oL, oR, ASPHALT_LIFT);
                // solid edge lines, one at each carriageway edge
                const outerEdge = sign * (LANE_OUT - MARK_HALF * 2);
                flat(paint, s0, s1, Math.min(outerEdge, outer), Math.max(outerEdge, outer), PAINT_LIFT);
                const innerEdge = sign * (LANE_IN + MARK_HALF * 2);
                flat(paint, s0, s1, Math.min(inner, innerEdge), Math.max(inner, innerEdge), PAINT_LIFT);
                // dashed divider between this carriageway's two lanes
                const phase = s0.s % DASH_PERIOD;
                if (phase < DASH_ON) {
                    flat(paint, s0, s1, sign * LANE_MID - MARK_HALF, sign * LANE_MID + MARK_HALF, PAINT_LIFT);
                }
                // footpath
                raised(footpath, s0, s1, Math.min(sign * FOOT_IN, sign * FOOT_OUT), Math.max(sign * FOOT_IN, sign * FOOT_OUT), FOOTPATH_TOP);
            }
            // median, broken around every pillar footing
            if (s0.medianOk && s1.medianOk) {
                raised(median, s0, s1, -MEDIAN_HALF, MEDIAN_HALF, MEDIAN_TOP);
            }
            skirtSide(s0, s1, 1);
            skirtSide(s0, s1, -1);
        }
        const pairs = [
            [asphalt, "asphalt", CORRIDOR_COLORS.asphalt, false],
            [paint, "paint", CORRIDOR_COLORS.paint, false],
            [median, "median", CORRIDOR_COLORS.median, false],
            [footpath, "footpath", CORRIDOR_COLORS.footpath, false],
            [skirt, "skirt", "#ffffff", true],
        ];
        for (const [buf, name, color, vertexColors] of pairs) {
            if (buf.empty)
                continue;
            out.push({ key: `${ai}-${name}`, geometry: buf.build(), color, vertexColors });
        }
    });
    return out;
}
/** counts for reporting */
export function corridorStats(meshes) {
    let tris = 0;
    let verts = 0;
    for (const m of meshes) {
        tris += (m.geometry.getIndex()?.count ?? 0) / 3;
        verts += m.geometry.getAttribute("position").count;
    }
    return { meshes: meshes.length, tris, verts };
}
const COLLIDER_SPECS = {
    palace: { shape: "box", hx: 1.57, hz: 0.6, top: 2.35 },
    gopuram: { shape: "box", hx: 0.8, hz: 0.8, top: 3.04 },
    "temple-court": { shape: "box", hx: 1.3, hz: 1.1, top: 1.2 },
    "mill-block": { shape: "box", hx: 1.1, hz: 0.9, top: 2.2 },
    "workshop-shed": { shape: "box", hx: 1.0, hz: 0.8, top: 1.5 },
    stall: { shape: "box", hx: 0.55, hz: 0.4, top: 1.1 },
    // uprights at +-0.9 rather than one slab: this is a gateway on the palace
    // approach and sealing it would wall off the thing it leads to
    "haveli-arch": { shape: "posts", xs: [-0.9, 0.9], r: 0.25, top: 2.8 },
    "metro-pillar": { shape: "shaft", r: 0.42 },
    "bridge-pier": { shape: "shaft", r: 0.16 },
    "bridge-rail": { shape: "rail", r: 0.12, top: 0.5 },
    // Trees stop you at the trunk, not the canopy — a single upright, using the
    // cylinder's wider bottom radius. Walking under a mango's foliage is fine;
    // walking through its bole is not. The banyan's aerial roots are left open,
    // so the grove stays a place you can wander into.
    "mango-tree": { shape: "posts", xs: [0], r: 0.14, top: 1.2 },
    banyan: { shape: "posts", xs: [0], r: 0.45, top: 1.6 },
    "peepal-tree": { shape: "posts", xs: [0], r: 0.26, top: 1.8 },
    // guardrails carry the ground under each post in aux since P33, which is the
    // same two-point form bridge-rail already uses
    guardrail: { shape: "rail", r: 0.12, top: GUARD_SHOW },
};
const _zeroAxis = new THREE.Vector3();
function makeCollider(form, at, r0, r1, bound, extra = {}) {
    return {
        at,
        bound,
        r0,
        r1,
        form,
        rad: 0,
        axisX: _zeroAxis,
        axisZ: _zeroAxis,
        hx: 0,
        hz: 0,
        end: at,
        ...extra,
    };
}
let _colliders = null;
let _cachedProps = null;
/** buildProps is not cheap; the collision tables want it once, not per query */
function cachedProps() {
    if (!_cachedProps)
        _cachedProps = buildProps();
    return _cachedProps;
}
function colliders() {
    if (_colliders)
        return _colliders;
    const out = [];
    for (const p of cachedProps()) {
        const spec = COLLIDER_SPECS[p.kind];
        if (!spec)
            continue;
        const base = p.position.length();
        if (spec.shape === "box") {
            const hx = spec.hx * p.scale;
            const hz = spec.hz * p.scale;
            out.push(makeCollider("box", p.position, base - 0.5, base + spec.top * p.scale, Math.hypot(hx, hz), {
                axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion),
                axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(p.quaternion),
                hx,
                hz,
            }));
        }
        else if (spec.shape === "posts") {
            const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quaternion);
            const rad = spec.r * p.scale;
            for (const x of spec.xs) {
                const at = p.position.clone().addScaledVector(axisX, x * p.scale);
                out.push(makeCollider("circle", at, base - 0.5, base + spec.top * p.scale, rad, { rad }));
            }
        }
        else if (spec.shape === "shaft") {
            if (!p.aux)
                continue;
            const rad = spec.r * p.scale;
            out.push(makeCollider("circle", p.aux[0], p.aux[0].length(), p.aux[1].length(), rad, { rad }));
        }
        else {
            if (!p.aux)
                continue;
            const [a, b] = p.aux;
            const rad = spec.r * p.scale;
            const lo = Math.min(a.length(), b.length());
            const hi = Math.max(a.length(), b.length());
            out.push(makeCollider("segment", a, lo - 0.05, hi + spec.top * p.scale, a.distanceTo(b) + rad, {
                rad,
                end: b,
            }));
        }
    }
    _colliders = out;
    return out;
}
/** how many colliders are live, and of which kinds — for reporting */
export function colliderStats() {
    const byKind = new Map();
    for (const p of cachedProps()) {
        if (COLLIDER_SPECS[p.kind])
            byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
    }
    return { total: colliders().length, byKind: [...byKind.entries()].sort() };
}
const _pcUp = new THREE.Vector3();
const _pcDelta = new THREE.Vector3();
const _pcOff = new THREE.Vector3();
const _pcSeg = new THREE.Vector3();
/**
 * Deepest overlap between a standing capsule at `pos` and any solid prop.
 * `normal` comes back tangent to the sphere and pointing away from the
 * obstacle, so the caller can push out along it and keep sliding.
 */
export function propCollision(pos, radius, height, hit) {
    const r = pos.length();
    if (r < 1e-6)
        return false;
    _pcUp.copy(pos).divideScalar(r);
    let found = false;
    hit.depth = 0;
    for (const c of colliders()) {
        // the vertical bands must overlap: nothing you stand on top of, or walk
        // underneath, should stop you
        if (r + height <= c.r0 || r >= c.r1)
            continue;
        // Reject in full 3D first. Flattening onto the tangent plane below throws
        // away radial separation, which on a sphere makes anything directly above,
        // below or antipodal look like it is standing right next to you — a rail on
        // the far side of the planet was registering as a hit.
        if (c.form === "segment") {
            _pcSeg.copy(c.end).sub(c.at);
            const len2 = _pcSeg.lengthSq();
            _pcDelta.copy(pos).sub(c.at);
            const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, _pcDelta.dot(_pcSeg) / len2));
            _pcDelta.addScaledVector(_pcSeg, -t);
            const reach = radius + c.rad;
            if (_pcDelta.lengthSq() > reach * reach)
                continue;
        }
        else {
            _pcDelta.copy(pos).sub(c.at);
            // +1 of slack so a step of terrain between player and prop base cannot
            // reject a contact that is genuinely there
            const reach = c.bound + radius + 1;
            if (_pcDelta.lengthSq() > reach * reach)
                continue;
        }
        // now measure in the tangent plane, so nothing pushes the player up or down
        _pcDelta.addScaledVector(_pcUp, -_pcDelta.dot(_pcUp));
        let depth;
        if (c.form === "box") {
            const lx = _pcDelta.dot(c.axisX);
            const lz = _pcDelta.dot(c.axisZ);
            const cx = Math.max(-c.hx, Math.min(c.hx, lx));
            const cz = Math.max(-c.hz, Math.min(c.hz, lz));
            let ox = lx - cx;
            let oz = lz - cz;
            const d = Math.hypot(ox, oz);
            if (d > radius)
                continue;
            if (d < 1e-6) {
                // dead inside the box: leave by whichever face is nearest
                if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) {
                    ox = lx >= 0 ? 1 : -1;
                    oz = 0;
                    depth = radius + c.hx - Math.abs(lx);
                }
                else {
                    ox = 0;
                    oz = lz >= 0 ? 1 : -1;
                    depth = radius + c.hz - Math.abs(lz);
                }
                _pcOff.copy(c.axisX).multiplyScalar(ox).addScaledVector(c.axisZ, oz);
            }
            else {
                depth = radius - d;
                _pcOff.copy(c.axisX).multiplyScalar(ox / d).addScaledVector(c.axisZ, oz / d);
            }
        }
        else {
            const d = _pcDelta.length();
            const reach = radius + c.rad;
            if (d > reach)
                continue;
            if (d < 1e-6)
                continue; // exactly on the axis: no usable push direction
            depth = reach - d;
            _pcOff.copy(_pcDelta).divideScalar(d);
        }
        if (depth <= hit.depth)
            continue;
        _pcOff.addScaledVector(_pcUp, -_pcOff.dot(_pcUp));
        if (_pcOff.lengthSq() < 1e-12)
            continue;
        hit.normal.copy(_pcOff).normalize();
        hit.depth = depth;
        found = true;
    }
    return found;
}
/* ------------------------------------------------------- walkable bridges */
/** the walkable surface runs right out to that span's own railings */
/** the deck box is 0.2 thick and centred on the span height */
const DECK_TOP = 0.1;
let _decks = null;
function decks() {
    if (_decks)
        return _decks;
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const out = [];
    const probe = new THREE.Vector3();
    for (const span of BRIDGE_SPANS) {
        const [idA, idB] = ROAD_PAIRS[span.road];
        const za = byId.get(idA);
        const zb = byId.get(idB);
        if (!za || !zb)
            continue;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        const omega = a.angleTo(b);
        const perp = b.clone().addScaledVector(a, -a.dot(b));
        if (perp.lengthSq() < 1e-12)
            continue;
        out.push({
            span,
            a,
            n: new THREE.Vector3().crossVectors(a, b).normalize(),
            perp: perp.normalize(),
            bankA: terrainRadius(arcPoint(a, b, omega, span.tA, probe)),
            bankB: terrainRadius(arcPoint(a, b, omega, span.tB, probe)),
        });
    }
    _decks = out;
    return out;
}
/**
 * Radius of the walkable bridge surface beneath `dir`, or null where there is
 * no deck. Ramps are included, and at a ramp's foot the deck height equals the
 * bank terrain, so walking on is continuous rather than a step up.
 */
export function bridgeSurface(dir) {
    let best = null;
    for (const d of decks()) {
        const t = Math.atan2(dir.dot(d.perp), dir.dot(d.a));
        if (t < d.span.tA || t > d.span.tB)
            continue;
        const height = bridgeHeight(d.span, t, d.bankA, d.bankB);
        // lateral offset from the centreline, as a world distance at deck height
        const lateral = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(d.n))))) * height;
        if (lateral > d.span.halfWidth)
            continue;
        const surface = height + DECK_TOP;
        if (best === null || surface > best)
            best = surface;
    }
    return best;
}
/**
 * Reserved ground for buildings that do not exist yet. Each entry is a plot the
 * zoning plan has claimed; the pad rendered on it is a marker, not a structure.
 */
export const CIVIC_PLOTS = [
    { id: "hospital", district: "civic", anchorZone: "haveli", dir: [-0.478, -0.018, 0.878], footprint: 14 },
    { id: "college", district: "tech", anchorZone: "samadhi", dir: [0.824, -0.524, 0.218], footprint: 20 },
    { id: "itpark", district: "tech", anchorZone: "samadhi", dir: [0.9201, -0.3883, 0.051], footprint: 20 },
    { id: "apartments", district: "industrial", anchorZone: "mill", dir: [0.173, 0.512, -0.841], footprint: 20 },
    { id: "park", district: "green", anchorZone: "grove", dir: [-0.663, -0.747, -0.049], footprint: 20 },
    { id: "busstand", district: "transit", anchorZone: "bazaar", dir: [0.8613, 0.2795, -0.4244], footprint: 14 },
    { id: "cycleshop", district: "service", anchorZone: "workshop", dir: [-0.8402, -0.5365, 0.0787], footprint: 10 },
];
/** clearances a reserved plot must keep, beyond its own radius */
/**
 * Plot setback from the corridor centreline: the full shoulder reach (5.55u,
 * SKIRT_OUT) plus slack for the spline-vs-arc gap arterialDistance leaves.
 */
const PLOT_CORRIDOR = 5.55 + 0.65;
const PLOT_PILLAR = 0.5;
const PLOT_BUILDING = 2;
const PLOT_NPC = 1.5;
const PLOT_PLOT = 2;
/**
 * How far the search will walk from the intended centre, and in what rings.
 * 34 rings reaches 51u: the tech district asks for two 20u plots near samadhi,
 * and with 22u of mutual separation plus the corridor the second one has to
 * travel to find room.
 */
const PLOT_RING = 1.5;
const PLOT_RINGS = 34;
/** ground under a plot may not tilt more than this */
const PLOT_SLOPE = 0.3;
/** kinds that occupy ground a plot may not overlap. Verge scatter is not one. */
const PLOT_BLOCKERS = new Set([
    "palace", "gopuram", "temple-court", "nandi-statue", "temple-steps", "mill-block",
    "workshop-shed", "stall", "market-umbrella", "haveli-arch", "banyan", "mango-tree",
    "peepal-tree", "ghat-steps", "zone-signboard", "metro-station",
]);
/** ground spread and wetness across a plot's disc */
function plotRelief(dir, radius) {
    const r = terrainRadius(dir);
    const t1 = (Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
        .clone().cross(dir).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
    let lo = r, hi = r, wet = false;
    // rim and an inner ring, so a hump or hollow inside the disc is caught too
    for (const frac of [1, 0.6]) {
        for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const p = dir.clone()
                .addScaledVector(t1, (Math.cos(a) * radius * frac) / r)
                .addScaledVector(t2, (Math.sin(a) * radius * frac) / r)
                .normalize();
            const pr = terrainRadius(p);
            if (pr < WATER_LEVEL + 1)
                wet = true;
            lo = Math.min(lo, pr);
            hi = Math.max(hi, pr);
        }
    }
    return { r, band: hi - lo, wet };
}
/** every clearance a plot centre would have, negative meaning it overlaps */
function plotClearances(dir, radius, placed, pads) {
    const r = terrainRadius(dir);
    const at = dir.clone().multiplyScalar(r);
    const corridor = arterialDistance(dir) - PLOT_CORRIDOR - radius;
    let pillar = Infinity;
    let building = Infinity;
    let buildingWhat = "-";
    for (const p of placed) {
        if (p.kind === "metro-pillar") {
            pillar = Math.min(pillar, at.distanceTo(p.position));
        }
        else if (PLOT_BLOCKERS.has(p.kind)) {
            const d = at.distanceTo(p.position);
            if (d < building) {
                building = d;
                buildingWhat = `${p.kind}(${p.seed})`;
            }
        }
    }
    let npc = Infinity;
    for (const s of npcSpots())
        npc = Math.min(npc, at.distanceTo(s));
    let plot = Infinity;
    for (const o of pads) {
        plot = Math.min(plot, o.dir.angleTo(dir) * r - o.radius - radius - PLOT_PLOT);
    }
    return {
        corridor,
        pillar: pillar - radius - PLOT_PILLAR,
        building: building - radius - PLOT_BUILDING,
        buildingWhat,
        npc: npc - radius - PLOT_NPC,
        plot,
    };
}
/**
 * Walk outward from the requested centre in rings until the whole disc sits on
 * dry, gentle ground clear of the corridor, the viaduct, every building, every
 * villager and every other plot.
 */
function siteCivicPlot(want, radius, placed, pads) {
    const t1 = (Math.abs(want.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
        .clone().cross(want).normalize();
    const t2 = new THREE.Vector3().crossVectors(want, t1).normalize();
    const base = terrainRadius(want);
    for (let ring = 0; ring <= PLOT_RINGS; ring++) {
        const out = ring * PLOT_RING;
        const steps = ring === 0 ? 1 : ring * 8;
        for (let k = 0; k < steps; k++) {
            const a = (k / steps) * Math.PI * 2;
            const cand = ring === 0
                ? want.clone()
                : want.clone()
                    .addScaledVector(t1, (Math.cos(a) * out) / base)
                    .addScaledVector(t2, (Math.sin(a) * out) / base)
                    .normalize();
            const relief = plotRelief(cand, radius);
            if (relief.wet)
                continue;
            if (slopeAt(cand, relief.r) > PLOT_SLOPE)
                continue;
            const c = plotClearances(cand, radius, placed, pads);
            if (c.corridor < 0 || c.pillar < 0 || c.building < 0 || c.npc < 0 || c.plot < 0)
                continue;
            return { dir: cand, relief, clear: c, shift: want.angleTo(cand) * relief.r };
        }
    }
    return null;
}
let _plotSiting = [];
/** the siting each plot ended up with, for reporting */
export function civicPlotReport() {
    return _plotSiting;
}
/** reserve every civic plot as a visible pad */
function placeCivicPads(props) {
    const [padA, padB] = KIND_COLORS["civic-pad"] ?? ["#cfc4ae", "#a89e90"];
    const pads = [];
    const report = [];
    let seed = 9000;
    for (const plot of CIVIC_PLOTS) {
        const radius = plot.footprint / 2;
        const want = new THREE.Vector3(...plot.dir).normalize();
        const sited = siteCivicPlot(want, radius, props, pads);
        if (!sited) {
            report.push({
                id: plot.id, district: plot.district, anchorZone: plot.anchorZone,
                dir: want, radius, ground: terrainRadius(want), band: NaN, slope: NaN,
                shift: NaN, corridor: NaN, pillar: NaN, building: NaN, buildingWhat: "-",
                npc: NaN, plot: NaN, ok: false,
            });
            continue;
        }
        pads.push({ dir: sited.dir, radius });
        props.push({
            kind: "civic-pad",
            position: surfacePoint(sited.dir, 0),
            quaternion: surfaceQuaternion(sited.dir, 0),
            // the pad is a disc of this radius; the renderer divides its thickness
            // back out so the slab stays 0.08u tall whatever the plot's size
            scale: radius,
            colorA: padA,
            colorB: padB,
            seed: seed++,
        });
        report.push({
            id: plot.id, district: plot.district, anchorZone: plot.anchorZone,
            dir: sited.dir, radius, ground: sited.relief.r, band: sited.relief.band,
            slope: slopeAt(sited.dir, sited.relief.r), shift: sited.shift,
            corridor: sited.clear.corridor, pillar: sited.clear.pillar,
            building: sited.clear.building, buildingWhat: sited.clear.buildingWhat,
            npc: sited.clear.npc, plot: sited.clear.plot, ok: true,
        });
    }
    _plotSiting = report;
}
let _ride = null;
/**
 * Centreline samples of every arterial, carrying the same smoothed profile the
 * corridor mesh is built from. Built once, from corridorProfile — the smoothing
 * lives in one place and this only reads it.
 */
function rideSamples() {
    if (_ride)
        return _ride;
    // guarantees the metro network exists, which is what the legs are cut from
    cachedProps();
    const net = NET;
    const out = [];
    if (!net)
        return out;
    const tOf = new Map(net.stations.map((s) => [s.zone, s.t]));
    const dir = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const behind = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    ARTERIAL_PAIRS.forEach(([idA, idB], leg) => {
        const tA = tOf.get(idA);
        const tB = tOf.get(idB);
        if (tA === undefined || tB === undefined)
            return;
        const span = (((tB - tA) % net.total) + net.total) % net.total;
        if (span < CORRIDOR_STEP)
            return;
        const steps = Math.max(2, Math.ceil(span / CORRIDOR_STEP));
        const profile = corridorProfile(tA, span, steps);
        for (let i = 0; i <= steps; i++) {
            const t = tA + (i / steps) * span;
            loopDir(t, dir);
            loopDir(t + TANGENT_EPS, ahead);
            loopDir(t - TANGENT_EPS, behind);
            fwd.copy(ahead).sub(behind);
            fwd.addScaledVector(dir, -fwd.dot(dir));
            if (fwd.lengthSq() < 1e-12)
                continue;
            fwd.normalize();
            const right = new THREE.Vector3().crossVectors(fwd, dir).normalize();
            const ground = profile[i];
            // the same water test buildCorridors uses, against the real ground: where
            // it fails no corridor was built and the bridges take over
            const wet = terrainRadius(dir);
            const dry = wet >= WATER_LEVEL + 0.48 &&
                terrainRadius(dir.clone().addScaledVector(right, FOOT_OUT / ground).normalize()) >=
                    WATER_LEVEL + 0.48 &&
                terrainRadius(dir.clone().addScaledVector(right, -FOOT_OUT / ground).normalize()) >=
                    WATER_LEVEL + 0.48;
            out.push({ dir: dir.clone(), right, ground, dry, leg });
        }
    });
    _ride = out;
    return out;
}
const _rideProbe = new THREE.Vector3();
/**
 * Height of the road surface under `dir`, or null off the corridor.
 *
 * The corridor is not one height: the deck is smoothed along its length, but
 * across its width MAX_TWIST ties each edge back toward the real ground, and the
 * footpath stands proud of the carriageway. This walks the same cross-section
 * the mesh is built from, so what you stand on is what you see.
 */
/**
 * Kerb ramp half-width for the RIDE surface only. The drawn kerbs stay square;
 * underfoot the 0.14u median step and 0.10u footpath step ramp over this span,
 * because a full step in a single frame reads as a screen judder, not a kerb.
 */
const KERB_RAMP = 0.3;
/** ride-height lift at lateral |o|, with ramped band transitions */
function rideLift(a) {
    const mix = (from, to, edge) => {
        const t = Math.min(1, Math.max(0, (a - (edge - KERB_RAMP / 2)) / KERB_RAMP));
        return from + (to - from) * t;
    };
    if (a < MEDIAN_HALF + KERB_RAMP / 2)
        return mix(MEDIAN_TOP, ASPHALT_LIFT, MEDIAN_HALF);
    return mix(ASPHALT_LIFT, FOOTPATH_TOP, LANE_OUT);
}
const _rideC0 = new THREE.Vector3();
const _rideC1 = new THREE.Vector3();
const _rideAB = new THREE.Vector3();
const _ridePW = new THREE.Vector3();
const _rideR = new THREE.Vector3();
export function corridorSurface(dir) {
    const samples = rideSamples();
    let bestI = -1;
    let bestDot = -2;
    for (let i = 0; i < samples.length; i++) {
        const d = samples[i].dir.dot(dir);
        if (d > bestDot) {
            bestDot = d;
            bestI = i;
        }
    }
    if (bestI < 0)
        return null;
    // Interpolate along whichever adjacent segment the point projects into.
    // Snapping to the nearest sample changed the whole frame every 0.6u of
    // travel, and the resulting height steps were the P44 "screen dancing".
    let s0 = samples[bestI];
    let s1 = s0;
    let t = 0;
    _ridePW.copy(dir).multiplyScalar(s0.ground);
    for (const j of [bestI - 1, bestI + 1]) {
        if (j < 0 || j >= samples.length)
            continue;
        const n = samples[j];
        if (n.leg !== s0.leg)
            continue;
        const a2 = j < bestI ? n : samples[bestI];
        const b2 = j < bestI ? samples[bestI] : n;
        _rideC0.copy(a2.dir).multiplyScalar(a2.ground);
        _rideC1.copy(b2.dir).multiplyScalar(b2.ground);
        _rideAB.copy(_rideC1).sub(_rideC0);
        const len2 = _rideAB.lengthSq();
        if (len2 < 1e-12)
            continue;
        const tt = _rideProbe.copy(_ridePW).sub(_rideC0).dot(_rideAB) / len2;
        if (tt >= 0 && tt <= 1) {
            s0 = a2;
            s1 = b2;
            t = tt;
            break;
        }
    }
    if (!s0.dry || !s1.dry)
        return null;
    const ground = s0.ground + (s1.ground - s0.ground) * t;
    const right = _rideR.copy(s0.right).lerp(s1.right, t);
    if (right.lengthSq() < 1e-12)
        return null;
    right.normalize();
    // NOTE: P41c's corner overhang is NOT fixed here. Refining against the two
    // neighbouring segments can only make this offset smaller, and the overhang is
    // the case where it is already too small. Still open.
    const o = Math.asin(Math.max(-1, Math.min(1, dir.dot(right)))) * ground;
    const a = Math.abs(o);
    if (a > FOOT_OUT + SHOULDER_MAX)
        return null;
    // the probe direction IS the query point — no reconstruction error
    const raw = terrainRadius(dir);
    if (a > FOOT_OUT) {
        // the walkable shoulder: the SAME curve and reach the skirt mesh uses
        const eDir = _rideProbe
            .copy(dir)
            .addScaledVector(right, (Math.sign(o) * FOOT_OUT - o) / ground)
            .normalize();
        const edgeRaw = terrainRadius(eDir);
        const oDir = _rideProbe
            .copy(dir)
            .addScaledVector(right, (Math.sign(o) * SKIRT_OUT - o) / ground)
            .normalize();
        const reach = shoulderReach(ground, edgeRaw, terrainRadius(oDir));
        if (a > FOOT_OUT + reach)
            return null;
        return shoulderHeight(ground, edgeRaw, raw, a, reach);
    }
    const lift = rideLift(a);
    const limit = a * Math.tan(MAX_TWIST);
    return ground + Math.max(-limit, Math.min(limit, raw - ground)) + lift;
}
/** module-scope smoothstep for the shoulder curve */
function smoothstep01(t) {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
}
/**
 * THE shoulder height curve — the only definition. Both the drawn skirt mesh
 * and the walkable ride surface call this, so the two cannot drift apart.
 * `edgeRaw` is the natural ground at the footpath's outer edge (the twist
 * clamp anchors there); `pointRaw` the ground under the queried point.
 */
function shoulderHeight(ground, edgeRaw, pointRaw, a, reach = SHOULDER_FALLOFF) {
    const edgeH = shoulderEdgeH(ground, edgeRaw);
    const f = smoothstep01((a - FOOT_OUT) / reach);
    return edgeH * (1 - f) + pointRaw * f;
}
/** the footpath outer-top height the embankment descends from */
function shoulderEdgeH(ground, edgeRaw) {
    const limit = FOOT_OUT * Math.tan(MAX_TWIST);
    return ground + Math.max(-limit, Math.min(limit, edgeRaw - ground)) + FOOTPATH_TOP;
}
/**
 * How far past the footpath edge the embankment reaches: 2x the drop to the
 * natural ground (~1:2 average slope) — never narrower than SHOULDER_FALLOFF,
 * never wider than SHOULDER_MAX. `outerRaw` is the ground probed at the
 * nominal outer line (FOOT_OUT + SHOULDER_FALLOFF); both the skirt mesh and
 * the ride surface size the shoulder with THIS function so they agree.
 */
function shoulderReach(ground, edgeRaw, outerRaw) {
    const drop = shoulderEdgeH(ground, edgeRaw) - outerRaw;
    return Math.min(SHOULDER_MAX, Math.max(SHOULDER_FALLOFF, 2 * drop));
}
/**
 * The surface anything standing here rests on: the ground, raised to the road
 * or a bridge deck where one covers it. Used for placing things and for camera
 * clearance — collision wants the snap guard instead, and does its own.
 */
export function groundOrDeck(dir) {
    let g = terrainRadius(dir);
    const road = corridorSurface(dir);
    if (road !== null && road > g)
        g = road;
    const deck = bridgeSurface(dir);
    if (deck !== null && deck > g)
        g = deck;
    return g;
}
