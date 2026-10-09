/**
 * Houses.js — the life of the village houses near the players.
 *
 * The world generator (src/world/Castles.js) builds the houses of stone and
 * planks and leaves records of what belongs inside. Here, for every house a
 * player comes near (and taken away again when everybody has gone):
 *  - a real door in the doorway (src/game/Doors.js — open it by the handle or
 *    push it with the hand; the people of the house open it themselves);
 *  - glass in the windows (one instanced mesh for all panes): a fist, a sword,
 *    an arrow, a thrown thing, a blast or a spell breaks it — for good;
 *  - beds (src/game/Beds.js — you can lie in them) and chests: mostly food,
 *    seldom something precious. Taking from a chest while the family sees it
 *    makes them attack (src/game/CastleLife.js theft);
 *  - the family at home, and the animals in the pens and the barns.
 *
 * Multiplayer: every computer makes the doors, panes, beds and chests of the
 * houses near its own player (they are the same everywhere); the host makes
 * the people, the animals and opens the chests. A broken pane is told to all.
 * Saved: broken panes and repainted beds.
 */

import * as THREE from 'three';
import { Chest } from '../entities/Chest.js';

const NEAR = 75; // m: a house near a player comes to life
const FAR = 100; // m: … and goes back to stone when nobody is this near
const PANE_MAX = 600;
const DOOR_COLOR = 0x7a4f2a;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Houses {
    constructor(game) {
        this.game = game;
        this.enabled = !game.config.map && game.config.mode !== 'test';
        this.active = new Map(); // house id -> {def, i, h, doorId, bedIds, chests, panes, family, ...}
        this.activePens = new Map(); // pen id -> {def, pen}
        this.pens = new Map(); // pen id -> animals still to come
        this.broken = new Set(); // pane ids
        this.bedColors = new Map(); // bed id -> colour (repainted house beds)
        this.panes = []; // panes of the houses near (not broken)
        this._dirty = false;
        this._scanT = 0;
        this._doorT = 0;
        // the glass: one instanced mesh (made now, so prewarm compiles it)
        const geo = new THREE.BoxGeometry(1, 1, 0.08);
        this.glassMat = new THREE.MeshPhongMaterial({ color: 0xcfe9ff, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.3, depthWrite: false });
        this.glass = new THREE.InstancedMesh(geo, this.glassMat, PANE_MAX);
        this.glass.count = 0;
        this.glass.frustumCulled = false; // (instances are all over the village)
        this.glass.renderOrder = 2;
        game.scene.add(this.glass);
    }

    get auth() { return this.game.authority; }
    get index() { return this.game.world?.terrain?.data?.castles || null; }

    _points() {
        const g = this.game;
        const out = [g.character.group.position];
        if (this.auth) for (const r of g.remotes.values()) if (!r.dead) out.push(r.position);
        return out;
    }

    // ------------------------------------------------------------- near / far
    _scan() {
        const idx = this.index;
        if (!idx) return;
        const pts = this._points();
        const seen = new Map(); // house id -> {def, i}
        const pens = new Map();
        for (const p of pts) {
            for (const def of idx.near(p.x, p.z, NEAR)) {
                def.houses.forEach((h, i) => { if (Math.hypot(h.c.x - p.x, h.c.z - p.z) < NEAR) seen.set(h.id, { def, i }); });
                for (const pen of def.pens || []) if (Math.hypot(pen.x - p.x, pen.z - p.z) < NEAR) pens.set(pen.id, { def, pen });
            }
        }
        for (const [id, s] of seen) {
            const rec = this.active.get(id);
            if (!rec) this._activate(s.def, s.i);
            else if (!rec.family && this.auth) rec.family = this.game.castleLife?.spawnFamily(s.def, s.i)?.length ? true : null;
        }
        for (const [id, rec] of [...this.active]) {
            if (seen.has(id)) continue;
            if (pts.every((p) => Math.hypot(rec.h.c.x - p.x, rec.h.c.z - p.z) > FAR)) this._deactivate(rec);
        }
        // pens and barns: their animals (the host's animals are everybody's)
        if (this.auth) {
            for (const rec of this.active.values()) if (rec.h.pen) pens.set(rec.h.id + 'p', { def: rec.def, pen: { ...rec.h.pen, id: rec.h.id + 'p' } });
            for (const [id, s] of pens) if (!this.activePens.has(id)) { this.activePens.set(id, s); this._fillPen(s.pen); }
            for (const [id, s] of [...this.activePens]) if (!pens.has(id) && pts.every((p) => Math.hypot(s.pen.x - p.x, s.pen.z - p.z) > FAR)) this.activePens.delete(id);
        }
    }

    _activate(def, i) {
        const g = this.game;
        const h = def.houses[i];
        const rec = { def, i, h, doorId: null, bedIds: [], chests: [], paneIds: [], family: null, doorOpenT: 0, auto: false, pushT: 0 };
        // the door
        if (h.doorRec && g.doors) {
            const id = h.id + 'd';
            if (!g.doors.list.has(id)) g.doors._place({ id, ...h.doorRec, color: DOOR_COLOR, a: 0, gen: true });
            rec.doorId = id;
        }
        // the beds
        if (g.beds) h.bedSpots.forEach((b, k) => {
            const id = h.id + 'b' + k;
            const bed = g.beds.spawnBed(b, b.yaw, this.bedColors.get(id) || h.bedColour || 'white', { id, broadcast: false });
            bed.gen = true;
            bed.genColor = h.bedColour || 'white';
            rec.bedIds.push(id);
        });
        // the chests (front towards the room)
        h.chests.forEach((c, k) => {
            const id = h.id + 'c' + k;
            if (g.chests.some((x) => x.id === id)) return;
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y + 0.5, c.z), 'loot', c.yaw + Math.PI, id);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.house = { def, i, rich: h.rich };
            chest.locked = false;
            if (g._openedChests?.has(id)) chest.setOpenInstant();
            g.chests.push(chest);
            rec.chests.push(chest);
        });
        // the glass
        h.windows.forEach((w, k) => {
            const id = h.id + 'w' + k;
            rec.paneIds.push(id);
            if (!this.broken.has(id)) this.panes.push({ id, ...w, house: rec });
        });
        this._dirty = true;
        // the people at home
        if (this.auth) rec.family = g.castleLife?.spawnFamily(def, i)?.length ? true : null;
        this.active.set(h.id, rec);
    }

    _deactivate(rec) {
        const g = this.game;
        if (rec.doorId) { const d = g.doors?.list.get(rec.doorId); if (d && !d.moved) g.doors.remove(rec.doorId); }
        for (const id of rec.bedIds) {
            const b = g.beds?.list.get(id);
            if (!b) continue;
            if (b.color !== b.genColor) this.bedColors.set(id, b.color);
            if (g.beds.lying !== id) g.beds.removeBed?.(id);
        }
        for (const c of rec.chests) {
            if (c.isOpen) (g._openedChests = g._openedChests || new Set()).add(c.id);
            if (c.boxId != null) g.collision.removeBox(c.boxId);
            c.dispose();
            const k = g.chests.indexOf(c);
            if (k >= 0) g.chests.splice(k, 1);
        }
        const ids = new Set(rec.paneIds);
        this.panes = this.panes.filter((p) => !ids.has(p.id));
        this._dirty = true;
        if (this.auth) g.castleLife?.releaseFamily(rec.def, rec.i);
        this.active.delete(rec.h.id);
    }

    /** (host) The animals of a pen / a barn (those that are not out already). */
    _fillPen(pen) {
        const g = this.game;
        const A = g.animals;
        if (!A?.enabled) return;
        let n = this.pens.has(pen.id) ? this.pens.get(pen.id) : pen.animals.length;
        const box = { id: pen.id, x: pen.x, z: pen.z, r: pen.r };
        for (let k = 0; n > 0 && k < pen.animals.length; k++, n--) {
            const x = pen.x + (Math.random() - 0.5) * pen.r, z = pen.z + (Math.random() - 0.5) * pen.r;
            A._spawn(pen.animals[k], new THREE.Vector3(x, g.collision.groundAt ? g.collision.groundAt(x, z, pen.y + 2) + 0.5 : pen.y + 0.5, z), { pen: box });
        }
        this.pens.set(pen.id, 0);
    }

    /** (host) A pen animal was taken away for being far: it comes back with the pen. */
    penReturn(id) { this.pens.set(id, (this.pens.get(id) || 0) + 1); this.activePens.delete(id); }

    // ------------------------------------------------------------------ chests
    /** (host) A house chest was opened by `by`: the family may have seen it. */
    chestOpened(chest, by) {
        const H = chest.house;
        if (!H || !by) return false;
        return !!this.game.castleLife?.theft(H.def, H.i, by, chest.getPosition());
    }

    // ------------------------------------------------------------------- glass
    _rebuildGlass() {
        this._dirty = false;
        const n = Math.min(PANE_MAX, this.panes.length);
        for (let k = 0; k < n; k++) {
            const p = this.panes[k];
            _q.setFromAxisAngle(UP, p.ry);
            _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(p.w, p.h, 1));
            this.glass.setMatrixAt(k, _m);
        }
        this.glass.count = n;
        this.glass.instanceMatrix.needsUpdate = true;
    }

    /** Is a point inside a pane (within `pad` of its plane)? */
    _inPane(p, pt, pad = 0.45) {
        const dx = pt.x - p.x, dz = pt.z - p.z, dy = pt.y - p.y;
        const c = Math.cos(p.ry), s = Math.sin(p.ry);
        const along = dx * c - dz * s, across = dx * s + dz * c;
        return Math.abs(across) < pad && Math.abs(along) < p.w / 2 + 0.15 && Math.abs(dy) < p.h / 2 + 0.15;
    }

    /** A pane breaks: shards, the sound; told to the others when it was broken here. */
    breakPane(id, by = null, send = true) {
        if (this.broken.has(id)) return false;
        this.broken.add(id);
        const k = this.panes.findIndex((p) => p.id === id);
        const p = k >= 0 ? this.panes[k] : null;
        if (k >= 0) { this.panes.splice(k, 1); this._dirty = true; }
        const g = this.game;
        if (p) {
            const c = Math.cos(p.ry), s = Math.sin(p.ry);
            for (let i = 0; i < 26; i++) {
                const a = (Math.random() - 0.5) * p.w, b = (Math.random() - 0.5) * p.h;
                g.fx.spark(_v.set(p.x + c * a, p.y + b, p.z - s * a), i % 3 ? 0xdff3ff : 0xffffff, 0.07 + Math.random() * 0.06,
                    _v2.set(s * (Math.random() - 0.5) * 6, Math.random() * 2, c * (Math.random() - 0.5) * 6), 0.9);
            }
            g.sound?.playFrozenHit?.();
        }
        if (send) g.sync?.glass?.(id);
        // a broken window is wrecking: the people of the village don't like it
        if (p && by) g.castleLife?.damaged({ x: p.x, y: p.y - 2, z: p.z }, by, 1, false);
        return true;
    }

    /** A blast breaks the glass round it (on every computer). */
    hitAt(pos, radius) {
        for (const p of [...this.panes]) if (Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z) < radius + 1.5) this.breakPane(p.id, null, false);
    }

    /** A spell ray (Inferno, Thunderwave…) breaks the glass it passes. */
    hitRay(o, d, len, width) {
        for (const p of [...this.panes]) {
            const to = _v.set(p.x - o.x, p.y - o.y, p.z - o.z);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() < width + Math.max(p.w, p.h) / 2) this.breakPane(p.id, null, false);
        }
    }

    _checkGlass() {
        const g = this.game;
        const me = g.character.group.position;
        const ch = g.character;
        const near = this.panes.filter((p) => Math.abs(p.x - me.x) < 16 && Math.abs(p.z - me.z) < 16);
        // my fists / my weapon: a fast hand through the pane
        if (near.length && g.currentPose) {
            for (const side of ['left', 'right']) {
                const v = ch.handVelocity?.[side];
                if (!v || v.length() < 3.2) continue;
                const hp = ch.getHandWorldPosition(side, _v2);
                for (const p of near) if (this._inPane(p, hp, 0.55)) { this.breakPane(p.id, g.localId); break; }
                const held = g.weapons?.heldBy?.(side);
                if (held) {
                    const tip = held.tipWorld?.(_v) || held.position;
                    for (const p of near) if (this._inPane(p, tip, 0.5)) { this.breakPane(p.id, g.localId); break; }
                }
            }
        }
        // flying things: arrows, thrown items (the thrower's computer decides)
        const fly = [];
        for (const a of g.gear?.arrows || []) if (!a.stuck && a.vel.lengthSq() > 30 && (a.by === g.localId || a.by === 'local')) fly.push(a.model.position);
        for (const L of g.items?.loose?.values() || []) if (!L.rest && L.vel && L.vel.lengthSq() > 30 && (!L.thrower || L.thrower === g.localId)) fly.push(L.model.position);
        if (!fly.length) return;
        for (const p of this.panes) {
            if (Math.abs(p.x - me.x) > 60 || Math.abs(p.z - me.z) > 60) continue;
            for (const f of fly) if (this._inPane(p, f, 0.6)) { this.breakPane(p.id, g.localId); break; }
        }
    }

    // ------------------------------------------------------------------- doors
    /**
     * The people of the house open the door when they come to it (and close it
     * after them); a hand pushed against a closed door opens it too.
     */
    _updateDoors(dt) {
        const g = this.game;
        const D = g.doors;
        if (!D) return;
        const me = g.character.group.position;
        const people = g.castleLife ? [...g.castleLife.byId.values()] : [];
        for (const rec of this.active.values()) {
            const d = rec.doorId && D.list.get(rec.doorId);
            if (!d || d.holdSide || d.lifted) continue;
            let someone = false;
            for (const v of people) if (!v.dead && Math.abs(v.x - d.x) < 3.6 && Math.abs(v.z - d.z) < 3.6) { someone = true; break; }
            // my hand pushes the leaf (near the door, a hand out in front at the door's height)
            let push = false;
            if (!someone && g.currentPose && Math.abs(me.x - d.x) < 3.2 && Math.abs(me.z - d.z) < 3.2) {
                for (const side of ['left', 'right']) {
                    const hp = g.character.getHandWorldPosition(side, _v);
                    if (Math.hypot(hp.x - d.x, hp.z - d.z) < 1.4 && hp.y > d.y + 0.8 && hp.y < d.y + (d.h || 3.6)) { push = true; break; }
                }
            }
            rec.pushT = push ? rec.pushT + dt : 0;
            if (someone || rec.pushT > 0.35) {
                rec.auto = true;
                rec.doorOpenT = 0;
                if (d.a < 1.45) {
                    const a = Math.min(1.45, d.a + dt * 2.5);
                    D.swing(rec.doorId, a);
                    if (rec.pushT > 0.35 && Math.abs(a - (d._sentA ?? 0)) > 0.1) { d._sentA = a; g.sync?.doorAngle?.(d.id, a); }
                }
            } else if (rec.auto) {
                // nobody in the doorway for a while: it closes behind them
                const clear = Math.abs(me.x - d.x) > 3.5 || Math.abs(me.z - d.z) > 3.5;
                rec.doorOpenT += dt;
                if (clear && rec.doorOpenT > 3) {
                    const a = Math.max(0, d.a - dt * 1.8);
                    D.swing(rec.doorId, a);
                    if (a <= 0) rec.auto = false;
                }
            }
        }
    }

    // ------------------------------------------------------------------- frame
    update(dt) {
        if (!this.enabled) return;
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 0.5; this._scan(); }
        if (!this.active.size) { if (this._dirty) this._rebuildGlass(); return; }
        this._updateDoors(dt);
        this._checkGlass();
        if (this._dirty) this._rebuildGlass();
    }

    // ------------------------------------------------------------ net / save
    applyGlass(id) { this.breakPane(id, null, false); }

    snapshot() {
        return { broken: [...this.broken], beds: [...this.bedColors] };
    }

    restore(s) {
        if (!s) return;
        for (const id of s.broken || []) this.broken.add(id);
        for (const [id, c] of s.beds || []) this.bedColors.set(id, c);
        this.panes = this.panes.filter((p) => !this.broken.has(p.id));
        this._dirty = true;
    }

    dispose() {
        for (const rec of [...this.active.values()]) this._deactivate(rec);
        this.game.scene.remove(this.glass);
        this.glass.geometry.dispose();
        this.glassMat.dispose();
    }
}
