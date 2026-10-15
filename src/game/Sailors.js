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
 * A Wind spell can throw a sailor near the rail overboard: «Человек за бортом!» — a mate
 * throws him the lifebuoy on its line and hauls him in to the rope ladder (even under way),
 * others call to him from the rail; whoever threw him is the ship's foe (aboard they fight
 * him, off the ship they shout at him from the rail). Alone he swims to the ladder, or drowns.
 * Feet always on the deck (_ground): never sunk into a stair, never inside a mast or a gun; a
 * wedged one squeezes out by himself. Not fighting, a sailor keeps out of a player's reach.
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
import { registerKind } from './CreatureImpact.js';
import { avoidStep } from './Avoid.js';
import { TACTICS, assignRoles, canSwing, spotAt, shareFoes } from './CrewTactics.js';

/** Damage of a drop from `h` m onto a deck (as Levitation.fallDamage). */
const fallDrop = (h) => (h > 3.5 ? Math.round((h - 3.5) * 2) : 0);

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
    // the captain's orders in a fight (the crew takes turns, it doesn't rush him all at once)
    order: ['Окружай его! По двое — не толпись!', 'Двое вперёд, остальные — кольцом!', 'Не лезь все разом! По очереди!'],
    command: ['Заходи сбоку!', 'Держать круг!', 'Не дай ему уйти к борту!', 'Не подпускай его к штурвалу!'],
    // the ones waiting their turn
    cheer: ['Давай, {n}!', 'Руби его, {n}!', 'Я следующий!', 'Держись, {n}!'],
    parry: ['Ха! Мимо!', 'Не так быстро!', 'Отбил!'],
    // the foe off the ship (he threw a mate overboard from the shore, the water, another deck)
    rail: ['Эй, ты! Мы всё видели!', 'Только сунься к нам на борт!', 'Ты за это ответишь!', 'Вон он! Не упускай его!', 'Поднимись на палубу, если смелый!'],
    rally: ['Все к борту! Вон он!', 'Не спускать с него глаз!', 'К оружию! Он рядом!'],
};
const WALK = 2.2, RUN = 5.2;
const HOSTILE_MS = 180000;
const MODE_CODE = ['idle', 'walk', 'run', 'attack', 'dead', 'work', 'swim', 'block', 'cheer', 'sleepMat', 'situp']; // (asleep below at night: NightLife.js)
const GUARD = 2.6; // m/s: stepping in and out with the blade up
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _l = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };
const _set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
const _m1 = { x: 0, y: 0, z: 0, set: _set }, _m2 = { x: 0, y: 0, z: 0, set: _set };

/** Words about the sea and the ship a sailor understands (a castle person's brain wouldn't): its topic or null. */
export function seaTalk(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (/(куда|откуда).*(плыв|плав|иде|курс|держ)|какой курс/.test(t)) return 'where';
    if (/(возьм|прим|запиш|наним).*(команд|юнг|матрос|экипаж)|в команду/.test(t)) return 'join';
    if (/где.*капитан|кто.*капитан/.test(t)) return 'captain';
    if (/(что|чего).*(вез|груз|трюм)/.test(t)) return 'cargo';
    if (/(отвез|подвез|довез|покатай|прокати|перевез)/.test(t)) return 'ride';
    if (/(как|чей).*(корабл|судн|посудин)|(корабл|судн).*называ/.test(t)) return 'ship';
    if (/(шторм|погод|ветер|ветр)/.test(t)) return 'weather';
    if (/(сдаюсь|(^| )мир( |$)|давай(те)? мир|не (бей|надо драться|деритесь)|перемири|прости|извини)/.test(t)) return 'peace';
    return null;
}

/** A greeting to the whole crew («привет, моряки», «здорово, братва», «всем привет»), not to one of them. */
export function greetsCrew(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (!/(привет|здравств|здорово|здрасьте|добр(ый|ое|ого) (день|утро|вечер)|доброго|салют|ахой|хай |хелло|приветствую)/.test(t)) return false;
    return / (моряк(и|ам)|матрос(ы|ам)|братв[а-я]*|ребят[а-я]*|парни|парням|мужики|мужикам|народ|команд[а-я]*|экипаж[а-я]*|всем|все|господа|друзья|морские волки) /.test(t);
}

const GREET = {
    sailor: ['Привет!', 'Здорово!', 'И тебе привет!', 'Ахой!', 'Здравия желаем!', 'Привет, привет!', 'Добро пожаловать на борт!', 'О, гость!'],
    boatswain: ['Здравия, сэр!', 'Добро пожаловать на палубу!', 'Приветствую!'],
};

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

/**
 * A body (radius 0.5, standing at p in the ship's frame) out of the masts, guns, bulkheads, stair
 * sides: to 0.5 m off the nearest face — even when it got right inside one (pushed in by a blow or a
 * mate's shoulder), out through the nearest side. True: it was moved.
 */
export function pushOut(L, p) {
    let moved = false;
    for (const b of L.solids) {
        if (b.y1 <= p.y + 0.6 || b.y0 >= p.y + 3.5) continue;
        const cx = Math.max(b.x0, Math.min(b.x1, p.x)), cz = Math.max(b.z0, Math.min(b.z1, p.z));
        const ex = p.x - cx, ez = p.z - cz, ed = Math.hypot(ex, ez);
        if (ed >= 0.5) continue;
        if (ed > 1e-4) { p.x = cx + (ex / ed) * 0.5; p.z = cz + (ez / ed) * 0.5; }
        else {
            const m = Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z);
            if (m === p.x - b.x0) p.x = b.x0 - 0.5;
            else if (m === b.x1 - p.x) p.x = b.x1 + 0.5;
            else if (m === p.z - b.z0) p.z = b.z0 - 0.5;
            else p.z = b.z1 + 0.5;
        }
        moved = true;
    }
    return moved;
}

/**
 * Places at the main deck's rail (open sky above, nothing solid there) where a sailor can stand and
 * look over the side — to call to a man in the water, throw him the buoy, shout at one on the shore.
 */
export function railSpots(L) {
    if (L._rail) return L._rail;
    const D = L.deck, out = [];
    const main = L.floors.find((f) => f.id === 'main');
    for (let z = main.z0 + 1; z <= main.z1 - 1; z += 0.8) {
        for (const side of [-1, 1]) {
            const x = side * (hullHalfWidth(L, z, D) - 1.0);
            if (floorAt(L, x, z, D + 0.5) !== D || floorAt(L, x, z, D + 40) !== D) continue; // (a deck above: a cabin, no view)
            if (L.solids.some((b) => b.y1 > D + 0.6 && b.y0 < D + 3.5 && x > b.x0 - 0.55 && x < b.x1 + 0.55 && z > b.z0 - 0.55 && z < b.z1 + 0.55)) continue;
            out.push({ x, y: D, z, side });
        }
    }
    L._rail = out;
    return out;
}

/** The rail spot on `side` nearest to ship-local z (or null). */
function railNear(L, side, z) {
    let best = null, bd = Infinity;
    for (const r of railSpots(L)) { if (r.side !== side) continue; const d = Math.abs(r.z - z); if (d < bd) { bd = d; best = r; } }
    return best;
}

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
                model, group: model.group, isSailor: true, ck: 'c', removable: false, stunT: 0,
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
        for (const v of list) { v.model.dispose(); v.bubble?.dispose(); this._dropBuoy(v); this.byId.delete(v.id); v.removable = true; this.brains?.delete(v.id); }
        this.crews.delete(s.id);
        s.mob = null;
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
        g.castleLife?.night?.crewAlarm(s); // (the sleepers below jump up)
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
        // a blade from in front, his own cutlass up on guard: he may turn it aside
        if (opts.weapon && !opts.spell && !opts.pierce && dir && this._parries(v, dir)) {
            g.sound?.playClang?.(0.7);
            if (g.fx?.spark) for (let i = 0; i < 8; i++) g.fx.spark(_w.set(v.x, v.y + 3.2, v.z), 0xfff1b0, 0.08, _v.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.35);
            if (v.fs) { v.fs.st = 'close'; v.fs.cd = 0; } // (and answers at once)
            if (by) this.provoke(v.ship, by === 'local' ? g.localId : by, '⚔️ Вы напали на матроса — команда к бою!');
            if (v.sayT <= 0 && Math.random() < 0.5) this._say(v, pick(SHOUT.parry), 2);
            return;
        }
        if (opts.pierce) v.hp = 0;
        else if (v.armor > 0) {
            const a = Math.min(v.armor, dmg);
            v.armor -= a;
            v.hp -= a * 0.2 + (dmg - a);
        } else v.hp -= dmg;
        v.hp = Math.max(0, Math.round(v.hp * 10) / 10);
        if (by) v.hitBy = { id: by === 'local' ? g.localId : by, t: performance.now() };
        v.model.flashHit?.(0.15);
        g.sound?.playHit?.();
        if (dir && !v.overboard) {
            // a blow shoves him a little (in the ship's frame)
            v.ship.pose.dirToLocal(dir.x, dir.z, _o);
            v.l.x += _o.x * 0.3; v.l.z += _o.z * 0.3;
        }
        const s = v.ship;
        g.castleLife?.night?.wakeSailor(v, 'hit');
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
            if (d < radius + 1 && !this.game.wards?.shields(p, { x: v.x, y: v.y + 1.5, z: v.z })) this.hit(v, dmg * (1 - d / (radius + 2)), _v.set(v.x - p.x, 0, v.z - p.z).normalize(), by, { spell: true });
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

    /** A guard up, facing the blade (dir: the way the blow goes, world): turned aside? */
    _parries(v, dir) {
        if (v.mode !== 'block' || v.stunT > 0 || v.overboard) return false;
        const yaw = v.ship.st.yaw + v.lyaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const dl = Math.hypot(dir.x, dir.z) || 1;
        if ((dir.x * fx + dir.z * fz) / dl > -0.35) return false; // (from the side or behind: no)
        // (the blade just turned one blow aside is out of line for a moment: the next one gets through)
        const now = performance.now();
        if (now - (v.parryT || -1e9) < 1000) return false;
        if (Math.random() >= (v.role === 'sailor' ? 0.45 : 0.6)) return false;
        v.parryT = now;
        return true;
    }

    /**
     * (host) The body is shoved (CreatureImpact: a blow, a gust of «Вайнд», a blast) by dx, dz world metres.
     * It slides along the deck; hard against the rail — or thrown up over it — it goes over the side.
     */
    shove(v, dx, dz) {
        if (!this.auth || v.dead || v.overboard) return;
        const s = v.ship, L = s.layout;
        s.pose.dirToLocal(dx, dz, _o);
        const lx = _o.x, lz = _o.z;
        const nx = v.l.x + lx, nz = v.l.z + lz;
        const half = hullHalfWidth(L, nz, Math.max(0.2, v.l.y)) - 0.9;
        if (Math.abs(nx) > half && Math.sign(lx) === Math.sign(nx)) {
            const e = this.game.creatureImpact?.active.get('c|' + v.id)?.s;
            const sp = e ? Math.hypot(e.vx, e.vz) : 0;
            // (the bulwark is chest-high: a hard shove — or a body already in the air — goes over it)
            if (sp > 6 || (sp > 3 && (v.vy || 0) > 1)) { this._overboard(v, nx > 0 ? 1 : -1, e ? { x: e.vx, z: e.vz } : null); return; }
        }
        const f = floorAt(L, nx, nz, v.l.y + 1.1);
        if (f === null || f < v.l.y - 12) return; // (nothing to stand on there)
        v.l.x = Math.max(-half, Math.min(half, nx));
        v.l.z = nz;
        if (f < v.l.y - 0.3 && !v.vy) v.vy = -0.01; // (off an edge: he falls to the deck below)
        this._solids(v, L);
    }

    /** (host) Up in the air (tossed, lifted, fallen off a deck): gravity, down to the floor below. */
    _fall(v, s, dt) {
        const L = s.layout;
        const f = floorAt(L, v.l.x, v.l.z, v.l.y + 1.1);
        const ground = f ?? v.l.y;
        if (!v.vy && v.l.y <= ground + 0.05) return;
        v.vy = (v.vy || 0) - 22 * dt;
        v.l.y += v.vy * dt;
        if (v.l.y <= ground) {
            const vy = v.vy;
            v.l.y = ground; v.vy = 0;
            if (vy < -15) this.hit(v, Math.min(8, 2 + (-vy - 15) * 0.5), null, null, { spell: true }); // (a fall from high up hurts)
        }
    }

    /** «Overgrown» (host): the sailors it reaches are thrown apart along the deck — near the rail, overboard. */
    scatter(origin, pushAt, casterId) {
        if (!this.auth) return;
        const by = casterId === 'local' ? this.game.localId : casterId;
        for (const v of this.byId.values()) {
            if (v.dead || v.overboard) continue;
            const p = pushAt(_w.set(v.x, v.y + 1.6, v.z));
            if (!p) continue;
            const s = v.ship;
            const push = Math.hypot(p.x, p.z);
            s.pose.dirToLocal(p.x, p.z, _o);
            const ol = Math.hypot(_o.x, _o.z) || 1;
            v.l.x += (_o.x / ol) * push * 0.3;
            v.l.z += (_o.z / ol) * push * 0.3;
            const half = hullHalfWidth(s.layout, v.l.z, s.layout.deck);
            if (Math.abs(v.l.x) > half - 1) { if (push > 6) this._overboard(v, _o.x > 0 ? 1 : -1, null, by); else v.l.x = Math.sign(v.l.x) * (half - 1); }
            this.provoke(s, by, null);
        }
    }

    /** Masts, guns, the wheel: never inside them. */
    _solids(v, L) { pushOut(L, v.l); }

    /**
     * (host) Feet on the deck, every frame, whatever moved him (a step, a blow, a mate's shoulder, a
     * gust, the ship's rolling): inside the bulwarks, out of anything solid, standing on the floor or
     * the stair under him — never sunk into it, never on air (off an edge he drops; over nothing at
     * all — back onto the nearest walkway).
     */
    _ground(v, s) {
        if (v.dead || v.overboard || v.vy || v.nsleep || v.mode === 'sleepMat' || v.mode === 'situp') return;
        const L = s.layout, p = v.l;
        const half = hullHalfWidth(L, p.z, Math.max(0.2, p.y)) - 0.9;
        if (Math.abs(p.x) > half) p.x = Math.sign(p.x) * Math.max(0, half);
        // (sunk into a stair: up onto its step first — not pushed out of the stair from inside it)
        const f0 = floorAt(L, p.x, p.z, p.y + 1.1);
        if (f0 !== null && f0 > p.y) p.y = f0;
        pushOut(L, p);
        const f = floorAt(L, p.x, p.z, p.y + 1.1);
        if (f === null) { this._toNode(v, s); return; }
        if (f < p.y - 0.3) v.vy = -0.01; // (an edge: he drops to the floor below)
        else p.y = f; // (sunk into a stair or pushed onto a step: up onto it)
    }

    /** Wedged where he can't get out (or over nothing): he squeezes out onto the nearest free walkway. */
    _toNode(v, s, notHere = false) {
        const N = s.layout.nodes;
        let best = null, bd = Infinity;
        for (const n of N) {
            const d = Math.hypot(n.x - v.l.x, (n.y - v.l.y) * 2, n.z - v.l.z);
            if (notHere && d < 0.4) continue;
            if (d < bd) { bd = d; best = n; }
        }
        if (!best) return;
        v.l.x = best.x; v.l.y = best.y; v.l.z = best.z;
        v.node = best.id; v.path = null; v.fpath = null; v.vy = 0; v.stuckT = 0; v.lostT = 0; v.jamT = 0;
    }

    /** Over the side into the sea (vel: the world speed it flew off with, m/s). */
    _overboard(v, side, vel = null, by = null) {
        const s = v.ship;
        const g = this.game;
        // who threw him (a blow, a gust, a blast a moment ago) — that one attacked the ship
        if (!by && v.hitBy && performance.now() - v.hitBy.t < 4000) by = v.hitBy.id;
        if (by === 'local') by = g.localId;
        const half = hullHalfWidth(s.layout, v.l.z, s.layout.deck);
        s.pose.toWorld(side * (half + 1.5), Math.max(v.l.y, s.layout.deck), v.l.z, _o);
        // (it keeps flying outwards a little: off the ship's side, never back into it)
        const out = s.pose.dirToWorld(side, 0, _w);
        let vx = vel ? vel.x * 0.5 : 0, vz = vel ? vel.z * 0.5 : 0;
        if (vx * out.x + vz * out.z < 2) { vx += out.x * 2; vz += out.z * 2; }
        v.overboard = { x: _o.x, y: _o.y, z: _o.z, vy: 3, vx, vz, t: 0, wet: false };
        v.mode = 'run';
        v.fs = null; v.busy = false; v.stunT = 0; v.vy = 0; v.rescue = null; v.alert = null;
        this._say(v, pick(['А-а-а-а!', 'Полундра-а-а!', 'Спаси-и-ите!']));
        // the crew sees it: a man overboard (_overboardWatch: one throws him the buoy, others call to him)
        (s.mob || (s.mob = [])).push({ v, by, t: 0, side });
        g.castleLife?.night?.crewAlarm(s, false); // (the sleepers below jump up)
        if (by && (by === g.localId || g.remotes?.has?.(by))) {
            // a person did it: that one attacked the ship — the crew goes for him (CrewTactics) or at
            // least to the rail, shouting at him; the people on the shore see a man thrown into the sea
            this.provoke(s, by, '🏴 Вы выбросили матроса за борт — команда в ярости!');
            g.castleLife?.alarm?.({ x: v.overboard.x, y: v.overboard.y, z: v.overboard.z }, 'attacker', by);
        }
    }

    // ---------------------------------------------------------- a man overboard
    /**
     * (host) Somebody of the crew is in the water: the nearest free hand runs to the rail on his
     * side, shouts «Человек за бортом!» and throws him the lifebuoy on its line (and throws it again
     * if it falls short); one or two more come to the rail and call to him. He swims to the buoy (or
     * straight to the rope ladder), and holding it is hauled in along the ship's side to the ladder
     * — even when the ship is under way. Back aboard (or drowned) — they go back to their work.
     */
    _overboardWatch(s, list, dt) {
        if (!s.mob?.length) return;
        for (const m of [...s.mob]) {
            m.t += dt;
            const w = m.v;
            if (w.dead || !w.overboard || !list.includes(w)) {
                for (const o of list) {
                    if (o.rescue?.m !== m) continue;
                    if (o.rescue.job === 'buoy') this._say(o, w.dead ? 'Эх... Не успели.' : pick(['Вытащили! Живой!', 'Ну и напугал ты нас!', 'Живой, чертяка!']));
                    this._endRescue(o, s);
                }
                s.mob.splice(s.mob.indexOf(m), 1);
                if (!w.dead) setTimeout(() => { if (!w.dead && !w.overboard) this._say(w, pick(['Спасибо, братцы!', 'Тьфу... Солёная!', 'Жив я, жив!'])); }, 1500);
                continue;
            }
            const free = (o) => o !== w && !o.dead && !o.overboard && !o.rescue && !(o.stunT > 0) && !o.vy && o.mode !== 'sleepMat';
            const wl = s.pose.toLocal(w.overboard.x, w.overboard.y, w.overboard.z, {});
            const far = (o) => Math.hypot(o.l.x - wl.x, o.l.z - wl.z) + Math.abs(o.l.y - s.layout.deck) * 3;
            if (!list.some((o) => o.rescue?.m === m && o.rescue.job === 'buoy')) {
                // (the captain only when nobody else is left; one fighting only when nobody is free)
                const c = list.filter(free).sort((a, b) => (far(a) + (a.role === 'captain' ? 60 : 0) + (a.foe ? 25 : 0)) - (far(b) + (b.role === 'captain' ? 60 : 0) + (b.foe ? 25 : 0)))[0];
                if (c) {
                    c.rescue = { m, job: 'buoy', t: 0 }; c.path = null; c.talking = 0;
                    if (!m.called) { m.called = true; this._say(c, 'Человек за бортом!', 4); }
                }
            }
            if (list.filter((o) => o.rescue?.m === m && o.rescue.job === 'call').length < 2 && m.t < 30) {
                const c = list.filter((o) => free(o) && !o.foe && o.role !== 'captain').sort((a, b) => far(a) - far(b))[0];
                if (c) { c.rescue = { m, job: 'call', t: 0 }; c.path = null; c.talking = 0; }
            }
        }
    }

    _endRescue(v, s) {
        v.rescue = null; v.path = null; v.fpath = null; v.mode = 'idle'; v.speed = 0;
        v.node = this._nearestNode(s, v.l); v.waitT = 1 + Math.random() * 2;
    }

    /** (host) One sent to save the man in the water: to the rail, the buoy on its line, haul him in. */
    _rescueStep(v, s, dt) {
        const R = v.rescue, w = R.m.v, o = w.overboard;
        if (!o || w.dead) { this._endRescue(v, s); return; }
        R.t += dt;
        const q = s.pose.toLocal(o.x, o.y, o.z, _l);
        const wx = q.x, wz = q.z;
        const side = wx >= 0 ? 1 : -1;
        const face = () => { v.lyaw = Math.atan2(-(wx - v.l.x), -(wz - v.l.z)); };
        const spot = railNear(s.layout, side, wz + (R.job === 'call' ? (v.idx % 2 ? 2.4 : -2.4) : 0));
        if (!spot) { v.mode = 'cheer'; v.speed = 0; face(); return; }
        if (!this._toSpot(v, s, spot, RUN, dt)) {
            if (R.job === 'call' && v.sayT <= 0 && Math.random() < dt * 0.3) this._say(v, 'Человек за бортом!');
            return;
        }
        face();
        v.speed = 0;
        const dist = Math.hypot(wx - v.l.x, wz - v.l.z);
        if (R.job === 'call') {
            v.mode = 'cheer'; // (waving to him over the rail)
            if (v.sayT <= 0 && Math.random() < dt * 0.25) this._say(v, pick(['Держись!', 'Плыви к трапу!', 'Сюда, к борту!', 'Держись, браток!']));
            if (R.t > 40) this._endRescue(v, s);
            return;
        }
        const b = R.buoy;
        if (!b) {
            if (!o.wet || dist > 20) {
                v.mode = 'cheer';
                if (v.sayT <= 0 && Math.random() < dt * 0.3) this._say(v, dist > 20 ? 'Плыви к нам! Держись!' : 'Держись! Сейчас!');
                return;
            }
            // a swing of the arm — and the ring flies out on its line to him
            v.mode = 'attack';
            R.wind = (R.wind || 0) + dt;
            if (R.wind < 0.35) return;
            R.wind = 0;
            const h = s.pose.toWorld(v.l.x + side * 0.6, v.l.y + 2.6, v.l.z, _o);
            const tx = o.x + (Math.random() - 0.5) * 1.5, tz = o.z + (Math.random() - 0.5) * 1.5, ty = WATER_LEVEL_Y + 0.05;
            const T = 0.9 + dist * 0.03;
            R.buoy = { x: h.x, y: h.y, z: h.z, vx: (tx - h.x) / T, vz: (tz - h.z) / T, vy: (ty - h.y) / T + 0.5 * 14 * T, fly: true, t: 0, lx: 0, lz: 0 };
            this._say(v, pick(['Лови круг!', 'Хватай конец!', 'Держи!']));
            return;
        }
        b.t += dt;
        if (b.fly) {
            v.mode = 'idle';
            b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            if (b.y <= WATER_LEVEL_Y + 0.05) {
                b.y = WATER_LEVEL_Y + 0.05; b.fly = false;
                const l = s.pose.toLocal(b.x, b.y, b.z, _l); b.lx = l.x; b.lz = l.z; // (on its line: it goes with the ship)
                this.game.sound?.playSplash?.();
            }
            return;
        }
        if (o.rope) { v.mode = 'work'; b.x = o.x; b.y = WATER_LEVEL_Y + 0.05; b.z = o.z; return; } // (hauling the line in)
        const p = s.pose.toWorld(b.lx, 0, b.lz, _o);
        b.x = p.x; b.y = WATER_LEVEL_Y + 0.05; b.z = p.z;
        v.mode = 'idle';
        // (fell short, or he drifted off: the line pulled in and thrown again)
        if (Math.hypot(b.x - o.x, b.z - o.z) > 7 || b.t > 12) { R.buoy = null; this._say(v, 'Мимо! Ещё раз!', 2); }
    }

    /** The buoy thrown to this man in the water (landed, on its line), or null. */
    _buoyFor(w, s) {
        for (const o of this.crews.get(s.id) || []) {
            const b = o.rescue?.m.v === w && o.rescue.job === 'buoy' && !o.dead ? o.rescue.buoy : null;
            if (b && !b.fly) return b;
        }
        return null;
    }

    /** Walk/run to a spot on the decks (by the walking graph to another deck); true: he is there. */
    _toSpot(v, s, spot, speed, dt) {
        if (Math.abs(spot.y - v.l.y) > 1) { this._goTo(v, s, spot, speed, dt); v.mode = 'run'; return false; }
        v.fpath = null;
        const d = Math.hypot(spot.x - v.l.x, spot.z - v.l.z);
        if (d <= 0.6) return true;
        this._steer(v, s, spot.x, spot.z, d > 3 ? speed : WALK, dt);
        v.mode = d > 3 && speed >= RUN ? 'run' : 'walk';
        return false;
    }

    /** (host) The ship's foe off the ship: to the rail on his side, blades up, shouting at him. */
    _threaten(v, s, far, dt) {
        v.alert = v.alert || { t: 0 };
        v.alert.t += dt;
        v.fs = null; v.busy = false;
        const face = () => { v.lyaw = Math.atan2(-(far.x - v.l.x), -(far.z - v.l.z)); };
        if (v.role === 'captain') {
            v.mode = 'idle'; v.speed = 0; face();
            if (v.sayT <= 0 && (!s.alertT || performance.now() - s.alertT > 12000)) { s.alertT = performance.now(); this._say(v, pick(SHOUT.rally)); }
            return;
        }
        const side = far.x >= 0 ? 1 : -1;
        const spot = railNear(s.layout, side, far.z + ((v.idx % 6) - 2.5) * 1.8);
        if (spot && !this._toSpot(v, s, spot, RUN, dt)) return;
        v.mode = 'block'; v.speed = 0; face();
        if (v.sayT <= 0 && Math.random() < dt * 0.12) this._say(v, pick(SHOUT.rail));
    }

    /** The players standing on this ship (ship frame, at the feet). */
    _playersOn(s) {
        const g = this.game, out = [];
        if (this.ships.me?.ship === s && !g.isDeadLocal) { const m = this.ships.me.l; out.push({ id: g.localId, x: m.x, y: m.y - 2, z: m.z }); }
        for (const [id, r] of g.remotes || []) {
            if (r.ship !== s.id) continue;
            const q = s.pose.toLocal(r.position.x, r.position.y - 2, r.position.z, {});
            out.push({ id, x: q.x, y: q.y, z: q.z });
        }
        return out;
    }

    /**
     * A player right next to a sailor who isn't fighting him: the sailor steps back out of the reach
     * of the hands (never in the way of a spell being cast, never bumping the arm), facing him.
     */
    _makeRoom(v, s, dt) {
        const want = v.talking > 0 || v.path ? 1.5 : 1.8;
        for (const p of this._playersOn(s)) {
            if (Math.abs(p.y - v.l.y) > 2) continue;
            const dx = v.l.x - p.x, dz = v.l.z - p.z, d = Math.hypot(dx, dz);
            if (d >= want) continue;
            const ux = d > 1e-3 ? dx / d : (v.idx % 2 ? 1 : -1), uz = d > 1e-3 ? dz / d : 0;
            this._steer(v, s, p.x + ux * (want + 0.5), p.z + uz * (want + 0.5), WALK, dt);
            v.mode = 'walk';
            v.lyaw = Math.atan2(-(p.x - v.l.x), -(p.z - v.l.z)); // (backing off, facing him)
            return true;
        }
        return false;
    }

    /** The lifebuoys on their lines (the host's own and the ones it reports to the guests). */
    _drawBuoys(list) {
        const g = this.game;
        for (const v of list) {
            const b = this.auth ? v.rescue?.buoy : v.buoyNet;
            if (!b || v.dead || !g.scene?.add) { this._dropBuoy(v); continue; }
            if (!v.buoyMesh) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.2, 8, 18), new THREE.MeshLambertMaterial({ color: 0xe8541e }));
                ring.rotation.x = Math.PI / 2;
                const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xd8c8a0 }));
                line.frustumCulled = false;
                g.scene.add(ring); g.scene.add(line);
                v.buoyMesh = { ring, line };
            }
            const { ring, line } = v.buoyMesh;
            ring.position.set(b.x, b.y, b.z);
            const yaw = v.ship.st.yaw + v.lyaw;
            const pos = line.geometry.attributes.position;
            pos.setXYZ(0, v.x - Math.sin(yaw) * 0.6, v.y + 2.6, v.z - Math.cos(yaw) * 0.6);
            pos.setXYZ(1, b.x, b.y + 0.1, b.z);
            pos.needsUpdate = true;
        }
    }

    _dropBuoy(v) {
        const M = v.buoyMesh;
        if (!M) return;
        for (const o of [M.ring, M.line]) { o.parent?.remove(o); o.geometry.dispose(); o.material.dispose(); }
        v.buoyMesh = null;
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
            if (this.auth) {
                this._tactics(s, list, dt); this._separate(s, list, dt); this._chatter(s, list, dt);
                this._overboardWatch(s, list, dt);
                for (const v of list) this._ground(v, s);
            }
            this._place(s);
            this._drawBuoys(list);
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
        if (v.lev) { v.mode = 'idle'; v.speed = 0; return; } // (held up in the air by «Левиоса Максима»: it carries him)
        if (v.overboard) { this._swim(v, s, dt); return; }
        if (s.flooded) { this._overboard(v, Math.random() < 0.5 ? -1 : 1); return; }
        // knocked down, reeling, thrown up into the air: the body, not the mind
        if (v.stunT > 0 || v.vy) {
            if (v.stunT > 0) v.stunT -= dt;
            this._fall(v, s, dt);
            v.mode = 'idle'; v.speed = 0; v.busy = false;
            if (v.fs) v.fs.st = 'close';
            return;
        }
        // the foe: a hostile player aboard (or on the pier near the gangway)
        const now = performance.now();
        // a mate in the water and he is the one sent to save him (_overboardWatch): that first — the
        // fight can wait while a man drowns (unless the foe is right on him)
        if (v.rescue && !v.nsleep) {
            const fp = v.foe && this._playerLocal(s, v.foe, _l);
            if (!(fp && this._aboard(s, v.foe) && Math.hypot(fp.x - v.l.x, fp.z - v.l.z) < 3)) {
                if (v.foe) { v.foe = null; v.fp = null; v.fs = null; v.busy = false; v.tac = null; }
                this._rescueStep(v, s, dt);
                return;
            }
        }
        let foe = null, fd = Infinity, onPier = false, far = null, farD = Infinity;
        for (const [id, until] of s.hostile) {
            if (until < now) { s.hostile.delete(id); continue; }
            const p = this._playerLocal(s, id, _l);
            if (!p) continue;
            const aboard = this._aboard(s, id);
            const d = Math.hypot(p.x - v.l.x, p.z - v.l.z);
            // (the one he fights already stays his — _share decides who goes for whom)
            const k = id === v.foe ? d - 1e6 : d;
            if (aboard && k < fd) { fd = k; foe = { id, x: p.x, y: p.y, z: p.z }; onPier = false; }
            else if (!aboard && !foe && Math.hypot(p.x, p.z - s.layout.gangZ) < 30 + s.layout.B) onPier = true;
            if (!aboard && d < farD && Math.hypot(p.x, p.z) < 90) { farD = d; far = { id, x: p.x, y: p.y, z: p.z }; }
        }
        if (foe) {
            // (where he goes and when he swings: the crew's tactics, all of them together — _tactics)
            v.nsleep = null; // (asleep: up at once)
            v.foe = foe.id;
            v.fp = foe;
            v.path = null;
            return;
        }
        if (v.foe) { v.fp = null; v.fs = null; v.busy = false; v.tac = null; v.fpath = null; v.node = this._nearestNode(s, v.l); }
        v.foe = null;
        if (onPier && v.role !== 'captain') {
            // they line up at the gangway and shout
            const gw = s.layout.nodes.find((n) => n.tag === 'gangway:' + ((s.berth?.side || 1) > 0 ? '+1' : '-1')) || s.layout.nodes[0];
            if (Math.hypot(gw.x - v.l.x, gw.z - v.l.z) > 2 + v.idx * 0.4) { this._steer(v, s, gw.x - Math.sign(gw.x) * 1.5, gw.z + (v.idx % 4 - 1.5) * 1.6, RUN, dt); v.mode = 'run'; }
            else { v.mode = 'idle'; v.speed = 0; v.lyaw = gw.x > 0 ? -Math.PI / 2 : Math.PI / 2; }
            if (v.sayT <= 0 && Math.random() < dt * 0.2) this._say(v, pick(SHOUT.gang));
            return;
        }
        // the foe off the ship (in the water, on another ship, on the shore — he threw a mate over
        // the side, say): to the rail on his side, blades up, shouting at him; aboard — the fight
        if (far && !v.nsleep) { this._threaten(v, s, far, dt); return; }
        if (v.alert) { v.alert = null; v.path = null; v.fpath = null; v.node = this._nearestNode(s, v.l); }
        // the night: below asleep (the watch walks the deck) — NightLife.js
        if (g.castleLife?.night?.sailor(v, s, dt)) return;
        // a player right next to him (casting, reaching out): he steps back out of the way of the hands
        if (this._makeRoom(v, s, dt)) return;
        // talking to somebody: stand and face them
        if (v.talking > 0) {
            v.talking -= dt;
            v.mode = v.waveT > 0 ? 'cheer' : 'idle'; v.speed = 0;
            if (v.waveT > 0) v.waveT -= dt;
            const p = v.talkTo && this._playerLocal(s, v.talkTo, _l);
            if (p) v.lyaw = Math.atan2(-(p.x - v.l.x), -(p.z - v.l.z));
            return;
        }
        // jobs: walk the ship between stations, work at them
        if (v.path) {
            const n = s.layout.nodes[v.path[v.pathI]];
            if (!n) { v.path = null; return; }
            // he got lost going round something: the way again from where he stands — and if even
            // that fails, he gives that job up and finds another
            if ((v.lostT || 0) >= 3) {
                const goal = v.path[v.path.length - 1];
                v.lostT = 0; v.stuckT = 0;
                v.reroutes = (v.reroutes || 0) + 1;
                const p = v.reroutes <= 2 && this._route(s, this._nearestNode(s, v.l), goal);
                if (p) { v.path = p; v.pathI = 0; }
                else { v.path = null; v.reroutes = 0; v.node = this._nearestNode(s, v.l); v.waitT = 0.5 + Math.random(); v.mode = 'idle'; v.speed = 0; }
                return;
            }
            if (Math.hypot(n.x - v.l.x, n.z - v.l.z) < 0.6) {
                v.node = n.id;
                v.pathI++;
                if (v.pathI >= v.path.length) { v.path = null; v.reroutes = 0; v.waitT = 4 + Math.random() * 10; v.mode = n.tag?.startsWith('rig') || n.tag === 'capstan' ? 'work' : 'idle'; v.speed = 0; }
            } else { this._steer(v, s, n.x, n.z, WALK, dt); v.mode = 'walk'; }
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
    _steer(v, s, tx, tz, speed, dt) {
        const dx = tx - v.l.x, dz = tz - v.l.z;
        const d = Math.hypot(dx, dz);
        if (d < 1e-3) { v.speed = 0; return; }
        const step = Math.min(d, speed * dt);
        let ux = dx / d, uz = dz / d;
        const L = s.layout;
        // somebody in the way (a player, a mate): step round them on the side with room; in a
        // narrow spot wait a moment for them to move (and after a while squeeze past anyway)
        const others = this._others(s, v);
        if (others.length) {
            const room = (x, z) => { const f = floorAt(L, x, z, v.l.y + 1.1); return f !== null && Math.abs(f - v.l.y) < 1.2 && Math.abs(x) < hullHalfWidth(L, z, Math.max(0.2, f)) - 0.9; };
            const a = avoidStep(v.l, { x: ux, z: uz }, others, { maxF: d, room });
            if (a.wait && (v.waitT = (v.waitT || 0) + dt) < 1.6) { v.speed = 0; v.lyaw = Math.atan2(-dx, -dz); return; }
            if (!a.wait) v.waitT = 0;
            ux = a.x; uz = a.z;
        }
        // stuck against something (a bulkhead, the stair's side, a gun) and getting nowhere: he notices,
        // and goes round it — the way that frees him, keeping to it for a moment; still stuck — lost
        if (v.detourT > 0) {
            v.detourT -= dt;
            const c = Math.cos(v.detourA), sn = Math.sin(v.detourA);
            const rx = ux * c - uz * sn, rz = ux * sn + uz * c;
            ux = rx; uz = rz;
        }
        const ox = v.l.x, oz = v.l.z;
        this._dt = dt;
        let mv = this._tryMove(v, L, ux, uz, step, _m1);
        const made = mv ? Math.hypot(mv.x - ox, mv.z - oz) : 0;
        if (step > 1e-3 && made < step * 0.3) v.stuckT = (v.stuckT || 0) + dt;
        else if (made >= step * 0.6) { v.stuckT = Math.max(0, (v.stuckT || 0) - dt * 2); if (v.stuckT === 0) v.lostT = 0; }
        if ((v.stuckT || 0) > 0.35 && !(v.detourT > 0)) {
            const first = v.detourSide || (v.idx % 2 ? 1 : -1);
            const bx = dx / d, bz = dz / d;
            for (const a of [0.8, 1.6, 2.3]) {
                let found = false;
                for (const sd of [first, -first]) {
                    const ang = a * sd, c = Math.cos(ang), sn = Math.sin(ang);
                    const t = this._tryMove(v, L, bx * c - bz * sn, bx * sn + bz * c, step, _m2);
                    if (t && Math.hypot(t.x - ox, t.z - oz) > step * 0.6) {
                        v.detourA = ang; v.detourT = 0.5 + a * 0.4; v.detourSide = sd; found = true;
                        mv = _m1.set(t.x, t.y, t.z);
                        break;
                    }
                }
                if (found) break;
            }
            v.stuckT = 0.2;
            v.lostT = (v.lostT || 0) + 1;
        }
        // wedged for good (nothing above frees him for seconds): he squeezes out onto the nearest walkway
        if (step > 1e-3 && made < step * 0.2 && d > 1) v.jamT = (v.jamT || 0) + dt;
        else if (made >= step * 0.5) v.jamT = 0;
        if (v.jamT > 4) { this._toNode(v, s, true); return; }
        if (mv) { v.l.x = mv.x; v.l.y = mv.y; v.l.z = mv.z; }
        v.speed = speed;
        v.lyaw = Math.atan2(-dx, -dz);
    }

    /** Where one step (ux, uz) of `step` metres would put him (the floor, the rails, the solids), or null. */
    _tryMove(v, L, ux, uz, step, out) {
        const nx = v.l.x + ux * step, nz = v.l.z + uz * step;
        const f = floorAt(L, nx, nz, v.l.y + 1.1);
        if (f === null || f <= v.l.y - 3) return null;
        let x = nx, z = nz;
        // (feet on the step he steps onto — up a stair at once, never wading through it; a drop off an
        // edge: he keeps his height and _ground lets him fall)
        const y = f >= v.l.y - 0.6 ? f : v.l.y;
        const half = hullHalfWidth(L, z, Math.max(0.2, y)) - 0.9;
        if (Math.abs(x) > half) x = Math.sign(x) * half;
        // masts, guns, the wheel, the stairs' sides…
        for (const b of L.solids) {
            if (b.y1 <= y + 0.6 || b.y0 >= y + 3.5) continue;
            const cx = Math.max(b.x0, Math.min(b.x1, x)), cz = Math.max(b.z0, Math.min(b.z1, z));
            const ex = x - cx, ez = z - cz, ed = Math.hypot(ex, ez);
            if (ed < 0.5 && ed > 1e-4) { x = cx + (ex / ed) * 0.5; z = cz + (ez / ed) * 0.5; }
            else if (ed <= 1e-4) { x = v.l.x; z = v.l.z; } // (right inside it: no step)
        }
        return out.set(x, y, z);
    }

    // ---------------------------------------------------------- fighting
    /**
     * (host) The crew against the ones it fights on its deck: never all at once — two at a time from
     * two sides, taking turns to swing; the rest in a ring with their blades up, waiting; the tired
     * and the hurt step back and the next goes in; the captain gives the orders (CrewTactics.js).
     */
    _tactics(s, list, dt) {
        this._share(s, list);
        const groups = new Map();
        for (const v of list) {
            if (v.dead || v.overboard || !v.foe || !v.fp || v.stunT > 0 || v.vy) continue;
            (groups.get(v.foe) || groups.set(v.foe, []).get(v.foe)).push(v);
        }
        if (!groups.size) { s.fight = null; return; }
        const now = performance.now() / 1000;
        const L = s.layout;
        const mem = s.fight || (s.fight = new Map());
        for (const [foeId, group] of groups) {
            const foe = group[0].fp;
            let m = mem.get(foeId);
            if (!m) { m = { lastSwing: -1e9, orderT: 0 }; mem.set(foeId, m); }
            for (const v of group) v.busy = v.fs?.st === 'swing';
            // a spot to stand: on the foe's deck, inside the rails
            const fits = (x, z) => {
                const f = floorAt(L, x, z, foe.y + 1.6);
                return f !== null && Math.abs(f - foe.y) < 1.2 && Math.abs(x) < hullHalfWidth(L, z, Math.max(0.2, f)) - 1.0;
            };
            const narrow = hullHalfWidth(L, foe.z, Math.max(0.2, foe.y)) < 3.6 || !fits(foe.x + 2.2, foe.z) || !fits(foe.x - 2.2, foe.z);
            const res = assignRoles(group, foe, now, { fits, max: narrow ? 1 : TACTICS.MAX_ENGAGE });
            // the captain's orders: at the start, when one is sent in for another, and now and then
            const capt = group.find((v) => v.role === 'captain') || (this.crews.get(s.id) || []).find((v) => v.role === 'captain' && !v.dead && !v.overboard);
            if (capt) {
                m.orderT -= dt;
                if (!m.ordered) { m.ordered = true; m.orderT = 6; this._say(capt, pick(SHOUT.order)); }
                else if (res.swaps.length) { const w = res.swaps[0]; m.orderT = 5; this._say(capt, Math.random() < 0.5 ? `${w.in.name}, смени ${w.out.name}!` : `${w.out.name}, назад! ${w.in.name} — вперёд!`); }
                else if (m.orderT <= 0 && group.length > 2) { m.orderT = 6 + Math.random() * 5; this._say(capt, pick(SHOUT.command)); }
            }
            for (const v of res.engage) this._engage(v, s, foe, dt, now, group, m);
            for (const v of res.wait) this._ring(v, s, foe, dt, res.engage);
        }
        for (const k of [...mem.keys()]) if (!groups.has(k)) mem.delete(k);
    }

    /**
     * (host) Several on the deck against the crew: the men share them out — each foe gets his share
     * (more for the one at the wheel), a man stays on his while that one has no more than his share;
     * the captain keeps an eye on the nearest.
     */
    _share(s, list) {
        const men = list.filter((v) => !v.dead && !v.overboard && v.foe && v.fp && v.role !== 'captain');
        if (men.length < 2) return;
        const foes = [];
        const now = performance.now();
        for (const [id, until] of s.hostile) {
            if (until < now || !this._aboard(s, id)) continue;
            const p = this._playerLocal(s, id, {});
            if (p) foes.push({ id, x: p.x, y: p.y, z: p.z, w: s.helmBy === id ? 1.5 : 1 });
        }
        if (foes.length < 2) return;
        const by = new Map(foes.map((e) => [e.id, e]));
        const m = shareFoes(men.map((v) => ({ id: v.id, x: v.l.x, z: v.l.z, foe: v.foe })), foes);
        for (const v of men) {
            const id = m.get(v.id);
            if (!id || id === v.foe) continue;
            // a new foe: his place round the old one is free; he goes for this one
            v.foe = id; v.fp = by.get(id); v.tac = null; v.fs = null; v.busy = false;
        }
    }

    /** One of the two in front: step in, swing, step back, circle with the blade up, again. */
    _engage(v, s, foe, dt, now, group, m) {
        const T = TACTICS;
        const fs = v.fs || (v.fs = { st: 'close', t: 0, cd: 0.2 + Math.random() * 0.6, side: v.idx % 2 ? 1 : -1 });
        fs.t += dt; fs.cd -= dt;
        const d = Math.hypot(foe.x - v.l.x, foe.z - v.l.z);
        const face = () => { v.lyaw = Math.atan2(-(foe.x - v.l.x), -(foe.z - v.l.z)); };
        // he is on another deck (or can't get round something to him): by the walking graph first
        if ((v.lostT || 0) >= 3) { v.graphT = 3; v.lostT = 0; }
        if (v.graphT > 0) v.graphT -= dt;
        if (Math.abs(foe.y - v.l.y) > 2 || (v.graphT > 0 && d > 2.5)) { if (fs.st !== 'swing') { fs.st = 'close'; this._goTo(v, s, foe, RUN, dt); v.mode = 'run'; return; } }
        else v.fpath = null;
        switch (fs.st) {
            case 'close': {
                const p = spotAt(foe, v.tac.slot, T.STANDOFF);
                if (d > 5) { this._steer(v, s, p.x, p.z, RUN, dt); v.mode = 'run'; }
                else { this._steer(v, s, p.x, p.z, GUARD, dt); v.mode = 'block'; face(); }
                if (d < T.STANDOFF + 0.5 && fs.cd <= 0 && canSwing(group, v, now, m.lastSwing)) {
                    fs.st = 'swing'; fs.t = 0; fs.hit = false; m.lastSwing = now; v.busy = true;
                }
                break;
            }
            case 'swing':
                v.mode = 'attack'; v.speed = 0; face();
                if (!fs.hit && fs.t >= T.HIT_AT) { fs.hit = true; this._cut(v, s); }
                if (fs.t >= T.SWING) { fs.st = 'back'; fs.t = 0; v.busy = false; }
                break;
            case 'back': {
                // a step back out of his reach
                const p = spotAt(foe, Math.atan2(v.l.z - foe.z, v.l.x - foe.x), T.BACKOFF);
                this._steer(v, s, p.x, p.z, GUARD, dt); v.mode = 'block'; face();
                if (fs.t > 0.8 || d >= T.BACKOFF - 0.2) { fs.st = 'guard'; fs.t = 0; fs.dur = 0.5 + Math.random() * 1.2; }
                break;
            }
            case 'guard': {
                // round him, blade up, looking for an opening (the other way if the rail is there)
                const a = Math.atan2(v.l.z - foe.z, v.l.x - foe.x) + fs.side * 0.45;
                const p = spotAt(foe, a, T.BACKOFF);
                const f = floorAt(s.layout, p.x, p.z, foe.y + 1.6);
                if (f === null || Math.abs(p.x) > hullHalfWidth(s.layout, p.z, Math.max(0.2, f)) - 1.0) fs.side = -fs.side;
                this._steer(v, s, p.x, p.z, 1.3, dt); v.mode = 'block'; face();
                if (fs.t >= fs.dur) { fs.st = 'close'; fs.t = 0; fs.cd = 0; }
                break;
            }
        }
    }

    /** One waiting his turn: in the ring round the foe, blade up, facing him (the captain a little further). */
    _ring(v, s, foe, dt, engage) {
        v.fs = null; v.busy = false;
        if ((v.lostT || 0) >= 3) { v.graphT = 3; v.lostT = 0; }
        if (v.graphT > 0) v.graphT -= dt;
        if (Math.abs(foe.y - v.l.y) > 2 || (v.graphT > 0 && Math.hypot(foe.x - v.l.x, foe.z - v.l.z) > v.tac.r + 1)) { this._goTo(v, s, foe, RUN, dt); v.mode = 'run'; return; }
        v.fpath = null;
        let p = spotAt(foe, v.tac.slot, v.tac.r);
        // his place is on the other side: round the foe along the ring, never past his blade
        const df = Math.hypot(v.l.x - foe.x, v.l.z - foe.z), cur = Math.atan2(v.l.z - foe.z, v.l.x - foe.x);
        let da = v.tac.slot - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (df < 3.4) p = spotAt(foe, cur, v.tac.r); // (too close: first a step back out of the way)
        else if (Math.abs(da) > 0.45 && df < v.tac.r + 4) p = spotAt(foe, cur + Math.sign(da) * 0.6, Math.max(v.tac.r, Math.min(df, v.tac.r + 1.5)));
        const d = Math.hypot(p.x - v.l.x, p.z - v.l.z);
        if (d > 0.5) { const far = d > 3; this._steer(v, s, p.x, p.z, far ? RUN : WALK, dt); v.mode = far ? 'run' : 'block'; }
        else { v.speed = 0; v.mode = v.role === 'captain' ? 'idle' : 'block'; }
        if (d < 3) v.lyaw = Math.atan2(-(foe.x - v.l.x), -(foe.z - v.l.z));
        if (v.role !== 'captain' && v.sayT <= 0 && engage.length && Math.random() < dt * 0.08) this._say(v, pick(SHOUT.cheer).replace('{n}', pick(engage).name));
    }

    /** To the foe on another deck: by the walking graph (the ladders, the hatches). */
    _goTo(v, s, foe, speed, dt) {
        const N = s.layout.nodes;
        const goal = this._nearestNode(s, foe);
        if (!v.fpath || v.fpathGoal !== goal || (v.fpathT -= dt) <= 0) {
            v.fpath = this._route(s, this._nearestNode(s, v.l), goal) || [goal];
            v.fpathGoal = goal; v.fpathI = 0; v.fpathT = 1.5;
        }
        let n = N[v.fpath[v.fpathI]];
        if (n && Math.hypot(n.x - v.l.x, n.z - v.l.z) < 0.7 && Math.abs(n.y - v.l.y) < 1.5 && v.fpathI < v.fpath.length - 1) n = N[v.fpath[++v.fpathI]];
        if (!n) { this._steer(v, s, foe.x, foe.z, speed, dt); return; }
        this._steer(v, s, n.x, n.z, speed, dt);
    }

    _nearestNode(s, p) {
        const N = s.layout.nodes;
        let best = 0, bd = Infinity;
        for (let i = 0; i < N.length; i++) {
            const d = Math.hypot(N[i].x - p.x, (N[i].y - p.y) * 2, N[i].z - p.z);
            if (d < bd) { bd = d; best = i; }
        }
        return N[best]?.id ?? best;
    }

    /** The blade comes down: it cuts whoever is still within its reach in front (a step back and it misses). */
    _cut(v, s) {
        const p = this._playerLocal(s, v.foe, _l);
        if (!p) return;
        const dx = p.x - v.l.x, dz = p.z - v.l.z, d = Math.hypot(dx, dz);
        if (d > TACTICS.REACH || Math.abs(p.y - v.l.y) > 1.8) return; // (he stepped back: the blade cuts the air)
        const fx = -Math.sin(v.lyaw), fz = -Math.cos(v.lyaw);
        if (d > 0.4 && (dx * fx + dz * fz) / d < 0.3) return; // (he slipped round to the side)
        this._strike(v, s, v.foe);
    }

    /** The bodies on this deck a sailor must not walk into (ship frame): his mates and the players aboard. */
    _others(s, v) {
        const out = [];
        for (const o of this.crews.get(s.id) || []) {
            if (o === v || o.dead || o.overboard || Math.abs(o.l.y - v.l.y) > 2.5) continue;
            if (Math.abs(o.l.x - v.l.x) > 4 || Math.abs(o.l.z - v.l.z) > 4) continue;
            out.push({ x: o.l.x, z: o.l.z, r: 0.5 });
        }
        const g = this.game;
        if (this.ships.me?.ship === s) { const m = this.ships.me.l; if (Math.abs(m.y - 2 - v.l.y) < 2.5) out.push({ x: m.x, z: m.z, r: 1.1 }); } // (round a player wide: clear of his hands)
        for (const [, r] of g.remotes || []) {
            if (r.ship !== s.id) continue;
            const q = s.pose.toLocal(r.position.x, r.position.y - 2, r.position.z, _l);
            if (Math.abs(q.y - v.l.y) < 2.5) out.push({ x: q.x, z: q.z, r: 1.1 });
        }
        // (and the masts, the guns, the wheel: round them, not stuck against them)
        for (const b of s.layout.solids) {
            if (b.y1 <= v.l.y + 0.6 || b.y0 >= v.l.y + 3.5) continue;
            const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
            if (Math.abs(cx - v.l.x) > 4 || Math.abs(cz - v.l.z) > 4) continue;
            out.push({ x: cx, z: cz, r: Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 });
        }
        return out;
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
        // (let go by «Левиоса Максима» over his ship: he lands on its deck, not through it)
        if (o.top != null && !o.wet && o.vy < 0 && s.collider.hasXZ(o.x, o.z)) {
            const f = s.collider.floorAt(o.x, o.z, o.y + 0.5);
            if (f !== null && o.y + o.vy * dt <= f) {
                s.pose.toLocal(o.x, f, o.z, _o);
                v.l.x = _o.x; v.l.y = _o.y; v.l.z = _o.z;
                const d = o.gentle ? 0 : fallDrop(o.top - f);
                v.overboard = null;
                v.mode = 'idle';
                v.path = null;
                if (d) this.hit(v, d, null, o.by);
                return;
            }
        }
        o.y = Math.max(WATER_LEVEL_Y - 1.8, o.y + o.vy * dt);
        // (still flying off the side; the water stops him fast)
        if (o.vx || o.vz) {
            o.x += o.vx * dt; o.z += o.vz * dt;
            const k = Math.exp(-dt * (o.y <= WATER_LEVEL_Y - 1.7 ? 3 : 0.3));
            o.vx *= k; o.vz *= k;
            if (Math.abs(o.vx) + Math.abs(o.vz) < 0.05) o.vx = o.vz = 0;
        }
        if (o.y <= WATER_LEVEL_Y - 1.8) {
            o.vy = 0;
            if (!o.wet) {
                o.wet = true;
                const fx = this.game.fx;
                if (fx?.spark) for (let i = 0; i < 26; i++) fx.spark(_w.set(o.x, WATER_LEVEL_Y + 0.2, o.z), i % 3 ? 0xe8f6ff : 0x9fd3ea, 0.16, _v.set((Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 5), 0.9);
                this.game.sound?.playSplash?.();
            }
        }
        v.mode = 'swim';
        // the rope ladder on his side of the ship
        const ql = s.pose.toLocal(o.x, o.y, o.z, _l);
        const side = ql.x >= 0 ? 1 : -1;
        const lad = s.layout.ladders.find((l) => l.side === side) || s.layout.ladders[0];
        const lx = lad.x * 1.1, lz = lad.z;
        s.pose.toWorld(lx, 0, lz, _o);
        const dx = _o.x - o.x, dz = _o.z - o.z, d = Math.hypot(dx, dz);
        const buoy = o.wet ? this._buoyFor(v, s) : null;
        if (!buoy) { o.rope = false; o.lp = null; }
        if (o.rope) {
            // holding the buoy: hauled in on its line along the ship's side to the ladder (with the ship)
            // (where he is held in the ship's own frame: the line drags him along as the ship sails)
            const lp = o.lp || (o.lp = { x: ql.x, z: ql.z });
            const step = Math.min(1, (1.8 * dt) / Math.max(1e-3, Math.hypot(lx - lp.x, lz - lp.z)));
            lp.x += (lx - lp.x) * step; lp.z += (lz - lp.z) * step;
            s.pose.toWorld(lp.x, 0, lp.z, _o);
            o.x = _o.x; o.z = _o.z; v.speed = 1.8;
            v.lyaw = Math.atan2(-(lx - lp.x), -(lz - lp.z));
        } else if (buoy && Math.hypot(buoy.x - o.x, buoy.z - o.z) > 1.3) {
            // to the buoy thrown to him
            const bx = buoy.x - o.x, bz = buoy.z - o.z, bd = Math.hypot(bx, bz);
            o.x += (bx / bd) * 1.6 * dt; o.z += (bz / bd) * 1.6 * dt; v.speed = 1.6;
        } else if (buoy) o.rope = true;
        else if (d > 1.5 && d < 40) { o.x += (dx / d) * 1.6 * dt; o.z += (dz / d) * 1.6 * dt; v.speed = 1.6; } // (straight to the ladder)
        // (the hull is solid: in the water he goes along its side, never through it)
        if (o.y < WATER_LEVEL_Y) {
            const q = s.pose.toLocal(o.x, o.y, o.z, _l);
            const hw = hullHalfWidth(s.layout, q.z, 0) + 0.7;
            if (hw > 0.7 && Math.abs(q.x) < hw) {
                const sx = q.x >= 0 ? 1 : -1;
                if (o.lp) o.lp.x = sx * hw;
                s.pose.toWorld(sx * hw, 0, q.z, _o);
                o.x = _o.x; o.z = _o.z;
            }
        }
        const near = d < 25 && (Math.abs(s.st.u) < 1.5 || o.rope);
        if (near && d <= 1.5 && o.t > 3) {
            // up the rope ladder and back aboard
            const gw = s.layout.nodes.find((n) => n.tag === 'gangway:' + (side > 0 ? '+1' : '-1')) || s.layout.nodes.find((n) => n.tag && n.tag.startsWith('gangway')) || s.layout.nodes[0];
            v.l.x = gw.x; v.l.y = gw.y; v.l.z = gw.z; v.node = gw.id; v.vy = 0;
            v.overboard = null;
            v.mode = 'idle';
            v.path = null;
            return;
        }
        if (!near && !o.rope && o.t > 25) { this._die(v, s.lastBy); v.overboard.y = WATER_LEVEL_Y - 3; }
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
            // (a ship's deck stands well above the pier: one on the pier talks up to the sailors at the rail)
            if (d > HEAR || Math.abs(v.y - (me.y - 1.95)) > 5) continue;
            const sc = d - 2.5 * (d > 0.01 ? (dx * fx + dz * fz) / d : 1);
            if (sc < bs) { bs = sc; best = v; }
        }
        return best;
    }

    /** A sailor hears me and these are words of a talk (a greeting, a question…), not a spell. */
    claims(text) {
        if (this.game.castleLife?.talk?._echo?.(text)) return false;
        if (greetsCrew(text) && this._crewNear().length) return true; // («привет, моряки»: the crew hears it further)
        if (!this._listener()) return false;
        const spell = matchSpell(text);
        if (spell === 'Stand') return false;
        if (!spell && seaTalk(text)) return true;
        const intent = detectIntent(text).intent;
        if (spell && (intent === 'magic' || intent === 'unknown')) return false;
        return intent !== 'unknown';
    }

    /**
     * Who hears me first when I speak — a sailor (true) or somebody of a castle (a port's people stand
     * on the piers by the ships): the nearer one, the one in front.
     */
    heardFirst(talk) {
        const v = this._listener();
        if (!v) return false;
        const u = talk?.life?.enabled ? talk._listener?.() : null;
        if (!u) return true;
        const me = this.game.character.group.position;
        return Math.hypot(v.x - me.x, v.z - me.z) <= Math.hypot(u.x - me.x, u.z - me.z);
    }

    /** What a sailor answers about the sea and his ship (the castle people's brain knows nothing of it). */
    _seaReply(v, text, ctx) {
        const k = seaTalk(text);
        if (!k) return null;
        const s = v.ship;
        const capt = v.role === 'captain';
        const R = {
            where: capt ? ['Куда ветер позволит — туда и курс. Это моё дело, не твоё.', 'В открытое море. Дальше — как звёзды скажут.'] : ['Куда капитан скажет — туда и плывём.', 'В море, куда ж ещё. Курс капитан знает.'],
            join: capt ? ['В команду? Руки крепкие? Палубу драить, канаты тянуть... Подумаю.', 'Матросы мне нужны. Но сперва покажи, что не боишься качки.'] : ['В команду? Это к капитану. Он на юте, у штурвала.', 'Ха! Ты сначала канат завязать научись.'],
            captain: this.captainAlive(s) ? (capt ? ['Капитан — это я. Чего надо?'] : ['Капитан на юте, у штурвала.', 'Вон он, на корме, у штурвала стоит.']) : ['Нет у нас больше капитана...'],
            cargo: ['Не твоего ума дело, что в трюме.', 'Сухари, ром да порох. Ничего интересного.'],
            ride: ['Не пассажирское судно! Хочешь плыть — нанимайся.', 'Подвезти? Ишь чего! Хотя... спроси капитана.'],
            ship: [`Наш корабль — «${s.name}». Лучший ${String(s.cls.ru || 'корабль').toLowerCase()} в этих водах!`, `«${s.name}». Ходит быстро, стоит крепко.`],
            weather: ['Ветер переменчивый — к ночи может и задуть.', 'Море сегодня спокойное. Не к добру это.'],
            peace: ['Ладно... Опусти оружие и сойди с палубы — и чтоб без глупостей!', 'Мир так мир. Но мы с тебя глаз не спустим.'],
        };
        if (k === 'peace') {
            if (!ctx.hostile) return { reply: 'А мы и не ссорились.' };
            // (the host decides: they let it go — for now)
            if (this.auth) { s.hostile.delete(this.game.localId); for (const o of this.crews.get(s.id) || []) { o.fs = null; o.busy = false; } }
            return { reply: pick(R.peace) };
        }
        return { reply: pick(R[k]) };
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
        const talk = g.castleLife?.talk;
        if (by || talk?._echo?.(text)) return false; // (a sailor's own words from my speakers, heard by my microphone)
        const v = this._listener();
        // «привет, моряки!» — the crew round me answers together
        if (greetsCrew(text) && this._greetAll(v, talk)) return true;
        if (!v) return false;
        // asleep: a mumble first (a second word wakes him) — NightLife.js
        if (v.mode === 'sleepMat' || v.nsleep) { if (this.auth) g.castleLife?.night?.rouseSailor(v, g.localId); else g.sync?.net.send({ t: 'screw', talk: 1, id: v.id }); return true; }
        const s = v.ship;
        const ctx = {
            playerName: g.net?.active ? g.net.name : null, playerIsKing: s.owner === g.localId,
            hostile: (s.hostile.get(g.localId) || 0) > performance.now(), coins: g.inventory?.coins?.() ?? 0,
            nearbyGoods: [], heldItem: null, players: [], selfId: g.localId, following: false, danger: s.hostile.size > 0,
        };
        let res = this._seaReply(v, text, ctx);
        if (!res) try { res = this._brain(v).hear(text, ctx); } catch (e) { res = { reply: 'А? Чего?' }; }
        v.talking = 6; v.talkTo = g.localId;
        if (!this.auth) g.sync?.net.send({ t: 'screw', talk: 1, id: v.id });
        // the answer is said at once — never cut by his mates' chatter (only the one I talk with is heard)
        v.talkedAt = performance.now();
        if (talk) { talk._partner = v; talk._urgent = true; }
        try { this._say(v, res?.reply || 'Некогда мне, работать надо.', 6); } finally { if (talk) talk._urgent = false; }
        if (res?.action === 'hostile' || res?.action === 'call_guards') this.provoke(s, g.localId, '🏴 Вы разозлили матросов!');
        return true;
    }

    /**
     * «Привет, моряки!»: the sailors near me answer together — each his own short line in his own
     * voice, one after another, turning to me; some wave. (false: nobody near enough to answer)
     */
    /** Sailors near enough to hear a word called to the whole crew (not fighting, not angry at me). */
    _crewNear() {
        const g = this.game;
        const me = g.character.group.position;
        const now = performance.now();
        return [...this.byId.values()].filter((v) => !v.dead && !v.overboard && !v.foe && !((v.ship.hostile.get(g.localId) || 0) > now)
            && Math.hypot(v.x - me.x, v.z - me.z) < 14 && Math.abs(v.y - (me.y - 1.95)) < 5);
    }

    _greetAll(first, talk) {
        const g = this.game;
        const me = g.character.group.position;
        const near = this._crewNear()
            .sort((a, b) => (a === first ? -1 : b === first ? 1 : Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)))
            .slice(0, 5);
        if (!near.length) return false;
        const used = new Set();
        near.forEach((v, i) => {
            const s = v.ship;
            const pool = v.role === 'captain' ? [`Добро пожаловать на «${s.name}»!`, 'Приветствую на борту!'] : GREET[v.role] || GREET.sailor;
            const fresh = pool.filter((x) => !used.has(x));
            const line = pick(fresh.length ? fresh : pool);
            used.add(line);
            // he stops and turns to me (a wave from some of them)
            v.talking = 4 + i * 1.3; v.talkTo = g.localId; v.path = null;
            if (i % 2 === 0 && v.role !== 'captain') v.waveT = 1.4 + i * 1.3;
            if (!this.auth) g.sync?.net.send({ t: 'screw', talk: 1, id: v.id });
            // (one after another: one voice at a time — a line cut by the next would be lost)
            const say = () => {
                if (v.dead || v.overboard) return;
                v.talkedAt = performance.now();
                if (talk) { talk._partner = v; talk._urgent = i === 0; }
                try { this._say(v, line, 3); } finally { if (talk) talk._urgent = false; }
            };
            if (i === 0) say(); else setTimeout(say, i * 1300 + Math.random() * 250);
        });
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
        const bodies = [];
        for (const p of this._playersOn(s)) bodies.push({ l: p, fixed: true, id: p.id });
        for (const v of list) if (!v.dead && !v.overboard) bodies.push({ l: v.l, v });
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const A = bodies[i], B = bodies[j];
                if (A.fixed && B.fixed) continue;
                if (Math.abs(A.l.y - B.l.y) > 2.5) continue;
                let dx = B.l.x - A.l.x, dz = B.l.z - A.l.z;
                let d = Math.hypot(dx, dz);
                // (a player's body with his arms out is wider than a mate's shoulder)
                const R = A.fixed || B.fixed ? 1.2 : 1.0;
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
            const l = list.map((v) => [v.idx, Math.round(v.l.x * 100) / 100, Math.round(v.l.y * 100) / 100, Math.round(v.l.z * 100) / 100, Math.round(v.lyaw * 100) / 100, Math.max(0, MODE_CODE.indexOf(v.mode)), v.hp, Math.round(v.armor), v.dead ? 1 : 0, v.overboard ? [Math.round(v.overboard.x * 10) / 10, Math.round(v.overboard.y * 10) / 10, Math.round(v.overboard.z * 10) / 10] : 0, v.rescue?.buoy ? [Math.round(v.rescue.buoy.x * 10) / 10, Math.round(v.rescue.buoy.y * 10) / 10, Math.round(v.rescue.buoy.z * 10) / 10] : 0]);
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
            v.buoyNet = Array.isArray(a[10]) ? { x: +a[10][0] || 0, y: +a[10][1] || 0, z: +a[10][2] || 0 } : null; // (the lifebuoy he threw)
        }
    }

    /** (host) a guest talks to a sailor: he stops and faces them. */
    remoteTalk(m) {
        const v = this.byId.get(m.id);
        if (v && !v.dead && this.game.castleLife?.night?.rouseSailor(v, m.from)) return; // (asleep: a mumble first)
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

// a sailor is a creature like any other: blows, gusts of «Вайнд», blasts and spells shove him, he
// reels, falls, gets up by himself (CreatureImpact.js) — on his ship's deck, in its own frame
registerKind('c', {
    name: 'sailor', faces: -1,
    list: (g) => (g.ships ? [...g.ships.crew.byId.values()] : []),
    get: (g, id) => g.ships?.crew.byId.get(id),
    alive: (c) => !c.dead && !c.overboard,
    body: (c) => (c.role === 'captain' ? 'knight' : 'person'),
    centre: (c, out) => out.set(c.x, c.y + 2.6, c.z),
    pivot: (c) => ({ obj: c.model.root, base: c.model.root.userData.impBase ?? (c.model.root.userData.impBase = c.model.root.position.y), lie: 0.5 }),
    head: (c) => c.model.head, arms: (c) => [c.model.leftArm, c.model.rightArm], legs: (c) => [c.model.leftLeg, c.model.rightLeg],
    move(g, c, dx, dz) { g.ships?.crew.shove(c, dx, dz); },
    toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy); },
    hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, t); c.mode = 'idle'; c.speed = 0; },
    frozen: () => false,
    struck(g, c, o) { if (o.by) c.hitBy = { id: o.by === 'local' ? g.localId : o.by, t: performance.now() }; if (o.by) g.ships?.crew.provoke(c.ship, o.by === 'local' ? g.localId : o.by, '🏴 Вы напали на матроса — команда к бою!'); },
});
