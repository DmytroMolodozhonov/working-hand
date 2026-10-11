/**
 * Sailors.js — the crews of the ships.
 *
 * Every ship has its captain (near the wheel on the quarterdeck), a boatswain
 * and sailors (at the masts, the capstan, the bow, below in the hammocks).
 * They are creatures like any other: they can be hit, cut, blown, lifted, killed.
 * They live in their ship's own coordinates, so a moving ship never leaves them
 * behind. Take their wheel, touch their sails, open their chests, damage their
 * ship or hurt one of them — and they fight (cutlasses). Kill the whole crew and
 * the ship is yours: its wheel obeys you, its chests open.
 * A Wind spell can throw a sailor near the rail overboard: he swims back to the
 * ship and climbs aboard, or drowns if the ship has sailed away.
 *
 * Multiplayer: the host runs the crews ('screw'); guests draw them and send hits.
 */

import * as THREE from 'three';
import { VillagerModel, villagerLook, VILLAGER_FOOT_OFFSET } from '../entities/VillagerModel.js';
import { floorAt, hullHalfWidth } from './ShipLayout.js';
import { strHash } from './ShipTypes.js';
import { createRng } from '../core/math.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';

export const SAILOR_STATS = {
    captain: { hp: 20, armor: 30, dmg: 3 },
    boatswain: { hp: 14, armor: 10, dmg: 3 },
    sailor: { hp: 10, armor: 0, dmg: 2 },
};
const TITLES = { captain: 'Капитан', boatswain: 'Боцман', sailor: 'Матрос' };
const NAMES = ['Яков', 'Гаврила', 'Фома', 'Тимофей', 'Матвей', 'Савелий', 'Никита', 'Еремей', 'Захар', 'Остап', 'Мирон', 'Лука', 'Демьян', 'Аким', 'Гордей', 'Игнат', 'Кузьма', 'Прохор', 'Тарас', 'Ефим'];
const SHOUT = {
    fight: ['На абордаж!', 'Полундра!', 'Свистать всех наверх!', 'Руби его!', 'Чужак на палубе!', 'К оружию, братва!'],
    hurt: ['Ай!', 'Тысяча чертей!', 'Разрази меня гром!'],
    gang: ['Не подходи к трапу!', 'Прочь от нашего корабля!', 'Сунешься — пожалеешь!'],
};
const WALK = 2.2, RUN = 5.2;
const HOSTILE_MS = 180000;
const MODE_CODE = ['idle', 'walk', 'run', 'attack', 'dead', 'work', 'swim'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _l = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };

/** The crew of a ship by its class (the same every time). */
export function crewRoster(ship) {
    const C = ship.cls.crew;
    const out = [];
    const rng = createRng(strHash(String(ship.id)) ^ 0x5a17);
    const add = (role) => {
        const idx = out.length;
        const name = role === 'captain' ? 'Капитан ' + pick2(rng, ['Дрейк', 'Морган', 'Флинт', 'Сильвер', 'Беринг', 'Крузенштерн', 'Головнин', 'Лисянский']) : pick2(rng, NAMES);
        out.push({ idx, role, name, seed: (rng() * 1e9) | 0 });
    };
    for (let i = 0; i < (C.captain || 0); i++) add('captain');
    for (let i = 0; i < (C.boatswain || 0); i++) add('boatswain');
    for (let i = 0; i < (C.sailor || 0); i++) add('sailor');
    return out;
}
const pick2 = (rng, a) => a[Math.floor(rng() * a.length) % a.length];

function sailorLook(e, color) {
    const L = villagerLook(e.seed, e.role === 'captain' ? 'merchant' : 'builder', false, { castleColor: color });
    if (e.role === 'captain') {
        L.shirt = 0xf2ecd8; L.accent = color; L.pants = 0x2c2c3a; L.hat = 'beret'; L.hatColor = 0x1c1c22; L.tool = 'sword'; L.boots = 0x1a1a1a;
        if (L.beard === 'none') L.beard = 'full';
    } else {
        const striped = (e.seed >>> 3) % 2 === 0;
        L.shirt = striped ? 0xe8ecf4 : (e.role === 'boatswain' ? 0x3a4a6a : 0xb8a888);
        L.accent = striped ? 0x2a3f7a : 0x6b4a2a;
        L.pants = (e.seed >>> 5) % 2 ? 0x3a3a48 : 0x6b5a3a;
        L.hat = 'scarf'; L.hatColor = [0xc0392b, 0x2e4a8a, 0x1e1e1e, 0xd4a017][(e.seed >>> 7) % 4];
        L.sleeves = 'rolled';
        L.tool = 'sword'; // the cutlass
        L.boots = 0x3a2a1a;
    }
    return L;
}

export class Sailors {
    constructor(game, ships) {
        this.game = game;
        this.ships = ships;
        this.byId = new Map(); // sailor id → sailor
        this.crews = new Map(); // ship id → [sailor]
        this._netT = 0;
    }

    get auth() { return this.game.authority; }

    // ---------------------------------------------------------- crews
    wake(s) {
        if (this.crews.has(s.id)) return;
        const list = [];
        const L = s.layout;
        const tags = (t) => L.nodes.filter((n) => n.tag === t || (n.tag && n.tag.startsWith(t + ':')));
        for (const e of crewRoster(s)) {
            if (s.crewKilled.has(e.idx)) continue;
            const S = SAILOR_STATS[e.role];
            const model = new VillagerModel(sailorLook(e, s.color), { castleColor: s.color });
            this.game.scene.add(model.group);
            // a station: the captain by the wheel; the others round the ship
            let home;
            if (e.role === 'captain') home = tags('captain')[0];
            else if (e.role === 'boatswain') home = tags('capstan')[0];
            else {
                const st = [...tags('rig'), ...tags('bow'), ...tags('gangway'), ...tags('hammock'), ...tags('store')];
                home = st[(e.idx - 1) % Math.max(1, st.length)];
            }
            home = home || L.nodes[0];
            const v = {
                id: s.id + ':c' + e.idx, ship: s, idx: e.idx, role: e.role, name: e.name, title: TITLES[e.role],
                model, group: model.group, isSailor: true, removable: false,
                hp: S.hp, maxHp: S.hp, armor: S.armor, maxArmor: S.armor, dmg: S.dmg,
                dead: false, get isDead() { return this.dead; }, damageCooldown: 0,
                l: { x: home.x, y: home.y, z: home.z }, lyaw: Math.PI, home: home.id, node: home.id, path: null, pathI: 0,
                mode: 'idle', speed: 0, waitT: 2 + Math.random() * 6, foe: null, strikeT: 0, sayT: 0, vy: 0,
                overboard: null, x: 0, y: 0, z: 0, net: null, deadT: 0,
            };
            list.push(v);
            this.byId.set(v.id, v);
        }
        this.crews.set(s.id, list);
        this._place(s);
    }

    sleep(s) {
        const list = this.crews.get(s.id);
        if (!list) return;
        for (const v of list) { v.model.dispose(); this.byId.delete(v.id); v.removable = true; }
        this.crews.delete(s.id);
    }

    alive(s) {
        const list = this.crews.get(s.id);
        if (!list) {
            // a sleeping ship: by the roster minus the killed
            return crewRoster(s).filter((e) => !s.crewKilled.has(e.idx)).length;
        }
        return list.filter((v) => !v.dead).length;
    }

    captainAlive(s) {
        const list = this.crews.get(s.id);
        if (list) return list.some((v) => v.role === 'captain' && !v.dead);
        return !s.crewKilled.has(0);
    }

    /** Living sailors near the local player (targets for fists, weapons, spells). */
    targets() {
        const out = [];
        const me = this.game.character.group.position;
        for (const v of this.byId.values()) if (!v.dead && Math.abs(v.x - me.x) < 40 && Math.abs(v.z - me.z) < 40) out.push(v);
        return out;
    }

    // ---------------------------------------------------------- hostility
    provoke(s, by, text = null) {
        if (!by || !this.auth || s.owner === by || this.ships.loyalTo(s, by)) return;
        if (this.alive(s) <= 0) return;
        const was = s.hostile.has(by) && s.hostile.get(by) > performance.now();
        s.hostile.set(by, performance.now() + HOSTILE_MS);
        if (was) return;
        const g = this.game;
        if (by === g.localId && text) g.hud.setVoice(text, true);
        else if (by !== g.localId) g.sync?.net.send({ t: 'shipev', id: s.id, k: 'hostile', p: by });
        const list = this.crews.get(s.id) || [];
        const v = list.find((x) => !x.dead);
        if (v) this._say(v, pick(SHOUT.fight));
    }

    /** Somebody took the wheel. */
    tookWheel(s, by) {
        if (!this.auth) return;
        if (this.ships.loyalTo(s, by) || s.owner === by) return;
        if (this.alive(s) <= 0) { this.capture(s, by); return; }
        this.provoke(s, by, '🏴 Матросы заметили, что вы взяли штурвал! К бою!');
    }

    /** (host) The crew is gone: the ship is whoever's at its wheel (or who killed the last one). */
    capture(s, by) {
        if (!by || s.owner === by) return;
        const g = this.game;
        s.owner = by;
        s.ownerName = by === g.localId ? (g.keeper?.myName || g.net?.name || null) : (g.remotes.get(by)?.name || null);
        s.hostile.clear();
        s.changed = true;
        for (const c of s.chests) c.locked = false;
        g.sync?.net.send({ t: 'shipev', id: s.id, k: 'owner', o: by, n: s.ownerName });
        if (by === g.localId) g.hud.setVoice(`⚓ Корабль «${s.name}» ваш!`, true);
    }

    // ---------------------------------------------------------- hits
    hit(v, dmg, dir, by, opts = {}) {
        if (!v || v.dead) return;
        const g = this.game;
        if (!this.auth) {
            g.sync?.net.send({ t: 'shit', id: v.id, dmg: Math.round(dmg * 10) / 10, d: dir ? [dir.x, dir.z] : null, mg: opts.magic ? 1 : 0 });
            v.model.flashHit?.(0.15);
            return;
        }
        if (v.damageCooldown > 0 && !opts.spell) return;
        v.damageCooldown = 0.35;
        if (opts.pierce) v.hp = 0;
        else if (v.armor > 0) {
            const a = Math.min(v.armor, dmg);
            v.armor -= a;
            v.hp -= a * 0.2 + (dmg - a);
        } else v.hp -= dmg;
        v.hp = Math.max(0, Math.round(v.hp * 10) / 10);
        v.model.flashHit?.(0.15);
        g.sound?.playHit?.();
        if (dir && !v.overboard) {
            // a blow shoves him a little (in the ship's frame)
            v.ship.pose.dirToLocal(dir.x, dir.z, _o);
            v.l.x += _o.x * 0.3; v.l.z += _o.z * 0.3;
        }
        const s = v.ship;
        if (by) this.provoke(s, by === 'local' ? g.localId : by, '⚔️ Вы напали на матроса — команда к бою!');
        if (v.hp <= 0) this._die(v, by === 'local' ? g.localId : by);
        else if (Math.random() < 0.5) this._say(v, pick(SHOUT.hurt));
    }

    /** (host) A guest's blow ('shit'). */
    remoteHit(m) {
        const v = this.byId.get(m.id);
        if (!v) return;
        const dmg = Math.max(0, Math.min(30, +m.dmg || 0));
        const dir = Array.isArray(m.d) ? _v.set(+m.d[0] || 0, 0, +m.d[1] || 0) : null;
        this.hit(v, dmg, dir, m.from, { magic: !!m.mg });
    }

    /** A blast / a ray of a spell (from Game's hooks). */
    hitAt(p, radius, dmg, by) {
        if (!this.auth) return;
        for (const v of this.byId.values()) {
            if (v.dead) continue;
            const d = Math.hypot(v.x - p.x, v.y + 1.5 - p.y, v.z - p.z);
            if (d < radius + 1) this.hit(v, dmg * (1 - d / (radius + 2)), _v.set(v.x - p.x, 0, v.z - p.z).normalize(), by, { spell: true });
        }
    }

    hitRay(o, d, len, width, dmg, by) {
        if (!this.auth) return;
        for (const v of this.byId.values()) {
            if (v.dead) continue;
            const tx = v.x - o.x, ty = v.y + 1.8 - o.y, tz = v.z - o.z;
            const along = tx * d.x + ty * d.y + tz * d.z;
            if (along < 0 || along > len) continue;
            const off = Math.hypot(tx - d.x * along, ty - d.y * along, tz - d.z * along);
            if (off < width + 1) this.hit(v, dmg, _v.set(d.x, 0, d.z).normalize(), by, { spell: true });
        }
    }

    /** A Wind spell (every computer runs it; the host decides): sailors near the rail go overboard. */
    wind(origin, dir, power, casterId) {
        if (!this.auth) return;
        const g = this.game;
        const by = casterId === 'local' ? g.localId : casterId;
        for (const v of this.byId.values()) {
            if (v.dead || v.overboard) continue;
            const tx = v.x - origin.x, tz = v.z - origin.z;
            const dist = Math.hypot(tx, tz);
            if (dist > (power > 1 ? 26 : 15) || dist < 0.5) continue;
            if ((tx * dir.x + tz * dir.z) / (dist * (Math.hypot(dir.x, dir.z) || 1)) < 0.75) continue;
            const s = v.ship;
            const push = (power > 1 ? 9 : 5) * (1 - dist / 30);
            s.pose.dirToLocal(dir.x, dir.z, _o);
            const ol = Math.hypot(_o.x, _o.z) || 1;
            v.l.x += (_o.x / ol) * push * 0.4;
            v.l.z += (_o.z / ol) * push * 0.4;
            const half = hullHalfWidth(s.layout, v.l.z, s.layout.deck);
            if (push > 4 && Math.abs(v.l.x) > half - 3 && Math.abs(_o.x / ol) > 0.4) this._overboard(v, _o.x > 0 ? 1 : -1);
            this.provoke(s, by, null);
        }
    }

    _overboard(v, side) {
        const s = v.ship;
        const half = hullHalfWidth(s.layout, v.l.z, s.layout.deck);
        s.pose.toWorld(side * (half + 1.5), v.l.y, v.l.z, _o);
        v.overboard = { x: _o.x, y: _o.y, z: _o.z, vy: 3, t: 0 };
        v.mode = 'run';
        this._say(v, 'А-а-а! Человек за бортом!');
    }

    _die(v, by) {
        v.dead = true;
        v.hp = 0;
        v.mode = 'dead';
        v.deadT = 0;
        const s = v.ship;
        s.crewKilled.add(v.idx);
        s.changed = true;
        if (v.role === 'captain') for (const c of s.chests) if (c.lockedBy === 'captain') c.locked = false;
        if (this.alive(s) <= 0) this.capture(s, s.helmBy || by);
    }

    // ---------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        for (const [sid, list] of this.crews) {
            const s = this.ships.list.get(sid);
            if (!s) continue;
            for (const v of list) {
                if (v.damageCooldown > 0) v.damageCooldown -= dt;
                if (this.auth) this._think(v, s, dt);
                else this._follow(v, dt);
            }
            this._place(s);
            for (const v of list) {
                v.model.update(dt, { mode: v.mode === 'swim' ? 'walk' : v.mode, speed: v.speed });
                if (v.bubbleT > 0 && (v.bubbleT -= dt) <= 0 && v.bubble) { g.scene.remove(v.bubble); v.bubble.material.map?.dispose(); v.bubble.material.dispose(); v.bubble = null; }
            }
        }
    }

    /** World places from the ship's frame (or the water, overboard). */
    _place(s) {
        const list = this.crews.get(s.id);
        if (!list) return;
        for (const v of list) {
            if (v.overboard) {
                v.x = v.overboard.x; v.y = v.overboard.y; v.z = v.overboard.z;
            } else {
                s.pose.toWorld(v.l.x, v.l.y, v.l.z, _o);
                v.x = _o.x; v.y = _o.y; v.z = _o.z;
            }
            v.group.position.set(v.x, v.y + VILLAGER_FOOT_OFFSET, v.z);
            v.group.rotation.set(0, s.st.yaw + v.lyaw, 0);
            if (v.bubble) v.bubble.position.set(v.x, v.y + 6.2, v.z);
        }
    }

    /** (host) What a sailor does. */
    _think(v, s, dt) {
        const g = this.game;
        if (v.dead) { v.mode = 'dead'; v.speed = 0; return; }
        if (v.overboard) { this._swim(v, s, dt); return; }
        if (s.flooded) { this._overboard(v, Math.random() < 0.5 ? -1 : 1); return; }
        if (v.sayT > 0) v.sayT -= dt;
        // the foe: a hostile player aboard (or on the pier near the gangway)
        const now = performance.now();
        let foe = null, fd = Infinity, onPier = false;
        for (const [id, until] of s.hostile) {
            if (until < now) { s.hostile.delete(id); continue; }
            const p = this._playerLocal(s, id, _l);
            if (!p) continue;
            const aboard = this._aboard(s, id);
            const d = Math.hypot(p.x - v.l.x, p.z - v.l.z);
            if (aboard && d < fd) { fd = d; foe = { id, x: p.x, y: p.y, z: p.z }; onPier = false; }
            else if (!aboard && !foe && Math.hypot(p.x, p.z - s.layout.gangZ) < 30 + s.layout.B) onPier = true;
        }
        if (foe) {
            v.foe = foe.id;
            if (fd > 2.0) { this._steer(v, s, foe.x, foe.z, RUN, dt); v.mode = 'run'; }
            else {
                v.mode = 'attack'; v.speed = 0;
                v.lyaw = Math.atan2(-(foe.x - v.l.x), -(foe.z - v.l.z));
                v.strikeT -= dt;
                if (v.strikeT <= 0) { v.strikeT = 0.9 + Math.random() * 0.4; this._strike(v, s, foe.id); }
            }
            if (v.sayT <= 0 && Math.random() < dt * 0.3) this._say(v, pick(SHOUT.fight));
            return;
        }
        v.foe = null;
        if (onPier && v.role !== 'captain') {
            // they line up at the gangway and shout
            const gw = s.layout.nodes.find((n) => n.tag === 'gangway:' + ((s.berth?.side || 1) > 0 ? '+1' : '-1')) || s.layout.nodes[0];
            if (Math.hypot(gw.x - v.l.x, gw.z - v.l.z) > 2 + v.idx * 0.4) { this._steer(v, s, gw.x - Math.sign(gw.x) * 1.5, gw.z + (v.idx % 4 - 1.5) * 1.6, RUN, dt); v.mode = 'run'; }
            else { v.mode = 'idle'; v.speed = 0; v.lyaw = gw.x > 0 ? -Math.PI / 2 : Math.PI / 2; }
            if (v.sayT <= 0 && Math.random() < dt * 0.2) this._say(v, pick(SHOUT.gang));
            return;
        }
        // jobs: walk the ship between stations, work at them
        if (v.path) {
            const n = s.layout.nodes[v.path[v.pathI]];
            if (!n) { v.path = null; return; }
            if (Math.hypot(n.x - v.l.x, n.z - v.l.z) < 0.6) {
                v.node = n.id;
                v.pathI++;
                if (v.pathI >= v.path.length) { v.path = null; v.waitT = 4 + Math.random() * 10; v.mode = n.tag?.startsWith('rig') || n.tag === 'capstan' ? 'work' : 'idle'; v.speed = 0; }
            } else { this._steer(v, s, n.x, n.z, WALK, dt, n.y); v.mode = 'walk'; }
            return;
        }
        v.waitT -= dt;
        if (v.role === 'captain') {
            const n = s.layout.nodes.find((x) => x.tag === 'captain');
            if (n && Math.hypot(n.x - v.l.x, n.z - v.l.z) > 1) { v.path = this._route(s, v.node, n.id); v.pathI = 0; }
            else { v.mode = 'idle'; v.lyaw = Math.PI; }
            return;
        }
        if (v.waitT <= 0) {
            const night = !!g.isNight;
            const want = night && v.idx % 3 !== 0 ? ['hammock'] : ['rig', 'bow', 'capstan', 'gangway', 'store', 'hammock'];
            const cands = s.layout.nodes.filter((n) => n.tag && want.some((t) => n.tag === t || n.tag.startsWith(t + ':')) && n.id !== v.node);
            const to = cands[Math.floor(Math.random() * cands.length)];
            if (to) { v.path = this._route(s, v.node, to.id); v.pathI = 0; }
            v.waitT = 3;
        }
    }

    /** A* on the ship's walking graph. */
    _route(s, a, b) {
        const L = s.layout;
        if (!L._adj) { L._adj = L.nodes.map(() => []); for (const [p, q] of L.edges) { L._adj[p].push(q); L._adj[q].push(p); } }
        const N = L.nodes;
        const open = new Map([[a, 0]]), came = new Map(), gs = new Map([[a, 0]]);
        const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].y - N[b].y, N[i].z - N[b].z);
        let guard = 0;
        while (open.size && guard++ < 500) {
            let cur = -1, best = Infinity;
            for (const [i, f] of open) if (f < best) { best = f; cur = i; }
            if (cur === b) {
                const path = [b];
                while (came.has(path[0])) path.unshift(came.get(path[0]));
                return path;
            }
            open.delete(cur);
            for (const nb of L._adj[cur]) {
                const t = gs.get(cur) + Math.hypot(N[cur].x - N[nb].x, N[cur].y - N[nb].y, N[cur].z - N[nb].z);
                if (t < (gs.get(nb) ?? Infinity)) { came.set(nb, cur); gs.set(nb, t); open.set(nb, t + h(nb)); }
            }
        }
        return null;
    }

    /** Walk towards a ship-local point on the decks (never through the rails or masts). */
    _steer(v, s, tx, tz, speed, dt, ty = null) {
        const dx = tx - v.l.x, dz = tz - v.l.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-3) { v.speed = 0; return; }
        const step = Math.min(d, speed * dt);
        const nx = v.l.x + (dx / d) * step, nz = v.l.z + (dz / d) * step;
        const L = s.layout;
        const reach = (ty != null ? Math.max(ty, v.l.y) : v.l.y) + 1.1;
        const f = floorAt(L, nx, nz, reach);
        if (f !== null && f > v.l.y - 3) {
            v.l.x = nx; v.l.z = nz;
            v.l.y += (f - v.l.y) * Math.min(1, dt * 10);
            const half = hullHalfWidth(L, v.l.z, Math.max(0.2, v.l.y)) - 0.9;
            if (Math.abs(v.l.x) > half) v.l.x = Math.sign(v.l.x) * half;
            // masts, guns, the wheel…
            for (const b of L.solids) {
                if (b.y1 <= v.l.y + 0.6 || b.y0 >= v.l.y + 3.5) continue;
                const cx = Math.max(b.x0, Math.min(b.x1, v.l.x)), cz = Math.max(b.z0, Math.min(b.z1, v.l.z));
                const ex = v.l.x - cx, ez = v.l.z - cz, ed = Math.hypot(ex, ez);
                if (ed < 0.5 && ed > 1e-4) { v.l.x = cx + (ex / ed) * 0.5; v.l.z = cz + (ez / ed) * 0.5; }
            }
        }
        v.speed = speed;
        v.lyaw = Math.atan2(-dx, -dz);
    }

    _strike(v, s, foeId) {
        const g = this.game;
        if (foeId === g.localId) g.castleLife?.struck?.(v.dmg, v.x, v.z, v.title);
        else g.sync?.villagerStrike?.(foeId, v.dmg, Math.round(v.x * 10) / 10, Math.round(v.z * 10) / 10, v.title);
    }

    /** Overboard: in the water, swimming back to a ladder (or drowning). */
    _swim(v, s, dt) {
        const o = v.overboard;
        o.t += dt;
        o.vy -= 14 * dt;
        o.y = Math.max(WATER_LEVEL_Y - 1.8, o.y + o.vy * dt);
        if (o.y <= WATER_LEVEL_Y - 1.8) o.vy = 0;
        v.mode = 'swim';
        const lad = s.layout.ladders[0];
        s.pose.toWorld(lad.x * 1.1, 0, lad.z, _o);
        const dx = _o.x - o.x, dz = _o.z - o.z, d = Math.hypot(dx, dz);
        const near = d < 25 && Math.abs(s.st.u) < 1.5;
        if (near && d > 1.5) { o.x += (dx / d) * 1.4 * dt; o.z += (dz / d) * 1.4 * dt; v.speed = 1.4; }
        if (near && d <= 1.5 && o.t > 3) {
            // up the rope ladder and back aboard
            const gw = s.layout.nodes.find((n) => n.tag && n.tag.startsWith('gangway')) || s.layout.nodes[0];
            v.l.x = gw.x; v.l.y = gw.y; v.l.z = gw.z;
            v.overboard = null;
            v.mode = 'idle';
            v.path = null;
            return;
        }
        if (!near && o.t > 20) { this._die(v, s.lastBy); v.overboard.y = WATER_LEVEL_Y - 3; }
    }

    _playerLocal(s, id, out) {
        const g = this.game;
        const p = id === g.localId ? (g.isDeadLocal ? null : g.character.group.position) : g.remotes.get(id)?.position;
        if (!p) return null;
        return s.pose.toLocal(p.x, p.y - 2, p.z, out);
    }

    _aboard(s, id) {
        const g = this.game;
        if (id === g.localId) return this.ships.me?.ship === s;
        const r = g.remotes.get(id);
        return !!r && r.ship === s.id;
    }

    _say(v, text) {
        const g = this.game;
        if (v.sayT > 0) return;
        v.sayT = 5;
        // a simple speech bubble
        if (!g.scene || typeof document === 'undefined') return;
        const cv = document.createElement('canvas');
        cv.width = 512; cv.height = 96;
        const x = cv.getContext('2d');
        x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 0, 512, 96);
        x.fillStyle = '#222'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(`${v.title}: ${text}`.slice(0, 32), 256, 48);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
        sp.scale.set(6, 1.1, 1);
        if (v.bubble) { g.scene.remove(v.bubble); v.bubble.material.map?.dispose(); v.bubble.material.dispose(); }
        v.bubble = sp;
        v.bubbleT = 3.5;
        g.scene.add(sp);
    }

    // ---------------------------------------------------------- network
    netSend() {
        const g = this.game;
        if (!g.sync || !this.auth) return;
        this._netT = (this._netT || 0) + 1;
        if (this._netT % 1 !== 0) return;
        for (const [sid, list] of this.crews) {
            const l = list.map((v) => [v.idx, Math.round(v.l.x * 100) / 100, Math.round(v.l.y * 100) / 100, Math.round(v.l.z * 100) / 100, Math.round(v.lyaw * 100) / 100, Math.max(0, MODE_CODE.indexOf(v.mode)), v.hp, Math.round(v.armor), v.dead ? 1 : 0, v.overboard ? [Math.round(v.overboard.x * 10) / 10, Math.round(v.overboard.y * 10) / 10, Math.round(v.overboard.z * 10) / 10] : 0]);
            g.sync.net.send({ t: 'screw', id: sid, l });
        }
    }

    applyNet(m) {
        const list = this.crews.get(m.id);
        if (!list) return;
        const s = this.ships.list.get(m.id);
        for (const a of m.l || []) {
            const v = list.find((x) => x.idx === a[0]);
            if (!v) continue;
            v.net = { x: a[1], y: a[2], z: a[3], yaw: a[4] };
            v.mode = MODE_CODE[a[5]] || 'idle';
            v.hp = a[6]; v.armor = a[7];
            if (a[8] && !v.dead) { v.dead = true; s?.crewKilled.add(v.idx); }
            v.overboard = Array.isArray(a[9]) ? { x: a[9][0], y: a[9][1], z: a[9][2], vy: 0, t: 0 } : null;
        }
    }

    _follow(v, dt) {
        const n = v.net;
        if (!n) return;
        const k = Math.min(1, dt * 8);
        const dx = n.x - v.l.x, dz = n.z - v.l.z;
        v.speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3) * 0.1;
        v.l.x += dx * k; v.l.y += (n.y - v.l.y) * k; v.l.z += dz * k;
        let dy = n.yaw - v.lyaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        v.lyaw += dy * k;
        if (v.mode === 'idle' || v.mode === 'attack' || v.mode === 'dead') v.speed = 0;
        else v.speed = v.mode === 'run' ? RUN : WALK;
    }
}

void _w;
