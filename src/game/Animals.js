/**
 * Animals.js — cows, pigs, sheep and horses; golden apple trees.
 *
 * Herds of 3–8 graze loosely, each animal keeping its personal space (see
 * AnimalHerd.js) and living its own calm life. Hit one and it defends
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
import { setNearShadow, SHADOW_NEAR } from '../core/Shadows.js';
import { newUid } from './ItemTypes.js';
import { BLOCK } from '../world/Terrain.js';
import { animalModel, animateLegs, HORSE_COLORS } from './AnimalModels.js';
import { runBookColor, RUNNER } from './RunningBook.js';
import { ROOM, LOOSE, POSE, measureBody, rigHead, solidGap, pairRoom, pickIdle, idleTime, pickSpot, wrapAngle, animatePose, foldLegs } from './AnimalHerd.js';

export { animalModel };

export const SPECIES = {
    // (sizes next to the ~4.6 m tall player: a cow reaches his chest)
    cow: { name: 'Корова', hp: 10, speed: 1.6, run: 6, dmg: 2, meat: 4, size: 2.0 },
    pig: { name: 'Свинья', hp: 6, speed: 1.5, run: 5.5, dmg: 1, meat: 3, size: 1.45 },
    sheep: { name: 'Баран', hp: 6, speed: 1.5, run: 5.8, dmg: 1, meat: 2, size: 1.55 },
    horse: { name: 'Конь', hp: 12, speed: 2.0, run: 7.5, dmg: 2, meat: 4, size: 2.3 },
    runbook: { name: 'Бегущая книга', hp: 4, speed: 2.2, run: 9.5, dmg: 0, meat: 0, size: RUNNER.SIZE }, // (rare; its mind is RunningBook.js)
};
/** New herds: rare, small, far away and never in sight (they must not pop up next to the player). */
export const HERDS = {
    MAX_NEAR: 8, // animals within NEAR m: no new herd while there are this many
    NEAR: 120,
    EVERY: 75, // s between tries (± a third)
    MIN_D: 75, // m away (the player is ~4.6 m tall: closer is in plain sight)
    MAX_D: 115,
    BEHIND: 1.9, // rad from where the player looks (~110°): only behind them
    GONE: 200, // m: farther than this a herd is gone (only when not in sight)
};
/** Is the point (x, z) outside the player's view: far enough off where `look` points? */
export function outOfSight(me, look, x, z, behind = HERDS.BEHIND) {
    const dx = x - me.x, dz = z - me.z;
    const L = Math.hypot(dx, dz), l = Math.hypot(look.x, look.z);
    if (L < 1e-6 || l < 1e-6) return false;
    return Math.acos(Math.max(-1, Math.min(1, (dx * look.x + dz * look.z) / (L * l)))) > behind;
}
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
// Shared box shapes: a new herd costs no new geometry (no GPU uploads, no garbage)
const _geos = new Map();
function box(w, h, d) {
    const k = w + ',' + h + ',' + d;
    let g = _geos.get(k);
    if (!g) { g = new THREE.BoxGeometry(w, h, d); g.userData.keep = true; _geos.set(k, g); }
    return g;
}
function bx(g, w, h, d, c, x, y, z) {
    const m = new THREE.Mesh(box(w, h, d), lam(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
}

export function bonesModel() {
    const g = new THREE.Group();
    const m = lam(0xefe9da);
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(box(0.08, 0.08, 0.7), m); b.position.set((i - 2) * 0.14, 0.05, 0); b.rotation.y = (i - 2) * 0.2; g.add(b); }
    const skull = new THREE.Mesh(box(0.3, 0.25, 0.35), m);
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
        const color = type === 'horse' ? (opts.color ?? HORSE_COLORS[Math.floor(Math.random() * HORSE_COLORS.length)]) : type === 'runbook' ? (opts.color || runBookColor(id)) : null;
        const model = animalModel(type, color);
        model.scale.setScalar(S.size);
        // the real body (from the model's bounding box) gives its personal space; a pivot for the head
        const dims = measureBody(model);
        if (ROOM[type]) rigHead(model, dims); // (herd animals only: the running book has its own parts)
        model.position.copy(pos);
        if (opts.yaw != null) model.rotation.y = opts.yaw;
        g.scene.add(model);
        const a = {
            id, type, group: model, model, isAnimal: true, hp: opts.hp ?? S.hp, dead: false, get isDead() { return this.dead; },
            damageCooldown: 0, state: 'graze', t: Math.random() * 5, target: pos.clone(), herd: opts.herd || null,
            attacker: null, stateT: 0, vy: 0, meat: S.meat, cooked: false, color, pen: opts.pen || null,
            bonus: opts.bonus ?? (type === 'horse' ? 1 + Math.floor(Math.random() * 40) : 0),
            stamina: 100, apples: 0, tamed: opts.tamed || null, rider: null, walkT: Math.random() * 6, bones: null,
            // herd life: its own calm state, a real speed (it speeds up / slows down and turns smoothly)
            dims, room: (ROOM[type] ?? 1) * dims.len, idle: 'stand', idleT: Math.random() * 4, spd: 0, pose: POSE.stand,
            home: { x: pos.x, z: pos.z }, lie: 0, headP: 0, headY: 0,
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
        const n = 2 + Math.floor(Math.random() * 4);
        // far away, behind the player (where they don't look) — never popping up in sight
        const look = this._look(new THREE.Vector3());
        let cx = 0, cz = 0, ok = false;
        for (let k = 0; k < 8 && !ok; k++) {
            const a = Math.random() * Math.PI * 2, d = HERDS.MIN_D + Math.random() * (HERDS.MAX_D - HERDS.MIN_D);
            cx = me.x + Math.cos(a) * d; cz = me.z + Math.sin(a) * d;
            ok = outOfSight(me, look, cx, cz) && this._unseenByOthers(cx, cz);
        }
        if (!ok) return;
        const t = g.terrain?.data;
        if (!t) return;
        const top = t.topLayer(Math.round(cx), Math.round(cz));
        if (t.get(Math.round(cx), top, Math.round(cz)) !== BLOCK.GRASS || t.get(Math.round(cx), top + 1, Math.round(cz)) === BLOCK.WATER) return; // only on grass
        if ((t.sites || t.castles)?.landAt(Math.round(cx), Math.round(cz))) return; // (not in castles, villages, wizards' towers)
        this.spawnHerdAt(type, n, cx, cz);
    }

    /** Where the player looks (flat). */
    _look(out) {
        const cam = this.game.camera;
        if (cam?.getWorldDirection) cam.getWorldDirection(out);
        else { const y = this.game.character.group.rotation.y; out.set(-Math.sin(y), 0, -Math.cos(y)); }
        return out.setY(0);
    }

    /** (host) No other player stands near enough to see a herd appear there. */
    _unseenByOthers(x, z) {
        for (const r of this.game.remotes?.values() || []) if (r.position && Math.hypot(r.position.x - x, r.position.z - z) < HERDS.MIN_D) return false;
        return true;
    }

    /** (host) A herd of n spread loosely around (cx, cz): nobody on top of another. */
    spawnHerdAt(type, n, cx, cz) {
        const g = this.game;
        const herd = { x: cx, z: cz, hx: cx, hz: cz, id: ++_nextId, leader: null };
        const yaw = Math.random() * Math.PI * 2;
        const placed = [];
        for (let i = 0; i < n; i++) {
            // (the first one measures the body: the rest are placed by its personal space)
            const room = placed[0]?.room ?? 0;
            const s = i ? pickSpot(cx, cz, room * LOOSE * (0.6 + Math.sqrt(n) * 0.55), room, placed.map((o) => ({ x: o.group.position.x, z: o.group.position.z, room: o.room }))) : { x: cx, z: cz };
            const a = this._spawn(type, new THREE.Vector3(s.x, g.collision.groundY(s.x, s.z) + 0.5, s.z), { herd, yaw: yaw + (Math.random() - 0.5) * 1.2 });
            placed.push(a);
        }
        herd.leader = placed[0]?.id ?? null;
        return placed;
    }

    _remove(a) {
        const g = this.game;
        if (a.pen && !a.dead) g.houses?.penReturn(a.pen.id); // (a pen animal far away: it comes back with the pen)
        g.scene.remove(a.model);
        // (shapes are shared by all animals: nothing to dispose)
        if (a.bones) g.scene.remove(a.bones);
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
        if (dir) this.push(a, _v.copy(dir).setY(0).normalize().multiplyScalar(4).setY(1.5), 0.35); // a blow knocks it back
        if (a.hp <= 0) { this._die(a, fire); return; }
        // defend (65%) or run away; sheep stand up for each other
        const attacker = by;
        const fight = a.type !== 'runbook' && Math.random() < 0.65; // (a running book only runs)
        a.state = fight ? 'attack' : 'flee';
        a.attacker = attacker;
        a.stateT = fight ? 15 : 8;
        if (a.type === 'sheep') {
            for (const o of this.list) {
                if (o === a || o.dead || o.type !== 'sheep' || o.group.position.distanceTo(a.group.position) > 14) continue;
                if (Math.random() < 0.65) { o.state = 'attack'; o.attacker = attacker; o.stateT = 15; }
            }
        }
        // a fright spreads: the herd runs away together (still not touching)
        if (!fight && a.herd) {
            for (const o of this.list) {
                if (o === a || o.dead || o.herd !== a.herd || o.rider || o.lev || o.state !== 'graze') continue;
                if (o.group.position.distanceTo(a.group.position) > 22) continue;
                o.state = 'flee'; o.attacker = attacker; o.stateT = 5 + Math.random() * 3;
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
        for (const a of this.list) {
            const d = a.group.position.distanceTo(p);
            if (d >= radius + 1 + SPECIES[a.type].size) continue;
            const dir = _v.subVectors(a.group.position, p).setY(0);
            if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            dir.normalize();
            const k = Math.max(0.2, 1 - d / (radius + 2));
            if (!a.dead) this.hit(a, dmg, dir.clone(), by);
            // the blast throws it (alive or dead) — it falls back, into the crater if there is one
            if (this.auth) this.push(a, dir.multiplyScalar(14 * k).setY(9 * k + 3), 2.5);
        }
    }

    /** Ray spells (Тандервейв throws them back, they lie stunned for a moment). */
    hitRay(o, d, len, width, dmg = 3, by = null, name = null) {
        for (const a of this.list) {
            if (a.dead) continue;
            const to = _v.subVectors(a.group.position, o).add(_v2.set(0, 0.8, 0));
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() >= width + 0.9 * SPECIES[a.type].size) continue;
            this.hit(a, dmg, d.clone(), by);
            if (this.auth && name === 'Thunderwave') {
                this.push(a, _v2.copy(d).setY(0).normalize().multiplyScalar(16).setY(6), 2.2);
                for (let i = 0; i < 8; i++) this.game.fx.spark(a.group.position, 0x9fd8ff, 0.1, _v.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
            }
        }
    }

    /** Inferno: living animals burn (and die cooked), carcasses get cooked. */
    burnAlong(o, d, len) {
        let burnt = false;
        for (const a of this.list) {
            const to = _v.subVectors(a.group.position, o);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() > 2.2) continue;
            if (a.dead) { if (!a.cooked && a.meat > 0) { a.cooked = true; this._tintCooked(a); this.game.hud.setVoice?.('🔥 Мясо поджарилось', true); } continue; }
            if (a.damageCooldown <= 0) { a.cooked = true; this.hit(a, 2, d, this.game.localId, true); a.damageCooldown = 0.6; if (!a.dead) a.cooked = false; burnt = true; }
        }
        return burnt;
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
            a.bones.scale.setScalar(SPECIES[a.type].size);
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
            if (!tr) continue; // (a cell without a golden tree)
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
        a.spd = 0; a.idle = 'stand'; a.idleT = 3;
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
        a.pose = POSE.stand; a.spd = 0;
        this._animate(a, moving ? Math.min(1, base / 10) : 0, dt);
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
        if (a.stunT > 0) {
            // stunned / thrown by a spell or a blast: no walking until it comes to itself
            a.stunT -= dt;
            a.spd = 0;
            this._body(a, dt);
            this._animate(a, 0);
            return;
        }
        if (a.type === 'runbook' && g.runner) { g.runner.think(a, dt); return; } // (runs, dodges, hides: RunningBook.js)
        let speed = 0, bunch = false;
        // «Брейнрот»: a servant follows its master and fights for them
        const sv = a.servantOf != null ? g.servants?.plan('a', a, p, 1.6 * S.size + 0.8) : null;
        if (sv) {
            if (sv.mode === 'strike') {
                const e = sv.enemy;
                a.group.rotation.y = Math.atan2(-(e.x - p.x), -(e.z - p.z));
                if (a.t > 1.2) { a.t = 0; g.servants.damage(e, S.dmg, _v.set(e.x - p.x, 0, e.z - p.z).normalize(), a.servantOf); }
            } else if (sv.mode !== 'stay') {
                a.target.set(sv.x, p.y, sv.z);
                speed = sv.mode === 'chase' ? S.run * 0.9 : Math.max(S.speed * 1.5, 2);
            }
        } else if (a.state === 'attack' || a.state === 'flee') {
            a.stateT -= dt;
            a.pose = POSE.stand;
            const tp = this._playerPos(a.attacker);
            if (!tp || a.stateT <= 0) { a.state = 'graze'; a.target.copy(p); this._setIdle(a, 'look'); }
            else if (a.state === 'flee') {
                // away from the one who frightened it, together with the herd mates that run too
                _v.subVectors(p, tp).setY(0);
                if (_v.lengthSq() < 1e-4) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5);
                _v.normalize();
                let n = 0; const c = _v2.set(0, 0, 0);
                if (a.herd) for (const o of this.list) {
                    if (o === a || o.dead || o.herd !== a.herd || o.state !== 'flee') continue;
                    c.x += o.group.position.x; c.z += o.group.position.z; n++;
                }
                if (n) {
                    c.multiplyScalar(1 / n).sub(p).setY(0);
                    const cl = c.length();
                    if (cl > a.room * 1.5) _v.addScaledVector(c, 0.45 / cl).normalize();
                }
                a.target.copy(p).addScaledVector(_v, 8);
                speed = S.run;
                bunch = true;
            } else {
                // a fight: they come at you from different sides (each herd member its own angle)
                const dd = p.distanceTo(_v.set(tp.x, p.y, tp.z));
                if (dd > 2.2 * S.size + 3) {
                    const ang = (a.id % 7) * 0.9;
                    a.target.set(tp.x + Math.cos(ang) * 1.6 * S.size, p.y, tp.z + Math.sin(ang) * 1.6 * S.size);
                } else a.target.copy(tp);
                speed = S.run * 0.85;
                bunch = true;
                if (dd < 1.6 * S.size + 0.6) {
                    speed = 0;
                    if (a.t > 1.2) { a.t = 0; this._butt(a, a.attacker); }
                }
            }
        } else speed = this._calm(a, dt);
        this._steer(a, dt, speed, bunch);
        // a pen animal stays inside its fence (unless it runs at / from someone)
        if (a.pen && a.state === 'graze') {
            const dx = p.x - a.pen.x, dz = p.z - a.pen.z, r = a.pen.r;
            if (Math.abs(dx) > r + 2 || Math.abs(dz) > r + 2) { a.target.set(a.pen.x, p.y, a.pen.z); this._setIdle(a, 'walk'); } // (out after a fright: it walks back in)
            else {
                if (Math.abs(dx) > r) p.x = a.pen.x + Math.sign(dx) * r;
                if (Math.abs(dz) > r) p.z = a.pen.z + Math.sign(dz) * r;
            }
        }
        this._body(a, dt);
        this._animate(a, Math.min(1, a.spd / 5), dt);
    }

    _setIdle(a, state, time) {
        a.idle = state;
        a.idleT = time ?? idleTime(state);
        const p = a.group.position;
        if (state === 'graze') {
            // a step or two forward, nibbling, the head down
            const yaw = a.group.rotation.y + (Math.random() - 0.5) * 1.4, d = Math.random() * 0.25 * a.dims.len;
            a.target.set(p.x - Math.sin(yaw) * d, p.y, p.z - Math.cos(yaw) * d);
        } else if (state === 'walk') {
            const s = this._freeSpot(a);
            a.target.set(s.x, p.y, s.z);
        } else if (state !== 'follow' && state !== 'avoid' && state !== 'come') a.target.copy(p);
    }

    /** Where the herd lives: the pen, the herd (around its leader), or its own home spot. */
    _freeSpot(a) {
        const room = this._room(a);
        const others = [];
        for (const o of this.list) {
            if (o === a || o.dead) continue;
            const op = o.group.position;
            if (Math.abs(op.x - a.group.position.x) > 40 || Math.abs(op.z - a.group.position.z) > 40) continue;
            others.push({ x: op.x, z: op.z, room: this._room(o) });
            if (o.idle === 'walk' || o.idle === 'follow') others.push({ x: o.target.x, z: o.target.z, room: this._room(o) });
        }
        if (a.pen) return pickSpot(a.pen.x, a.pen.z, a.pen.r * 0.85, room, others);
        const h = a.herd;
        const n = h ? this._herdSize(h) : 1;
        const R = room * LOOSE * (0.6 + Math.sqrt(n) * 0.55);
        if (h && h.leader === a.id) {
            // the leader roams on: a new patch of grass not far from where the herd lives
            const ang = Math.random() * Math.PI * 2, d = 6 + Math.random() * 12;
            let x = a.group.position.x + Math.cos(ang) * d, z = a.group.position.z + Math.sin(ang) * d;
            const far = Math.hypot(x - h.hx, z - h.hz), max = 30;
            if (far > max) { x = h.hx + (x - h.hx) * max / far; z = h.hz + (z - h.hz) * max / far; }
            return pickSpot(x, z, room, room, others);
        }
        if (h) return pickSpot(h.x, h.z, R, room, others);
        return pickSpot(a.home.x, a.home.z, Math.max(R, room * 3), room, others);
    }

    _room(a) {
        return a.pen ? Math.min(a.room, a.pen.r * 0.9) : a.room;
    }

    _herdSize(h) {
        if (h._nT === this._tick) return h._n;
        let n = 0, x = 0, z = 0, leader = null;
        for (const o of this.list) if (o.herd === h && !o.dead) {
            n++; x += o.group.position.x; z += o.group.position.z;
            if (o.id === h.leader) leader = o;
        }
        h._n = n; h._nT = this._tick;
        if (n) { h.x = x / n; h.z = z / n; } // (the herd is where its animals are)
        if (!leader || leader.rider || leader.tamed) {
            // a new leader: the one nearest the middle
            const nl = this.list.filter((o) => o.herd === h && !o.dead && !o.rider && !o.tamed).sort((p, q) => Math.hypot(p.group.position.x - h.x, p.group.position.z - h.z) - Math.hypot(q.group.position.x - h.x, q.group.position.z - h.z))[0];
            h.leader = nl ? nl.id : null;
        }
        return n;
    }

    /** A calm animal: lives its own life near the herd, keeps away from people walking at it. Returns the wanted speed. */
    _calm(a, dt) {
        const S = SPECIES[a.type];
        const p = a.group.position;
        a.idleT -= dt;
        // people: someone coming right at it — it steps aside; a tamed horse comes to its owner
        const react = this._people(a);
        if (react) return react;
        if (a.idle === 'avoid' || a.idle === 'come') this._setIdle(a, 'look');
        // the herd: too far from the leader → it follows (at a distance)
        const h = a.herd;
        if (h && !a.pen) {
            const n = this._herdSize(h);
            const L = h.leader !== a.id ? this.byId.get(h.leader) : null;
            if (L && !L.dead) {
                const R = a.room * LOOSE * (0.6 + Math.sqrt(n) * 0.55);
                const d = Math.hypot(L.group.position.x - p.x, L.group.position.z - p.z);
                if (d > R * 1.6 && (a.idle !== 'rest' || d > R * 2.6) && a.idle !== 'follow') this._setIdle(a, 'follow', 20);
                if (a.idle === 'follow') {
                    if (d < R * 0.9 || a.idleT <= 0) this._setIdle(a, Math.random() < 0.6 ? 'graze' : 'look');
                    else {
                        // a place beside / behind the leader, its own side (not in its tracks)
                        const ang = Math.atan2(p.z - L.group.position.z, p.x - L.group.position.x);
                        a.target.set(L.group.position.x + Math.cos(ang) * R * 0.75, p.y, L.group.position.z + Math.sin(ang) * R * 0.75);
                        return d > R * 3 ? S.speed * 2.2 : S.speed * 1.2;
                    }
                }
            }
        }
        if (a.idleT <= 0 || a.idle === 'follow') this._setIdle(a, pickIdle(a.type));
        a.pose = a.idle === 'graze' ? POSE.graze : a.idle === 'rest' ? POSE.rest : a.idle === 'look' ? POSE.look : POSE.stand;
        const d = Math.hypot(a.target.x - p.x, a.target.z - p.z);
        if (a.idle === 'walk') {
            if (d < 0.6) this._setIdle(a, Math.random() < 0.7 ? 'graze' : 'stand');
            else return S.speed;
        }
        if (a.idle === 'graze' && d > 0.3) return S.speed * 0.25;
        return 0;
    }

    /** People near: one walking right at it makes it step aside; a tamed horse goes to its calm owner. */
    _people(a) {
        const S = SPECIES[a.type];
        const p = a.group.position;
        if (a.idle === 'rest' && a.lie > 0.5 && a.idleT > 0) {
            // (lying: it gets up only if someone comes really close)
            let near = false;
            for (const m of this._crowd || []) if (Math.hypot(m.x - p.x, m.z - p.z) < a.room * 0.8 + 2) near = true;
            if (!near) return 0;
            this._setIdle(a, 'look');
        }
        let best = null;
        for (const m of this._crowd || []) {
            const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
            if (a.type === 'horse' && a.tamed === m.id) {
                // a tamed horse: its owner calm (not running) and not too far → it walks up, stops a few steps off
                const ownerCalm = Math.hypot(m.vx, m.vz) < 3.5;
                const stop = a.dims.len * 0.5 + 2.5; // (its nose a couple of steps from the owner)
                if (ownerCalm && d > stop + (a.idle === 'come' ? 0.8 : 5) && d < 40 && !a.pen) {
                    a.idle = 'come'; a.idleT = 2; a.pose = POSE.stand;
                    a.target.set(m.x + dx / d * stop, p.y, m.z + dz / d * stop);
                    return d > 15 ? S.speed * 2 : S.speed;
                }
                continue;
            }
            const zone = a.room * 0.8 + 3;
            if (d > zone || d < 1e-3) continue;
            const app = (m.vx * dx + m.vz * dz) / d; // how fast they come at it
            if (app > 0.6 || d < a.room * 0.45 + 1.5) if (!best || d < best.d) best = { m, d, dx: dx / d, dz: dz / d, app };
        }
        if (!best) return 0;
        // aside: away from them, to the side of their way
        const { m } = best;
        const ms = Math.hypot(m.vx, m.vz);
        let ax = best.dx, az = best.dz;
        if (ms > 0.3) {
            const sx = -m.vz / ms, sz = m.vx / ms; // their right
            const side = sx * best.dx + sz * best.dz >= 0 ? 1 : -1;
            ax = best.dx * 0.5 + sx * side; az = best.dz * 0.5 + sz * side;
            const l = Math.hypot(ax, az); ax /= l; az /= l;
        }
        const go = a.room * 0.8 + 3.5 - best.d + 2;
        a.idle = 'avoid'; a.idleT = 1.5; a.pose = POSE.look;
        a.target.set(p.x + ax * go, p.y, p.z + az * go);
        return S.speed * (best.app > 3 ? 2.2 : 1.4);
    }

    /**
     * Walking like an animal: it turns and speeds up / slows down smoothly, goes where it
     * faces, and keeps its personal space from the others (only a fright bunches them).
     */
    _steer(a, dt, speed, bunch) {
        const S = SPECIES[a.type];
        const p = a.group.position;
        let wx = a.target.x - p.x, wz = a.target.z - p.z;
        const d = Math.hypot(wx, wz);
        let want = 0;
        if (speed > 0 && d > 0.3) {
            wx /= d; wz /= d;
            want = speed * Math.min(1, d / Math.max(1, speed * 0.6)); // (slows down to stop at the spot)
        } else { wx = 0; wz = 0; }
        // personal space: the others too near push it away (when frightened: only enough not to touch)
        let sx = 0, sz = 0, brake = 1;
        const room = this._room(a);
        const fx = -Math.sin(a.group.rotation.y), fz = -Math.cos(a.group.rotation.y);
        for (const o of this.list) {
            if (o === a || o.dead) continue;
            const op = o.group.position;
            const dx = p.x - op.x, dz = p.z - op.z;
            if (Math.abs(dx) > 30 || Math.abs(dz) > 30 || Math.abs(p.y - op.y) > 3) continue;
            const r = bunch ? solidGap(a, o, dx, dz) * 1.25 : 0.5 * (room + this._room(o)) * 1.15;
            const dd = Math.hypot(dx, dz);
            if (!bunch && dd < r * 1.2 && dd > 1e-4 && -(dx * fx + dz * fz) > dd * 0.5) {
                // another right ahead: it slows down rather than walk into its space
                const pr = 0.5 * (room + this._room(o));
                brake = Math.min(brake, Math.max(0, (dd - pr * 0.95) / (pr * 0.35)));
            }
            if (dd >= r || dd < 1e-4) continue;
            const k = (r - dd) / r;
            sx += dx / dd * k; sz += dz / dd * k;
        }
        want *= brake * (a.legK ?? 1); // (legs cut off: limping / dragging itself — Dismember.js)
        const sl = Math.hypot(sx, sz);
        if (sl > 0.05) {
            if (want < S.speed * 0.5) {
                // standing / grazing and someone is in its space: a few steps away
                if (a.idle === 'rest' && a.lie > 0.5 && sl < 0.5) { /* (lying: stays unless pressed) */ }
                else {
                    if (a.idle === 'rest') this._setIdle(a, 'stand');
                    wx = wx * want + sx / sl * S.speed; wz = wz * want + sz / sl * S.speed;
                    want = S.speed * Math.min(1, 0.4 + sl);
                    const l = Math.hypot(wx, wz); wx /= l; wz /= l;
                }
            } else {
                wx += sx * 1.6; wz += sz * 1.6;
                const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l;
            }
        }
        // turn smoothly towards where it wants to go (faster when running)
        if (want > 0) {
            const yaw = Math.atan2(-wx, -wz);
            const dy = wrapAngle(yaw - a.group.rotation.y);
            const rate = (want > S.speed * 1.5 ? 3.2 : 1.8) * dt;
            a.group.rotation.y += Math.max(-rate, Math.min(rate, dy));
            want *= Math.max(0.15, Math.cos(Math.min(Math.PI / 2, Math.abs(dy)))); // (slows down to turn round)
        }
        // speed up / slow down
        const acc = want > a.spd ? (want > S.speed * 1.5 ? 7 : 2.5) : 5;
        a.spd += Math.max(-acc * dt, Math.min(acc * dt, want - a.spd));
        if (a.spd < 0.02) a.spd = 0;
        if (a.spd > 0) {
            const yaw = a.group.rotation.y;
            const step = a.spd * dt;
            p.x -= Math.sin(yaw) * step; p.z -= Math.cos(yaw) * step;
            a.walkT += dt * a.spd * 2.2;
        }
    }

    /** People near the animals (positions and how fast they walk), once a frame. */
    _seePeople(dt) {
        const g = this.game;
        const out = [];
        const last = this._lastPeople || (this._lastPeople = new Map());
        const add = (id, pos) => {
            if (!pos) return;
            const l = last.get(id);
            let vx = 0, vz = 0;
            if (l && dt > 0) {
                vx = (pos.x - l.x) / dt; vz = (pos.z - l.z) / dt;
                if (Math.hypot(vx, vz) > 30) { vx = 0; vz = 0; } // (a teleport, not a walk)
                vx = l.vx + (vx - l.vx) * Math.min(1, dt * 6); vz = l.vz + (vz - l.vz) * Math.min(1, dt * 6);
            }
            last.set(id, { x: pos.x, z: pos.z, vx, vz });
            out.push({ id, x: pos.x, z: pos.z, vx, vz });
        };
        const riding = (id) => this.list.some((h) => h.rider === id && !h.dead);
        if (!g.isDeadLocal && !riding(g.localId)) add(g.localId, g.character.group.position);
        for (const [id, r] of g.remotes || []) if (!r.dead && !riding(id)) add(id, r.position);
        this._crowd = out;
    }

    /** A blow / a blast / a spell throws an animal (it is stunned for a moment). */
    push(a, vel, stun = 1.2) {
        if (!a) return;
        a.vel = (a.vel || new THREE.Vector3()).add(vel);
        a.stunT = Math.max(a.stunT || 0, stun);
        a.airborne = a.vel.y > 0.5 || a.airborne;
    }

    /**
     * The body: thrown velocity, gravity (it falls into a crater, off a cliff), ground,
     * not into walls, and the others of the herd are pushed aside (no two in one place).
     */
    _body(a, dt) {
        const g = this.game;
        const S = SPECIES[a.type];
        const p = a.group.position;
        const v = a.vel || (a.vel = new THREE.Vector3());
        const base = a.dead ? 0.35 * S.size : 0.5 - (a.lie || 0) * a.dims.legH * 0.9; // (lying: the body down on the grass)
        if (v.lengthSq() > 1e-4) {
            p.x += v.x * dt; p.z += v.z * dt;
            const k = Math.max(0, 1 - (a.airborne ? 0.6 : 5) * dt);
            v.x *= k; v.z *= k;
        }
        const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y + 1) : g.collision.groundY(p.x, p.z);
        if (a.airborne || p.y > gy + base + 0.8) {
            // in the air: falls
            v.y -= 22 * dt;
            p.y += v.y * dt;
            a.airborne = true;
            if (p.y <= gy + base) { p.y = gy + base; if (v.y < -14 && !a.dead && !a.levFall) this.hit(a, 2, null, a.attacker); v.y = 0; a.airborne = false; } // (let go from Leviosa: Levitation counts the fall)
        } else {
            v.y = 0;
            p.y += (gy + base - p.y) * Math.min(1, dt * 8); // walking up and down steps
        }
        if (!a.dead) {
            g.collision.resolveCylinder(p, 0.6 * S.size, p.y - 0.5, 2, 1.1);
            // the others are solid too (their real bodies: long along, narrow across)
            for (const o of this.list) {
                if (o === a || o.dead) continue;
                const op = o.group.position;
                const dx = p.x - op.x, dz = p.z - op.z;
                if (Math.abs(dx) > 12 || Math.abs(dz) > 12) continue;
                const min = solidGap(a, o, dx, dz);
                const d2 = dx * dx + dz * dz;
                if (d2 < min * min && d2 > 1e-6 && Math.abs(p.y - op.y) < 2) {
                    const d = Math.sqrt(d2), push = (min - d) * 0.5;
                    p.x += dx / d * push; p.z += dz / d * push;
                } else if (a.state === 'graze' && !(a.lie > 0.5) && d2 > 1e-6) {
                    // calm: a slow shuffle out of the other's personal space (never a jump)
                    const pr = 0.5 * (this._room(a) + this._room(o)) * 0.97;
                    if (d2 < pr * pr) {
                        const d = Math.sqrt(d2), push = Math.min(pr - d, dt * 0.9);
                        p.x += dx / d * push; p.z += dz / d * push;
                    }
                }
            }
        }
    }

    _animate(a, k, dt = 0) {
        if (dt) animatePose(a, dt, a.pose ?? POSE.stand); // (the head down to the grass / looking about)
        animateLegs(a.model, a.walkT, k * (1 - (a.lie || 0)));
        if (a.lie > 0.01) foldLegs(a.model, a.lie); // (lying: the legs folded under the body)
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
            // butted: shoved back, reeling (BodyImpact; a big bull-like cow throws harder)
            const push = _v.subVectors(g.character.group.position, a.group.position).setY(0).normalize().multiplyScalar(6).setY(2);
            if (g.impact) g.impact.apply({ v: push.clone(), from: a.group.position.clone(), by: null, kind: 'butt', noShield: true });
            else g.knockback.add(push);
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
            this._tick = (this._tick || 0) + 1;
            this._seePeople(dt);
            this._spawnT -= dt;
            if (this._spawnT <= 0) {
                this._spawnT = HERDS.EVERY * (0.67 + Math.random() * 0.67);
                const near = this.list.filter((a) => !a.dead && a.group.position.distanceTo(me) < HERDS.NEAR).length;
                if (near < HERDS.MAX_NEAR) this._spawnHerd();
            }
            const look = this._look(this._lookV || (this._lookV = new THREE.Vector3()));
            for (const a of [...this.list]) {
                // (gone only far away and out of sight: never vanishing in front of the player)
                const ap = a.group.position;
                if (ap.distanceTo(me) > HERDS.GONE && !a.tamed && !a.rider && outOfSight(me, look, ap.x, ap.z, 1.2)) { this._remove(a); continue; }
                if (a.dead) {
                    if (a.lev?.body) continue; // (a body held up by «Вингардиум Левиоса»: Levitation carries it)
                    if (a.lev) g.levitation?.letGo('a', a, false); // (it died while held: it falls)
                    this._body(a, dt); // (carcasses fall into craters too)
                    if (a.bonesAt && performance.now() - a.bonesAt > 120000) this._remove(a);
                    else if (!a.bonesAt && performance.now() - a.deadAt > 600000) this._remove(a);
                    continue;
                }
                if (a.rider && a.rider !== g.localId) continue; // a guest rides it: their computer moves it
                if (a === this.riding) continue;
                if (a.lev) continue; // (held up by «Вингардиум Левиоса»: Levitation carries it)
                this._think(a, dt);
            }
        } else {
            for (const a of this.list) if (a.net && a !== this.riding) {
                a.group.position.lerp(a.net, Math.min(1, dt * 8));
                if (a.type === 'runbook') continue; // (RunningBook moves its little legs)
                a.walkT += dt * (a.netMoving ? 6 : 0);
                if (!a.dead) this._animate(a, a.netMoving ? 0.8 : 0, dt); // (the head down / lying as on the host)
            }
        }
        // shadows only near (every caster is drawn twice)
        for (const a of this.list) setNearShadow(a.group, Math.abs(a.group.position.x - me.x) + Math.abs(a.group.position.z - me.z) < SHADOW_NEAR * 1.3);
        if (this.riding) {
            this._ride(dt);
            g._keepBodiesApart?.(); // (the horse stops at other players before its place is sent)
        }
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
            g.sync.animals?.(this.list.map((a) => [a.id, a.type, r(a.group.position.x), r(a.group.position.y), r(a.group.position.z), r(a.group.rotation.y), a.dead ? 1 : 0, a.meat, a.cooked ? 1 : 0, a.color ?? 0, a.tamed || 0, a.rider || 0, a.bonus, a.state !== 'graze' || a.spd > 0.2 ? 1 : 0, a.pose || 0]));
        } else if (this.riding) {
            const a = this.riding;
            g.sync.animalPos?.(a.id, [r(a.group.position.x), r(a.group.position.y), r(a.group.position.z), r(a.group.rotation.y)]);
        }
    }

    /** (guests) the host's animals. */
    applyNet(list) {
        const seen = new Set();
        for (const [id, type, x, y, z, ry, dead, meat, cooked, color, tamed, rider, bonus, moving, pose] of list || []) {
            seen.add(id);
            let a = this.byId.get(id);
            if (!a) a = this._spawn(type, new THREE.Vector3(x, y, z), { id, color: color || null, bonus });
            if (a === this.riding) continue;
            a.net = (a.net || new THREE.Vector3()).set(x, y, z);
            a.netMoving = !!moving;
            a.pose = pose || 0;
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
