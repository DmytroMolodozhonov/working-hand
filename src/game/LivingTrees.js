/**
 * LivingTrees.js — «Alive»: a tree comes alive and obeys its caster.
 *
 *  - Point the raised hand at a tree and say «Alive» (25 mana at once): the tree's
 *    blocks leave the world and the tree itself starts to move — in about 3 seconds
 *    its branches grow out into arms with twig fingers, glowing eyes and a jagged
 *    mouth open in the bark, its roots pull out of the ground as legs and it stands up.
 *  - It is its caster's servant: it walks after them, guards them, and beats their
 *    enemies with its branches (the ones «Атак» points at first).
 *  - It lives only while its caster has mana: while it is alive their mana does not
 *    come back but drains (ALIVE.DRAIN a second). When the mana is gone — or the
 *    caster goes farther than 50 m, or says «стоп» — it turns back into a tree in a
 *    few seconds (the limbs stiffen, the roots dig in) and then falls over: a fallen
 *    tree lies there, made of its own wood and leaves, and can be gathered.
 *    (In Creative mana doesn't limit: it lives until «стоп» or the 50 m rule.)
 *  - 15 HP; fire hurts it (Инферно, Fire Maxima, a campfire, burning), and so do lightning and the
 *    mightiest spells (MIGHTY_ON_TREES: Total Destruction, Circle Attack, Inspirius)
 *    Swords, fists, Бомбардо, lightning, «Авада Кедавра» do nothing. Burnt, it
 *    blackens and collapses.
 *  - A golden apple tree doesn't come alive.
 *  - Said at a grave of a village graveyard, «Alive» raises its dead: a skeleton (Skeletons.js) —
 *    a living tree in principle (`t.skel`, the same servant, concentration, mana, 15 HP), but it
 *    rises out of the grave, and blades and fists break its bones too («Авада» still doesn't).
 *
 * Multiplayer: the host moves the trees and decides; the caster's own computer
 * counts their mana and asks the host to end the tree when it runs out.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS, BASE_COLORS } from '../world/Terrain.js';
import { creditKill } from './Mana.js';
import { avoidStep } from './Avoid.js';
import { FACE, facesTarget } from './FaceTarget.js';
import { skeletonModel, skeletonDamage, graveOnRay, graveClosed, SKEL } from './Skeletons.js';

export const ALIVE = {
    COST: 25, // mana at once
    DRAIN: 0.5, // mana a second while it lives
    REGEN: 1, // mana a second back (where the free world's rules don't already give it)
    HP: 15,
    RANGE: 50, // m from its caster
    AIM: 14, // m: the tree pointed at
    AIM_SLACK: 0.12, // rad: a tree this much beside the line of the hand still counts
    GROW: 3, // s to come alive
    STIFFEN: 2.6, // s to turn back into a tree
    SPEED: 2.8, // m/s walking after its master
    RUN: 4.4, // m/s at an enemy / back to the master
    REACH: 3.4, // m its branches reach
    SWING: 1.0, // s one blow
    SWING_GAP: 1.7, // s between blows
    DMG: 4,
    BURN: 5, // s it burns after the fire touched it
    BURN_DPS: 1.5,
    COLLAPSE: 2.6, // s burning down
    // its distance from its master: a tree is big — it keeps KEEP m between its master and its crown's
    // edge (CROWN × s from its middle), steps back when they come nearer, follows when they go on
    KEEP: 5, // m
    CROWN: 1.9, // m: half its width at s = 1 (the crown, the branch arms)
    SLACK: 1.2, // m either side of that distance it just stands
    BODY_R: 1.1, // m: its trunk with the root legs at s = 1 (nobody walks through it, it walks through nobody)
    NEAR: 1.5, // m: even fighting, at least this much between its body and its master's
    // «Alive Maxima»: twice the mana; every grave of the graveyard / the trees round come alive
    MAX_R: 14, // m round the tree pointed at
    MAX_N: 6, // trees at most (the one pointed at too)
    MAX_DRAIN: 1, // mana a second for each of them
};
const PLAYER_R = 0.48; // (Game's PLAYER_RADIUS)

/**
 * Where a living tree with no enemy goes: to KEEP m from its master (from its crown's edge),
 * back from them when they come too near, and nowhere while it is about right.
 * me, master: {x, z}; s: the tree's size. → {mode: 'follow'|'chase'|'back'|'stay', x, z, d}
 */
export function treeFollowPlan(me, master, s = 1, keep = ALIVE.KEEP + ALIVE.CROWN * s) {
    const dx = master.x - me.x, dz = master.z - me.z, d = Math.hypot(dx, dz);
    if (d < 1e-4) return { mode: 'back', x: me.x + keep, z: me.z, d };
    const k = (d - keep) / d; // (< 0: away from them)
    if (d > keep + ALIVE.SLACK) return { mode: d > keep + 6 ? 'chase' : 'follow', x: me.x + dx * k, z: me.z + dz * k, d };
    if (d < keep - ALIVE.SLACK) return { mode: 'back', x: me.x + dx * k, z: me.z + dz * k, d };
    return { mode: 'stay', x: me.x, z: me.z, d };
}

/** Fire hurts a living tree (and sets it burning). */
const FIRE = new Set(['Inferno', 'Hellfire', 'InfernoMaxima', 'FireMaxima', 'Fire', 'fire', 'campfire', 'burn', 'burning']);
export const isFireDamage = (kind) => FIRE.has(kind);
/**
 * …and so do lightning (electricity), the bursting spells («Бомбардо», «Бомбардо Максима» — there
 * is fire in them; they tear the tree apart) and the mightiest spells (80+ mana — the author):
 * «Total Destruction» (+ Maxima), «Circle Attack» (+ Maxima), «Inspirius». Blades, fists,
 * «Авада» and the other spells still do nothing.
 */
export const MIGHTY_ON_TREES = new Set(['Lightning', 'LightningStrike', 'Bombardo', 'BombardoMaxima', 'TotalDestruction', 'TotalDestructionMaxima', 'CircleAttack', 'CircleAttackMaxima', 'Inspirius']);
/** These tear it apart (splinters; killed — it falls like a felled trunk) instead of burning it. */
const TEARS = new Set(['Bombardo', 'BombardoMaxima', 'TotalDestruction', 'TotalDestructionMaxima', 'CircleAttack', 'CircleAttackMaxima', 'Inspirius']);
/** How much of a blow of `kind` a living tree takes. */
export const aliveDamage = (kind, dmg) => (FIRE.has(kind) || MIGHTY_ON_TREES.has(kind) ? dmg : 0);
/** The caster's mana after dt seconds of their living tree (Creative: no limit). */
export const aliveDrain = (mana, dt, creative = false, rate = ALIVE.DRAIN) => (creative ? mana : Math.max(0, mana - rate * dt));
/** How fast my servants drain my mana: «Alive» 0.5 a second, each one of «Alive Maxima» 1. */
export const aliveRate = (list) => list.reduce((a, t) => a + (t.d?.max ? ALIVE.MAX_DRAIN : ALIVE.DRAIN), 0);

const PHASES = ['rise', 'alive', 'stiff', 'fall', 'burn'];
const WHY = ['', 'mana', 'far', 'stop', 'focus'];
const LEG = 2.6; // m: the root legs (s = 1)
const CHAR = new THREE.Color(0x2a2420);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The monster made of a tree's own colours: trunk body, branch arms, root legs, a crown for a head. */
export function livingTreeModel({ trunk = 0x8b4513, leaf = 0x228b22, h = 10 } = {}) {
    const s = Math.min(1.3, Math.max(0.75, h / 10));
    const root = new THREE.Group();
    const fall = new THREE.Group(); // (the topple turns round the feet)
    root.add(fall);
    const rig = new THREE.Group(); // (sunk into the ground while it is a tree)
    rig.scale.setScalar(s);
    fall.add(rig);
    const bark = new THREE.MeshLambertMaterial({ color: trunk });
    const barkDark = new THREE.MeshLambertMaterial({ color: new THREE.Color(trunk).multiplyScalar(0.62) });
    const leaves = new THREE.MeshLambertMaterial({ color: leaf });
    const hole = new THREE.MeshBasicMaterial({ color: 0x120804 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(trunk).multiplyScalar(0.5) });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const throat = new THREE.MeshBasicMaterial({ color: 0x8a1200 });
    const tooth = new THREE.MeshLambertMaterial({ color: new THREE.Color(trunk).lerp(new THREE.Color(0xf0e2b0), 0.7) });
    const box = (parent, w, hh, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
    // legs: thick roots, root toes spreading on the ground
    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.55, LEG, 0);
        box(hip, 0.8, LEG, 0.8, bark, 0, -LEG / 2, 0);
        box(hip, 0.5, 0.9, 0.5, barkDark, side * 0.2, -LEG * 0.55, -0.25);
        for (let i = 0; i < 3; i++) {
            const toe = box(hip, 0.26, 0.26, 1.3, barkDark, 0, -LEG + 0.12, 0);
            toe.rotation.y = side * 0.5 + (i - 1) * 0.75;
            toe.position.x = Math.sin(toe.rotation.y) * -0.55;
            toe.position.z = Math.cos(toe.rotation.y) * -0.55;
        }
        rig.add(hip);
        legs.push(hip);
    }
    // the body: the trunk
    const body = new THREE.Group();
    body.position.y = LEG;
    rig.add(body);
    box(body, 1.7, 4.4, 1.5, bark, 0, 2.2, 0);
    box(body, 0.5, 1.4, 0.3, barkDark, 0.5, 1.2, 0.72);
    box(body, 0.4, 1.0, 0.3, barkDark, -0.55, 3.0, -0.72);
    // the face: deep sockets with glowing eyes under angry brows, a jagged mouth
    const face = new THREE.Group();
    face.position.set(0, 0, -0.76);
    body.add(face);
    const eyes = [];
    for (const side of [-1, 1]) {
        box(face, 0.56, 0.42, 0.06, hole, side * 0.42, 3.4, 0);
        eyes.push(box(face, 0.36, 0.22, 0.06, eyeMat, side * 0.42, 3.38, -0.03));
        box(face, 0.9, 0.7, 0.04, glow, side * 0.42, 3.38, -0.07);
        const brow = box(face, 0.8, 0.2, 0.2, barkDark, side * 0.42, 3.72, -0.06);
        brow.rotation.z = side * 0.45;
    }
    const mouth = new THREE.Group();
    mouth.position.set(0, 2.25, 0);
    face.add(mouth);
    box(mouth, 1.2, 0.85, 0.06, hole, 0, 0, 0);
    box(mouth, 0.9, 0.5, 0.05, throat, 0, -0.05, -0.02);
    for (let i = 0; i < 6; i++) { const t = box(mouth, 0.17, 0.17, 0.08, tooth, -0.5 + i * 0.2, 0.36, -0.05); t.rotation.z = Math.PI / 4; t.scale.y = 1.8; }
    for (let i = 0; i < 5; i++) { const t = box(mouth, 0.16, 0.16, 0.08, tooth, -0.4 + i * 0.2, -0.36, -0.05); t.rotation.z = Math.PI / 4; t.scale.y = 1.6; }
    // arms: branches with an elbow and twig fingers
    const arms = [];
    for (const side of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(side * 1.0, LEG + 4.0, 0);
        box(sh, 0.5, 2.6, 0.5, bark, 0, -1.3, 0);
        box(sh, 1.0, 0.8, 0.9, leaves, side * 0.15, 0.1, 0.1);
        const elbow = new THREE.Group();
        elbow.position.y = -2.6;
        sh.add(elbow);
        box(elbow, 0.4, 2.2, 0.4, bark, 0, -1.1, 0);
        const handG = new THREE.Group();
        handG.position.y = -2.2;
        elbow.add(handG);
        for (let i = 0; i < 4; i++) {
            const f = box(handG, 0.12, 1.1, 0.12, barkDark, 0, -0.5, 0);
            f.rotation.z = (i - 1.5) * 0.35;
            f.rotation.x = -0.25;
            f.position.x = Math.sin(f.rotation.z) * 0.5;
        }
        box(handG, 0.35, 0.3, 0.35, leaves, 0, 0, 0);
        rig.add(sh);
        arms.push({ sh, elbow, side });
    }
    // the head: its crown
    const head = new THREE.Group();
    head.position.set(0, LEG + 4.4, 0);
    rig.add(head);
    box(head, 3.8, 2.6, 3.4, leaves, 0, 1.4, 0.1);
    box(head, 2.4, 1.8, 2.4, leaves, 0.6, 2.9, -0.1);
    box(head, 2.0, 1.6, 2.0, leaves, -1.3, 2.0, 0.9);
    box(head, 0.2, 1.2, 0.2, barkDark, 1.2, 3.4, -0.9).rotation.z = -0.5;
    box(head, 0.2, 1.0, 0.2, barkDark, -1.4, 3.2, -0.6).rotation.z = 0.6;
    root.userData = { fall, rig, legs, body, arms, head, eyes, eyeMat, glow, mouth, s, mats: [bark, barkDark, leaves, tooth], base: [bark.color.clone(), barkDark.color.clone(), leaves.color.clone(), tooth.color.clone()], trunk: new THREE.Color(trunk) };
    return root;
}

export class LivingTrees {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.byId = new Map();
        this._netT = 0;
        this._fireT = 0;
        this._seq = 0;
        this._saidAt = 0;
        this._barShown = false;
        this._last = 0;
    }

    get auth() { return this.game.authority; }
    get creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }

    /** My living trees (still alive or coming alive). */
    mine() {
        const me = this.game.localId;
        return this.list.filter((t) => t.owner === me && (t.phase === 'rise' || t.phase === 'alive'));
    }

    /** Is my mana going into a living tree now (so it doesn't come back)? */
    get draining() { return !this.creative && this.mine().length > 0; }

    /**
     * A sword's or an axe's edge took off a branch arm (Dismember.js, where the tree is decided):
     * it is wood — no blood, no harm to its life (only fire kills it); that arm strikes no more.
     */
    onCut(t, sv) {
        if (t.swing && sv.limb === 'branch' + t.swingSide) t.swing = null;
    }

    /** Targets for weapons (a fist touches it and does nothing; a blade can take off a branch arm — Dismember). */
    targets() { return this.list.filter((t) => t.phase === 'rise' || t.phase === 'alive' || t.phase === 'stiff'); }

    // ================================================================ cast
    /**
     * «Alive» said with the hand pointing at a tree (or at a grave: its dead rises — a skeleton).
     * «Alive Maxima» (`maxima`): the same, twice the mana — and everything round comes alive at once:
     * every closed grave of that graveyard, or the trees within ALIVE.MAX_R of the one pointed at
     * (up to ALIVE.MAX_N); each of them then drains ALIVE.MAX_DRAIN mana a second.
     */
    cast(isFinal = true, maxima = false) {
        const g = this.game;
        const name = maxima ? 'AliveMaxima' : 'Alive';
        const now = Date.now();
        const early = g._interimCast;
        if (isFinal && early && early.name === name && now - early.at < 3000) { g._interimCast = null; return null; }
        if (now - this._last < 1500) return null;
        const say = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.mine().length) return say(this.mine()[0].skel ? '💀 Ваши мертвецы уже ходят за вами. Скажите «стоп», чтобы отпустить их' : '🌳 Ваше живое дерево уже ходит за вами. Скажите «стоп», чтобы отпустить его');
        const h = g.builder?._hand();
        if (!h) return say('🌳 Поднимите руку, направьте её на дерево или могилу и скажите «Alive»');
        const data = g.terrain?.data || g.builder?.data;
        const taken = (q) => this.list.some((t) => t.d.gid === q.id);
        const open = (q) => !graveClosed(data, q) || taken(q);
        // a grave pointed at (nearer than any tree on the line): its dead rises
        const grave = graveOnRay(g.castleLife?.index, h.o, h.d);
        const aim = this.aimAt(h.o, h.d);
        let graves = null, trees = null;
        if (grave && (!aim || aim.dist > grave.dist)) {
            graves = maxima ? (grave.castle?.graves || [grave.grave]).filter((q) => !open(q)) : open(grave.grave) ? [] : [grave.grave];
            if (!graves.length) return say(maxima ? '💀 На этом кладбище все могилы уже разрыты' : '💀 Эта могила уже разрыта — в ней никого нет');
        } else {
            if (aim?.golden) return say(aim.golden.red ? '🌳 Яблони не оживают' : '🌳 Золотые деревья не оживают'); // (apple trees — golden and ordinary — are not the voxel trees «Alive» wakes)
            if (!aim) return say('🌳 Направьте руку на дерево или могилу (не дальше 14 м) и скажите «Alive»');
            trees = maxima ? [aim, ...this._treesRound(aim)] : [aim];
        }
        // mana
        const c = g.combat;
        const cost = c?.costOf ? c.costOf(name) : ALIVE.COST * (maxima ? 2 : 1);
        if (!this.creative) {
            if (c?.frozen || c?.stunned) return say(c.check(name));
            if ((c?.fatigue ?? 0) < cost) {
                const msg = `😮‍💨 Не хватает маны: нужно ${cost}, есть ${Math.floor(c?.fatigue ?? 0)}`;
                g.hud.toast?.(msg);
                return say(msg);
            }
            c.fatigue = Math.max(0, c.fatigue - cost);
        }
        this._last = now;
        g._interimCast = isFinal ? null : { name, at: now };
        const me = g.character.group.position;
        const list = graves
            ? graves.map((q) => ({ skel: 1, gid: q.id, x: q.x, y: q.y, z: q.z, ry: q.yaw, ex: q.exit.x, ez: q.exit.z, kind: 0, trunk: SKEL.BONE, leaf: 0, h: 2 }))
            : trees.map((t) => { const d = this._takeTree(t); d.ry = Math.atan2(-(me.x - d.x), -(me.z - d.z)); return d; }); // (it wakes facing its caster)
        list.forEach((d, i) => {
            if (maxima) { d.max = 1; d.delay = i ? 0.4 + Math.random() * 1.6 : 0; } // (not all in one breath)
            // the magic flies from the hand into the tree / the grave
            for (let k = 0; k < (maxima ? 14 : 30); k++) {
                const p = _v.copy(h.o).lerp(_v2.set(d.x, d.y + (d.skel ? 0.3 : 4), d.z), Math.random());
                g.fx?.spark(p, k % 2 ? (d.skel ? 0x7dff9a : 0x9cff6b) : (d.skel ? 0xb06bff : 0xffd23a), 0.12, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
            }
            if (this.auth) this.spawn(d, g.localId);
            else g.sync?.aliveCast?.(d);
        });
        g.mana?.success?.(name); // (mana: it really came alive)
        const n = list.length;
        g.hud.setVoice(graves
            ? (maxima ? `💀 <b>Alive Максима!</b> Кладбище оживает — встают мертвецы: ${n}. Каждый тратит 1 ману в секунду` : '💀 <b>Alive!</b> Могила дрожит… Мертвец встаёт и живёт, пока у вас есть мана')
            : (maxima ? `🌳 <b>Alive Максима!</b> Лес оживает — деревьев: ${n}. Каждое тратит 1 ману в секунду` : '🌳 <b>Alive!</b> Дерево оживает… Оно живёт, пока у вас есть мана'), true);
        return name;
    }

    /** «Alive Maxima» in a wood: the other trees within ALIVE.MAX_R of the one pointed at (nearest first, up to MAX_N − 1). */
    _treesRound(aim) {
        const g = this.game, data = g.builder?.data;
        const at = aim.inst ? { x: aim.inst.x, z: aim.inst.z, L: null } : { x: aim.cell.x, z: aim.cell.z, L: aim.cell.L };
        const out = [];
        // spawn-area trees (drawn apart from the blocks)
        for (const t of g.world?.trees || []) {
            if (!t.alive || t === aim.inst) continue;
            const d = Math.hypot(t.x - at.x, t.z - at.z);
            if (d > 0.5 && d <= ALIVE.MAX_R) out.push({ inst: t, d });
        }
        // voxel trees: the feet of their trunks (wood with no wood under it)
        if (data) {
            const L0 = at.L ?? (data.topLayer?.(Math.round(at.x), Math.round(at.z)) ?? 0);
            const feet = [];
            for (let x = Math.round(at.x - ALIVE.MAX_R); x <= Math.round(at.x + ALIVE.MAX_R); x++) for (let z = Math.round(at.z - ALIVE.MAX_R); z <= Math.round(at.z + ALIVE.MAX_R); z++) {
                if (Math.hypot(x - at.x, z - at.z) > ALIVE.MAX_R) continue;
                for (let L = L0 - 12; L <= L0 + 12; L++) {
                    const type = data.get(x, L, z);
                    const kind = TREE_KINDS.findIndex((k) => k.wood === type);
                    if (kind < 0 || data.get(x, L - 1, z) === type) continue;
                    feet.push({ cell: { x, L, z, type }, kind, x, z });
                    break;
                }
            }
            // (the aimed tree's own trunk, and one trunk per tree)
            const aimFoot = aim.cell ? { x: aim.cell.x, z: aim.cell.z } : at;
            for (const f of feet) {
                if (Math.hypot(f.x - aimFoot.x, f.z - aimFoot.z) < 3) continue;
                if (out.some((o) => Math.hypot((o.inst?.x ?? o.cell.x) - f.x, (o.inst?.z ?? o.cell.z) - f.z) < 3)) continue;
                out.push({ cell: f.cell, kind: f.kind, d: Math.hypot(f.x - at.x, f.z - at.z) });
            }
        }
        return out.sort((a, b) => a.d - b.d).slice(0, ALIVE.MAX_N - 1);
    }

    /**
     * The tree the hand points at (the nearest along the ray): a spawn-area tree,
     * a voxel tree, or a golden apple tree (which doesn't come alive).
     */
    aimAt(o, d) {
        const g = this.game;
        let best = null;
        const t = g.builder?._treeOnRay(o, d, ALIVE.AIM);
        if (t) best = { inst: t, dist: Math.hypot(t.x - o.x, t.z - o.z) };
        let cell = g.builder?._hitCell(o, d, ALIVE.AIM);
        let kind = cell ? TREE_KINDS.findIndex((k) => k.wood === cell.type || k.leaves === cell.type) : -1;
        // (a hand never points exactly: a trunk or a crown just beside the line counts too — not one behind a hill)
        if (kind < 0) { cell = this._treeNearRay(o, d, cell ? Math.min(ALIVE.AIM, cell.point.distanceTo(o) + 2) : ALIVE.AIM); kind = cell ? cell.kind : -1; }
        if (kind >= 0) {
            const dist = Math.hypot(cell.x - o.x, cell.L - 1 - o.y, cell.z - o.z);
            if (!best || dist < best.dist) best = { cell, kind, dist };
        }
        for (const tr of g.animals?.trees?.values() || []) {
            if (!tr) continue;
            const to = _v.set(tr.x - o.x, tr.y + 2.5 - o.y, tr.z - o.z);
            const dist = to.length();
            if (dist > ALIVE.AIM || d.angleTo(to.normalize()) > 0.35) continue;
            if (!best || dist < best.dist) best = { golden: tr, dist };
        }
        return best;
    }

    /** The tree block nearest to the line of the hand (within ~7°), up to `max` m: {x, L, z, type, kind} | null. */
    _treeNearRay(o, d, max) {
        const data = this.game.builder?.data;
        if (!data) return null;
        let best = null;
        for (let t = 1; t <= max; t += 0.5) {
            const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
            const r = Math.max(0.7, t * ALIVE.AIM_SLACK);
            for (let x = Math.round(px - r); x <= Math.round(px + r); x++) for (let z = Math.round(pz - r); z <= Math.round(pz + r); z++) {
                for (let L = Math.floor(py - r + 1.5); L <= Math.floor(py + r + 1.5); L++) {
                    const type = data.get(x, L, z);
                    const kind = TREE_KINDS.findIndex((k) => k.wood === type || k.leaves === type);
                    if (kind < 0) continue;
                    // how far the block's middle is off the line, as an angle
                    const bx = x - o.x, by = L - 1 - o.y, bz = z - o.z;
                    const along = bx * d.x + by * d.y + bz * d.z;
                    if (along < 0.5 || along > max) continue;
                    const off = Math.sqrt(Math.max(0, bx * bx + by * by + bz * bz - along * along)) - 0.5;
                    const miss = Math.max(0, off) / along;
                    if (miss > ALIVE.AIM_SLACK) continue;
                    if (!best || miss < best.miss - 0.01 || (miss < best.miss + 0.01 && along < best.along)) best = { x, L, z, type, kind, miss, along };
                }
            }
        }
        return best;
    }

    /** The tree leaves the world (its blocks / its instance): what the monster is made of. */
    _takeTree(aim) {
        const g = this.game;
        if (aim.inst) {
            const t = aim.inst;
            const k = TREE_KINDS[t.kind || 0];
            g.world.removeTree(t);
            g.sync?.treeGone?.(t.index);
            return { x: t.x, y: g.collision.groundY(t.x, t.z), z: t.z, kind: t.kind || 0, trunk: BASE_COLORS[k.wood], leaf: BASE_COLORS[k.leaves], h: 11 };
        }
        const k = TREE_KINDS[aim.kind];
        const b = g.builder;
        const cells = b._flood(aim.cell, (x) => x === k.wood || x === k.leaves, 7, 600);
        const data = b.data;
        let minL = Infinity, maxL = -Infinity;
        for (const c of cells) { minL = Math.min(minL, c.L); maxL = Math.max(maxL, c.L); }
        // the trunk's foot: the lowest wood
        let sx = 0, sz = 0, n = 0;
        for (const c of cells) if (data.get(c.x, c.L, c.z) === k.wood && c.L === minL) { sx += c.x; sz += c.z; n++; }
        if (!n) { for (const c of cells) { sx += c.x; sz += c.z; n++; } }
        const edits = [];
        for (const c of cells) { data.set(c.x, c.L, c.z, BLOCK.AIR); edits.push([c.x, c.L, c.z, BLOCK.AIR]); }
        b._sendEdits(edits);
        return { x: sx / n, y: minL - 1.5, z: sz / n, kind: aim.kind, trunk: BASE_COLORS[k.wood], leaf: BASE_COLORS[k.leaves], h: Math.max(6, maxL - minL + 1) };
    }

    // ============================================================== spawn
    /** (authority, or a guest copying the host) A tree monster comes into being. */
    spawn(d, owner, id = null) {
        const g = this.game;
        const skel = !!d.skel;
        const model = skel ? skeletonModel() : livingTreeModel(d);
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry || 0;
        g.scene.add(model);
        const t = {
            id: id ?? (g.localId || 'h') + ':' + (++this._seq), owner, master: owner, masterUntil: 0, isLivingTree: true,
            model, group: model, d: { x: d.x, y: d.y, z: d.z, kind: d.kind | 0, trunk: d.trunk, leaf: d.leaf, h: d.h || 10, skel: skel ? 1 : 0, gid: d.gid || '', ex: d.ex ?? d.x, ez: d.ez ?? d.z, ry: d.ry || 0, max: d.max ? 1 : 0 },
            skel, // (a skeleton raised from a grave: Skeletons.js)
            hp: ALIVE.HP, phase: 'rise', form: -(Math.min(3, +d.delay || 0)) / (skel ? SKEL.RISE : ALIVE.GROW), // («Alive Maxima»: one after another)
            theta: 0, omega: 0, pt: 0, why: '',
            walkT: 0, speed: 0, swing: null, swingSide: 0, nextSwing: 0.5, burnT: 0, fireCd: 0, damageCooldown: 0,
            get isDead() { return this.phase === 'fall' || this.phase === 'burn' || this.gone; },
            get position() { return this.model.position; },
        };
        this.list.push(t);
        this.byId.set(t.id, t);
        // (host, a new tree: who of the people saw its caster wake it — only they will know it is his, Blame.js)
        if (this.auth && id == null) g.castleLife?.witnessCast?.(owner, 'Alive');
        // (host: the dead rising in a graveyard frightens the village — Danger.js «undead»)
        if (this.auth && id == null && skel) g.castleLife?.alarm?.({ x: d.x, y: d.y, z: d.z }, 'undead', owner, 8);
        return t;
    }

    _remove(t) {
        const g = this.game;
        t.gone = true;
        g.scene.remove(t.model);
        t.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
        for (const m of t.model.userData.mats) m.dispose();
        this.list.splice(this.list.indexOf(t), 1);
        this.byId.delete(t.id);
    }

    // ============================================================= damage
    /** A blow / a spell reached it: only fire, lightning and the mightiest spells count (aliveDamage). */
    hit(t, dmg, kind = null, by = null) {
        if (!t || t.isDead) return;
        if (t.skel) return this._hitSkel(t, dmg, kind, by);
        const g = this.game;
        const p = t.model.position;
        if (!aliveDamage(kind, dmg)) {
            for (let i = 0; i < 6; i++) g.fx?.spark(_v.set(p.x, p.y + 3, p.z), t.model.userData.trunk.getHex(), 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
            if (performance.now() - this._saidAt > 4000) {
                this._saidAt = performance.now();
                g.hud?.setVoice?.(kind === 'AvadaKedavra' ? '🌳 «Авада Кедавра» не берёт живое дерево — его убивает только огонь' : '🌳 Живому дереву это не вредит — только огонь, молния или самые мощные заклинания', true);
            }
            return;
        }
        if (!this.auth) return; // (the host replays the fire too and decides)
        if (by != null) t.lastBy = by; // (who set it burning: the mana for it, if it burns down)
        t.hp = Math.max(0, t.hp - dmg);
        if (TEARS.has(kind)) {
            // a burst tears it: splinters of bark and wood, leaves; killed — it is torn apart and falls
            const u = t.model.userData;
            for (let i = 0; i < 14; i++) g.fx?.debris?.spawn(p.x + (Math.random() - 0.5) * 1.6 * u.s, p.y + 1 + Math.random() * 6 * u.s, p.z + (Math.random() - 0.5) * 1.6 * u.s,
                (Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9, i % 3 ? u.trunk.getHex() : 0x3f7a2a, 0.15 + Math.random() * 0.3, 2, { shrink: 0.1, fade: false, spin: 10 });
            if (t.hp <= 0) this._tornApart(t);
            return;
        }
        this.ignite(t); // (fire and lightning set it burning)
        if (t.hp <= 0) this._burnDown(t);
    }

    /**
     * A blow / a spell reached a skeleton (Skeletons.js): fire burns it as a tree, bursts / lightning /
     * the mightiest spells and blades, fists, servants' blows break it; duel charges do nothing
     * (SKEL_DUEL_IMMUNE: it is not quite alive — «Авада Кедавра» doesn't kill it).
     */
    _hitSkel(t, dmg, kind, by) {
        const g = this.game;
        const p = t.model.position;
        const got = skeletonDamage(kind, dmg);
        if (!got) {
            for (let i = 0; i < 5; i++) g.fx?.spark(_v.set(p.x, p.y + 1.2, p.z), 0x7dff9a, 0.08, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
            if (performance.now() - this._saidAt > 4000) {
                this._saidAt = performance.now();
                g.hud?.setVoice?.(kind === 'AvadaKedavra' ? '💀 «Авада Кедавра» не берёт скелета — он не совсем живой' : '💀 Скелету это не вредит — его разрушают огонь, «Бомбардо», молния и удары оружием', true);
            }
            return; // (SKEL_DUEL_IMMUNE)
        }
        // (a blow of mine on a guest's screen: the host decides)
        if (!this.auth) { if (!isFireDamage(kind) && by === g.localId) g.sync?.aliveHit?.(t.id, got, kind); return; }
        if (by != null) t.lastBy = by;
        t.hp = Math.max(0, t.hp - got);
        if (isFireDamage(kind) || kind === 'Lightning' || kind === 'LightningStrike') { this.ignite(t); if (t.hp <= 0) this._burnDown(t); return; }
        // bones crack: chips fly
        for (let i = 0; i < 6; i++) g.fx?.debris?.spawn(p.x + (Math.random() - 0.5) * 0.4, p.y + 0.6 + Math.random() * 1.0, p.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4, SKEL.BONE, 0.04 + Math.random() * 0.05, 1.5, { shrink: 0.1, fade: false, spin: 10 });
        if (t.hp <= 0) this._tornApart(t);
    }

    /** (authority) A burst killed it: torn apart, it topples like a felled trunk (no fire). */
    _tornApart(t) {
        if (t.lastBy != null) creditKill(this.game, t.lastBy, { kind: 'livingTree' }); // (mana: a magical creature)
        t.form = 0;
        t.swing = null;
        t.phase = 'fall'; t.pt = 0; t.theta = 0.12; t.omega = 0.6;
        if (t.skel) { t.theta = 0.35; t.broken = true; } // (a skeleton: knocked apart — it falls into its bones)
        if (t.owner === this.game.localId) this.game.hud?.setVoice?.(t.skel ? '💥 Ваш скелет разбит на кости' : '💥 Ваше живое дерево разорвало', true);
    }

    /** Fire touched it: it burns for a while. */
    ignite(t) {
        if (t.isDead) return;
        t.burnT = ALIVE.BURN;
    }

    /** The Inferno stream along a ray. */
    burnAlong(o, d, len, by = null) {
        let burnt = false;
        for (const t of this.list) {
            if (t.isDead || t.fireCd > 0) continue;
            const p = t.model.position, s = t.model.userData.s;
            // the stream, metre by metre: does it reach the body (feet to crown)?
            for (let a = 0.5; a <= len; a += 0.75) {
                const q = _v.copy(o).addScaledVector(d, a);
                if (Math.hypot(q.x - p.x, q.z - p.z) > 2.2 * s || q.y < p.y - 1 || q.y > p.y + 10 * s) continue;
                t.fireCd = 0.6;
                this.hit(t, 3, 'Inferno', by);
                burnt = true;
                break;
            }
        }
        return burnt;
    }

    /** Fire / lightning / a mighty spell at a point: only what aliveDamage counts does anything. */
    hitAt(p, radius, dmg, kind) {
        if (!aliveDamage(kind, 1)) return;
        for (const t of this.list) {
            if (t.isDead) continue;
            const q = t.model.position;
            if (Math.hypot(q.x - p.x, q.z - p.z) < radius + 1.5 * t.model.userData.s && p.y > q.y - 2 && p.y < q.y + 11) this.hit(t, dmg, kind);
        }
    }

    _burnDown(t) {
        if (t.phase !== 'burn' && t.lastBy != null) creditKill(this.game, t.lastBy, { kind: 'livingTree' }); // (mana: a magical creature)
        t.phase = 'burn';
        t.pt = 0;
        t.burnT = ALIVE.COLLAPSE;
        if (t.owner === this.game.localId) this.game.hud?.setVoice?.(t.skel ? '🔥 Ваш скелет сгорел' : '🔥 Ваше живое дерево сгорело', true);
    }

    // ================================================================= end
    /** (authority) It turns back into a tree (then falls). */
    end(t, why = 'stop') {
        if (!t || (t.phase !== 'rise' && t.phase !== 'alive')) return false;
        t.phase = 'stiff';
        t.pt = 0;
        t.why = why;
        t.swing = null;
        if (t.owner === this.game.localId) this._sayEnd(why, t.skel);
        return true;
    }

    _sayEnd(why, skel = false) {
        const g = this.game;
        if (skel) {
            g.hud?.setVoice?.(why === 'mana' ? '💀 Мана кончилась — магия уходит, скелет рассыпается'
                : why === 'far' ? '💀 Вы ушли дальше 50 м — скелет рассыпается'
                : why === 'focus' ? '💀 Концентрация сорвалась — скелет рассыпается'
                : '🛑 Стоп — магия уходит, скелет рассыпается на кости', true);
            return;
        }
        g.hud?.setVoice?.(why === 'mana' ? '🌳 Мана кончилась — дерево деревенеет и падает'
            : why === 'far' ? '🌳 Вы ушли дальше 50 м — дерево деревенеет и падает'
            : why === 'focus' ? '🌳 Концентрация сорвалась — дерево деревенеет и падает'
            : '🛑 Стоп — живое дерево снова становится деревом и падает', true);
    }

    /** My tree must end (mana gone, «стоп»): the host decides. */
    requestEnd(t, why) {
        if (this.auth) return this.end(t, why);
        if (t._asked) return false;
        t._asked = why;
        this.game.sync?.aliveEnd?.(t.id, why);
        return true;
    }

    /** «стоп» (or my concentration lost — 'focus', Concentration.js): my living trees let go. */
    stopMine(why = 'stop') {
        let n = 0;
        for (const t of this.mine()) if (this.requestEnd(t, why)) n++;
        return n > 0;
    }

    /** (host) A fallen tree lies there: its own wood and leaves on the ground (it can be gathered). */
    _lay(t) {
        const g = this.game;
        const data = g.terrain?.data;
        const p = t.model.position;
        const ry = t.model.rotation.y;
        const dx = -Math.sin(ry), dz = -Math.cos(ry);
        const k = TREE_KINDS[t.d.kind] || TREE_KINDS[0];
        const len = Math.max(5, Math.round(t.d.h * 0.62));
        const edits = [];
        const put = (x, z, up, type) => {
            if (!data) return;
            const L = data.topLayer(x, z) + 1 + up;
            if (data.get(x, L, z) !== BLOCK.AIR) return;
            data.set(x, L, z, type);
            edits.push([x, L, z, type]);
        };
        const cells = [];
        for (let i = 0; i < len; i++) cells.push([Math.round(p.x + dx * i), Math.round(p.z + dz * i)]);
        const seen = new Set();
        for (const [x, z] of cells) { const key = x + ',' + z; if (seen.has(key)) continue; seen.add(key); put(x, z, 0, k.wood); }
        // the crown at its end
        const cx = p.x + dx * (len + 1.5), cz = p.z + dz * (len + 1.5);
        for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
            if (ox * ox + oz * oz > 5) continue;
            const x = Math.round(cx + ox), z = Math.round(cz + oz);
            put(x, z, 0, k.leaves);
            if (ox * ox + oz * oz <= 2) put(x, z, 0, k.leaves);
        }
        if (edits.length) g.builder?._sendEdits(edits);
        t.laid = edits.length;
        for (let i = 0; i < 40; i++) g.fx?.spark(_v.set(cx + (Math.random() - 0.5) * 5, p.y + 0.5, cz + (Math.random() - 0.5) * 5), i % 2 ? 0x9a8a70 : k.leaves === BLOCK.LEAVES ? 0x2e8b2e : BASE_COLORS[k.leaves], 0.2, _v2.set((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4), 1.0);
    }

    // =============================================================== frame
    update(dt) {
        const g = this.game;
        this._mana(dt);
        if (!this.list.length) { this._sendNet(dt); return; }
        if (this.auth) {
            this._fireT -= dt;
            const campfire = this._fireT <= 0;
            if (campfire) this._fireT = 0.5;
            for (const t of [...this.list]) this._step(t, dt, campfire);
        } else {
            for (const t of this.list) if (t.net) {
                t.model.position.lerp(t.net, Math.min(1, dt * 8));
                t.walkT += dt * t.speed * 1.6;
            }
        }
        for (const t of this.list) { t.age = (t.age || 0) + dt; this._pose(t, dt); }
        this._solid();
        this._sendNet(dt);
    }

    /** My mana: drains while my tree lives (and comes back otherwise where the free world's rules don't do it). */
    _mana(dt) {
        const g = this.game, c = g.combat;
        if (!c) return;
        const mine = this.mine();
        const max = c.maxFatigue || 30;
        if (mine.length && !this.creative) {
            c.fatigue = aliveDrain(c.fatigue, dt, false, aliveRate(mine));
            if (c.fatigue <= 0) for (const t of mine) this.requestEnd(t, 'mana');
        } else if (!c.enabled && !this.creative && c.fatigue < max && !c.dead) c.fatigue = Math.min(max, c.fatigue + ALIVE.REGEN * dt);
        // (outside the free world the mana bar shows while it matters)
        if (!c.enabled && !this.creative) {
            const show = mine.length > 0 || c.fatigue < max;
            const key = Math.floor(c.fatigue) + '/' + max;
            if (show && (key !== this._barKey || !this._barShown)) { this._barKey = key; g.hud?.setFatigue?.(c.fatigue, max); }
            else if (this._barShown) g.hud?.hidePvp?.();
            this._barShown = show;
        }
    }

    /** (authority) One tree's frame: phases, walking, fighting, fire. */
    _step(t, dt, campfire) {
        const g = this.game;
        const p = t.model.position;
        t.pt += dt;
        if (t.fireCd > 0) t.fireCd -= dt;
        // fire
        if (!t.isDead && campfire && g.campfires?._fireAt?.(p, 1.8, 1.4, true)) this.hit(t, 1, 'campfire');
        if (t.burnT > 0 && t.phase !== 'burn' && !t.isDead) {
            t.burnT -= dt;
            t.hp = Math.max(0, t.hp - ALIVE.BURN_DPS * dt);
            if (t.hp <= 0) this._burnDown(t);
        }
        if (t.phase === 'rise' && t.skel) {
            // out of the grave: shaking, a hand, the earth bursts (the grave is dug), it climbs out
            t.form = Math.min(1, t.form + dt / SKEL.RISE);
            if (t.form >= SKEL.OPEN && !t.dug) this._digGrave(t);
            const k = smooth(SKEL.CLIMB + 0.15, 1, t.form);
            p.x = t.d.x + (t.d.ex - t.d.x) * k; p.z = t.d.z + (t.d.ez - t.d.z) * k;
            p.y = t.d.y;
            if (t.form >= 1) { t.phase = 'alive'; t.pt = 0; }
        } else if (t.phase === 'rise') {
            t.form = Math.min(1, t.form + dt / ALIVE.GROW);
            if (t.form >= 1) { t.phase = 'alive'; t.pt = 0; }
        } else if (t.phase === 'fall' && t.skel) {
            // it falls into a heap of bones, and the bones lie a while and are gone
            t.theta = Math.min(1, t.theta + dt / SKEL.COLLAPSE);
            if (t.theta >= 1) this._remove(t);
            return;
        } else if (t.phase === 'stiff' && t.skel) {
            t.form = Math.max(0, t.form - dt / (ALIVE.STIFFEN * 0.6));
            if (t.form <= 0) { t.phase = 'fall'; t.pt = 0; t.theta = 0; }
        } else if (t.phase === 'stiff') {
            t.form = Math.max(0, t.form - dt / ALIVE.STIFFEN);
            if (t.form <= 0) { t.phase = 'fall'; t.pt = 0; t.theta = 0.04; t.omega = 0; }
        } else if (t.phase === 'fall') {
            // it topples like a felled trunk: slowly at first, faster and faster
            const L = Math.max(4, t.d.h * 0.8);
            t.omega += (1.5 * 9.8 / L) * Math.sin(t.theta) * dt;
            t.theta += t.omega * dt;
            if (t.theta >= Math.PI / 2) { t.theta = Math.PI / 2; this._lay(t); this._remove(t); }
            return;
        } else if (t.phase === 'burn') {
            t.burnT -= dt;
            if (t.burnT <= 0) this._remove(t);
            return;
        }
        // the 50 m rule (and a caster who left the game); a dead caster's concentration is gone: the tree
        // lives for it (Concentration.js — the host ends it even if the caster's computer never asked)
        if (t.phase === 'rise' || t.phase === 'alive') {
            const rp = t.owner === g.localId ? null : g.remotes?.get(t.owner);
            const op = t.owner === g.localId ? g.character.group.position : rp?.position;
            if (t.owner === g.localId ? (g.isDeadLocal || g.combat?.dead) : rp?.dead) this.end(t, 'focus');
            else if (!op || Math.hypot(op.x - p.x, op.z - p.z) > ALIVE.RANGE) this.end(t, 'far');
        }
        if (t.phase !== 'alive' || t.lev) { t.speed = 0; return; } // (held up by «Левиоса Максима»: it carries the tree)
        this._think(t, dt);
    }

    _think(t, dt) {
        const g = this.game;
        const p = t.model.position;
        const s = t.model.userData.s;
        const reach = t.skel ? SKEL.REACH : ALIVE.REACH * s;
        let plan = g.servants?.plan('t', t, p, reach) || { mode: 'stay', x: p.x, z: p.z };
        // (no enemy: a big tree keeps a comfortable distance from its master — never comes up close)
        const mp = g.servants?._masterPos?.(t.master);
        if (!plan.enemy && mp) plan = treeFollowPlan(p, mp, s, t.skel ? SKEL.KEEP : undefined);
        t.nextSwing -= dt;
        let speed = 0, face = null;
        if (plan.mode === 'strike') {
            face = plan.enemy;
            // («лицом к цели»: the branch comes down only on what is in front of it — first it turns)
            // (a branch arm cut off by a blade no longer strikes: the other one does — none, no blows)
            const lost = t.model.limbs || {};
            const has = (side) => lost['branch' + side] == null;
            if (!t.swing && t.nextSwing <= 0 && (has(0) || has(1)) && facesTarget(t.model.rotation.y, p.x, p.z, plan.enemy.x, plan.enemy.z, FACE.MELEE)) {
                t.swing = { t: 0, target: { k: plan.enemy.k, id: plan.enemy.id }, hit: false };
                t.swingSide = has(1 - t.swingSide) ? 1 - t.swingSide : t.swingSide;
                t.nextSwing = ALIVE.SWING_GAP;
            }
        } else if (plan.mode === 'chase' || plan.mode === 'follow') {
            speed = plan.mode === 'chase' ? (t.skel ? SKEL.RUN : ALIVE.RUN) : (t.skel ? SKEL.SPEED : ALIVE.SPEED);
            face = plan;
        } else if (plan.mode === 'back') {
            speed = ALIVE.SPEED * 0.7; // (it steps back, still facing its master)
            face = mp;
        } else if (mp) face = mp;
        if (face) {
            const want = Math.atan2(-(face.x - p.x), -(face.z - p.z));
            let dy = want - t.model.rotation.y;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            t.model.rotation.y += dy * Math.min(1, dt * 3);
        }
        if (speed > 0 && !t.swing) {
            const to = _v.set(plan.x - p.x, 0, plan.z - p.z);
            const d = to.length();
            if (d > 0.2) {
                const step = Math.min(d, speed * dt);
                to.normalize();
                // round the people in its way (its master above all), never through them
                const people = this._people(t, mp);
                if (people.length) { const a = avoidStep(p, to, people, { r: ALIVE.BODY_R * s, look: 3 + 2 * s, maxF: d }); if (!a.wait) to.set(a.x, 0, a.z); else to.set(0, 0, 0); }
                p.addScaledVector(to, step);
                g.collision?.resolveCylinder?.(p, 0.95 * s, p.y, 3.0, 1.05);
            } else speed = 0;
        }
        // its body never goes into a player (a guard, whatever it is doing)
        for (const o of this._people(t, mp)) {
            const dx = p.x - o.x, dz = p.z - o.z, dd = Math.hypot(dx, dz), min = ALIVE.BODY_R * s + o.r;
            if (dd >= min) continue;
            if (dd > 1e-4) { p.x = o.x + dx / dd * min; p.z = o.z + dz / dd * min; } else p.x = o.x + min;
        }
        t.speed = t.swing ? 0 : speed;
        const gy = g.collision?.groundAt ? g.collision.groundAt(p.x, p.z, p.y + 1.2) : g.collision?.groundY(p.x, p.z) ?? p.y;
        p.y += (gy - p.y) * Math.min(1, dt * 6);
        // the blow: the branch comes up and slams down on the enemy
        if (t.swing) {
            t.swing.t += dt / ALIVE.SWING;
            if (!t.swing.hit && t.swing.t >= 0.5) {
                t.swing.hit = true;
                const tp = g.servants?.pos(t.swing.target.k, t.swing.target.id);
                if (tp && Math.hypot(tp.x - p.x, tp.z - p.z) < reach * 1.3) {
                    const dir = new THREE.Vector3(tp.x - p.x, 0, tp.z - p.z).normalize();
                    g.servants.damage(t.swing.target, ALIVE.DMG, dir, t.master, t.skel ? 'skeleton' : 'tree', { x: p.x, z: p.z, ref: { k: 't', id: t.id } });
                    for (let i = 0; i < 10; i++) g.fx?.spark(_v.set(tp.x, tp.y + 1.2, tp.z), t.skel ? SKEL.BONE : 0x9a7040, 0.12, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.6);
                }
            }
            if (t.swing.t >= 1) t.swing = null;
        }
    }

    /** The body as the phase and the moment say (every computer). */
    _pose(t, dt) {
        if (t.skel) return this._poseSkel(t, dt);
        const u = t.model.userData;
        const k = t.form;
        // the roots come out of the ground: the body rises by the legs' height
        const legsOut = smooth(0.5, 1, k);
        const shake = (t.phase === 'rise' || t.phase === 'stiff') && k > 0.02 && k < 0.98 ? Math.sin(performance.now() / 45) * 0.04 : 0;
        u.rig.position.y = -LEG * u.s * (1 - legsOut) + shake;
        u.rig.rotation.z = shake * 0.5;
        // the branches grow out of the crown into arms
        const arm = smooth(0, 0.45, k);
        const walk = t.speed > 0.1 ? Math.min(1, t.speed / 3) : 0;
        t.walkT += dt * t.speed * 1.4;
        for (const a of u.arms) {
            const swingIt = t.swing && (a.side > 0 ? 1 : 0) === t.swingSide ? t.swing.t : -1;
            a.sh.scale.setScalar(0.35 + 0.65 * arm);
            a.sh.rotation.z = a.side * (2.7 * (1 - arm) + 0.35 * arm);
            let rx = Math.sin(t.walkT + (a.side > 0 ? Math.PI : 0)) * 0.45 * walk;
            if (swingIt >= 0) rx = swingIt < 0.4 ? -2.5 * smooth(0, 0.4, swingIt) : swingIt < 0.6 ? -2.5 + 2.1 * smooth(0.4, 0.6, swingIt) : -0.4 * (1 - smooth(0.6, 1, swingIt));
            a.sh.rotation.x = rx;
            a.elbow.rotation.x = -0.45 * arm;
        }
        u.legs.forEach((l, i) => { l.rotation.x = Math.sin(t.walkT + i * Math.PI) * 0.5 * walk; });
        u.body.rotation.y = Math.sin(t.walkT * 0.5) * 0.06 * walk;
        u.head.rotation.z = Math.sin(performance.now() / 700) * 0.05 * arm;
        // the eyes light up, the mouth opens
        const eye = smooth(0.25, 0.6, k);
        u.eyeMat.color.copy(u.trunk).multiplyScalar(0.5).lerp(_c.set(0xffd23a), eye);
        u.glow.opacity = 0.55 * eye * (0.8 + 0.2 * Math.sin(performance.now() / 160));
        const open = smooth(0.35, 0.7, k);
        u.mouth.scale.y = 0.08 + 0.92 * open * (t.swing ? 1.15 : 0.85 + 0.15 * Math.sin(performance.now() / 230));
        // the topple
        u.fall.rotation.x = -t.theta;
        // fire: it glows and blackens, burnt it collapses
        const burning = t.burnT > 0 || t.phase === 'burn';
        const black = t.phase === 'burn' ? smooth(0, 0.6, t.pt / ALIVE.COLLAPSE) : 0;
        u.mats.forEach((m, i) => {
            m.color.copy(u.base[i]).lerp(CHAR, black);
            if (m.emissive) m.emissive.setHex(burning ? (Math.random() < 0.5 ? 0x3a1000 : 0x5a1800) : 0x000000);
        });
        if (t.phase === 'burn') {
            const c = smooth(0.3, 1, t.pt / ALIVE.COLLAPSE);
            u.rig.scale.set(u.s * (1 + c * 0.3), u.s * (1 - c * 0.85), u.s * (1 + c * 0.3));
            u.glow.opacity *= 1 - c;
        }
        if (burning && this.game.fx?.glow) {
            const p = t.model.position;
            for (let n = 0; n < 2; n++) {
                this.game.fx.glow.spawn(p.x + (Math.random() - 0.5) * 2.4 * u.s, p.y + Math.random() * 9 * u.s * (t.phase === 'burn' ? 0.5 : 1), p.z + (Math.random() - 0.5) * 2.4 * u.s, (Math.random() - 0.5), 2 + Math.random() * 3, (Math.random() - 0.5),
                    [0xffe08a, 0xffa020, 0xff5a00, 0xd02000][(Math.random() * 4) | 0], 0.5 + Math.random() * 0.6, 0.5 + Math.random() * 0.3, { shrink: 1.2 });
            }
        }
    }

    /**
     * (authority) The earth over the grave bursts open: its plot is dug out (a hole a metre deep), the
     * earth heaped beside it — block edits, sent to everyone and saved with the world (a grave once
     * opened stays open; nobody raises its dead twice).
     */
    _digGrave(t) {
        t.dug = true;
        const g = this.game;
        const data = g.terrain?.data || g.builder?.data;
        if (!data || !t.d.gid) return;
        const q = this._grave(t.d.gid, t.d);
        if (!q) return;
        const edits = [];
        for (const [x, z] of q.cells) if (data.get(x, q.L, z) !== BLOCK.AIR) { data.set(x, q.L, z, BLOCK.AIR); edits.push([x, q.L, z, BLOCK.AIR]); }
        // the heap: beside the plot (the side away from the next grave's row), one block of earth
        const [a, b] = q.cells;
        const sx = Math.sign(Math.round(b[1] - a[1])), sz = -Math.sign(Math.round(b[0] - a[0])); // (across the plot)
        const hx = a[0] + sx, hz = a[1] + sz;
        if (data.get(hx, q.L + 1, hz) === BLOCK.AIR) { data.set(hx, q.L + 1, hz, BLOCK.DIRT); edits.push([hx, q.L + 1, hz, BLOCK.DIRT]); }
        if (edits.length) g.builder?._sendEdits(edits);
    }

    /** A grave by its id, near where it lies (CastleIndex: the graveyards of the villages near). */
    _grave(id, at) {
        const m = /^(cs-?\d+_-?\d+)_g(\d+)$/.exec(id || '');
        if (!m || !at) return null;
        for (const c of this.game.castleLife?.index?.near?.(at.x, at.z, 20) || []) if (c.id === m[1]) return c.graves?.[+m[2]] || null;
        return null;
    }

    /** A skeleton's body as the phase and the moment say (every computer): out of the grave, walking, striking, falling apart. */
    _poseSkel(t, dt) {
        const g = this.game;
        const u = t.model.userData;
        const k = t.form;
        const now = performance.now();
        const p = t.model.position;
        const R = t.phase === 'rise';
        // ---- out of the grave
        const hand = smooth(SKEL.HAND, SKEL.OPEN, k); // a hand comes up
        const climb = smooth(SKEL.CLIMB, 1, k); // it climbs out
        let y = 0, lean = 0;
        if (R) {
            y = k < SKEL.CLIMB ? -2.25 + 0.7 * hand : -1.55 + 1.55 * climb;
            lean = k < SKEL.CLIMB ? 0 : Math.sin(climb * Math.PI) * 0.6; // (bent over the edge, then up)
        }
        // the grave shakes before (the ground over it — the model is still down there)
        const shake = R && k < SKEL.OPEN ? Math.sin(now / 35) * 0.03 * (1 - hand * 0.5) : 0;
        u.rig.position.y = y;
        u.rig.position.x = shake;
        u.body.rotation.x = -lean;
        u.head.rotation.x = -lean * 0.4;
        const walk = t.speed > 0.1 ? Math.min(1, t.speed / 2.5) : 0;
        t.walkT += dt * t.speed * 3.2;
        u.arms.forEach((a, i) => {
            const swingIt = t.swing && (a.side > 0 ? 1 : 0) === t.swingSide ? t.swing.t : -1;
            let rx = Math.sin(t.walkT + (i ? Math.PI : 0)) * 0.5 * walk, rz = a.side * 0.12, el = -0.3;
            if (R) {
                // the right hand first (straight up, fingers clawing), then both, then they grip the edge
                const up = i === 1 ? 1 : smooth(SKEL.OPEN - 0.05, SKEL.CLIMB, k);
                rx = -Math.PI * up * (1 - climb) - 1.3 * climb;
                el = -0.2 - 0.5 * climb;
                a.hand.rotation.x = Math.sin(now / 90 + i) * 0.4 * (1 - climb);
            }
            if (swingIt >= 0) { rx = swingIt < 0.4 ? -2.6 * smooth(0, 0.4, swingIt) : swingIt < 0.6 ? -2.6 + 2.2 * smooth(0.4, 0.6, swingIt) : -0.4 * (1 - smooth(0.6, 1, swingIt)); el = -0.6; }
            if (t.phase === 'stiff') { rx *= k; rz = a.side * (0.12 + 0.3 * (1 - k)); }
            a.sh.rotation.x = rx;
            a.sh.rotation.z = rz;
            a.elbow.rotation.x = el;
        });
        u.legs.forEach((l, i) => {
            const sw = Math.sin(t.walkT + i * Math.PI);
            l.rotation.x = R ? -0.5 * Math.sin(climb * Math.PI) * (i ? 1 : 0.3) : sw * 0.55 * walk;
            u.knees[i].rotation.x = R ? 0.9 * Math.sin(climb * Math.PI) : Math.max(0, -sw) * 0.7 * walk;
        });
        // the jaw chatters; it opens wide on a blow
        u.mouth.rotation.x = t.swing ? 0.5 : (0.05 + 0.08 * (0.5 + 0.5 * Math.sin(now / 80))) * (R ? climb : 1);
        // the eyes: a green fire in the sockets
        const eye = R ? smooth(SKEL.CLIMB, 0.8, k) : t.phase === 'stiff' ? k : t.phase === 'alive' ? 1 : 0;
        u.eyeMat.color.set(0x1a1a14).lerp(_c.set(0x9bffb0), eye);
        u.glow.opacity = 0.8 * eye * (0.75 + 0.25 * Math.sin(now / 120));
        if (t.phase === 'stiff') { u.rig.rotation.z = Math.sin(now / 60) * 0.04 * (1 - k); u.body.rotation.x = -0.25 * (1 - k); }
        // ---- falling into its bones
        if (t.phase === 'fall') {
            const c = t.theta;
            u.legs.forEach((l, i) => { l.rotation.x = -1.4 * c * (i ? 1 : 0.8); u.knees[i].rotation.x = 2.2 * c; });
            u.rig.position.y = -0.85 * smooth(0, 0.8, c);
            u.body.rotation.x = 0.9 * c;
            u.head.position.y = 1.55 - 1.2 * smooth(0.3, 1, c);
            u.head.rotation.z = 1.2 * c;
            u.arms.forEach((a) => { a.sh.rotation.x = 0.6 * c; a.sh.rotation.z = a.side * 1.4 * c; });
            u.eyeMat.color.set(0x1a1a14); u.glow.opacity = 0;
            if (!t._bones && (c > 0.6 || t.broken)) {
                t._bones = true;
                for (let i = 0; i < (t.broken ? 22 : 12); i++) g.fx?.debris?.spawn(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.3 + Math.random() * (t.broken ? 1.4 : 0.6), p.z + (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * (t.broken ? 6 : 2), 0.5 + Math.random() * (t.broken ? 4 : 1.5), (Math.random() - 0.5) * (t.broken ? 6 : 2), i % 4 ? SKEL.BONE : 0xb3a682, 0.05 + Math.random() * 0.08, 6, { shrink: 0.05, fade: false, spin: 8 });
            }
        }
        // ---- the magic: clods and green / violet light out of the grave while it rises
        if (R && g.fx) {
            const q0 = t.d;
            if (k < SKEL.CLIMB + 0.1 && Math.random() < (k < SKEL.HAND ? 0.5 : 0.9)) g.fx.debris?.spawn(q0.x + (Math.random() - 0.5) * 0.9, q0.y + 0.05, q0.z + (Math.random() - 0.5) * 0.9,
                (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5, Math.random() < 0.7 ? 0x5a3f28 : 0x3e2b1a, 0.06 + Math.random() * 0.1, 1.5, { shrink: 0.2, fade: false, spin: 6 });
            if (!t._burst && k >= SKEL.OPEN) {
                // the earth bursts open
                t._burst = true;
                for (let i = 0; i < 40; i++) g.fx.debris?.spawn(q0.x + (Math.random() - 0.5) * 1.2, q0.y + 0.1, q0.z + (Math.random() - 0.5) * 1.6,
                    (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6, Math.random() < 0.75 ? 0x5a3f28 : 0x3e2b1a, 0.1 + Math.random() * 0.18, 2.5, { shrink: 0.15, fade: false, spin: 8 });
                for (let i = 0; i < 30; i++) g.fx.spark?.(_v.set(q0.x, q0.y + 0.2, q0.z), i % 2 ? 0x7dff9a : 0xb06bff, 0.14, _v2.set((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5), 1.0);
            }
            const a = now / 300;
            for (let n = 0; n < 2; n++) {
                const ang = a + n * Math.PI + Math.random() * 0.3, r = 0.9 + 0.3 * Math.sin(now / 500);
                g.fx.spark?.(_v.set(q0.x + Math.cos(ang) * r, q0.y + 0.1 + Math.random() * 1.6 * k, q0.z + Math.sin(ang) * r), n ? 0xb06bff : 0x7dff9a, 0.07, _v2.set(-Math.sin(ang) * 1.2, 0.8 + Math.random(), Math.cos(ang) * 1.2), 0.7);
            }
        }
        // ---- fire: it blackens and its bones crumble
        const burning = t.burnT > 0 || t.phase === 'burn';
        const black = t.phase === 'burn' ? smooth(0, 0.6, t.pt / ALIVE.COLLAPSE) : 0;
        u.mats.forEach((m, i) => {
            m.color.copy(u.base[i]).lerp(CHAR, black);
            if (m.emissive) m.emissive.setHex(burning ? (Math.random() < 0.5 ? 0x3a1000 : 0x5a1800) : 0x000000);
        });
        if (t.phase === 'burn') {
            const c = smooth(0.3, 1, t.pt / ALIVE.COLLAPSE);
            u.rig.scale.set(u.s * (1 + c * 0.3), u.s * (1 - c * 0.85), u.s * (1 + c * 0.3));
            u.glow.opacity *= 1 - c;
        }
        if (burning && g.fx?.glow) {
            for (let n = 0; n < 2; n++) {
                g.fx.glow.spawn(p.x + (Math.random() - 0.5) * 0.6, p.y + Math.random() * 1.8 * (t.phase === 'burn' ? 0.5 : 1), p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.5,
                    [0xffe08a, 0xffa020, 0xff5a00, 0xd02000][(Math.random() * 4) | 0], 0.25 + Math.random() * 0.3, 0.5 + Math.random() * 0.3, { shrink: 1.2 });
            }
        }
    }

    /** The players near a tree as round bodies {x, z, r} (its master's with a margin: it never comes up close). */
    _people(t, mp) {
        const g = this.game, out = this._ppl || (this._ppl = []);
        out.length = 0;
        const p = t.model.position, s = t.model.userData.s;
        const add = (q, id) => {
            if (!q || Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 20 || q.y > p.y + 9 * s || q.y < p.y - 4) return;
            out.push({ x: q.x, z: q.z, r: PLAYER_R + (q === mp || id === t.master ? ALIVE.NEAR : 0.3) });
        };
        if (!g.isDeadLocal && !g.combat?.dead) add(g.character?.group.position, g.localId);
        for (const [id, r] of g.remotes || []) if (!r.dead) add(r.position, id);
        return out;
    }

    /** It is solid: I can't walk through it. */
    _solid() {
        const g = this.game;
        const me = g.character?.group.position;
        if (!me) return;
        for (const t of this.list) {
            if (t.phase === 'fall' || t.phase === 'burn') continue;
            const p = t.model.position, R = ALIVE.BODY_R * t.model.userData.s + PLAYER_R;
            const dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz);
            if (d >= R || me.y > p.y + 9 * t.model.userData.s) continue;
            if (d > 1e-4) { me.x = p.x + dx / d * R; me.z = p.z + dz / d * R; } else me.x = p.x + R;
        }
    }

    // ============================================================ network
    _sendNet(dt) {
        const g = this.game;
        if (!this.auth || !g.sync?.livingTrees) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.1;
        const r = (v) => Math.round(v * 100) / 100;
        const list = this.list.map((t) => [t.id, r(t.model.position.x), r(t.model.position.y), r(t.model.position.z), r(t.model.rotation.y), PHASES.indexOf(t.phase), r(t.form), r(t.theta), r(t.hp), t.owner, t.master,
            t.d.trunk, t.d.leaf, t.d.h, t.d.kind, t.swing ? r(t.swing.t) : -1, t.swingSide, t.burnT > 0 ? 1 : 0, WHY.indexOf(t.why), r(t.speed), r(t.pt),
            t.skel ? 1 : 0, t.d.gid, r(t.d.x), r(t.d.y), r(t.d.z), r(t.d.ex), r(t.d.ez), t.broken ? 1 : 0, t.d.max]);
        if (!list.length && !this._sentSome && !g.servants?.netList?.length) return;
        this._sentSome = list.length > 0;
        g.sync.livingTrees(list, g.servants?.netList || []);
    }

    /** (guests) the host's living trees. */
    applyNet(list) {
        const seen = new Set();
        const me = this.game.localId;
        for (const e of list || []) {
            if (!Array.isArray(e) || e.length < 21) continue;
            const [id, x, y, z, ry, ph, form, theta, hp, owner, master, trunk, leaf, h, kind, sw, side, burning, why, speed, pt, skel, gid, gx, gy, gz, ex, ez, broken, max] = e;
            seen.add(id);
            let t = this.byId.get(id);
            if (!t) { t = this.spawn(skel ? { skel: 1, gid, x: gx, y: gy, z: gz, ex, ez, ry, trunk, leaf, h, kind, max } : { x, y, z, ry, trunk, leaf, h, kind, max }, owner, id); t.model.position.set(x, y, z); }
            t.broken = !!broken;
            t.net = (t.net || new THREE.Vector3()).set(x, y, z);
            t.model.rotation.y = ry;
            const phase = PHASES[ph] || 'alive';
            if (phase === 'stiff' && t.phase !== 'stiff' && owner === me) this._sayEnd(WHY[why] || 'stop', t.skel);
            if (phase === 'burn' && t.phase !== 'burn' && owner === me) this.game.hud?.setVoice?.(t.skel ? '🔥 Ваш скелет сгорел' : '🔥 Ваше живое дерево сгорело', true);
            t.phase = phase;
            t.form = form; t.theta = theta; t.hp = hp; t.master = master; t.pt = pt;
            t.swing = sw >= 0 ? { t: sw } : null;
            t.swingSide = side;
            t.burnT = burning ? 1 : 0;
            t.speed = speed;
            if (t.phase !== 'stiff' && t.phase !== 'fall') t._asked = null;
        }
        for (const t of [...this.list]) if (!seen.has(t.id)) this._remove(t);
    }

    dispose() {
        for (const t of [...this.list]) this._remove(t);
    }
}
