/**
 * Skeletons.js — «Alive» said at a grave (the village graveyards, Castles.js buildGraveyard):
 * the dead rises. It is not a living thing — the same in principle as a living tree, and it is
 * one (LivingTrees.js runs it: `t.skel`): the caster's servant, held by concentration and mana,
 * 15 HP, it beats the caster's enemies; its caster's death / stun / «стоп» lets it go.
 *
 * Its body is the black ship's skeleton's (VillagerModel.skeletonBoneBoxes — the author: «возьми модельку из
 * живых скелетов пиратов»), as tall as a player. Not at once: the grave shakes (clods jump), the earth
 * bursts open — the dead lies in the hole, its bones apart — and the bones rise out of it one after
 * another, each in a green glow, and fly to their places in front of the grave: the spine and the pelvis,
 * the ribs, the breastbone and the shoulders, the skull, the arms, the legs; each knocks into place
 * (a dry clack). The skeleton stands there, the green fire lights in its sockets — and it is alive.
 * Every bone moves by its own path, out of the hole and then over the ground: none goes into the earth.
 * Its end: it falls apart — every bone drops to the ground round its feet (a heap of bones), lies a moment
 * and is gone. The grave stays dug open (block edits, saved with the world).
 *
 * Only a grave's dead rises: «Alive» does nothing to a body or bones lying about (Death.js) — so a hero's
 * skeleton with their legacy (Legacy.js, «Give Me My Power») is never raised and its legacy never lost
 * (the author's rule: only its owner takes it).
 *
 * Who / what × how (CLAUDE.md):
 *  - duel charges («Авада Кедавра», «Остолбеней», «Сапира»…) — NO damage: it is not quite alive,
 *    there is no life in it to take (SKEL_DUEL_IMMUNE); jolts still push it (CreatureImpact).
 *  - fire (Инферно, Fire Maxima, Hellfire, a campfire) — burns it as it burns a tree;
 *    «Бомбардо» / «Бомбардо Максима», blasts, lightning, the mightiest spells — break it apart;
 *  - blades, axes, fists, other servants' blows — break its bones (unlike the tree's wood).
 *  - everything else a living tree meets (Levitation Maxima, Drawdown, wind, water…) — as the tree.
 */

import * as THREE from 'three';
import { isFireDamage, MIGHTY_ON_TREES } from './LivingTrees.js';
import { skeletonBoneBoxes, boxesGeometry, VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';

export const SKEL = {
    S: 0.25, // its size against a tree's (s): every «× s» size of LivingTrees fits a man's body
    RISE: 7, // s: the grave shakes → the earth bursts → the bones come together → its eyes light
    OPEN: 0.14, // (form) the earth bursts open (the host digs the grave): the bones lie in the hole
    BUILD: 0.2, // (form) the first bone rises…
    BUILT: 0.86, // (form) …the last one is in its place
    COLLAPSE: 3, // s it falls apart into its bones, and they lie a moment
    ARC: 1.5, // m: a bone rises this much over its straight way (out of the hole, over the ground)
    SPEED: 2.4, RUN: 4.0,
    REACH: 5.4, // m its arms reach
    KEEP: 7, // m from its master (it is as big as a man)
    AIM: 28, // m: the grave pointed at (twice the first 14: the author had to stand too close)
    BONE: 0xe6dcc0,
};

/** Physical blows break bones (blades, fists, other servants' blows). */
const PHYS = new Set(['melee', 'fist', 'punch', 'kick', 'tree', 'skeleton', 'servant', 'brainrot', 'arrow', 'cannon']);
/**
 * Duel charges do nothing to it — not quite alive (the author: «Авада Кедавра его не убьёт»).
 * (Listed for the record: anything not fire / mighty / physical does nothing anyway.)
 */
export const SKEL_DUEL_IMMUNE = 'no life in it to take: «Авада Кедавра» and the other duel charges pass it by';
/** How much of a blow of `kind` a skeleton takes. */
export const skeletonDamage = (kind, dmg) => (isFireDamage(kind) || MIGHTY_ON_TREES.has(kind) || PHYS.has(kind) ? dmg : 0);

/**
 * The grave the hand points at — by the hand's heading over the ground (within ~11° and SKEL.AIM m),
 * not its pitch: a hand raised to cast (forward and a little up) still means the grave ahead; only a
 * hand pointing up at the sky means none. A grave of a village graveyard near (CastleIndex). → {grave, dist} | null
 */
export function graveOnRay(index, o, d, max = SKEL.AIM) {
    if (!index?.near) return null;
    const hl = Math.hypot(d.x, d.z);
    if (hl < 0.35) return null; // (the hand straight up or down: no heading)
    const ux = d.x / hl, uz = d.z / hl;
    let best = null;
    for (const c of index.near(o.x, o.z, max)) {
        for (const q of c.graves || []) {
            const dx = q.x - o.x, dz = q.z - o.z;
            const along = dx * ux + dz * uz; // (how far ahead, over the ground)
            if (along < 0.5 || along > max) continue;
            const off = Math.abs(dx * uz - dz * ux); // (how far beside the hand's line)
            if (off > Math.max(1.6, along * 0.2)) continue;
            if (!best || along < best.dist) best = { grave: q, dist: along, castle: c };
        }
    }
    return best;
}

/** Is a grave still closed (its plot still earth)? data: TerrainData. */
export const graveClosed = (data, q) => !data || q.cells.some(([x, z]) => data.get(x, q.L, z) !== 0);

/**
 * The bones and the order they come together in (spine first, the legs last): the name in
 * skeletonBoneBoxes, its joint, and its turn.
 */
const ORDER = { spine: 0, pelvis: 0.4, rib: 1, breast: 2.2, shoulders: 2.5, head: 3.3, upperArm: 4.2, forearm: 4.7, hand: 5.1, thigh: 5.9, shin: 6.4 };
const LAST = 6.4 + 0.3; // (the right side's bones a little after the left's)
const PIECE = 0.3; // (of the build) one bone's flight
const BONE_TINT = 0xffffff; // (the bones' own colours are in the shapes)

// the shapes: one set for every skeleton (never disposed: `userData.shared`)
let _geo = null;
const _eyeGeo = new THREE.BoxGeometry(0.15, 0.12, 0.03);
const _glowGeo = new THREE.BoxGeometry(0.3, 0.26, 0.02);
_eyeGeo.userData.shared = _glowGeo.userData.shared = true;
function shapes() {
    if (_geo) return _geo;
    const B = skeletonBoneBoxes();
    const g = (L) => { const x = boxesGeometry(L); x.userData.shared = true; return x; };
    _geo = { skull: g(B.skull), jaw: g(B.jaw), spine: g(B.spine), ribs: B.ribs.map(g), breast: g(B.breast), shoulders: g(B.shoulders), pelvis: g(B.pelvis), upperArm: g(B.upperArm), forearm: g(B.forearm), hand: g(B.hand), thigh: g(B.thigh), shin: g(B.shin) };
    return _geo;
}

/** A tiny steady random (the bones lie the same way on every computer: the grave's id). */
function rand(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The risen dead: the black ship's skeleton (its bones, its joints — a person's), as tall as a player,
 * feet at 0, facing −z; wrapped to the living tree's rig (userData: fall, rig, legs, knees, body, arms
 * {sh, elbow, hand, side}, head, headY, eyes, eyeMat, glow, mouth, s, mats, base, trunk) — so everything
 * that meets a living tree meets it too. Every bone is a mesh of its own (`pieces`): the bones come
 * together (assembleSkeleton) and fall apart (scatterSkeleton) one by one. `seed`: how they lie.
 */
export function skeletonModel(seed = 0) {
    const G = shapes();
    const s = SKEL.S;
    const root = new THREE.Group();
    const fall = new THREE.Group();
    root.add(fall);
    const rig = new THREE.Group();
    rig.scale.setScalar(s);
    fall.add(rig);
    const m = new THREE.Group(); // (a person's units inside: as a player)
    m.scale.setScalar(1 / s);
    rig.add(m);
    const bone = new THREE.MeshLambertMaterial({ color: BONE_TINT, vertexColors: true, emissive: 0x000000 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a14 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pieces = [];
    const mesh = (parent, geo, name, order, y = 0) => {
        const o = new THREE.Mesh(geo, bone);
        o.position.y = y;
        o.castShadow = true;
        parent.add(o);
        pieces.push({ obj: o, name, order, geo });
        return o;
    };
    const group = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
    // the pelvis and the legs (hip pivots at the pelvis, a knee a thigh lower)
    const pelvis = group(m, 0, VILLAGER_FOOT_OFFSET, 0);
    mesh(pelvis, G.pelvis, 'pelvis', ORDER.pelvis, 0.75); // (its shape is in the torso's frame)
    const legs = [], knees = [];
    for (const side of [-1, 1]) {
        const hip = group(pelvis, side * 0.3, 0, 0);
        mesh(hip, G.thigh, 'thigh', ORDER.thigh + (side > 0 ? 0.3 : 0));
        const knee = group(hip, 0, -1.0, 0);
        mesh(knee, G.shin, 'shin', ORDER.shin + (side > 0 ? 0.3 : 0));
        legs.push(hip); knees.push(knee);
    }
    // the body (the hip pivot): the torso's bones, the head, the arms — they lean with it
    const body = group(pelvis, 0, 0, 0);
    const torso = group(body, 0, 0.75, 0);
    const spine = mesh(torso, G.spine, 'spine', ORDER.spine); // (first mesh of the body: the spine — the blade stops on it, CutBodies)
    G.ribs.forEach((r, i) => mesh(torso, r, 'rib', ORDER.rib + i * 0.22));
    mesh(torso, G.breast, 'breast', ORDER.breast);
    mesh(torso, G.shoulders, 'shoulders', ORDER.shoulders);
    // the head: the skull, a jaw that drops, the green fire in its sockets (they come with the skull)
    const head = group(torso, 0, 0.75, 0);
    const skull = new THREE.Mesh(G.skull, bone);
    skull.castShadow = true;
    head.add(skull);
    const mouth = group(head, 0, 0.14, 0.3); // (the jaw's hinge, under the ears)
    const jaw = new THREE.Mesh(G.jaw, bone);
    jaw.position.set(0, -0.14, -0.3);
    mouth.add(jaw);
    const eyes = [];
    for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(_eyeGeo, eyeMat);
        e.position.set(sx * 0.24, 0.6, -0.585);
        head.add(e);
        eyes.push(e);
        const gl = new THREE.Mesh(_glowGeo, glow);
        gl.position.set(sx * 0.24, 0.6, -0.6);
        head.add(gl);
    }
    pieces.push({ obj: head, name: 'head', order: ORDER.head, geo: G.skull });
    // the arms: shoulder — elbow — hand (each bone's shape is in the shoulder's frame)
    const arms = [];
    for (const side of [-1, 1]) {
        const sh = group(torso, side * 0.8, 0.55, 0);
        const late = side > 0 ? 0.3 : 0;
        mesh(sh, G.upperArm, 'upperArm', ORDER.upperArm + late);
        const elbow = group(sh, 0, -0.55, 0);
        mesh(elbow, G.forearm, 'forearm', ORDER.forearm + late, 0.55);
        const hand = group(elbow, 0, -0.61, 0);
        mesh(hand, G.hand, 'hand', ORDER.hand + late, 1.16);
        arms.push({ sh, elbow, hand, side });
    }
    // every bone: where it is in the standing body (the frame of `m`), and how it lies apart
    const r = rand(seed);
    const lie = new THREE.Quaternion().setFromAxisAngle(_X, Math.PI / 2); // (on its back, the head towards +z)
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    for (const p of pieces) {
        p.rest = p.obj.position.clone();
        p.base = new THREE.Vector3().setFromMatrixPosition(p.obj.matrixWorld).applyMatrix4(inv);
        if (!p.geo.boundingBox) p.geo.computeBoundingBox();
        p.bz = p.geo.boundingBox.max.z; // (lying on its back, this side is down)
        p.yaw = (r() - 0.5) * 0.5; // (in the grave: a little askew)
        p.dx = (r() - 0.5) * 0.3;
        p.q0 = new THREE.Quaternion().setFromAxisAngle(_Y, p.yaw).multiply(lie);
        p.p0 = new THREE.Vector3();
        // the heap it falls into at its end: round the feet, any way round
        p.qh = new THREE.Quaternion().setFromAxisAngle(_Y, r() * Math.PI * 2).multiply(lie);
        p.ph = new THREE.Vector3(p.base.x * 0.8 + (r() - 0.5) * 0.9, 0.02 + p.bz, (p.base.y - 2.2) * 0.45 + (r() - 0.5) * 0.9);
        p.out = new THREE.Vector3((r() - 0.5) * 3, 0, (r() - 0.5) * 3); // (broken: the bones fly further)
    }
    root.userData = {
        skel: true, fall, rig, m, legs, knees, body, torso, arms, head, headY: head.position.y, eyes, eyeMat, glow, mouth, s, pieces,
        mats: [bone], base: [bone.color.clone()], own: [eyeMat, glow], trunk: new THREE.Color(SKEL.BONE),
        armLen: [0.55, 0.9], trunkHalf: [0.5, 0.75, 0.42], spine,
    };
    layInGrave(root, 0, 0);
    return root;
}
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);

/**
 * Where its bones lie before they rise: on the floor of the dug grave (`floor` m below its feet), the
 * grave's middle `ahead` m behind it (+z: the skeleton stands at the grave's foot, its back to it),
 * the dead on its back, the head towards the stone. Every bone lies on the floor (none in the earth).
 */
export function layInGrave(model, ahead, floor) {
    for (const p of model.userData.pieces) {
        p.p0.set(p.base.x + p.dx, floor + 0.02 + p.bz, ahead - 2.3 + p.base.y);
    }
}

const _p = new THREE.Vector3();
const ID = new THREE.Quaternion();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** How far bone `p` is on its way at `a` (0…1 of the building): its turn, then PIECE of the build. */
export const boneProgress = (p, a) => clamp01((a - (p.order / LAST) * (1 - PIECE)) / PIECE);

/** The joints straight (the bones fly to — and from — a body standing straight). */
export function straighten(u) {
    u.body.rotation.set(0, 0, 0);
    u.head.rotation.set(0, 0, 0);
    u.head.position.y = u.headY;
    for (const a of u.arms) { a.sh.rotation.set(0, 0, 0); a.elbow.rotation.set(0, 0, 0); a.hand.rotation.set(0, 0, 0); }
    for (let i = 0; i < 2; i++) { u.legs[i].rotation.set(0, 0, 0); u.knees[i].rotation.set(0, 0, 0); }
}

/**
 * The bones coming together at `a` (0 all in the grave … 1 all in their places). Each one rises out of
 * the hole (up first), crosses over the ground in an arc and comes down onto its place, turning from
 * lying to standing; `onPlace(p)` when one knocks into its place. The joints must be straight.
 */
export function assembleSkeleton(u, a, onPlace = null) {
    for (const p of u.pieces) {
        const e = boneProgress(p, a);
        if (e >= 1) {
            if (!p.placed) { p.placed = true; p.obj.position.copy(p.rest); p.obj.quaternion.copy(ID); onPlace?.(p); }
            continue;
        }
        p.placed = false;
        const h = smooth(0.22, 1, e); // (over the ground only once out of the hole)
        _p.set(p.p0.x + (p.base.x - p.p0.x) * h, p.p0.y + (p.base.y - p.p0.y) * smooth(0, 0.85, e) + Math.sin(Math.PI * e) * SKEL.ARC, p.p0.z + (p.base.z - p.p0.z) * h);
        p.obj.position.copy(p.rest).add(_p.sub(p.base));
        p.obj.quaternion.slerpQuaternions(p.q0, ID, smooth(0.1, 0.9, e));
        p.flying = e > 0;
    }
}

/** Every bone where it belongs (alive: the joints move it). */
export function wholeSkeleton(u) {
    for (const p of u.pieces) { p.obj.position.copy(p.rest); p.obj.quaternion.copy(ID); p.placed = true; p.flying = false; }
}

/**
 * Its end: the bones fall apart (`c` 0 standing … 1 all lying in a heap round its feet on the ground);
 * `broken`: knocked apart — they fly further. The joints must be straight. → true when all lie.
 */
export function scatterSkeleton(u, c, broken = false) {
    let lying = true;
    for (const p of u.pieces) {
        // (the skull and the shoulders fall last: the legs give way first)
        const e = clamp01((c - (1 - p.order / LAST) * 0.25) / 0.25);
        if (e < 1) lying = false;
        const f = e * e; // (falling: faster and faster)
        const k = broken ? 1 : 0;
        _p.set(p.base.x + (p.ph.x + p.out.x * k - p.base.x) * e, p.base.y + (p.ph.y - p.base.y) * f + Math.sin(Math.PI * e) * (broken ? 1.2 : 0.25), p.base.z + (p.ph.z + p.out.z * k - p.base.z) * e);
        p.obj.position.copy(p.rest).add(_p.sub(p.base));
        p.obj.quaternion.slerpQuaternions(ID, p.qh, smooth(0, 0.8, e));
    }
    return lying;
}
