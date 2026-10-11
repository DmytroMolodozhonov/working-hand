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
import { SpeechBubble } from '../ui/SpeechBubble.js';
import { VillagerBrain, detectIntent } from './VillagerBrain.js';
import { matchSpell } from '../fx/SpellManager.js';

const HEAR = 7; // m: a sailor hears you this far (like a villager)
/** What sailors say by themselves now and then, and to each other. */
const CHAT = {
    alone: ['Эх, ветра бы попутного...', 'Палубу драить — не переплыть.', 'Чую, к ночи шторм будет.', 'Канаты проверить надо.', 'Скорей бы в море!', 'Рыбки бы наловить...'],
    ask: ['Слыхал, что у берега видели морского змея?', 'Как думаешь, капитан даст нам отдых?', 'Где ты был, когда паруса ставили?', 'Помнишь тот шторм у мыса?', 'Ром весь вышел, что ли?'],
    answer: ['Брешут, как всегда.', 'Да уж держи карман шире.', 'На вахте стоял, где ж ещё.', 'Как забыть... Еле выбрались.', 'Тише, боцман услышит!', 'А то ж!'],
    captain: ['Свистать всех наверх!', 'Всем по местам!', 'Шевелись, братва!', 'Держать курс!'],
};

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
                entry: { female: false, seed: e.seed }, talking: 0, chatT: 8 + Math.random() * 20,
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
        for (const v of list) { v.model.dispose(); v.bubble?.dispose(); this.byId.delete(v.id); v.removable = true; this.brains?.delete(v.id); }
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
            if (this.auth) { this._separate(s, list); this._chatter(s, list, dt); }
            this._place(s);
            for (const v of list) {
                v.model.update(dt, { mode: v.mode === 'swim' ? 'walk' : v.mode, speed: v.speed });
                if (v.sayT > 0) v.sayT -= dt;
                if (v.bubble) v.bubble.update(dt, _w.set(v.x, v.y + 4.4, v.z), g.camera);
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
        }
    }

    /** (host) What a sailor does. */
    _think(v, s, dt) {
        const g = this.game;
        if (v.dead) { v.mode = 'dead'; v.speed = 0; return; }
        if (v.overboard) { this._swim(v, s, dt); return; }
        if (s.flooded) { this._overboard(v, Math.random() < 0.5 ? -1 : 1); return; }
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
        // talking to somebody: stand and face them
        if (v.talking > 0) {
            v.talking -= dt;
            v.mode = 'idle'; v.speed = 0;
            const p = v.talkTo && this._playerLocal(s, v.talkTo, _l);
            if (p) v.lyaw = Math.atan2(-(p.x - v.l.x), -(p.z - v.l.z));
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
        let ux = dx / d, uz = dz / d;
        // somebody in the way (a mate, a player): step round them, to the right
        for (const o of this.crews.get(s.id) || []) {
            if (o === v || o.dead || o.overboard || Math.abs(o.l.y - v.l.y) > 2.5) continue;
            const ox = o.l.x - v.l.x, oz = o.l.z - v.l.z, od = Math.hypot(ox, oz);
            if (od > 2.2 || od < 1e-3 || (ox * ux + oz * uz) / od < 0.7) continue;
            const side = (v.idx > o.idx) ? 1 : -1;
            const rx = -uz * side, rz = ux * side;
            const k = (2.2 - od) / 2.2;
            ux += rx * k * 1.2; uz += rz * k * 1.2;
            const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
            if (o.speed > 0.1 && v.idx > o.idx && od < 1.4) { v.speed = 0; return; } // (the younger one waits a moment)
        }
        const nx = v.l.x + ux * step, nz = v.l.z + uz * step;
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

    /** A sailor says a line: over the head, and aloud (the villagers' voices) for those close enough. */
    _say(v, text, seconds = 4, broadcast = true) {
        const g = this.game;
        if (!text || (v.sayT > 0 && !broadcast)) return;
        v.sayT = 1.5;
        if (!g.scene || typeof document === 'undefined') return;
        if (!v.bubble) { v.bubble = new SpeechBubble(); g.scene.add(v.bubble.sprite); }
        const shout = /!$/.test(text) && (!!v.foe || v.role === 'captain');
        const talk = g.castleLife?.talk;
        if (talk?.voiceCarries?.(v, shout)) v.bubble.hide?.();
        else v.bubble.show(text, { name: `${v.title} ${v.name}`, seconds, shout, color: v.role === 'captain' ? '#1f3a6b' : '#2a4a5a' });
        talk?.voice?.(v, text, shout);
        if (broadcast && this.auth) g.sync?.net.send({ t: 'screw', say: 1, id: v.id, text: String(text).slice(0, 200) });
    }

    // ---------------------------------------------------------- talking
    /** The sailor nearest to me within earshot (the one in front first). */
    _listener() {
        const g = this.game;
        const me = g.character.group.position;
        const yaw = g.character.group.rotation.y;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        let best = null, bs = Infinity;
        for (const v of this.byId.values()) {
            if (v.dead || v.overboard) continue;
            const dx = v.x - me.x, dz = v.z - me.z, d = Math.hypot(dx, dz);
            if (d > HEAR || Math.abs(v.y - (me.y - 1.95)) > 3) continue;
            const sc = d - 2.5 * (d > 0.01 ? (dx * fx + dz * fz) / d : 1);
            if (sc < bs) { bs = sc; best = v; }
        }
        return best;
    }

    /** A sailor hears me and these are words of a talk (a greeting, a question…), not a spell. */
    claims(text) {
        if (!this._listener()) return false;
        const spell = matchSpell(text);
        if (spell === 'Stand') return false;
        const intent = detectIntent(text).intent;
        if (spell && (intent === 'magic' || intent === 'unknown')) return false;
        return intent !== 'unknown';
    }

    _brain(v) {
        this.brains = this.brains || new Map();
        let b = this.brains.get(v.id);
        if (!b) {
            const s = v.ship;
            const capt = (this.crews.get(s.id) || []).find((x) => x.role === 'captain');
            // (a captain talks like a commander, a sailor like a working man)
            b = new VillagerBrain(
                { id: v.id, name: v.name, role: v.role === 'sailor' ? 'builder' : 'knight', female: false, castleName: `корабль «${s.name}»`, kingName: capt ? capt.name : 'капитан', seed: v.entry.seed },
                () => ({ castleName: `корабль «${s.name}»`, kingName: capt ? capt.name : 'капитан', playerIsKing: s.owner === this.game.localId, timeOfDay: this.game.isNight ? 'night' : 'day', danger: s.hostile.size > 0 }),
            );
            this.brains.set(v.id, b);
        }
        return b;
    }

    /** Words said near a sailor: he stops, turns to you and answers (like the people of the castles). */
    hear(text, by = null) {
        const g = this.game;
        const v = by ? null : this._listener();
        if (!v) return false;
        const s = v.ship;
        const ctx = {
            playerName: g.net?.active ? g.net.name : null, playerIsKing: s.owner === g.localId,
            hostile: (s.hostile.get(g.localId) || 0) > performance.now(), coins: g.inventory?.coins?.() ?? 0,
            nearbyGoods: [], heldItem: null, players: [], selfId: g.localId, following: false, danger: s.hostile.size > 0,
        };
        let res;
        try { res = this._brain(v).hear(text, ctx); } catch (e) { res = { reply: 'А? Чего?' }; }
        v.talking = 6; v.talkTo = g.localId;
        if (!this.auth) g.sync?.net.send({ t: 'screw', talk: 1, id: v.id });
        this._say(v, res?.reply || 'Некогда мне, работать надо.', 6);
        if (res?.action === 'hostile' || res?.action === 'call_guards') this.provoke(s, g.localId, '🏴 Вы разозлили матросов!');
        return true;
    }

    /** Now and then a sailor says something, or two sailors near each other talk. */
    _chatter(s, list, dt) {
        const me = this.game.character.group.position;
        for (const v of list) {
            if (v.dead || v.overboard || v.foe || v.talking > 0) continue;
            if ((v.chatT -= dt) > 0) continue;
            v.chatT = 20 + Math.random() * 30;
            if (Math.hypot(v.x - me.x, v.z - me.z) > 40) continue;
            if (v.role === 'captain') { if (Math.random() < 0.5) this._say(v, pick(CHAT.captain)); continue; }
            const mate = list.find((o) => o !== v && !o.dead && !o.overboard && !o.foe && Math.hypot(o.l.x - v.l.x, o.l.z - v.l.z) < 6);
            if (!mate) { if (Math.random() < 0.4) this._say(v, pick(CHAT.alone)); continue; }
            // a little talk: they turn to each other, one asks, the other answers
            for (const [a, b] of [[v, mate], [mate, v]]) { a.talking = 5; a.talkTo = null; a.lyaw = Math.atan2(-(b.l.x - a.l.x), -(b.l.z - a.l.z)); a.path = null; }
            this._say(v, pick(CHAT.ask));
            mate.chatT = 20 + Math.random() * 30;
            setTimeout(() => { if (!mate.dead) this._say(mate, pick(CHAT.answer)); }, 2200);
        }
    }

    /**
     * Bodies are solid: sailors never walk through each other (or through a player on the deck);
     * the one in the way is stepped round.
     */
    _separate(s, list) {
        const R = 1.0;
        const bodies = [];
        const me = this.ships.me?.ship === s ? this.ships.me.l : null;
        if (me) bodies.push({ l: { x: me.x, y: me.y - 2, z: me.z }, fixed: true });
        for (const [id, r] of this.game.remotes) if (r.ship === s.id) { const q = s.pose.toLocal(r.position.x, r.position.y - 2, r.position.z, {}); bodies.push({ l: q, fixed: true, id }); }
        for (const v of list) if (!v.dead && !v.overboard) bodies.push({ l: v.l, v });
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const A = bodies[i], B = bodies[j];
                if (A.fixed && B.fixed) continue;
                if (Math.abs(A.l.y - B.l.y) > 2.5) continue;
                let dx = B.l.x - A.l.x, dz = B.l.z - A.l.z;
                let d = Math.hypot(dx, dz);
                if (d >= R) continue;
                if (d < 1e-4) { dx = (B.v?.idx || 1) % 2 ? 1 : -1; dz = 0; d = 1; }
                const push = R - d;
                const ka = A.fixed ? 0 : B.fixed ? 1 : 0.5, kb = 1 - ka;
                if (!A.fixed) { A.l.x -= (dx / d) * push * ka; A.l.z -= (dz / d) * push * ka; }
                if (!B.fixed) { B.l.x += (dx / d) * push * kb; B.l.z += (dz / d) * push * kb; }
            }
        }
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
        if (m.say) { const v = this.byId.get(m.id); if (v) this._say(v, m.text, 4, false); return; }
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

    /** (host) a guest talks to a sailor: he stops and faces them. */
    remoteTalk(m) {
        const v = this.byId.get(m.id);
        if (v && !v.dead) { v.talking = 6; v.talkTo = m.from; v.path = null; }
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
