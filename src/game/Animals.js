/**
 * Animals.js — cows, pigs, sheep and horses; golden apple trees.
 *
 * Herds of 3–8 graze on the grass and wander. Hit one and it defends
 * itself (65%) — it charges and butts you — or runs away. Sheep stand up
 * for each other: when one is attacked, 65% of the flock around attack you
 * together.
 *
 * A killed animal falls on its side and stays: take its meat by hand (or
 * «Gather» it all at once), up to 10 pieces in a slot. Raw meat +2 HP, a
 * steak +4 HP: burn the carcass (or the living animal) with «Инферно» and
 * the meat is cooked. When all the meat is taken only bones are left.
 *
 * Horses (several colours) can be tamed: hold a golden apple to the horse's
 * head — each apple gives a 30% chance (2 apples 60%, 3 apples 90%) that it
 * lets you up. Jump (or press J) next to it to get on. Ride as you walk:
 * walk / run in place — twice as fast as on foot, plus the horse's own
 * 1–40% bonus. A horse tires (its strength comes back when it rests). Jump
 * again or crouch to get off. A tamed horse is yours for good.
 *
 * Golden apple trees grow here and there: pick the apples by hand (or
 * «Gather»); they grow again in 5 minutes. A golden apple: +10 HP.
 *
 * Multiplayer: the host owns the animals (moves, decides hits, meat);
 * a rider moves their own horse.
 */

import * as THREE from 'three';
import { newUid } from './ItemTypes.js';
import { BLOCK } from '../world/Terrain.js';

export const SPECIES = {
    cow: { name: 'Корова', hp: 10, speed: 1.4, run: 5.5, dmg: 2, meat: 4, size: 1.0 },
    pig: { name: 'Свинья', hp: 6, speed: 1.3, run: 5, dmg: 1, meat: 3, size: 0.7 },
    sheep: { name: 'Баран', hp: 6, speed: 1.3, run: 5.2, dmg: 1, meat: 2, size: 0.75 },
    horse: { name: 'Конь', hp: 12, speed: 1.8, run: 7, dmg: 2, meat: 4, size: 1.15 },
};
const HORSE_COLORS = [0x6b3f1e, 0x2b2118, 0xe8e2d6, 0x9a5a2a, 0x8a8a8a, 0xc49a5a];
const MAX_NEAR = 14;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _inv = new THREE.Matrix4();

let _nextId = Math.floor(Math.random() * 1e5) * 10;

// ------------------------------------------------------------------ models
const _mats = new Map();
function lam(c) {
    if (!_mats.has(c)) _mats.set(c, new THREE.MeshLambertMaterial({ color: c }));
    return _mats.get(c);
}
function bx(g, w, h, d, c, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
}

/** A voxel animal; body along −Z (the head looks forward), feet at y=0. */
export function animalModel(type, color) {
    const g = new THREE.Group();
    const legs = [];
    const leg = (x, z, h, w, c) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, h, z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lam(c));
        m.position.y = -h / 2;
        m.castShadow = true;
        pivot.add(m);
        g.add(pivot);
        legs.push(pivot);
    };
    if (type === 'cow') {
        bx(g, 0.9, 0.75, 1.5, 0xf2f2ee, 0, 1.15, 0);
        bx(g, 0.5, 0.4, 0.45, 0x222222, 0.2, 1.25, 0.2); // patches
        bx(g, 0.4, 0.35, 0.5, 0x222222, -0.26, 1.05, -0.35);
        bx(g, 0.55, 0.55, 0.5, 0xf2f2ee, 0, 1.4, -0.95); // head
        bx(g, 0.4, 0.22, 0.12, 0xe8a0a0, 0, 1.25, -1.22); // nose
        bx(g, 0.1, 0.15, 0.1, 0xddd8c8, 0.25, 1.75, -0.9); bx(g, 0.1, 0.15, 0.1, 0xddd8c8, -0.25, 1.75, -0.9);
        bx(g, 0.08, 0.08, 0.02, 0x000000, 0.15, 1.5, -1.21); bx(g, 0.08, 0.08, 0.02, 0x000000, -0.15, 1.5, -1.21);
        for (const [x, z] of [[0.3, -0.55], [-0.3, -0.55], [0.3, 0.55], [-0.3, 0.55]]) leg(x, z, 0.8, 0.22, 0xf2f2ee);
    } else if (type === 'pig') {
        bx(g, 0.75, 0.6, 1.1, 0xf0a0a8, 0, 0.75, 0);
        bx(g, 0.55, 0.5, 0.45, 0xf0a0a8, 0, 0.85, -0.72);
        bx(g, 0.3, 0.2, 0.08, 0xd97f8a, 0, 0.78, -0.97);
        bx(g, 0.07, 0.07, 0.02, 0x000000, 0.13, 0.95, -0.96); bx(g, 0.07, 0.07, 0.02, 0x000000, -0.13, 0.95, -0.96);
        for (const [x, z] of [[0.24, -0.38], [-0.24, -0.38], [0.24, 0.38], [-0.24, 0.38]]) leg(x, z, 0.45, 0.18, 0xe98f99);
    } else if (type === 'sheep') {
        bx(g, 0.85, 0.75, 1.15, 0xf4f4f0, 0, 0.95, 0); // wool
        bx(g, 0.95, 0.3, 1.0, 0xffffff, 0, 1.25, 0.05);
        bx(g, 0.4, 0.45, 0.42, 0x3a3030, 0, 1.05, -0.75);
        bx(g, 0.08, 0.08, 0.02, 0xffffff, 0.12, 1.12, -0.97); bx(g, 0.08, 0.08, 0.02, 0xffffff, -0.12, 1.12, -0.97);
        bx(g, 0.18, 0.25, 0.18, 0x6b5a4a, 0.25, 1.25, -0.65); bx(g, 0.18, 0.25, 0.18, 0x6b5a4a, -0.25, 1.25, -0.65); // horns
        for (const [x, z] of [[0.25, -0.4], [-0.25, -0.4], [0.25, 0.4], [-0.25, 0.4]]) leg(x, z, 0.6, 0.16, 0x3a3030);
    } else {
        const c = color ?? HORSE_COLORS[0];
        const dark = new THREE.Color(c).multiplyScalar(0.55).getHex();
        bx(g, 0.75, 0.75, 1.7, c, 0, 1.5, 0);
        const neck = bx(g, 0.4, 0.9, 0.45, c, 0, 2.05, -0.8); neck.rotation.x = -0.45;
        bx(g, 0.4, 0.42, 0.8, c, 0, 2.45, -1.2); // head
        bx(g, 0.12, 0.85, 0.15, dark, 0, 2.15, -0.62).rotation.x = -0.45; // mane
        bx(g, 0.12, 0.2, 0.1, c, 0.13, 2.75, -0.95); bx(g, 0.12, 0.2, 0.1, c, -0.13, 2.75, -0.95);
        bx(g, 0.08, 0.08, 0.02, 0x000000, 0.2, 2.55, -1.3); bx(g, 0.08, 0.08, 0.02, 0x000000, -0.2, 2.55, -1.3);
        bx(g, 0.15, 0.7, 0.15, dark, 0, 1.4, 0.92).rotation.x = 0.3; // tail
        g.userData.saddle = bx(g, 0.8, 0.12, 0.6, 0x5a2d0c, 0, 1.92, 0.05);
        g.userData.saddle.visible = false;
        for (const [x, z] of [[0.26, -0.65], [-0.26, -0.65], [0.26, 0.65], [-0.26, 0.65]]) leg(x, z, 1.15, 0.2, c);
    }
    g.userData.legs = legs;
    return g;
}

export function bonesModel() {
    const g = new THREE.Group();
    const m = lam(0xefe9da);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), m); b.position.set((i - 2) * 0.14, 0.05, 0); b.rotation.y = (i - 2) * 0.2; g.add(b); }
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.35), m);
    skull.position.set(0, 0.12, -0.55);
    g.add(skull);
    return g;
}

export function goldenTreeModel() {
    const g = new THREE.Group();
    bx(g, 0.8, 4, 0.8, 0xb8860b, 0, 2, 0);
    const leaf = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x4a3a00 });
    for (const [w, h, d, x, y, z] of [[4.4, 2.2, 4.4, 0, 4.8, 0], [3.2, 1.6, 3.2, 0.2, 6.4, -0.1], [1.8, 1.2, 1.8, -0.2, 7.6, 0.2]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), leaf);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
    }
    const apples = [];
    const appleMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.75, roughness: 0.25, emissive: 0x332200 });
    const spots = [[1.9, 4.0, 0.8], [-1.6, 4.1, 1.3], [0.6, 3.9, -2.0], [-1.0, 4.0, -1.6], [2.0, 4.6, -1.0], [-2.0, 4.5, -0.3]];
    for (const [x, y, z] of spots) {
        const a = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), appleMat);
        a.position.set(x, y - 0.4, z);
        g.add(a);
        apples.push(a);
    }
    g.userData.apples = apples;
    return g;
}

// =================================================================== system
export class Animals {
    constructor(game) {
        this.game = game;
        this.list = []; // living and dead animals
        this.byId = new Map();
        this.trees = new Map(); // golden trees: key -> {x, z, y, model, apples: [{until}]}
        this._spawnT = 3;
        this._netT = 0;
        this._treeT = 0;
        this.riding = null; // the horse I ride
        this._noseHist = [];
        this._feedT = 0;
        this._jumpAt = 0;
        this.enabled = !game.config.map && game.config.mode !== 'test';
    }

    get auth() { return this.game.authority; }

    // --------------------------------------------------------- spawning
    _spawn(type, pos, opts = {}) {
        const g = this.game;
        const id = opts.id ?? (++_nextId);
        if (this.byId.has(id)) return this.byId.get(id);
        const S = SPECIES[type];
        const color = type === 'horse' ? (opts.color ?? HORSE_COLORS[Math.floor(Math.random() * HORSE_COLORS.length)]) : null;
        const model = animalModel(type, color);
        model.scale.setScalar(S.size);
        model.position.copy(pos);
        g.scene.add(model);
        const a = {
            id, type, group: model, model, isAnimal: true, hp: opts.hp ?? S.hp, dead: false, get isDead() { return this.dead; },
            damageCooldown: 0, state: 'graze', t: Math.random() * 5, target: pos.clone(), herd: opts.herd || null,
            attacker: null, stateT: 0, vy: 0, meat: S.meat, cooked: false, color,
            bonus: opts.bonus ?? (type === 'horse' ? 1 + Math.floor(Math.random() * 40) : 0),
            stamina: 100, apples: 0, tamed: opts.tamed || null, rider: null, walkT: Math.random() * 6, bones: null,
        };
        this.list.push(a);
        this.byId.set(id, a);
        return a;
    }

    _spawnHerd() {
        const g = this.game;
        const me = g.character.group.position;
        const types = ['cow', 'pig', 'sheep', 'horse'];
        const type = types[Math.floor(Math.random() * types.length)];
        const n = 3 + Math.floor(Math.random() * 6);
        const a = Math.random() * Math.PI * 2, d = 28 + Math.random() * 25;
        const cx = me.x + Math.cos(a) * d, cz = me.z + Math.sin(a) * d;
        const t = g.terrain?.data;
        if (!t) return;
        const top = t.topLayer(Math.round(cx), Math.round(cz));
        if (t.get(Math.round(cx), top, Math.round(cz)) !== BLOCK.GRASS || t.get(Math.round(cx), top + 1, Math.round(cz)) === BLOCK.WATER) return; // only on grass
        if (t.castles?.landAt(Math.round(cx), Math.round(cz))) return; // (not in castles and villages)
        const herd = { x: cx, z: cz, id: ++_nextId };
        for (let i = 0; i < n; i++) {
            const x = cx + (Math.random() - 0.5) * 8, z = cz + (Math.random() - 0.5) * 8;
            this._spawn(type, new THREE.Vector3(x, g.collision.groundY(x, z) + 0.5, z), { herd });
        }
    }

    _remove(a) {
        const g = this.game;
        g.scene.remove(a.model);
        a.model.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        if (a.bones) { g.scene.remove(a.bones); a.bones.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
        this.list.splice(this.list.indexOf(a), 1);
        this.byId.delete(a.id);
    }

    // ------------------------------------------------------------ damage
    /** Weapons / fists / arrows / spells hit an animal. */
    hit(a, dmg, dir, by, fire = false) {
        if (!a || a.dead) return;
        if (!this.auth) { this.game.sync?.animalHit?.(a.id, dmg, dir, fire); return; }
        a.hp -= dmg;
        a.damageCooldown = 0.35;
        for (let i = 0; i < 6; i++) this.game.fx.spark(_v.copy(a.group.position).add(_v2.set(0, 1, 0)), 0xb3001b, 0.08, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.6);
        if (dir) a.group.position.addScaledVector(_v.copy(dir).setY(0).normalize(), 0.4);
        if (a.hp <= 0) { this._die(a, fire); return; }
        // defend (65%) or run away; sheep stand up for each other
        const attacker = by;
        const fight = Math.random() < 0.65;
        a.state = fight ? 'attack' : 'flee';
        a.attacker = attacker;
        a.stateT = fight ? 15 : 8;
        if (a.type === 'sheep') {
            for (const o of this.list) {
                if (o === a || o.dead || o.type !== 'sheep' || o.group.position.distanceTo(a.group.position) > 14) continue;
                if (Math.random() < 0.65) { o.state = 'attack'; o.attacker = attacker; o.stateT = 15; }
            }
        }
    }

    _die(a, cooked) {
        a.dead = true;
        a.state = 'dead';
        a.cooked = a.cooked || cooked;
        a.deadAt = performance.now();
        if (a.rider === this.game.localId) this.dismount();
        this._layDown(a);
        if (a.type === 'sheep') this.game.beds?.dropWool(a.group.position); // wool for beds
    }

    _layDown(a) {
        a.group.rotation.z = Math.PI / 2;
        a.group.position.y = this.game.collision.groundY(a.group.position.x, a.group.position.z) + 0.35 * SPECIES[a.type].size;
        if (a.cooked) this._tintCooked(a);
    }

    _tintCooked(a) {
        if (a._cookedLook) return;
        a._cookedLook = true;
        a.model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.45).lerp(new THREE.Color(0x5a2d0c), 0.4); } });
    }

    /** Blasts (Bombardo, lightning). */
    hitAt(p, radius, dmg = 6, by = null) {
        for (const a of this.list) if (!a.dead && a.group.position.distanceTo(p) < radius + 1) this.hit(a, dmg, _v.subVectors(a.group.position, p), by);
    }

    /** Ray spells. */
    hitRay(o, d, len, width, dmg = 3, by = null) {
        for (const a of this.list) {
            if (a.dead) continue;
            const to = _v.subVectors(a.group.position, o).add(_v2.set(0, 0.8, 0));
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() < width + 0.9) this.hit(a, dmg, d.clone(), by);
        }
    }

    /** Inferno: living animals burn (and die cooked), carcasses get cooked. */
    burnAlong(o, d, len) {
        for (const a of this.list) {
            const to = _v.subVectors(a.group.position, o);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() > 2.2) continue;
            if (a.dead) { if (!a.cooked && a.meat > 0) { a.cooked = true; this._tintCooked(a); this.game.hud.setVoice?.('🔥 Мясо поджарилось', true); } continue; }
            if (a.damageCooldown <= 0) { a.cooked = true; this.hit(a, 2, d, this.game.localId, true); a.damageCooldown = 0.6; if (!a.dead) a.cooked = false; }
        }
    }

    /** Targets for weapons (the same shape as zombies). */
    targets() {
        return this.list.filter((a) => !a.dead && a.rider !== this.game.localId);
    }

    // ---------------------------------------------------------------- meat
    _takeMeat(a, toId, side) {
        if (!a.dead || a.meat <= 0) return;
        a.meat--;
        const item = { kind: a.cooked ? 'steak' : 'meat', uid: newUid(), count: 1 };
        if (a.meat <= 0) this._toBones(a);
        if (toId === this.game.localId) this._give(item, side);
        else this.game.sync?.animalMeatTo?.(toId, item, side);
    }

    _give(item, side) {
        const g = this.game;
        if (side && !g.items.held[side] && !g.weapons.hands[side].held) g.items.takeIntoHand(item, side);
        else g.inventory.storeItem(item);
        g.hud.setVoice?.(item.kind === 'steak' ? '🍖 Стейк взят' : '🥩 Мясо взято', true);
    }

    _toBones(a) {
        const g = this.game;
        a.model.visible = false;
        if (!a.bones) {
            a.bones = bonesModel();
            a.bones.position.copy(a.group.position).setY(g.collision.groundY(a.group.position.x, a.group.position.z));
            a.bones.rotation.y = a.group.rotation.y;
            g.scene.add(a.bones);
        }
        a.bonesAt = performance.now();
    }

    /** «Gather» pointed at a carcass / a golden tree: everything to the slots. Returns a hint or null. */
    gatherAt(o, d) {
        const g = this.game;
        for (const a of this.list) {
            if (!a.dead || a.meat <= 0) continue;
            const to = _v.subVectors(a.group.position, o);
            if (to.length() > 10 || d.angleTo(to.normalize()) > 0.3) continue;
            const n = a.meat;
            if (this.auth) { for (let i = 0; i < n; i++) this._takeMeat(a, g.localId, null); }
            else g.sync?.animalGather?.(a.id);
            return `✨ Gather: ${n} кусков мяса`;
        }
        for (const tr of this.trees.values()) {
            const to = _v.set(tr.x - o.x, tr.y + 4 - o.y, tr.z - o.z);
            if (to.length() > 12 || d.angleTo(to.normalize()) > 0.35) continue;
            let n = 0;
            tr.apples.forEach((ap, i) => { if (ap.until <= Date.now()) { this._pickApple(tr, i, g.localId, null); n++; } });
            return n ? `✨ Gather: ${n} золотых яблок` : '🍏 Яблок пока нет — вырастут через несколько минут';
        }
        return null;
    }

    // ------------------------------------------------------ golden trees
    _treesAround(p) {
        const t = this.game.terrain?.data;
        if (!t) return;
        const CELL = 110;
        const gx0 = Math.floor((p.x - 80) / CELL), gx1 = Math.floor((p.x + 80) / CELL);
        const gz0 = Math.floor((p.z - 80) / CELL), gz1 = Math.floor((p.z + 80) / CELL);
        const seed = this.game.seed || 1;
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
            const key = gx + ',' + gz;
            if (this.trees.has(key)) continue;
            const h = (a, b) => { let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041)) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
            if (h(gx * 3 + 1, gz * 7 + 2) > 0.3) { this.trees.set(key, null); continue; }
            const x = Math.round(gx * CELL + 15 + h(gx, gz) * (CELL - 30)), z = Math.round(gz * CELL + 15 + h(gz + 5, gx - 3) * (CELL - 30));
            if (Math.hypot(x, z) < 40) { this.trees.set(key, null); continue; }
            const top = t.topLayer(x, z);
            if (t.get(x, top, z) !== BLOCK.GRASS) { this.trees.set(key, null); continue; }
            const y = top - 0.5;
            const model = goldenTreeModel();
            model.position.set(x, y, z);
            this.game.scene.add(model);
            const boxId = this.game.collision.addBox({ minX: x - 0.45, maxX: x + 0.45, minY: y, maxY: y + 4, minZ: z - 0.45, maxZ: z + 0.45, kind: 'tree', noSupport: true });
            this.trees.set(key, { key, x, y, z, model, boxId, apples: model.userData.apples.map(() => ({ until: 0 })) });
        }
    }

    _pickApple(tr, i, toId, side) {
        const ap = tr.apples[i];
        if (ap.until > Date.now()) return;
        ap.until = Date.now() + 5 * 60 * 1000; // grows again in 5 min
        tr.model.userData.apples[i].visible = false;
        if (this.game.sync && this.auth) this.game.sync.appleGone?.(tr.key, i, ap.until);
        const item = { kind: 'apple', uid: newUid(), count: 1 };
        if (toId === this.game.localId) this._give(item, side);
        else this.game.sync?.animalMeatTo?.(toId, item, side);
    }

    // ------------------------------------------------------------- horses
    /** Golden apple held to the head of a horse: one apple more for it. */
    _feed(dt) {
        const g = this.game;
        const ap = g.items.heldOf('apple');
        if (!ap) { this._feedT = 0; return; }
        let horse = null;
        for (const a of this.list) {
            if (a.dead || a.type !== 'horse' || a.tamed === g.localId) continue;
            const head = _v.copy(a.group.position).add(_v2.set(0, 2.4 * SPECIES.horse.size, 0).add(new THREE.Vector3(0, 0, -1.2).applyAxisAngle(_v2.set(0, 1, 0), a.group.rotation.y)));
            if (ap.model.position.distanceTo(head) < 1.4) horse = a;
        }
        if (!horse) { this._feedT = 0; return; }
        this._feedT += dt;
        if (this._feedT < 0.7) return;
        this._feedT = 0;
        ap.item.count = (ap.item.count || 1) - 1;
        if (ap.item.count <= 0) g.items.releaseHand(ap.side);
        horse.apples = Math.min(3, horse.apples + 1);
        if (!this.auth) g.sync?.animalFeed?.(horse.id);
        g.hud.setVoice(`🐴 Конь съел яблоко (${horse.apples}) — шанс, что даст запрыгнуть: ${Math.min(90, horse.apples * 30)}%. Прыгните рядом с ним`, true);
    }

    /** A jump next to a horse: try to get on (or get off). */
    tryMount() {
        const g = this.game;
        if (this.riding) { this.dismount(); return; }
        const me = g.character.group.position;
        let best = null;
        for (const a of this.list) {
            if (a.dead || a.type !== 'horse' || a.rider) continue;
            const d = a.group.position.distanceTo(_v.set(me.x, a.group.position.y, me.z));
            if (d < 3 && (!best || d < best.d)) best = { a, d };
        }
        if (!best) return;
        const a = best.a;
        const ok = a.tamed === g.localId || Math.random() < Math.min(0.9, a.apples * 0.3);
        if (!ok) { g.hud.setVoice(a.apples ? '🐴 Конь не дал запрыгнуть — дайте ещё золотое яблоко' : '🐴 Конь не даётся — сначала угостите его золотым яблоком', true); return; }
        a.tamed = g.localId;
        a.rider = g.localId;
        a.state = 'ridden';
        this.riding = a;
        a.model.userData.saddle.visible = true;
        g.sync?.animalRide?.(a.id, true);
        g.hud.setVoice(`🐎 Вы на коне! Шагайте на месте — едем (быстрее на ${a.bonus}%). Прыжок или присесть — слезть`, true);
    }

    dismount() {
        const a = this.riding;
        if (!a) return;
        this.riding = null;
        a.rider = null;
        a.state = 'graze';
        a.target.copy(a.group.position);
        const ch = this.game.character;
        ch.group.position.x += Math.cos(a.group.rotation.y) * 1.5;
        ch.group.position.z -= Math.sin(a.group.rotation.y) * 1.5;
        this.game.sync?.animalRide?.(a.id, false);
        this.game.hud.setVoice('🐴 Вы слезли с коня', true);
    }

    _detectJump(dt) {
        const pose = this.game.currentPose;
        const now = performance.now();
        if (!pose?.nose) return false;
        this._noseHist.push({ t: now, y: pose.nose.y });
        while (this._noseHist.length && now - this._noseHist[0].t > 350) this._noseHist.shift();
        const first = this._noseHist[0];
        // the head jumps up in the picture (image y goes down)
        if (first && first.y - pose.nose.y > 0.09 && now - this._jumpAt > 1200) { this._jumpAt = now; this._noseHist.length = 0; return true; }
        return false;
    }

    _ride(dt) {
        const a = this.riding;
        const g = this.game;
        const ch = g.character;
        if (!a || a.dead) { this.riding = null; return; }
        if (ch.isCrouching) { this.dismount(); return; }
        const S = SPECIES.horse;
        a.group.rotation.y = ch.group.rotation.y;
        const moving = ch.isRunning;
        const tired = a.stamina <= 0;
        const base = (2.5 + 5 * (ch.runIntensity || 0)) * 2 * (1 + a.bonus / 100) * (tired ? 0.5 : 1);
        if (moving) {
            a.group.position.x -= Math.sin(a.group.rotation.y) * base * dt;
            a.group.position.z -= Math.cos(a.group.rotation.y) * base * dt;
            a.stamina = Math.max(0, a.stamina - dt * (3 + 4 * (ch.runIntensity || 0)));
            a.walkT += dt * base * 2;
        } else a.stamina = Math.min(100, a.stamina + dt * 6);
        // the horse can't climb cliffs
        const gy = g.collision.groundY(a.group.position.x, a.group.position.z);
        a.group.position.y += (gy + 0.5 - a.group.position.y) * Math.min(1, dt * 8);
        g.collision.resolveCylinder(a.group.position, 0.7, a.group.position.y - 0.5, 2.5, 1.2);
        this._animate(a, moving ? Math.min(1, base / 10) : 0);
        ch.group.position.set(a.group.position.x, a.group.position.y + 1.95 * S.size + 0.6, a.group.position.z);
        if (tired && moving && Math.random() < dt) g.hud.setVoice('🐴 Конь устал — дайте ему отдохнуть', true);
    }

    // ---------------------------------------------------------------- AI
    _think(a, dt) {
        const g = this.game;
        const S = SPECIES[a.type];
        const p = a.group.position;
        a.t += dt;
        if (a.damageCooldown > 0) a.damageCooldown -= dt;
        let speed = 0;
        if (a.state === 'attack' || a.state === 'flee') {
            a.stateT -= dt;
            const tp = this._playerPos(a.attacker);
            if (!tp || a.stateT <= 0) { a.state = 'graze'; a.target.copy(p); }
            else if (a.state === 'flee') {
                _v.subVectors(p, tp).setY(0).normalize();
                a.target.copy(p).addScaledVector(_v, 6);
                speed = S.run;
            } else {
                a.target.copy(tp);
                speed = S.run * 0.85;
                if (p.distanceTo(_v.set(tp.x, p.y, tp.z)) < 1.6 * S.size + 0.6) {
                    speed = 0;
                    if (a.t > 1.2) { a.t = 0; this._butt(a, a.attacker); }
                }
            }
        } else {
            // grazing: now and then a few steps somewhere near the herd
            if (a.t > 4 + Math.random() * 6) {
                a.t = 0;
                const h = a.herd || { x: p.x, z: p.z };
                a.target.set(h.x + (Math.random() - 0.5) * 12, p.y, h.z + (Math.random() - 0.5) * 12);
            }
            if (p.distanceTo(_v.set(a.target.x, p.y, a.target.z)) > 0.6) speed = S.speed;
        }
        if (speed > 0) {
            const to = _v.set(a.target.x - p.x, 0, a.target.z - p.z);
            const d = to.length();
            if (d > 0.3) {
                to.normalize();
                const want = Math.atan2(-to.x, -to.z);
                let dy = want - a.group.rotation.y;
                while (dy > Math.PI) dy -= Math.PI * 2;
                while (dy < -Math.PI) dy += Math.PI * 2;
                a.group.rotation.y += dy * Math.min(1, dt * 5);
                p.addScaledVector(to, Math.min(d, speed * dt));
                a.walkT += dt * speed * 2.2;
            }
        }
        // ground, water (they don't swim: back out of deep water)
        const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y + 1) : g.collision.groundY(p.x, p.z);
        p.y += (gy + 0.5 - p.y) * Math.min(1, dt * 8);
        g.collision.resolveCylinder(p, 0.6 * S.size, p.y - 0.5, 2, 1.1);
        this._animate(a, speed > 0 ? Math.min(1, speed / 5) : 0);
    }

    _animate(a, k) {
        const legs = a.model.userData.legs;
        const sw = Math.sin(a.walkT) * 0.6 * k;
        legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
    }

    _playerPos(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') return g.isDeadLocal ? null : g.character.group.position;
        const r = g.remotes.get(id);
        return r && !r.dead ? r.position : null;
    }

    _butt(a, id) {
        const g = this.game;
        const dmg = SPECIES[a.type].dmg;
        if (id === g.localId || id === 'local') {
            if (g.combat.enabled) g.combat.damage(dmg, null, 'animal');
            else g.damageLocalPlayer(dmg);
            g.knockback.add(_v.subVectors(g.character.group.position, a.group.position).setY(0).normalize().multiplyScalar(6).setY(2));
            g.hud.setVoice?.(`🐾 ${SPECIES[a.type].name} бодается!`, true);
        } else g.sync?.animalButt?.(id, dmg, a.group.position);
    }

    // ------------------------------------------------------------- frame
    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        const me = g.character.group.position;
        this._treeT -= dt;
        if (this._treeT <= 0) { this._treeT = 2; this._treesAround(me); }
        // apples grow back
        for (const tr of this.trees.values()) {
            if (!tr) continue;
            tr.apples.forEach((ap, i) => { tr.model.userData.apples[i].visible = ap.until <= Date.now(); });
        }
        if (this.auth) {
            this._spawnT -= dt;
            if (this._spawnT <= 0) {
                this._spawnT = 20;
                const near = this.list.filter((a) => !a.dead && a.group.position.distanceTo(me) < 80).length;
                if (near < MAX_NEAR) this._spawnHerd();
            }
            for (const a of [...this.list]) {
                if (a.group.position.distanceTo(me) > 150 && !a.tamed && !a.rider) { this._remove(a); continue; }
                if (a.dead) {
                    if (a.bonesAt && performance.now() - a.bonesAt > 120000) this._remove(a);
                    else if (!a.bonesAt && performance.now() - a.deadAt > 600000) this._remove(a);
                    continue;
                }
                if (a.rider && a.rider !== g.localId) continue; // a guest rides it: their computer moves it
                if (a === this.riding) continue;
                this._think(a, dt);
            }
        } else {
            for (const a of this.list) if (a.net && a !== this.riding) {
                a.group.position.lerp(a.net, Math.min(1, dt * 8));
                a.walkT += dt * (a.netMoving ? 6 : 0);
                this._animate(a, a.netMoving ? 0.8 : 0);
            }
        }
        if (this.riding) this._ride(dt);
        if (g.currentPose && !g.combat.dead) {
            if (this._detectJump(dt)) this.tryMount();
            this._feed(dt);
            this._handPicks(dt);
        }
        this._netSend(dt);
    }

    /** An empty hand touching a carcass takes a piece of meat; touching an apple picks it. */
    _handPicks(dt) {
        const g = this.game;
        const now = performance.now();
        if (now - (this._pickAt || 0) < 600) return;
        for (const side of ['right', 'left']) {
            if (g.items.held[side] || g.weapons.hands[side].held) continue;
            const hand = g.character.getHandWorldPosition(side, _v);
            for (const a of this.list) {
                if (!a.dead || a.meat <= 0) continue;
                if (a.group.position.distanceTo(hand) > 1.4) continue;
                this._pickAt = now;
                if (this.auth) this._takeMeat(a, g.localId, side);
                else g.sync?.animalMeat?.(a.id, side);
                return;
            }
            for (const tr of this.trees.values()) {
                if (!tr) continue;
                for (let i = 0; i < tr.apples.length; i++) {
                    if (tr.apples[i].until > Date.now()) continue;
                    const ap = tr.model.userData.apples[i].getWorldPosition(_v2);
                    if (ap.distanceTo(hand) > 0.6) continue;
                    this._pickAt = now;
                    if (this.auth) this._pickApple(tr, i, g.localId, side);
                    else g.sync?.applePick?.(tr.key, i, side);
                    return;
                }
            }
        }
    }

    // ------------------------------------------------------------ network
    _netSend(dt) {
        const g = this.game;
        if (!g.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.2;
        const r = (v) => Math.round(v * 100) / 100;
        if (this.auth) {
            g.sync.animals?.(this.list.map((a) => [a.id, a.type, r(a.group.position.x), r(a.group.position.y), r(a.group.position.z), r(a.group.rotation.y), a.dead ? 1 : 0, a.meat, a.cooked ? 1 : 0, a.color ?? 0, a.tamed || 0, a.rider || 0, a.bonus, a.state === 'graze' ? 0 : 1]));
        } else if (this.riding) {
            const a = this.riding;
            g.sync.animalPos?.(a.id, [r(a.group.position.x), r(a.group.position.y), r(a.group.position.z), r(a.group.rotation.y)]);
        }
    }

    /** (guests) the host's animals. */
    applyNet(list) {
        const seen = new Set();
        for (const [id, type, x, y, z, ry, dead, meat, cooked, color, tamed, rider, bonus, moving] of list || []) {
            seen.add(id);
            let a = this.byId.get(id);
            if (!a) a = this._spawn(type, new THREE.Vector3(x, y, z), { id, color: color || null, bonus });
            if (a === this.riding) continue;
            a.net = (a.net || new THREE.Vector3()).set(x, y, z);
            a.netMoving = !!moving;
            a.group.rotation.y = ry;
            a.meat = meat;
            a.tamed = tamed || null;
            a.rider = rider || null;
            a.model.userData.saddle && (a.model.userData.saddle.visible = !!rider);
            if (cooked && !a.cooked) { a.cooked = true; if (a.dead) this._tintCooked(a); }
            if (dead && !a.dead) { a.dead = true; a.state = 'dead'; this._layDown(a); }
            if (a.dead && meat <= 0 && a.model.visible) this._toBones(a);
        }
        for (const a of [...this.list]) if (!seen.has(a.id)) this._remove(a);
    }

    /** Everything about the animals for the save / late joiners. */
    snapshot() {
        return this.list.filter((a) => a.tamed || a.dead).map((a) => ({ id: a.id, type: a.type, p: [a.group.position.x, a.group.position.y, a.group.position.z], dead: a.dead, meat: a.meat, cooked: a.cooked, color: a.color, tamed: a.tamed, bonus: a.bonus }));
    }

    restore(list) {
        for (const s of list || []) {
            const a = this._spawn(s.type, new THREE.Vector3(s.p[0], s.p[1], s.p[2]), { id: s.id, color: s.color, tamed: s.tamed, bonus: s.bonus });
            a.meat = s.meat; a.cooked = s.cooked;
            if (s.dead) { a.dead = true; a.state = 'dead'; a.deadAt = performance.now(); this._layDown(a); if (a.meat <= 0) this._toBones(a); }
        }
    }

    dispose() {
        for (const a of [...this.list]) this._remove(a);
        for (const tr of this.trees.values()) if (tr) { this.game.scene.remove(tr.model); this.game.collision.removeBox(tr.boxId); }
        this.trees.clear();
    }
}
