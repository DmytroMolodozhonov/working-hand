/**
 * Death.js — what is left when somebody dies.
 *
 *  - The body stays where it fell, lying (BODY_S); then only the bones
 *    (a skeleton) are left (BONES_S, 20 minutes); then they crumble to dust.
 *  - A player's things ALL drop at the body: the slots (the backpack's slots
 *    too), what the hands hold, the backpack itself, coins, scrolls, wands,
 *    shields, weapons, the gathered blocks. Anybody can take them: by hand,
 *    with «Gather» (everything around the body into the slots), with «Акцио».
 *    The player comes back with only the plain wooden wand (Inventory
 *    ensureStarterWand on respawn). Learned spells stay — they are not things.
 *  - Knights and the king (the armed people of the castles): their sword,
 *    their shield and their coins drop the same way; their body stays, then bones.
 *  - Creative: nobody dies there (no damage), and if it ever happens the
 *    things are kept and no body is left — the mode is for building / trying.
 *
 * Hooks for the other features: `game.onDeath` / `game.onRespawn` are plain
 * lists of functions — push yours: `game.onDeath.push(({ byId, text, pos }) => …)`.
 * Other armed creatures: `game.death.creatureDied({ kind, who, x, y, z, yaw, drops })`
 * with a body maker `game.death.makers[kind] = (b) => Object3D` (lying, feet at y).
 *
 * Multiplayer: the host owns the dropped things (a guest's things are thrown
 * to the host, which spawns them for everybody) and the list of bodies (sent
 * to late joiners and kept in the world save); every computer draws them.
 */

import * as THREE from 'three';
import { RESOURCE } from './Inventory.js';
import { purseBags } from './CoinBelt.js';
import { VillagerModel, villagerLook, VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';
import { rosterEntry } from './CastleLife.js';
import { newUid } from './ItemTypes.js';
import { VoxelCharacter } from '../entities/Character.js';

export const DEATH = {
    BODY_S: 300, // s the body lies (5 minutes)
    BONES_S: 1200, // s the bones stay after that (20 minutes)
    SPREAD: 1.3, // m around the body the things fall
    GATHER_R: 3.5, // m around the pointed place «Gather» takes everything
    GATHER_RANGE: 14, // m how far «Gather» reaches
    GATHER_CONE: 0.3, // rad
    KNIGHT_COINS: [4, 15],
    KING_COINS: [40, 80],
};

/** 'body' | 'bones' | 'gone' after `age` seconds. */
export function bodyStage(age) {
    if (age < DEATH.BODY_S) return 'body';
    if (age < DEATH.BODY_S + DEATH.BONES_S) return 'bones';
    return 'gone';
}

/**
 * Everything a player carries → the things that drop (each a world item; a
 * weapon stays `{kind: 'weapon', type, id, magic, bonus}`, a stack of blocks
 * becomes `{kind: 'blocks', block, count, color}`). Endless (creative) stacks never drop.
 */
export function lootOfPlayer({ slots = [], held = [], backpack = null } = {}) {
    const out = [];
    for (const it of [...held, ...slots]) {
        if (!it || it.endless) continue;
        if (it.kind === 'res') {
            if (!(it.count > 0)) continue;
            out.push({ kind: 'blocks', uid: newUid(), block: it.block, count: it.count, color: RESOURCE[it.block]?.color ?? 0x999999 });
        } else out.push(it);
    }
    if (backpack) out.push(backpack);
    for (const it of out) if (!it.uid && it.kind !== 'weapon') it.uid = newUid();
    return out;
}

/** What an armed villager drops: a knight / the king — the sword, the shield, coins. Others — nothing. */
export function lootOfVillager(role, { shield = false } = {}, rng = Math.random) {
    if (role !== 'knight' && role !== 'king') return [];
    const [a, b] = role === 'king' ? DEATH.KING_COINS : DEATH.KNIGHT_COINS;
    const out = [{ kind: 'weapon', type: 'sword', magic: role === 'king', bonus: role === 'king' ? 25 : 0 }];
    if (shield || role === 'king') out.push({ kind: 'shield', uid: newUid(), type: 2, magic: false, max: 0 });
    out.push({ kind: 'coins', uid: newUid(), count: a + Math.floor(rng() * (b - a + 1)) });
    return out;
}

/** Where the i-th of n things lands around a body (x, z offsets): a ring, not one heap. */
export function dropSpot(i, n, spread = DEATH.SPREAD) {
    if (n <= 1) return { x: 0, z: 0 };
    const a = (i / n) * Math.PI * 2 + 0.4;
    const r = spread * (0.55 + 0.45 * ((i * 7) % 3) / 2);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

// --------------------------------------------------------------- models
const BONE = new THREE.MeshLambertMaterial({ color: 0xefe9da });
BONE.userData.shared = true;
const _bx = (g, w, h, d, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), BONE); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m; };

/** A human skeleton lying on its back, head towards −Z, 3 m long (scaled to the body), feet at y 0. */
export function skeletonModel() {
    const g = new THREE.Group();
    _bx(g, 0.5, 0.42, 0.55, 0, 0.21, -1.25); // skull
    _bx(g, 0.14, 0.12, 1.1, 0, 0.08, -0.45); // spine
    for (let i = 0; i < 4; i++) _bx(g, 0.75 - i * 0.06, 0.08, 0.08, 0, 0.12, -0.8 + i * 0.16); // ribs
    _bx(g, 0.62, 0.14, 0.24, 0, 0.08, 0.15); // pelvis
    for (const s of [-1, 1]) {
        _bx(g, 0.1, 0.1, 0.62, s * 0.52, 0.06, -0.5, s * 0.15); // upper arm
        _bx(g, 0.09, 0.09, 0.55, s * 0.62, 0.05, 0.05, -s * 0.1); // forearm
        _bx(g, 0.13, 0.12, 0.72, s * 0.2, 0.07, 0.6); // thigh
        _bx(g, 0.11, 0.1, 0.66, s * 0.23, 0.06, 1.25); // shin
    }
    return g;
}

/**
 * Lay a standing model down on its back, its feet-to-head along −Z of a new
 * pivot whose origin is on the ground under the body's middle. Returns {pivot, len}.
 */
export function layDown(obj, headPlusZ = false) {
    const pivot = new THREE.Group();
    obj.position.set(0, 0, 0);
    obj.rotation.set(headPlusZ ? Math.PI / 2 : -Math.PI / 2, 0, 0);
    pivot.add(obj);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        obj.position.set(-c.x, -box.min.y, -c.z);
    }
    return { pivot, len: box.isEmpty() ? 3 : Math.max(1, box.max.z - box.min.z) };
}

function disposeTree(o) {
    o.traverse((m) => { if (m.isMesh && m.geometry && !m.geometry.userData?.shared && m.material === BONE) m.geometry.dispose(); });
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class DeathSystem {
    constructor(game) {
        this.game = game;
        this.bodies = new Map(); // id -> {id, k, who, name, x, y, z, yaw, age, look, role, model, bones}
        // body makers: (b) => {pivot, len} or null — one per kind of creature
        this.makers = {
            p: (b) => this._playerBody(b),
            v: (b) => this._villagerBody(b),
        };
        if (!game.onDeath) game.onDeath = [];
        if (!game.onRespawn) game.onRespawn = [];
    }

    // ------------------------------------------------------------ players
    /** My player was killed: the body stays, everything drops (not in creative), the hooks run. */
    playerDied(byId = null, text = '') {
        const g = this.game;
        const ch = g.character;
        const p = ch.group.position;
        const pos = { x: p.x, y: p.y, z: p.z };
        if (g.config?.mode !== 'creative') {
            const y = this._ground(p.x, p.z, p.y + 0.5);
            const yaw = ch.group.rotation.y;
            const drops = this.takeEverything();
            this.scatter(drops, { x: p.x, y, z: p.z });
            const b = { id: 'p' + (g.localId || 'me') + '_' + Date.now().toString(36), k: 'p', who: g.localId || 'local', name: g.net?.name || null, x: p.x, y, z: p.z, yaw, age: 0, look: g.config?.look || null };
            this.addBody(b, ch.group);
            g.sync?.deathBody?.(this._wire(b));
        }
        for (const fn of g.onDeath) { try { fn({ byId, text, pos }); } catch (e) { console.warn('[Death] onDeath hook', e); } }
    }

    /** Back in the game (after Game.respawn gave the plain wand): the hooks run. */
    respawned() {
        for (const fn of this.game.onRespawn) { try { fn(); } catch (e) { console.warn('[Death] onRespawn hook', e); } }
    }

    /** Empty the hands, the slots and the back; returns the things (to drop). */
    takeEverything() {
        const g = this.game, inv = g.inventory, it = g.items;
        const held = [];
        if (it) for (const side of ['right', 'left']) if (it.held[side]) held.push(it.releaseHand(side));
        // the coin pouches on the belt drop too, each as it was (CoinBelt)
        if (inv?.purse?.count > 0) { for (const c of purseBags(inv.purse.count)) held.push({ kind: 'coins', count: c }); inv.purse.count = 0; }
        const slots = inv ? inv.slots.slice() : [];
        let backpack = null;
        if (it?.worn.backpack) {
            const bp = it.worn.backpack;
            it.worn.backpack = null;
            g.scene.remove(bp.model);
            bp.model.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
            g.sync?.itemHold?.('back', null);
            backpack = bp.item;
        }
        if (inv) {
            inv.slots.fill(null);
            inv.inHand = null;
            inv.selected = -1;
            if (backpack) inv.setExtraSlots(0);
            inv._render?.();
        }
        return lootOfPlayer({ slots, held, backpack });
    }

    /** Things fall around a spot (a weapon lies as a real weapon; the rest are world items). */
    scatter(drops, at) {
        drops.forEach((d, i) => {
            const o = dropSpot(i, drops.length);
            const p = new THREE.Vector3(at.x + o.x, at.y + 1.1, at.z + o.z);
            const vel = new THREE.Vector3(o.x * 0.8, 1.5, o.z * 0.8);
            if (d.kind === 'weapon') this._dropWeapon(d, p, Math.atan2(o.x, o.z));
            else this.dropItem(d, p, vel);
        });
    }

    /** One thing into the world: the host spawns it; a guest throws it to the host. */
    dropItem(item, p, vel = null) {
        const g = this.game;
        if (!g.items) return;
        if (g.items.auth || !g.sync) g.items.spawnLoose(item, p, { vel: vel || new THREE.Vector3(0, 0.5, 0) });
        else g.sync.itemThrow?.(item, p, vel || new THREE.Vector3(0, 0.5, 0));
    }

    _dropWeapon(d, p, yaw) {
        const g = this.game;
        const id = d.id && !g.weapons.byId.has(d.id) ? d.id : undefined;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'XYZ'));
        const w = g.weapons.markMagic(g.weapons.spawn(d.type === 'axe' ? 'axe' : 'sword', p, q, id), d.magic ? d.bonus : 0);
        w.wake?.();
        if (g.sync) { g.sync.weaponAppeared?.(w); g.sync._localRelease?.(w); }
        return w;
    }

    // ------------------------------------------------------- creatures
    /** (authority) A castle person died: the armed ones drop their things; everybody's body stays. */
    villagerDied(v) {
        const g = this.game;
        const y = this._ground(v.x, v.z, v.y + 1.5);
        // (a sword knocked out by «Экспеллиармус» already lies somewhere: not a second one)
        const drops = lootOfVillager(v.role, { shield: !!v.model?.shield }).filter((d) => !(v.disarmed && d.kind === 'weapon'));
        this.stripVillager(v);
        if (drops.length) this.scatter(drops, { x: v.x, y, z: v.z });
        const b = { id: 'v' + v.id + '_' + Date.now().toString(36), k: 'v', who: v.id, role: v.role, x: v.x, y, z: v.z, yaw: v.yaw || 0, age: 0 };
        this.addBody(b);
        g.sync?.deathBody?.(this._wire(b));
    }

    /** The sword and the shield leave a dead armed villager's hands (they lie on the ground now). */
    stripVillager(v) {
        if (v.role !== 'knight' && v.role !== 'king') return;
        v.model?.setHeldTool?.('none');
        if (v.model?.shield) v.model.shield.visible = false;
    }

    /** Any other creature (for other features): its things drop, its body stays (maker `kind`). */
    creatureDied({ kind = 'c', who = null, x, y, z, yaw = 0, drops = [] }) {
        const gy = this._ground(x, z, y + 1.5);
        if (drops.length) this.scatter(drops, { x, y: gy, z });
        const b = { id: kind + (who || '') + '_' + Date.now().toString(36), k: kind, who, x, y: gy, z, yaw, age: 0 };
        this.addBody(b);
        this.game.sync?.deathBody?.(this._wire(b));
        return b;
    }

    // ------------------------------------------------------------ bodies
    /** A body appears (its model from `from` — a live model to copy — or made by its kind's maker). */
    addBody(b, from = null) {
        if (this.bodies.has(b.id)) return this.bodies.get(b.id);
        b.age = b.age || 0;
        this.bodies.set(b.id, b);
        if (bodyStage(b.age) === 'body') this._makeBody(b, from);
        return b;
    }

    _makeBody(b, from) {
        const g = this.game;
        if (!g.scene) return;
        let made = null;
        try {
            if (from) made = layDown(this._copy(from));
            else made = this.makers[b.k]?.(b) || null;
        } catch (e) { console.warn('[Death] body', e); made = null; }
        if (!made) return;
        b.model = made.pivot;
        b.len = made.len;
        b.headPlusZ = !!made.headPlusZ;
        b.model.position.set(b.x, b.y, b.z);
        b.model.rotation.y = b.yaw || 0;
        g.scene.add(b.model);
    }

    _playerBody(b) {
        const g = this.game;
        const r = b.who && g.remotes?.get(b.who);
        if (r) return layDown(this._copy(r.character.group));
        if (!g.scene) return this._dummyBody();
        const ch = new VoxelCharacter(g.scene, { remote: true });
        if (b.look) try { ch.setLook(b.look); } catch (e) { /* an old look */ }
        ch.group.parent?.remove(ch.group);
        return layDown(ch.group);
    }

    _copy(group) {
        const c = group.clone(true);
        c.visible = true;
        const sprites = [];
        c.traverse((o) => { o.layers.set(0); if (o.isSprite) sprites.push(o); });
        for (const s of sprites) s.parent?.remove(s);
        return c;
    }

    _villagerBody(b) {
        const g = this.game;
        let look = null;
        const [cid, n] = String(b.who || '').split(':');
        const cl = g.castleLife;
        const cs = cl && ([...(cl.castles?.values() || [])].find((c) => c.def.id === cid) || cl._runtimeById?.(cid));
        if (cs) { const e = rosterEntry(cs.def, +n); look = villagerLook(e.seed, e.role, e.female, { castleColor: cs.def.color }); }
        else look = villagerLook(Math.abs(hashStr(b.id)), b.role || 'farmer');
        const m = new VillagerModel({ ...look, tool: 'none' }, { shield: false });
        for (let i = 0; i < 10 && !m.isDeadDone; i++) m.update(0.1, { mode: 'dead' });
        const pivot = new THREE.Group();
        m.group.position.set(0, VILLAGER_FOOT_OFFSET, 0);
        pivot.add(m.group);
        return { pivot, len: 4, headPlusZ: true };
    }

    _dummyBody() {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: 0x3a5f8a });
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.8), mat);
        m.position.y = 0.25;
        g.add(m);
        return { pivot: g, len: 3 };
    }

    _toBones(b) {
        const g = this.game;
        if (b.model) { g.scene.remove(b.model); b.model = null; }
        if (b.bones || !g.scene) return;
        const s = skeletonModel();
        s.scale.setScalar((b.len || 3) / 3);
        if (b.headPlusZ ?? b.k === 'v') s.rotation.y = Math.PI;
        const pivot = new THREE.Group();
        pivot.add(s);
        pivot.position.set(b.x, b.y, b.z);
        pivot.rotation.y = b.yaw || 0;
        g.scene.add(pivot);
        b.bones = pivot;
    }

    removeBody(id, dust = true) {
        const b = this.bodies.get(id);
        if (!b) return;
        this.bodies.delete(id);
        const g = this.game;
        if (b.model) g.scene.remove(b.model);
        if (b.bones) {
            if (dust && g.fx) for (let i = 0; i < 24; i++) g.fx.spark(_v.set(b.x + (Math.random() - 0.5) * 1.5, b.y + 0.2, b.z + (Math.random() - 0.5) * 1.5), 0xd8d0bc, 0.12, _v2.set((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5), 1.2);
            g.scene.remove(b.bones);
            disposeTree(b.bones);
        }
    }

    update(dt) {
        const g = this.game;
        for (const b of [...this.bodies.values()]) {
            b.age += dt;
            const st = bodyStage(b.age);
            if (st === 'gone') { this.removeBody(b.id); continue; }
            if (st === 'bones') { if (!b.bones) this._toBones(b); continue; }
            if (b.model && b.k === 'v') {
                // the villager itself still lies there (its own model): the copy waits
                const v = g.castleLife?.byId?.get(b.who);
                b.model.visible = !(v && v.dead);
            }
        }
    }

    // ------------------------------------------------------------ «Gather»
    /**
     * «Gather» pointed at things lying about (at a body): everything within a
     * few metres of the pointed place goes into the slots. Returns a hint or null.
     */
    gatherAt(o, d) {
        const g = this.game;
        let best = null;
        const consider = (p) => {
            const to = _v.subVectors(p, o);
            const dist = to.length();
            if (dist > DEATH.GATHER_RANGE || dist < 0.2) return;
            const ang = d.angleTo(to.normalize());
            if (ang > DEATH.GATHER_CONE) return;
            const s = ang * 5 + dist * 0.05;
            if (!best || s < best.s) best = { s, p: p.clone() };
        };
        for (const L of g.items?.loose.values() || []) if (!L.hover && !L.accio && !L.item.shop) consider(L.model.position); // (not the market's goods)
        for (const w of g.weapons?.weapons || []) if (this._freeWeapon(w)) consider(w.position);
        for (const b of this.bodies.values()) consider(_v2.set(b.x, b.y + 0.4, b.z).clone());
        if (!best) return null;
        const c = best.p;
        let n = 0, full = false;
        for (const w of [...(g.weapons?.weapons || [])]) {
            if (!this._freeWeapon(w) || w.position.distanceTo(c) > DEATH.GATHER_R) continue;
            const item = { kind: 'weapon', type: w.type, id: w.id, magic: !!w.magic, bonus: w.bonus || 0 };
            if (!g.inventory.store(item)) { full = true; break; }
            g.sync?.weaponGone?.(w);
            g.weapons.remove(w);
            n++;
        }
        for (const L of [...(g.items?.loose.values() || [])]) {
            if (full || L.hover || L.accio || L.asked || L.item.shop || L.model.position.distanceTo(c) > DEATH.GATHER_R) continue;
            if (g.items.auth) g.items.pickUp(L.item.uid, g.localId, 'slot');
            else { L.asked = true; g.sync?.itemTake?.(L.item.uid, 'slot'); setTimeout(() => { L.asked = false; }, 1500); }
            n++;
        }
        if (!n) return full ? '🎒 Все ячейки заняты' : null;
        for (let i = 0; i < 20; i++) g.fx?.spark(c, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.6);
        return `✨ Gather: ${n} ${n === 1 ? 'вещь' : n < 5 ? 'вещи' : 'вещей'} в ячейках`;
    }

    _freeWeapon(w) {
        return w && !w.holder && !w.hover && !w.stuckIn && !this.game.sync?.weaponOwners?.get(w.id);
    }

    // ------------------------------------------------------------ net / save
    _wire(b) {
        const r = (x) => Math.round(x * 100) / 100;
        return { id: b.id, k: b.k, who: b.who, name: b.name || null, role: b.role || null, x: r(b.x), y: r(b.y), z: r(b.z), yaw: r(b.yaw || 0), age: Math.round(b.age || 0), look: b.look || null };
    }

    /** (network) somebody's body: a player's is copied from their avatar while it is still there. */
    onNetBody(w) {
        if (!w || typeof w.id !== 'string' || this.bodies.has(w.id)) return;
        const b = { ...w, x: +w.x || 0, y: +w.y || 0, z: +w.z || 0, yaw: +w.yaw || 0, age: Math.max(0, +w.age || 0) };
        const r = b.k === 'p' && this.game.remotes?.get(b.who);
        this.addBody(b, r ? r.character.group : null);
    }

    snapshot() { return [...this.bodies.values()].map((b) => this._wire(b)); }

    restore(list) {
        for (const w of list || []) this.onNetBody(w);
    }

    dispose() {
        for (const id of [...this.bodies.keys()]) this.removeBody(id, false);
    }

    _ground(x, z, fromY) {
        const c = this.game.collision;
        if (!c) return fromY;
        return c.groundAt ? c.groundAt(x, z, fromY) : c.groundY(x, z);
    }
}

function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
}
