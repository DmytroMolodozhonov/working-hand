/**
 * HouseWards.js — the shield magic of a HOUSE (learned only from the book of protection, the
 * dark-blue book-bird — BookBirds.js; in Creative everybody knows it).
 *
 *   «Protection House»        point the hand (the wand) at a house and say it: −20 mana, a charge
 *                             of protection (silver-blue, like a duel charge) flies from the hand
 *                             into the house — it breaks nothing: where it lands a dome of
 *                             protection lights up (1.5 m). It is a ball cut by the ground: its
 *                             centre is on the ground under the house (the house's floor), the
 *                             upper half stands over it as a dome, the lower half goes on under the
 *                             ground (nobody digs in from below). Now, while the hand (the wand)
 *                             stays on it (on the dome or on the house under it), it grows by
 *                             itself, 1 m a second (−3 mana a metre) —
 *                             no «Максима» to shout. The hand taken off it / lowered: it waits;
 *                             back on it: it grows on. «стоп» (free), no mana left, 24 m, or 30 s
 *                             without growing: it stays as big as it grew. «Protection House
 *                             Maxima» (or «Максима» while it grows): it grows twice as fast (the
 *                             same mana a metre). Aimed at anything else (a chest, a camp, a tree,
 *                             a piece of land) it stands round that spot. One per house; its owner
 *                             is the caster; said again at my own dome — it grows on.
 *   «Protection Invisible»    on a house that already has its sphere (aimed at it, −15 mana): from
 *                             farther than ~6 m the house and everything inside the sphere is not
 *                             seen — only the land going on, grass as round it; coming closer it
 *                             shows little by little and is all there from ~3 m. For every player.
 *   «Protection House Grant»  by (or in) your protected house, aim at a player (−5 mana): that player
 *                             may come in and go out freely, like the owner.
 *
 *   «Strengthen House»        (the author's «Усили дом») the wand on the sphere of YOUR house (or of one who let you
 *                             in with «Grant» — as the owner): a beam, a little warmer and brighter than the dome's own,
 *                             goes from the wand into it and feeds it with your mana — WARD.FEED_MANA (5) mana a second
 *                             and WARD.FEED_HP (5) strength a second, bit by bit every frame, while the wand stays on it
 *                             (on the dome or on the house under it, ≤ 40 m), you have mana and have not said «стоп».
 *                             No price at once (5 mana to begin). The hand taken off it: the beam goes out and WAITS
 *                             (as the growing dome does: back on it — it feeds on; 30 s idle — it ends). No limit: the
 *                             sphere has its own maximum (`w.max`, 100 at first) that grows with every drop fed —
 *                             the cracks heal up to it, the owner is told "N%" of it. In Creative no mana is spent.
 *                             Not yours / an NPC wizard's sphere: «Это не ваша защита». A held spell (concentration).
 *                             Table «who/what × how» (CLAUDE.md): it acts on NO creature and NO thing — only on the
 *                             sphere of its owner or of a granted player; off the Earth (space, planets) there are no
 *                             spheres: «нечего усиливать» (Space.spaceSpellBlock).
 *   «Dispel Ward»            the hand on your own sphere (or the house under it), −5 mana: said once it only warns (the
 *                             strength put in would be lost); said again within 6 s (the hand still on it) the sphere
 *                             falls apart in shards, the house is seen again, the granted and «Invisible» are gone.
 *                             Acts only on the sphere of its own owner (the granted, strangers, NPC wards: refused);
 *                             creatures / items / the world are untouched; in space and on planets there is none
 *                             (Space.spaceSpellBlock: «нечего снимать»). Instant (no concentration).
 *
 * What the sphere does — for EVERY kind (CLAUDE.md «на кого и на что»):
 *   - while it is set the caster's beam goes on from the wand: it strikes the house (the house fills with the
 *     magic), then — the dome grown round it — the dome itself, its hex lit where it strikes, until «стоп»
 *     (_beams; everybody sees it). The dome itself is faint meanwhile (never over the whole screen);
 *   - it is NOT seen: only while it is being set (and a moment after «стоп»), and when somebody who
 *     may not come in is close to it (≈1.5 m) — then it flashes into view, the hex pattern lighting
 *     up where they are, and fades again when they go;
 *   - it holds them like a wall: players (my computer holds me; theirs hold them) and creatures (the
 *     host): zombies, villagers / knights / the king / wizards, animals (pigs with wings too),
 *     sailors, living trees, the giant spider, servants (a servant of the owner or of a granted
 *     player comes in with its master). Pushing on (more than ~1.5 s against it, or running into it)
 *     → it shoves them back (the impact system) and takes 2 HP (not more than once a second; no harm
 *     in Creative; a living tree is only shoved — only fire hurts it). Book-birds fly over it freely;
 *   - the owner and the granted players pass both ways and never wake it;
 *   - spells from outside stop at it (a flash where they touch): duel charges (Авада, Остолбеней,
 *     Сапира, Айс, Даст, Экспеллиармус…), rays, the Инферно flame, lightning, arrows, water / ice balls
 *     bounce, pushes don't reach inside, blasts don't eat into the blocks inside, fire doesn't catch
 *     inside, an earthquake's crack stops at it; what is cast from inside goes out freely;
 *   - only these break it (from outside): «Total Destruction» and «Inspirius» at once, «Бомбардо Максима» — one
 *     blast on it, «Бомбардо» — about three (each cracks it; the cracks heal slowly if it is left
 *     alone for a minute), «Let the Hellfire Come» held against it for ~7 s (it glows red first).
 *     Three strong duel charges break it each in its own way (from outside; Duel._fly → chargeHit): «Пилбидрио» takes 80 at
 *     once (the beam dies at the surface); «Акцентрик» stays on it and eats 5 a second, 40 in all, then its haze goes out
 *     (a second charge only refills it to 40); «Электром» held on one spot takes ~8.4 a second (a whole one in ~12 s):
 *     the hexes crack round the spot more and more, it sparks and shivers; the hand off the spot — the cracks stay, they
 *     heal as the others. A sphere fed with «Strengthen House» has a bigger maximum: the blows above take the same
 *     fixed strength, but the Hellfire burns HELL_T s for every 100 of the maximum (never less). Not the gods' temple / gifts of the gods (their golden protection is not a house's). Every
 *     other charge (Остолбеней, Авада…) only flashes.
 *     Each such blow tells its owner at once, wherever in the world they are: «🛡️⚠️ Ваш дом пытаются
 *     разрушить — кто! Защита: N% (сколько км отсюда)» (every few seconds while it goes on).
 *     Broken: it falls apart in shards, «🛡️ Защита дома разрушена!» to the owner and to the one who
 *     broke it; the house is unprotected (and seen again); the owner may cast it anew.
 * Saved with the world (owner, centre, radius, invisible, granted, strength) and kept by the host:
 * every computer has the same list (the host sends it), guests ask the host to change it.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS, isCastleBlock } from '../world/Terrain.js';
import { applyVoxelDetail, WARD_HIDE } from '../world/VoxelShading.js';
import { KINDS } from './CreatureImpact.js';
import { refusal } from './Hints.js';
import { CappedLog } from '../core/CappedLog.js';

export const WARD = {
    COST: 20, // «Protection House»: the charge and the first 1.5 m
    GROW_MANA: 3, // mana a metre it grows (SPELL_COST.WardGrow; the old «Максима»: 5 for 1.5 m)
    GROW_V: 1, // m a second while the hand is on it
    GROW_V_MAX: 2, // … «Protection House Maxima» (the same mana a metre)
    START_R: 1.5, // m (small at first: it is seen growing from the spot)
    STEP: 1.5, // m a «Максима» (worlds saved before it grew by itself)
    MAX_R: 24, // m
    AIM: 40, // m: how far a house may be aimed at
    AIM_TOL: 0.1, // the hand a little beside the growing dome still holds it (≈6°; never less than 0.8 m)
    SET_IDLE: 30, // s not growing (the hand off it): it is set by itself
    BOLT_V: 32, // m/s: the charge from the hand to the house
    SEND_GAP: 0.25, // s between the sizes sent while it grows
    INVIS_COST: 15,
    GRANT_COST: 5,
    GRANT_NEAR: 5, // m from the sphere: near enough to grant
    SEE_NEAR: 3.5, // m from the sphere: an invisible house is all there
    SEE_FAR: 6.5, // m: … and not seen at all from this far
    HP: 100, // the strength (and the maximum) of a sphere nobody has fed
    FEED_MANA: 5, // «Strengthen House»: mana a second…
    FEED_HP: 5, // …and strength a second (and the maximum grows by the same)
    FEED_SEND: 0.25, // s between the portions a guest sends the host
    FEED_PORTION: 4, // the most strength the host takes from one message
    DISPEL_T: 6, // s: «Dispel Ward» must be said again within this
    BREAK: { Bombardo: 34, BombardoMaxima: 100, TotalDestruction: 100, TotalDestructionMaxima: 100, Inspirius: 100, Boom: 100, Pilbidrio: 80 }, // strength taken (nothing else breaks it)
    ACC_DPS: 5, // «Акцентрик» sitting on it: strength a second…
    ACC_TOTAL: 40, // …until this much is taken, then its haze goes out by itself
    ELEC_DPS: 8.4, // «Электром» held on it: strength a second (a whole one gives way in ~12 s); the cracks spread from the spot
    HELL_T: 7, // s of «Let the Hellfire Come» held against it: burnt through
    WARN_EVERY: 6, // s: its owner is told again that it is being broken (anywhere in the world)
    HEAL_AFTER: 60, // s left alone: its cracks heal…
    HEAL_RATE: 5, // …this much strength a second
    NEAR: 1.5, // m from it: one who may not come in wakes it (it shows)
    SHOW_AFTER_SET: 2.5, // s it is still seen after «стоп»
    PRESS_T: 1.5, // s pushing on it: it shoves back
    RAM_SPEED: 7, // m/s into it: shoved at once
    SHOVE_GAP: 1, // s between shoves
    SHOVE_HP: 2,
    SHOVE_V: 7, // m/s
    HIDE_MAX: 8, // invisible houses drawn hidden at once (the nearest)
};

/** The spells of the book of protection. */
export const WARD_SPELLS = ['ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant', 'StrengthenHouse', 'WardDispel'];
export const WARD_NAMES = { ProtectionHouse: 'Protection House', ProtectionInvisible: 'Protection Invisible', ProtectionHouseGrant: 'Protection House Grant', StrengthenHouse: 'Strengthen House', WardDispel: 'Dispel Ward' };
export const isWardSpell = (n) => WARD_SPELLS.includes(n);

/** Mana of a dome grown to radius `r` (the charge + every metre it grew). */
export const wardCost = (r) => WARD.COST + WARD.GROW_MANA * Math.max(0, Math.min(WARD.MAX_R, r) - WARD.START_R);
/** Seconds of the hand on it to grow to radius `r` (twice as fast with «Maxima»). */
export const growTime = (r, fast = false) => Math.max(0, Math.min(WARD.MAX_R, r) - WARD.START_R) / (fast ? WARD.GROW_V_MAX : WARD.GROW_V);
/** (worlds saved before it grew by itself) its radius after `n` «Максима». */
export const wardRadius = (n) => Math.min(WARD.MAX_R, 2.5 + WARD.STEP * Math.max(0, n)); // (it started at 2.5 m then)

/** The sphere's maximum strength (100 for one nobody fed, and for worlds saved before). */
export const wardMax = (w) => (w.max > 0 ? w.max : WARD.HP);
/** Seconds of the Hellfire that burn the sphere through: 7 for every 100 of its maximum, never less. */
export const hellTime = (w) => WARD.HELL_T * Math.max(1, wardMax(w) / WARD.HP);

/** May the one with this key (lasting id) pass through the sphere? The owner and the granted. */
export const mayPass = (w, key) => !!key && (w.owner === key || (w.grant || []).includes(key));

/** Is the point inside the sphere? */
export function inWard(w, p, pad = 0) {
    const dx = p.x - w.c.x, dy = p.y - w.c.y, dz = p.z - w.c.z;
    return dx * dx + dy * dy + dz * dz < (w.r + pad) * (w.r + pad);
}

/**
 * The segment a→b goes INTO the sphere from outside (ends inside it or passes through): where it
 * touches (0..1 along it), else -1. (From inside out: -1 — what is cast inside goes out freely.)
 */
export function crossInto(w, a, b) {
    if (inWard(w, a)) return -1;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const fx = a.x - w.c.x, fy = a.y - w.c.y, fz = a.z - w.c.z;
    const A = dx * dx + dy * dy + dz * dz;
    if (A < 1e-12) return -1;
    const B = 2 * (fx * dx + fy * dy + fz * dz), C = fx * fx + fy * fy + fz * fz - w.r * w.r;
    const D = B * B - 4 * A * C;
    if (D < 0) return -1;
    const s = (-B - Math.sqrt(D)) / (2 * A);
    return s >= 0 && s <= 1 ? s : -1;
}

/**
 * A body (a vertical segment y0..y1 at x, z with radius `rad`) in the sphere: how far to move it
 * out to the surface ({x, y, z, depth}), else null.
 */
export function bodyPush(w, x, y0, y1, z, rad = 0.5) {
    const cy = Math.max(y0, Math.min(y1, w.c.y));
    let dx = x - w.c.x, dy = cy - w.c.y, dz = z - w.c.z;
    let d = Math.hypot(dx, dy, dz);
    const lim = w.r + rad;
    if (d >= lim) return null;
    if (d < 1e-4) { dx = 1; dy = 0; dz = 0; d = 1; }
    const k = (lim - d) / d;
    return { x: dx * k, y: dy * k, z: dz * k, depth: lim - d };
}

/** How much of an invisible house is seen from `p` (1: all of it, 0: nothing — only the land). */
export function seenK(w, p) {
    if (!w.inv) return 1;
    const d = Math.max(0, Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) - w.r);
    if (d <= WARD.SEE_NEAR) return 1;
    if (d >= WARD.SEE_FAR) return 0;
    const t = (WARD.SEE_FAR - d) / (WARD.SEE_FAR - WARD.SEE_NEAR);
    return t * t * (3 - 2 * t);
}

/**
 * A house's centre and the radius that takes it in, from its blocks [x, L, z] (centre y = L − 1);
 * floor: the bottom of its lowest blocks (the dome's centre stands there), need: the dome's radius
 * from there that takes in the whole house (its top corners).
 */
export function houseBounds(cells) {
    if (!cells.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, L, z] of cells) {
        x0 = Math.min(x0, x - 0.5); x1 = Math.max(x1, x + 0.5);
        y0 = Math.min(y0, L - 1.5); y1 = Math.max(y1, L - 0.5);
        z0 = Math.min(z0, z - 0.5); z1 = Math.max(z1, z + 0.5);
    }
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    return { c, r: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2, floor: y0, need: Math.hypot((x1 - x0) / 2, y1 - y0, (z1 - z0) / 2) };
}

/** A block (centre x, y, z) inside one of the spheres [[x, y, z, r], …]? (y = null: the column x, z under / over it) */
export function keepIn(spheres) {
    if (!spheres || !spheres.length) return null;
    return (x, y, z) => spheres.some((s) => (x - s[0]) ** 2 + (y == null ? 0 : (y - s[1]) ** 2) + (z - s[2]) ** 2 < s[3] * s[3]);
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _c = new THREE.Color();
const _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);

/** The caster's beam (shared shape and materials — HouseWards._beams): a core and a glow, length 1 along +y. */
let BEAM = null;
/** feed: the «Strengthen House» beam — silver-blue, a little warmer and brighter than the dome's own. */
function beamModel(feed = false) {
    if (!BEAM) {
        const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
        BEAM = { geo: new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0), core: mat(0xffffff, 0.95), glow: mat(0x8fd0ff, 0.45), feedCore: mat(0xfffaf0, 1), feedGlow: mat(0xbfe4ff, 0.6), feedHalo: mat(0xffe9b8, 0.18) };
    }
    const g = new THREE.Group();
    if (feed) g.add(new THREE.Mesh(BEAM.geo, BEAM.feedCore), new THREE.Mesh(BEAM.geo, BEAM.feedGlow), new THREE.Mesh(BEAM.geo, BEAM.feedHalo));
    else g.add(new THREE.Mesh(BEAM.geo, BEAM.core), new THREE.Mesh(BEAM.geo, BEAM.glow));
    for (const m of g.children) { m.renderOrder = 5; m.frustumCulled = false; }
    g.userData.noWardHide = true;
    return g;
}
const r2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------------------ the look of the sphere
const DOME_VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
}`;
// A ball cut by the ground: over it a dome — silver-blue soft hexes, a light running up it, colours
// flowing (blue → violet → sea-green), a flickering rim and a bright ring where it meets the ground;
// under the ground the same ball goes on, dim (seen only from a cave / a pit dug under it).
const DOME_FS = `
uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform vec4 uFlash; uniform float uSet; uniform float uGrow; uniform float uCrack; uniform float uHell; uniform vec4 uCrackAt;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.866)), p.x); }
float hexEdge(vec2 uv) {
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return smoothstep(0.43, 0.5, hexDist(gv));
}
void main() {
    vec3 v = normalize(cameraPosition - vW);
    vec3 n = normalize(vL);
    float flick = 0.85 + 0.15 * sin(uTime * 9.0 + vW.x * 2.3 + vW.z * 1.7) * sin(uTime * 5.3 + vW.y * 3.1);
    float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.5) * flick;
    float lon = atan(n.z, n.x);
    vec2 uv = vec2(lon * 6.0, asin(clamp(n.y, -1.0, 1.0)) * 6.0);
    float hx = hexEdge(uv * 1.2);
    float shimmer = 0.5 + 0.5 * sin(uTime * 1.7 + vW.y * 1.3 + vW.x * 0.7);
    // a light running up the dome, again and again (faster while it grows)
    float sd = (n.y - fract(uTime * (0.22 + 0.25 * uSet))) * 9.0;
    float sweep = exp(-sd * sd) * step(0.0, n.y);
    // where it meets the ground
    float ground = smoothstep(0.07, 0.0, abs(n.y));
    float f = 0.0;
    if (uFlash.w > 0.0) f = uFlash.w * smoothstep(3.0, 0.0, distance(vW, uFlash.xyz));
    // cracks: some edges of a coarser pattern light up white (more of them the more it is broken)
    vec2 cu = uv * 0.45;
    float ce = hexEdge(cu);
    float pick = fract(sin(dot(floor(cu * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
    float crack = uCrack > 0.0 && pick < uCrack ? ce : 0.0;
    // «Электром» held on it: the hexes crack and go white round the spot, further the weaker it is
    float ec = 0.0;
    if (uCrackAt.w > 0.0) {
        float d = distance(vW, uCrackAt.xyz) + 0.7 * sin(lon * 23.0 + n.y * 17.0 + uTime * 11.0);
        ec = (hx * 0.9 + ce * 0.6) * smoothstep(uCrackAt.w, uCrackAt.w * 0.55, d) * (0.7 + 0.3 * sin(uTime * 37.0 + d * 3.0));
    }
    // while it is set: the whole dome glimmers, its hexes flicker, the ring on the ground blazes while it grows
    float glim = uSet * (0.07 + hx * (0.12 + 0.1 * sin(uTime * 7.0 + lon * 5.0 + n.y * 9.0)) + ground * (0.25 + 0.6 * uGrow));
    float a = uAlpha * (0.05 + rim * 0.45 + shimmer * 0.04 + hx * 0.12 + sweep * (0.1 + hx * 0.35) + ground * 0.5 + glim) + hx * (0.05 * uSet + 0.6 * f) + f * 0.25 + crack * 0.6 + ec * 0.8;
    if (n.y < 0.0) a *= 0.3 * (1.0 - 0.85 * uSet); // (the half under the ground; while it is set — seen through walls — hardly)
    // the colours flow over it (the Hellfire's red stays red)
    float hue = 0.5 + 0.5 * sin(uTime * 0.7 + lon * 2.0 + n.y * 4.0);
    vec3 col = mix(uColor, mix(vec3(0.62, 0.55, 1.0), vec3(0.5, 1.0, 0.9), hue), 0.35 * (1.0 - uHell));
    col = col * (1.0 + f * 1.5 + sweep * 0.6 + ground * 0.8);
    gl_FragColor = vec4(mix(col, vec3(1.0), clamp(crack * 0.7 + ec, 0.0, 1.0)), clamp(a, 0.0, 0.9));
}`;

export class HouseWards {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> ward {id, owner, ownerName, c, r, n, inv, grant, grantNames, hp, gy, setting, ids}
        this.looks = new Map(); // id -> {dome, disc, k, flash}
        this.feeding = null; // my beam feeding a sphere with mana: {id, idle, send, acc, aimed, on, rayT}
        this.setting = null; // my dome growing: {id, idle, wait, fast, need, covered, send}
        this.bolts = []; // the charges flying to the houses (seen on every computer)
        this._t = 0;
        this._scanT = 0;
        this._hidden = new Map(); // object -> its own visible before it was hidden
        this._nextId = 1;
        this._domeGeo = new THREE.SphereGeometry(1, 48, 24);
        this._domeGeo.userData.keep = true; // (shared: Game.prewarm must not dispose it)
        this.log = new CappedLog(); // (tests) what happened
    }

    get auth() { return this.game.authority !== false; }

    // ------------------------------------------------------------ who is who
    /** A player's lasting key (their browser's id, else their name): the same in every session. */
    keyOf(peerId) {
        const g = this.game, net = g.net;
        if (!net || !net.active || peerId === g.localId || peerId === 'local') return net?.pid || 'local';
        const p = net.players?.get(peerId);
        return p?.pid || (p ? 'n:' + p.name : 'peer:' + peerId);
    }

    get myKey() { return this.keyOf(this.game.localId); }

    /** May I pass through this sphere? */
    mine(w) {
        const g = this.game;
        return mayPass(w, this.myKey) || (!!w.ids && w.ids.includes(g.localId));
    }

    /** The peers of this session that may pass (the host works it out: guests don't know the keys). */
    _ids(w) {
        const g = this.game, net = g.net;
        const out = [];
        if (mayPass(w, this.keyOf(g.localId))) out.push(g.localId);
        if (net?.active) for (const id of net.players?.keys() || []) if (id !== g.localId && mayPass(w, this.keyOf(id))) out.push(id);
        return out;
    }

    /** A creature's way in: a servant comes in with its master. */
    _creatureMay(w, c) {
        if (w.id.startsWith('site:') && c.cs?.def?.id === w.id.slice(5)) return true; // (a hamlet's wizard in his own sphere: HamletLife.js)
        const m = c.servantOf ?? c.master ?? null;
        return m != null && mayPass(w, this.keyOf(m));
    }

    // ------------------------------------------------------------ aim
    _hand() {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide?.() || (ch.isArmRaised?.(pref) ? pref : ['right', 'left'].find((s) => ch.isArmRaised?.(s))) || null;
        if (!side) return null;
        const o = g.castOrigin ? g.castOrigin(side) : ch.getHandWorldPosition(side, new THREE.Vector3());
        const d = ch.getPointingDirection ? ch.getPointingDirection(side, new THREE.Vector3()) : ch.getHandDirection(side, new THREE.Vector3());
        return { side, o: o.clone ? o.clone() : o, d };
    }

    /** The first sphere the ray goes into (or the one I stand in): {w, t}. */
    _wardOnRay(o, d, max = WARD.AIM) {
        let best = null;
        for (const w of this.list.values()) {
            if (inWard(w, o)) return { w, t: 0 };
            const fx = o.x - w.c.x, fy = o.y - w.c.y, fz = o.z - w.c.z;
            const b = fx * d.x + fy * d.y + fz * d.z, c = fx * fx + fy * fy + fz * fz - w.r * w.r;
            const D = b * b - c;
            if (D < 0) continue;
            const t = -b - Math.sqrt(D);
            if (t < 0 || t > max || (best && t > best.t)) continue;
            best = { w, t };
        }
        return best;
    }

    /** The built blocks of the house the ray hits (≤ AIM m): its centre and size, or a reason why not. */
    _aimHouse(o, d) {
        const data = this.game.terrain?.data;
        if (!data) return { why: 'noHouse' };
        const hit = data.raycast(o, d, WARD.AIM);
        if (!hit) return { why: 'noHouse' };
        const p = _v1.set(hit.x + d.x * 0.05, hit.y + d.y * 0.05, hit.z + d.z * 0.05);
        const start = [Math.round(p.x), Math.floor(p.y + 1.5), Math.round(p.z)];
        const built = this._builtSet();
        const isBuilt = (x, L, z) => { const t = data.get(x, L, z); return t !== BLOCK.AIR && t !== BLOCK.WATER && (built.has(x + ',' + L + ',' + z) || isCastleBlock(t)); };
        if (!isBuilt(...start)) return { why: 'noHouse', at: hit };
        // the house: the built blocks joined to this one (not farther than the biggest sphere)
        const seen = new Set([start.join(',')]);
        const out = [start];
        for (let i = 0; i < out.length && out.length < 4000; i++) {
            const [x, L, z] = out[i];
            for (const [dx, dL, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const nx = x + dx, nL = L + dL, nz = z + dz, k = nx + ',' + nL + ',' + nz;
                if (seen.has(k)) continue;
                seen.add(k);
                if (Math.hypot(nx - start[0], nz - start[2]) > WARD.MAX_R * 1.6 || !isBuilt(nx, nL, nz)) continue;
                out.push([nx, nL, nz]);
            }
        }
        return { house: houseBounds(out), cells: out.length, at: hit };
    }

    /** Blocks the players built (the world's own houses count by their kind of stone). */
    _builtSet() {
        const s = new Set();
        for (const e of this.game.blockEdits || []) {
            const k = e[0] + ',' + e[1] + ',' + e[2];
            if (e[3]) s.add(k); else s.delete(k);
        }
        return s;
    }

    /** The natural ground round the sphere: the top of its blocks (the land the hidden house becomes). */
    _groundY(c, r) {
        const data = this.game.terrain?.data;
        if (!data) return c.y - r * 0.5;
        const ys = [], types = [];
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const x = Math.round(c.x + Math.cos(a) * (r + 1.5)), z = Math.round(c.z + Math.sin(a) * (r + 1.5));
            const L = data.topLayer(x, z);
            ys.push(L - 0.5);
            types.push(data.get(x, L, z));
        }
        ys.sort((a, b) => a - b);
        const count = new Map();
        for (const t of types) count.set(t, (count.get(t) || 0) + 1);
        this._groundType = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? BLOCK.GRASS;
        return ys[ys.length >> 1];
    }

    // ------------------------------------------------------------ casting
    /** A hint why it did not work (Hints.refusal code, or the text itself) — once in a while. */
    _no(code, d = {}) {
        const g = this.game;
        const text = refusal(code, d) || code;
        const gate = this._gate || (this._gate = new Map());
        const now = performance.now();
        if (now - (gate.get(text) || -1e9) < 2000) return null;
        gate.set(text, now);
        g.hud?.setVoice?.(text, true);
        this.log.push({ ev: 'no', text });
        return null;
    }

    /** Mana: enough? (and paid) */
    _pay(name) {
        const c = this.game.combat;
        if (!c) return true;
        const hint = c.check(name);
        if (hint) { this._no(hint); return false; }
        c.pay(name);
        return true;
    }

    /**
     * «Protection House» / «Protection Invisible» / «Protection House Grant» (fast: «Protection House
     * Maxima» — the dome grows twice as fast).
     * @returns {string|null} the spell when it worked
     */
    cast(name, isFinal = true, fast = false) {
        if (name === 'ProtectionHouse') return this._castHouse(isFinal, fast);
        if (name === 'ProtectionInvisible') return this._castInvisible(isFinal);
        if (name === 'ProtectionHouseGrant') return this._castGrant(isFinal);
        if (name === 'StrengthenHouse') return this._castStrengthen(isFinal);
        if (name === 'WardDispel') return this._castDispel();
        return null;
    }

    /** What a sphere is worth: the strength put into it (100 for a plain one; «Strengthen House» raises `max`). */
    strengthOf(w) { return Math.round(wardMax(w)); }

    /**
     * «Dispel Ward»: only on my own sphere, and twice (a sphere may cost a lot): the first word warns, the
     * second — 1.5…6 s later, the hand still on it — takes it down. (Sooner: the recognizer repeating the same phrase.)
     */
    _castDispel() {
        const g = this.game;
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Dispel Ward' });
        const on = this._wardOnRay(h.o, h.d);
        if (!on) return this._no('wardDispelNone');
        const w = on.w;
        if (w.owner !== this.myKey) return this._no('wardDispelNotYours');
        const now = performance.now(), p = this._dispel;
        if (!p || p.id !== w.id || now - p.at > WARD.DISPEL_T * 1000) {
            this._dispel = { id: w.id, at: now };
            g.hud?.setVoice?.(refusal('wardDispelAsk', { s: this.strengthOf(w), t: WARD.DISPEL_T }), true);
            this.log.push({ ev: 'dispelAsk', id: w.id });
            return null;
        }
        if (now - p.at < 1500) return null; // (the same phrase heard again)
        if (!this._pay('WardDispel')) return null;
        this._dispel = null;
        this._op({ op: 'dispel', id: w.id });
        this.log.push({ ev: 'dispel', id: w.id });
        return 'WardDispel';
    }

    _castHouse(isFinal = true, fast = false) {
        const g = this.game;
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Protection House' });
        // a house that already has its dome: mine — the charge flies into it and it grows on
        const on = this._wardOnRay(h.o, h.d);
        if (on) {
            if (on.w.owner !== this.myKey) return this._no('wardNotYours', { owner: on.w.ownerName });
            const at = on.t > 0 ? h.o.clone().addScaledVector(h.d, on.t) : null;
            const T = at ? this._bolt(h.o, at) : 0;
            if (at) this._landAt(on.w, at, T);
            this.setting = { id: on.w.id, idle: 0, wait: T, fast, need: 0, covered: true, send: 0 };
            this._op({ op: 'set', id: on.w.id, on: true });
            g.hud?.setVoice?.('🛡️ Купол снова растёт, пока палочка на нём. Хватит — скажите «стоп»', true);
            this.log.push({ ev: 'again', id: on.w.id });
            return 'ProtectionHouse';
        }
        const aim = this._aimHouse(h.o, h.d);
        // a house is what it is mostly for, but it guards anything the hand shows (a chest, a camp,
        // a tree, a piece of land): then the dome stands round that spot
        const spot = aim.house ? { c: { x: aim.house.c.x, y: aim.house.floor, z: aim.house.c.z }, need: aim.house.need } : aim.at && { c: { x: aim.at.x, y: aim.at.y, z: aim.at.z }, need: 0 };
        if (!spot) return this._no('wardNoHouse');
        if (!this._pay('ProtectionHouse')) return null;
        const c = spot.c;
        const id = (g.localId || 'L') + '-' + Date.now().toString(36) + '-' + (this._nextId++);
        const at = aim.at || c;
        // (the charge's way: from the hand to where it lands — every computer draws it)
        this._op({ op: 'new', id, c: [r2(c.x), r2(c.y), r2(c.z)], f: [r2(h.o.x), r2(h.o.y), r2(h.o.z)], a: [r2(at.x), r2(at.y), r2(at.z)], name: g.net?.name || 'Игрок' });
        const w = this.list.get(id);
        this.setting = { id, idle: 0, wait: w?.landIn ?? 0, fast, need: spot.need, covered: spot.need <= WARD.START_R, send: 0 };
        g.hud?.setVoice?.(`🛡️ ${aim.house ? 'Защита дома' : 'Купол защиты'}: держите палочку на куполе — он растёт сам (${WARD.GROW_MANA} маны за метр). Хватит — скажите «стоп»`, true);
        this.log.push({ ev: 'new', id, need: spot.need });
        return 'ProtectionHouse';
    }

    /** «Максима» while my dome grows: it grows twice as fast (the same mana a metre). */
    maxima() {
        const s = this.setting;
        const w = s && this.list.get(s.id);
        if (!w) { this.setting = null; return null; }
        if (s.fast) return null;
        s.fast = true;
        s.idle = 0;
        this._pulse(w);
        this.log.push({ ev: 'fast', id: w.id });
        return 'WardGrow';
    }

    /** «стоп»: the dome stays as it is now (and a beam feeding a sphere goes out). */
    fix() {
        const fed = this.stopFeed();
        const s = this.setting;
        if (!s) return fed;
        this.setting = null;
        const w = this.list.get(s.id);
        if (!w) return false;
        if (!this.auth) this.game.sync?.wardOp?.({ op: 'grow', id: w.id, r: r2(w.r) }); // (its last size)
        else w.gy = this._groundY(w.c, w.r);
        this._rebuildDisc(w);
        this._op({ op: 'set', id: w.id, on: false });
        this.game.hud?.toast?.(`🛡️ Защита готова: купол ${w.r.toFixed(1)} м`, 3000);
        this.log.push({ ev: 'fix', id: w.id, r: w.r });
        return true;
    }

    /**
     * My dome grows while the hand (the wand) is on it: GROW_V m a second, GROW_MANA mana a metre.
     * The hand off it: it waits. No mana: it stays as it is (and so at MAX_R).
     */
    _grow(dt) {
        const s = this.setting;
        const w = s && this.list.get(s.id);
        if (!w) { this.setting = null; return; }
        if (s.wait > 0) { s.wait -= dt; return; } // (the charge is still flying)
        s.idle += dt;
        if (s.idle > WARD.SET_IDLE) { this.fix(); return; }
        s.aimed = this._onMine(w, s, dt);
        if (!s.aimed) return;
        s.idle = 0;
        if (w.r >= WARD.MAX_R - 1e-6) { this._no('wardMax', { r: WARD.MAX_R }); this.fix(); return; }
        const dr = Math.min(WARD.MAX_R - w.r, (s.fast ? WARD.GROW_V_MAX : WARD.GROW_V) * dt);
        const c = this.game.combat;
        if (c && c.enabled !== false) {
            const cost = (c.costOf ? c.costOf('WardGrow') : WARD.GROW_MANA) * dr;
            const ok = c.fatigue >= cost && (c.drain ? c.drain(cost, dt) : ((c.fatigue -= cost), true));
            if (!ok) { this._no('wardNoMana', { r: w.r.toFixed(1) }); this.fix(); return; }
        }
        w.r += dr;
        if (!s.covered && s.need && w.r >= s.need) {
            s.covered = true;
            this.game.hud?.toast?.('🛡️ Купол накрыл весь дом — можно сказать «стоп»', 3000);
        }
        // the others see it grow (a few times a second)
        s.send -= dt;
        if (s.send <= 0) {
            s.send = WARD.SEND_GAP;
            if (this.auth) this._changed();
            else this.game.sync?.wardOp?.({ op: 'grow', id: w.id, r: r2(w.r) });
        }
    }

    /**
     * Is the hand (the wand) on my growing dome? On the dome itself (or a little beside it — a
     * hand is never quite still), on the house under it (its walls hide the dome inside), or I
     * stand in it.
     */
    _onMine(w, s, dt) {
        const h = this._hand();
        if (!h) return false;
        const { o, d } = h;
        if (inWard(w, o)) return true;
        const fx = w.c.x - o.x, fy = w.c.y - o.y, fz = w.c.z - o.z;
        const along = fx * d.x + fy * d.y + fz * d.z;
        if (along > 0 && along < WARD.AIM + w.r) {
            const off = Math.sqrt(Math.max(0, fx * fx + fy * fy + fz * fz - along * along));
            if (off < w.r + Math.max(0.8, WARD.AIM_TOL * along)) return true;
        }
        // the house (or the land) the hand shows: under the dome or what it is to cover
        s.rayT = (s.rayT ?? 0) - dt;
        if (s.rayT > 0) return !!s.rayOn;
        s.rayT = 0.15;
        const hit = this.game.terrain?.data?.raycast?.(o, d, WARD.AIM);
        const R = Math.max(w.r, s.need || 0) + 1.5;
        s.rayOn = !!hit && Math.hypot(hit.x - w.c.x, hit.z - w.c.z) < R && hit.y > w.c.y - 2 && hit.y < w.c.y + R + 1;
        return s.rayOn;
    }


    // ------------------------------------------------------------ «Strengthen House»
    /** The sphere the hand shows: the dome itself, else the house / land under it (the dome round it). */
    _wardShown(h) {
        const on = this._wardOnRay(h.o, h.d);
        if (on) return on.w;
        const hit = this.game.terrain?.data?.raycast?.(h.o, h.d, WARD.AIM);
        if (!hit) return null;
        let best = null, bd = 1e9;
        for (const w of this.list.values()) {
            const d = Math.hypot(hit.x - w.c.x, hit.z - w.c.z);
            if (d < w.r + 1.5 && hit.y > w.c.y - 2 && hit.y < w.c.y + w.r + 1 && d < bd) { bd = d; best = w; }
        }
        return best;
    }

    /** Mana to begin: the first second of the beam. */
    _feedMana() { return WARD.FEED_MANA; }

    /** «Strengthen House»: the beam from the wand into my (or a granted) sphere; a held spell. */
    _castStrengthen() {
        const g = this.game;
        if (this.setting) return null; // (the dome still growing holds the hand)
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Strengthen House' });
        const w = this._wardShown(h);
        if (!w) return this._no('wardFeedNone');
        if (!mayPass(w, this.myKey)) return this._no('wardNotYours', { owner: w.ownerName });
        const c = g.combat;
        if (c && c.enabled !== false) {
            if (c.dead || c.frozen || c.stunned) return null;
            if (c.fatigue < this._feedMana()) return this._no('wardFeedNoMana');
        }
        if (this.feeding?.id === w.id) return 'StrengthenHouse'; // (said again: it goes on)
        this.stopFeed();
        this.feeding = { id: w.id, idle: 0, send: 0, acc: 0, aimed: true, on: false, rayT: 0 };
        g.hud?.setVoice?.(`🛡️ Луч питает защиту: −${WARD.FEED_MANA} маны и +${WARD.FEED_HP} силы в секунду, пока палочка на ней. Хватит — скажите «стоп»`, true);
        this.log.push({ ev: 'feed', id: w.id });
        return 'StrengthenHouse';
    }

    /** The beam goes out (стоп / no mana / the sphere gone): what was fed is sent. True if it was going. */
    stopFeed() {
        const s = this.feeding;
        if (!s) return false;
        this.feeding = null;
        this._sendFeed(s, 0, false);
        this.log.push({ ev: 'feedEnd', id: s.id });
        return true;
    }

    /** Each frame: the beam feeds while the wand is on the sphere. */
    _feed(dt) {
        const s = this.feeding;
        const w = s && this.list.get(s.id);
        if (!w || !mayPass(w, this.myKey)) { this.feeding = null; return; }
        const aimed = this._onMine(w, s, dt);
        if (aimed !== s.aimed) { s.aimed = aimed; if (!aimed) this._sendFeed(s, 0, false); }
        if (!aimed) { // (the hand off it: the beam is out, it waits — as the growing dome does)
            s.idle += dt;
            if (s.idle > WARD.SET_IDLE) this.stopFeed();
            return;
        }
        s.idle = 0;
        const c = this.game.combat;
        if (c && c.enabled !== false) {
            const ok = c.fatigue > 0 && (c.drain ? c.drain(WARD.FEED_MANA * dt, dt) : ((c.fatigue = Math.max(0, c.fatigue - WARD.FEED_MANA * dt)), true));
            if (!ok) { this._no('wardFeedNoMana'); this.stopFeed(); return; }
        }
        const d = WARD.FEED_HP * dt;
        if (this.auth) {
            w.hp += d;
            w.max = wardMax(w) + d;
            w.feedKey = this.myKey;
            w.feedAt = this._t;
            if (this._t - (s.sentAt ?? -1e9) >= WARD.FEED_SEND) { s.sentAt = this._t; this._changed(); }
        } else {
            s.acc += d;
            s.send -= dt;
            if (s.send <= 0) { s.send = WARD.FEED_SEND; const a = s.acc; s.acc = 0; this._sendFeed(s, a, true); }
        }
        s.on = true;
    }

    /** (a guest) a portion to the host; (the host) the beam's mark only. */
    _sendFeed(s, d, on) {
        const w = this.list.get(s.id);
        if (!w) return;
        if (this.auth) {
            if (!on && w.feedKey === this.myKey) { w.feedKey = ''; this._changed(); }
            return;
        }
        if (s.acc > 0 && !on) { d += s.acc; s.acc = 0; }
        this.game.sync?.wardOp?.({ op: 'feed', id: s.id, d: r2(d), on: !!on });
    }

    // ------------------------------------------------------------ the charge
    /** A charge of protection flies from `from` to `to`: how long it flies. */
    _bolt(from, to) {
        const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
        const T = Math.max(0.12, a.distanceTo(b) / WARD.BOLT_V);
        const scene = this.game.scene;
        let mesh = null;
        if (scene) {
            const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
            const G = HouseWards._boltGeo || (HouseWards._boltGeo = { core: new THREE.SphereGeometry(0.11, 12, 8), halo: new THREE.SphereGeometry(0.3, 16, 10), ring: new THREE.TorusGeometry(0.28, 0.025, 6, 24) });
            mesh = new THREE.Group();
            mesh.add(new THREE.Mesh(G.core, mat(0xffffff, 1)), new THREE.Mesh(G.halo, mat(0x8fd0ff, 0.55)), new THREE.Mesh(G.ring, mat(0xcfe8ff, 0.8)), new THREE.Mesh(G.ring, mat(0xb7a6ff, 0.6)));
            for (const m of mesh.children) m.renderOrder = 5;
            mesh.userData.noWardHide = true;
            mesh.position.copy(a);
            scene.add(mesh);
        }
        this.bolts.push({ a, b, t: 0, T, mesh, d: b.clone().sub(a).normalize() });
        this.game.sound?.playWhoosh?.();
        this.game.fx?.lightFlash?.(a, 0x9fd8ff, 1.5, 0.25, 8);
        return T;
    }

    _updateBolts(dt) {
        const fx = this.game.fx;
        for (const B of [...this.bolts]) {
            B.t += dt;
            const k = Math.min(1, B.t / B.T);
            const p = _v1.copy(B.a).lerp(B.b, k);
            if (B.mesh) {
                B.mesh.position.copy(p);
                const pul = 1 + 0.2 * Math.sin(B.t * 40);
                B.mesh.children[1].scale.setScalar(pul);
                B.mesh.children[2].quaternion.setFromUnitVectors(_Z, B.d);
                B.mesh.children[2].rotateZ(B.t * 14);
                B.mesh.children[2].scale.setScalar(1 + 0.3 * Math.sin(B.t * 25));
                B.mesh.children[3].rotation.set(B.t * 11, B.t * 7, 0);
            }
            // its trail: silver-blue sparks winding round its way
            for (let i = 0; i < 3; i++) {
                const ang = B.t * 30 + i * 2.1;
                fx?.spark?.(p, i ? 0x9fd8ff : 0xffffff, 0.05 + Math.random() * 0.05, _v2.set(Math.cos(ang) * 0.8 - B.d.x * 1.5, Math.sin(ang) * 0.8 - B.d.y * 1.5, Math.sin(ang * 0.7) * 0.8 - B.d.z * 1.5), 0.35);
            }
            if (k < 1) continue;
            // it lands: a flash, sparks every way — nothing is broken
            for (let i = 0; i < 40; i++) {
                const v = _v2.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4);
                fx?.spark?.(B.b, i % 3 ? 0x9fd8ff : i % 2 ? 0xb7a6ff : 0xffffff, 0.08 + Math.random() * 0.08, v, 0.6);
            }
            fx?.lightFlash?.(B.b, 0x9fd8ff, 3, 0.45, 22);
            if (B.mesh) {
                this.game.scene?.remove(B.mesh);
                for (const m of B.mesh.children) m.material.dispose();
            }
            this.bolts.splice(this.bolts.indexOf(B), 1);
        }
    }

    /** The dome lights up at `at` when the charge lands there (in `T` s). */
    _landAt(w, at, T) {
        w.landIn = T;
        w.landAt = this._t + T;
        w.landP = { x: at.x, y: at.y, z: at.z };
        w.landed = false;
    }

    /** A dome just made (on any computer): its charge flies from the hand that cast it. */
    _arrive(w, f, a) {
        if (!Array.isArray(f) || !f.every(Number.isFinite)) return;
        const to = Array.isArray(a) && a.every(Number.isFinite) ? { x: a[0], y: a[1], z: a[2] } : w.c;
        this._landAt(w, to, this._bolt({ x: f[0], y: f[1], z: f[2] }, to));
    }

    _castInvisible() {
        const g = this.game;
        const h = this._hand();
        if (!h) return this._no('wardNoHand', { name: 'Protection Invisible' });
        const on = this._wardOnRay(h.o, h.d);
        if (!on) return this._no('wardInvNone');
        if (on.w.owner !== this.myKey) return this._no('wardNotYours', { owner: on.w.ownerName });
        if (on.w.inv) {
            // said again on an invisible house: it is seen again (free)
            this._op({ op: 'vis', id: on.w.id });
            g.hud?.setVoice?.(refusal('wardVisible'), true);
            this.log.push({ ev: 'vis', id: on.w.id });
            return 'ProtectionInvisible';
        }
        if (!this._pay('ProtectionInvisible')) return null;
        this._op({ op: 'inv', id: on.w.id });
        g.hud?.setVoice?.('🫥 Дом скрыт: издалека на его месте видна только земля. Ближе 3–4 м он проступает', true);
        this.log.push({ ev: 'inv', id: on.w.id });
        return 'ProtectionInvisible';
    }

    _castGrant() {
        const g = this.game;
        const me = g.character.group.position;
        const near = [...this.list.values()].filter((w) => w.owner === this.myKey && Math.hypot(me.x - w.c.x, me.y + 1 - w.c.y, me.z - w.c.z) < w.r + WARD.GRANT_NEAR);
        if (!near.length) return this._no('wardGrantFar');
        const h = this._hand();
        if (!h) return this._no('wardGrantAim');
        // the player the hand points at
        let best = null, bestA = 0.25;
        for (const [id, r] of g.remotes || []) {
            if (r.dead) continue;
            const p = _v2.copy(r.position).add(_v3.set(0, 1.4, 0)).sub(h.o);
            const dist = p.length();
            if (dist > WARD.AIM || dist < 0.3) continue;
            const off = p.normalize().angleTo(h.d);
            if (off < bestA) { bestA = off; best = id; }
        }
        if (!best) return this._no('wardGrantAim');
        const w = near[0];
        if (mayPass(w, this.keyOf(best)) || w.ids?.includes(best)) return this._no('wardGrantDone', { who: g.playerName?.(best) });
        if (!this._pay('ProtectionHouseGrant')) return null;
        this._op({ op: 'grant', id: w.id, to: best });
        g.hud?.setVoice?.(`🛡️ Игрок ${g.playerName?.(best) || ''} теперь может входить в ваш дом`, true);
        this.log.push({ ev: 'grant', id: w.id, to: best });
        return 'ProtectionHouseGrant';
    }

    // ------------------------------------------------------------ the list (the host decides)
    /** A change: the host makes it, a guest asks the host. */
    _op(op) {
        const g = this.game;
        if (this.auth) this.apply(op, g.localId);
        else {
            this._applyLocal(op, g.localId); // (seen at once; the host's list comes after)
            g.sync?.wardOp?.(op);
        }
    }

    /** (host) A change from `from` (a peer id). */
    apply(op, from) {
        if (!op || typeof op !== 'object') return;
        const key = this.keyOf(from);
        const w = op.id != null ? this.list.get(String(op.id)) : null;
        if (op.op === 'new') {
            if (w || !Array.isArray(op.c) || !op.c.every(Number.isFinite)) return;
            const nw = this._add({ id: String(op.id).slice(0, 60), owner: key, ownerName: String(op.name || this.game.playerName?.(from) || 'Игрок').slice(0, 16), c: { x: op.c[0], y: op.c[1], z: op.c[2] }, r: WARD.START_R, n: 0, inv: false, grant: [], grantNames: [], hp: WARD.HP, max: WARD.HP, setting: true });
            this._fresh(nw, op);
        } else if (!w) return;
        else if (op.op === 'grow') {
            // (its owner's computer grows it: the size it sent — never smaller, never far more at once)
            if (w.owner !== key) return;
            const r = Math.min(WARD.MAX_R, Number.isFinite(op.r) ? Math.min(op.r, w.r + 3) : w.r + WARD.STEP);
            if (r <= w.r) return;
            w.r = r;
            if (!w.setting) { w.gy = this._groundY(w.c, w.r); this._rebuildDisc(w); }
        }
        else if (op.op === 'set') {
            if (w.owner !== key) return;
            w.setting = !!op.on;
            if (!w.setting) { w.gy = this._groundY(w.c, w.r); this._rebuildDisc(w); }
        }
        else if (op.op === 'feed') {
            // (a granted player feeds as the owner; the portion is the guest's own mana: a few moments' worth at most)
            if (!mayPass(w, key)) return;
            const d = Math.max(0, Math.min(WARD.FEED_PORTION, +op.d || 0));
            if (d > 0) { w.hp += d; w.max = wardMax(w) + d; }
            if (op.on) { w.feedKey = key; w.feedAt = this._t; } else if (w.feedKey === key) w.feedKey = '';
        }
        else if (op.op === 'dispel') {
            if (w.owner !== key) return;
            this._broken(w.id, from, true);
            this._changed([{ id: w.id, by: from, dp: 1 }]);
            return;
        }
        else if (op.op === 'inv') { if (w.owner === key) w.inv = true; }
        else if (op.op === 'vis') { if (w.owner === key) w.inv = false; }
        else if (op.op === 'grant') {
            if (w.owner !== key || !op.to) return;
            const k = this.keyOf(op.to);
            if (!w.grant.includes(k)) { w.grant.push(k); w.grantNames.push(String(this.game.playerName?.(op.to) || 'Игрок').slice(0, 16)); }
        } else return;
        this._changed();
    }

    /** (guest) Seen at once on my own computer. */
    _applyLocal(op, from) {
        if (op.op === 'new' && !this.list.has(op.id)) this._fresh(this._add({ id: op.id, owner: this.myKey, ownerName: op.name, c: { x: op.c[0], y: op.c[1], z: op.c[2] }, r: WARD.START_R, n: 0, inv: false, grant: [], grantNames: [], hp: WARD.HP, max: WARD.HP, setting: true, ids: [from] }), op);
        const w = this.list.get(op.id);
        if (!w) return;
        if (op.op === 'grow' && Number.isFinite(op.r) && op.r > w.r) w.r = Math.min(WARD.MAX_R, op.r);
        if (op.op === 'set') w.setting = !!op.on;
        if (op.op === 'inv') w.inv = true;
        if (op.op === 'vis') w.inv = false;
    }

    /** A dome just made: where its charge came from and landed (kept while it grows: others draw it). */
    _fresh(w, op) {
        if (Array.isArray(op.f)) { w.f = op.f.slice(0, 3); w.a = Array.isArray(op.a) ? op.a.slice(0, 3) : null; }
        this._arrive(w, w.f, w.a);
    }

    _add(w) {
        if (!Number.isFinite(w.r)) w.r = wardRadius(w.n || 0);
        w.r = Math.max(0.5, Math.min(WARD.MAX_R, w.r));
        w.gy = this._groundY(w.c, w.r);
        this.list.set(w.id, w);
        return w;
    }

    _remove(id) {
        this.list.delete(id);
        const L = this.looks.get(id);
        if (L) {
            this.game.scene?.remove(L.dome);
            if (L.disc) { this.game.scene?.remove(L.disc); L.disc.geometry.dispose(); }
            L.dome.material.dispose();
            this.looks.delete(id);
        }
        if (this.setting?.id === id) this.setting = null;
        if (this.feeding?.id === id) this.feeding = null;
        WARD_HIDE.n.value = 0; // (filled again next frame)
    }

    /** (host) Tell everybody (and remember: the world save asks for it). */
    _changed(gone = null) {
        const g = this.game;
        if (this.auth) g.sync?.wards?.(this.netList(), gone);
    }

    /** One sphere as it is sent and saved. */
    _rec(w, ids = false) {
        const o = { id: w.id, o: w.owner, on: w.ownerName, c: [r2(w.c.x), r2(w.c.y), r2(w.c.z)], r: r2(w.r), inv: w.inv ? 1 : 0, g: w.grant.slice(), gn: w.grantNames.slice(), hp: Math.round(w.hp) };
        if (wardMax(w) > WARD.HP) o.mx = Math.round(wardMax(w));
        if (w.feedKey) o.fk = w.feedKey;
        if (w.setting) { o.s = 1; if (w.f) { o.f = w.f; if (w.a) o.a = w.a; } }
        if (w.hellT > 0) o.h = Math.round(w.hellT * 10) / 10;
        if (w.ac) { o.ac = Math.round(w.ac.left * 10) / 10; o.ap = w.ap; }
        if (w.ep) o.ep = w.ep;
        if (w.hitKey || w.hitBy) { o.hk = w.hitKey || ''; o.hb = w.hitBy || ''; }
        if (ids) o.ids = this._ids(w);
        return o;
    }

    _fromRec(o) {
        if (!o || !Array.isArray(o.c) || !o.c.every(Number.isFinite)) return null;
        return { id: String(o.id), owner: String(o.o || ''), ownerName: String(o.on || ''), c: { x: o.c[0], y: o.c[1], z: o.c[2] }, r: Number.isFinite(o.r) ? o.r : wardRadius(Math.max(0, o.n | 0)), n: Math.max(0, o.n | 0), inv: !!o.inv, grant: Array.isArray(o.g) ? o.g.map(String) : [], grantNames: Array.isArray(o.gn) ? o.gn.map(String) : [], hp: Number.isFinite(o.hp) ? o.hp : WARD.HP, max: o.mx > 0 ? +o.mx : WARD.HP, feedKey: String(o.fk || ''), hellT: +o.h || 0, ...(o.ac > 0 && Array.isArray(o.ap) ? { ac: { left: +o.ac, by: null }, ap: o.ap.slice(0, 3) } : {}), ...(Array.isArray(o.ep) ? { ep: o.ep.slice(0, 3) } : {}), hitKey: String(o.hk || ''), hitBy: String(o.hb || '').slice(0, 16), setting: !!o.s, ids: Array.isArray(o.ids) ? o.ids : null, ...(Array.isArray(o.f) ? { f: o.f.slice(0, 3), a: Array.isArray(o.a) ? o.a.slice(0, 3) : null } : {}) };
    }

    netList() { return [...this.list.values()].map((w) => this._rec(w, true)); }

    /** (guests) The host's list (gone: the spheres just broken, [{id, by}]). */
    applyNet(list, gone = null) {
        for (const b of gone || []) if (this.list.has(b?.id)) this._broken(b.id, b.by, !!b.dp);
        const seen = new Set();
        const meBefore = new Set([...this.list.values()].filter((w) => this.mine(w) && w.owner !== this.myKey).map((w) => w.id));
        for (const o of list || []) {
            const w = this._fromRec(o);
            if (!w) continue;
            seen.add(w.id);
            const old = this.list.get(w.id);
            if (old && old.c.x === w.c.x && old.c.z === w.c.z) {
                // (my own dome growing: my computer is ahead of the host's list)
                const r = this.setting?.id === w.id ? Math.max(old.r, w.r) : w.r;
                const moved = Math.abs(r - old.r) > 1e-3;
                // (struck: weaker, or the Hellfire burning on it longer — my own house: I am told)
                const hurt = w.hp < old.hp || (w.hellT || 0) > (old.hellT || 0) + 0.3;
                if (w.hp < old.hp) w.liveAt = this._t;
                else w.liveAt = old.liveAt;
                Object.assign(old, { ...w, r, gy: old.gy });
                if (hurt) this._attacked(old);
                if (moved && !old.setting) { old.gy = this._groundY(old.c, old.r); this._rebuildDisc(old); }
                continue;
            }
            this._add(w);
            if (old) this._rebuildDisc(this.list.get(w.id));
            else if (w.setting && w.f) this._arrive(w, w.f, w.a); // (a dome cast just now: its charge flies)
        }
        for (const id of [...this.list.keys()]) if (!seen.has(id)) this._remove(id);
        // I was let into somebody's house
        for (const w of this.list.values()) {
            if (w.owner !== this.myKey && this.mine(w) && !meBefore.has(w.id)) this.game.hud?.setVoice?.(`🛡️ ${w.ownerName || 'Хозяин'} пустил вас в свой дом: вы можете входить и выходить`, true);
        }
    }

    snapshot() { return [...this.list.values()].map((w) => { const o = this._rec(w); delete o.s; delete o.f; delete o.a; return o; }); }

    restore(list) {
        for (const o of list || []) { const w = this._fromRec(o); if (w) { w.setting = false; delete w.f; delete w.a; this._add(w); } }
    }

    // ------------------------------------------------------------ what it stops
    /** The first sphere the segment a→b goes into from outside: {w, s} (s: 0..1 along), else null. */
    hitSegment(a, b) {
        let best = null;
        for (const w of this.list.values()) {
            const s = crossInto(w, a, b);
            if (s >= 0 && (!best || s < best.s)) best = { w, s };
        }
        return best;
    }

    /** The segment a→b goes into a sphere from outside: the point on its surface (it flashes there), else null. */
    segmentHit(a, b, spell = null, by = null) {
        if (!this.list.size) return null;
        const hit = this.hitSegment(a, b);
        if (!hit) return null;
        const p = new THREE.Vector3().lerpVectors(a, b, hit.s);
        // (just outside: what bursts there stays outside)
        const out = _v1.set(p.x - hit.w.c.x, p.y - hit.w.c.y, p.z - hit.w.c.z);
        if (out.lengthSq() > 1e-8) p.addScaledVector(out.normalize(), 0.15);
        this.flash(hit.w, p);
        this.lastHit = hit.w;
        if (spell) this.chargeHit(hit.w, p, spell, by);
        return p;
    }

    /** Where a caster stands (me, another player), or null. */
    casterAt(id) {
        const g = this.game;
        if (id == null) return null;
        if (id === 'local' || id === g.localId) return g.character?.group.position || null;
        return g.remotes?.get(id)?.position || null;
    }

    /** Is `to` inside a sphere that `from` is outside of (a blast / a push from outside can't reach it)? */
    shields(from, to) {
        if (!from || !to || !this.list.size) return false;
        for (const w of this.list.values()) if (inWard(w, to) && !inWard(w, from)) return true;
        return false;
    }

    /** Building / gathering at `p` from `from`: inside somebody else's sphere (I'm not let in) — no. */
    forbids(from, p) {
        for (const w of this.list.values()) if (inWard(w, p) && !inWard(w, from) && !this.mine(w)) { this.flash(w, p); return true; }
        return false;
    }

    /** A ray from `o` along `d`: how far it gets before a sphere stops it (flashing where it does). */
    clipRay(o, d, len) {
        if (!this.list.size) return len;
        const b = _v1.copy(o).addScaledVector(d, len);
        const hit = this.hitSegment(o, b);
        if (!hit) return len;
        const at = _v2.copy(o).addScaledVector(d, len * hit.s);
        this.flash(hit.w, at);
        return len * hit.s;
    }

    /** A block (centre x, y, z) inside any sphere: fire, cracks… don't touch it. */
    protects(x, y, z) {
        for (const w of this.list.values()) if (inWard(w, { x, y, z })) return true;
        return false;
    }

    /** A blast at `p` of radius `r`: the spheres it may not eat into ([[x, y, z, r], …] — saved with it). */
    keepFor(p, r) {
        const out = [];
        for (const w of this.list.values()) {
            if (inWard(w, p)) continue; // (from inside: the sphere doesn't hold it)
            if (Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) < w.r + r + 1) out.push([r2(w.c.x), r2(w.c.y), r2(w.c.z), r2(w.r)]);
        }
        return out;
    }

    /**
     * Magic at `p` (radius `r`) hit the spheres from outside: they flash there. Only «Бомбардо»
     * (cracks it: ~3 break it), «Бомбардо Максима» and «Total Destruction» (at once), and «Let the
     * Hellfire Come» held on it ~7 s break it (the host decides). Nothing else harms it.
     */
    struck(p, r, spell, by = null) {
        let any = false;
        for (const w of [...this.list.values()]) {
            if (inWard(w, p) || Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z) > w.r + r + 0.5) continue;
            any = true;
            this.flash(w, _v1.set(p.x, p.y, p.z));
            if (!this.auth) continue;
            let broken = false;
            if (spell === 'Hellfire') {
                const gap = this._t - (w.hellAt ?? -1e9);
                w.hellT = gap < 1.5 ? (w.hellT || 0) + gap : 0;
                w.hellAt = this._t;
                broken = w.hellT >= hellTime(w);
            } else {
                const n = WARD.BREAK[spell];
                if (!n) continue;
                w.hp -= n;
                broken = w.hp <= 0;
                if (!broken) this.game.sound?.playCrack?.(_v1.set(p.x, p.y, p.z), 1.2);
            }
            this._wounded(w, spell, by, broken);
        }
        return any;
    }

    /** (host) The sphere took a blow: who did it is noted, its owner told; broken — it falls apart. */
    _wounded(w, spell, by, broken, quiet = false) {
        w.hitAt = this._t;
        // (who: its owner is told, wherever they are — the host's list carries it)
        w.hitKey = by != null ? this.keyOf(by) : '';
        w.hitBy = by != null ? String(this.game.playerName?.(by) || '').slice(0, 16) : '';
        if (!quiet) this.log.push({ ev: 'hit', id: w.id, spell, hp: w.hp, hellT: w.hellT || 0 });
        if (!broken) this._attacked(w);
        if (broken) {
            this._broken(w.id, by);
            this._changed([{ id: w.id, by }]);
        } else if (!quiet) this._changed();
    }

    /**
     * A strong duel charge (Duel._fly) touched the sphere from outside at `p` (host): «Пилбидрио» takes 80 at once,
     * «Акцентрик» stays on it and eats 5 a second (40 in all, then goes out); «Электром» is held on it by its caster
     * (StrongMagic: electrumTick). The charge itself dies at the surface; every other charge only flashes.
     */
    chargeHit(w, p, spell, by) {
        if (!this.auth || !this.list.has(w.id)) return;
        if (spell === 'Pilbidrio') {
            w.hp -= WARD.BREAK.Pilbidrio;
            const broken = w.hp <= 0;
            if (!broken) this.game.sound?.playCrack?.(_v1.set(p.x, p.y, p.z), 1.4);
            this._wounded(w, spell, by, broken);
        } else if (spell === 'Accentric') {
            // (one at a time: another charge only fills it up to a new 40, it never eats faster)
            w.ac = { left: WARD.ACC_TOTAL, by };
            w.ap = [r2(p.x), r2(p.y), r2(p.z)];
            this.log.push({ ev: 'hit', id: w.id, spell, hp: w.hp, hellT: 0 });
            this._wounded(w, spell, by, false, true);
            this._changed();
        }
    }

    /** (host) «Электром» held on the sphere at `p` by `by`: `dmg` taken; the cracks spread from the spot. */
    electrumTick(id, dmg, by, p) {
        const w = this.list.get(id);
        if (!this.auth || !w || !(dmg > 0)) return;
        w.hp -= dmg;
        if (p) w.ep = [r2(p.x), r2(p.y), r2(p.z)];
        w.liveAt = this._t;
        const broken = w.hp <= 0;
        if (!broken && Math.random() < 0.3) this.game.sound?.playCrack?.(_v1.set(w.ep?.[0] ?? w.c.x, w.ep?.[1] ?? w.c.y, w.ep?.[2] ?? w.c.z), 0.8);
        this._wounded(w, 'Electrum', by, broken, true);
        if (!broken && this._t - (w.sentAt ?? -1e9) > 0.25) { w.sentAt = this._t; this._changed(); }
    }

    /**
     * Somebody is breaking a house's protection: its owner is told at once, however far away (every
     * computer has the host's list). Not when the owner struck it; at most every few seconds per house.
     */
    _attacked(w) {
        const g = this.game;
        if (w.owner !== this.myKey || (w.hitKey && w.hitKey === this.myKey)) return;
        const now = performance.now();
        if (now - (w.warnAt || -1e9) < WARD.WARN_EVERY * 1000) return;
        w.warnAt = now;
        const hell = Math.min(1, (w.hellT || 0) / hellTime(w));
        const left = Math.max(0, Math.round(Math.min(w.hp / wardMax(w), 1 - hell) * 100));
        const me = g.character?.group?.position;
        const far = me ? Math.hypot(me.x - w.c.x, me.z - w.c.z) : 0;
        const where = far > 60 ? ` (${far >= 1000 ? (far / 1000).toFixed(1) + ' км' : Math.round(far) + ' м'} отсюда)` : '';
        g.hud?.setVoice?.(`🛡️⚠️ Ваш дом пытаются разрушить${w.hitBy ? ` — ${w.hitBy}` : ''}! Защита: ${left}% (${Math.max(0, Math.round(w.hp))}/${Math.round(wardMax(w))})${where}`, true);
        g.sound?.playCrack?.(me || _v1.set(w.c.x, w.c.y, w.c.z), 0.6);
        this.log.push({ ev: 'warned', id: w.id, by: w.hitBy || null, left });
    }

    /** The sphere is broken: it falls apart in shards; the owner and the one who broke it are told. */
    _broken(id, by = null, dispelled = false) {
        const w = this.list.get(id);
        if (!w) return;
        const g = this.game;
        const c = _v1.set(w.c.x, w.c.y, w.c.z);
        for (let i = 0; i < 160; i++) {
            const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
            const dir = _v2.set(Math.sin(b) * Math.cos(a), Math.max(0, Math.cos(b)), Math.sin(b) * Math.sin(a));
            g.fx?.spark?.(_v3.copy(c).addScaledVector(dir, w.r), i % 3 ? (dispelled ? 0xdfe8f2 : 0x8fc8ff) : 0xffffff, 0.16, dir.multiplyScalar(2 + Math.random() * 3).setY(-1 - Math.random() * 3), 1.4);
        }
        g.fx?.lightFlash?.(c, 0x8fc8ff, 3, 0.4, w.r * 3);
        g.sound?.playFrozenHit?.();
        if (!dispelled) g.sound?.playExplosion?.(c, g.character?.group.position || c, 0.4);
        if (w.owner === this.myKey || (!dispelled && by != null && (by === g.localId || by === 'local'))) g.hud?.setVoice?.(refusal(dispelled ? 'wardDispelled' : 'wardBroken'), true);
        this.log.push({ ev: dispelled ? 'dispelled' : 'broken', id, by });
        this._remove(id);
    }

    /** The hex pattern lights up where something touched the sphere. */
    flash(w, p) {
        const L = this.looks.get(w.id);
        if (L) { L.flash = 1; L.flashAt = (L.flashAt || new THREE.Vector3()).set(p.x, p.y, p.z); }
        if (Math.random() < 0.7) this.game.fx?.spark?.(p, 0x9fd8ff, 0.1, _v3.set(0, 1, 0), 0.4);
    }

    _pulse(w) {
        const L = this.looks.get(w.id);
        if (L) L.pulse = 1;
    }

    // ------------------------------------------------------------ bodies
    /** How long this one has been pushing on a sphere (it shoves back after WARD.PRESS_T, or at once when run into). */
    _pressing(key, depthSpeed, dt) {
        const m = this._press || (this._press = new Map());
        let e = m.get(key);
        if (!e || this._t - e.last > 0.5) { e = { t: 0, last: this._t, shoveAt: e?.shoveAt ?? -1e9 }; m.set(key, e); }
        e.t += dt;
        e.last = this._t;
        if (this._t - e.shoveAt < WARD.SHOVE_GAP) return false;
        if (e.t < WARD.PRESS_T && depthSpeed < WARD.RAM_SPEED) return false;
        e.shoveAt = this._t;
        e.t = 0;
        return true;
    }

    /** My body may not come in (my computer moves me): held at the surface; pushing on — shoved back, −2 HP. */
    keepOut(pos, feet, height, dt) {
        const g = this.game;
        for (const w of this.list.values()) {
            if (this.mine(w)) continue;
            const push = bodyPush(w, pos.x, feet, feet + height, pos.z, 0.5);
            if (!push) continue;
            // walked into it: back to the surface at once; deep inside (it was set over me): out softly
            const k = push.depth < 1.2 ? 1 : Math.min(1, (6 * dt) / push.depth);
            pos.x += push.x * k; pos.y += Math.max(0, push.y * k); pos.z += push.z * k;
            const at = _v1.set(pos.x, feet + 1.5, pos.z);
            this._wake(w, at);
            if (push.depth < 1.2 && this._pressing('me', dt > 0 ? push.depth / dt : 0, dt)) {
                const dir = _v2.set(push.x, 0, push.z);
                if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
                dir.normalize();
                g.impact?.apply?.({ v: dir.clone().multiplyScalar(WARD.SHOVE_V), from: new THREE.Vector3(w.c.x, w.c.y, w.c.z), by: null, spell: 'Ward', jolt: 1.5, noShield: true });
                if (g.config?.mode !== 'creative' || g.combat?.enabled) { if (g.combat?.enabled) g.combat.damage(WARD.SHOVE_HP, null, 'Ward'); else g.damageLocalPlayer?.(WARD.SHOVE_HP); }
                this.flash(w, at);
                g.sound?.playClang?.();
                this.log.push({ ev: 'shove', who: 'me', id: w.id });
            }
            if (!this._bumpAt || performance.now() - this._bumpAt > 2500) {
                this._bumpAt = performance.now();
                g.hud?.toast?.(refusal('wardBarrier'), 2500);
            }
        }
    }

    /** (host) A creature pushing on it too long (or run into it) is shoved back and hurt a little. */
    _shoveCreature(w, ck, c, dir) {
        const g = this.game;
        const v = dir.clone().multiplyScalar(WARD.SHOVE_V);
        g.creatureImpact?.apply?.(c, { v, by: null, spell: 'Ward', from: new THREE.Vector3(w.c.x, w.c.y, w.c.z), jolt: 1 });
        const n = WARD.SHOVE_HP, d = dir.clone();
        if (ck === 'z') g.damageZombie?.(c, n, false, d, null);
        else if (ck === 'a') g.animals?.hit?.(c, n, d, null);
        else if (ck === 'v') g.castleLife?.hit?.(c, n, d, null, {});
        else if (ck === 'c') g.ships?.crew?.hit?.(c, n, d, null);
        else if (ck === 'F') g.phoenixes?.shooed?.(c); // (a phoenix: not hurt — turned away, it flies off)
        else if (ck === 'O') g.owls?.shooed?.(c); // (an owl: the same)
        else if (ck === 'C') g.customCreatures?.shooed?.(c); // (a creature of one's own: turned away)
        else if (ck === 'N') g.canaries?.hit?.(c, 0, 'Wards', null); // (a canary: shoved out of the sphere, angered)
        else if (ck === 'G') g.gargoyles?.shooed?.(c); // (an infernal gargoyle: turned away at the sphere, no harm)
        // (a living tree: only shoved — nothing but fire hurts it)
        this.log.push({ ev: 'shove', who: ck, id: w.id });
    }

    /** (host) Creatures of every kind are held at the surface (and shoved back when they push on). */
    _creatures(dt) {
        const g = this.game;
        for (const w of this.list.values()) {
            for (const ck of Object.keys(KINDS)) {
                const K = KINDS[ck];
                for (const c of K.list(g)) {
                    if (!K.alive(c) || this._creatureMay(w, c)) continue;
                    const p = K.centre(c, _v1);
                    const push = bodyPush(w, p.x, p.y - 1, p.y + 1, p.z, 0.6);
                    if (!push) continue;
                    const k = push.depth < 1.2 ? 1 : Math.min(1, (5 * dt) / push.depth);
                    K.move(g, c, push.x * k, push.z * k);
                    if (push.depth < 1.2 && this._pressing(ck + '|' + c.id, dt > 0 ? push.depth / dt : 0, dt)) {
                        const dir = new THREE.Vector3(push.x, 0, push.z);
                        if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
                        this._shoveCreature(w, ck, c, dir.normalize());
                    }
                }
            }
            for (const s of g.spiders?.list || []) {
                if (s.dead) continue;
                const p = s.model.position;
                const push = bodyPush(w, p.x, p.y, p.y + 3, p.z, 2.5);
                if (!push) continue;
                const k = push.depth < 1.5 ? 1 : Math.min(1, (5 * dt) / push.depth);
                p.x += push.x * k; p.z += push.z * k;
                if (push.depth < 1.5 && this._pressing('s|' + s.id, dt > 0 ? push.depth / dt : 0, dt)) {
                    const dir = _v2.set(push.x, 0, push.z);
                    if (dir.lengthSq() > 1e-8) p.addScaledVector(dir.normalize(), 1.5);
                    g.spiders.hit?.(s, WARD.SHOVE_HP, 'Ward');
                    this.log.push({ ev: 'shove', who: 's', id: w.id });
                }
            }
            // dragons (on their feet: a flying one is far above any house's sphere — or pushed out the same)
            for (const dr of g.dragons?.list || []) {
                if (dr.dead) continue;
                const p = dr.model.position;
                const push = bodyPush(w, p.x, p.y, p.y + 5 * dr.size, p.z, 3 * dr.size);
                if (!push) continue;
                const k = push.depth < 1.5 ? 1 : Math.min(1, (5 * dt) / push.depth);
                p.x += push.x * k; p.z += push.z * k;
                if (push.depth < 1.5 && this._pressing('D|' + dr.id, dt > 0 ? push.depth / dt : 0, dt)) {
                    const dir = _v2.set(push.x, 0, push.z);
                    if (dir.lengthSq() > 1e-8) p.addScaledVector(dir.normalize(), 1.5);
                    g.dragons.hit?.(dr, WARD.SHOVE_HP, 'Ward', null);
                    this.log.push({ ev: 'shove', who: 'D', id: w.id });
                }
            }
        }
    }

    /** It shows where one who may not come in is close (every computer sees it so). */
    _wake(w, p) {
        const L = this.looks.get(w.id);
        if (!L) return;
        L.near = 1;
        L.nearAt = (L.nearAt || new THREE.Vector3()).copy(p);
    }

    /** Who is close to it and may not come in (me, the other players, creatures of every kind). */
    _intruders() {
        const g = this.game;
        const pts = [];
        const me = g.character?.group.position;
        for (const w of this.list.values()) {
            const near = (p) => { const d = Math.hypot(p.x - w.c.x, p.y - w.c.y, p.z - w.c.z); return d < w.r + WARD.NEAR && d > w.r - 1.5; };
            const wake = (p) => { if (near(p)) { this._wake(w, p); return true; } return false; };
            if (me && !this.mine(w) && wake(_v1.set(me.x, me.y + 1, me.z))) continue;
            let done = false;
            for (const [id, r] of g.remotes || []) {
                if (r.dead) continue;
                const may = this.auth ? mayPass(w, this.keyOf(id)) : !!w.ids?.includes(id);
                if (!may && wake(_v1.set(r.position.x, r.position.y + 1, r.position.z))) { done = true; break; }
            }
            if (done) continue;
            for (const ck of Object.keys(KINDS)) {
                const K = KINDS[ck];
                for (const c of K.list(g)) {
                    if (!K.alive(c) || this._creatureMay(w, c)) continue;
                    if (wake(K.centre(c, _v1))) { done = true; break; }
                }
                if (done) break;
            }
            if (done) continue;
            for (const s of g.spiders?.list || []) if (!s.dead && wake(_v1.copy(s.model.position).setY(s.model.position.y + 1.5))) break;
            for (const dr of g.dragons?.list || []) if (!dr.dead && wake(_v1.copy(dr.model.position).setY(dr.model.position.y + 2.5 * dr.size))) break;
        }
        return pts;
    }

    // ------------------------------------------------------------ the look
    _look(w) {
        let L = this.looks.get(w.id);
        if (L) return L;
        const mat = new THREE.ShaderMaterial({
            vertexShader: DOME_VS, fragmentShader: DOME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            uniforms: { uColor: { value: new THREE.Color(0x7fbfff) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uSet: { value: 0 }, uGrow: { value: 0 }, uCrack: { value: 0 }, uHell: { value: 0 }, uCrackAt: { value: new THREE.Vector4(0, 0, 0, 0) } },
        });
        const dome = new THREE.Mesh(this._domeGeo, mat);
        dome.renderOrder = 3;
        dome.userData.noWardHide = true;
        dome.frustumCulled = true;
        this.game.scene?.add(dome);
        L = { dome, disc: null, k: 1, flash: 0, pulse: 0, discR: 0, near: 0, beam: 0, beamAt: null, show: 0, wasSetting: !!w.setting, lastR: w.r, grow: 0, sparkAcc: 0 };
        this.looks.set(w.id, L);
        return L;
    }

    /** The land drawn over the hidden house (its ground's own colour and look). */
    _rebuildDisc(w) {
        const L = this.looks.get(w?.id);
        if (!L || !L.disc) return;
        this.game.scene?.remove(L.disc);
        L.disc.geometry.dispose();
        L.disc = null;
    }

    _makeDisc(w, L) {
        const dy = w.gy - w.c.y;
        if (Math.abs(dy) >= w.r) return null;
        const rr = Math.sqrt(w.r * w.r - dy * dy);
        const geo = new THREE.CircleGeometry(rr, 40);
        geo.rotateX(-Math.PI / 2);
        const n = geo.attributes.position.count;
        const col = new THREE.Color(BASE_COLORS[this._groundType ?? BLOCK.GRASS] ?? 0x4caf50);
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        geo.setAttribute('voxPat', new THREE.BufferAttribute(new Float32Array(n), 1));
        geo.setAttribute('voxSky', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
        if (!this._discMat) {
            this._discMat = applyVoxelDetail(new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 8, specular: 0x111111, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        }
        const disc = new THREE.Mesh(geo, this._discMat.clone());
        disc.material.onBeforeCompile = this._discMat.onBeforeCompile;
        disc.material.customProgramCacheKey = this._discMat.customProgramCacheKey;
        disc.position.set(w.c.x, w.gy + 0.01, w.c.z);
        disc.receiveShadow = true;
        disc.userData.noWardHide = true;
        this.game.scene?.add(disc);
        L.disc = disc;
        return disc;
    }

    _updateLooks(dt) {
        const g = this.game;
        const eye = g.character?.group.position || _v3.set(0, 0, 0);
        const hidden = [];
        for (const w of this.list.values()) {
            const L = this._look(w);
            const k = seenK(w, _v1.set(eye.x, eye.y + 1, eye.z));
            L.k = k;
            const u = L.dome.material.uniforms;
            L.dome.position.set(w.c.x, w.c.y, w.c.z);
            // the charge is still flying: not there yet; it lands — the dome lights up from that spot
            const coming = w.landAt != null && this._t < w.landAt;
            if (w.landAt != null && !coming && !w.landed) {
                w.landed = true;
                L.pulse = 1;
                L.flash = 1;
                L.flashAt = (L.flashAt || new THREE.Vector3()).set(w.landP.x, w.landP.y, w.landP.z);
                for (let i = 0; i < 48; i++) {
                    const an = (i / 48) * Math.PI * 2;
                    g.fx?.spark?.(_v2.set(w.c.x + Math.cos(an) * w.r, w.c.y + 0.1, w.c.z + Math.sin(an) * w.r), i % 2 ? 0x9fd8ff : 0xcfe8ff, 0.1, _v3.set(0, 1.5 + Math.random() * 2, 0), 0.9);
                }
            }
            L.pulse = Math.max(0, L.pulse - dt * 2);
            L.dome.scale.setScalar(w.r * (1 + 0.04 * L.pulse));
            u.uTime.value = this._t;
            u.uSet.value = w.setting ? 1 : 0;
            // growing now (on every computer: its size goes up): sparks run along its edge on the ground
            // and over it, the ring blazes, the hum rises
            const dr = w.r - L.lastR;
            L.lastR = w.r;
            L.grow = w.setting && dr > 1e-5 ? 1 : Math.max(0, L.grow - dt * 3);
            u.uGrow.value = L.grow;
            if (L.grow > 0.5 && !coming) this._growSparks(w, L, dt);
            u.uHell.value = Math.min(1, (w.hellT || 0) / hellTime(w));
            // not seen — but while it is being set (and a moment after «стоп»), where one who may not
            // come in is close, where magic hits it, while it is cracked or the Hellfire burns on it
            if (L.wasSetting && !w.setting) this._setDone(w, L);
            L.wasSetting = !!w.setting;
            // (the author: the dome being set must not cover the whole screen — it is drawn as it was: faint, behind
            // the walls as everything is, brightest where the caster's beam strikes it — _beams)
            L.show = Math.max(0, L.show - dt);
            const inside = inWard(w, _v2.set(eye.x, eye.y + 1, eye.z));
            const crack = Math.max(0, 1 - w.hp / wardMax(w)), hell = Math.min(1, (w.hellT || 0) / hellTime(w));
            L.flash = Math.max(0, L.flash - dt * 1.5);
            const seen = Math.max(w.setting ? (inside ? 0.12 : 0.3) + 0.4 * L.pulse : 0, Math.min(1, L.show) * (inside ? 0.25 : 0.6), L.near * 0.75, L.flash * 0.8, L.beam * 0.8, (L.feed || 0) * 0.5, crack * 0.5, hell * 0.9);
            // (a sphere fed to a great strength glows brighter: ×1 at 100, ×1.45 at 1600)
            const big = Math.min(1, Math.log2(Math.max(1, wardMax(w) / WARD.HP)) / 4);
            u.uAlpha.value = Math.min(1, seen * (1 + 0.45 * big)) * k;
            u.uCrack.value = crack;
            // «Электром»'s spot: the cracks grow from it as the strength goes (stay where the beam left them); live — it sparks
            if (w.ep && crack > 0.01) {
                u.uCrackAt.value.set(w.ep[0], w.ep[1], w.ep[2], 0.8 + crack * Math.min(w.r, 14) * 1.1);
                if (this._t - (w.liveAt ?? -1e9) < 0.5 && Math.random() < 0.6) g.fx?.spark?.(_v2.set(w.ep[0], w.ep[1], w.ep[2]), Math.random() < 0.5 ? 0xbfe6ff : 0xffffff, 0.14, _v3.set((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0.3);
                if (this._t - (w.liveAt ?? -1e9) < 0.5) { L.flash = Math.max(L.flash, 0.5); L.flashAt = (L.flashAt || new THREE.Vector3()).set(w.ep[0], w.ep[1], w.ep[2]); L.pulse = Math.max(L.pulse, 0.25 + 0.25 * Math.random()); }
            } else u.uCrackAt.value.w = 0;
            // «Акцентрик» sitting on it: a lilac haze at its spot
            if (w.ac && w.ap && Math.random() < 0.5) {
                g.fx?.spark?.(_v2.set(w.ap[0] + (Math.random() - 0.5) * 2, w.ap[1] + (Math.random() - 0.5) * 2, w.ap[2] + (Math.random() - 0.5) * 2), Math.random() < 0.5 ? 0xb07cff : 0xd9b8ff, 0.2, _v3.set(0, 0.8, 0), 0.8);
                L.flash = Math.max(L.flash, 0.35); L.flashAt = (L.flashAt || new THREE.Vector3()).set(w.ap[0], w.ap[1], w.ap[2]);
            }
            u.uColor.value.setHex(0x7fbfff).lerp(_c.setHex(0xdcefff), 0.7 * (L.feed || 0)).lerp(_c.setHex(0xff3a1a), hell); // (fed now: whiter, warmer)
            // the hex pattern lights up where it is touched / pressed
            const fp = L.beam > Math.max(L.near, L.flash) ? L.beamAt : L.near > L.flash ? L.nearAt : L.flashAt;
            if (fp) u.uFlash.value.set(fp.x, fp.y, fp.z, Math.max(L.flash, L.near * 0.8, L.beam));
            else u.uFlash.value.w = 0;
            L.near = Math.max(0, L.near - dt * 1.5);
            L.beam = Math.max(0, (L.beam || 0) - dt * 4);
            L.feed = Math.max(0, (L.feed || 0) - dt * 4);
            L.dome.visible = k > 0.01 && seen > 0.005 && !coming;
            if (w.inv && k < 0.999) hidden.push({ w, k, d: Math.hypot(eye.x - w.c.x, eye.z - w.c.z) });
            // the land over it, seen from far
            if (w.inv) {
                if (!L.disc) this._makeDisc(w, L);
                if (L.disc) { L.disc.visible = k < 0.995; L.disc.material.opacity = 1 - k; L.disc.material.depthWrite = k < 0.5; }
            } else if (L.disc) L.disc.visible = false;
        }
        // the terrain's shader hides the house's blocks (the nearest few)
        hidden.sort((a, b) => a.d - b.d);
        const H = WARD_HIDE;
        H.n.value = Math.min(WARD.HIDE_MAX, hidden.length);
        for (let i = 0; i < H.n.value; i++) {
            const { w, k } = hidden[i];
            H.s.value[i].set(w.c.x, w.c.y, w.c.z, w.r);
            H.g.value[i] = w.gy + 0.02;
            H.k.value[i] = k;
        }
        return hidden;
    }

    /** Everything else inside an invisible house (doors, beds, things, people) is not seen from far either. */
    _hideObjects(hidden) {
        const g = this.game;
        const scene = g.scene;
        if (!scene) return;
        const want = new Set();
        if (hidden.length) {
            for (const o of scene.children) {
                if (o.userData?.noWardHide || o === g.character?.group || o.isInstancedMesh || o.isPoints || o.isLight || o.name === 'terrain') continue;
                const p = o.position;
                if (p.x === 0 && p.y === 0 && p.z === 0) continue;
                for (const { w, k } of hidden) if (k < 0.5 && inWard(w, p)) { want.add(o); break; }
            }
        }
        for (const [o, vis] of [...this._hidden]) if (!want.has(o)) { o.visible = vis; this._hidden.delete(o); }
        for (const o of want) { if (!this._hidden.has(o)) this._hidden.set(o, o.visible); o.visible = false; }
    }

    /** Sparks along the growing edge: on the ground ring (the floor) and over the dome. */
    _growSparks(w, L, dt) {
        const fx = this.game.fx;
        if (!fx?.spark) return;
        L.sparkAcc = Math.min(6, L.sparkAcc + dt * (30 + w.r * 3));
        for (; L.sparkAcc >= 1; L.sparkAcc--) {
            const an = Math.random() * Math.PI * 2;
            if (Math.random() < 0.7) {
                _v2.set(w.c.x + Math.cos(an) * w.r, w.c.y + 0.08, w.c.z + Math.sin(an) * w.r);
                _v3.set(Math.cos(an) * 0.8, 1 + Math.random() * 1.8, Math.sin(an) * 0.8);
            } else {
                const up = 0.15 + Math.random() * 0.85, ring = Math.sqrt(1 - up * up);
                _v2.set(w.c.x + Math.cos(an) * ring * w.r, w.c.y + up * w.r, w.c.z + Math.sin(an) * ring * w.r);
                _v3.set(Math.cos(an) * ring, up, Math.sin(an) * ring).multiplyScalar(0.6 + Math.random());
            }
            fx.spark(_v2, Math.random() < 0.5 ? 0x9fd8ff : Math.random() < 0.5 ? 0xcfe8ff : 0xb7a6ff, 0.06 + Math.random() * 0.06, _v3, 0.5 + Math.random() * 0.3);
        }
    }

    /** «стоп» (or it stopped by itself): the dome is set — a flash running over it, a click and a chime. */
    _setDone(w, L) {
        const g = this.game;
        L.show = WARD.SHOW_AFTER_SET;
        L.pulse = 1;
        L.flash = 1;
        L.flashAt = (L.flashAt || new THREE.Vector3()).set(w.c.x, w.c.y + w.r, w.c.z);
        for (let i = 0; i < 40; i++) {
            const an = (i / 40) * Math.PI * 2;
            g.fx?.spark?.(_v2.set(w.c.x + Math.cos(an) * w.r, w.c.y + 0.1, w.c.z + Math.sin(an) * w.r), i % 2 ? 0xcfe8ff : 0xffffff, 0.1, _v3.set(Math.cos(an) * 0.5, 2 + Math.random() * 2, Math.sin(an) * 0.5), 0.8);
        }
        g.fx?.lightFlash?.(_v2.set(w.c.x, w.c.y + w.r * 0.6, w.c.z), 0xcfe8ff, 2.5, 0.4, Math.max(10, w.r * 2));
        g.sound?.playWardSet?.(_v2);
    }

    /** The hum of a dome growing (the nearest one being set): louder and higher the bigger it is. */
    _hum() {
        const snd = this.game.sound;
        if (!snd?.wardHum) return;
        const eye = this.game.character?.group.position;
        let best = null, bd = Infinity;
        for (const w of this.list.values()) {
            if (!w.setting) continue;
            const L = this.looks.get(w.id);
            const d = eye ? Math.hypot(eye.x - w.c.x, eye.y - w.c.y, eye.z - w.c.z) : 0;
            if (L && d < bd) { bd = d; best = { w, L }; }
        }
        if (!best) { if (this._humOn) { snd.wardHum(null, 0); this._humOn = false; } return; }
        const { w, L } = best;
        const big = Math.min(1, w.r / 12);
        snd.wardHum(_v2.set(w.c.x, w.c.y + w.r * 0.5, w.c.z), (0.25 + 0.75 * L.grow) * (0.35 + 0.65 * big), 0.85 + 0.5 * big);
        this._humOn = true;
    }

    /** One dome to compile its shader on the loading screen (Game.prewarm): no hitch at the first cast. */
    sampleModels() {
        const L = this._look({ id: '__sample', r: 1, setting: true });
        this.looks.delete('__sample');
        this.game.scene?.remove(L.dome);
        L.dome.material.uniforms.uAlpha.value = 0.5;
        return [L.dome, beamModel()];
    }

    // ------------------------------------------------------------ the beam
    /**
     * While a dome is being set (until «стоп»), its caster's beam goes on from the wand (the author): it strikes the
     * house — the house fills with the magic (sparks run over it) — and once the dome has grown round the house it
     * strikes the dome itself (its hex lights up where it touches). Every computer draws every caster's beam (the
     * dome's `setting` comes by the network; the caster's hand is his avatar's).
     */
    _beams(dt) {
        const live = this._liveBeams || (this._liveBeams = new Set());
        live.clear();
        for (const w of this.list.values()) {
            if (w.setting && !(w.landAt != null && this._t < w.landAt)) this._beamOne(w, dt, false, live); // (its charge not still flying)
            if (this._feedKey(w)) this._beamOne(w, dt, true, live);
        }
        for (const [id, B] of this._beamMap || []) if (!live.has(id)) { this.game.scene?.remove(B.group); this._beamMap.delete(id); }
    }

    /** Who feeds this sphere with a beam right now (a lasting key), else ''. My own: by my own wand, not the list. */
    _feedKey(w) {
        if (this.feeding?.id === w.id) return this.feeding.aimed ? this.myKey : '';
        return w.feedKey && w.feedKey !== this.myKey ? w.feedKey : '';
    }

    _beamOne(w, dt, feed, live) {
        const g = this.game;
        const h = this._casterHand(w, feed ? this._feedKey(w) : w.owner);
        if (!h) return;
        const bid = feed ? w.id + '~f' : w.id;
        live.add(bid);
        const B = this._beamOf(bid, feed);
        // where it strikes: the dome from outside; from inside (or past it) the house / the land it shows
        let end = null, onDome = false;
        if (!inWard(w, h.o)) {
            const fx = h.o.x - w.c.x, fy = h.o.y - w.c.y, fz = h.o.z - w.c.z;
            const b = fx * h.d.x + fy * h.d.y + fz * h.d.z, c = fx * fx + fy * fy + fz * fz - w.r * w.r, D = b * b - c;
            const t = D >= 0 ? -b - Math.sqrt(D) : -1;
            if (t > 0 && t < WARD.AIM + w.r) { end = _v1.copy(h.o).addScaledVector(h.d, t); onDome = true; }
        }
        if (!end) {
            B.rayT = (B.rayT ?? 0) - dt;
            if (B.rayT <= 0) { B.rayT = 0.1; const hit = g.terrain?.data?.raycast?.(h.o, h.d, WARD.AIM); B.hit = hit ? (B.hit || new THREE.Vector3()).set(hit.x, hit.y, hit.z) : null; }
            end = B.hit ? _v1.copy(B.hit) : _v1.copy(h.o).addScaledVector(h.d, WARD.AIM * 0.5);
        }
        this._drawBeam(B, h.o, end, dt);
        // its end: the dome lights up there — or the house drinks the magic in
        const L = this.looks.get(w.id);
        if (onDome && L) {
            L.beam = 1; L.beamAt = (L.beamAt || new THREE.Vector3()).copy(end);
            if (feed) { L.feed = 1; L.pulse = Math.max(L.pulse, 0.3 + 0.2 * Math.sin(this._t * 9)); } // (the dome throbs a little as it drinks)
        }
        B.sparkAcc = Math.min(4, (B.sparkAcc || 0) + dt * (onDome ? 25 : 40) * (feed ? 1.3 : 1));
        for (; B.sparkAcc >= 1; B.sparkAcc--) {
            const v = _v2.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(onDome ? 1.5 : 0.8 + Math.random());
            g.fx?.spark?.(end, feed ? (Math.random() < 0.5 ? 0xd6f0ff : 0xfff1c8) : (Math.random() < 0.5 ? 0x9fd8ff : Math.random() < 0.5 ? 0xcfe8ff : 0xb7a6ff), 0.05 + Math.random() * 0.05, v, onDome ? 0.35 : 0.7);
        }
    }

    /** The hand (the wand) of the one setting this dome: me, or his avatar. {o, d} */
    _casterHand(w, key = w.owner) {
        const g = this.game;
        if (!key) return null;
        if (key === this.myKey) return this.setting?.id === w.id || this.feeding?.id === w.id ? this._hand() : null;
        for (const [id, r] of g.remotes || []) {
            if (this.keyOf(id) !== key || r.dead) continue;
            const ch = r.character, side = ch?.getHandWorldPosition ? (ch.getHandWorldPosition('left').y > ch.getHandWorldPosition('right').y ? 'left' : 'right') : 'right';
            const hp = r.handPose(side);
            return { o: hp.origin.addScaledVector(hp.dir, 0.3), d: hp.dir };
        }
        return null;
    }

    _beamOf(id, feed = false) {
        const M = this._beamMap || (this._beamMap = new Map());
        let B = M.get(id);
        if (!B) { B = { group: beamModel(feed) }; this.game.scene?.add(B.group); M.set(id, B); }
        return B;
    }

    /** The beam from `a` to `b`: a white core in a silver-blue glow, flickering. */
    _drawBeam(B, a, b, dt) {
        const G = B.group, len = a.distanceTo(b);
        G.position.copy(a);
        G.quaternion.setFromUnitVectors(_Y, _v2.subVectors(b, a).normalize());
        B.t = (B.t || 0) + dt;
        const f = 1 + 0.25 * Math.sin(B.t * 37) + 0.15 * Math.sin(B.t * 23);
        G.children[0].scale.set(0.025 * f, len, 0.025 * f);
        G.children[1].scale.set(0.09 * f, len, 0.09 * f);
        if (G.children[2]) G.children[2].scale.set(0.2 * f, len, 0.2 * f); // (the feeding beam's warm halo)
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        this._t += dt;
        // my dome grows while the hand is on it
        if (this.setting) this._grow(dt);
        if (this.feeding) this._feed(dt);
        if (this.bolts.length) this._updateBolts(dt);
        if (!this.list.size && !this.looks.size && !this._hidden.size) { if (this._humOn) this._hum(); return; }
        if (this.auth) { this._creatures(dt); this._heal(dt); }
        for (const w of this.list.values()) this._look(w);
        this._intruders();
        this._beams(dt);
        const hidden = this._updateLooks(dt);
        this._hum();
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 0.25; if (this._hidden.size || hidden.length) this._hideObjects(hidden); }
        else for (const o of this._hidden.keys()) o.visible = false; // (others may have shown it again this frame)
        if (!hidden.length) WARD_HIDE.n.value = 0;
    }

    /** (host) Left alone, its cracks heal slowly; the Hellfire taken off it, it cools. */
    _heal(dt) {
        let any = false;
        for (const w of [...this.list.values()]) {
            if (w.hellT > 0 && this._t - (w.hellAt ?? -1e9) > 1.5) { w.hellT = 0; any = true; }
            // «Акцентрик» sitting on it: −5 a second, 40 in all
            if (w.ac) {
                const by = w.ac.by ?? null, d = Math.min(WARD.ACC_DPS * dt, w.ac.left);
                w.ac.left -= d;
                w.hp -= d;
                w.liveAt = this._t;
                if (w.ac.left <= 0.001) { delete w.ac; delete w.ap; any = true; }
                else if (this._t - (w.sentAt ?? -1e9) > 0.5) { w.sentAt = this._t; any = true; }
                this._wounded(w, 'Accentric', by, w.hp <= 0, true);
                continue;
            }
            const mx = wardMax(w);
            if (w.ep && w.hp >= mx) { delete w.ep; any = true; }
            if (w.hp < mx && this._t - (w.hitAt ?? -1e9) > WARD.HEAL_AFTER) {
                const was = Math.floor(w.hp / 10);
                w.hp = Math.min(mx, w.hp + WARD.HEAL_RATE * dt);
                if (Math.floor(w.hp / 10) !== was || w.hp >= mx) any = true;
            }
            // (nobody fed it for a moment: the beam is not drawn any more)
            if (w.feedKey && this._t - (w.feedAt ?? -1e9) > 1.5) { w.feedKey = ''; any = true; }
        }
        if (any) this._changed();
    }

    dispose() {
        if (this._humOn) { this.game.sound?.wardHum?.(null, 0); this._humOn = false; }
        for (const B of this.bolts) if (B.mesh) this.game.scene?.remove(B.mesh);
        this.bolts = [];
        for (const B of this._beamMap?.values() || []) this.game.scene?.remove(B.group);
        this._beamMap?.clear();
        for (const id of [...this.list.keys()]) this._remove(id);
        WARD_HIDE.n.value = 0;
        for (const [o, vis] of this._hidden) o.visible = vis;
        this._hidden.clear();
    }
}
