/**
 * Chores.js — what the people of the towns and villages do all day (a part of CastleLife).
 *
 * A villager out on a walk now and then has a job of their own at a fitting place: yoga or
 * morning exercises by their house, the roof mended up a ladder, wood chopped on the block,
 * water drawn at the well and carried home, washing hung on a line, the doorstep swept, the
 * hens fed, haggling at a stall, a quarrel with a neighbour (arms flying — seen from afar),
 * a ball thrown to and fro, fishing from the pier, a book on a bench, a drink at the well,
 * windows washed, a sack carried home from the market, a lute played. The wizards have their
 * own: a potion stirred in a cauldron, spells tried on a straw dummy (harmless sparks), books
 * flying round the raised wand, glowing plants tended, meditation in the air with stones
 * circling round. Like the field: the body does it, the things are where the hands are.
 *
 * By the time of day: early morning — exercises, water; the day — all; the evening — the
 * quiet ones (a book, a lute, a ball, a quarrel); night — nobody (asleep; the watch walks its
 * rounds — NightLife.js). Danger, a fight, a spell flying by: the chore is dropped at once
 * (CastleLife's fear and fights come first; a chore left for a moment is over).
 *
 * The host decides; everybody sees it by the villager's `chore` (one small number with the
 * rest of the villager — CastleLife._netSend), drawn by VillagerModel + ChoreAnim.js.
 * Each chore's things stand in the world: they are walked round (CrowdSources, CastleLife: `choreThingsAt`),
 * never put into a wall (the place is tested first, else another chore).
 */

import { BLOCK } from '../world/Terrain.js';

const WALK = 2.3;
/** blocks: a wall for a ladder / for washing windows is at least this tall. */
const WALL_H = 5;

/**
 * The chores: where (`at`: graph tags; 'door' = in front of a house), when (`parts` of the
 * day — NightLife.nightPart), whether wizards (`wiz`) do them, what they need: 'wall' (a house
 * wall in front: ladder, windows), `space` (m of free ground ahead for the things), `pair`
 * (m between two people), `carry` (afterwards carried home as this chore), `dur` (s).
 */
export const CHORES = {
    // ---- the townsfolk
    yoga: { at: ['door', 'yard'], parts: ['dawn', 'day'], space: 1.6, dur: [30, 50] },
    exercise: { at: ['door', 'yard', 'market'], parts: ['dawn', 'day'], dur: [18, 30] },
    roof: { at: ['door'], parts: ['day'], wall: true, roles: ['builder', 'farmer'], dur: [30, 55] },
    chop: { at: ['door'], parts: ['dawn', 'day'], space: 2.2, roles: ['farmer', 'builder'], dur: [25, 45] },
    water: { at: ['well'], parts: ['dawn', 'day', 'pack'], dur: [5, 6], then: 'carryWater' },
    carryWater: { carry: true },
    drink: { at: ['well'], parts: ['dawn', 'day', 'pack'], dur: [8, 14] },
    laundry: { at: ['door'], parts: ['day'], space: 2.0, dur: [30, 50] },
    sweep: { at: ['door', 'market', 'yard', 'stall'], parts: ['dawn', 'day', 'pack'], dur: [20, 35] },
    feed: { at: ['door', 'field'], parts: ['dawn', 'day'], space: 2.8, roles: ['farmer'], dur: [20, 35] },
    haggle: { at: ['stall'], parts: ['day'], dur: [15, 28] },
    argue: { at: ['market', 'yard', 'door', 'well'], parts: ['day', 'pack'], pair: 2.3, dur: [18, 32] },
    ball: { at: ['market', 'yard'], parts: ['day', 'pack'], pair: 4.5, dur: [25, 45] },
    fish: { at: ['pier', 'quay'], parts: ['dawn', 'day', 'pack'], water: true, dur: [40, 80] },
    read: { at: ['door', 'market', 'yard', 'room', 'home'], parts: ['day', 'pack'], space: 1.0, wiz: true, dur: [30, 60] },
    windows: { at: ['door'], parts: ['day'], wall: true, dur: [20, 35] },
    sack: { at: ['market', 'stall'], parts: ['day'], dur: [2, 3], then: 'carrySack' },
    carrySack: { carry: true },
    lute: { at: ['market', 'yard', 'door'], parts: ['day', 'pack'], space: 1.0, dur: [30, 60] },
    // ---- the wizards
    potion: { at: ['room', 'ring', 'home', 'cauldron'], parts: ['dawn', 'day', 'pack'], space: 2.4, wizOnly: true, dur: [30, 55] },
    dummy: { at: ['ring', 'room'], parts: ['day'], space: 4.6, wizOnly: true, dur: [25, 45] },
    levbooks: { at: ['room', 'home', 'ring'], parts: ['day', 'pack'], wizOnly: true, dur: [20, 35] },
    plants: { at: ['room', 'ring', 'home'], parts: ['dawn', 'day'], space: 2.4, wizOnly: true, dur: [25, 45] },
    meditate: { at: ['ring', 'room', 'home'], parts: ['dawn', 'day', 'pack'], wizOnly: true, dur: [30, 60] },
};

/** The order of the chores on the network (1 + the index; 0 = nothing). */
export const CHORE_KEYS = Object.keys(CHORES);
/** Chores done by the townsfolk / by the wizards (the ones one can be sent to do — not the carrying). */
export const TOWN_CHORES = CHORE_KEYS.filter((k) => CHORES[k].at && !CHORES[k].wizOnly);
export const WIZ_CHORES = CHORE_KEYS.filter((k) => CHORES[k].at && (CHORES[k].wizOnly || CHORES[k].wiz));

/** (network) chore + side → one number. */
export function choreCode(key, side = 0) {
    const i = key ? CHORE_KEYS.indexOf(key) : -1;
    return i < 0 ? 0 : (i + 1) + (side ? 64 : 0);
}
/** (network) the number → [chore or null, side]. */
export function choreOf(code) {
    code |= 0;
    const i = (code & 63) - 1;
    return [i >= 0 && i < CHORE_KEYS.length ? CHORE_KEYS[i] : null, code & 64 ? 1 : 0];
}

/** The chores one may start at a place with `tag` now (part of the day), for this villager. */
export function choresFor(tag, part, { wizard = false, role = '', port = false } = {}) {
    const out = [];
    for (const k of wizard ? WIZ_CHORES : TOWN_CHORES) {
        const c = CHORES[k];
        if (!c.at.includes(tag) || !c.parts.includes(part)) continue;
        if (c.roles && !c.roles.includes(role)) continue;
        if (c.water && !port) continue;
        out.push(k);
    }
    return out;
}

/** What the model shows now: the chore while doing it, a carried thing while walking with it. */
export function shownChore(v) {
    const k = v.chore;
    if (!k) return null;
    if (v.mode === 'chore') return k;
    return CHORES[k]?.carry && (v.mode === 'walk' || v.mode === 'idle') ? k : null;
}

const _spot = { x: 0, z: 0, r: 0 };
/**
 * Where the things of a chore stand (a ladder, a chopping block, a line, a dummy…): a circle in
 * front of the villager — walked round by the others (CrowdSources), the player pushed out of it
 * (CastleLife). Null: nothing stands there. (Reused object.)
 */
export function choreThingsAt(v) {
    const c = v.mode === 'chore' && CHORES[v.chore];
    const reach = c ? c.space || (c.wall ? 0.8 : 0) : 0;
    if (!reach) return null;
    const k = Math.min(reach, 3.5) * 0.6;
    _spot.x = v.x - Math.sin(v.yaw) * k; _spot.z = v.z - Math.cos(v.yaw) * k; _spot.r = Math.min(1.4, 0.5 + reach * 0.3);
    return _spot;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const LINES = {
    argue: [
        ['Твоя коза опять съела мою капусту!', 'Ты забор на мою землю передвинул!', 'Верни мою лопату, ворюга!', 'Да ты всю ночь храпишь, вся улица слышит!', 'Это моя курица, а не твоя!'],
        ['Враньё! Сам ты ворюга!', 'Да я тебя на суд к королю потащу!', 'Ещё одно слово — и получишь!', 'Совести у тебя нет!', 'Не ори на меня!'],
    ],
    haggle: ['Сколько?! Да это грабёж!', 'Уступи хоть пару монет!', 'У соседа дешевле!', 'Ладно, ладно, беру.', 'А свежее есть?'],
    roof: ['Опять крыша протекает…', 'Ещё пару гвоздей…', 'Только бы не упасть.'],
    yoga: ['Вдох… выдох…', 'Спина — как новая.', 'Тянемся, тянемся…'],
    exercise: ['Раз-два, раз-два!', 'Ух, бодрит!'],
    chop: ['Зима близко — дров надо много.', 'Эх, раз!'],
    fish: ['Клюёт… нет, показалось.', 'Сегодня рыба сытая.', 'Тише, рыбу распугаешь!'],
    ball: ['Лови!', 'Держи!', 'Ха, промазал!'],
    lute: ['♪ Ла-ла-ла… ♪', '♪ Жил-был рыцарь молодой… ♪'],
    potion: ['Щепотку толчёного корня…', 'Не перекипело бы…', 'Цвет правильный!'],
    dummy: ['Ещё раз… Искры!', 'Держись, соломенный!', 'Прицел, взмах — отлично.'],
    levbooks: ['Книги, по местам… ну почти.', 'Плавнее, плавнее…'],
    meditate: ['Ом-м-м…', 'Тишина…'],
    plants: ['Расти, светлячок, расти.', 'Им нужно немного магии.'],
};

export class Chores {
    constructor(life) {
        this.life = life;
        this.game = life.game;
    }

    /** The part of the day (towers: night — g.isNight; without a day cycle — day). */
    _part(v) {
        const g = this.game;
        if (v.wizard) return g.isNight ? 'night' : 'day';
        return this.life.night?.part?.() || 'day';
    }

    /**
     * (host) Start of a trip: maybe a chore — the place is picked and the way there set.
     * True: the villager goes to do it.
     */
    plan(v) {
        const L = this.life, g = v.cs.graph;
        this.end(v);
        if (v.job !== 'wander' || v.foe || v.servantOf != null || v.dead || !(v.trips > 0)) return false;
        if (v.role === 'knight' || v.role === 'king' || v.role === 'advisor') return false;
        const part = this._part(v);
        if (part === 'night' || part === 'home') return false;
        if (Math.random() > (part === 'day' ? 0.45 : 0.3)) return false; // (they still go shopping, chatting, home)
        // the places round: own door first, the rest of the graph's tags
        const who = { wizard: !!v.wizard, role: v.role, port: !!v.cs.def.port };
        const tags = v.wizard ? ['room', 'ring', 'home', 'cauldron'] : ['door', 'door', 'well', 'market', 'stall', 'yard', 'field', 'pier', 'quay'];
        for (let tries = 0; tries < 4; tries++) {
            const tag = pick(tags);
            const list = choresFor(tag, part, who);
            if (!list.length) continue;
            let node = -1, house = -1;
            if (tag === 'door') {
                const houses = v.cs.def.houses || [];
                house = houses[v.entry?.home] ? v.entry.home : houses.length ? Math.floor(Math.random() * houses.length) : -1;
                node = houses[house]?.doorNode ?? -1;
            } else {
                const l = g.tagged(tag);
                node = l.length ? pick(l) : -1;
            }
            if (node == null || node < 0 || !g.nodes[node]) continue;
            if (!L._goTo(v, node)) continue;
            v.trips--;
            v.chorePlan = pick(list);
            v.choreHouse = house;
            v.purpose = 'chore';
            return true;
        }
        return false;
    }

    /** (host) Came to the place of the chore: where exactly, which way, the things. False: none here. */
    arrive(v) {
        const key = v.chorePlan;
        v.chorePlan = null;
        if (!key) return false;
        const c = CHORES[key];
        if (c.pair) return this._pairUp(v, key);
        let spot = { x: v.x, z: v.z, yaw: v.yaw };
        if (c.wall) spot = this._wallSpot(v);
        else if (c.water) spot = this._waterSpot(v);
        else if (c.space) spot = this._spaceSpot(v, c.space);
        if (!spot) {
            // no room for it here: something without things to put down
            const alt = v.wizard ? 'levbooks' : this._part(v) === 'pack' ? 'sweep' : 'exercise';
            if (!CHORES[alt].parts.includes(this._part(v)) || key === alt) return false;
            return this._begin(v, alt, { x: v.x, z: v.z, yaw: v.yaw });
        }
        return this._begin(v, key, spot);
    }

    _begin(v, key, spot, side = 0, mate = null) {
        const c = CHORES[key];
        v.chore = key; v.choreSide = side; v.choreMate = mate;
        v.choreGo = { x: spot.x, z: spot.z, yaw: spot.yaw, t: 0 };
        v.waitT = c.dur[0] + Math.random() * (c.dur[1] - c.dur[0]);
        v.choreSeen = performance.now();
        v.choreSayT = 3 + Math.random() * 6;
        v.path = null;
        return true;
    }

    /** (host) The chore over (done, broken off): the things away. */
    end(v) {
        if (!v.chore && !v.chorePlan) return;
        const m = v.choreMate;
        v.chore = null; v.chorePlan = null; v.choreGo = null; v.choreMate = null; v.choreAt = null;
        if (m && m.choreMate === v) { m.choreMate = null; if (m.chore) { m.chore = null; m.waitT = Math.min(m.waitT, 1.5); } }
    }

    /**
     * (host) One step of a chore (instead of standing about). False: no chore (any more).
     * Broken off when anything else took the villager for a moment (fear, a fight, being held…).
     */
    step(v, dt) {
        const L = this.life, now = performance.now();
        if (!v.chore) return false;
        const c = CHORES[v.chore];
        if (now - v.choreSeen > 700 || (v.choreMate && (v.choreMate.dead || v.choreMate.chore !== v.chore || v.choreMate.foe))) { this.end(v); v.waitT = 0; return false; }
        v.choreSeen = now;
        if (c.carry) return false; // (carried home: the walk does it)
        const part = this._part(v);
        if (part === 'night' || part === 'home' || v.goingHome) { this.end(v); v.waitT = 0; return false; } // (evening: home)
        v.waitT -= dt;
        // to the very spot first (round the others), then turned to it
        const go = v.choreGo;
        if (go) {
            const d = Math.hypot(go.x - v.x, go.z - v.z);
            go.t += dt;
            if (d > 0.3 && go.t < 12) {
                L._steer(v, go.x, go.z, WALK * 0.7, dt, 0);
                v.mode = v.speed > 0 ? 'walk' : 'idle';
                L._ground(v);
                return true;
            }
            if (go.t >= 12 && d > 1.2) { this.end(v); v.waitT = 0; return false; } // (can't get there)
            v.choreGo = null;
            v.choreYaw = go.yaw;
            v.choreAt = { x: go.x, z: go.z }; // (the place of the things: pushed away from it, the chore is over — nothing stands free on the path)
        }
        if (v.choreAt && Math.hypot(v.x - v.choreAt.x, v.z - v.choreAt.z) > 1.4) { this.end(v); v.waitT = 0; return false; }
        v.speed = 0;
        const m = v.choreMate;
        const yaw = m ? Math.atan2(-(m.x - v.x), -(m.z - v.z)) : v.choreYaw ?? v.yaw;
        v.yaw = turnTo(v.yaw, yaw, dt * 4);
        // talking to a player: the chore waits (turned to them — CastleTalk)
        v.mode = v.talking > 0 ? 'talk' : m && m.choreGo ? 'idle' : 'chore';
        L._ground(v);
        this._lines(v, dt);
        if (v.waitT <= 0) {
            const then = c.then;
            this.end(v);
            if (then) { // (now carried home: the bucket full, the sack on the shoulder)
                v.chore = then; v.choreSeen = now;
                v.goingHome = true; v.trips = 0;
                L._goTo(v, L._homeNode(v));
                v.waitT = 0;
                return true;
            }
            return false;
        }
        return true;
    }

    /** (host) A carried thing on the way: kept up to date (else dropped when anything breaks in). */
    walking(v) {
        if (v.chore && CHORES[v.chore].carry) {
            if (performance.now() - v.choreSeen > 700) { this.end(v); return; }
            v.choreSeen = performance.now();
        }
    }

    _lines(v, dt) {
        v.choreSayT -= dt;
        if (v.choreSayT > 0) return;
        const key = v.chore;
        const pair = key === 'argue';
        v.choreSayT = pair ? 2.6 + Math.random() * 1.6 : key === 'haggle' ? 6 + Math.random() * 4 : 14 + Math.random() * 16;
        const me = this.game.character?.group?.position;
        if (!me || Math.hypot(me.x - v.x, me.z - v.z) > (pair ? 45 : 25)) return; // (only where somebody hears it)
        const l = LINES[key];
        if (!l) return;
        if (pair) {
            // they shout in turns: one, then the other answers
            if (v.choreSide === 1 && v.choreMate) v.choreMate.choreSayT = Math.max(v.choreMate.choreSayT, 1.4);
            this.life._say(v, pick(l[v.choreSide] || l[0]), 2.6);
        } else if (Math.random() < 0.5) this.life._say(v, pick(l), 3);
    }

    // ------------------------------------------------------------ places
    /** In front of a house wall (the door's side): about 1 m from it, facing it. */
    _wallSpot(v) {
        const L = this.life, h = v.cs.def.houses?.[v.choreHouse];
        if (!h?.c) return null;
        let dx = h.c.x - v.x, dz = h.c.z - v.z;
        const len = Math.hypot(dx, dz);
        if (len < 1) return null;
        dx /= len; dz /= len;
        // aside of the door (not in its way): along the wall a little
        const sx = -dz * 2.2, sz = dx * 2.2;
        for (const side of [1, -1]) {
            const ox = v.x + sx * side, oz = v.z + sz * side;
            if (!L._walkable(ox, oz, v.y)) continue;
            for (let s = 0.5; s < 7; s += 0.25) {
                if (L._walkable(ox + dx * s, oz + dz * s, v.y)) continue;
                const back = s - 1.2;
                if (back < 0) break;
                const x = ox + dx * back, z = oz + dz * back;
                if (!L._walkable(x, z, v.y)) break;
                if (!this._tallWall(ox + dx * s, oz + dz * s, v.y)) break; // (a ladder leans on a real wall: a fence, a crate, a step is no wall — the author saw one standing free on the path)
                return { x, z, yaw: Math.atan2(-dx, -dz) };
            }
        }
        return null;
    }

    /** Is the cell (x, z) a wall at least WALL_H blocks tall above the villager's feet (so a ladder has something to lean on)? */
    _tallWall(x, z, y) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const ix = Math.round(x), iz = Math.round(z), iy = Math.round(y);
        for (let k = 1; k <= WALL_H; k++) {
            const b = t.get(ix, iy + k, iz);
            if (b === BLOCK.AIR || b === BLOCK.WATER) return false;
        }
        return true;
    }

    /** Ground ahead free for the things (`len` m): this way or turned; null — no room. */
    _spaceSpot(v, len) {
        const L = this.life;
        const base = v.yaw + Math.floor(Math.random() * 4) * Math.PI / 2;
        for (let i = 0; i < 4; i++) {
            const yaw = base + i * Math.PI / 2;
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            let ok = true;
            for (let s = 0.6; s <= len + 0.6 && ok; s += 0.6) {
                if (!L._walkable(v.x + fx * s, v.z + fz * s, v.y)) ok = false;
                // (and a hand's breadth to each side: a line, a dummy's arms, a bench)
                else if (!L._walkable(v.x + fx * s - fz * 0.9, v.z + fz * s + fx * 0.9, v.y) || !L._walkable(v.x + fx * s + fz * 0.9, v.z + fz * s - fx * 0.9, v.y)) ok = false;
            }
            if (ok) return { x: v.x, z: v.z, yaw };
        }
        return null;
    }

    /** At a pier / quay: facing the water (the edge right ahead). */
    _waterSpot(v) {
        const L = this.life;
        for (let i = 0; i < 8; i++) {
            const yaw = i * Math.PI / 4;
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            for (let s = 0.5; s < 4; s += 0.5) {
                if (L._walkable(v.x + fx * s, v.z + fz * s, v.y)) continue;
                const back = s - 0.9;
                if (back < 0) break;
                if (!this._waterAt(v.x + fx * (s + 0.5), v.z + fz * (s + 0.5), v.y)) break;
                return { x: v.x + fx * back, z: v.z + fz * back, yaw };
            }
        }
        return null;
    }

    _waterAt(x, z, y) {
        const t = this.game.world?.terrain?.data;
        if (!t) return true;
        const ix = Math.round(x), iz = Math.round(z);
        for (let k = 0; k < 6; k++) if (t.get(ix, Math.round(y) - k, iz) === BLOCK.WATER) return true;
        return false;
    }

    /** Two of them: the one who came, and somebody standing about near — the other comes over. */
    _pairUp(v, key) {
        const D = CHORES[key].pair;
        let best = null, bd = 14;
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || o.foe || o.chore || o.chorePlan || o.job !== 'wander' || !(o.waitT > 3) || o.talking > 0 || !!o.wizard !== !!v.wizard) continue;
            const d = Math.hypot(o.x - v.x, o.z - v.z);
            if (d < bd) { bd = d; best = o; }
        }
        if (!best) return false;
        // the other one stands D m away, on the line between them (on walkable ground)
        let dx = best.x - v.x, dz = best.z - v.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const tx = v.x + dx * D, tz = v.z + dz * D;
        if (!this.life._walkable(tx, tz, v.y)) return false;
        this._begin(v, key, { x: v.x, z: v.z, yaw: v.yaw }, 0, best);
        this._begin(best, key, { x: tx, z: tz, yaw: best.yaw }, 1, v);
        best.waitT = v.waitT;
        best.purpose = 'chore';
        return true;
    }
}

function turnTo(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
}
