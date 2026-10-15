/**
 * Skeletons.js — «Alive» said at a grave (the village graveyards, Castles.js buildGraveyard):
 * the dead rises. It is not a living thing — the same in principle as a living tree, and it is
 * one (LivingTrees.js runs it: `t.skel`): the caster's servant, held by concentration and mana,
 * 15 HP, it beats the caster's enemies; its caster's death / stun / «стоп» lets it go.
 *
 * Not at once: the grave shakes (clods jump), a bony hand comes up out of the earth, the earth
 * bursts open, and the skeleton climbs out of the hole — green and violet magic round it all the
 * while. The grave stays dug open (block edits, saved with the world).
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

export const SKEL = {
    S: 0.25, // its size against a tree's (s): every «× s» size of LivingTrees fits a man's body
    RISE: 7, // s: the grave shakes → a hand → the earth bursts → it climbs out
    HAND: 0.18, // (form) the hand starts coming up
    OPEN: 0.45, // (form) the earth bursts open (the host digs the grave)
    CLIMB: 0.55, // (form) it climbs out
    COLLAPSE: 1.4, // s it falls into a heap of bones
    SPEED: 2.4, RUN: 4.0,
    REACH: 1.5, // m its arms reach
    KEEP: 2.2, // m from its master (it is no bigger than a man)
    AIM: 14, // m: the grave pointed at
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
 * The grave the hand points at (the nearest along the ray, within ~10° and SKEL.AIM m): a grave
 * of a village graveyard near (CastleIndex). → {grave, dist} | null
 */
export function graveOnRay(index, o, d, max = SKEL.AIM) {
    if (!index?.near) return null;
    let best = null;
    for (const c of index.near(o.x, o.z, max)) {
        for (const q of c.graves || []) {
            const dx = q.x - o.x, dy = q.y - o.y, dz = q.z - o.z;
            const along = dx * d.x + dy * d.y + dz * d.z;
            if (along < 0.5 || along > max) continue;
            const off = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
            if (off > Math.max(1.3, along * 0.17)) continue;
            if (!best || along < best.dist) best = { grave: q, dist: along };
        }
    }
    return best;
}

/** Is a grave still closed (its plot still earth)? data: TerrainData. */
export const graveClosed = (data, q) => !data || q.cells.some(([x, z]) => data.get(x, q.L, z) !== 0);

/**
 * The dead's body, bone by bone, in metres (feet at 0, facing −z), wrapped to the living tree's
 * rig (userData: fall, rig, legs, body, arms {sh, elbow, side}, head, eyes, eyeMat, glow, mouth,
 * s, mats, base, trunk) — so everything that meets a living tree meets it too.
 */
export function skeletonModel() {
    const s = SKEL.S;
    const root = new THREE.Group();
    const fall = new THREE.Group();
    root.add(fall);
    const rig = new THREE.Group();
    rig.scale.setScalar(s);
    fall.add(rig);
    const m = new THREE.Group(); // (metres inside)
    m.scale.setScalar(1 / s);
    rig.add(m);
    const bone = new THREE.MeshLambertMaterial({ color: SKEL.BONE });
    const old = new THREE.MeshLambertMaterial({ color: 0xb3a682 });
    const hole = new THREE.MeshBasicMaterial({ color: 0x0a0806 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a14 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const box = (parent, w, h, d, mat, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
    // legs: thigh — knee — shin — foot
    const legs = [], knees = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.11, 0.95, 0);
        box(hip, 0.07, 0.45, 0.07, bone, 0, -0.225, 0);
        const knee = new THREE.Group();
        knee.position.y = -0.47;
        hip.add(knee);
        box(knee, 0.08, 0.07, 0.08, old, 0, 0, 0);
        box(knee, 0.06, 0.44, 0.06, bone, 0, -0.23, 0);
        box(knee, 0.1, 0.05, 0.24, bone, 0, -0.46, -0.06);
        m.add(hip);
        legs.push(hip); knees.push(knee);
    }
    box(m, 0.32, 0.12, 0.16, old, 0, 0.98, 0); // the pelvis
    // the body: spine and ribs
    const body = new THREE.Group();
    body.position.y = 0.98;
    m.add(body);
    box(body, 0.05, 0.52, 0.05, old, 0, 0.27, 0.06); // (first mesh: the spine — the blade stops on it, CutBodies)
    for (let i = 0; i < 5; i++) {
        const w = 0.3 - Math.abs(i - 1.5) * 0.03;
        box(body, w, 0.025, 0.2, bone, 0, 0.22 + i * 0.065, -0.02);
    }
    box(body, 0.04, 0.26, 0.03, bone, 0, 0.35, -0.12); // the breastbone
    box(body, 0.44, 0.04, 0.06, bone, 0, 0.5, 0.02); // the collarbones
    // the head: skull, sockets with a green glow, a jaw that drops
    const head = new THREE.Group();
    head.position.set(0, 1.55, 0);
    m.add(head);
    box(head, 0.04, 0.08, 0.04, old, 0, -0.04, 0.02);
    box(head, 0.21, 0.2, 0.24, bone, 0, 0.12, 0);
    const face = new THREE.Group();
    face.position.set(0, 0, -0.122);
    head.add(face);
    const eyes = [];
    for (const side of [-1, 1]) {
        box(face, 0.065, 0.06, 0.01, hole, side * 0.05, 0.14, 0);
        eyes.push(box(face, 0.03, 0.03, 0.01, eyeMat, side * 0.05, 0.14, -0.004));
        box(face, 0.1, 0.09, 0.01, glow, side * 0.05, 0.14, -0.008);
    }
    box(face, 0.03, 0.04, 0.01, hole, 0, 0.08, 0); // the nose
    const mouth = new THREE.Group();
    mouth.position.set(0, 0.03, 0.1);
    head.add(mouth);
    box(mouth, 0.17, 0.045, 0.2, bone, 0, -0.02, -0.1);
    for (let i = 0; i < 5; i++) box(mouth, 0.02, 0.025, 0.01, old, -0.05 + i * 0.025, 0.01, -0.2);
    // arms: upper arm — elbow — forearm — bony fingers
    const arms = [];
    for (const side of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(side * 0.22, 1.47, 0);
        box(sh, 0.05, 0.3, 0.05, bone, 0, -0.15, 0);
        const elbow = new THREE.Group();
        elbow.position.y = -0.31;
        sh.add(elbow);
        box(elbow, 0.045, 0.28, 0.045, bone, 0, -0.14, 0);
        const hand = new THREE.Group();
        hand.position.y = -0.3;
        elbow.add(hand);
        box(hand, 0.07, 0.05, 0.04, old, 0, 0, 0);
        for (let i = 0; i < 4; i++) { const f = box(hand, 0.014, 0.1, 0.014, bone, -0.024 + i * 0.016, -0.07, -0.005); f.rotation.x = -0.25; }
        m.add(sh);
        arms.push({ sh, elbow, hand, side });
    }
    root.userData = {
        skel: true, fall, rig, legs, knees, body, arms, head, eyes, eyeMat, glow, mouth, s, mats: [bone, old], base: [bone.color.clone(), old.color.clone()],
        trunk: new THREE.Color(SKEL.BONE), armLen: [0.31, 0.42], trunkHalf: [0.17, 0.28, 0.12],
    };
    return root;
}
