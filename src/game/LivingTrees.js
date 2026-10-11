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
 *  - 15 HP, and only fire hurts it (Инферно, Fire Maxima, a campfire, burning).
 *    Swords, fists, Бомбардо, lightning, «Авада Кедавра» do nothing. Burnt, it
 *    blackens and collapses.
 *  - A golden apple tree doesn't come alive.
 *
 * Multiplayer: the host moves the trees and decides; the caster's own computer
 * counts their mana and asks the host to end the tree when it runs out.
 */

import * as THREE from 'three';
import { BLOCK, TREE_KINDS, BASE_COLORS } from '../world/Terrain.js';

export const ALIVE = {
    COST: 25, // mana at once
    DRAIN: 0.5, // mana a second while it lives
    REGEN: 1, // mana a second back (where the free world's rules don't already give it)
    HP: 15,
    RANGE: 50, // m from its caster
    AIM: 14, // m: the tree pointed at
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
};

/** Only fire hurts a living tree. */
const FIRE = new Set(['Inferno', 'InfernoMaxima', 'FireMaxima', 'Fire', 'fire', 'campfire', 'burn', 'burning']);
export const isFireDamage = (kind) => FIRE.has(kind);
/** How much of a blow of `kind` a living tree takes. */
export const aliveDamage = (kind, dmg) => (FIRE.has(kind) ? dmg : 0);
/** The caster's mana after dt seconds of their living tree (Creative: no limit). */
export const aliveDrain = (mana, dt, creative = false) => (creative ? mana : Math.max(0, mana - ALIVE.DRAIN * dt));

const PHASES = ['rise', 'alive', 'stiff', 'fall', 'burn'];
const WHY = ['', 'mana', 'far', 'stop'];
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

    /** Targets for weapons (a blade or a fist touches it — and does nothing). */
    targets() { return this.list.filter((t) => t.phase === 'rise' || t.phase === 'alive' || t.phase === 'stiff'); }

    // ================================================================ cast
    /** «Alive» said with the hand pointing at a tree. */
    cast(isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = g._interimCast;
        if (isFinal && early && early.name === 'Alive' && now - early.at < 3000) { g._interimCast = null; return null; }
        if (now - this._last < 1500) return null;
        const say = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (this.mine().length) return say('🌳 Ваше живое дерево уже ходит за вами. Скажите «стоп», чтобы отпустить его');
        const h = g.builder?._hand();
        if (!h) return say('🌳 Поднимите руку, направьте её на дерево и скажите «Alive»');
        const aim = this.aimAt(h.o, h.d);
        if (aim?.golden) return say('🌳 Золотые деревья не оживают');
        if (!aim) return say('🌳 Направьте руку на дерево (не дальше 14 м) и скажите «Alive»');
        // mana
        const c = g.combat;
        const cost = c?.costOf ? c.costOf('Alive') : ALIVE.COST;
        if (!this.creative) {
            if (c?.frozen || c?.stunned) return say(c.check('Alive'));
            if ((c?.fatigue ?? 0) < cost) {
                const msg = `😮‍💨 Не хватает маны: нужно ${cost}, есть ${Math.floor(c?.fatigue ?? 0)}`;
                g.hud.toast?.(msg);
                return say(msg);
            }
            c.fatigue = Math.max(0, c.fatigue - cost);
        }
        this._last = now;
        g._interimCast = isFinal ? null : { name: 'Alive', at: now };
        const d = this._takeTree(aim);
        const me = g.character.group.position;
        d.ry = Math.atan2(-(me.x - d.x), -(me.z - d.z)); // (it wakes facing its caster)
        // the magic flies from the hand into the tree
        for (let i = 0; i < 30; i++) {
            const p = _v.copy(h.o).lerp(_v2.set(d.x, d.y + 4, d.z), Math.random());
            g.fx?.spark(p, i % 2 ? 0x9cff6b : 0xffd23a, 0.12, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.8);
        }
        if (this.auth) this.spawn(d, g.localId);
        else g.sync?.aliveCast?.(d);
        g.mana?.success?.('Alive'); // (mana: the tree really came alive)
        g.hud.setVoice('🌳 <b>Alive!</b> Дерево оживает… Оно живёт, пока у вас есть мана', true);
        return 'Alive';
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
        const cell = g.builder?._hitCell(o, d, ALIVE.AIM);
        const kind = cell ? TREE_KINDS.findIndex((k) => k.wood === cell.type || k.leaves === cell.type) : -1;
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
        const model = livingTreeModel(d);
        model.position.set(d.x, d.y, d.z);
        model.rotation.y = d.ry || 0;
        g.scene.add(model);
        const t = {
            id: id ?? (g.localId || 'h') + ':' + (++this._seq), owner, master: owner, masterUntil: 0, isLivingTree: true,
            model, group: model, d: { x: d.x, y: d.y, z: d.z, kind: d.kind | 0, trunk: d.trunk, leaf: d.leaf, h: d.h || 10 },
            hp: ALIVE.HP, phase: 'rise', form: 0, theta: 0, omega: 0, pt: 0, why: '',
            walkT: 0, speed: 0, swing: null, swingSide: 0, nextSwing: 0.5, burnT: 0, fireCd: 0, damageCooldown: 0,
            get isDead() { return this.phase === 'fall' || this.phase === 'burn' || this.gone; },
            get position() { return this.model.position; },
        };
        this.list.push(t);
        this.byId.set(t.id, t);
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
    /** A blow / a spell reached it: only fire counts. */
    hit(t, dmg, kind = null) {
        if (!t || t.isDead) return;
        const g = this.game;
        const p = t.model.position;
        if (!aliveDamage(kind, dmg)) {
            for (let i = 0; i < 6; i++) g.fx?.spark(_v.set(p.x, p.y + 3, p.z), t.model.userData.trunk.getHex(), 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
            if (performance.now() - this._saidAt > 4000) {
                this._saidAt = performance.now();
                g.hud?.setVoice?.(kind === 'AvadaKedavra' ? '🌳 «Авада Кедавра» не берёт живое дерево — его убивает только огонь' : '🌳 Живому дереву это не вредит — только огонь', true);
            }
            return;
        }
        if (!this.auth) return; // (the host replays the fire too and decides)
        t.hp = Math.max(0, t.hp - dmg);
        this.ignite(t);
        if (t.hp <= 0) this._burnDown(t);
    }

    /** Fire touched it: it burns for a while. */
    ignite(t) {
        if (t.isDead) return;
        t.burnT = ALIVE.BURN;
    }

    /** The Inferno stream along a ray. */
    burnAlong(o, d, len) {
        for (const t of this.list) {
            if (t.isDead || t.fireCd > 0) continue;
            const p = t.model.position, s = t.model.userData.s;
            // the stream, metre by metre: does it reach the body (feet to crown)?
            for (let a = 0.5; a <= len; a += 0.75) {
                const q = _v.copy(o).addScaledVector(d, a);
                if (Math.hypot(q.x - p.x, q.z - p.z) > 2.2 * s || q.y < p.y - 1 || q.y > p.y + 10 * s) continue;
                t.fireCd = 0.6;
                this.hit(t, 3, 'Inferno');
                break;
            }
        }
    }

    /** Fire at a point (Fire Maxima and the like): only fire kinds do anything. */
    hitAt(p, radius, dmg, kind) {
        if (!isFireDamage(kind)) return;
        for (const t of this.list) {
            if (t.isDead) continue;
            const q = t.model.position;
            if (Math.hypot(q.x - p.x, q.z - p.z) < radius + 1.5 * t.model.userData.s && p.y > q.y - 2 && p.y < q.y + 11) this.hit(t, dmg, kind);
        }
    }

    _burnDown(t) {
        t.phase = 'burn';
        t.pt = 0;
        t.burnT = ALIVE.COLLAPSE;
        if (t.owner === this.game.localId) this.game.hud?.setVoice?.('🔥 Ваше живое дерево сгорело', true);
    }

    // ================================================================= end
    /** (authority) It turns back into a tree (then falls). */
    end(t, why = 'stop') {
        if (!t || (t.phase !== 'rise' && t.phase !== 'alive')) return false;
        t.phase = 'stiff';
        t.pt = 0;
        t.why = why;
        t.swing = null;
        if (t.owner === this.game.localId) this._sayEnd(why);
        return true;
    }

    _sayEnd(why) {
        const g = this.game;
        g.hud?.setVoice?.(why === 'mana' ? '🌳 Мана кончилась — дерево деревенеет и падает'
            : why === 'far' ? '🌳 Вы ушли дальше 50 м — дерево деревенеет и падает'
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

    /** «стоп»: my living trees let go. */
    stopMine() {
        let n = 0;
        for (const t of this.mine()) if (this.requestEnd(t, 'stop')) n++;
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
            c.fatigue = aliveDrain(c.fatigue, dt, false);
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
        if (t.phase === 'rise') {
            t.form = Math.min(1, t.form + dt / ALIVE.GROW);
            if (t.form >= 1) { t.phase = 'alive'; t.pt = 0; }
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
        // the 50 m rule (and a caster who left the game)
        if (t.phase === 'rise' || t.phase === 'alive') {
            const op = t.owner === g.localId ? g.character.group.position : g.remotes?.get(t.owner)?.position;
            if (!op || Math.hypot(op.x - p.x, op.z - p.z) > ALIVE.RANGE) this.end(t, 'far');
        }
        if (t.phase !== 'alive') { t.speed = 0; return; }
        this._think(t, dt);
    }

    _think(t, dt) {
        const g = this.game;
        const p = t.model.position;
        const s = t.model.userData.s;
        const reach = ALIVE.REACH * s;
        const plan = g.servants?.plan('t', t, p, reach) || { mode: 'stay', x: p.x, z: p.z };
        t.nextSwing -= dt;
        let speed = 0, face = null;
        if (plan.mode === 'strike') {
            face = plan.enemy;
            if (!t.swing && t.nextSwing <= 0) {
                t.swing = { t: 0, target: { k: plan.enemy.k, id: plan.enemy.id }, hit: false };
                t.swingSide = 1 - t.swingSide;
                t.nextSwing = ALIVE.SWING_GAP;
            }
        } else if (plan.mode === 'chase' || plan.mode === 'follow') {
            speed = plan.mode === 'chase' ? ALIVE.RUN : ALIVE.SPEED;
            face = plan;
        } else {
            const mp = g.servants?._masterPos(t.master);
            if (mp) face = mp;
        }
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
                p.addScaledVector(to.normalize(), step);
                g.collision?.resolveCylinder?.(p, 0.95 * s, p.y, 3.0, 1.05);
            } else speed = 0;
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
                    g.servants.damage(t.swing.target, ALIVE.DMG, dir, t.master, 'tree');
                    for (let i = 0; i < 10; i++) g.fx?.spark(_v.set(tp.x, tp.y + 1.2, tp.z), 0x9a7040, 0.12, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.6);
                }
            }
            if (t.swing.t >= 1) t.swing = null;
        }
    }

    /** The body as the phase and the moment say (every computer). */
    _pose(t, dt) {
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

    /** It is solid: I can't walk through it. */
    _solid() {
        const g = this.game;
        const me = g.character?.group.position;
        if (!me) return;
        for (const t of this.list) {
            if (t.phase === 'fall' || t.phase === 'burn') continue;
            const p = t.model.position, R = 1.4 * t.model.userData.s;
            const dx = me.x - p.x, dz = me.z - p.z, d = Math.hypot(dx, dz);
            if (d < R && d > 1e-4 && me.y < p.y + 9 * t.model.userData.s) { me.x = p.x + dx / d * R; me.z = p.z + dz / d * R; }
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
            t.d.trunk, t.d.leaf, t.d.h, t.d.kind, t.swing ? r(t.swing.t) : -1, t.swingSide, t.burnT > 0 ? 1 : 0, WHY.indexOf(t.why), r(t.speed), r(t.pt)]);
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
            const [id, x, y, z, ry, ph, form, theta, hp, owner, master, trunk, leaf, h, kind, sw, side, burning, why, speed, pt] = e;
            seen.add(id);
            let t = this.byId.get(id);
            if (!t) { t = this.spawn({ x, y, z, ry, trunk, leaf, h, kind }, owner, id); t.model.position.set(x, y, z); }
            t.net = (t.net || new THREE.Vector3()).set(x, y, z);
            t.model.rotation.y = ry;
            const phase = PHASES[ph] || 'alive';
            if (phase === 'stiff' && t.phase !== 'stiff' && owner === me) this._sayEnd(WHY[why] || 'stop');
            if (phase === 'burn' && t.phase !== 'burn' && owner === me) this.game.hud?.setVoice?.('🔥 Ваше живое дерево сгорело', true);
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
