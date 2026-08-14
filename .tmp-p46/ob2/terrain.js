import * as THREE from "three";
import { NPCS, ZONES, WATER_LEVEL } from "./data.js";
/**
 * The village sits on a small, irregular round world — every NPC and zone
 * sits at a known distance from the planet centre. We build the surface as
 * a radial-basis interpolation through those anchor radii, which gives us a
 * low riverside ghat, a market plateau, a memorial bluff, and a temple
 * mountain, and lets us evaluate exact ground height analytically for the
 * character controller, with no raycasting.
 */
/* ---------------------------------------------------------------- noise */
function hash3(x, y, z) {
    let h = x * 374761393 + y * 668265263 + z * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function smooth(t) {
    return t * t * (3 - 2 * t);
}
function valueNoise(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const zf = smooth(z - zi);
    let n = 0;
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
                const w = (i ? xf : 1 - xf) * (j ? yf : 1 - yf) * (k ? zf : 1 - zf);
                n += w * hash3(xi + i, yi + j, zi + k);
            }
        }
    }
    return n * 2 - 1;
}
function fbm(x, y, z, octaves = 4) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * valueNoise(x * freq, y * freq, z * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.07;
    }
    return sum / norm;
}
function makeAnchors() {
    const list = [];
    const push = (p, w = 1, rOverride) => {
        const v = new THREE.Vector3(p[0], p[1], p[2]);
        const r = rOverride ?? v.length();
        list.push({ dir: v.clone().normalize(), r, w });
    };
    // every NPC stands on the ground -> their distance is the surface radius
    for (const n of NPCS)
        push(n.position, 1);
    // zone centres carry the large scale landforms
    for (const z of ZONES)
        push(z.center, 1.35);
    // extra ocean anchors so the far side of the planet drops below sea level
    const oceanDirs = [
        [0.2, -0.95, 0.24],
        [0.62, -0.5, 0.6],
        [-0.7, 0.2, -0.68],
        [0.86, -0.2, 0.47],
        [-0.35, -0.75, -0.56],
        [0.1, 0.55, 0.83],
        [0.75, 0.45, 0.48],
        [-0.9, 0.35, -0.26],
        [0.3, -0.3, 0.9],
        [-0.55, -0.55, 0.63],
    ];
    for (const d of oceanDirs)
        push(d, 0.85, 29.44);
    return list;
}
const ANCHORS = makeAnchors();
const SIGMA = 0.4;
const FALLBACK_R = 29.12;
const FALLBACK_W = 0.09;
function buildRoads() {
    const byId = new Map(ZONES.map((z) => [z.id, z]));
    const pairs = [
        ["bazaar", "beach", 0.9],
        ["beach", "temple", 0.7],
        ["bazaar", "samadhi", 0.85],
        ["samadhi", "ghat", 0.8],
        ["ghat", "grove", 0.8],
        ["grove", "workshop", 0.7],
        ["grove", "mill", 0.85],
        ["mill", "ghat", 0.8],
        ["haveli", "bazaar", 0.9],
        ["haveli", "grove", 0.75],
        ["bazaar", "ghat", 0.8],
        // The metro loop runs an arterial along all nine consecutive zone pairs, but
        // four of them had no road here, so those segments crossed unflattened ground
        // and the corridor tore through it.
        //
        // 1.4 rather than the 0.7-0.9 the other roads use. Width sets how far out the
        // fully-suppressed core reaches, and these four carry a corridor 2.7u wide to
        // the footpath edge: at 0.8 the noise ramps back up *inside* that footprint
        // and the corridor tears worse than with no road at all. 1.4 puts the whole
        // cross-section in the core. The painted ribbon widens too, but the corridor
        // covers it -- only 0.1-0.5u of pale verge shows, less than beach-temple.
        ["samadhi", "grove", 1.4],
        ["haveli", "workshop", 1.4],
        ["workshop", "beach", 1.4],
        ["temple", "mill", 1.4],
    ];
    const roads = [];
    for (const [x, y, w] of pairs) {
        const za = byId.get(x);
        const zb = byId.get(y);
        if (!za || !zb)
            continue;
        const a = new THREE.Vector3(...za.center).normalize();
        const b = new THREE.Vector3(...zb.center).normalize();
        const n = new THREE.Vector3().crossVectors(a, b).normalize();
        roads.push({ a, b, n, width: w ?? 0.8 });
    }
    return roads;
}
/**
 * Angular half-width scale for road ribbons. The planet grew 1.6x while roads
 * only widen 1.3x in world units, so the angular figure shrinks: 0.045 x (1.3/1.6).
 */
const ROAD_BAND = 0.0365625;
const ROADS = buildRoads();
const _rv = new THREE.Vector3();
/** angular distance (radians) from a unit direction to the nearest road arc */
export function roadDistance(dir) {
    let best = 9;
    for (const road of ROADS) {
        const along = _rv.copy(dir).projectOnPlane(road.n);
        if (along.lengthSq() < 1e-8)
            continue;
        along.normalize();
        const ab = road.a.dot(road.b);
        // inside the arc segment?
        const inside = along.dot(road.a) >= ab - 1e-4 && along.dot(road.b) >= ab - 1e-4;
        let d;
        if (inside) {
            d = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.dot(road.n)))));
        }
        else {
            d = Math.min(dir.angleTo(road.a), dir.angleTo(road.b));
        }
        const norm = d / (road.width * ROAD_BAND);
        if (norm < best)
            best = norm;
    }
    return best;
}
/* ---------------------------------------------------------- metro loop */
/**
 * The metro/arterial loop lives HERE, not in props.ts, because the terrain
 * grading must follow the same geometry the corridor is drawn from. It used
 * to be built inside buildNetwork() while the flattening followed the
 * hand-duplicated ROADS arc list above — the two disagree by up to ~0.5u
 * laterally and the arcs' flat core (~±2u) never covered the corridor's
 * surfaced width (±3.95u), which stood shoulder cliffs and rock stripes
 * along every leg. The loop needs only ZONES, so it moves below props in
 * the dependency graph and props.ts imports it.
 */
const ZONE_DIRS_T = ZONES.map((z) => new THREE.Vector3(...z.center).normalize());
/** closed tour of all nine zones: nearest neighbour from KR Market, then 2-opt */
function planLoop() {
    const n = ZONE_DIRS_T.length;
    const dist = (a, b) => ZONE_DIRS_T[a].angleTo(ZONE_DIRS_T[b]);
    const start = Math.max(0, ZONES.findIndex((z) => z.id === "bazaar"));
    const tour = [start];
    const left = new Set();
    for (let i = 0; i < n; i++)
        if (i !== start)
            left.add(i);
    while (left.size) {
        const last = tour[tour.length - 1];
        let best = -1;
        let bestD = Infinity;
        for (const c of left) {
            const d = dist(last, c);
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        tour.push(best);
        left.delete(best);
    }
    const length = (t) => {
        let s = 0;
        for (let i = 0; i < n; i++)
            s += dist(t[i], t[(i + 1) % n]);
        return s;
    };
    for (let pass = 0; pass < 40; pass++) {
        let improved = false;
        for (let i = 1; i < n - 1 && !improved; i++) {
            for (let k = i + 1; k < n && !improved; k++) {
                const cand = tour
                    .slice(0, i)
                    .concat(tour.slice(i, k + 1).reverse(), tour.slice(k + 1));
                if (length(cand) < length(tour) - 1e-9) {
                    tour.splice(0, n, ...cand);
                    improved = true;
                }
            }
        }
        if (!improved)
            break;
    }
    return tour;
}
/** even arc-length resample spacing (radians) — one sample ≈ 0.8 world units */
const LOOP_SAMPLE = 0.02;
/**
 * Spacing of the extra spline controls seeded along each leg's great circle.
 * Smaller hugs the arc more tightly, larger rounds each hub more generously.
 */
const LOOP_CONTROL_STEP = 0.12;
export const METRO_LOOP = (() => {
    const order = planLoop();
    // Catmull-Rom through the zone centres alone bows off the geodesics, so each
    // leg is also seeded with controls along its own great circle: the curve hugs
    // the arc between hubs and only rounds the corner at each one.
    const controls = [];
    const zoneControl = [];
    for (let i = 0; i < order.length; i++) {
        const a = ZONE_DIRS_T[order[i]];
        const b = ZONE_DIRS_T[order[(i + 1) % order.length]];
        const om = a.angleTo(b);
        const sin = Math.sin(om);
        zoneControl.push(controls.length);
        const k = Math.max(1, Math.round(om / LOOP_CONTROL_STEP));
        for (let j = 0; j < k; j++) {
            const t = (j / k) * om;
            controls.push(sin < 1e-9
                ? a.clone()
                : a
                    .clone()
                    .multiplyScalar(Math.sin(om - t) / sin)
                    .addScaledVector(b, Math.sin(t) / sin)
                    .normalize());
        }
    }
    const curve = new THREE.CatmullRomCurve3(controls.map((d) => d.clone()), true, "centripetal");
    const M = 4000;
    const pts = [];
    for (let i = 0; i < M; i++)
        pts.push(curve.getPoint(i / M).normalize());
    const cum = new Float64Array(M + 1);
    for (let i = 0; i < M; i++)
        cum[i + 1] = cum[i] + pts[i].angleTo(pts[(i + 1) % M]);
    const total = cum[M];
    const n = Math.max(16, Math.round(total / LOOP_SAMPLE));
    const step = total / n;
    const dirs = new Float64Array(n * 3);
    {
        let seg = 0;
        const v = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
            const target = i * step;
            while (seg < M - 1 && cum[seg + 1] < target)
                seg++;
            const span = cum[seg + 1] - cum[seg];
            const f = span > 1e-12 ? (target - cum[seg]) / span : 0;
            v.copy(pts[seg]).lerp(pts[(seg + 1) % M], f).normalize();
            dirs[i * 3] = v.x;
            dirs[i * 3 + 1] = v.y;
            dirs[i * 3 + 2] = v.z;
        }
    }
    // the closed spline passes through control k at u = k/K, so sample
    // j = k/K * M is that control and cum[j] its arc position
    const K = controls.length;
    const zoneT = zoneControl.map((k) => cum[Math.min(M, Math.round((k / K) * M))]);
    return { order, dirs, n, step, total, zoneT };
})();
/** angular distance (radians) from a unit direction to the nearest loop sample */
export function loopAngle(dir) {
    const { dirs, n } = METRO_LOOP;
    let bd = -2;
    let bi = 0;
    for (let i = 0; i < n; i += 4) {
        const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2];
        if (d > bd) {
            bd = d;
            bi = i;
        }
    }
    for (let k = bi - 3; k <= bi + 3; k++) {
        const i = ((k % n) + n) % n;
        const d = dir.x * dirs[i * 3] + dir.y * dirs[i * 3 + 1] + dir.z * dirs[i * 3 + 2];
        if (d > bd)
            bd = d;
    }
    return Math.acos(Math.max(-1, Math.min(1, bd)));
}
/**
 * Noise suppression band around the loop, in world units. The corridor's
 * surfaced width ends at 3.95u and its shoulder at 5.55u (props.ts), so the
 * fully-flat core covers the whole surfaced width with margin and the ramp
 * releases well outside the shoulder.
 */
const LOOP_FLAT_CORE = 4.4;
const LOOP_FLAT_RAMP = 9;
/* -------------------------------------------------------------- height */
const _d = new THREE.Vector3();
/** base landform radius, without the fine noise detail */
function baseRadius(dir) {
    let num = FALLBACK_R * FALLBACK_W;
    let den = FALLBACK_W;
    for (let i = 0; i < ANCHORS.length; i++) {
        const a = ANCHORS[i];
        const dot = Math.max(-1, Math.min(1, dir.dot(a.dir)));
        const theta = Math.acos(dot);
        const t = theta / SIGMA;
        const w = a.w * Math.exp(-t * t);
        num += w * a.r;
        den += w;
    }
    return num / den;
}
/** surface radius at a (normalised) direction */
export function terrainRadius(dir) {
    const base = baseRadius(dir);
    const x = dir.x;
    const y = dir.y;
    const z = dir.z;
    // large rolling lumps + fine crunch, flattened along the roads.
    // The ramp back to full noise was 0.15 -> 1 over road 1..1.9, which packed the
    // whole amplitude change into ~1.1 world units and stood a wall of artificial
    // cross-slope along every verge: it drove the corridor punch-through and the
    // brown rock stripes flanking the roads. Widened to 1..2.6 with a higher floor,
    // which is the same suppression spread thin enough to read as a graded shoulder.
    const road = roadDistance(dir);
    let flat = road < 1 ? 0.28 : road < 2.6 ? 0.28 + 0.72 * ((road - 1) / 1.6) : 1;
    // the drawn corridor follows the metro loop, not the painted arcs — grade
    // along the geometry that is actually surfaced (skip when already at floor)
    if (flat > 0.28) {
        const lat = loopAngle(dir) * base;
        if (lat < LOOP_FLAT_RAMP) {
            const loopFlat = lat < LOOP_FLAT_CORE
                ? 0.28
                : 0.28 + 0.72 * ((lat - LOOP_FLAT_CORE) / (LOOP_FLAT_RAMP - LOOP_FLAT_CORE));
            if (loopFlat < flat)
                flat = loopFlat;
        }
    }
    const lumps = fbm(x * 5.1, y * 5.1, z * 5.1, 3) * 2.16;
    const detail = fbm(x * 15.3, y * 15.3, z * 15.3, 3) * 0.672;
    const ridges = (1 - Math.abs(fbm(x * 3.2 + 11, y * 3.2 + 5, z * 3.2 + 3, 2))) * 1.2;
    let r = base + (lumps + detail) * flat + ridges * flat * (base > 40 ? 1 : 0.35);
    // beaches flatten out where they meet the sea
    if (r < WATER_LEVEL + 1.76) {
        const t = Math.max(0, (r - (WATER_LEVEL - 2.56)) / 4.32);
        r = WATER_LEVEL - 2.56 + t * t * 4.32;
    }
    return r;
}
/** convenience: surface radius for an arbitrary (unnormalised) position */
export function radiusAt(v) {
    _d.copy(v).normalize();
    return terrainRadius(_d);
}
/* --------------------------------------------------------------- colours */
const C = {
    deepSand: new THREE.Color("#d9bd8a"),
    sand: new THREE.Color("#ecd9a8"),
    grass: new THREE.Color("#6fae4e"),
    grassDark: new THREE.Color("#568a39"),
    grassLight: new THREE.Color("#8fc76a"),
    rock: new THREE.Color("#b09a7e"),
    rockDark: new THREE.Color("#8f7a62"),
    road: new THREE.Color("#8a8a92"),
    roadEdge: new THREE.Color("#e8e4da"),
    snowless: new THREE.Color("#c9b48f"),
};
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpC = new THREE.Vector3();
/**
 * slopeAt's own probe vector. It must NOT be `_rv`: slopeAt passes this
 * straight into terrainRadius, which calls roadDistance, which uses `_rv` as
 * its own scratch — the offset direction was being overwritten mid-evaluation
 * and the resulting bogus gradients pinned the slope at 1.0 over half the map.
 */
const _slopeV = new THREE.Vector3();
/** slope: 0 = flat ground, 1 = vertical cliff */
function slopeAt(dir, r) {
    // sample two nearby directions on the tangent plane
    const up = Math.abs(dir.y) > 0.9 ? _tmpA.set(1, 0, 0) : _tmpA.set(0, 1, 0);
    _tmpB.copy(up).cross(dir).normalize();
    _tmpC.copy(dir).cross(_tmpB).normalize();
    const eps = 0.012;
    const d1 = _slopeV.copy(dir).addScaledVector(_tmpB, eps).normalize();
    const r1 = terrainRadius(d1);
    const d2 = _slopeV.copy(dir).addScaledVector(_tmpC, eps).normalize();
    const r2 = terrainRadius(d2);
    const grad = Math.sqrt((r1 - r) ** 2 + (r2 - r) ** 2) / (eps * r);
    return Math.min(1, grad * 0.9);
}
const _col = new THREE.Color();
export function terrainColor(dir, r, target) {
    const slope = slopeAt(dir, r);
    const road = roadDistance(dir);
    if (r < WATER_LEVEL + 0.88) {
        target.copy(r < WATER_LEVEL ? C.deepSand : C.sand);
    }
    else if (slope > 0.55 || r > 53.12) {
        target.copy(slope > 0.75 ? C.rockDark : C.rock);
        if (r > 55.04)
            target.lerp(C.snowless, Math.min(1, (r - 55.04) / 3.2));
    }
    else {
        const shade = fbm(dir.x * 9.3 + 3, dir.y * 9.3 - 7, dir.z * 9.3 + 1, 2);
        target.copy(C.grass);
        if (shade > 0.12)
            target.lerp(C.grassLight, Math.min(1, (shade - 0.12) * 3));
        else if (shade < -0.1)
            target.lerp(C.grassDark, Math.min(1, (-shade - 0.1) * 3));
        // beach fringe
        if (r < WATER_LEVEL + 2.4)
            target.lerp(C.sand, (WATER_LEVEL + 2.4 - r) / 1.52);
    }
    // roads: a solid grey ribbon, a pale edge band, then a short feather out
    if (road < 1.5 && r > WATER_LEVEL + 0.48) {
        _col.copy(road < 1 ? C.road : C.roadEdge);
        target.lerp(_col, road < 1 ? 0.95 : road < 1.3 ? 0.8 : 0.8 * ((1.5 - road) / 0.2));
    }
    // faint hand-painted grain
    const grain = fbm(dir.x * 42, dir.y * 42, dir.z * 42, 2) * 0.03;
    target.offsetHSL(0, 0, grain);
    return target;
}
/* ------------------------------------------------------------- geometry */
export function buildPlanetGeometry(detail = 52) {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const dir = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
        dir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        const r = terrainRadius(dir);
        pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
        terrainColor(dir, r, col);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
}
/* -------------------------------------------------- placement utilities */
/**
 * Where an npc actually stands: the authored position supplies the direction,
 * the terrain supplies the radius. Shared by the renderer and the proximity
 * check so a villager is never hit-tested somewhere they are not drawn.
 */
export function npcSurfacePosition(position) {
    const dir = new THREE.Vector3(position[0], position[1], position[2]).normalize();
    return dir.multiplyScalar(terrainRadius(dir));
}
/** put an object on the ground at a direction, oriented to the surface */
export function surfacePoint(dir, offset = 0) {
    const r = terrainRadius(dir) + offset;
    return dir.clone().multiplyScalar(r);
}
/** deterministic rng */
export function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
/** random unit direction inside an angular cap around `center` */
export function randomDirInCap(center, maxAngle, rand) {
    const dir = center.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.y) > 0.9)
        tangent.set(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(tangent, dir).normalize();
    const t2 = new THREE.Vector3().crossVectors(dir, t1).normalize();
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * maxAngle;
    return dir
        .clone()
        .addScaledVector(t1, Math.cos(a) * Math.tan(d))
        .addScaledVector(t2, Math.sin(a) * Math.tan(d))
        .normalize();
}
/** quaternion that stands an object up along the surface normal */
export function surfaceQuaternion(dir, spin) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
}
export { slopeAt };
