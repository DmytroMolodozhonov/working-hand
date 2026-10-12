/**
 * Ships.js — the 17th-century ships of the sea castles.
 *
 * Every sea castle's port (src/world/Castles.js, `port.berths`) has 1–3 ships.
 * A ship is a moving piece of the world: its decks are floors (walk aboard on
 * the gangplank, up the stairs, into the captain's cabin), its rails, masts and
 * bulkheads stop bodies, and everyone standing on it is carried along when it
 * moves, turns and rides the waves (players, zombies, animals, things, weapons).
 *
 * Sails are furled by default: «Анфёрл» (point at the sails) lets a mast's sails
 * down, «Анфёрл Максима» all of them, «Фёрл» rolls them up again. A ship only
 * moves when wind fills its sails: «Вайнд» / «Вайнд Максима» at the sails (they
 * bulge at once), and that wind dies down; now and then a natural breeze blows.
 * A ship is heavy: slow to gather way, slow to turn, it coasts for a long time.
 * The wheel is turned by a real hand on its spokes (Helm.js); the crew (Sailors.js)
 * defends its ship; Bombardo, fire and cannonballs (Cannons.js) make holes, the
 * sea comes in and the ship sinks.
 *
 * Multiplayer: the host runs the ships (physics, crew, damage) and sends them;
 * guests draw them a little in the past, smoothly, and send what their hands and
 * spells do.
 */

import * as THREE from 'three';
import { SHIP_CLASSES, PORT_SHIPS, shipName, strHash, HELM_LOCK } from './ShipTypes.js';
import { buildLayout, floorAt as layoutFloorAt, roomAt, hullHalfWidth, keelY } from './ShipLayout.js';
import { ShipPose, ShipCollider, PlankCollider } from './ShipCollision.js';
import { stepShip, waveResponse, newShipState } from './ShipPhysics.js';
import { DMG, blastDamage, holeRadius, leakRate, stepFire, stepSinking } from './ShipDamage.js';
import { ShipModel } from '../entities/ShipModel.js';
import { Chest } from '../entities/Chest.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { setNearShadow } from '../core/Shadows.js';
import { Helm } from './Helm.js';
import { Cannons } from './Cannons.js';
import { Sailors } from './Sailors.js';
import { Rigging } from './Rigging.js';
import { rollShipLoot } from './ItemTypes.js';
import { createRng } from '../core/math.js';

const WAKE = 320; // m: a ship near any player is awake (moves, has its model)
const SLEEP = 420;
const SCAN = 650; // m: ports this far are looked at
const UNFURL_RATE = 1 / 3; // sails unroll in 3 s
const WIND_PLAIN = 21; // m/s into the sails while «Вайнд» blows (3× the old gust)
const WIND_MAXIMA = 42; // «Вайнд Максима» (6× the old «Вайнд»)
const BLOW_MANA = 1; // a second, while the wind blows into the sails
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _l = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };

const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A ship's state for the network: [id, x, z, yaw, u, v, r, wheel, sinkY, flags, hp, flood100, roll, pitch]. */
export function packShip(s) {
    const st = s.st;
    const flags = (s.state === 'moored' ? 1 : 0) | (s.state === 'sinking' ? 2 : 0) | (s.state === 'wreck' ? 4 : 0) | (s.plank?.state === 'laid' ? 8 : 0) | (s.plank?.state === 'fallen' ? 16 : 0) | (s.flooded ? 32 : 0) | (s.blow ? 64 : 0);
    return [s.id, r2(st.x), r2(st.z), r3(st.yaw), r2(st.u), r2(st.v), r3(st.r), r2(st.wheel), r2(s.sinkY || 0), flags, Math.round(s.hp), Math.round((s.flood || 0) * 100), r3(s.sinkRoll || 0), r3(s.sinkPitch || 0)];
}

export function unpackShip(a) {
    const f = a[9] | 0;
    return {
        id: a[0], x: a[1], z: a[2], yaw: a[3], u: a[4], v: a[5], r: a[6], wheel: a[7], sinkY: a[8],
        state: f & 4 ? 'wreck' : f & 2 ? 'sinking' : f & 1 ? 'moored' : 'free',
        plank: f & 8 ? 'laid' : f & 16 ? 'fallen' : 'aboard', flooded: !!(f & 32), blowing: !!(f & 64),
        hp: a[10], flood: a[11] / 100, sinkRoll: a[12] || 0, sinkPitch: a[13] || 0,
    };
}

export class Ships {
    constructor(game) {
        this.game = game;
        this.enabled = !game.config.map && game.config.mode !== 'test';
        this.list = new Map(); // id → ship
        this.awake = new Set();
        this.riders = new Map(); // entity key → {ent, ship, l: {x,y,z}}
        this.me = null; // my rider record (who I stand on)
        this.wind = { x: 0, z: 0 }; // the natural wind (host decides)
        this.calm = false; // (tests) no waves, no weather
        this._scanT = 0;
        this._netT = 0;
        this._weatherT = 30;
        this._breeze = null;
        this.saved = new Map(); // id → saved state (ships not made yet)
        this.helm = new Helm(game, this);
        this.rigging = new Rigging(game, this); // mooring lines and rope ladders in the hands
        this.cannons = new Cannons(game, this);
        this.crew = new Sailors(game, this);
        this._adapters = new Map();
    }

    get auth() { return this.game.authority; }
    get castles() { return this.game.world?.terrain?.data?.castles || null; }

    // ================================================================== ships
    /**
     * Make a ship (also used for tests). opts: {id, berth, castleId, color, name, state}
     */
    spawn(clsId, x, z, yaw, opts = {}) {
        const C = SHIP_CLASSES[clsId];
        if (!C) return null;
        const id = opts.id || `ship${this.list.size + 1}_${Math.round(x)}_${Math.round(z)}`;
        if (this.list.has(id)) return this.list.get(id);
        const layout = buildLayout(clsId);
        const st = newShipState(x, z, yaw);
        const ship = {
            id, cls: C, layout, name: opts.name || shipName(id), color: opts.color ?? 0x2a5aa0,
            castleId: opts.castleId || null, berth: opts.berth || null,
            st, pose: new ShipPose(), collider: new ShipCollider(layout), model: null,
            state: opts.state || (opts.berth ? 'moored' : 'free'),
            hp: C.hp, flood: 0, sinkY: 0, sinkRoll: 0, sinkPitch: 0, flooded: false, holes: [], fires: [],
            sails: layout.sails.map((sp) => ({ ...sp, open: 0, target: 0, fill: 0, side: 1, gust: 0, burnt: 0 })),
            helmBy: null, hostile: new Map(), owner: null, ownerName: null, crewKilled: new Set(),
            lines: [], plank: null, chests: [], awake: false, changed: false, lastBy: null,
            guns: new Map(layout.cannons.map((g) => [g.id, { loaded: false, fuse: 0, recoil: 0 }])),
            racks: new Map(layout.racks.map((r) => [r.id, r.balls])),
            net: null,
        };
        Object.defineProperty(ship, 'wheel', { get() { return this.st.wheel; }, set(v) { this.st.wheel = Math.max(-HELM_LOCK, Math.min(HELM_LOCK, v)); } });
        Object.defineProperty(ship, 'speed', { get() { return this.st.u; } });
        if (ship.berth) this._makeLines(ship);
        this.list.set(id, ship);
        const sv = this.saved.get(id);
        if (sv) { this._applySaved(ship, sv); this.saved.delete(id); }
        this._place(ship);
        if (opts.wake !== false) this.wake(ship);
        return ship;
    }

    /** Where the ship is now (pose from the physics state). */
    _place(s) {
        const st = s.st;
        s.pose.set(st.x, WATER_LEVEL_Y + (st.heave || 0) - (s.sinkY || 0), st.z, st.yaw, (st.roll || 0) + (s.sinkRoll || 0), (st.pitch || 0) + (s.sinkPitch || 0));
        s.collider.setPose(s.pose);
        s.collider.flooded = s.flooded;
        s.collider.gangwayOpen = s.plank?.state === 'laid';
    }

    wake(s) {
        if (typeof s === 'string') s = this.list.get(s);
        if (!s || s.awake) return s;
        s.awake = true;
        this.awake.add(s);
        const g = this.game;
        if (!s.model) {
            s.model = new ShipModel(s.layout, { color: s.color, name: s.name });
            g.scene.add(s.model.group);
            for (const h of s.holes) h.mesh = s.model.addHole(h.lx, h.ly, h.lz, h.r, h.deck);
        }
        s.model.group.visible = true;
        g.collision.addMover(s.collider);
        this._makePlank(s);
        this._makeChests(s);
        this._place(s);
        s.model.setPose(s.pose);
        this.crew.wake(s);
        return s;
    }

    sleep(s) {
        if (!s.awake) return;
        s.awake = false;
        this.awake.delete(s);
        const g = this.game;
        g.collision.removeMover(s.collider);
        if (s.plank?.collider) g.collision.removeMover(s.plank.collider);
        if (s.plank?.mesh) { g.scene.remove(s.plank.mesh); s.plank.mesh.geometry.dispose(); s.plank.mesh = null; }
        if (s.model) { s.model.dispose(); s.model = null; }
        for (const c of s.chests) { c.dispose(); const i = g.chests.indexOf(c); if (i >= 0) g.chests.splice(i, 1); }
        s.chests = [];
        this.crew.sleep(s);
        for (const [k, r] of this.riders) if (r.ship === s) this.riders.delete(k);
    }

    /** Ships of the sea castles' ports near the players. */
    _scan() {
        const idx = this.castles;
        const players = this._players();
        if (idx && idx.near) {
            for (const pl of players) {
                for (const def of idx.near(pl.x, pl.z, SCAN)) {
                    const port = def.port;
                    if (!port || !Array.isArray(port.berths)) continue;
                    port.berths.forEach((b, k) => {
                        const id = `${def.id}:ship${k}`;
                        if (this.list.has(id) || !SHIP_CLASSES[b.cls]) return;
                        this.spawn(b.cls, b.x, b.z, b.yaw ?? 0, { id, berth: b, castleId: def.id, color: def.color, wake: false });
                    });
                    // the port's own guns (the «sea» session places them: port.cannons [{x, y, z, yaw}])
                    if (Array.isArray(port.cannons)) this.cannons.addPortGuns(def.id, port.cannons);
                }
            }
        }
        for (const s of this.list.values()) {
            let d = Infinity;
            for (const pl of players) d = Math.min(d, Math.hypot(pl.x - s.st.x, pl.z - s.st.z));
            if (!s.awake && d < WAKE) this.wake(s);
            else if (s.awake && d > SLEEP) this.sleep(s);
        }
    }

    _players() {
        const g = this.game;
        const out = [{ id: g.localId, x: g.character.group.position.x, z: g.character.group.position.z }];
        for (const [id, r] of g.remotes) out.push({ id, x: r.position.x, z: r.position.z });
        return out;
    }

    // ========================================================== the gangplank, lines
    _gangwayLocal(s, side) {
        const L = s.layout;
        return { x: side * (hullHalfWidth(L, L.gangZ, L.deck) - 1.0), y: L.deck, z: L.gangZ }; // (the plank's end rests on the deck)
    }

    /** The plank's pier end: on the pier's edge straight abreast of the gangway (a plank goes straight across). */
    _plankPier(s) {
        if (s._plankA) return s._plankA;
        const b = s.berth, A = b.plankA;
        const c = Math.cos(b.yaw ?? 0), sn = Math.sin(b.yaw ?? 0);
        // the pier edge point in the berth's frame, moved along the ship to the gangway
        const dx = A.x - b.x, dz = A.z - b.z;
        const lx = dx * c - dz * sn;
        // (not onto a bollard or a post: a little along the pier where it is clear)
        const data = this.game.terrain?.data;
        const deckL = Math.round(A.y + 0.5);
        const clear = (x, z) => !data || data.topLayer(Math.round(x), Math.round(z)) <= deckL;
        let best = null;
        for (const dz of [0, 1, -1]) {
            const lz = s.layout.gangZ + dz;
            const at = (k) => ({ x: b.x + (lx + k * Math.sign(lx || 1)) * c + lz * sn, z: b.z - (lx + k * Math.sign(lx || 1)) * sn + lz * c });
            const p0 = at(0), p1 = at(1.2), p2 = at(2.4);
            if (clear(p0.x, p0.z) && clear(p1.x, p1.z) && clear(p2.x, p2.z)) { best = { x: p0.x, y: A.y, z: p0.z }; break; }
        }
        s._plankA = best || { x: b.x + lx * c + s.layout.gangZ * sn, y: A.y, z: b.z - lx * sn + s.layout.gangZ * c };
        return s._plankA;
    }

    _makeLines(s) {
        const b = s.berth;
        const L = s.layout;
        const side = b.side || 1;
        s.lines = L.bitts.map((bt, i) => {
            let bol = b.bollards?.[i];
            if (!bol) {
                // (no bollards given: a point on the pier abreast of the bitt)
                const c = Math.cos(b.yaw ?? 0), sn = Math.sin(b.yaw ?? 0);
                const lx = side * (L.B / 2 + 4), lz = bt.z;
                bol = { x: b.x + lx * c + lz * sn, y: (b.pierY ?? L.deck - 1), z: b.z - lx * sn + lz * c };
            }
            const c = Math.cos(b.yaw ?? 0), sn = Math.sin(b.yaw ?? 0);
            const wx = b.x + bt.x * c + bt.z * sn, wz = b.z - bt.x * sn + bt.z * c;
            return { id: bt.id, bitt: { x: bt.x, y: bt.y, z: bt.z }, bollard: { x: bol.x, y: bol.y ?? 0, z: bol.z }, L0: Math.hypot(bol.x - wx, bol.z - wz) + 0.5, state: 'tied', strain: 0 };
        });
    }

    _makePlank(s) {
        const b = s.berth;
        if (!b || !b.plankA || s.plank?.state === 'fallen' || s.plank?.state === 'gone') return;
        if (!s.plank) s.plank = { state: 'laid', collider: new PlankCollider(), mesh: null, side: b.side || 1, t: 0 };
        if (s.plank.state !== 'laid') return;
        this.game.collision.addMover(s.plank.collider);
        const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1), new THREE.MeshLambertMaterial({ color: 0x9c6c3c }));
        m.castShadow = true;
        s.plank.mesh = m;
        this.game.scene.add(m);
        this._updatePlank(s, 0);
    }

    _updatePlank(s, dt) {
        const p = s.plank;
        if (!p || p.state !== 'laid' || !s.berth?.plankA) return;
        const A = this._plankPier(s);
        const gw = this._gangwayLocal(s, p.side);
        s.pose.toWorld(gw.x, gw.y, gw.z, _o);
        p.collider.set(A, _o);
        const len = Math.hypot(_o.x - A.x, _o.y - A.y, _o.z - A.z);
        p.len0 = p.len0 || len;
        if (p.mesh) {
            p.mesh.scale.set(1, 1, Math.max(0.5, len));
            p.mesh.position.set((A.x + _o.x) / 2, (A.y + _o.y) / 2 + 0.08, (A.z + _o.z) / 2);
            p.mesh.lookAt(_o.x, _o.y + 0.08, _o.z);
        }
        // pulled apart: the plank falls into the water
        if (this.auth && len > p.len0 + 3) this._plankFalls(s);
        void dt;
    }

    _plankFalls(s, broadcast = true) {
        const p = s.plank;
        if (!p || p.state !== 'laid') return;
        p.state = 'fallen';
        this.game.collision.removeMover(p.collider);
        if (p.mesh) {
            const m = p.mesh;
            const t0 = performance.now();
            const g = this.game;
            g.sound?.playSplash?.();
            p.fall = { m, t0, y0: m.position.y };
        }
        s.changed = true;
        if (broadcast && this.auth) this._event(s, { k: 'plank', s: 'fallen' });
    }

    // ===================================================================== chests
    _makeChests(s) {
        const g = this.game;
        if (s.chests.length) return;
        s.layout.chests.forEach((c, k) => {
            const id = `${s.id}:ch${k}`;
            const chest = new Chest(g.scene, new THREE.Vector3(), 'loot', 0, id);
            chest.ship = s;
            chest.local = c;
            chest.locked = c.locked === 'captain' && !s.owner && this.crew.captainAlive(s);
            chest.lockedBy = c.locked;
            if (g._openedChests?.has(id)) chest.setOpenInstant();
            s.chests.push(chest);
            g.chests.push(chest);
        });
        this._placeChests(s);
    }

    _placeChests(s) {
        for (const ch of s.chests) {
            const c = ch.local;
            s.pose.toWorld(c.x, c.y, c.z, _o);
            ch.mesh.position.set(_o.x, _o.y, _o.z);
            ch.mesh.rotation.set(s.pose.pitch, s.st.yaw + c.yaw, s.pose.roll, 'YXZ');
            if (c.locked === 'captain') ch.locked = !s.owner && this.crew.captainAlive(s);
        }
    }

    /** (host) A ship chest opens: food, money, weapons — and often a fishing rod. */
    lootChest(chest, pos) {
        const g = this.game;
        const items = rollShipLoot(Math.random, chest.local?.room === 'captain');
        items.forEach((it, i) => {
            const p = pos.clone().add(_v.set((i - (items.length - 1) / 2) * 0.8, 2.2, 0));
            if (it.kind === 'weapon') {
                const w = g.weapons.spawnHovering(it.type, p, it.uid);
                w.magic = !!it.magic; w.bonus = it.magic ? it.bonus : 0;
                w.applyMagicLook?.();
                if (g.sync) g.sync.weaponAppeared?.(w);
            } else g.items.spawnLoose(it, p, { hover: true });
        });
        const s = chest.ship;
        if (s) {
            s.changed = true;
            const by = chest._openedBy;
            if (by && !s.owner && this.crew.alive(s) > 0 && !this.loyalTo(s, by)) this.crew.provoke(s, by, '🏴 Матросы видели, как вы открыли сундук! К бою!');
        }
        return items;
    }

    // ===================================================================== frame
    update(dt) {
        if (!this.enabled) return;
        const g = this.game;
        if ((this._scanT -= dt) <= 0) { this._scanT = 1; this._scan(); }
        if (this.auth && !this.calm) this._weather(dt);
        this._blowing(dt);
        const t = g.seaTime ? g.seaTime() : performance.now() / 1000;
        // (its own vector: the effects below use _w for their sparks)
        const cam = g.camera?.getWorldPosition ? g.camera.getWorldPosition(_cam) : g.character.group.position;
        const night = !!g.isNight;
        for (const s of this.awake) {
            const prevX = s.pose.x, prevY = s.pose.y, prevZ = s.pose.z, prevYaw = s.pose.yaw, prevRoll = s.pose.roll, prevPitch = s.pose.pitch;
            if (this.auth) this._simulate(s, dt);
            else this._interpolate(s, dt);
            this._waves(s, t, dt);
            this._sails(s, dt, t);
            this._place(s);
            this._updatePlank(s, dt);
            this._carry(s, prevX, prevY, prevZ, prevYaw, prevRoll, prevPitch);
            if (s.model) {
                s.model.setPose(s.pose);
                s.model.setWheel(s.st.wheel);
                const d = Math.hypot(cam.x - s.pose.x, cam.z - s.pose.z);
                s.model.setDetail(d);
                setNearShadow(s.model.group, d < 120);
                s.model.setNight(night);
                if (d < 230) {
                    const W = this._apparentWind(s, _d);
                    s.pose.dirToLocal(W.x, W.z, _l);
                    s.model.updateFlags(_l, t);
                }
                this._fireFx(s, dt);
                this._leakFx(s, dt, t, cam);
            }
            this._placeChests(s);
            if (s.plank?.fall) this._plankFallFx(s, dt);
        }
        this.helm.update(dt);
        this.rigging.update(dt);
        this.cannons.update(dt);
        this.crew.update(dt);
        if (g.sync) this._net(dt);
    }

    /** (host) One step of a ship: wind, sails, the wheel, the lines, the ground; damage, fire, sinking. */
    _simulate(s, dt) {
        const st = s.st;
        const g = this.game;
        if (s.state === 'wreck') { st.u = st.v = st.r = 0; return; }
        const open = this._openFrac(s);
        const data = g.terrain?.data;
        const env = {
            wind: this.wind,
            openFrac: s.state === 'sinking' ? open * 0.3 : open,
            moorings: s.lines,
            solidAt: data ? (x, y, z) => data.isSolidAt(x, y, z) : null,
            onHit: (dmg) => this._grounded(s, dmg),
        };
        st.y0 = WATER_LEVEL_Y - (s.sinkY || 0);
        this._applyBlow(s, dt);
        const before = s.lines.map((l) => l.state);
        stepShip(st, s.cls, env, dt);
        s.lines.forEach((l, i) => {
            if (l.state === 'snapped' && before[i] !== 'snapped') {
                g.hud.setVoice?.('🪢 Канаты лопнули!', true);
                this._event(s, { k: 'line', i, s: 'snapped' });
                s.changed = true;
            }
        });
        if (s.state === 'moored' && s.lines.every((l) => l.state !== 'tied')) { s.state = 'free'; s.changed = true; }
        if (Math.abs(st.u) > 0.05 || Math.abs(st.r) > 0.002) s.changed = true;
        this._damageStep(s, dt);
    }

    _grounded(s, dmg) {
        const now = performance.now();
        if (now - (s._groundT || 0) > 3000) {
            s._groundT = now;
            if (this._riderShip() === s) this.game.hud.setVoice?.('🪨 Корабль сел на мель', true);
        }
        if (dmg > 0) this.damage(s, dmg, null);
    }

    _riderShip() { return this.me?.ship || null; }

    _openFrac(s) {
        let a = 0;
        for (const sl of s.sails) a += sl.area * sl.open * (1 - sl.burnt);
        return a / s.layout.sailArea;
    }

    /** Where the wind blows on the ship (world, m/s): nature + the spells − the ship's own motion. */
    _apparentWind(s, out) {
        const st = s.st;
        const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
        const vx = -sn * st.u + c * st.v, vz = -c * st.u - sn * st.v;
        out.x = this.wind.x + st.spellWind.x - vx;
        out.z = this.wind.z + st.spellWind.z - vz;
        out.y = 0;
        return out;
    }

    /** Sails unroll / roll up; the wind fills them (computed the same way on every computer). */
    _sails(s, dt, t) {
        const W = this._apparentWind(s, _d);
        s.pose.dirToLocal(W.x, W.z, _l);
        const wx = _l.x, wz = _l.z;
        const w2 = wx * wx + wz * wz;
        const blowing = this.auth ? !!s.blow : !!s.net?.blowing;
        for (const sl of s.sails) {
            if (blowing && sl.open > 0.5 && sl.burnt < 1) sl.gust = Math.max(sl.gust, 0.9);
            const want = sl.burnt >= 1 ? sl.open : sl.target;
            if (sl.open < want) sl.open = Math.min(want, sl.open + UNFURL_RATE * dt);
            else if (sl.open > want) sl.open = Math.max(want, sl.open - UNFURL_RATE * dt);
            const dot = wx * sl.normal.x + wz * sl.normal.z;
            let ft;
            if (sl.kind === 'square') {
                // braced yards: a wind from astern or the quarter fills them; from ahead — aback
                const along = -wz; // the wind's push forward
                const eff = Math.max(Math.abs(along) / Math.max(1e-6, Math.sqrt(w2)), 0.35);
                ft = Math.min(1, (w2 * eff) / 64);
                sl.side = dot >= 0 ? 1 : -1;
            } else {
                ft = Math.min(1, (w2 * 0.6) / 64);
                sl.side = dot >= 0 ? 1 : -1;
            }
            ft = ft * (sl.open > 0.5 ? 1 : sl.open) + sl.gust * 0.5;
            ft = Math.min(1, ft);
            sl.fill += Math.max(-1.5 * dt, Math.min(1.5 * dt, ft - sl.fill));
            if (sl.gust > 0.4 && sl.fill < 0.5 * sl.gust) sl.fill = 0.5 * sl.gust; // (a gust bulges it at once)
            sl.gust = Math.max(0, sl.gust - dt);
            const m = s.model?.sails.get(sl.id);
            if (m && s.model.detail > 0) m.setState(sl.open, sl.fill, sl.side, sl.burnt, t);
        }
    }

    /** Waves rock the ship (the «sea» session's waves; still water on a lake). */
    _waves(s, t, dt) {
        const st = s.st;
        const sea = this.game.sea;
        const wave = !this.calm && sea ? (x, z, tt) => sea.height(x, z, tt) : null;
        if (!wave) {
            waveResponse(st, s.cls, null, dt, this._heel(s));
            return;
        }
        const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
        const sample = (lx, lz) => wave(st.x + lx * c + lz * sn, st.z - lx * sn + lz * c, t);
        waveResponse(st, s.cls, sample, dt, this._heel(s));
    }

    /** The wind's push on the sails heels the ship a little. */
    _heel(s) {
        const st = s.st;
        return Math.max(-0.08, Math.min(0.08, -st.v * 0.04));
    }

    /** Guests: the host's ship, a moment in the past, smoothly. */
    _interpolate(s, dt) {
        const n = s.net;
        const st = s.st;
        if (!n) return;
        n.age = (n.age || 0) + dt;
        // a little prediction from the speeds, pulled towards the last snapshot
        const k = Math.min(1, dt * 6);
        const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
        st.x += (-sn * n.u + c * n.v) * dt;
        st.z += (-c * n.u - sn * n.v) * dt;
        st.yaw += n.r * dt;
        const age = Math.min(0.3, n.age);
        const tx = n.x + (-Math.sin(n.yaw) * n.u + Math.cos(n.yaw) * n.v) * age;
        const tz = n.z + (-Math.cos(n.yaw) * n.u - Math.sin(n.yaw) * n.v) * age;
        const tyaw = n.yaw + n.r * age;
        if (Math.hypot(tx - st.x, tz - st.z) > 12) { st.x = tx; st.z = tz; st.yaw = tyaw; }
        st.x += (tx - st.x) * k;
        st.z += (tz - st.z) * k;
        st.yaw += angleDiff(tyaw, st.yaw) * k;
        st.u = n.u; st.v = n.v; st.r = n.r;
        if (!this.helm.holding(s)) st.wheel += (n.wheel - st.wheel) * k;
        s.sinkY += ((n.sinkY || 0) - s.sinkY) * k;
        s.sinkRoll += ((n.sinkRoll || 0) - s.sinkRoll) * k;
        s.sinkPitch += ((n.sinkPitch || 0) - s.sinkPitch) * k;
    }

    // ============================================================ carrying riders
    /** Everyone standing on the ship goes with it (moves, turns, rides the waves). */
    _carry(s, px, py, pz, pyaw, proll, ppitch) {
        if (!this.riders.size) return;
        const dyaw = angleDiff(s.pose.yaw, pyaw);
        const moved = px !== s.pose.x || py !== s.pose.y || pz !== s.pose.z || dyaw !== 0 || proll !== s.pose.roll || ppitch !== s.pose.pitch;
        if (!moved) return;
        const prev = this._prevPose || (this._prevPose = new ShipPose());
        prev.set(px, py, pz, pyaw, proll, ppitch);
        for (const r of this.riders.values()) {
            if (r.ship !== s) continue;
            const p = r.ent.pos();
            if (!p) continue;
            // (somebody put elsewhere since — a teleport, a respawn: not pulled back)
            prev.toWorld(r.l.x, r.l.y, r.l.z, _o);
            if (Math.abs(_o.x - p.x) + Math.abs(_o.z - p.z) > 1.5 || Math.abs(_o.y - p.y) > 3) continue;
            s.pose.toWorld(r.l.x, r.l.y, r.l.z, _o);
            p.x = _o.x; p.y = _o.y; p.z = _o.z;
            if (dyaw) r.ent.turn(dyaw);
            r.ent.moved?.();
        }
    }

    /** The entities that can ride a ship (cached adapters). */
    _entities() {
        const g = this.game;
        const out = this._entList || (this._entList = []);
        out.length = 0;
        out.push(this._adapter('me', () => this._meAdapter()));
        if (this.auth) {
            for (const z of g.zombies) if (!z.isDead) out.push(this._adapter('z' + z.id, () => ({
                pos: () => z.group.position, turn: (d) => { z.group.rotation.y += d; }, free: () => !z.lev && !z.isDead, feet: () => z.group.position.y - 1,
            })));
            for (const a of g.animals?.list || []) if (!a.dead) out.push(this._adapter('a' + a.id, () => ({
                pos: () => a.group.position, turn: (d) => { a.group.rotation.y += d; }, free: () => !a.lev && !a.dead, feet: () => a.group.position.y - 0.5,
            })));
            for (const L of g.items?.loose.values() || []) out.push(this._adapter('i' + L.item.uid, () => ({
                pos: () => (L.hover || L.model.position), turn: (d) => { L.model.rotation.y += d; }, free: () => !L.accio && !L.lev && !L.remote && g.items.loose.get(L.item.uid) === L, feet: () => (L.hover || L.model.position).y - 0.2,
                moved: () => { if (L.hover) L.model.position.copy(L.hover); else L.rest = false; },
            })));
            for (const w of g.weapons?.weapons || []) out.push(this._adapter('w' + w.id, () => ({
                pos: () => (w.hover ? w.hover.base : w.position), turn: (d) => { _q.setFromAxisAngle(_UP, d); w.quaternion.premultiply(_q); }, free: () => !w.holder && !w.remoteTarget && !w.drive && !w.stuckIn, feet: () => (w.hover ? w.hover.base : w.position).y - 0.3,
                moved: () => { if (!w.hover && w.sleeping) w.wake(); },
            })));
        }
        if (this._adapters.size > 600) this._adapters.clear();
        return out;
    }

    _adapter(key, make) {
        let a = this._adapters.get(key);
        if (!a) { a = make(); a.key = key; this._adapters.set(key, a); }
        return a;
    }

    _meAdapter() {
        const g = this.game;
        const ch = g.character;
        return {
            pos: () => ch.group.position,
            turn: (d) => { ch.group.rotation.y += d; g.cameraBaseRotation += d; g.smoothBody += d; },
            free: () => !g.flight?.active && !g.levitation?.lifted && !g.swim?.swimming && !g.isDeadLocal && !g.combat?.dead && !g.beds?.lying && !g.animals?.riding && !this.rigging.climbing,
            feet: () => ch.group.position.y - PLAYER_GROUND_OFFSET + (ch.isCrouching ? 1 : 0),
        };
    }

    /** After everything moved this frame: who stands on which ship now (in its own coordinates). */
    attach() {
        if (!this.enabled) return;
        if (!this.awake.size) { if (this.riders.size) this.riders.clear(); this.me = null; return; }
        const seen = this._seen || (this._seen = new Set());
        seen.clear();
        for (const ent of this._entities()) {
            seen.add(ent.key);
            const p = ent.pos();
            const s = p && ent.free() ? this._shipUnder(p, ent.feet()) : null;
            if (!s) { this.riders.delete(ent.key); continue; }
            let r = this.riders.get(ent.key);
            if (!r) { r = { ent, ship: s, l: { x: 0, y: 0, z: 0 } }; this.riders.set(ent.key, r); }
            r.ship = s;
            s.pose.toLocal(p.x, p.y, p.z, r.l);
        }
        for (const k of this.riders.keys()) if (!seen.has(k)) this.riders.delete(k);
        this.me = this.riders.get('me') || null;
    }

    _shipUnder(pos, feetY) {
        for (const s of this.awake) {
            if (!s.collider.hasXZ(pos.x, pos.z)) continue;
            const f = s.collider.floorAt(pos.x, pos.z, feetY + 1.1);
            if (f === null) continue;
            const above = feetY - f;
            if (above < 0.6 || (s.collider.insideHull(pos.x, pos.z) && above < 14 && above > -0.5)) {
                if (s.flooded && f < WATER_LEVEL_Y) continue; // a sunk deck carries nobody
                return s;
            }
        }
        return null;
    }

    // ================================================================ queries
    /** The ship whose hull (or deck) is at a world point (or null). */
    shipAt(x, y, z) {
        for (const s of this.awake) {
            if (!s.collider.hasXZ(x, z)) continue;
            s.pose.toLocal(x, y, z, _l);
            const L = s.layout;
            if (Math.abs(_l.x) > hullHalfWidth(L, _l.z, L.deck) + 0.6 || _l.z < -L.L / 2 - 1 || _l.z > L.L / 2 + 1) continue;
            if (_l.y < keelY(L, _l.z) - 0.5 || _l.y > L.railTopAt(_l.z) + 1.5) continue;
            return s;
        }
        return null;
    }

    /** Building, doors, beds: refused on a ship. */
    footprintAt(x, y, z) { return !!this.shipAt(x, y, z); }

    /** Inside a floating hull it is dry (no swimming, no drowning). */
    dryAt(x, y, z) {
        for (const s of this.awake) if (s.collider.hasXZ(x, z) && s.collider.dryAt(x, y, z)) return true;
        return false;
    }

    /** The room of the ship a world point is in: {ship, room} or null. */
    roomAt(x, y, z) {
        const s = this.shipAt(x, y, z);
        if (!s) return null;
        s.pose.toLocal(x, y, z, _l);
        const room = roomAt(s.layout, _l.x, _l.y, _l.z);
        return room ? { ship: s, room } : null;
    }

    floorLocal(s, lx, lz, reach) { return layoutFloorAt(s.layout, lx, lz, reach); }

    loyalTo(s, id) {
        if (!id) return false;
        if (s.owner && (s.owner === id || (id === 'local' && s.owner === this.game.localId))) return true;
        const owner = s.castleId ? this.game.castleLife?.state?.(s.castleId)?.owner : null;
        return !!owner && (owner === id || (id === 'local' && owner === this.game.localId));
    }

    // ====================================================================== sails
    /** A ray from the hand at the sails of awake ships (nearest hit), or null. */
    raySails(o, d, maxLen) {
        let best = null;
        for (const s of this.awake) {
            for (const sl of s.sails) {
                s.pose.toWorld(sl.center.x, sl.center.y, sl.center.z, _o);
                const cx = _o.x - o.x, cy = _o.y - o.y, cz = _o.z - o.z;
                const along = cx * d.x + cy * d.y + cz * d.z;
                if (along < 0 || along > maxLen) continue;
                const px = cx - d.x * along, py = cy - d.y * along, pz = cz - d.z * along;
                const off = Math.sqrt(px * px + py * py + pz * pz);
                const reach = Math.max(sl.w, sl.h) * 0.55 + 2;
                if (off > reach) continue;
                const score = off / reach + along / maxLen * 0.3;
                if (!best || score < best.score) best = { ship: s, sail: sl, score, point: new THREE.Vector3(_o.x, _o.y, _o.z), dist: along };
            }
        }
        return best;
    }

    /** «Анфёрл» / «Анфёрл Максима» / «Фёрл» said with the hand at the sails. */
    castSails(name, text, isFinal) {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        const side = g.wandSide?.() || (ch.isArmRaised(pref) ? pref : ['right', 'left'].find((sd) => ch.isArmRaised(sd))); // (a wand: its hand only)
        const say = (t) => { if (isFinal) g.hud.setVoice(t, true); return null; };
        if (!side) return say('⛵ Поднимите руку к парусам и скажите «Анфёрл»');
        const tired = g.combat.check(name);
        if (tired) { g.hud.setVoice(tired, true); return null; }
        const o = g.castOrigin(side, new THREE.Vector3());
        const d = (g.items?.heldOf('wand')?.side === side && g.wandMagic?.dir) ? g.wandMagic.dir(new THREE.Vector3()) : ch.getHandDirection(side, new THREE.Vector3());
        d.normalize();
        const hit = this.raySails(o, d, 110);
        if (!hit) return say('⛵ Покажите рукой (палочкой) на паруса корабля');
        const open = name === 'Furl' ? 0 : 1;
        const pick = name === 'UnfurlMaxima' ? hit.ship.sails : hit.ship.sails.filter((sl) => sl.mast === hit.sail.mast);
        const ids = pick.filter((sl) => sl.target !== open && sl.burnt < 1).map((sl) => sl.id);
        if (!ids.length) return say(open ? '⛵ Эти паруса уже раскрыты' : '⛵ Эти паруса уже свёрнуты');
        g.combat.pay(name);
        // a line of sparks from the hand to the sail
        for (let i = 0; i < 14; i++) g.fx?.spark(_v.copy(o).lerp(hit.point, i / 14), 0xe8f4ff, 0.1, _w.set(0, 0.4, 0), 0.6);
        g.sound?.playWhoosh?.();
        if (this.auth) this.setSails(hit.ship, ids, open, g.localId);
        else g.sync?.net.send({ t: 'sunf', id: hit.ship.id, s: ids, o: open });
        g.spellSucceeded?.(name);
        if (isFinal) g.hud.setVoice(open ? '⛵ Паруса разворачиваются… Теперь нужен ветер: «Вайнд» в паруса' : '⛵ Паруса сворачиваются', true);
        return name;
    }

    /**
     * (host; also the API for captains) Let sails down (open = 1) or roll them up (0).
     * ids: sail ids, or 'all'. by: who did it (the crew may not like it).
     */
    setSails(s, ids, open, by = null) {
        if (typeof s === 'string') s = this.list.get(s);
        if (!s) return 0;
        const list = ids === 'all' ? s.sails : s.sails.filter((sl) => ids.includes(sl.id));
        let n = 0;
        for (const sl of list) if (sl.burnt < 1 && sl.target !== open) { sl.target = open; n++; }
        if (!n) return 0;
        s.changed = true;
        if (by && !this.loyalTo(s, by)) this.crew.provoke(s, by, '🏴 Матросы видят, что вы трогаете их паруса! К бою!');
        this._event(s, { k: 'sails', s: list.map((sl) => sl.id), o: open });
        // the crew pulls the plank aboard when their own ship sets sail
        return n;
    }

    /** A Wind spell (every computer runs it): the sails it reaches fill; the host pushes the ship. */
    windGust(origin, dir, power, casterId) {
        const g = this.game;
        const mine = casterId === 'local' || casterId === g.localId;
        const hl = Math.hypot(dir.x, dir.z) || 1;
        for (const s of this.awake) {
            let hitA = 0, furled = false;
            for (const sl of s.sails) {
                s.pose.toWorld(sl.center.x, sl.center.y, sl.center.z, _o);
                const tx = _o.x - origin.x, ty = _o.y - origin.y, tz = _o.z - origin.z;
                const dist = Math.hypot(tx, ty, tz);
                if (dist > (power > 1 ? 90 : 55)) continue;
                const cos = (tx * dir.x + ty * dir.y + tz * dir.z) / (dist * Math.hypot(dir.x, dir.y, dir.z) || 1);
                // (aimed at the cloth: the cone widens for a big sail close by)
                const half = Math.max(0.55, Math.atan2(Math.max(sl.w, sl.h) * 0.5, dist));
                if (dist > 3 && Math.acos(Math.max(-1, Math.min(1, cos))) > half + 0.15) continue;
                if (sl.open < 0.5 || sl.burnt >= 1) { furled = true; continue; }
                hitA += sl.area * sl.open * (1 - sl.burnt);
                sl.gust = 1;
            }
            if (!hitA) {
                if (furled && mine) g.hud.setVoice('🌬️ Паруса свёрнуты — ветру не во что дуть. Скажите «Анфёрл»', true);
                continue;
            }
            // the wind keeps blowing into the sails while its caster has mana (−1 a second), until «стоп»
            const gain = (power > 1 ? WIND_MAXIMA : WIND_PLAIN) * Math.min(1, hitA / (0.5 * s.layout.sailArea));
            if (this.auth) {
                const by = mine ? g.localId : casterId;
                s.blow = { by, power, gain, dx: dir.x / hl, dz: dir.z / hl, at: performance.now() };
                s.st.tau = Infinity;
                s.changed = true;
                if (!this.loyalTo(s, by)) this.crew.provoke(s, by, '🏴 Вы дуете в паруса чужого корабля — матросы к бою!');
            }
            if (mine) {
                this.blowing = { id: s.id, power, dx: dir.x / hl, dz: dir.z / hl, netT: 0 };
                g.spellSucceeded?.(power > 1 ? 'WindMaxima' : 'Wind');
                g.hud.setVoice('🌬️ Ветер дует в паруса, пока есть мана (−1 в секунду). Корабль тяжёлый — разгоняется медленно. «Стоп» — перестать дуть', true);
            }
        }
        // (the wind on the crew: CreatureImpact blows them like any creature — Sailors.js shove)
    }

    /** My wind into a ship's sails: mana every second, the host told now and then; ends with the mana or «стоп». */
    _blowing(dt) {
        const g = this.game, b = this.blowing;
        if (!b) return;
        const s = this.list.get(b.id);
        if (!s || !s.awake || g.isDeadLocal || g.combat?.dead || s.state === 'sinking' || s.state === 'wreck') { this.stopWind(); return; }
        if (g.config.mode !== 'creative' && g.combat?.drain && g.combat.drain(BLOW_MANA * dt, dt) === false) {
            this.stopWind();
            g.hud.setVoice('🌬️ Мана кончилась — ветер в парусах стихает', true);
            return;
        }
        if (this.auth) { if (s.blow) s.blow.at = performance.now(); return; }
        if ((b.netT -= dt) <= 0) { b.netT = 1; g.sync?.net.send({ t: 'sblow', id: s.id, on: 1, p: b.power, d: [r3(b.dx), r3(b.dz)] }); }
    }

    /** «Стоп»: my wind into the sails stops (it dies down slowly). Returns true if it was blowing. */
    stopWind() {
        const b = this.blowing;
        if (!b) return false;
        this.blowing = null;
        const s = this.list.get(b.id);
        if (this.auth) { if (s) { s.blow = null; s.st.tau = 20; } } else this.game.sync?.net.send({ t: 'sblow', id: b.id, on: 0 });
        return true;
    }

    /** (host) A ship's sails under a blowing spell: the wind there rises to it and holds. */
    _applyBlow(s, dt) {
        const b = s.blow;
        if (!b) return;
        if (performance.now() - b.at > 3000) { s.blow = null; s.st.tau = 20; return; } // (the caster went quiet)
        const sw = s.st.spellWind;
        const k = Math.min(1, dt / 6); // (the wind in the sails builds up over several seconds)
        sw.x += (b.dx * b.gain - sw.x) * k;
        sw.z += (b.dz * b.gain - sw.z) * k;
        s.st.tau = Infinity;
    }

    /** (host) A natural breeze now and then; a storm blows hard. */
    _weather(dt) {
        const g = this.game;
        const storm = g.storm && g.storm.until > performance.now();
        const b = this._breeze;
        if (b) {
            b.t += dt;
            const ramp = Math.min(1, b.t / 20, Math.max(0, (b.dur - b.t) / 20));
            const sp = (storm ? 9 : b.speed) * ramp;
            this.wind.x = Math.cos(b.dir) * sp;
            this.wind.z = Math.sin(b.dir) * sp;
            if (b.t >= b.dur) { this._breeze = null; this.wind.x = this.wind.z = 0; }
            return;
        }
        this.wind.x = this.wind.z = 0;
        if ((this._weatherT -= dt) > 0) return;
        this._weatherT = 90;
        if (!this.awake.size) return;
        if (storm || Math.random() < 0.3) {
            this._breeze = { t: 0, dur: 120 + Math.random() * 180, speed: 3 + Math.random() * 3, dir: Math.random() * Math.PI * 2 };
            if (this.me) g.hud.setVoice('🌬️ Подул ветер', true);
        }
    }

    // ================================================================= damage
    damage(s, dmg, by) {
        if (!this.auth || !s || dmg <= 0 || s.state === 'wreck') return;
        s.hp = Math.max(0, s.hp - dmg);
        s.changed = true;
        if (by) {
            s.lastBy = by;
            if (!this.loyalTo(s, by)) this.crew.provoke(s, by, '🏴 Вы повредили корабль — матросы к бою!');
        }
    }

    /**
     * (host) A blast at the hull breaks it: where it hits the side — a hole there; on the deck — a hole in
     * the deck and the hull torn open below it, down towards the water (and deeper with every blast
     * at the same place), so the sea comes in and that end of the ship goes down first.
     */
    _breach(s, l, radius, half, by) {
        const L = s.layout;
        const lz = Math.max(-L.L / 2 + 1, Math.min(L.L / 2 - 1, l.z));
        const r = holeRadius(radius);
        const side = l.x >= 0 ? 1 : -1;
        // earlier blasts here weakened the wood: this one goes deeper
        const before = s.holes.filter((h) => Math.abs(h.lz - lz) < r + 2).length;
        const reach = radius * 1.3 + before * radius * 0.8;
        if (l.y < L.deck - 0.3 && Math.abs(l.x) > half - 1.5) {
            // the side: a hole where it hit, torn further down
            this.hole(s, l.x, l.y - radius * 0.3, lz, r, by);
            if (l.y - reach < 0.3 && l.y > 0.6) this.hole(s, l.x, Math.max(keelY(L, lz) + 0.4, l.y - reach), lz, r * 0.8, by);
            return;
        }
        // on (or over) a deck: the deck is broken through, and the hull below the blast down to `reach`
        const fy = layoutFloorAt(L, Math.max(-half + 0.5, Math.min(half - 0.5, l.x)), lz, l.y + 1) ?? L.deck;
        this.hole(s, Math.max(-half + 1, Math.min(half - 1, l.x)), fy, lz, r * 1.1, by, true);
        const bottom = fy - reach;
        if (bottom < L.deck - 0.5) this.hole(s, side, Math.max(keelY(L, lz) + 0.4, bottom), lz, r * (bottom < 0.3 ? 1 : 0.7), by);
    }

    /** (host) A hole in the hull at a ship-local point. */
    hole(s, lx, ly, lz, r, by = null, deck = false) {
        if (s.holes.length > 40) return null;
        const L = s.layout;
        const side = lx >= 0 ? 1 : -1;
        const hy = deck ? ly : Math.max(keelY(L, lz) + 0.3, Math.min(L.deck - 0.4, ly));
        const h = deck ? { lx, ly: hy, lz, r, wy: 0, deck: true } : { lx: side * hullHalfWidth(L, lz, hy), ly: hy, lz, r, wy: 0 };
        s.holes.push(h);
        if (s.model) h.mesh = s.model.addHole(h.lx, h.ly, h.lz, h.r, h.deck);
        s.changed = true;
        this._event(s, { k: 'hole', h: [r2(h.lx), r2(h.ly), r2(h.lz), r2(h.r), h.deck ? 1 : 0] });
        void by;
        return h;
    }

    /** (host) Fire on board at a ship-local point (a sail id: the sail burns). */
    ignite(s, lx, ly, lz, sail = null, by = null) {
        if (!s || s.state === 'wreck' || s.fires.length >= DMG.MAX_FIRES) return;
        if (sail && s.fires.some((f) => f.sail === sail)) return;
        if (!sail && s.fires.some((f) => !f.sail && Math.hypot(f.lx - lx, f.lz - lz) < 1.5)) return;
        const f = { lx, ly, lz, k: 0.3, age: 0, sail };
        s.fires.push(f);
        s.changed = true;
        if (by && !this.loyalTo(s, by)) this.crew.provoke(s, by, '🔥 Вы подожгли корабль — матросы к бою!');
        this._event(s, { k: 'fire', f: [r2(lx), r2(ly), r2(lz), sail || 0] });
        if (this._riderShip() === s) this.game.hud.setVoice('🔥 Палуба горит!', true);
    }

    /** Bombardo (and other blasts) near a ship (host). */
    blast(pos, radius, power, casterId) {
        if (!this.auth) return;
        const g = this.game;
        const by = casterId === 'local' ? g.localId : casterId;
        for (const s of this.awake) {
            if (s.state === 'wreck') continue;
            s.pose.toLocal(pos.x, pos.y, pos.z, _l);
            const L = s.layout;
            if (_l.z < -L.L / 2 - radius - 3 || _l.z > L.L / 2 + radius + 3) continue;
            // distance from the hull's surface
            const half = hullHalfWidth(L, Math.max(-L.L / 2, Math.min(L.L / 2, _l.z)), Math.max(-L.draft + 0.1, Math.min(L.deck, _l.y)));
            const top = L.railTopAt(_l.z);
            const dx = Math.max(0, Math.abs(_l.x) - half), dy = Math.max(0, _l.y - top, keelY(L, _l.z) - _l.y);
            const dz = Math.max(0, Math.abs(_l.z) - L.L / 2);
            const dHull = Math.hypot(dx, dy, dz);
            const dmg = blastDamage(dHull, radius, power);
            if (dmg <= 0) continue;
            this.damage(s, dmg, by);
            if (dHull < 2) this._breach(s, _l, radius, half, by);
            if (Math.random() < (power > 1 ? 1 : 0.6)) this.ignite(s, Math.max(-half + 0.5, Math.min(half - 0.5, _l.x)), layoutFloorAt(L, 0, _l.z, _l.y + 2) ?? L.deck, Math.max(-L.L / 2 + 2, Math.min(L.L / 2 - 2, _l.z)), null, by);
            // the blast tears burning sails
            for (const sl of s.sails) {
                const sd = Math.hypot(_l.x - sl.center.x, _l.y - sl.center.y, _l.z - sl.center.z);
                if (sd < radius + Math.max(sl.w, sl.h) * 0.5 && sl.open > 0.3) this.ignite(s, 0, 0, 0, sl.id, by);
            }
            // a thunderous hit splinters the wood
            const deb = [];
            for (let i = 0; i < 24; i++) deb.push({ x: pos.x + (Math.random() - 0.5) * 3, y: pos.y + Math.random() * 2, z: pos.z + (Math.random() - 0.5) * 3, color: i % 3 ? 0x8a5a33 : 0x4a3020 });
            g.fx?.debrisFrom(deb, pos, 40);
            g.spellSucceeded?.(power > 1 ? 'BombardoMaxima' : 'Bombardo');
        }
    }

    /** Inferno along a ray: a sail or the deck catches fire (every computer asks; the host lights it). */
    igniteAlong(o, d, len, casterId) {
        if (!this.auth || !this.awake.size) return false;
        const g = this.game;
        const by = casterId === 'local' || casterId == null ? g.localId : casterId;
        const hit = this.raySails(o, d, len);
        if (hit && hit.sail.open > 0.3 && hit.sail.burnt < 1) { this.ignite(hit.ship, 0, 0, 0, hit.sail.id, by); return true; }
        // the deck / hull
        for (let k = 1; k <= len; k += 0.75) {
            _v.copy(o).addScaledVector(d, k);
            const s = this.shipAt(_v.x, _v.y, _v.z);
            if (!s) continue;
            s.pose.toLocal(_v.x, _v.y, _v.z, _l);
            const f = layoutFloorAt(s.layout, _l.x, _l.z, _l.y + 1);
            if (f !== null && _l.y - f < 2.5) { this.ignite(s, _l.x, f, _l.z, null, by); return true; }
            if (s.collider.pointBlocked(_v.x, _v.y, _v.z)) { this.ignite(s, _l.x, Math.min(s.layout.deck, _l.y), _l.z, null, by); return true; }
        }
    }

    /** Lightning on a mast: fire at its top. */
    lightningAt(p, casterId) {
        if (!this.auth) return;
        for (const s of this.awake) {
            s.pose.toLocal(p.x, p.y, p.z, _l);
            for (const m of s.layout.masts) {
                if (Math.hypot(_l.x, _l.z - m.z) < 6 && _l.y > s.layout.deck) {
                    this.damage(s, 25, casterId);
                    const sl = s.sails.find((x) => x.mast === m.id && x.open > 0.3);
                    if (sl) this.ignite(s, 0, 0, 0, sl.id, casterId); else this.ignite(s, 0, s.layout.deck, m.z + 1.5, null, casterId);
                    return;
                }
            }
        }
    }

    /**
     * (host) «Wave Attack» runs into a ship (its front at x, z, running along dx, dz): the ship
     * is rocked (it heels and heaves) and pushed along — a heavy ship less. Once per wave (`seen`).
     */
    waveHit(x, z, dx, dz, width, height, power, seen) {
        if (!this.auth) return false;
        let any = false;
        for (const s of this.awake) {
            if (s.state === 'wreck' || seen?.has(s)) continue;
            const st = s.st, L = s.cls.L || 20, B = s.cls.B || 6;
            const rx = st.x - x, rz = st.z - z;
            const along = rx * dx + rz * dz, across = Math.abs(-rx * dz + rz * dx);
            if (Math.abs(along) > B / 2 + 2 || across > width / 2 + L / 2) continue;
            seen?.add(s);
            const k = power * Math.min(1, height / 2.4) * Math.min(1.5, 20 / L);
            const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), sx = Math.cos(st.yaw), sz = -Math.sin(st.yaw);
            st.u += (dx * fx + dz * fz) * 2.5 * k;
            st.v += (dx * sx + dz * sz) * 2.5 * k;
            const side = dx * sx + dz * sz; // (hit from the side: it heels over; from the bow: it pitches)
            st.roll = (st.roll || 0) - side * 0.22 * k;
            st.pitch = (st.pitch || 0) + (dx * fx + dz * fz) * 0.1 * k;
            st.heave = (st.heave || 0) + 0.4 * height * 0.5;
            s.changed = true;
            any = true;
        }
        return any;
    }

    /** Rain / a wave / a water ball put fires out (within r of a world point, or the whole ship). */
    douse(p, r) {
        if (!this.auth) return 0;
        let n = 0;
        for (const s of this.awake) {
            if (!s.fires.length) continue;
            const before = s.fires.length;
            s.fires = s.fires.filter((f) => {
                s.pose.toWorld(f.lx, f.ly, f.lz, _o);
                return Math.hypot(_o.x - p.x, _o.y - p.y, _o.z - p.z) > r;
            });
            if (s.fires.length !== before) { n += before - s.fires.length; s.changed = true; this._event(s, { k: 'fireout', f: s.fires.map((f) => [r2(f.lx), r2(f.ly), r2(f.lz), f.sail || 0]) }); }
        }
        return n; // (how many fires went out)
    }

    /** (host) Fire, leaks, sinking. */
    _damageStep(s, dt) {
        const g = this.game;
        const L = s.layout;
        // fire
        if (s.fires.length) {
            const wet = !!(g.gear?.raining || g.storm?.raining);
            const before = s.sails.map((x) => x.burnt);
            const res = stepFire(s, dt, Math.random, wet);
            if (res.hull > 0) { s.hp = Math.max(0, s.hp - res.hull); s.changed = true; }
            s.sails.forEach((x, i) => { if (x.burnt >= 1 && before[i] < 1) { x.target = 0; this._event(s, { k: 'burnt', s: x.id }); } });
            if ((s._fireNetT = (s._fireNetT || 0) - dt) <= 0) { s._fireNetT = 1; this._event(s, { k: 'fires', f: s.fires.map((f) => [r2(f.lx), r2(f.ly), r2(f.lz), f.sail || 0, r2(f.k)]), b: s.sails.map((x) => r2(x.burnt)) }); }
            // standing in the fire hurts
            if (this.me?.ship === s) {
                const l = this.me.l;
                for (const f of s.fires) {
                    if (f.sail) continue;
                    if (Math.hypot(l.x - f.lx, l.z - f.lz) < 1.6 * Math.max(0.5, f.k) && Math.abs(l.y - (f.ly + PLAYER_GROUND_OFFSET)) < 3) {
                        s._burnT = (s._burnT || 0) + dt;
                        if (s._burnT > 1) { s._burnT = 0; if (g.combat?.enabled) g.combat.damage(1, null, 'Fire'); else g.damageLocalPlayer(1); }
                        break;
                    }
                }
            }
        }
        // leaks: holes under the water line (as the ship lists and settles)
        if (s.holes.length || s.hp <= 0) {
            const water = WATER_LEVEL_Y;
            for (const h of s.holes) { s.pose.toWorld(h.lx, h.ly, h.lz, _o); h.wy = _o.y; }
            const rate = leakRate(s.holes, water, s.cls.floodVol) + (s.hp <= 0 ? 0.03 : 0);
            if (rate > 0 && s.state !== 'sinking' && s.state !== 'wreck') {
                s.flood = Math.min(1, s.flood + rate * dt);
                s.changed = true;
                // the ship settles as it fills, and leans down towards the holes (that end goes under first)
                s.sinkY = s.flood * L.draft * 0.25;
                this._leanSides(s);
                s.sinkRoll = s.listSide * DMG.LIST_MAX * s.flood * 0.5;
                s.sinkPitch = s.pitchSide * DMG.PITCH_MAX * s.flood * 0.5;
                if (s.flood >= 1) this._startSinking(s);
            }
        }
        if (s.state === 'sinking') {
            const seabed = this._seabedUnder(s);
            const st = { sinkT: s.sinkT || 0, sinkY: s.sinkY, listSide: s.listSide, pitchSide: s.pitchSide, sinkRoll: s.sinkRoll, sinkPitch: s.sinkPitch, flooded: s.flooded, wreck: false };
            stepSinking(st, s.cls, dt, seabed, WATER_LEVEL_Y);
            s.sinkT = st.sinkT; s.sinkY = st.sinkY; s.sinkRoll = st.sinkRoll; s.sinkPitch = st.sinkPitch;
            if (st.flooded && !s.flooded) { s.flooded = true; s.fires = []; this._event(s, { k: 'flooded' }); }
            if (st.wreck) { s.state = 'wreck'; s.st.u = s.st.v = s.st.r = 0; this._event(s, { k: 'wreck', y: r2(s.sinkY) }); }
            s.changed = true;
        }
    }

    /** Which way the flooding ship leans: towards the side and the end its holes are in (roll > 0: starboard up). */
    _leanSides(s) {
        let x = 0, z = 0;
        for (const h of s.holes) { if (h.deck) continue; const w = h.r * h.r; x += h.lx * w; z += h.lz * w; }
        s.listSide = x > 0 ? -1 : 1;
        s.pitchSide = z > 0 ? 1 : -1;
    }

    _startSinking(s) {
        if (s.state === 'sinking' || s.state === 'wreck') return;
        s.state = 'sinking';
        this._leanSides(s);
        s.sinkT = Math.max(s.sinkT || 0, 12.5); // (already half-way leaning from the flooding)
        s.lines.forEach((l) => { if (l.state === 'tied') l.state = 'snapped'; });
        if (s.plank?.state === 'laid') this._plankFalls(s);
        this._event(s, { k: 'sink', side: s.listSide });
        this._sinkNote(s);
    }

    _sinkNote(s) {
        const g = this.game;
        const me = g.character.group.position;
        if (Math.hypot(me.x - s.st.x, me.z - s.st.z) < 150) g.hud.setVoice(`🌊 «${s.name}» тонет!`, true);
    }

    /** The lowest ground under the hull (for a wreck to rest on). */
    _seabedUnder(s) {
        const data = this.game.terrain?.data;
        if (!data) return WATER_LEVEL_Y - 12;
        let y = -Infinity;
        for (const lz of [-s.cls.L * 0.35, 0, s.cls.L * 0.35]) {
            s.pose.toWorld(0, 0, lz, _o);
            y = Math.max(y, data.surfaceY(_o.x, _o.z));
        }
        return y;
    }

    /** Flames and smoke (every computer, from the fires it knows). */
    _fireFx(s, dt) {
        const fx = this.game.fx;
        if (!fx || !s.fires.length || s.model?.detail < 1) return;
        for (const f of s.fires) {
            let lx = f.lx, ly = f.ly, lz = f.lz;
            if (f.sail) {
                const sl = s.sails.find((x) => x.id === f.sail);
                if (!sl) continue;
                lx = sl.center.x; ly = sl.yardY - sl.h * sl.open * (1 - sl.burnt); lz = sl.center.z;
            }
            const n = Math.random() < dt * 30 * Math.max(0.3, f.k) ? 1 + (Math.random() < f.k ? 1 : 0) : 0;
            for (let i = 0; i < n; i++) {
                s.pose.toWorld(lx + (Math.random() - 0.5) * 1.6 * f.k, ly + 0.2, lz + (Math.random() - 0.5) * 1.6 * f.k, _o);
                _v.set(_o.x, _o.y, _o.z);
                fx.spark(_v, Math.random() < 0.5 ? 0xff7a1a : 0xffc040, 0.35 + f.k * 0.4, _w.set((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6), 0.7);
                if (Math.random() < 0.3) fx.spark(_v, 0x3a3a3a, 0.8, _w.set(0, 3 + Math.random() * 2, 0), 2.2);
            }
        }
    }

    /** How high the water stands inside the hull (ship-local y), or null: dry. */
    holdWaterY(s) {
        if (s.state === 'wreck' || s.flooded) return null;
        const L = s.layout;
        const f = s.state === 'sinking' ? 1 : s.flood || 0;
        if (f < 0.01) return null;
        return -L.draft + 0.3 + f * (L.draft + L.deck - 0.9);
    }

    /**
     * Holes at the water line: the sea pours in through them (a jet of water into the dark of the hull,
     * foam swirling round the hole outside); deeper ones draw a whirl on the surface above them; and
     * the water of the hold rises in the holes and under the broken deck (every computer draws it).
     */
    _leakFx(s, dt, t, cam) {
        if (!s.holes.length) return;
        s.model.updateHoles(this.holdWaterY(s), t);
        const fx = this.game.fx;
        if (!fx?.spark || s.model.detail < 2 || s.state === 'wreck' || s.flooded) return;
        const W = WATER_LEVEL_Y;
        const near = Math.hypot(cam.x - s.pose.x, cam.z - s.pose.z) < 90;
        let loud = 0;
        for (const h of s.holes) {
            if (h.deck) continue;
            s.pose.toWorld(h.lx, h.ly, h.lz, _o);
            const wy = _o.y;
            if (wy > W + 0.3 + h.r * 0.6) continue; // (above the water: dry)
            const side = h.lx >= 0 ? 1 : -1;
            s.pose.dirToWorld(side, 0, _l);
            const ox = _l.x, oz = _l.z; // (outwards)
            s.pose.dirToWorld(0, 1, _l);
            const tx = _l.x, tz = _l.z; // (along the ship)
            const rate = (near ? 60 : 20) * Math.min(2, h.r);
            const n = Math.floor(rate * dt + Math.random());
            if (wy > W - 2.2) {
                // the sea pours in over the lower edge of the hole: a thick jet into the hull
                loud = Math.max(loud, h.r);
                for (let i = 0; i < n; i++) {
                    const u = (Math.random() - 0.5) * h.r * 1.4;
                    const y = Math.min(W + 0.05, wy + h.r * 0.4) - Math.random() * 0.5;
                    _v.set(_o.x + tx * u + ox * 0.15, y, _o.z + tz * u + oz * 0.15);
                    fx.spark(_v, Math.random() < 0.6 ? 0xcfe9f5 : 0x6fa9c0, 0.18 + Math.random() * 0.2, _w.set(-ox * (2.5 + Math.random() * 2.5) + tx * u * 0.6, -0.8 - Math.random() * 1.5, -oz * (2.5 + Math.random() * 2.5) + tz * u * 0.6), 0.45 + Math.random() * 0.25);
                }
            }
            // foam on the surface outside, drawn round towards the hole
            for (let i = 0; i < Math.ceil(n / 3); i++) {
                const a = Math.random() * Math.PI * 2, rr = h.r * (0.6 + Math.random() * 1.2);
                const px = _o.x + ox * (0.4 + Math.abs(Math.cos(a)) * rr) + tx * Math.sin(a) * rr, pz = _o.z + oz * (0.4 + Math.abs(Math.cos(a)) * rr) + tz * Math.sin(a) * rr;
                _v.set(px, W + 0.06, pz);
                fx.spark(_v, 0xf4fbff, 0.14 + Math.random() * 0.12, _w.set((_o.x - px) * 1.2 + tx * Math.cos(a) * 1.5, 0.15, (_o.z - pz) * 1.2 + tz * Math.cos(a) * 1.5), 0.7);
            }
        }
        // the gurgle of the water coming in (now and then, close by)
        if (loud && near && (s._gurgleT = (s._gurgleT || 0) - dt) <= 0) { s._gurgleT = 1.6 + Math.random() * 1.6; this.game.sound?.playSplash?.(); }
    }

    _plankFallFx(s, dt) {
        const f = s.plank.fall;
        const t = (performance.now() - f.t0) / 1000;
        f.m.position.y = Math.max(WATER_LEVEL_Y - 0.1, f.y0 - 4.9 * t * t);
        f.m.rotation.z += dt * 0.5;
        if (t > 10) { this.game.scene.remove(f.m); f.m.geometry.dispose(); s.plank.mesh = null; s.plank.fall = null; s.plank.state = 'gone'; }
    }

    // =================================================================== hooks
    /** Cannon / port: a cannonball hits a ship at a world point (host). */
    cannonHit(s, p, dir, by) {
        s.pose.toLocal(p.x, p.y, p.z, _l);
        const L = s.layout;
        this.damage(s, DMG.BALL_DMG, by);
        const half = hullHalfWidth(L, _l.z, Math.max(-L.draft + 0.1, Math.min(L.deck, _l.y)));
        if (_l.y < L.deck + 0.3 && Math.abs(_l.x) > half - 1.2) this.hole(s, _l.x, _l.y, Math.max(-L.L / 2 + 1, Math.min(L.L / 2 - 1, _l.z)), DMG.BALL_HOLE, by);
        if (Math.random() < 0.15) this.ignite(s, Math.max(-half + 0.5, Math.min(half - 0.5, _l.x)), L.deck, _l.z, null, by);
        const deb = [];
        for (let i = 0; i < 14; i++) deb.push({ x: p.x + (Math.random() - 0.5) * 1.5, y: p.y + Math.random(), z: p.z + (Math.random() - 0.5) * 1.5, color: 0x8a5a33 });
        this.game.fx?.debrisFrom(deb, p, 20);
        void dir;
    }

    /** «Fire» said with the hand at a cannon (its fuse) or at a deck (the deck burns). undefined: not mine. */
    fireSpell(side, spot, isFinal) {
        const g = this.game;
        const lit = this.cannons.tryLight(side, isFinal);
        if (lit !== undefined) return lit;
        if (spot) {
            const s = this.shipAt(spot.x, spot.y, spot.z);
            if (s) {
                g.combat.pay('Fire');
                s.pose.toLocal(spot.x, spot.y, spot.z, _l);
                if (this.auth) this.ignite(s, _l.x, _l.y, _l.z, null, g.localId);
                else g.sync?.net.send({ t: 'sfire', id: s.id, l: [r2(_l.x), r2(_l.y), r2(_l.z)] });
                if (isFinal) g.hud.setVoice('🔥 Палуба загорелась!', true);
                return 'Fire';
            }
        }
        return undefined;
    }

    /** Somebody died on a ship: let go of the wheel. */
    onLocalDeath() {
        this.helm.releaseAll();
        this.rigging.letGo();
        this.stopWind();
        this.riders.delete('me');
        this.me = null;
    }

    // ===================================================================== network
    _event(s, e) {
        const g = this.game;
        if (!g.sync || !this.auth) return;
        g.sync.net.send({ t: 'shipev', id: s.id, ...e });
    }

    _net(dt) {
        const g = this.game;
        if (!this.auth) return;
        this._netT += dt;
        if (this._netT < (g.sync.net.relayed ? 0.16 : 0.1)) return;
        this._netT = 0;
        const l = [];
        for (const s of this.awake) l.push(packShip(s));
        if (l.length) g.sync.net.send({ t: 'ships', l, w: [r2(this.wind.x), r2(this.wind.z)] });
        this.crew.netSend?.();
    }

    /** Messages about ships (NetSync passes them here). */
    onNet(m, isHost) {
        const g = this.game;
        switch (m.t) {
            case 'ships': {
                if (isHost) return;
                if (Array.isArray(m.w)) { this.wind.x = +m.w[0] || 0; this.wind.z = +m.w[1] || 0; }
                for (const a of m.l || []) {
                    const n = unpackShip(a);
                    const s = this.list.get(n.id);
                    if (!s) continue;
                    if (!s.net) { s.st.x = n.x; s.st.z = n.z; s.st.yaw = n.yaw; }
                    s.net = { ...n, age: 0 };
                    s.hp = n.hp; s.flood = n.flood; s.flooded = n.flooded;
                    if (s.state !== n.state) s.state = n.state;
                    if (n.plank === 'fallen' && s.plank?.state === 'laid') this._plankFalls(s, false);
                    if (!s.awake) { s.st.x = n.x; s.st.z = n.z; s.st.yaw = n.yaw; }
                }
                return;
            }
            case 'shipev': if (!isHost) this._applyEvent(m); return;
            case 'screw': if (m.talk) { if (isHost) this.crew.remoteTalk(m); } else if (!isHost) this.crew.applyNet(m); return;
            case 'shelm': if (isHost) this.helm.applyRemote(m); return;
            case 'smoor': if (isHost) this.rigging.applyRemote(m); return;
            case 'sblow': {
                if (!isHost) return;
                const s = this.list.get(m.id);
                if (!s) return;
                if (!m.on) { if (s.blow?.by === m.from) { s.blow = null; s.st.tau = 20; } return; }
                if (s.blow?.by === m.from) { s.blow.at = performance.now(); if (Array.isArray(m.d)) { s.blow.dx = +m.d[0] || 0; s.blow.dz = +m.d[1] || 0; } }
                return;
            }
            case 'sunf': {
                if (!isHost) return;
                const s = this.list.get(m.id);
                if (s && Array.isArray(m.s) && this._near(s, m.from, 140)) this.setSails(s, m.s.map(String), m.o ? 1 : 0, m.from);
                return;
            }
            case 'shit': if (isHost) this.crew.remoteHit(m); return;
            case 'sfire': {
                const s = this.list.get(m.id);
                if (isHost && s && Array.isArray(m.l) && this._near(s, m.from, 80)) this.ignite(s, +m.l[0], +m.l[1], +m.l[2], null, m.from);
                return;
            }
            case 'scan': this.cannons.onNet(m, isHost); return;
            default: return;
        }
    }

    _near(s, id, d) {
        const r = this.game.remotes.get(id);
        if (!r) return true;
        return Math.hypot(r.position.x - s.st.x, r.position.z - s.st.z) < d + s.cls.L / 2;
    }

    _applyEvent(m) {
        const s = this.list.get(m.id);
        if (!s) {
            // (not made here yet: remember for when it is)
            return;
        }
        switch (m.k) {
            case 'sails': for (const sl of s.sails) if (m.s.includes(sl.id)) sl.target = m.o ? 1 : 0; break;
            case 'hole': {
                const [lx, ly, lz, r, dk] = m.h;
                const h = { lx, ly, lz, r, wy: 0, deck: !!dk };
                s.holes.push(h);
                if (s.model) h.mesh = s.model.addHole(lx, ly, lz, r, h.deck);
                break;
            }
            case 'fire': s.fires.push({ lx: m.f[0], ly: m.f[1], lz: m.f[2], sail: m.f[3] || null, k: 0.3, age: 0 }); break;
            case 'fires': case 'fireout':
                s.fires = (m.f || []).map((f) => ({ lx: f[0], ly: f[1], lz: f[2], sail: f[3] || null, k: f[4] ?? 0.6, age: 0 }));
                if (Array.isArray(m.b)) s.sails.forEach((x, i) => { x.burnt = m.b[i] ?? x.burnt; });
                break;
            case 'burnt': { const sl = s.sails.find((x) => x.id === m.s); if (sl) { sl.burnt = 1; sl.target = 0; } break; }
            case 'line': if (s.lines[m.i]) s.lines[m.i].state = m.s; break;
            case 'plank': if (m.s === 'fallen') this._plankFalls(s, false); break;
            case 'owner': s.owner = m.o; s.ownerName = m.n || null; s.hostile.clear(); if (m.o === this.game.localId) this.game.hud.setVoice(`⚓ Корабль «${s.name}» ваш!`, true); break;
            case 'hostile': if (m.p) s.hostile.set(m.p, performance.now() + 180000); break;
            case 'sink': s.state = 'sinking'; s.listSide = m.side || 1; this._sinkNote(s); break;
            case 'flooded': s.flooded = true; s.fires = []; break;
            case 'wreck': s.state = 'wreck'; break;
            case 'gun': this.cannons.applyEvent(s, m); break;
            default: break;
        }
    }

    /** My place on a ship for the 'p' message: [shipId, lx, ly, lz] or undefined. */
    myNet() {
        const r = this.me;
        if (!r) return undefined;
        return [r.ship.id, r2(r.l.x), r2(r.l.y), r2(r.l.z)];
    }

    /** A remote avatar's world position from its place on a ship (or false). */
    remoteOnShip(sh, out) {
        if (!Array.isArray(sh)) return false;
        const s = this.list.get(sh[0]);
        if (!s || !s.awake) return false;
        s.pose.toWorld(+sh[1], +sh[2], +sh[3], _o);
        out.x = _o.x; out.y = _o.y; out.z = _o.z;
        return true;
    }

    // ===================================================================== saving
    /** Ships changed from how they were made (and, for a late joiner, every awake ship). */
    snapshot(all = false) {
        const out = [];
        for (const s of this.list.values()) {
            if (!s.changed && !all) continue;
            out.push(this._shipSave(s));
        }
        for (const [id, sv] of this.saved) if (!this.list.has(id)) out.push(sv);
        return out;
    }

    _shipSave(s) {
        const st = s.st;
        return {
            id: s.id, cls: s.cls.id, x: r2(st.x), z: r2(st.z), yaw: r3(st.yaw), u: r2(st.u), wheel: r2(st.wheel),
            hp: Math.round(s.hp), flood: r3(s.flood), holes: s.holes.map((h) => [r2(h.lx), r2(h.ly), r2(h.lz), r2(h.r), h.deck ? 1 : 0]),
            burnt: s.sails.filter((x) => x.burnt >= 1).map((x) => x.id), open: s.sails.filter((x) => x.target > 0).map((x) => x.id),
            owner: s.owner, ownerName: s.ownerName, crewKilled: [...s.crewKilled], lines: s.lines.map((l) => l.state),
            plank: s.plank?.state || null, state: s.state, sink: s.state === 'sinking' || s.state === 'wreck' ? { y: r2(s.sinkY), roll: r3(s.sinkRoll), pitch: r3(s.sinkPitch), t: r2(s.sinkT || 0), side: s.listSide || 1 } : null,
            fires: s.fires.filter((f) => !f.sail).slice(0, 12).map((f) => [r2(f.lx), r2(f.ly), r2(f.lz), r2(f.k)]),
            guns: [...s.guns].filter(([, gn]) => gn.loaded).map(([k]) => k), racks: [...s.racks].filter(([k, n]) => n !== s.layout.racks.find((r) => r.id === k)?.balls).map(([k, n]) => [k, n]),
            spawn: s.berth ? null : { cls: s.cls.id },
        };
    }

    restore(list) {
        if (!Array.isArray(list)) return;
        for (const sv of list) {
            if (!sv || !sv.id) continue;
            const s = this.list.get(sv.id);
            if (s) this._applySaved(s, sv);
            else if (!String(sv.id).includes(':ship') && SHIP_CLASSES[sv.cls]) { this.saved.set(sv.id, sv); this.spawn(sv.cls, sv.x, sv.z, sv.yaw, { id: sv.id, wake: false }); }
            else this.saved.set(sv.id, sv);
        }
    }

    _applySaved(s, sv) {
        const st = s.st;
        st.x = sv.x ?? st.x; st.z = sv.z ?? st.z; st.yaw = sv.yaw ?? st.yaw; st.u = sv.u || 0; st.wheel = sv.wheel || 0;
        s.hp = sv.hp ?? s.hp; s.flood = sv.flood || 0;
        for (const h of s.holes) if (h.mesh) h.mesh.parent?.remove(h.mesh);
        s.holes = (sv.holes || []).map(([lx, ly, lz, r, dk]) => ({ lx, ly, lz, r, wy: 0, deck: !!dk }));
        if (s.model) for (const h of s.holes) h.mesh = s.model.addHole(h.lx, h.ly, h.lz, h.r, h.deck);
        for (const x of s.sails) {
            x.burnt = (sv.burnt || []).includes(x.id) ? 1 : 0;
            x.target = x.open = (sv.open || []).includes(x.id) && x.burnt < 1 ? 1 : 0;
        }
        s.owner = sv.owner || null; s.ownerName = sv.ownerName || null;
        s.crewKilled = new Set(sv.crewKilled || []);
        if (Array.isArray(sv.lines)) sv.lines.forEach((v, i) => { if (s.lines[i]) s.lines[i].state = v; });
        if (sv.plank && sv.plank !== 'laid') s.plank = { state: sv.plank === 'fallen' ? 'gone' : sv.plank, collider: new PlankCollider(), mesh: null, side: s.berth?.side || 1 };
        s.state = sv.state || s.state;
        if (sv.sink) { s.sinkY = sv.sink.y; s.sinkRoll = sv.sink.roll; s.sinkPitch = sv.sink.pitch; s.sinkT = sv.sink.t || 0; s.listSide = sv.sink.side || 1; s.flooded = s.state === 'wreck' || s.sinkY > s.cls.deck; }
        s.fires = (sv.fires || []).map(([lx, ly, lz, k]) => ({ lx, ly, lz, k, age: 0 }));
        for (const k of sv.guns || []) { const gn = s.guns.get(k); if (gn) gn.loaded = true; }
        for (const [k, n] of sv.racks || []) if (s.racks.has(k)) s.racks.set(k, n);
        s.changed = true;
        this._place(s);
    }

    /** My place on a ship for the player's save. */
    playerSnap() {
        const r = this.me;
        return r ? [r.ship.id, r2(r.l.x), r2(r.l.y), r2(r.l.z)] : null;
    }

    /** Back on the ship's deck after loading (the ship is made and woken first). */
    applyPlayerSnap(a) {
        if (!Array.isArray(a)) return false;
        let s = this.list.get(a[0]);
        if (!s) {
            this._scan();
            s = this.list.get(a[0]);
        }
        if (!s) return false;
        this.wake(s);
        s.pose.toWorld(+a[1], +a[2], +a[3], _o);
        const p = this.game.character.group.position;
        p.set(_o.x, _o.y, _o.z);
        this.game.collision?.movers && s.collider.forget(p);
        return true;
    }

    // =================================================================== tests
    /** (tests) Untie a ship: lines off, plank away. */
    debugRelease(s) {
        if (typeof s === 'string') s = this.list.get(s);
        if (!s) return;
        for (const l of s.lines) l.state = 'free';
        if (s.plank?.state === 'laid') { s.plank.state = 'aboard'; this.game.collision.removeMover(s.plank.collider); if (s.plank.mesh) { this.game.scene.remove(s.plank.mesh); s.plank.mesh = null; } }
        if (s.state === 'moored') s.state = 'free';
    }

    dispose() {
        for (const s of [...this.awake]) this.sleep(s);
        this.list.clear();
        this.cannons.dispose?.();
        this.rigging.dispose();
    }
}

const _q = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

export { strHash, createRng, PORT_SHIPS };
