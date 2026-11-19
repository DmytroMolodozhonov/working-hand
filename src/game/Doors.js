/**
 * Doors.js — «Create a Door», «Stand», opening by the handle.
 *
 * Hold wood in the hand (at least 12 — a tree gives 20) and say «Create a
 * Door»: the little block turns into a small door in your hand. Move the
 * hand away from you — the door grows; point at the place on the ground and
 * say «Stand»: it stands there, facing you (12 wood is used).
 *
 * A door opens like a real one (CLAUDE.md: hands, not animations): put the hand
 * on the handle and close the fingers — the hand holds it; push or pull — the
 * leaf swings with the hand round its hinges, stops at the frame and when it
 * is wide open; open the fingers — it stays where it is. A free hand never goes
 * through a leaf: pressed against it, it pushes the leaf (or, at the frame,
 * the leaf holds). A closed door can't be walked through.
 *
 * A locked door (a villager's house at night / with nobody home, the gates of a
 * throne room — src/game/Alohomora.js) doesn't give: the handle held, the leaf
 * only rattles in its frame. «Алохомора» unlocks it and it opens a crack; the
 * hand opens it the rest of the way.
 *
 * «Вингардиум Левиоса» pointed at a door lifts it: carry it and say the
 * words again to put it down somewhere else.
 *
 * A push of air or of a spell swings a leaf like a real one (blow / impulse): the push
 * across the leaf turns it round its hinges — the stronger, the faster — and the hinges'
 * friction slows it; it stops on the frame (a slam) and on its full opening (it bounces
 * back a little), and on a body standing in its way (the leaf doesn't go through anybody).
 * A leaf swings BOTH ways (a > 0: towards the door's local −Z, a < 0: towards +Z), each side
 * with its own stop (openLimit: a wall, a bed, a chest on that side), and a latch at 0 that
 * catches it coming shut from either side (a fast one slams — it never shoots through).
 * Which way it goes is where the push comes from: away from the push, whichever face it hits. «Вайнд» / «… Максима», «Overgrown» / «… Максима», a «Джолт» charge
 * (it bursts on the leaf), a blast's wave; any new pushing spell calls blow() / impulse().
 * Every door: the houses', the wizards' towers', the throne rooms' gates, «Create a Door»'s
 * (a ship's bulkheads too — two leaves in each doorway, moving with the ship: Ships._makeDoors). A LOCKED door only rattles in its frame: the lock
 * holds against any push (the spells shove, they don't pick locks — «Алохомора» does; a
 * «Бомбардо» at it breaks the door itself, Wreck.js). Every computer swings it the same;
 * the host tells where it came to rest.
 *
 * Doors are saved with the world and shared with the other players.
 */

import * as THREE from 'three';
import { isWood, TREE_KINDS } from '../world/Terrain.js';
import { mergeParts } from '../core/MergeGeometry.js';
import { forgedGateModel, GATE_VARIANTS } from './GateModel.js';
import { inWard } from './HouseWards.js';
import { STYLES, styleOf, leafMaterials, damageDecals, hurtShare, chipSpot, splinterColors } from './DoorStyles.js';

const WOOD_NEEDED = 12;
const W = 1.6, H = 3.6, T = 0.18; // a full-size door
const DOOR_W = W, DOOR_H = H;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _l = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function woodColor(block) {
    const k = TREE_KINDS.findIndex((t) => t.wood === block);
    return [0x8b5a2b, 0xd9cfb5, 0x5a3a1e, 0x8a3f38, 0x3e2716][Math.max(0, k)];
}

const _mats = new Map(); // colour -> materials (shared by all doors of that wood)
function doorMats(color) {
    let m = _mats.get(color);
    if (!m) {
        m = {
            wood: new THREE.MeshLambertMaterial({ color }),
            dark: new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.65) }),
            gold: _mats.gold || (_mats.gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.3 })),
        };
        _mats.set(color, m);
    }
    return m;
}

/**
 * A door: the frame and a leaf turning round its hinge. `mirror`: the hinge on the right
 * (the right leaf of a gate); `gate`: a leaf of a castle gate — planks with iron bands,
 * a ring for a handle, no frame of its own (the stone doorway is its frame).
 * Both kinds swing both ways: a positive angle towards their local −Z, a negative one towards +Z.
 */
/** (the unit box every door's pieces are made of, scaled; the knob's shapes — shared, never disposed) */
const _box = new THREE.BoxGeometry(1, 1, 1);
const _knobGeo = {};

export function doorModel(color, { mirror = false, gate = false, ice = false, metal = false, forged = false, vari = 0, style = null, w: W = DOOR_W, h: H = DOOR_H } = {}) {
    if (forged) return forgedGateModel({ mirror, w: W, h: H, vari }); // (the keep's gates of generation 14: forged iron — GateModel.js)
    const g = new THREE.Group();
    let { wood, dark, gold } = doorMats(color);
    // a door of iron («Create a Castle»'s doors — CastleMagic.js): a steel leaf and frame, iron bands
    if (metal) {
        wood = _mats.steel || (_mats.steel = new THREE.MeshStandardMaterial({ color: 0x6a6f78, metalness: 0.8, roughness: 0.38 }));
        dark = _mats.steelDark || (_mats.steelDark = new THREE.MeshStandardMaterial({ color: 0x3c3f46, metalness: 0.75, roughness: 0.5 }));
    }
    // the Ice Castle's gates (IceQueen.js): clear glowing ice with a frost snowflake on each leaf
    if (ice) {
        wood = _mats.ice || (_mats.ice = new THREE.MeshLambertMaterial({ color: 0xcdeffd, transparent: true, opacity: 0.78, emissive: 0x24597a }));
        gold = _mats.frost || (_mats.frost = new THREE.MeshBasicMaterial({ color: 0xe8fbff }));
    }
    const m = mirror ? -1 : 1;
    // (the pieces of one material are one shape — one draw: a village's twenty doors drew ~200 pieces)
    const box = (w, h, d, x, y, z, rz = 0) => ({ geo: _box, pos: [x, y, z], rot: [0, 0, rz], scale: [w, h, d] });
    const mesh = (parts, mat, parent, shadow = false) => {
        const o = new THREE.Mesh(mergeParts(parts), mat);
        o.castShadow = shadow;
        parent.add(o);
        return o;
    };
    // frame (its inner faces a hair inside the opening: a house door is scaled to fill its doorway
    // exactly, and faces flush with the stone of the doorway flickered through it)
    if (!gate) mesh([[0.17, H + 0.17, -W / 2 - 0.075, H / 2 + 0.005], [0.17, H + 0.17, W / 2 + 0.075, H / 2 + 0.005], [W + 0.32, 0.17, 0, H + 0.075]]
        .map(([w, h, x, y]) => box(w, h, T + 0.08, x, y, 0)), dark, g, true);
    // the leaf turns around its hinge (the left edge; a mirrored one: the right)
    const hinge = new THREE.Group();
    hinge.position.set(-m * W / 2, 0, 0);
    g.add(hinge);
    const plain = !gate && !metal && !ice, st = plain ? (STYLES[style] ? style : 'common') : null; // (the plain wooden door has a style of its own: DoorStyles.js)
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), plain ? leafMaterials(st, color) : wood);
    leaf.position.set(m * W / 2, H / 2, 0);
    leaf.castShadow = true;
    hinge.add(leaf);
    const iron = () => _mats.iron || (_mats.iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, metalness: 0.7, roughness: 0.5 }));
    if (ice) {
        // a snowflake of frost on both faces, and a frost rim
        const frost = [];
        for (const z of [-T / 2 - 0.02, T / 2 + 0.02]) {
            for (let k = 0; k < 3; k++) frost.push(box(W * 0.7, 0.06, 0.03, m * W / 2, H * 0.55, z, (k / 3) * Math.PI + Math.PI / 2));
            frost.push(box(W * 0.94, 0.07, 0.03, m * W / 2, H * 0.97, z));
        }
        mesh(frost, gold, hinge);
    } else if (gate || metal) {
        // iron bands across both faces
        const bands = [];
        for (const y of [H * 0.15, H * 0.5, H * 0.85]) for (const z of [-T / 2 - 0.02, T / 2 + 0.02]) bands.push(box(W * 0.96, 0.12, 0.04, m * W / 2, y, z));
        mesh(bands, iron(), hinge);
    } else {
        // (the picture on the leaf has its boards / panels / bands: what stands out of it is the hinges, and below the handle)
        const ironM = iron(), brass = _mats.brass || (_mats.brass = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.85, roughness: 0.32 }));
        const straps = [], plates = [];
        const long = st === 'banded' ? 0.95 : st === 'poor' ? 0.8 : 0.42;
        for (const y of [H * 0.18, H * 0.82]) for (const z of [-T / 2 - 0.016, T / 2 + 0.016]) {
            straps.push(box(long, st === 'rich' ? 0.07 : 0.11, 0.03, m * (long / 2 + 0.02), y, z));
            if (st !== 'rich') plates.push(box(0.05, 0.05, 0.045, m * (long * 0.4), y, z * 1.4));
        }
        mesh(straps, st === 'rich' ? brass : ironM, hinge);
        if (plates.length) mesh(plates, ironM, hinge);
    }
    // the handles (both faces): a golden knob, on a gate — an iron ring (the two: one shape; knob, knob2 — where they are)
    const kx = m * (W - 0.22), ky = H * 0.48, kz = T / 2 + 0.08;
    if (plain) {
        // the handle of the style, on both faces (the hand takes it at knob / knob2 — the same points as always)
        const ironM = iron(), brass = _mats.brass || (_mats.brass = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.85, roughness: 0.32 }));
        const leather = _mats.leather || (_mats.leather = new THREE.MeshLambertMaterial({ color: 0x4a2f1a }));
        const ring = _knobGeo.ring || (_knobGeo.ring = new THREE.TorusGeometry(0.11, 0.025, 6, 14));
        const bigRing = _knobGeo.bigRing || (_knobGeo.bigRing = new THREE.TorusGeometry(0.16, 0.032, 6, 16));
        const metalP = [], woodP = [], leatherP = [];
        for (const z of [-1, 1]) {
            const zf = z * (T / 2);
            if (st === 'poor') { woodP.push(box(0.36, 0.055, 0.045, kx - m * 0.04, ky, zf + z * 0.045)); woodP.push(box(0.05, 0.13, 0.05, kx + m * 0.12, ky - 0.04, zf + z * 0.03)); leatherP.push({ geo: ring, pos: [kx - m * 0.18, ky - 0.05, zf + z * 0.04], scale: [0.45, 0.45, 0.45] }); }
            else if (st === 'common') { metalP.push(box(0.15, 0.22, 0.02, kx, ky, zf + z * 0.012)); metalP.push({ geo: ring, pos: [kx, ky - 0.02, zf + z * 0.07] }); }
            else if (st === 'rich') { metalP.push(box(0.15, 0.42, 0.018, kx, ky, zf + z * 0.01)); metalP.push(box(0.3, 0.045, 0.045, kx - m * 0.1, ky - 0.04, zf + z * 0.06)); metalP.push({ geo: _knobGeo.ball || (_knobGeo.ball = new THREE.SphereGeometry(0.09, 10, 8)), pos: [kx + m * 0.04, ky + 0.12, zf + z * 0.05], scale: [0.55, 0.55, 0.55] }); }
            else { metalP.push({ geo: bigRing, pos: [kx, ky, zf + z * 0.075] }); metalP.push(box(0.12, 0.12, 0.02, kx, ky + 0.15, zf + z * 0.012)); }
        }
        if (metalP.length) mesh(metalP, st === 'rich' ? brass : ironM, hinge);
        if (woodP.length) mesh(woodP, dark, hinge);
        if (leatherP.length) mesh(leatherP, leather, hinge);
        // THE LATCH: a barrel bolt over the handle on both faces — drawn back: shut, not locked (green lamp); shot across: LOCKED (red lamp)
        const by = ky + 0.42, x0 = m * (W - 0.58), trav = m * 0.24;
        const bolts = [], dots = [], fixed = [];
        const boltGeo = _knobGeo.bolt || (_knobGeo.bolt = new THREE.BoxGeometry(0.36, 0.055, 0.055));
        const lampGeo = _knobGeo.lamp || (_knobGeo.lamp = new THREE.SphereGeometry(0.068, 10, 8));
        const green = _mats.lampG || (_mats.lampG = new THREE.MeshBasicMaterial({ color: 0x46d86a })), red = _mats.lampR || (_mats.lampR = new THREE.MeshBasicMaterial({ color: 0xe2382c }));
        const steelRod = _mats.rod || (_mats.rod = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, metalness: 0.9, roughness: 0.25 }));
        for (const z of [-1, 1]) {
            const zf = z * (T / 2);
            fixed.push(box(0.54, 0.13, 0.012, x0 + m * 0.2, by, zf + z * 0.006)); // the base plate
            fixed.push(box(0.05, 0.1, 0.07, x0 + m * 0.02, by, zf + z * 0.035), box(0.05, 0.1, 0.07, x0 + m * 0.4, by, zf + z * 0.035)); // the guides
            fixed.push(box(0.07, 0.12, 0.05, m * (W - 0.035), by, zf + z * 0.02)); // the keeper on the free edge
            const rod = new THREE.Mesh(boltGeo, steelRod); rod.position.set(x0 + m * 0.19, by, zf + z * 0.04); hinge.add(rod); bolts.push(rod);
            const dot = new THREE.Mesh(lampGeo, green); dot.position.set(m * (W - 0.4), by + 0.19, zf + z * 0.04); hinge.add(dot); dots.push(dot);
        }
        mesh(fixed, brass, hinge);
        g.userData.lock = { bolts, dots, base: bolts.map((b) => b.position.x), trav, cur: 0, to: 0, green, red, locked: false };
    } else {
    const kgeo = gate ? (_knobGeo.ring || (_knobGeo.ring = new THREE.TorusGeometry(0.11, 0.025, 6, 14))) : (_knobGeo.ball || (_knobGeo.ball = new THREE.SphereGeometry(0.09, 10, 8)));
    mesh([{ geo: kgeo, pos: [kx, ky, -kz] }, { geo: kgeo, pos: [kx, ky, kz] }], gate ? (ice ? gold : iron()) : gold, hinge);
    }
    const knob = new THREE.Object3D();
    knob.position.set(kx, ky, -kz);
    hinge.add(knob);
    const knob2 = new THREE.Object3D();
    knob2.position.set(kx, ky, kz);
    hinge.add(knob2);
    g.userData = { ...g.userData, hinge, knob, knob2, mirror, style: st, hurtable: plain };
    return g;
}

/** Door hands: how near the fingers must be to the handle, how much they must close / open (as the helm). */
export const DOOR_HAND = { GRAB_R: 0.42, CLOSE_CURL: 0.55, OPEN_CURL: 0.35, RELEASE_CURL: 0.28, RELEASE_MS: 160, CLOSE_WINDOW_MS: 900, SLIP: 0.75, MAX_A: 1.75, LEAF_PAD: 0.3 };

/**
 * The angle of a point round a door's hinge (door-local, the hinge at the origin): 0 = along the
 * closed leaf, positive round to local −Z, negative round to local +Z (the leaf swings both ways).
 */
export function hingeAngle(lx, lz, mirror = false) {
    return Math.atan2(-lz, mirror ? -lx : lx);
}

/**
 * A free hand against a leaf: it can't pass through it. `was` — the side of the leaf the hand was on
 * (+1: the side of growing angles, −1: the other), `h` — the hand's angle round the hinge now,
 * `a` — the leaf's angle. Returns the leaf's new angle (pushed away from the hand, either way; held
 * by the stops on each side — maxP / maxN — and caught by the latch when it comes shut) — or null
 * when the hand didn't cross it.
 */
export function leafPushed(was, h, a, maxP = DOOR_HAND.MAX_A, maxN = maxP) {
    if (!((was > 0 && h < a) || (was < 0 && h > a))) return null;
    if (a !== 0 && Math.sign(h) !== Math.sign(a)) return 0; // (pushed shut: the latch catches it — a push more opens it the other way)
    return Math.max(-maxN, Math.min(maxP, h));
}

/** A push swinging a leaf: Δω = K · (push across the leaf, m/s) / leaf width; the hinges' friction. */
export const DOOR_PUSH = {
    K: 0.55,
    DAMP: 1.6, // 1/s: the hinges' viscous friction
    DRY: 0.6, // rad/s²: their dry friction (a slow leaf stops)
    BOUNCE_OPEN: 0.3, // … off its full opening (the stop, either side)
    SLAM: 1.2, // rad/s: shut faster than this — a slam
    REST: 0.05, // rad/s: slower — it stands
    RATTLE: 0.35, // rad/s: a push this strong on a locked door rattles it
    REACH: 40, // m: doors further than this from a push are not looked at
    GUST_MIN: 0.3, // rad/s: a gust at least this strong (a real push, not a breath) opens the leaf all the way …
    GUST_SPIN: 2.3, // … it takes the leaf from the gust with at least this speed (it then swings ~70°, no less)
    AJAR: 0.5, // rad: a gusted leaf that comes to rest narrower than this falls back shut — it never stands ajar in the way
};
/** How hard each pushing spell blows on a leaf (m/s across it, before falling off with distance). */
export const DOOR_SPELLS = { Wind: 13, WindMaxima: 39, Overgrown: 16, OvergrownMaxima: 32, Jolt: 20, JoltMaxima: 60 };

/**
 * A body walking into a shut, unlocked door opens it (as one pushes a door in life — no handle, no «Алохомора»).
 * Numbers: the hero is ~3.5 m, a door 3×6 (W/H here are the old 1.6×3.6 of a made door; a house's own is its `w`).
 */
export const DOOR_WALK = {
    NEAR: 4.5, // m (|dx|+|dz|): only doors this close are looked at (the rest cost nothing)
    REACH: 0.95, // m: from the leaf's plane — the body is stopped by the door's box at ~0.55, so «against the door» is within this
    SIDE: 0.12, // m: past the jamb a body still counts as at the door
    FACE: 0.6, // cos: the body faces the leaf within ~53° of its normal (sideways / backing — no)
    HOLD: 0.18, // s: pressed against it this long (a brush does not open it)
    SPEED: 2.4, // rad/s: how fast the pushed leaf swings away
    OPEN_TO: 1.25, // rad: it is pushed open this far (the body then goes through; _bodiesPush keeps it off the body)
    CLOSE_AFTER: 4, // s: nobody in the doorway for this long — it swings shut by itself
    CLOSE_SPEED: 1.5, // rad/s
    CLEAR: 1.2, // m: «in the doorway» for the closing (beyond the jamb + this)
};

/**
 * Does a body push this door open (pure)? (lx, lz): the body in the door's frame (centre of the leaf at the origin, x along it,
 * z through it); (fx, fz): its facing in that frame (unit); walking: the legs go. Returns the sign of the angle the leaf swings
 * to — AWAY from the body (+1: the body at +Z, the leaf goes to −Z) — or 0.
 */
export function walkOpenSign(lx, lz, fx, fz, walking, lw) {
    if (!walking) return 0;
    if (Math.abs(lx) > lw / 2 + DOOR_WALK.SIDE || Math.abs(lz) > DOOR_WALK.REACH) return 0;
    const sg = lz >= 0 ? 1 : -1;
    if (-sg * fz < DOOR_WALK.FACE) return 0; // (the face is not turned to the leaf: sideways, or a back to it)
    return sg;
}

/**
 * The swing of a leaf over dt (pure): angle a, angular speed w → {a, w, hit} (hit: 'frame' when the
 * latch caught it shut, 'slam' — shut hard, 'open' at a full opening). It swings both ways: maxP — its
 * stop on the positive side, maxN — on the negative. Coming shut from either side the latch catches it
 * at 0 (a fast one slams: it never shoots through the frame); from 0 a push swings it either way.
 * Friction: viscous and dry.
 */
export function swingStep(a, w, dt, maxP = DOOR_HAND.MAX_A, maxN = maxP) {
    let hit = null;
    const a0 = a;
    a += w * dt;
    w *= Math.exp(-DOOR_PUSH.DAMP * dt);
    const dry = DOOR_PUSH.DRY * dt;
    w = Math.abs(w) <= dry ? 0 : w - Math.sign(w) * dry;
    if (a0 !== 0 && (a === 0 || Math.sign(a) !== Math.sign(a0))) { hit = Math.abs(w) > DOOR_PUSH.SLAM ? 'slam' : 'frame'; a = 0; w = 0; } // (shut: the latch catches it)
    else if (a >= maxP) { hit = 'open'; a = maxP; w = w > 0 ? -w * DOOR_PUSH.BOUNCE_OPEN : w; }
    else if (a <= -maxN) { hit = 'open'; a = -maxN; w = w < 0 ? -w * DOOR_PUSH.BOUNCE_OPEN : w; }
    if (Math.abs(w) < DOOR_PUSH.REST && (a === 0 || hit || Math.abs(w) < DOOR_PUSH.REST * 0.5)) w = 0;
    return { a, w, hit };
}

const _q = new THREE.Vector3();
const _n = new THREE.Vector3();
let _planeGeo = null;

export class Doors {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> door
        this.making = null; // {model, color, block, scale}
        this.held = { left: null, right: null }; // the door whose handle each hand holds
        this._open = { left: 0, right: 0 }; // when the fingers were last open
        this._relT = { left: 0, right: 0 };
        this._pf = { left: null, right: null };
        this.input = null; // (tests) side → {G: world point, curl}: instead of the tracked hands
    }

    // ---------------------------------------------------------- making
    /** «Create a Door» (hint string when it can't be done). */
    create() {
        const g = this.game;
        let s = g.inventory.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
        if ((!s || !isWood(s.block)) && g.inventory.free) s = g.inventory.endlessWood(); // (creative: no wood needed)
        if (!s || !isWood(s.block)) return '🚪 Возьмите в руку дерево (выберите ячейку с древесиной — левый карман)';
        if (s.count < WOOD_NEEDED) return `🚪 Нужно ${WOOD_NEEDED} дерева, а у вас ${s.count}`;
        if (this.making) return null;
        const model = doorModel(woodColor(s.block));
        g.scene.add(model);
        this.making = { model, color: woodColor(s.block), block: s.block, stack: s, scale: 0.12, at: new THREE.Vector3(), ok: false };
        g.hud.setVoice('🚪 Отводите руку от себя — дверь растёт. Покажите место и скажите «Stand»', true);
        return null;
    }

    /** «Stand»: the door stands where the hand points. */
    stand() {
        const g = this.game;
        // a levitated door: put it down here
        if (this.carried) { this._putDown(); return true; }
        const m = this.making;
        if (!m) return false;
        if (!m.ok) { g.hud.setVoice('🚪 Покажите рукой на землю рядом (до 8 м)', true); return true; }
        if (g.ships?.footprintAt(m.at.x, m.at.y + 0.5, m.at.z)) { g.hud.setVoice('⚓ На корабле дверь не поставить', true); this._cancel(); return true; }
        if (!g.inventory.take(m.stack, WOOD_NEEDED)) { g.hud.setVoice('🚪 Не хватает дерева', true); return true; }
        const yaw = g.character.group.rotation.y;
        const id = 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
        this._place({ id, x: m.at.x, y: m.at.y, z: m.at.z, ry: yaw, color: m.color, a: 0 });
        g.sync?.door?.({ id, x: m.at.x, y: m.at.y, z: m.at.z, ry: yaw, color: m.color, a: 0 });
        this._cancel();
        g.hud.setVoice('🚪 Дверь стоит! Возьмитесь за ручку, чтобы открыть', true);
        return true;
    }

    _cancel() {
        if (!this.making) return;
        this.game.scene.remove(this.making.model);
        this.making = null;
    }

    _place(d) {
        const g = this.game;
        if (this.list.has(d.id)) { this._move(this.list.get(d.id), d); return; }
        // (a house door fills its opening: wider and taller than a made one — made to its size, not
        // stretched: a stretched model shears its leaf out of shape when it turns)
        const model = doorModel(d.color, { mirror: !!d.mirror, gate: !!d.gate || !!d.banded, ice: !!d.ice, metal: !!d.metal, forged: !!d.forged, vari: d.vari | 0, style: d.gate || d.banded || d.metal || d.ice || d.forged || d.ship ? null : styleOf(d), w: d.w || W, h: d.h || H }); // (banded: a gate's look without a castle's lock — CastleMagic.js)
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry;
        g.scene.add(model);
        const door = { ...d, model, boxId: null, holdSide: null, hand: { left: 0, right: 0 } };
        if (model.userData.hurtable) { // (a plain wooden door can be broken: its style's strength, the chunks already knocked out of it)
            door.style = model.userData.style; door.maxHp = STYLES[door.style].hp;
            door.hp = d.hp != null ? d.hp : door.maxHp; door.holes = Array.isArray(d.holes) ? d.holes.slice() : [];
            for (const h of door.holes) this._hole(door, h, false);
            this._cracks(door);
        }
        this.list.set(d.id, door);
        this._setAngle(door, d.a || 0);
    }

    _move(door, d) {
        door.x = d.x; door.y = d.y; door.z = d.z; door.ry = d.ry;
        door.model.position.set(d.x, d.y, d.z);
        door.model.rotation.y = d.ry;
        this._setAngle(door, door.a || 0);
    }

    /** Swing the leaf (either way); a closed door blocks the way. */
    _setAngle(door, a) {
        if (a > 0.15) a = Math.min(a, this.openLimit(door, 1)); // (a wall, a bed, a chest on that side: the leaf stops on it)
        else if (a < -0.15) a = Math.max(a, -this.openLimit(door, -1));
        door.a = Math.max(-DOOR_HAND.MAX_A, Math.min(DOOR_HAND.MAX_A, a)) || 0;
        door.model.userData.hinge.rotation.y = door.mirror ? -door.a : door.a;
        const g = this.game;
        // a ship's door (Ships.js): shut, it is one of its ship's own solids (it moves with the ship) — no box in the world
        if (door.ship) { const shut = Math.abs(door.a) < 0.35; if (shut !== door.shut) { door.shut = shut; g.ships?.applySolids?.(door.ship); } return; }
        if (door.boxId != null) { g.collision.removeBox(door.boxId); door.boxId = null; }
        if (Math.abs(door.a) < 0.35 && !door.lifted) {
            // the box of the closed door (in world space, axis-aligned around it)
            const c = Math.cos(door.ry), s = Math.sin(door.ry);
            const dw = door.w || W;
            const hw = dw / 2 * Math.abs(c) + T / 2 * Math.abs(s) + 0.05, hd = dw / 2 * Math.abs(s) + T / 2 * Math.abs(c) + 0.05;
            door.boxId = g.collision.addBox({ minX: door.x - hw, maxX: door.x + hw, minY: door.y, maxY: door.y + (door.h || H), minZ: door.z - hd, maxZ: door.z + hd, kind: 'door' });
        }
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        const g = this.game;
        const ch = g.character;
        const m = this.making;
        if (m) {
            if (!g.inventory.inHand || g.inventory.inHand.stack !== m.stack) { this._cancel(); }
            else {
                // grows as the hand goes away from the shoulder
                const side = 'right';
                const hand = ch.getHandWorldPosition(side, _v);
                const shoulder = ch.rightArmAnchor.getWorldPosition(_v2);
                const reach = hand.distanceTo(shoulder);
                m.scale += (Math.max(0.12, Math.min(1, (reach - 0.6) / 1.2)) - m.scale) * Math.min(1, dt * 4);
                // where it would stand: where the hand points at the ground
                const dir = ch.getHandDirection(side, new THREE.Vector3());
                m.ok = false;
                for (let k = 1; k < 8; k += 0.25) {
                    const p = _v2.copy(hand).addScaledVector(dir, k);
                    const gy = g.collision.groundY(p.x, p.z);
                    if (p.y <= gy + 0.1) { m.at.set(p.x, gy, p.z); m.ok = true; break; }
                }
                if (m.ok && m.scale > 0.85) {
                    m.model.position.copy(m.at);
                    m.model.rotation.y = ch.group.rotation.y;
                    m.model.scale.setScalar(1);
                    m.model.traverse((o) => { if (o.isMesh) { o.material.transparent = true; o.material.opacity = 0.6; } });
                } else {
                    m.model.position.copy(hand).add(_v2.set(0, 0.1, 0));
                    m.model.rotation.y = ch.group.rotation.y;
                    m.model.scale.setScalar(m.scale * 0.35);
                    m.model.traverse((o) => { if (o.isMesh) o.material.opacity = 1; });
                }
            }
        }
        this._lockVis(dt);
        // leaves swung by a push (a spell, a blast)
        this._swing(dt);
        // a body walking into an open leaf pushes it away from itself (it doesn't go through)
        this._bodiesPush();
        // a shut, unlocked door that I walk into opens (and shuts again by itself when nobody is in it)
        this._walkOpen(dt);
        // the hands on the doors: the handle held by closed fingers, a free hand against a leaf
        if (g.currentPose && !g.isDeadLocal) this._hands(dt);
        else this.releaseAll();
        // a levitated door follows the hand
        if (this.carried) {
            const c = this.carried;
            const side = c.side;
            const hand = ch.getHandWorldPosition(side, _v);
            const dir = ch.getHandDirection(side, _v2);
            const at = hand.clone().addScaledVector(dir, 4);
            c.door.x += (at.x - c.door.x) * Math.min(1, dt * 3);
            c.door.z += (at.z - c.door.z) * Math.min(1, dt * 3);
            c.door.y += (Math.max(at.y - 1, g.collision.groundY(c.door.x, c.door.z) + 0.5) - c.door.y) * Math.min(1, dt * 3);
            c.door.ry = ch.group.rotation.y;
            c.door.model.position.set(c.door.x, c.door.y, c.door.z);
            c.door.model.rotation.y = c.door.ry;
            if (Math.random() < 0.5) g.fx.spark(_v.set(c.door.x, c.door.y + 1.8, c.door.z), 0xc9a8ff, 0.08, _v2.set(0, 0.6, 0), 0.6);
        }
    }

    /** Is this hand free to take a handle (nothing in it)? */
    _free(side) {
        const g = this.game;
        return !g.items?.held?.[side] && !g.weapons?.hands?.[side]?.held && !g.books?.reading?.handBusy?.(side);
    }

    /** The grip point of a hand (in the closed fingers) and how closed they are. */
    _hand(side) {
        const g = this.game, ch = g.character;
        if (this.input) return this.input(side); // (tests)
        const G = g.weapons?.palmFrame ? g.weapons.palmFrame(side, this._pf[side] || (this._pf[side] = {})).G : ch.getHandWorldPosition(side, new THREE.Vector3());
        return { G, curl: ch.getGripCurl ? ch.getGripCurl(side) : 1 };
    }

    /** A point in the door's own frame, from its hinge (x along the closed leaf, z its normal). */
    _local(door, p, out) {
        const hp = door.model.userData.hinge.getWorldPosition(_v2);
        return out.copy(p).sub(hp).applyAxisAngle(UP, -door.ry);
    }

    _hands(dt) {
        const g = this.game;
        const me = g.character.group.position;
        const now = performance.now();
        const locked = (d) => !!g.locks?.doorLocked?.(d);
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            if (!h?.G) continue;
            if (h.curl < DOOR_HAND.OPEN_CURL) this._open[side] = now;
            const held = this.held[side];
            if (held) {
                const door = held;
                if (!this.list.has(door.id) || door.lifted) { this.release(side); continue; }
                // let go: the fingers open (for a moment) or the hand is pulled off the handle
                if (h.curl < DOOR_HAND.RELEASE_CURL) this._relT[side] += dt * 1000; else this._relT[side] = 0;
                const L = this._local(door, h.G, _l);
                const r = Math.hypot(L.x, L.z), lw = door.w || W;
                if (this._relT[side] > DOOR_HAND.RELEASE_MS || r > lw + DOOR_HAND.SLIP || r < lw * 0.35) { this.release(side); continue; }
                const want = Math.max(-this.openLimit(door, -1), Math.min(this.openLimit(door, 1), hingeAngle(L.x, L.z, door.mirror))); // (pull or push it: either way)
                if (locked(door)) {
                    // the handle doesn't give: the leaf only rattles in its frame
                    if (Math.abs(want - door.a) > 0.06) this._rattle(door);
                    if (Math.abs(want - door.a) > 0.5) this.release(side); // (pulled away hard: the hand slips off)
                    continue;
                }
                this._setAngle(door, door.a + (want - door.a) * Math.min(1, dt * 14));
                if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
                continue;
            }
            for (const door of this.list.values()) {
                if (door.lifted || (Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 9)) continue;
                if (door.holdSide && door.holdSide !== side) continue;
                const L = this._local(door, h.G, _l);
                const lw = door.w || W, dh = door.h || H;
                const r = Math.hypot(L.x, L.z), ha = hingeAngle(L.x, L.z, door.mirror);
                const inSpan = r > 0.15 && r < lw + 0.1 && L.y > 0 && L.y < dh;
                // take the handle: a free hand at a knob closes its fingers (having been open a moment ago)
                if (this._free(side) && h.curl >= DOOR_HAND.CLOSE_CURL && now - this._open[side] < DOOR_HAND.CLOSE_WINDOW_MS) {
                    const k1 = door.model.userData.knob.getWorldPosition(_v);
                    let near = h.G.distanceTo(k1);
                    near = Math.min(near, h.G.distanceTo(door.model.userData.knob2.getWorldPosition(_v)));
                    if (near < DOOR_HAND.GRAB_R) { this.grab(door, side); break; }
                }
                // a free hand against the leaf: it can't go through — it pushes it (the frame and the wall stop it)
                const across = r * Math.sin(ha - door.a); // (the hand's distance from the leaf's plane, signed)
                if (!inSpan || Math.abs(across) > DOOR_HAND.LEAF_PAD) { door.hand[side] = 0; continue; }
                const was = door.hand[side];
                door.hand[side] = Math.sign(across) || was;
                if (!was) continue;
                const to = leafPushed(was, ha, door.a, this.openLimit(door, 1), this.openLimit(door, -1));
                if (to == null) continue;
                if (locked(door)) { this._rattle(door); door.hand[side] = was; continue; } // (it holds: the hand stays on its side)
                if (to === 0 && door.a !== 0) this._ring(door, 0.08); // (the latch clicks)
                this._setAngle(door, to);
                door.hand[side] = was;
                if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
            }
        }
        // a rattling leaf shakes a little in its frame
        for (const door of this.list.values()) {
            if (!(door.shakeT > 0)) continue;
            door.shakeT -= dt;
            const j = door.shakeT > 0 ? Math.sin(now * 0.09) * 0.025 : 0;
            door.model.userData.hinge.rotation.y = (door.mirror ? -1 : 1) * (door.a + Math.abs(j) * (door.a < 0 ? -1 : 1));
        }
    }

    /**
     * How far this leaf can open to one side (dir +1: towards local −Z, −1: towards +Z) before it
     * meets something there (a wall, furniture, a chest, a bed — never goes through them). Looked at
     * again every couple of seconds (a blast, a bed moved).
     */
    openLimit(door, dir = 1) {
        const now = this.game.now?.() ?? performance.now();
        const key = dir < 0 ? '_limAtN' : '_limAt';
        if (door[key] != null && now - door[key] < 2000) return dir < 0 ? door.maxN : door.maxA;
        door[key] = now;
        const g = this.game, col = g.collision, t = g.world?.terrain?.data || g.terrain?.data;
        const m = door.mirror ? -1 : 1, lw = door.w || W, dh = door.h || H;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        // (the leaf swings out of its own doorway: a point still inside the wall's thickness (|lz| < 0.7) or in the jamb is the frame, not an obstacle — a rounded block edge there made
        //  the door «stick» at 9° — and a leaf stopped by a real thing keeps at least ~15°)
        const blocked = (x, y, z, inWall = false) => {
            if (!inWall && t?.isSolidAt?.(x, y, z)) return true;
            for (const b of col?.queryBoxes?.(x, x, z, z) || []) if (b.kind !== 'door' && y >= b.minY && y <= b.maxY && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
            return false;
        };
        let lim = DOOR_HAND.MAX_A;
        outer: for (let a = 0.2; a <= DOOR_HAND.MAX_A + 1e-6; a += 0.05) {
            for (const r of [lw * 0.35, lw * 0.7, lw - 0.1]) {
                const lx = -m * lw / 2 + m * Math.cos(a) * r, lz = -dir * Math.sin(a) * r;
                const x = door.x + c * lx + s * lz, z = door.z - s * lx + c * lz;
                for (const y of [door.y + 0.7, door.y + dh * 0.55]) if (blocked(x, y, z, Math.abs(lz) < 0.7)) { lim = Math.max(0.25, a - 0.08); break outer; }
            }
        }
        if (dir < 0) door.maxN = lim; else door.maxA = lim;
        return lim;
    }

    // ------------------------------------------------------------ pushes
    /** The leaf's hinge (world) and the leaf's own frame for a point: {x along the leaf, y up, z across (+: the opening side)}. */
    _leafLocal(door, p, out) {
        const m = door.mirror ? -1 : 1, lw = door.w || W;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        // the hinge: (-m·lw/2, 0, 0) of the door, turned by ry
        const hx = door.x + c * (-m * lw / 2), hz = door.z - s * (-m * lw / 2);
        // into the door's frame (un-turn ry), then the leaf's (un-turn its angle m·a)
        const dx = p.x - hx, dz = p.z - hz;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        const t = m * door.a, ct = Math.cos(t), st = Math.sin(t);
        const qx = ct * lx - st * lz, qz = st * lx + ct * lz;
        return out.set(m * qx, p.y - door.y, -qz);
    }

    /** The leaf's normal towards its opening side (world), and its middle. */
    _leafNormal(door, out) {
        const m = door.mirror ? -1 : 1;
        // door frame: (-m sin a, 0, -cos a); turned by ry
        const nx = -m * Math.sin(door.a), nz = -Math.cos(door.a);
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        return out.set(c * nx + s * nz, 0, -s * nx + c * nz);
    }

    _leafMiddle(door, out) {
        const m = door.mirror ? -1 : 1, lw = door.w || W, dh = door.h || H;
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        // in the door's frame: the hinge plus half the leaf along (m cos a, -sin a)
        const lx = -m * lw / 2 + m * Math.cos(door.a) * lw / 2, lz = -Math.sin(door.a) * lw / 2;
        return out.set(door.x + c * lx + s * lz, door.y + dh / 2, door.z - s * lx + c * lz);
    }

    /**
     * A push on a leaf: `v` (m/s, world) — air or a spell moving across it, `k` (0..1) where along the
     * leaf from the hinge it pushes (the middle by default: the lever). A locked one only rattles.
     */
    impulse(door, v, k = 0.5) {
        if (!door || door.lifted || door.holdSide || this.carried?.door === door) return false;
        // the leaf goes away from the push, whichever face it hits (it swings both ways; shut, the latch catches it)
        const dw = DOOR_PUSH.K * v.dot(this._leafNormal(door, _n)) * (k / 0.5) / (door.w || W);
        if (Math.abs(dw) < 0.02) return false;
        if (this.game.locks?.doorLocked?.(door)) { if (Math.abs(dw) > DOOR_PUSH.RATTLE) this._rattle(door, true); return false; }
        // (a real gust throws the leaf open properly: a door that opened half way and stood in the doorway was the trouble)
        door.spin = (door.spin || 0) + (Math.abs(dw) >= DOOR_PUSH.GUST_MIN ? Math.sign(dw) * Math.max(Math.abs(dw), DOOR_PUSH.GUST_SPIN) : dw);
        door.gust = true;
        return true;
    }

    /**
     * A doorway's leaf: hung on the side where it opens furthest (into the room (a wall, a bed or a chest
     * close to one jamb: the hinges go on the other). Returns the record with `mirror` set.
     */
    hangBest(d) {
        const a = this.openLimit({ ...d, a: 0, mirror: false }), b = this.openLimit({ ...d, a: 0, mirror: true });
        return b > a + 0.05 ? { ...d, mirror: true } : d;
    }

    /** A push of air over the place (a spell, a blast): vAt(p) → its push (m/s, world) at a point, or null. */
    blow(vAt, from = null) {
        let n = 0;
        for (const door of this.list.values()) {
            if (door.lifted) continue;
            if (from && Math.abs(door.x - from.x) + Math.abs(door.z - from.z) > DOOR_PUSH.REACH * 1.5) continue;
            const p = this._leafMiddle(door, _q);
            // At arm's length the middle may be below/aside the wind cone,
            // although the gust hits the upper part of the same leaf.
            if (from) {
                const local = this._leafLocal(door, from, _n);
                const m = door.mirror ? -1 : 1, w = door.w || W;
                const along = Math.max(0, Math.min(w, local.x)) - w / 2;
                const angle = door.ry + m * door.a;
                p.x += m * Math.cos(angle) * along;
                p.z -= m * Math.sin(angle) * along;
                p.y = door.y + Math.max(0, Math.min(door.h || H, local.y));
            }
            const v = vAt(p);
            if (v && this.impulse(door, v)) n++;
        }
        return n;
    }

    /**
     * The first leaf a moving point (a spell's charge) touches between `a` and `b` (pad: its size).
     * @returns {{door, s: number}|null} s: the share of the way
     */
    segmentHit(a, b, pad = 0.15) {
        let best = null;
        for (const door of this.list.values()) {
            if (door.lifted) continue;
            const lw = door.w || W, dh = door.h || H;
            if (Math.abs(door.x - a.x) + Math.abs(door.z - a.z) > Math.abs(b.x - a.x) + Math.abs(b.z - a.z) + lw * 2 + 2) continue;
            const p = this._leafLocal(door, a, new THREE.Vector3()), q = this._leafLocal(door, b, _q);
            // the leaf: x 0..lw, y 0..dh, z ±T/2 (padded) — a slab test along the segment
            let t0 = 0, t1 = 1;
            for (const [p0, p1, lo, hi] of [[p.x, q.x, -pad, lw + pad], [p.y, q.y, -pad, dh + pad], [p.z, q.z, -T / 2 - pad, T / 2 + pad]]) {
                const d = p1 - p0;
                if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) { t0 = 2; break; } continue; }
                let u0 = (lo - p0) / d, u1 = (hi - p0) / d;
                if (u0 > u1) [u0, u1] = [u1, u0];
                t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
                if (t0 > t1) break;
            }
            if (t0 <= t1 && t0 <= 1 && (!best || t0 < best.s)) best = { door, s: t0, k: Math.max(0.1, Math.min(1, (p.x + (q.x - p.x) * t0) / lw)) };
        }
        return best;
    }

    /** Leaves swinging by themselves (after a push): the hinges slow them, the frame / the stop / a body stop them. */
    _swing(dt) {
        const g = this.game;
        for (const door of this.list.values()) {
            if (!door.spin) continue;
            if (door.holdSide || door.lifted || g.locks?.doorLocked?.(door)) { door.spin = 0; continue; }
            const was = door.a;
            const r = swingStep(door.a, door.spin, Math.min(dt, 0.05), this.openLimit(door, 1), this.openLimit(door, -1));
            // a body in its way (me, the others, people, zombies, animals): the leaf stops on it
            const stop = this._bodyInSwing(door, was, r.a);
            if (stop != null) { r.a = stop; r.w = -r.w * 0.2; r.hit = 'body'; if (Math.abs(r.w) < DOOR_PUSH.REST * 4) r.w = 0; }
            this._setAngle(door, r.a);
            door.spin = r.w;
            if (!door.spin && door.gust) { // (came to rest after a gust: ajar — it falls back shut)
                door.gust = false;
                if (Math.abs(door.a) > 0 && Math.abs(door.a) < DOOR_PUSH.AJAR) door.spin = -Math.sign(door.a) * 0.8;
            }
            if (r.hit === 'slam') this._ring(door, Math.min(0.5, 0.15 + Math.abs(r.w) * 0.1));
            else if (r.hit === 'open' && Math.abs(r.w) > 0.4) this._ring(door, 0.12);
            if (!door.spin && g.authority) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); } // (where it came to rest)
        }
    }

    /** Every body near a door (me, the others, people, zombies, animals): fn(x, y, z, radius, mine). */
    _eachBody(fn) {
        const g = this.game;
        const me = g.character?.group.position;
        if (me && !g.isDeadLocal) fn(me.x, me.y - 1, me.z, 0.4, true);
        for (const [, r] of g.remotes || []) if (r.position) fn(r.position.x, r.position.y - 1, r.position.z, 0.4, false);
        for (const v of g.castleLife?.byId?.values() || []) if (!v.dead) fn(v.x, v.y + 1, v.z, 0.4, false);
        for (const z of g.zombies || []) if (!z.isDead) fn(z.group.position.x, z.group.position.y + 1, z.group.position.z, 0.4, false);
        for (const a of g.animals?.list || []) if (!a.dead) fn(a.group.position.x, a.group.position.y + 0.8, a.group.position.z, 0.7, false);
        for (const v of g.ships?.crew?.byId?.values() || []) if (!v.dead && !v.overboard) fn(v.x, v.y + 1, v.z, 0.4, false); // (the ships' crews: a ship's door stops on them too)
    }

    /**
     * Somebody walking through a doorway into an open leaf pushes it away from themselves (either
     * way, as far as its stop on that side) — the leaf never goes through a body. A shut leaf is a
     * wall (its box): the latch holds it, it is opened by the handle (or by the people who live there).
     * Every computer pushes it the same; my own body and the host (for everybody else) tell the others.
     */
    _bodiesPush() {
        const g = this.game, me = g.character?.group.position;
        if (!me) return;
        for (const door of this.list.values()) {
            if (Math.abs(door.a) < 0.35 || door.lifted || door.holdSide || this.carried?.door === door) continue;
            if (Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 60) continue;
            if (g.locks?.doorLocked?.(door)) continue;
            const lw = door.w || W, dh = door.h || H;
            let mine = false, moved = false;
            this._eachBody((x, y, z, rad, isMe) => {
                if (Math.abs(x - door.x) > lw + 1.5 || Math.abs(z - door.z) > lw + 1.5) return;
                if (y < door.y - 2.5 || y > door.y + dh + 0.5) return;
                const L = this._local(door, _q.set(x, y, z), _q);
                const r = Math.hypot(L.x, L.z);
                if (r < 0.45 || r > lw + rad * 0.5) return;
                const ha = hingeAngle(L.x, L.z, door.mirror), pad = Math.min(1.2, (rad + T / 2) / r);
                const off = ha - door.a;
                if (Math.abs(off) >= pad) return;
                // pushed away from the body: to the far side of it
                const to = off > 0 ? ha - pad : ha + pad;
                if (Math.sign(to) !== Math.sign(door.a) || Math.abs(to) < 0.4) return; // (not pushed shut by walking: the leaf holds)
                const was = door.a;
                this._setAngle(door, to);
                if (door.a !== was) { moved = true; mine ||= isMe; door.spin = 0; }
            });
            if (moved && (mine || g.authority) && Math.abs(door.a - (door._sentA ?? 0)) > 0.05) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
        }
    }

    /** May I (my body) push this door at all? Every «no» is a reason from the author's list. */
    _walkMay(door) {
        const g = this.game;
        if (door.lifted || door.holdSide || door.ship || door.gate || door.ice || door.metal || door.forged || door.wrecked) return false; // (a ship's bulkhead: its crew; the forged gates and the Ice Castle's: their own rules)
        if (this.carried?.door === door || door.spin || Math.abs(door.a) >= 0.05) return false;
        if (g.wards?.list?.size) for (const w of g.wards.list.values()) if (inWard(w, door) && !g.wards.mine(w)) return false; // (a house under a ward: not for a stranger)
        return true;
    }

    /**
     * My body against a shut door: the legs walk, the face is turned to the leaf, pressed against it a moment —
     * an unlocked door swings open away from me; a locked one rattles as before. Only my own body (every computer
     * does its own; the angle goes to the others like the hand's). Only the doors within DOOR_WALK.NEAR: no garbage.
     */
    _walkOpen(dt) {
        const g = this.game, ch = g.character;
        const me = ch?.group.position;
        if (!me) return;
        const busy = g.isDeadLocal || !ch.isRunning || g.knock?.down || g.combat?.immobile || g.beds?.lying || g.animals?.riding || g.dragonRide?.busy || g.flight?.busy || g.flight?.active || ch.swimY != null || g.levitation?.lifted || g.imperius?.active || g._inDuel?.();
        const ry = ch.group.rotation?.y || 0;
        const fwx = -Math.sin(ry), fwz = -Math.cos(ry);
        for (const door of this.list.values()) {
            const w = door.walk;
            if (w) { this._walkMove(door, w, dt); continue; }
            const near = Math.abs(door.x - me.x) + Math.abs(door.z - me.z) <= DOOR_WALK.NEAR;
            if (busy || !near || me.y < door.y - 2.5 || me.y > door.y + (door.h || H) + 1) { if (door._walkT) door._walkT = 0; continue; }
            const c = Math.cos(door.ry), s = Math.sin(door.ry);
            const dx = me.x - door.x, dz = me.z - door.z;
            const sg = walkOpenSign(dx * c - dz * s, dx * s + dz * c, fwx * c - fwz * s, fwx * s + fwz * c, true, door.w || W);
            if (!sg || !this._walkMay(door)) { if (door._walkT) door._walkT = 0; continue; }
            door._walkT = (door._walkT || 0) + dt;
            if (door._walkT < DOOR_WALK.HOLD) continue;
            door._walkT = 0;
            if (g.locks?.doorLocked?.(door)) { this._rattle(door); continue; } // (locked: the old reaction — it rattles, the hint)
            door.walk = { sign: sg, open: true, t: 0 };
        }
    }

    /** The leaf pushed by a body swings open; later, with nobody in the doorway, it swings shut. */
    _walkMove(door, w, dt) {
        const g = this.game;
        if (!this.list.has(door.id) || door.lifted || door.holdSide || door.wrecked || g.locks?.doorLocked?.(door)) { door.walk = null; return; } // (taken by a hand, lifted, locked by «Lock», broken: the old rules)
        const was = door.a;
        if (w.open) {
            const to = w.sign * DOOR_WALK.OPEN_TO;
            let a = door.a + w.sign * DOOR_WALK.SPEED * dt;
            if (Math.abs(a) >= DOOR_WALK.OPEN_TO) { a = to; w.open = false; w.t = 0; }
            const stop = this._bodyInSwing(door, was, a, true); // (never through a body: the leaf stops on it — not on mine: it swings away from me)
            if (stop != null) { a = stop; if (Math.abs(a - was) < 1e-3) w.open = false; }
            this._setAngle(door, a);
            if (Math.abs(door.a) < Math.abs(a) - 0.02) w.open = false; // (a wall / a bed on that side: it stands where it stopped)
        } else {
            if (door.a === 0) { door.walk = null; return; }
            // somebody still in the doorway (me, a friend, a villager, an animal): it waits — never shut onto a body
            let busy = false;
            const lw = door.w || W;
            this._eachBody((x, y, z, rad) => {
                if (busy || Math.abs(x - door.x) > lw + DOOR_WALK.CLEAR || Math.abs(z - door.z) > lw + DOOR_WALK.CLEAR) return;
                if (y < door.y - 2.5 || y > door.y + (door.h || H) + 0.5) return;
                busy = true;
            });
            w.t = busy ? 0 : w.t + dt;
            if (w.t < DOOR_WALK.CLOSE_AFTER) return;
            const a = Math.sign(door.a) * Math.max(0, Math.abs(door.a) - DOOR_WALK.CLOSE_SPEED * dt);
            const stop = this._bodyInSwing(door, door.a, a);
            if (stop != null) { w.t = DOOR_WALK.CLOSE_AFTER - 0.5; return; }
            this._setAngle(door, a);
            if (a === 0) { this._ring(door, 0.06); door.walk = null; }
        }
        if (Math.abs(door.a - (door._sentA ?? 0)) > 0.05 || (door.a === 0 && door._sentA)) { door._sentA = door.a; g.sync?.doorAngle?.(door.id, door.a); }
    }

    /**
     * The way a leaf opens AWAY from somebody at (x, z) (+1 / −1: the sign of its angle): the people
     * push it open in the direction they walk. A leaf already open keeps its way (they go through it).
     */
    awaySign(door, x, z) {
        if (Math.abs(door.a) > 0.05) return Math.sign(door.a);
        const c = Math.cos(door.ry), s = Math.sin(door.ry);
        const lz = s * (x - door.x) + c * (z - door.z); // (which face of the doorway they stand at)
        return lz >= 0 ? 1 : -1; // (at +Z: it opens towards −Z, away from them — and the other way round)
    }

    /** Is there a body between the leaf's angles a0 → a1? The angle the leaf stops at, or null. */
    _bodyInSwing(door, a0, a1, skipMe = false) {
        const lw = door.w || W;
        const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
        let stop = null;
        const test = (x, y, z, rad, isMe) => {
            if (skipMe && isMe) return;
            if (Math.abs(x - door.x) > lw + 2 || Math.abs(z - door.z) > lw + 2) return;
            if (y < door.y - 2.5 || y > door.y + (door.h || H) + 0.5) return;
            const L = this._local(door, _q.set(x, y, z), _q);
            const r = Math.hypot(L.x, L.z);
            if (r < 0.25 || r > lw + rad) return;
            const ha = hingeAngle(L.x, L.z, door.mirror), pad = Math.min(1.2, (rad + T / 2) / Math.max(0.3, r));
            if (ha + pad < lo || ha - pad > hi) return;
            // stop just short of it (on the side the leaf came from)
            const at = a1 > a0 ? Math.max(a0, ha - pad) : Math.min(a0, ha + pad);
            if (stop == null || Math.abs(at - a0) < Math.abs(stop - a0)) stop = at;
        };
        this._eachBody(test);
        return stop;
    }

    /** Samples for Game.prewarm: every look of the keep's forged-iron gates (their materials, their plate textures) are made and drawn once on the loading screen. */
    sampleModels() {
        const out = [];
        for (let v = 0; v < GATE_VARIANTS; v++) out.push(forgedGateModel({ w: 2.5, h: 7, vari: v, mirror: v % 2 === 1 }));
        return out;
    }

    /** A door's own sound: a plain clang; a forged-iron gate groans and booms (SoundManager.playIronGate). */
    _ring(door, power) {
        const s = this.game.sound;
        if (door.forged && s?.playIronGate) s.playIronGate(power); else s?.playClang?.(power);
    }

    /** A locked leaf tried by the hand: it rattles (a sound, a hint now and then). */
    _rattle(door, pushed = false) {
        const g = this.game;
        if (door.shakeT > 0) return;
        door.shakeT = 0.3;
        const near = Math.hypot(door.x - g.character.group.position.x, door.z - g.character.group.position.z) < 30;
        if (near) this._ring(door, 0.12); // (the clang has no place of its own: a far door is not heard)
        if (pushed) { if (near) g.hud?.setVoice?.('🔒 Дверь заперта — её трясёт, но замок держит. Откройте «Алохоморой»', true); }
        else g.locks?.lockedTried?.(door);
    }

    /** The hand takes the handle: the fingers stay closed round it. */
    grab(door, side) {
        const g = this.game;
        this.held[side] = door;
        door.holdSide = side;
        this._relT[side] = 0;
        const hand = g.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(0.7);
        if (this.game.locks?.doorLocked?.(door)) this._rattle(door);
    }

    release(side) {
        const door = this.held[side];
        if (!door) return;
        this.held[side] = null;
        if (door.holdSide === side) door.holdSide = null;
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(null);
        this.game.sync?.doorAngle?.(door.id, door.a); // (where it stays)
    }

    releaseAll() { this.release('left'); this.release('right'); }

    /** «Вингардиум Левиоса» pointed at a door. */
    tryLift(side) {
        const g = this.game;
        const ch = g.character;
        const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
        const dir = ch.getHandDirection(side, new THREE.Vector3());
        let best = null;
        for (const door of this.list.values()) {
            if (door.ship) continue; // (a ship's door is fixed in its bulkhead)
            if (door.forged) continue; // (the keep's forged-iron gates: too heavy for the plain spell — only a strong blast or «Алохомора Максима» opens them, GateModel.js)
            if (door.ice) continue; // (the Ice Castle's gates are grown into their archway of ice: «Левиоса» does not take them — IceFixtures.js)
            const to = _v.set(door.x, door.y + 1.8, door.z).sub(hand);
            const d = to.length();
            if (d > 10) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < 0.4 && (!best || ang < best.ang)) best = { door, ang };
        }
        if (!best) return false;
        best.door.lifted = true;
        this._setAngle(best.door, 0);
        this.carried = { door: best.door, side };
        g.hud.setVoice('🪶 Дверь парит — скажите «Вингардиум Левиоса» или «Stand», чтобы поставить', true);
        return true;
    }

    _putDown() {
        const c = this.carried;
        this.carried = null;
        const d = c.door;
        d.lifted = false;
        d.moved = true;
        d.y = this.game.collision.groundY(d.x, d.z);
        d.model.position.y = d.y;
        this._setAngle(d, 0);
        this.game.sync?.door?.({ id: d.id, x: d.x, y: d.y, z: d.z, ry: d.ry, color: d.color, a: 0 });
        this.game.hud.setVoice('🚪 Дверь поставлена', true);
    }

    // ---------------------------------------------------------- network / save
    applyNet(d) { this._place(d); }
    applyAngle(id, a) { const d = this.list.get(id); if (d && !d.holdSide) this._setAngle(d, a); }

    /** Swing a door to an angle (house doors opened by the people living there). */
    swing(id, a) { const d = this.list.get(id); if (d && !d.holdSide && !d.lifted) this._setAngle(d, a); }

    /** A house door away from everybody is taken out of the scene (it comes back with the house). */
    remove(id) {
        const d = this.list.get(id);
        if (!d) return;
        if (this.carried?.door === d) this.carried = null;
        for (const side of ['left', 'right']) if (this.held[side] === d) this.release(side);
        this.game.scene.remove(d.model);
        // (its boards and knobs are its own geometries — the video card's buffers go with it; the materials are shared)
        d.model.traverse((o) => { if (o.isMesh && !o.geometry.userData?.shared) o.geometry.dispose(); }); // (the forged gates' merged shapes are shared by every gate of their look — GateModel.js)
        if (d.boxId != null) this.game.collision.removeBox(d.boxId);
        this.list.delete(id);
    }

    // ------------------------------------------------------------ the latch: shut / locked, to be SEEN
    /**
     * The barrel bolt and its lamp on each plain door within 30 m: drawn back and a GREEN lamp — the door is only shut (any hand opens it); shot across and a RED lamp — it
     * is LOCKED (a lock, a spell, the house's own key: `locks.doorLocked`). An open leaf shows green (nothing holds it). The bolt slides over ~0.25 s and clicks.
     */
    _lockVis(dt) {
        const g = this.game, me = g.character?.group?.position;
        if (!me) return;
        this._lvT = (this._lvT || 0) - dt;
        const look = this._lvT <= 0;
        if (look) this._lvT = 0.25;
        for (const door of this.list.values()) {
            const L = door.model.userData.lock;
            if (!L) continue;
            if (Math.abs(door.x - me.x) + Math.abs(door.z - me.z) > 40) continue;
            if (look) {
                const locked = !!g.locks?.doorLocked?.(door), shut = Math.abs(door.a) < 0.12;
                if (locked !== L.locked) {
                    L.locked = locked;
                    if (L.seen) this._ring(door, 0.12); // (the bolt clicks: not at the first sight)
                    for (const d of L.dots) d.material = locked ? L.red : L.green;
                }
                L.seen = true;
                L.to = locked && shut ? 1 : 0; // (a locked leaf standing open: the lamp is red but the bolt has nothing to catch)
            }
            if (Math.abs(L.cur - L.to) > 0.002) {
                L.cur += Math.sign(L.to - L.cur) * Math.min(Math.abs(L.to - L.cur), dt * 5);
                L.bolts.forEach((b, i) => { b.position.x = L.base[i] + L.trav * L.cur; });
            }
        }
    }

    // ------------------------------------------------------------ damage: a chunk, or splinters
    _hole(door, h, anim = true) {
        const D = damageDecals();
        if (!D) return;
        const hinge = door.model.userData.hinge, m = door.mirror ? -1 : 1, T2 = T / 2;
        for (const z of [-1, 1]) {
            const p = new THREE.Mesh(_box, D.hole);
            p.geometry = _planeGeo || (_planeGeo = new THREE.PlaneGeometry(1, 1));
            p.scale.set(h.r * 2.2, h.r * 2.6, 1);
            p.position.set(m * h.x, h.y, z * (T2 + 0.012));
            p.rotation.y = z > 0 ? 0 : Math.PI; p.rotation.z = h.rot || 0;
            hinge.add(p);
        }
    }

    _cracks(door) {
        const D = damageDecals();
        if (!D) return;
        const stage = door.hp >= door.maxHp * 0.8 ? 0 : door.hp >= door.maxHp * 0.5 ? 1 : door.hp >= door.maxHp * 0.25 ? 2 : 3;
        if (door.crackStage === stage) return;
        door.crackStage = stage;
        const hinge = door.model.userData.hinge, m = door.mirror ? -1 : 1, lw = door.w || W, dh = door.h || H;
        if (!door.crackMeshes) {
            door.crackMeshes = [-1, 1].map((z) => {
                const p = new THREE.Mesh(_planeGeo || (_planeGeo = new THREE.PlaneGeometry(1, 1)), D.crack[0]);
                p.scale.set(lw * 0.9, dh * 0.9, 1);
                p.position.set(m * lw / 2, dh / 2, z * (T / 2 + 0.008)); p.rotation.y = z > 0 ? 0 : Math.PI;
                hinge.add(p); return p;
            });
        }
        for (const p of door.crackMeshes) { p.visible = stage > 0; if (stage > 0) p.material = D.crack[stage - 1]; }
    }

    /**
     * A blast (or any strong shove) takes `share` of the door's strength (DoorStyles.hurtShare; ≥ 1 of what is left: it bursts). Light: a chunk knocked out of the leaf on the blast's
     * side — splinters fly, a ragged hole, the cracks spread; the leaf jolts. Strong: `shatter`. `from`: the blast's middle. Returns 'shatter' | 'chip' | null.
     */
    hurt(door, share, from = null) {
        if (!door || !door.model?.userData?.hurtable || door.wrecked || share <= 0.04) return null;
        const g = this.game, dmg = share * door.maxHp;
        door.hp -= dmg;
        if (door.hp <= 0) { door.shatterFrom = from; if (g.wreck?._breakDoor) g.wreck._breakDoor(door); else { this.shatter(door, from); this.remove(door.id); } return 'shatter'; }
        // a chunk: where, on the blast's side; deterministic (every computer knocks the same piece out)
        const lw = door.w || W, dh = door.h || H;
        let side = 0;
        if (from) { const loc = this._leafLocal(door, from, _n); side = loc.x > lw / 2 ? 1 : -1; }
        const k = (n) => { let h = Math.imul((door.holes.length + 1) * 2654435761 ^ n, 2246822519); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
        const spot = chipSpot(lw, dh, k(1), k(2), k(3), side);
        const hole = { x: Math.round(spot.x * 100) / 100, y: Math.round(spot.y * 100) / 100, r: Math.round(spot.r * 100) / 100, rot: Math.round(k(4) * 6.28 * 100) / 100 };
        if (door.holes.length < 6) { door.holes.push(hole); this._hole(door, hole); }
        this._cracks(door);
        // splinters from the hole, thrown away from the blast
        const m = door.mirror ? -1 : 1, c = Math.cos(door.ry), s = Math.sin(door.ry);
        const lx = -m * lw / 2 + m * Math.cos(door.a) * hole.x, lz = -Math.sin(door.a) * hole.x;
        const wx = door.x + c * lx + s * lz, wy = door.y + hole.y, wz = door.z - s * lx + c * lz;
        const dir = from ? _v.set(wx - from.x, 0, wz - from.z).normalize() : _v.set(Math.sin(door.ry), 0, Math.cos(door.ry));
        this._splinters(door, wx, wy, wz, dir, 5 + Math.round(share * 10), 1);
        g.sound?.playCrack?.(0.7);
        this._rattle(door, true);
        return 'chip';
    }

    /** The door bursts: boards and a cloud of splinters thrown away from `from`, a crash; the leaf is gone (its doorway open). */
    shatter(door, from = null) {
        const g = this.game, lw = door.w || W, dh = door.h || H, m = door.mirror ? -1 : 1, c = Math.cos(door.ry), s = Math.sin(door.ry);
        const mid = this._leafMiddle(door, new THREE.Vector3());
        const dir = from ? new THREE.Vector3(mid.x - from.x, 0, mid.z - from.z) : new THREE.Vector3(Math.sin(door.ry), 0, Math.cos(door.ry));
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
        dir.normalize();
        // the boards: along the leaf, each a different height, flung out
        for (let i = 0; i < 7; i++) {
            const t = (i + 0.5) / 7, lx = -m * lw / 2 + m * t * lw * Math.cos(door.a), lz = -t * lw * Math.sin(door.a);
            const x = door.x + c * lx + s * lz, z = door.z - s * lx + c * lz;
            this._splinters(door, x, door.y + dh * (0.15 + 0.7 * ((i * 0.37) % 1)), z, dir, 3, 2.2);
        }
        this._splinters(door, mid.x, mid.y, mid.z, dir, 38, 1);
        g.fx?.lightFlash?.(mid, 0xffd9a0, 3, 0.12, 20);
        for (let i = 0; i < 6; i++) g.fx?.smoke?.spawn?.(mid.x + (Math.random() - 0.5) * lw, door.y + Math.random() * dh, mid.z + (Math.random() - 0.5) * lw, dir.x * 1.5, 0.8, dir.z * 1.5, 0xb9a98a, 0.9 + Math.random() * 0.6, 1.2 + Math.random(), { shrink: -0.5 });
        g.sound?.playCrack?.(1);
        g.sound?.playExplosion?.(mid, g.character.group.position, 0.35);
        door.wrecked = true;
    }

    /** `n` boards/splinters of the door's wood thrown from a point along `dir` (the planks pool of the ship breaking: long thin boards that tumble and lie). */
    _splinters(door, x, y, z, dir, n, size) {
        const fx = this.game.fx, cols = splinterColors(door.color ?? 0x7a4f2a);
        for (let i = 0; i < n; i++) {
            const sp = 4 + Math.random() * 10, big = size > 1.5;
            const px = x + (Math.random() - 0.5) * 0.5, pz = z + (Math.random() - 0.5) * 0.5, py = y + (Math.random() - 0.5) * 0.5;
            const vx = dir.x * sp + (Math.random() - 0.5) * 6, vz = dir.z * sp + (Math.random() - 0.5) * 6, vy = 2 + Math.random() * 7;
            if (fx?.planks) fx.planks.spawn(px, py, pz, vx, vy, vz, cols[i % cols.length], big ? 0.5 + Math.random() * 0.9 : 0.18 + Math.random() * 0.4, 3 + Math.random() * 3, { shrink: 0.08, fade: false, spin: 12 });
            else fx?.debris?.spawn(px, py, pz, vx, vy, vz, cols[i % cols.length], 0.12 + Math.random() * 0.2, 3, { shrink: 0.1, fade: false, spin: 10 });
        }
    }

    snapshot() {
        // (house doors are part of the generated world: not saved, unless carried away)
        return [...this.list.values()].filter((d) => !d.gen || d.moved).map((d) => ({ id: d.id, x: d.x, y: d.y, z: d.z, ry: d.ry, color: d.color, a: d.a || 0, w: d.w, h: d.h, ...(d.mirror ? { mirror: 1 } : {}), ...(d.gate ? { gate: 1 } : {}), ...(d.style ? { style: d.style } : {}), ...(d.hp != null && d.hp < d.maxHp ? { hp: Math.round(d.hp * 10) / 10, holes: d.holes } : {}) }));
    }

    restore(list) { for (const d of list || []) this._place(d); }

    dispose() {
        this._cancel();
        for (const d of this.list.values()) { this.game.scene.remove(d.model); if (d.boxId != null) this.game.collision.removeBox(d.boxId); }
        this.list.clear();
    }
}
