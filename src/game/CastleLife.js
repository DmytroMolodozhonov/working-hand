/**
 * CastleLife.js — the people of the castles.
 *
 * Each castle (src/world/Castles.js) has its people: a king on the throne,
 * knights at the gate, round the throne, on the walls and in the yard,
 * merchants at the market stalls, farmers in the fields, builders and
 * townsfolk walking between the houses, the market, the well and the castle.
 * A castle of 1000 does not run 1000 people: it shows a crowd round you (more
 * people near you, they come out of houses and go back in), so it feels like
 * a big town — every villager is still someone: a name, a role, a home, the
 * same look every time.
 *
 * Nobody touches you while you behave. Hurt a villager or a knight where
 * someone sees it (or the victim lives to tell) and the castle turns on you:
 * knights who saw it attack, the people run and shout for the guard. Hit
 * the king and every knight of the castle comes running. Knights and the
 * king wear armour: 50 (the king 100) armour points take most of a blow, so
 * their hearts go down many times slower. Kill the king and the castle is
 * yours: the people bow, the knights obey, the chests open.
 *
 * Multiplayer: the host runs the people (who goes where, who fights whom);
 * guests show them and send their hits.
 */

import * as THREE from 'three';
import { VillagerModel, villagerLook, VILLAGER_FOOT_OFFSET, VILLAGER_SIT_OFFSET } from '../entities/VillagerModel.js';
import { SpeechBubble } from '../ui/SpeechBubble.js';
import { Chest } from '../entities/Chest.js';
import { createRng } from '../core/math.js';
import { CastleTalk } from './CastleTalk.js';

const WAKE = 90; // m beyond the castle land: its people appear
const SLEEP = 140;
const SEE = 32; // m: villagers see violence this far (with a free line of sight)
const VIEW = 92; // m: farther villagers are not drawn
const WALK = 2.3, RUN = 5.6;
const HOSTILE_MS = 180000;
const HEAR_BOOM = 110; // m: a blast is heard this far (the guards come to look)
export const STATS = {
    builder: { hp: 8, armor: 0, dmg: 1 },
    farmer: { hp: 8, armor: 0, dmg: 1 },
    merchant: { hp: 8, armor: 0, dmg: 1 },
    knight: { hp: 20, armor: 50, dmg: 3 },
    king: { hp: 30, armor: 100, dmg: 5 },
};
export const ROLE_NAMES = { builder: 'Строитель', farmer: 'Фермер', merchant: 'Торговец', knight: 'Рыцарь', king: 'Король' };
const ROLE_NAMES_F = { builder: 'Строительница', farmer: 'Фермерша', merchant: 'Торговка', knight: 'Рыцарь', king: 'Король' };
const MALE = ['Иван', 'Пётр', 'Фёдор', 'Михаил', 'Григорий', 'Степан', 'Яков', 'Тимофей', 'Матвей', 'Савелий', 'Никита', 'Еремей', 'Захар', 'Остап', 'Богдан', 'Мирон', 'Лука', 'Демьян', 'Филипп', 'Аким', 'Гордей', 'Игнат', 'Кузьма', 'Прохор', 'Тарас', 'Ефим', 'Арсений', 'Любомир', 'Ратибор', 'Всеслав'];
const FEMALE = ['Мария', 'Анна', 'Дарья', 'Агафья', 'Василиса', 'Марфа', 'Ульяна', 'Евдокия', 'Аксинья', 'Пелагея', 'Олеся', 'Любава', 'Злата', 'Милана', 'Забава', 'Настасья', 'Варвара', 'Фёкла', 'Ярослава', 'Дуняша'];

// what people shout (the conversation brain adds much more when you talk to them)
const SHOUT = {
    help: ['Помогите!', 'Стража! Стража!', 'Убивают!', 'Спасите!', 'А-а-а! Беги!'],
    knight: ['Стой, негодяй!', 'Именем короля!', 'К оружию!', 'Ты за это ответишь!', 'Взять его!'],
    king: ['Стража! Ко мне!', 'Как ты смеешь?!', 'Рыцари! Защитите своего короля!'],
    hurt: ['Ай!', 'За что?!', 'Ох...', 'Больно же!'],
    bow: ['Ваше Величество!', 'Да здравствует король!', 'Слава новому королю!', 'Добро пожаловать, повелитель!'],
    boom: ['Что это было?!', 'Взрыв! Бегите!', 'Стену ломают!', 'Спасайтесь!', 'Стража! Тут колдун!'],
    investigate: ['Что там грохнуло? За мной!', 'К стене, живо!', 'Кто посмел?! Проверить!'],
    wrecker: ['Вот он, разрушитель!', 'Держи колдуна!', 'Ты сломал нашу стену — ответишь!', 'Взять его, он ломает замок!'],
    captured: ['Король пал! Да здравствует новый король!', 'Мы служим вам, Ваше Величество!'],
    ambient: {
        merchant: ['Свежий хлеб! Подходи!', 'Яблоки, сыр, мясо — всё свежее!', 'Покупайте, не стесняйтесь!', 'Кладите товар на прилавок — куплю!'],
        farmer: ['Урожай нынче хороший...', 'Опять дождя ждём.', 'Эх, спина болит...', 'Пшеница поспела!'],
        builder: ['Стену чинить надо...', 'Где мой молоток?', 'Ещё один дом к зиме поставим.', 'Камня бы побольше.'],
        knight: ['Всё спокойно.', 'Служу королю!', 'Не шали тут.', 'Ночью опять зомби полезут...'],
        king: ['Мой замок — моя крепость.', 'Кто посмел нарушить тишину?', 'Казна сама себя не наполнит.'],
    },
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** Who is villager number `idx` of a castle (always the same). */
export function rosterEntry(def, idx) {
    const seed = (strHash(def.id) ^ Math.imul(idx + 1, 2654435761)) >>> 0;
    const rng = createRng(seed);
    let role;
    const merchants0 = def.knights + 1;
    if (idx === 0) role = 'king';
    else if (idx <= def.knights) role = 'knight';
    else if (idx < merchants0 + def.stalls.length) role = 'merchant';
    else { const r = rng(); role = r < 0.45 ? 'farmer' : r < 0.85 ? 'builder' : 'merchant'; }
    const female = role === 'king' ? false : rng() < (role === 'knight' ? 0.15 : 0.5);
    const name = role === 'king' ? def.king : (female ? FEMALE : MALE)[Math.floor(rng() * (female ? FEMALE : MALE).length)];
    const home = def.houses.length ? Math.floor(rng() * def.houses.length) : -1;
    const stall = role === 'merchant' && idx < merchants0 + def.stalls.length ? idx - merchants0 : -1;
    return { idx, role, female, name, home, stall, seed };
}

export function roleTitle(e) {
    return (e.female ? ROLE_NAMES_F : ROLE_NAMES)[e.role];
}

// --------------------------------------------------------------- graph
class Graph {
    constructor(def) {
        this.nodes = def.nodes;
        this.adj = def.nodes.map(() => []);
        for (const [a, b] of def.edges) { this.adj[a].push(b); this.adj[b].push(a); }
        this.byTag = new Map();
        for (const n of def.nodes) {
            if (!n.tag) continue;
            const key = n.tag.startsWith('room:') ? 'room' : n.tag;
            (this.byTag.get(key) || this.byTag.set(key, []).get(key)).push(n.id);
            if (key === 'room') (this.byTag.get(n.tag) || this.byTag.set(n.tag, []).get(n.tag)).push(n.id);
        }
    }

    tagged(tag) { return this.byTag.get(tag) || []; }

    /** The node nearest to a point (on about the same floor). */
    nearest(x, y, z, maxDy = 2.5) {
        let best = -1, bd = Infinity;
        for (const n of this.nodes) {
            if (Math.abs(n.y - y) > maxDy) continue;
            const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
            if (d < bd) { bd = d; best = n.id; }
        }
        return best;
    }

    /** A* from node a to node b → list of node ids (or null). */
    path(a, b) {
        if (a < 0 || b < 0) return null;
        if (a === b) return [a];
        const N = this.nodes;
        const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].y - N[b].y, N[i].z - N[b].z);
        const g = new Map([[a, 0]]), from = new Map();
        const open = [[h(a), a]];
        const closed = new Set();
        while (open.length) {
            let bi = 0;
            for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
            const [, cur] = open[bi];
            open[bi] = open[open.length - 1]; open.pop();
            if (cur === b) {
                const out = [b];
                let c = b;
                while (from.has(c)) { c = from.get(c); out.push(c); }
                return out.reverse();
            }
            if (closed.has(cur)) continue;
            closed.add(cur);
            for (const nb of this.adj[cur]) {
                const ng = g.get(cur) + Math.hypot(N[cur].x - N[nb].x, N[cur].y - N[nb].y, N[cur].z - N[nb].z);
                if (ng < (g.get(nb) ?? Infinity)) { g.set(nb, ng); from.set(nb, cur); open.push([ng + h(nb), nb]); }
            }
        }
        return null;
    }
}

// --------------------------------------------------------------- the system
export class CastleLife {
    constructor(game) {
        this.game = game;
        this.castles = new Map(); // id -> runtime {def, graph, awake, active: Map(idx -> v), state, chests}
        this.byId = new Map(); // villager id -> v
        this.states = new Map(); // castle id -> saved state {owner, ownerName, kingDead, killed:Set}
        this._scanT = 0;
        this._netT = 0;
        this._chatT = 4;
        this._lockMsgT = 0;
        this.enabled = !game.config.map && game.config.mode !== 'test';
        this.talk = new CastleTalk(game, this); // conversations and the market
        this.brainLine = (v) => this.talk.ambientLine(v);
    }

    get auth() { return this.game.authority; }
    get index() { return this.game.world?.terrain?.data?.castles || null; }

    state(id) {
        let s = this.states.get(id);
        if (!s) { s = { owner: null, ownerName: null, kingDead: false, killed: new Set() }; this.states.set(id, s); }
        return s;
    }

    _runtime(def) {
        let cs = this.castles.get(def.id);
        if (!cs) {
            cs = { def, graph: new Graph(def), awake: false, active: new Map(), hostile: new Map(), chests: [], spawnT: 0, reinforced: 0 };
            this.castles.set(def.id, cs);
        }
        return cs;
    }

    // ---------------------------------------------------------- players
    _players() {
        const g = this.game;
        const out = [];
        if (!g.isDeadLocal && !g.combat?.dead) out.push({ id: g.localId, p: g.character.group.position });
        for (const [id, r] of g.remotes) if (!r.dead) out.push({ id, p: r.position });
        return out;
    }

    _playerPos(id) {
        const g = this.game;
        if (id === g.localId || id === 'local') return g.isDeadLocal || g.combat?.dead ? null : g.character.group.position;
        const r = g.remotes.get(id);
        return r && !r.dead ? r.position : null;
    }

    _inLand(def, p, extra = 0) {
        return Math.max(Math.abs(p.x - def.x), Math.abs(p.z - def.z)) <= def.zone + extra;
    }

    // ---------------------------------------------------------- villagers
    _activate(cs, idx, at, job, extra = {}) {
        const def = cs.def;
        if (cs.active.has(idx) || this.state(def.id).killed.has(idx)) return null;
        const e = rosterEntry(def, idx);
        const look = villagerLook(e.seed, e.role, e.female, { castleColor: def.color });
        const model = new VillagerModel(look, { castleColor: def.color });
        this.game.scene.add(model.group);
        const S = STATS[e.role];
        const v = {
            id: def.id + ':' + idx, cs, idx, entry: e, role: e.role, name: e.name, title: roleTitle(e),
            model, group: model.group, isVillager: true,
            hp: extra.hp ?? S.hp, armor: extra.armor ?? S.armor, maxHp: S.hp, maxArmor: S.armor,
            dead: false, get isDead() { return this.dead; }, damageCooldown: 0, removable: false,
            x: at.x, y: at.y, z: at.z, yaw: at.yaw ?? 0, mode: 'idle', speed: 0,
            job, post: extra.post || null, path: null, pathI: 0, waitT: 0, trips: 0,
            foe: null, fleeFrom: null, fleeT: 0, sayT: 0, bowT: 0, barT: 0, hitT: 0,
            walk: WALK * (0.72 + ((e.seed >>> 4) % 100) / 220), lane: (((e.seed >>> 11) % 100) / 100 - 0.5) * 2.6,
            bubble: null, bar: null, net: null,
        };
        v.group.position.set(v.x, v.y + VILLAGER_FOOT_OFFSET, v.z);
        v.group.rotation.y = v.yaw;
        cs.active.set(idx, v);
        this.byId.set(v.id, v);
        return v;
    }

    _deactivate(v) {
        const cs = v.cs;
        cs.active.delete(v.idx);
        this.byId.delete(v.id);
        v.removable = true;
        v.model.dispose();
        if (v.bubble) { this.game.scene.remove(v.bubble.sprite); v.bubble.dispose(); }
        if (v.bar) { this.game.scene.remove(v.bar.sprite); v.bar.tex.dispose(); v.bar.sprite.material.dispose(); }
    }

    /** All living villagers near the local player (targets for weapons and fists). */
    targets() {
        const out = [];
        const me = this.game.character.group.position;
        for (const v of this.byId.values()) if (!v.dead && Math.abs(v.x - me.x) < 40 && Math.abs(v.z - me.z) < 40) out.push(v);
        return out;
    }

    // ------------------------------------------------------- wake / sleep
    _scan() {
        const idx = this.index;
        if (!idx) return;
        const players = this._players();
        const seen = new Set();
        for (const pl of players) {
            for (const def of idx.near(pl.p.x, pl.p.z, WAKE)) {
                seen.add(def.id);
                const cs = this._runtime(def);
                if (!cs.awake) this._wake(cs);
            }
        }
        for (const cs of this.castles.values()) {
            if (!cs.awake || seen.has(cs.def.id)) continue;
            const far = players.every((pl) => Math.max(Math.abs(pl.p.x - cs.def.x), Math.abs(pl.p.z - cs.def.z)) > cs.def.zone + SLEEP);
            if (far) this._sleep(cs);
        }
    }

    _wake(cs) {
        cs.awake = true;
        this._makeChests(cs);
        if (!this.auth) return;
        const def = cs.def;
        const st = this.state(def.id);
        let k = 1; // knights by number
        const knight = (at, job, post) => { while (k <= def.knights && (st.killed.has(k) || cs.active.has(k))) k++; if (k > def.knights) return null; return this._activate(cs, k++, at, job, { post }); };
        // the king on his throne
        if (!st.kingDead) this._activate(cs, 0, def.throne, 'king', { post: def.throne });
        // two knights by the throne, guards at the gate, two on the walls, two in the yard
        const tf = def.throneFront;
        for (const side of [-1, 1]) {
            const g = cs.graph.nodes[cs.graph.tagged('throneFront')[0]];
            const sx = Math.cos(def.throne.yaw) * 4 * side, sz = -Math.sin(def.throne.yaw) * 4 * side;
            const at = { x: (g ? g.x : tf.x) + sx, y: tf.y, z: (g ? g.z : tf.z) + sz, yaw: def.throne.yaw };
            knight(at, 'guard', at);
        }
        for (const post of def.posts) knight(post, 'guard', post);
        const loop = def.wallWalk || [];
        for (let i = 0; i < Math.min(2, Math.floor(loop.length / 6)); i++) {
            const n = cs.graph.nodes[loop[Math.floor(i * loop.length / 2)]];
            const v = knight({ x: n.x, y: n.y, z: n.z }, 'patrol');
            if (v) v.loopI = Math.floor(i * loop.length / 2);
        }
        for (const id of cs.graph.tagged('yard').concat(cs.graph.tagged('well')).slice(0, 2)) {
            const n = cs.graph.nodes[id];
            knight({ x: n.x, y: n.y, z: n.z }, 'yard');
        }
        // the merchants at their stalls
        def.stalls.forEach((s, i) => this._activate(cs, def.knights + 1 + i, { ...s.back, yaw: s.yaw }, 'stall', { post: { ...s.back, yaw: s.yaw } }));
        // farmers in a few fields
        let f = 0;
        for (const field of def.fields.slice(0, 4)) {
            const idx = this._freeCommoner(cs, 'farmer');
            if (idx < 0) break;
            const v = this._activate(cs, idx, { x: field.x, y: field.y, z: field.z }, 'farm');
            if (v) { v.fieldNode = field.node; f++; }
        }
    }

    _sleep(cs) {
        cs.awake = false;
        for (const v of [...cs.active.values()]) this._deactivate(v);
    }

    _makeChests(cs) {
        const g = this.game;
        if (cs.chestsMade) return;
        cs.chestsMade = true;
        const st = this.state(cs.def.id);
        for (const c of cs.def.chests) {
            if (g.chests.some((x) => x.id === c.id)) continue;
            const chest = new Chest(g.scene, new THREE.Vector3(c.x, c.y + 0.5, c.z), 'loot', c.yaw, c.id);
            chest.mesh.updateMatrixWorld(true);
            chest.boxId = g.collision.addBox(chest.getCollisionBox());
            chest.locked = !st.kingDead;
            chest.castle = cs.def;
            chest.room = c.room;
            g.chests.push(chest);
            if (g._openedChests?.has(c.id)) chest.setOpenInstant();
            cs.chests.push(chest);
        }
    }

    /** A roster number of a commoner of the wanted role who is not out now. */
    _freeCommoner(cs, role = null) {
        const def = cs.def;
        const st = this.state(def.id);
        const first = def.knights + 1 + def.stalls.length;
        const n = Math.max(first + 1, def.population);
        for (let tries = 0; tries < 30; tries++) {
            const idx = first + Math.floor(Math.random() * (n - first));
            if (cs.active.has(idx) || st.killed.has(idx)) continue;
            if (role && rosterEntry(def, idx).role !== role) continue;
            return idx;
        }
        return -1;
    }

    /** Keep a crowd round the players: people come out of houses and go about. */
    _crowd(cs, dt) {
        const def = cs.def;
        cs.spawnT -= dt;
        if (cs.spawnT > 0) return;
        cs.spawnT = 0.7;
        const players = this._players().filter((pl) => this._inLand(def, pl.p, 40));
        if (!players.length) return;
        // (a weaker computer — fewer people round you; fewer at night)
        const q = [0.45, 0.65, 0.85, 1][this.game.quality?.level ?? 3] ?? 1;
        const want = Math.round(Math.min(22, 7 + def.population / 55) * (this.game.isNight ? 0.35 : 1) * q);
        let count = 0;
        for (const v of cs.active.values()) if (v.job === 'wander' && !v.dead) count++;
        // too far from everyone: goes home (disappears)
        for (const v of [...cs.active.values()]) {
            if (v.job !== 'wander' || v.foe) continue;
            const near = players.some((pl) => Math.hypot(pl.p.x - v.x, pl.p.z - v.z) < 100);
            if (!near) { this._deactivate(v); count--; }
        }
        if (count >= want) return;
        // someone comes out of a house (or walks in along a road) 25-70 m away from a player
        const pl = players[Math.floor(Math.random() * players.length)];
        const homes = cs.graph.tagged('home');
        let node = -1;
        for (let t = 0; t < 12; t++) {
            const id = homes[Math.floor(Math.random() * homes.length)];
            const n = cs.graph.nodes[id];
            const d = Math.hypot(n.x - pl.p.x, n.z - pl.p.z);
            if (d > 22 && d < 70) { node = id; break; }
        }
        if (node < 0) return;
        const idx = this._freeCommoner(cs);
        if (idx < 0) return;
        const n = cs.graph.nodes[node];
        const v = this._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'wander');
        if (v) {
            v.node = node; v.trips = 1 + Math.floor(Math.random() * 3);
            // some come out and stand at the door a while first (not everybody marching at once)
            if (Math.random() < 0.45) v.waitT = 4 + Math.random() * 14; else this._nextTrip(v);
        }
    }

    // ------------------------------------------------------------ moving
    _goTo(v, node) {
        const g = v.cs.graph;
        const from = v.node != null && v.node >= 0 && Math.hypot(g.nodes[v.node].x - v.x, g.nodes[v.node].z - v.z) < 3 ? v.node : g.nearest(v.x, v.y, v.z);
        const path = g.path(from, node);
        v.path = path;
        v.pathI = 0;
        v.goal = node;
        return !!path;
    }

    /** A wanderer picks where to go next (or goes home at the end). */
    _nextTrip(v) {
        const g = v.cs.graph;
        if (v.trips <= 0) { v.goingHome = true; this._goTo(v, this._homeNode(v)); return; }
        v.trips--;
        const r = Math.random();
        const choose = (tag) => { const l = g.tagged(tag); return l.length ? l[Math.floor(Math.random() * l.length)] : -1; };
        let node = -1;
        // people go to people: join somebody standing about (a chat)
        if (r < 0.3) {
            const idle = [...v.cs.active.values()].filter((o) => o !== v && !o.dead && o.job === 'wander' && o.waitT > 6 && Math.hypot(o.x - v.x, o.z - v.z) < 60);
            if (idle.length) {
                const o = idle[Math.floor(Math.random() * idle.length)];
                const n = g.nearest(o.x, o.y, o.z);
                if (n >= 0) { v.purpose = 'chat'; v.chatWith = o; this._goTo(v, n); return; }
            }
        }
        if (v.role === 'farmer' && r < 0.5) node = choose('field');
        else if (r < 0.32) node = choose('stall');
        else if (r < 0.42) node = choose('market');
        else if (r < 0.5) node = choose('well');
        else if (r < 0.6) node = choose('yard');
        else if (r < 0.68) node = choose('room');
        else node = choose('home');
        if (node < 0) node = choose('home');
        v.purpose = g.nodes[node]?.tag || '';
        this._goTo(v, node);
    }

    _homeNode(v) {
        const homes = v.cs.graph.tagged('home');
        return homes.length ? homes[Math.abs(v.entry.home) % homes.length] : v.cs.graph.nearest(v.x, v.y, v.z);
    }

    /** One step along the path; true when the end is reached. */
    _followPath(v, dt, speed) {
        const g = v.cs.graph;
        if (!v.path || v.pathI >= v.path.length) return true;
        const n = g.nodes[v.path[v.pathI]];
        // outdoors everybody keeps to their own side of the road (no walking in single file);
        // in the castle, doors and rooms — right along the path
        let tx = n.x, tz = n.z;
        const last = v.pathI >= v.path.length - 1;
        if (v.lane && !last && v.pathI > 0 && !this._inWalls(v.cs.def, n)) {
            const pn = g.nodes[v.path[v.pathI - 1]];
            const sx = n.x - pn.x, sz = n.z - pn.z, sl = Math.hypot(sx, sz);
            if (sl > 3 && Math.abs(n.y - pn.y) < 0.5) { tx += -sz / sl * v.lane; tz += sx / sl * v.lane; }
        }
        const dx = tx - v.x, dz = tz - v.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) { v.node = v.path[v.pathI]; v.pathI++; return v.pathI >= v.path.length; }
        const s = Math.min(d, speed * dt);
        v.x += dx / d * s; v.z += dz / d * s;
        v.yaw = turn(v.yaw, Math.atan2(-dx, -dz), dt * 8);
        v.speed = speed;
        return false;
    }

    /** Inside the castle walls (where paths are narrow: doors, stairs, rooms). */
    _inWalls(def, p) {
        const w = def.walls;
        return p.x >= w.x0 - 2 && p.x <= w.x1 + 2 && p.z >= w.z0 - 2 && p.z <= w.z1 + 2;
    }

    /** Straight towards a point (a fight); stops at walls. */
    _steer(v, tx, tz, speed, dt, stopAt = 0) {
        const dx = tx - v.x, dz = tz - v.z;
        const d = Math.hypot(dx, dz);
        v.yaw = turn(v.yaw, Math.atan2(-dx, -dz), dt * 10);
        if (d <= stopAt) { v.speed = 0; return d; }
        const s = Math.min(d - stopAt, speed * dt);
        const nx = v.x + dx / d * s, nz = v.z + dz / d * s;
        if (this._walkable(nx, nz, v.y)) { v.x = nx; v.z = nz; v.speed = speed; }
        else if (this._walkable(nx, v.z, v.y)) { v.x = nx; v.speed = speed; }
        else if (this._walkable(v.x, nz, v.y)) { v.z = nz; v.speed = speed; }
        else v.speed = 0;
        return d;
    }

    _walkable(x, z, y) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const ix = Math.round(x), iz = Math.round(z);
        const L = Math.round(y + 1.5);
        const f = t.floorBelow(ix, iz, L + 1);
        if (f > L || f < L - 3) return false;
        return !t.solidIn(ix, iz, f + 1, f + 5);
    }

    _ground(v) {
        const c = this.game.collision;
        const gy = c.groundAt ? c.groundAt(v.x, v.z, v.y + 1.1) : c.groundY(v.x, v.z);
        v.y += (gy - v.y) * (gy > v.y ? 1 : 0.5);
    }

    // ------------------------------------------------------------- think
    _think(v, dt) {
        const g = this.game;
        const cs = v.cs;
        v.damageCooldown -= dt;
        v.sayT -= dt;
        if (v.dead) { v.deadT = (v.deadT || 0) + dt; if (v.deadT > 50) this._deactivate(v); return; }
        // stunned / frozen / thrown up by a spell
        if (v.stunT > 0 || v.vy) {
            v.stunT = (v.stunT || 0) - dt;
            if (v.vy) {
                v.y += v.vy * dt; v.vy -= 22 * dt;
                const gy = g.collision.groundAt ? g.collision.groundAt(v.x, v.z, v.y + 1.1) : g.collision.groundY(v.x, v.z);
                if (v.y <= gy && v.vy < 0) { v.y = gy; v.vy = 0; }
            }
            v.mode = 'idle'; v.speed = 0;
            return;
        }
        // a hostile player in sight: knights go for them
        if ((v.role === 'knight' || v.role === 'king') && !v.foe) {
            v.lookT = (v.lookT || 0) - dt;
            if (v.lookT <= 0) {
                v.lookT = 0.6;
                for (const [pid, until] of cs.hostile) {
                    if (until < Date.now()) { cs.hostile.delete(pid); continue; }
                    const p = this._playerPos(pid);
                    if (p && Math.hypot(p.x - v.x, p.z - v.z) < 26 && this._sees(v, p)) { v.foe = pid; this._say(v, pick(SHOUT.knight)); break; }
                }
            }
        }
        if (v.foe) { this._fight(v, dt); return; }
        if (v.investigate && this._investigate(v, dt)) return;
        if (v.fleeT > 0) {
            v.fleeT -= dt;
            const fp = v.fleeFrom ? this._playerPos(v.fleeFrom) : null;
            // run away along the paths: to a place far from the attacker (home, the gate, the market…)
            if (!v.fleeing && fp) {
                v.fleeing = true;
                const g2 = cs.graph;
                let best = -1, bs = -Infinity;
                for (let k = 0; k < 16; k++) {
                    const n = g2.nodes[Math.floor(Math.random() * g2.nodes.length)];
                    if (Math.abs(n.y - v.y) > 6) continue;
                    const away = Math.hypot(n.x - fp.x, n.z - fp.z), mine = Math.hypot(n.x - v.x, n.z - v.z);
                    const s = away - 0.4 * mine + (n.tag === 'home' ? 15 : 0);
                    if (away > 25 && s > bs) { bs = s; best = n.id; }
                }
                if (best >= 0) this._goTo(v, best);
            }
            if (v.path && v.pathI < (v.path?.length || 0)) this._followPath(v, dt, RUN);
            else if (fp && Math.hypot(fp.x - v.x, fp.z - v.z) < 10) this._steer(v, v.x + (v.x - fp.x), v.z + (v.z - fp.z), RUN, dt);
            else v.speed = 0;
            v.mode = v.speed > 0 ? 'flee' : 'idle';
            this._ground(v);
            if (v.fleeT <= 0) { v.fleeFrom = null; v.fleeing = false; v.path = null; if (v.job === 'wander') this._nextTrip(v); }
            return;
        }
        // the new king comes by: bow
        const st = this.state(cs.def.id);
        if (st.owner && v.bowT <= 0) {
            const op = this._playerPos(st.owner);
            if (op && Math.hypot(op.x - v.x, op.z - v.z) < 6) {
                v.bowT = 40;
                v.bowing = 1.6;
                v.yaw = Math.atan2(-(op.x - v.x), -(op.z - v.z));
                this._say(v, pick(SHOUT.bow));
            }
        }
        v.bowT -= dt;
        if (v.bowing > 0) { v.bowing -= dt; v.mode = 'bow'; v.speed = 0; return; }
        // talking with a player: stops and looks at them (the king keeps his seat)
        if (v.talking > 0 && v.job !== 'king') {
            const tp = this._playerPos(v.talkTo || g.localId);
            if (tp) v.yaw = turn(v.yaw, Math.atan2(-(tp.x - v.x), -(tp.z - v.z)), dt * 6);
            v.mode = 'talk'; v.speed = 0;
            this._ground(v);
            return;
        }
        // following a player who asked («иди за мной»)
        if (v.follow) {
            v.followT -= dt;
            const fp = this._playerPos(v.follow);
            if (!fp || v.followT <= 0 || !this._inLand(cs.def, fp, 20)) { v.follow = null; v.path = null; }
            else {
                const d = this._steer(v, fp.x, fp.z, Math.hypot(fp.x - v.x, fp.z - v.z) > 8 ? RUN : WALK, dt, 3);
                v.mode = d > 3.2 ? (v.speed > WALK ? 'run' : 'walk') : 'idle';
                this._ground(v);
                return;
            }
        }
        switch (v.job) {
            case 'king':
            case 'guard':
            case 'stall': {
                const p = v.post;
                const d = Math.hypot(p.x - v.x, p.z - v.z);
                if (d > 1.5) {
                    if (!v.path) this._goTo(v, v.cs.graph.nearest(p.x, p.y, p.z));
                    if (this._followPath(v, dt, WALK)) { v.path = null; this._steer(v, p.x, p.z, WALK, dt); }
                    v.mode = 'walk';
                } else {
                    v.x += (p.x - v.x) * Math.min(1, dt * 4); v.z += (p.z - v.z) * Math.min(1, dt * 4);
                    v.yaw = turn(v.yaw, p.yaw, dt * 4);
                    v.speed = 0;
                    v.path = null;
                    v.mode = v.job === 'king' ? 'sit' : v.talking > 0 ? 'talk' : 'idle';
                    if (v.job === 'king') { v.y = p.y; v.seated = true; return; }
                }
                v.seated = false;
                break;
            }
            case 'patrol': {
                const loop = v.cs.def.wallWalk;
                if (!v.path || v.pathI >= v.path.length) {
                    v.loopI = ((v.loopI ?? 0) + 1) % loop.length;
                    this._goTo(v, loop[v.loopI]);
                }
                this._followPath(v, dt, WALK * 0.8);
                v.mode = 'walk';
                break;
            }
            case 'yard': {
                if (v.waitT > 0) { v.waitT -= dt; v.mode = 'idle'; v.speed = 0; break; }
                if (!v.path || this._followPath(v, dt, WALK * 0.8)) {
                    if (v.path) { v.waitT = 4 + Math.random() * 8; v.path = null; break; }
                    const g2 = v.cs.graph;
                    const options = g2.tagged('yard').concat(g2.tagged('well'), g2.tagged('gateIn'), g2.tagged('keepDoor'), g2.tagged('barracksDoor'));
                    this._goTo(v, options[Math.floor(Math.random() * options.length)]);
                }
                v.mode = v.path ? 'walk' : 'idle';
                break;
            }
            case 'farm': {
                if (v.waitT > 0) { v.waitT -= dt; v.mode = 'work'; v.speed = 0; break; }
                if (!v.path) {
                    const fields = v.cs.graph.tagged('field');
                    this._goTo(v, fields[Math.floor(Math.random() * fields.length)]);
                }
                if (this._followPath(v, dt, WALK)) { v.path = null; v.waitT = 15 + Math.random() * 25; }
                v.mode = v.path ? 'walk' : 'work';
                break;
            }
            default: { // wander
                if (v.waitT > 0) {
                    v.waitT -= dt;
                    v.speed = 0;
                    // somebody close by: they talk (turned to each other, hands going)
                    v.chatT = (v.chatT || 0) - dt;
                    if (v.chatT <= 0) {
                        v.chatT = 1.5;
                        v.mate = null;
                        for (const o of v.cs.active.values()) if (o !== v && !o.dead && !o.foe && Math.hypot(o.x - v.x, o.z - v.z) < 4.5 && (o.waitT > 0 || o.job !== 'wander')) { v.mate = o; break; }
                    }
                    if (v.mate) v.yaw = turn(v.yaw, Math.atan2(-(v.mate.x - v.x), -(v.mate.z - v.z)), dt * 3);
                    v.mode = v.talking > 0 || v.mate ? 'talk' : v.purpose === 'field' ? 'work' : (v.role === 'builder' && v.purpose === 'home' ? 'work' : 'idle');
                    if (v.waitT <= 0) this._nextTrip(v);
                    break;
                }
                if (!v.path) { this._nextTrip(v); if (!v.path) { v.waitT = 3; break; } }
                if (this._followPath(v, dt, v.walk || WALK)) {
                    v.path = null;
                    if (v.goingHome) { this._deactivate(v); return; } // went into the house
                    // they stay a good while where they came (shopping, chatting, working)
                    v.waitT = v.purpose === 'chat' ? 15 + Math.random() * 30 : 10 + Math.random() * 35;
                    if (v.purpose === 'chat' && v.chatWith && !v.chatWith.dead) v.chatWith.waitT = Math.max(v.chatWith.waitT, 12);
                }
                v.mode = 'walk';
            }
        }
        this._ground(v);
    }

    _fight(v, dt) {
        const cs = v.cs;
        const fp = this._playerPos(v.foe);
        if (!fp || !this._inLand(cs.def, fp, 30) || !(cs.hostile.get(v.foe) > Date.now())) {
            v.foe = null; v.path = null; v.chaseT = 0;
            return;
        }
        const d = Math.hypot(fp.x - v.x, fp.z - v.z);
        v.seated = false;
        if (d > 2.6) {
            // far or behind walls: along the paths; near and in sight: straight at them
            v.chaseT = (v.chaseT || 0) - dt;
            if (d > 10 && !this._sees(v, fp)) {
                if (v.chaseT <= 0 || !v.path) { v.chaseT = 1.5; this._goTo(v, cs.graph.nearest(fp.x, fp.y - 1.95, fp.z, 6)); }
                this._followPath(v, dt, RUN);
            } else this._steer(v, fp.x, fp.z, RUN, dt, 2.2);
            v.mode = 'run';
        } else {
            this._steer(v, fp.x, fp.z, 0, dt, 9);
            v.mode = 'attack';
            v.speed = 0;
        }
        this._ground(v);
    }

    /** (host) the swing of a knight / the king hits its target. */
    _strike(v) {
        const fp = this._playerPos(v.foe);
        if (!fp || Math.hypot(fp.x - v.x, fp.z - v.z) > 3.4) return;
        const dmg = STATS[v.role].dmg;
        if (v.foe === this.game.localId) this.struck(dmg, v.x, v.z, v.title);
        else this.game.sync?.villagerStrike?.(v.foe, dmg, v.x, v.z, v.title);
    }

    /** A knight's sword reached me. */
    struck(dmg, x, z, who = 'Рыцарь') {
        const g = this.game;
        const from = _v.set(x, g.character.group.position.y, z);
        if (g.gear?.shieldFaces?.(from)) { g.gear.shieldTook?.('melee'); return; }
        if (g.combat.enabled) g.combat.damage(dmg, null, 'knight');
        else g.damageLocalPlayer(dmg);
        g.knockback?.add(_v2.subVectors(g.character.group.position, from).setY(0).normalize().multiplyScalar(5).setY(2));
        g.hud.setVoice(`⚔️ ${who} ударил вас: −${dmg}`, true);
    }

    _sees(v, p) {
        const c = this.game.collision;
        return c.lineOfSight ? c.lineOfSight(v.x, v.y + 3.6, v.z, p.x, p.y + 0.5, p.z, 1.5) : true;
    }

    // ------------------------------------------------------------ damage
    /** Someone hit a villager (weapons, fists, spells). */
    hit(v, dmg, dir, by, opts = {}) {
        if (!v || v.dead) return;
        if (!this.auth) { this.game.sync?.villagerHit?.(v.id, dmg, dir ? [dir.x, dir.z] : null, opts.magic ? 1 : 0); this._flash(v); return; }
        if (v.damageCooldown > 0 && !opts.spell) return;
        v.damageCooldown = 0.35;
        // armour takes most of the blow: the hearts go down many times slower
        if (opts.pierce) v.hp = 0; // («Авада Кедавра»: no armour stops it)
        else if (v.armor > 0) {
            const a = Math.min(v.armor, dmg);
            v.armor -= a;
            v.hp -= a * 0.2 + (dmg - a);
        } else v.hp -= dmg;
        v.hp = Math.max(0, Math.round(v.hp * 10) / 10);
        v.barT = 8;
        this._flash(v);
        if (dir) { v.x += dir.x * 0.3; v.z += dir.z * 0.3; }
        const killed = v.hp <= 0;
        const pos = { x: v.x, y: v.y, z: v.z };
        if (killed) this._die(v, by);
        else if (v.role !== 'knight' && v.role !== 'king') this._say(v, pick(SHOUT.hurt));
        if (by) this._offence(v.cs, by, v, killed, pos);
    }

    _flash(v) {
        v.model.flashHit(0.15);
        for (let i = 0; i < 6; i++) this.game.fx.spark(_v.set(v.x, v.y + 2.6, v.z), v.armor > 0 ? 0xdddddd : 0xb3001b, 0.08, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
    }

    _die(v, by) {
        v.dead = true;
        v.mode = 'dead';
        v.foe = null;
        v.path = null;
        const st = this.state(v.cs.def.id);
        st.killed.add(v.idx);
        if (v.role === 'king') this._capture(v.cs, by);
        this._sendState(v.cs);
    }

    /** Who saw it? If anyone did (or the victim lives to tell), the castle turns on `by`. */
    _offence(cs, by, victim, killed, pos) {
        const g = this.game;
        const st = this.state(cs.def.id);
        if (by === st.owner) return; // (the king may do as he likes)
        const isPlayer = by === g.localId || g.remotes.has(by);
        if (!isPlayer) return;
        const witnesses = [];
        for (const w of cs.active.values()) {
            if (w.dead || w === victim) continue;
            if (Math.hypot(w.x - pos.x, w.z - pos.z) > SEE) continue;
            if (this._sees(w, { x: pos.x, y: pos.y + 1.5, z: pos.z })) witnesses.push(w);
        }
        if (!killed && victim) witnesses.push(victim);
        if (!witnesses.length) return; // nobody saw it
        const was = cs.hostile.get(by) > Date.now();
        cs.hostile.set(by, Date.now() + HOSTILE_MS);
        const kingHit = victim && victim.role === 'king';
        for (const w of witnesses) {
            if (w.role === 'knight' || w.role === 'king') { w.foe = by; if (Math.random() < 0.6) this._say(w, pick(w.role === 'king' ? SHOUT.king : SHOUT.knight)); }
            else { w.fleeFrom = by; w.fleeT = 14 + Math.random() * 6; w.fleeing = false; w.path = null; if (Math.random() < 0.7) this._say(w, pick(SHOUT.help)); }
        }
        // the alarm: knights near any witness come too; for the king — every knight
        for (const k of cs.active.values()) {
            if (k.dead || k.foe || (k.role !== 'knight' && k.role !== 'king')) continue;
            if (kingHit || witnesses.some((w) => Math.hypot(w.x - k.x, w.z - k.z) < 45)) k.foe = by;
        }
        if (kingHit) this._reinforce(cs, by);
        if (!was && by === g.localId) g.hud.setVoice('⚔️ Вас заметили! Стража замка идёт за вами', true);
        else if (!was) g.sync?.villagerAlarm?.(by, cs.def.name);
    }

    /** Hit the king: every knight of the castle comes (from the barracks, the gate, the walls). */
    _reinforce(cs, by) {
        const def = cs.def;
        const st = this.state(def.id);
        if (cs.reinforced >= def.knights) return;
        const from = cs.graph.tagged('barracksDoor').concat(cs.graph.tagged('keepDoor'), cs.graph.tagged('gateIn'));
        let n = 0;
        for (let k = 1; k <= def.knights && n < 10; k++) {
            if (cs.active.has(k) || st.killed.has(k)) continue;
            const node = cs.graph.nodes[from[n % from.length]];
            const v = this._activate(cs, k, { x: node.x + (Math.random() - 0.5) * 2, y: node.y, z: node.z + (Math.random() - 0.5) * 2 }, 'yard');
            if (v) { v.foe = by; n++; }
        }
        cs.reinforced += n;
    }

    /** The king is dead: the castle belongs to `by`. */
    _capture(cs, by) {
        const g = this.game;
        const st = this.state(cs.def.id);
        st.kingDead = true;
        st.owner = by || null;
        st.ownerName = by ? g.playerName(by) : null;
        cs.hostile.clear();
        for (const v of cs.active.values()) { v.foe = null; v.fleeT = 0; }
        for (const c of cs.chests) c.locked = false;
        const someone = [...cs.active.values()].find((v) => !v.dead && v.role !== 'king');
        if (someone) this._say(someone, pick(SHOUT.captured));
        this._announceCapture(cs, st);
        this._sendState(cs);
    }

    _announceCapture(cs, st) {
        const g = this.game;
        if (st.owner === g.localId) g.hud.notify?.(`👑 Вы победили короля! ${cs.def.name} теперь ваш — сундуки открыты`);
        else g.hud.notify?.(`👑 ${st.ownerName || 'Кто-то'} захватил ${cs.def.name}`);
    }

    /**
     * Someone wrecked part of a castle or village (a blast, «Gather», fire): the
     * noise brings the guards to look, people run, and if anybody sees the
     * culprit — the whole guard goes for them.
     * @param {{x,y,z}} pos  where it happened
     * @param {string|null} by  the player who did it (if known)
     * @param {number} blocks  castle blocks destroyed
     * @param {boolean} [loud]  a blast (heard far) or quiet work (seen near)
     */
    damaged(pos, by, blocks, loud = true) {
        if (!this.enabled || !this.index) return;
        const g = this.game;
        if (!this.auth) { if (by === g.localId) g.sync?.villagerVandal?.([Math.round(pos.x), Math.round(pos.y), Math.round(pos.z)], blocks, loud ? 1 : 0); return; }
        const isPlayer = !!by && (by === g.localId || g.remotes.has(by));
        for (const def of this.index.near(pos.x, pos.z, 0)) {
            if (!this._inLand(def, pos, 12)) continue;
            const cs = this._runtime(def);
            if (!cs.awake) continue;
            const st = this.state(def.id);
            if (by && by === st.owner) continue; // (the king may pull down his own walls)
            const hear = loud ? HEAR_BOOM : 30;
            const bp = isPlayer ? this._playerPos(by) : null;
            let seen = false;
            let comers = 0;
            for (const v of cs.active.values()) {
                if (v.dead) continue;
                const d = Math.hypot(v.x - pos.x, v.z - pos.z);
                if (d > hear) continue;
                // a blast draws every eye: whoever sees the culprit knows who it was
                if (bp && blocks > 0 && Math.hypot(bp.x - v.x, bp.z - v.z) < SEE * 1.6 && this._sees(v, bp)) seen = true;
                if (v.role === 'knight') {
                    if (!v.foe) { v.investigate = { x: pos.x, y: pos.y, z: pos.z, by: isPlayer ? by : null, t: 45 }; v.path = null; v.lookT = 0; comers++; }
                } else if (v.role !== 'king' && isPlayer && d < 45 && !(v.fleeT > 0)) {
                    v.fleeFrom = by; v.fleeT = 10 + Math.random() * 8; v.fleeing = false; v.path = null;
                    if (Math.random() < 0.6) this._say(v, pick(loud ? SHOUT.boom : SHOUT.help));
                }
            }
            if (!isPlayer || blocks <= 0) continue;
            st.wrecked = (st.wrecked || 0) + blocks;
            // a big blast: more knights run out of the barracks and the gate to see
            if (loud && comers < 4) this._sendGuards(cs, pos, by, 4 - comers);
            if (seen) this._catch(cs, by, pos);
        }
    }

    /** A few knights come out (barracks, keep, gate) and run to look at a place. */
    _sendGuards(cs, pos, by, n) {
        const def = cs.def;
        const st = this.state(def.id);
        const from = cs.graph.tagged('barracksDoor').concat(cs.graph.tagged('gateIn'), cs.graph.tagged('keepDoor'), cs.graph.tagged('yard'));
        if (!from.length) return;
        // (the nearest doors first)
        from.sort((a, b) => Math.hypot(cs.graph.nodes[a].x - pos.x, cs.graph.nodes[a].z - pos.z) - Math.hypot(cs.graph.nodes[b].x - pos.x, cs.graph.nodes[b].z - pos.z));
        let sent = 0;
        for (let k = 1; k <= def.knights && sent < n; k++) {
            if (cs.active.has(k) || st.killed.has(k)) continue;
            const node = cs.graph.nodes[from[sent % Math.min(2, from.length)]];
            const v = this._activate(cs, k, { x: node.x + (Math.random() - 0.5) * 2, y: node.y, z: node.z + (Math.random() - 0.5) * 2 }, 'yard');
            if (!v) continue;
            v.investigate = { x: pos.x, y: pos.y, z: pos.z, by, t: 50 };
            if (sent === 0) this._say(v, pick(SHOUT.investigate));
            sent++;
        }
    }

    /** The culprit is known: the castle turns on them, every knight near comes. */
    _catch(cs, by, pos) {
        const g = this.game;
        const was = cs.hostile.get(by) > Date.now();
        cs.hostile.set(by, Date.now() + HOSTILE_MS);
        let shouted = false;
        for (const k of cs.active.values()) {
            if (k.dead || k.foe || (k.role !== 'knight' && k.role !== 'king')) continue;
            if (k.role === 'king' && Math.hypot(k.x - pos.x, k.z - pos.z) > 30) continue;
            if (Math.hypot(k.x - pos.x, k.z - pos.z) < 110) {
                k.foe = by; k.investigate = null;
                if (!shouted) { shouted = true; this._say(k, pick(SHOUT.wrecker)); }
            }
        }
        if (!was && by === g.localId) g.hud.setVoice('⚔️ Стража видела, кто ломает замок! Рыцари идут за вами', true);
        else if (!was) g.sync?.villagerAlarm?.(by, cs.def.name);
    }

    /** A knight goes to the place of a blast and looks round; the culprit near → caught. */
    _investigate(v, dt) {
        const I = v.investigate;
        I.t -= dt;
        if (I.t <= 0) { v.investigate = null; v.path = null; return false; }
        // who is about? the one who did it, seen near the place, is caught
        v.lookT = (v.lookT || 0) - dt;
        if (v.lookT <= 0) {
            v.lookT = 0.5;
            const p = I.by ? this._playerPos(I.by) : null;
            if (p && Math.hypot(p.x - I.x, p.z - I.z) < 40 && Math.hypot(p.x - v.x, p.z - v.z) < 32 && this._sees(v, p)) {
                this._catch(v.cs, I.by, I);
                return false;
            }
        }
        const d = Math.hypot(I.x - v.x, I.z - v.z);
        if (d > 6) {
            v.chaseT = (v.chaseT || 0) - dt;
            if (!v.path || v.chaseT <= 0) { v.chaseT = 3; this._goTo(v, v.cs.graph.nearest(I.x, I.y, I.z, 8)); }
            const end = this._followPath(v, dt, RUN);
            if (end) this._steer(v, I.x, I.z, RUN * 0.6, dt, 5);
            v.mode = v.speed > 0 ? 'run' : 'idle';
        } else {
            // there: looking round
            v.speed = 0; v.path = null;
            v.yaw = turn(v.yaw, v.yaw + 1, dt * 0.8);
            v.mode = 'idle';
            if (I.t > 12) I.t = 12;
        }
        this._ground(v);
        return true;
    }

    /** A villager saw / suffered a crime (theft, threats) by a player. */
    reportCrime(v, by, kind = 'crime') {
        if (!v || v.dead) return;
        if (!this.auth) { this.game.sync?.villagerCrime?.(v.id, kind); return; }
        this._offence(v.cs, by, v, false, { x: v.x, y: v.y, z: v.z });
    }

    /** A player died: the castles forget them. */
    playerDied(id) {
        for (const cs of this.castles.values()) {
            cs.hostile.delete(id);
            for (const v of cs.active.values()) if (v.foe === id) v.foe = null;
        }
    }

    hitAt(p, radius, dmg, by) {
        for (const v of [...this.byId.values()]) if (!v.dead && Math.hypot(v.x - p.x, v.z - p.z) < radius + 1 && Math.abs(v.y + 2 - p.y) < radius + 3) this.hit(v, dmg, _v.set(v.x - p.x, 0, v.z - p.z).normalize().clone(), by, { spell: true });
    }

    hitRay(o, d, len, width, dmg, by) {
        for (const v of [...this.byId.values()]) {
            if (v.dead) continue;
            const to = _v.set(v.x - o.x, v.y + 2 - o.y, v.z - o.z);
            const along = to.dot(d);
            if (along < 0 || along > len) continue;
            if (to.addScaledVector(d, -along).length() < width + 1.2) this.hit(v, dmg, d.clone(), by, { spell: true });
        }
    }

    // ------------------------------------------------------------ speech
    _say(v, text, seconds = 4, broadcast = true) {
        if (!text || v.sayT > 0 && !broadcast) return;
        v.sayT = 1.5;
        if (!v.bubble) { v.bubble = new SpeechBubble(); this.game.scene.add(v.bubble.sprite); }
        v.bubble.show(text, { name: `${v.title} ${v.name}`, seconds, color: v.role === 'king' ? '#b8860b' : v.role === 'knight' ? '#4a5a7a' : '#5a3a1a' });
        this.talk.voice(v, text);
        if (broadcast) this.game.sync?.villagerSay?.(v.id, text); // (everybody near sees the bubble)
    }

    /** (network) a villager said something. */
    heard(id, text) {
        const v = this.byId.get(id);
        if (v) this._say(v, text, 4, false);
    }

    _chatter(dt) {
        this._chatT -= dt;
        if (this._chatT > 0 || !this.auth) return;
        this._chatT = 5 + Math.random() * 6;
        const me = this.game.character.group.position;
        const near = [...this.byId.values()].filter((v) => !v.dead && !v.foe && Math.hypot(v.x - me.x, v.z - me.z) < 22);
        if (!near.length) return;
        const v = near[Math.floor(Math.random() * near.length)];
        const line = this.brainLine?.(v) || pick(SHOUT.ambient[v.role]);
        this._say(v, line);
    }

    // ------------------------------------------------------------ frame
    update(dt) {
        if (!this.enabled || !this.index) return;
        const g = this.game;
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 1; this._scan(); }
        if (this.auth) {
            for (const cs of this.castles.values()) if (cs.awake) this._crowd(cs, dt);
            for (const v of [...this.byId.values()]) this._think(v, dt);
        } else {
            for (const v of this.byId.values()) {
                if (!v.net) continue;
                const k = Math.min(1, dt * 8);
                v.x += (v.net.x - v.x) * k; v.y += (v.net.y - v.y) * k; v.z += (v.net.z - v.z) * k;
                v.yaw = turn(v.yaw, v.net.yaw, dt * 10);
            }
        }
        // models, bubbles, bars; fists of the local player; push me out of the people
        const me = g.character.group.position;
        const cam = g.camera;
        const pose = g.currentPose;
        const punching = !!(pose && pose.isPunching) && !g.weapons.hasWeapon() && (g.playerAttackCooldown || 0) <= 0;
        for (const v of [...this.byId.values()]) {
            const d = Math.hypot(v.x - me.x, v.z - me.z);
            const visible = d < VIEW;
            v.group.visible = visible;
            v.group.position.set(v.x, v.y + (v.seated ? VILLAGER_SIT_OFFSET : VILLAGER_FOOT_OFFSET), v.z);
            v.group.rotation.y = v.yaw;
            if (visible) {
                v.model.update(dt, { mode: v.mode, speed: v.speed });
                if (this.auth && v.model.strikeNow && v.foe) this._strike(v);
            }
            if (v.bubble) v.bubble.update(dt, _v.set(v.x, v.y + 4.4, v.z), cam);
            this._updateBar(v, dt, cam);
            if (v.dead) continue;
            if (d < 1.4 && d > 1e-3 && Math.abs(v.y - (me.y - 1.95)) < 2) {
                const o = 1.4 - d;
                me.x += (me.x - v.x) / d * o * 0.7; me.z += (me.z - v.z) / d * o * 0.7;
            }
            if (punching && d < 3.0) {
                g.playerAttackCooldown = 0.5;
                g.onLocalHit(v, 1, _v.set(v.x - me.x, 0, v.z - me.z).normalize().clone(), false);
            }
        }
        this._chatter(dt);
        this.talk.update(dt);
        this._lockHint(dt);
        this._netSend(dt);
    }

    /** A health bar over a villager in a fight: hearts and (grey) armour. */
    _updateBar(v, dt, cam) {
        v.barT -= dt;
        const show = !v.dead && (v.barT > 0 || v.foe);
        if (!show) { if (v.bar) v.bar.sprite.visible = false; return; }
        if (!v.bar) {
            if (typeof document === 'undefined') return;
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 32;
            const tex = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            sprite.scale.set(2.4, 0.6, 1);
            sprite.renderOrder = 998;
            this.game.scene.add(sprite);
            v.bar = { canvas, tex, sprite, key: '' };
        }
        const key = `${v.hp}|${v.armor}`;
        if (key !== v.bar.key) {
            v.bar.key = key;
            const c = v.bar.canvas.getContext('2d');
            c.clearRect(0, 0, 128, 32);
            c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 128, 32);
            c.fillStyle = '#d0202c'; c.fillRect(4, 4, 120 * v.hp / v.maxHp, 11);
            if (v.maxArmor) { c.fillStyle = '#b8c2cc'; c.fillRect(4, 18, 120 * v.armor / v.maxArmor, 10); }
            v.bar.tex.needsUpdate = true;
        }
        v.bar.sprite.visible = true;
        v.bar.sprite.position.set(v.x, v.y + (v.role === 'king' ? 5.9 : 5.5), v.z);
    }

    _lockHint(dt) {
        this._lockMsgT -= dt;
        if (this._lockMsgT > 0) return;
        const g = this.game;
        const me = g.character.group.position;
        for (const cs of this.castles.values()) {
            for (const c of cs.chests) {
                if (!c.locked || c.isOpen) continue;
                const p = c.getPosition();
                if (Math.hypot(p.x - me.x, p.z - me.z) < 5) {
                    g.hud.setVoice('🔒 Сундук заперт. Сундуки замка откроются, когда падёт король', true);
                    this._lockMsgT = 6;
                    return;
                }
            }
        }
    }

    // ------------------------------------------------------------ network
    _netSend(dt) {
        const g = this.game;
        if (!this.auth || !g.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.2;
        const r = (x) => Math.round(x * 100) / 100;
        const list = [];
        for (const v of this.byId.values()) list.push([v.id, r(v.x), r(v.y), r(v.z), r(v.yaw), v.mode, Math.round(v.hp * 10) / 10, Math.round(v.armor), v.seated ? 1 : 0, r(v.speed)]);
        g.sync.villagers?.(list);
    }

    /** (guests) the host's villagers. */
    applyNet(list) {
        const idx = this.index;
        if (!idx) return;
        const seen = new Set();
        for (const [id, x, y, z, yaw, mode, hp, armor, seated, speed] of list || []) {
            seen.add(id);
            let v = this.byId.get(id);
            if (!v) {
                const [cid, n] = id.split(':');
                const cs = [...this.castles.values()].find((c) => c.def.id === cid) || this._runtimeById(cid);
                if (!cs) continue;
                v = this._activate(cs, +n, { x, y, z, yaw }, 'net');
                if (!v) continue;
            }
            v.net = { x, y, z, yaw };
            v.mode = mode;
            if (hp < v.hp || armor < v.armor) v.barT = 8;
            v.hp = hp; v.armor = armor; v.seated = !!seated; v.speed = speed;
            if (mode === 'dead') v.dead = true;
        }
        for (const v of [...this.byId.values()]) if (!seen.has(v.id)) this._deactivate(v);
    }

    _runtimeById(cid) {
        const m = /^cs(-?\d+)_(-?\d+)$/.exec(cid);
        if (!m || !this.index) return null;
        const def = this.index.cellOf(+m[1], +m[2]);
        return def ? this._runtime(def) : null;
    }

    _sendState(cs) {
        const st = this.state(cs.def.id);
        this.game.sync?.castleState?.(cs.def.id, { owner: st.owner, ownerName: st.ownerName, kingDead: st.kingDead, killed: [...st.killed] });
    }

    /** (network / save) a castle's state. */
    applyState(id, s) {
        const st = this.state(id);
        const wasDead = st.kingDead;
        st.owner = s.owner || null; st.ownerName = s.ownerName || null; st.kingDead = !!s.kingDead;
        st.killed = new Set(s.killed || []);
        const cs = this.castles.get(id) || this._runtimeById(id);
        if (cs) for (const c of cs.chests) c.locked = !st.kingDead;
        if (cs && st.kingDead && !wasDead && this.game.active) this._announceCapture(cs, st);
    }

    snapshot() {
        const out = {};
        for (const [id, s] of this.states) if (s.kingDead || s.killed.size) out[id] = { owner: s.owner, ownerName: s.ownerName, kingDead: s.kingDead, killed: [...s.killed] };
        return out;
    }

    restore(data) {
        for (const [id, s] of Object.entries(data || {})) this.applyState(id, s);
    }

    /** Castle captured by this player? (for the dialogue: «Ваше Величество») */
    ownerOf(castleId) { return this.state(castleId).owner; }

    dispose() {
        this.talk.dispose();
        for (const v of [...this.byId.values()]) this._deactivate(v);
        this.castles.clear();
    }
}

function turn(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
}
