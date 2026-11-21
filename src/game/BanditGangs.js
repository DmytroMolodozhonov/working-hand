/**
 * BanditGangs.js — the robber gangs of the roads (the author 21.11): «разбойные банды — с мечами, на лошадях, довольно быстрые мужчины и женщины, в броне, но без шлема;
 * подбегают, стреляют из лука, могут прямо с коня ударить мечом. Их главная цель — убить, чтобы ограбить. Встречаются примерно как дома одиночных волшебников.
 * Отдельный алгоритм: не магические; разные стратегии; от 2 до 5».
 *
 * WHO: 2…5 riders of one gang (castle people of the road site type 'wb', role «knight» with their own look: armour, NO helmet, men and women, a dark
 * colour of the gang), each on a real horse of the herds (Riders.js: the same horse, the same body, everything that hits a horse works on it).
 * Two kinds: SWORDSMEN («рубаки» — gallop at the target, strike from the saddle, wheel round, come again) and ARCHERS («лучники» — ride round the
 * target at 12…22 m and loose from the saddle, the body turned to the target; backing off when somebody comes close).
 *
 * HOW (a gang chooses one STRATEGY when it meets a player):
 *   charge  «налёт»    — everybody at once straight at the target; the archers shoot as they come, then circle behind.
 *   circle  «карусель» — the archers ride a ring round the player and shoot; the swordsmen wait on the ring and go in by turns (one after another).
 *   ambush  «засада»   — they come round behind the player's back unseen, slowly, and fall on at once when he turns, is hurt or comes near.
 *   pincer  «клещи»    — the gang splits in two, takes the player's two flanks and falls on from both sides together.
 * Morale: when half of them are down the rest ride away; a dead target — they gather what he dropped (not his wand) and ride off with it;
 * what they carry falls from the first of them to die (with a few coins of their own).
 *
 * WHO / WHAT × HOW («на кого и на что»): they are castle people and horses — every blow, spell, blast, push, Leviosa, fear, arrow works on them as on any
 * knight and horse (CastleLife / Animals / CreatureImpact); a thrown rider or a dead horse puts the rider on the ground and he fights on foot as an
 * ordinary knight with the player as his foe (the standard knight AI); killing a robber is no crime (CastleLife._offence); they go for players only
 * (a hero that cannot be hurt — Creative, the tutorial, the school, the duel mode — meets none); none off the Earth. The host leads them; the guests see
 * the riders and the horses as every castle person and every animal (the torso's turn of an archer is only on the host's screen — a picture).
 */

import * as THREE from 'three';
import { Riders } from './Riders.js';
import { aimArrow } from './KnightTactics.js';
import { outOfSight } from './Animals.js';
import { newUid } from './ItemTypes.js';
import { earthly } from '../world/Planets.js';
import { belowCaveSurface } from './CavePlace.js';
import { WANDER_GRID } from '../world/WizardTowers.js';
import { CappedLog } from '../core/CappedLog.js';
import { allLog } from '../core/AllLog.js';

/** The world's first days are quiet (the author 21.11: no robbers, no dark raiders in the first two days of the game): a day is 24 minutes of play. */
export const DAY_MS = 24 * 60 * 1000;
export const RAID_FREE_DAYS = 2;
/** Is this place underground (a cave)? The local hero's own flag, else the depth under the surface. Robbers do not come there and do not follow in. */
export function inCaveAt(g, p) {
    if (!p || g.space?.offEarth) return false;
    if (g._inCave && p === g.character?.group?.position) return true;
    return belowCaveSurface(g.terrain?.data || g.world?.terrain?.data, p.x, p.z, p.y - 1.95);
}

export const BANDIT = {
    EVERY: 25, // s between tries to send a gang
    CHANCE: 0.085, CHANCE_NIGHT: 0.05, // a try's chance (about one gang in five minutes of play: as often as a lone wizard's house is met)
    MAX: 1, // gangs at once (per player in the world, at most MAX_ALL)
    MAX_ALL: 2,
    SIZE: [2, 5],
    NEAR: [95, 140], // m from a player where they appear (unseen)
    NOTICE: 120, // m: they see a player this near and go for him
    GONE: 320, // m from everybody and out of sight: gone
    LOSE: 190, // m: a target farther than this is lost
    RUN: 10.5, CHARGE: 12, RING: 8.8, STALK: 4.2, // m/s (a plain horse of the roads walks 3.6 and gallops 8.5: they are quick)
    REACH: 4.2, // m: a sword's blow from the saddle
    PASS_AWAY: 14, // m a rider goes on past the target before he wheels
    RING_R: [13, 21], // m: the archers' ring
    CAVE_LINES: ['В нору за ним не полезем!', 'Пусть сидит в своей дыре.', 'Ищи ветра в поле — нам туда нельзя.'],
    SHOOT_EVERY: [1.4, 2.6], DRAW_T: 0.9, // s
    ARROW_SPEED: 42, ARROW_DMG: 3,
    LOOT_R: 9, LOOT_T: 22, LOOT_MAX: 14, // s, items
    COIN_DROP: [4, 22],
    TARGET_T: 0.6, // s between looks for the target
    HP: 16, ARMOR: 32, // lighter than a castle knight's (20 / 50)
};

export const STRATEGY = {
    charge: { ru: 'налёт', archers: 0.25, weight: 0.32 },
    circle: { ru: 'карусель', archers: 0.5, weight: 0.26 },
    ambush: { ru: 'засада', archers: 0.34, weight: 0.2 },
    pincer: { ru: 'клещи', archers: 0.34, weight: 0.22 },
};

const MALE = ['Грош', 'Волк', 'Косой', 'Рваный', 'Хмурый', 'Шрам', 'Ворон', 'Гвоздь', 'Бык', 'Лютый', 'Седой', 'Мрак'];
const FEMALE = ['Ласка', 'Рысь', 'Гадюка', 'Сойка', 'Рыжая', 'Тень', 'Волчица', 'Кошка', 'Змейка', 'Чёрная', 'Лиса', 'Ястреб'];
const COLOURS = [0x4a2a20, 0x2f3a2a, 0x3a3a44, 0x5a3a18, 0x4a2a44, 0x23323f]; // the gang's colour (the surcoat, the trim)
const SHOUT = {
    sight: ['Вот и добыча!', 'Эй, ты! Стоять!', 'Один в поле? Тем лучше.', 'Кошелёк тебе уже не понадобится!'],
    charge: ['Руби его!', 'Взять его!', 'Вперёд!', 'Давите его конями!'],
    ambush: ['Тише… ждём.', 'Заходим сзади.', 'Не спугните.'],
    pincer: ['Слева! Справа!', 'Берём в клещи!', 'Обходи!'],
    loot: ['Хорошая добыча!', 'Всё наше.', 'Подбирай, и ходу!'],
    flee: ['Уходим! Он опасен!', 'Назад! Врассыпную!', 'Нас порубят — ходу!'],
};
const pick = (a, rnd = Math.random) => a[Math.floor(rnd() * a.length) % a.length];
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** The yaw that looks from (0,0) towards (dx, dz) (a body faces −sin, −cos). */
export const headTo = (dx, dz) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------------------- pure rules (tested)
/** How many in a gang: BANDIT.SIZE inclusive. */
export const gangSize = (rnd = Math.random) => BANDIT.SIZE[0] + Math.floor(rnd() * (BANDIT.SIZE[1] - BANDIT.SIZE[0] + 1));

/** A strategy by weight. */
export function pickStrategy(n, rnd = Math.random) {
    let s = 0;
    for (const k in STRATEGY) s += STRATEGY[k].weight;
    let r = rnd() * s;
    for (const k in STRATEGY) { r -= STRATEGY[k].weight; if (r <= 0) return k; }
    return 'charge';
}

/** Who is who in a gang of `n` with this strategy: ['archer' | 'rider', …] — at least one swordsman (a lone pair keeps one of each in a ring). */
export function rolesFor(n, strategy, rnd = Math.random) {
    const share = STRATEGY[strategy]?.archers ?? 0.3;
    let a = Math.round(n * share + (rnd() < 0.3 ? 1 : 0) - (rnd() < 0.2 ? 1 : 0));
    a = Math.max(strategy === 'circle' ? 1 : 0, Math.min(n - 1, a));
    return [...Array(a).fill('archer'), ...Array(n - a).fill('rider')];
}

/** A point on a ring of radius R round (cx, cz) at angle a (rad). */
export const ringAt = (cx, cz, R, a) => ({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });

/** The heading (yaw) for riding round (cx, cz) at radius R, the way `dir` (±1), correcting the radius — tangent plus a pull to the ring. */
export function ringHeading(px, pz, cx, cz, R, dir) {
    const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz) || 1;
    const tx = -dz / d * dir, tz = dx / d * dir; // (the tangent)
    const k = Math.max(-1, Math.min(1, (R - d) / R)) * 1.4; // (outside: pull in; inside: push out)
    const hx = tx + (dx / d) * k, hz = tz + (dz / d) * k;
    return headTo(hx, hz);
}

/** The two flanks for a pincer: points at `R` round the target at ±`spread` from the direction the gang comes from. */
export function flankPoints(tx, tz, fromX, fromZ, R = 30, spread = 1.25) {
    const a0 = Math.atan2(fromZ - tz, fromX - tx);
    return [ringAt(tx, tz, R, a0 + spread), ringAt(tx, tz, R, a0 - spread)];
}

/** The point behind a player who looks along `look` (yaw), `R` m behind him (an ambush). */
export function behindPoint(tx, tz, lookYaw, R = 42) {
    return { x: tx + Math.sin(lookYaw) * R, z: tz + Math.cos(lookYaw) * R };
}

/** Is the gang's nerve broken: half of them down (or all but one)? */
export const broken = (alive, n) => n >= 2 && alive * 2 <= n;

/** The torso's turn of a rider shooting at a target (rad, + = to the left) and whether it can be done (not further than ~1.5 rad). */
export function shotTurn(horseYaw, dx, dz) {
    const rel = wrap(headTo(dx, dz) - horseYaw);
    return { rel, ok: Math.abs(rel) <= 1.5 };
}

const _look = new THREE.Vector3();
const _a = new THREE.Vector3();

export class BanditGangs {
    constructor(game) {
        this.game = game;
        this.gangs = new Map();
        this.playMs = 0; // the world's play time (the first days are quiet; saved with the world)
        this._t = BANDIT.EVERY * 0.6;
        this._n = 0;
        this._checkT = 0;
        this.log = new CappedLog();
        // (the same riding as the roads' riders: Riders.js — mount, move, unseat; its trav is only what it uses of Travelers)
        this.riders = new Riders({ game, log: { push() {} }, _arrive() {} });
    }

    get auth() { return this.game.authority; }
    get life() { return this.game.castleLife; }

    /** The first RAID_FREE_DAYS days of the world: nobody comes. */
    open() { return this.playMs >= RAID_FREE_DAYS * DAY_MS; }
    snapshot() { return { playMs: Math.round(this.playMs) }; }
    restore(s) { if (s && Number.isFinite(s.playMs)) this.playMs = Math.max(0, s.playMs); }

    /** May a gang come now: a hero that can be hurt, not a lesson, not a school, not a duel, not a camera. */
    enabled() {
        const g = this.game;
        if (!g.combat?.enabled || g.combat.dead || g.isDeadLocal) return false;
        if (g.tutorial && !g.tutorial.done) return false;
        if (g.school && g.school.phase && g.school.phase !== 'free') return false;
        if (g.arenaDuels?.mode || g.spectator?.active || g.config?.brawl) return false;
        return true;
    }

    // ---------------------------------------------------------------- frame (host)
    update(dt) {
        if (this._broken) return;
        try { this._update(dt); } catch (e) { // (a fault in a gang never stops the game: it is written once, the gangs are put away)
            this._broken = true; console.error('[BanditGangs]', e);
            allLog('Ошибки', `разбойные банды отключены из-за ошибки: ${e?.message || e}`);
            try { this.dispose(); } catch (e2) { /* */ }
        }
    }

    _update(dt) {
        const L = this.life;
        if (!this.auth || !L?.enabled || !L.index) return;
        this.playMs += dt * 1000;
        this._t -= dt;
        if (this._t <= 0) {
            this._t = BANDIT.EVERY * (0.8 + Math.random() * 0.4);
            if (this.open() && this.enabled() && this.gangs.size < Math.min(BANDIT.MAX_ALL, BANDIT.MAX * Math.max(1, L._players().length)) && Math.random() < (this.game.isNight ? BANDIT.CHANCE_NIGHT : BANDIT.CHANCE)) this.spawnNear();
        }
        this._checkT -= dt;
        const check = this._checkT <= 0;
        if (check) this._checkT = 0.25;
        for (const P of [...this.gangs.values()]) this._gang(P, dt, check);
    }

    // ---------------------------------------------------------------- the coming of a gang
    /** (host) A gang comes near a player: out of his sight, on firm open ground. → the gang, or false. */
    spawnNear(o = {}) {
        const g = this.game, L = this.life, idx = L?.index;
        if (!idx?.towers?.wanderDef || !g.animals?._spawn) return false;
        const players = L._players();
        if (!players.length) return false;
        const pl = o.player || players[Math.floor(Math.random() * players.length)];
        if (!earthly(pl.p)) return false;
        if (inCaveAt(g, pl.p)) return false; // (nobody comes to a cave: a hero underground is left alone)
        if (idx.landAt?.(Math.round(pl.p.x), Math.round(pl.p.z))) return false; // (in a castle, a village, a tower: no robbers)
        const look = pl.id === g.localId ? g.animals?._look?.(_look) : null;
        for (let k = 0; k < 14; k++) {
            const a = Math.random() * Math.PI * 2, d = BANDIT.NEAR[0] + Math.random() * (BANDIT.NEAR[1] - BANDIT.NEAR[0]);
            const x = o.at?.x ?? pl.p.x + Math.cos(a) * d, z = o.at?.z ?? pl.p.z + Math.sin(a) * d;
            if (!o.at && look && !outOfSight(pl.p, look, x, z)) continue;
            if (!o.at && players.some((q) => Math.hypot(q.p.x - x, q.p.z - z) < BANDIT.NEAR[0] * 0.8)) continue;
            if (idx.landAt?.(Math.round(x), Math.round(z))) continue;
            const yaw = headTo(pl.p.x - x, pl.p.z - z);
            if (g.travelers && !g.travelers._placeFree(x, z, yaw, false, { into: null })) continue;
            return this._make(x, z, yaw, o);
        }
        return false;
    }

    /** The people of a gang: their own roster (a look of their own, armour, no helmet). */
    _roster(site, n, strategy) {
        const roles = rolesFor(n, strategy);
        const out = [];
        for (let i = 0; i < n; i++) {
            const female = Math.random() < 0.42;
            const seed = (Math.imul(site.serial + 7, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0;
            out.push({
                idx: site.nums[i], role: 'knight', female, name: pick(female ? FEMALE : MALE), title: female ? 'Разбойница' : 'Разбойник',
                home: -1, stall: -1, seed, brave: 1, robe: false,
                look: { hat: 'none', plume: false, shield: false, tool: 'sword', hairColor: pick([0x2a1d12, 0x5a3a1c, 0x1c1c1c, 0x8a5a2a, 0xb08040, 0x6a2a1a, 0xd8d8d8]), ...(female ? {} : Math.random() < 0.6 ? { beard: pick(['full', 'goatee', 'moustache']) } : {}), boots: pick([0x3a2a1a, 0x2b2b2b, 0x4a3020]) },
                bandit: roles[i],
            });
        }
        return out;
    }

    _make(x, z, yaw, o = {}) {
        const g = this.game, L = this.life, idx = L.index;
        const n = o.n || gangSize();
        const strategy = o.strategy || pickStrategy(n);
        const slot = [...Array(8).keys()].find((k) => ![...this.gangs.values()].some((P) => P.slot === k)) ?? 0;
        const def = idx.towers.wanderDef(slot, 77, 'wb'); // (a few sites of their own, used over and over: id 'wb<slot>_77')
        const serial = ++this._n;
        const killed = L.state(def.id).killed;
        const nums = [];
        for (let i = 1; i < 600 && nums.length < n; i++) if (!L.castles.get(def.id)?.active?.has(i) && !killed.has(i)) nums.push(i);
        if (nums.length < n) return false;
        def.people = this._roster({ serial, nums }, n, strategy);
        def.population = n + 1; def.color = pick(COLOURS);
        const cs = L._runtime(def);
        def.x = x; def.z = z;
        const P = { id: 'bandits' + serial, slot, kind: 'bandits', strategy, n, cs, members: [], horses: [], phase: 'approach', t: 0, target: null, deathAt: null, loot: [], lootT: 0, spawnedAt: Date.now(), seen: false };
        let made = 0;
        def.people.forEach((e, k) => {
            const at = { x: x + Math.sin(yaw) * 5 * k + Math.cos(yaw) * 1.6 * k, z: z + Math.cos(yaw) * 5 * k - Math.sin(yaw) * 1.6 * k };
            at.y = g.collision?.groundY ? g.collision.groundY(at.x, at.z) : 0;
            const v = L._activate(cs, e.idx, { x: at.x, y: at.y, z: at.z, yaw }, 'ride', { hp: BANDIT.HP, armor: BANDIT.ARMOR });
            if (!v) return;
            v.bandit = { P, role: e.bandit, k, st: 'close', t: 0, shootT: 1 + Math.random() * 2, ring: BANDIT.RING_R[0] + Math.random() * (BANDIT.RING_R[1] - BANDIT.RING_R[0]), dir: k % 2 ? 1 : -1, side: k % 2 ? 1 : -1 };
            v.party = null; v.outlaw = true;
            if (e.bandit === 'archer') v.fx = (v.fx | 0) | 1; // (the bow in the hand)
            if (!this.riders.mount(v, P, at.x, at.z, yaw)) { L._deactivate(v); return; }
            P.members.push(v); made++;
        });
        if (made < 2) { for (const v of P.members) { this.riders.unseat(v, false); L._deactivate(v); } this.riders.remove(P); return false; }
        P.n = P.members.length;
        this.gangs.set(P.id, P);
        this.log.push({ ev: 'spawn', id: P.id, n: P.n, strategy });
        allLog('Жители', `разбойная банда: ${P.n} всадников, стратегия «${STRATEGY[strategy].ru}», в ${Math.round(x)}, ${Math.round(z)}`);
        return P;
    }

    // ---------------------------------------------------------------- the gang's mind (host)
    _targetOf(P, players) {
        const lead = P.members.find((v) => !v.dead);
        if (!lead) return null;
        const cur = P.target && players.find((q) => q.id === P.target);
        const dist = (q) => Math.hypot(q.p.x - lead.x, q.p.z - lead.z);
        if (cur && dist(cur) < BANDIT.LOSE) return cur;
        let best = null, bd = BANDIT.LOSE;
        for (const q of players) { const d = dist(q); if (d < bd) { bd = d; best = q; } }
        return best;
    }

    _gang(P, dt, check) {
        const g = this.game, L = this.life;
        P.members = P.members.filter((v) => !v.removable);
        const alive = P.members.filter((v) => !v.dead);
        // the dead: what they carry falls (the first to die), and a few coins of their own
        for (const v of P.members) if (v.dead && !v._banditDropped) { v._banditDropped = true; this._drop(P, v); }
        if (!alive.length) { this._remove(P); return; }
        const lead = alive[0];
        P.cs.def.x = lead.x; P.cs.def.z = lead.z;
        P.t += dt;
        // thrown / the horse down: on the ground — and an ordinary knight with the player as his foe
        for (const v of alive) {
            if (!v.horse || !v.seated) continue;
            const a = v.horse;
            if (v.lev || v.vy || v.stunT > 0 || a.dead || a.lev || a.vy || a.stunT > 0 || !a.mount?.on) { this.riders.unseat(v, true); this._afoot(P, v); }
        }
        const mounted = alive.filter((v) => v.bandit && v.seated && v.horse);
        if (check) {
            const players = L._players();
            const tg = this._targetOf(P, players);
            if (tg) { P.target = tg.id; P.noTargetT = 0; P.fp = { x: tg.p.x, y: tg.p.y, z: tg.p.z }; }
            else if (!P.target && P.phase === 'approach') { P.noTargetT = (P.noTargetT || 0) + 0.25; if (P.noTargetT > 20) this._leave(P, false); } // (nobody within reach: they ride about a while and go)
            else if (P.target) { // (the target is gone: dead — they gather what he left; far — they give up)
                const dead = !players.some((q) => q.id === P.target);
                if (dead && P.fp && P.phase !== 'loot' && P.phase !== 'leave' && P.seenFight) { P.phase = 'loot'; P.lootT = 0; P.deathAt = { x: P.fp.x, z: P.fp.z }; this._say(P, pick(SHOUT.loot)); }
                else if (P.phase !== 'loot' && P.phase !== 'leave') this._leave(P, false);
                P.target = null;
            }
            // the hero went underground: riders do not follow a man into a cave — they give it up (he can hide)
            if (tg && P.phase !== 'leave' && P.phase !== 'loot' && inCaveAt(g, tg.id === g.localId ? g.character.group.position : tg.p)) { this._say(P, pick(BANDIT.CAVE_LINES)); this._leave(P, false); }
            // nerve
            if (P.phase !== 'loot' && P.phase !== 'leave' && broken(alive.length, P.n)) this._leave(P, true);
            if (this._gone(P, alive)) { this._remove(P); return; }
        }
        for (const v of mounted) this._ride(P, v, mounted, dt);
        if (P.phase === 'loot') this._loot(P, mounted, dt);
    }

    _say(P, text, who = null) {
        const L = this.life, v = who || P.members.find((m) => !m.dead);
        if (v && text) L._say(v, text, 3);
    }

    _leave(P, scared) {
        if (P.phase === 'leave') return;
        P.phase = 'leave'; P.t = 0;
        if (scared) this._say(P, pick(SHOUT.flee));
        for (const v of P.members) if (!v.dead && v.bandit) v.foe = null;
        this.log.push({ ev: 'leave', id: P.id, scared });
    }

    /** One rider's step: where to, how fast, what he does with his hands. */
    _ride(P, v, mounted, dt) {
        const g = this.game, B = v.bandit, a = v.horse, fp = P.fp;
        const horseYaw = a.group.rotation.y;
        let aim = horseYaw, speed = 0, mode = 'ride';
        const here = { x: v.x, z: v.z };
        const toward = (x, z, spd) => { const h = headTo(x - v.x, z - v.z); aim = this._steerTo(a, h, spd); speed = spd; };
        v.foe = null;
        if (!fp && P.phase === 'approach') { speed = BANDIT.STALK; aim = horseYaw; } // (no target yet: on at a walk)
        else if (P.phase === 'leave' || (!fp && P.phase !== 'loot')) {
            // away from every player
            const away = fp ? headTo(fp.x - v.x, fp.z - v.z) + Math.PI : horseYaw;
            aim = this._steerTo(a, away, BANDIT.RUN); speed = BANDIT.RUN;
        } else if (P.phase === 'loot') {
            const c = P.deathAt || here;
            const d = Math.hypot(c.x - v.x, c.z - v.z);
            if (d > 3.5) toward(c.x, c.z, d > 14 ? BANDIT.RUN : BANDIT.RING);
        } else if (P.phase === 'approach') {
            this._approach(P, v, B, fp, toward, mounted, dt);
            // (the moment they are on him — everybody)
            const d = Math.hypot(fp.x - v.x, fp.z - v.z);
            if (!P.seen && d < BANDIT.NOTICE) { P.seen = true; if (Math.random() < 0.7) this._say(P, pick(SHOUT[P.strategy] || SHOUT.sight), v); }
        }
        if (P.phase === 'attack' && fp) {
            P.seenFight = true;
            const d = Math.hypot(fp.x - v.x, fp.z - v.z);
            if (B.role === 'rider') {
                const r = this._swordsman(P, v, B, fp, d, dt);
                aim = this._steerTo(a, r.heading, r.speed); speed = r.speed; mode = r.mode;
                if (r.strike) v.foe = P.target;
            } else {
                const r = this._archer(P, v, B, fp, d, dt);
                aim = this._steerTo(a, r.heading, r.speed); speed = r.speed; mode = r.mode;
            }
        }
        v.mode = mode;
        this.riders._move(a, aim, speed, dt);
        this.riders._place(v, a);
        v.mode = mode;
        v.speed = speed;
        if (mode === 'rideShoot' && fp) { v.model.aimSide = shotTurn(a.group.rotation.y, fp.x - v.x, fp.z - v.z).rel; v.aimPitch = Math.max(-1, Math.min(1, Math.atan2(fp.y + 0.6 - (v.y + 0.5), Math.max(1, Math.hypot(fp.x - v.x, fp.z - v.z))))); } else if (v.model) v.model.aimSide = 0;
    }

    /** The free heading nearest to the wanted one (round trees, walls, water): the road riders' own look-ahead. */
    _steerTo(a, want, speed) { return this.riders._way(a, want, Math.max(4, speed), null) ?? want; }

    // ---------------------------------------------------------------- the approach (by strategy)
    _approach(P, v, B, fp, toward, mounted, dt) {
        const d = Math.hypot(fp.x - v.x, fp.z - v.z);
        const dmin = Math.min(...mounted.map((m) => Math.hypot(fp.x - m.x, fp.z - m.z)));
        switch (P.strategy) {
            case 'charge':
                toward(fp.x, fp.z, BANDIT.CHARGE);
                if (dmin < 40) this._attack(P);
                break;
            case 'circle': {
                const a = Math.atan2(v.z - fp.z, v.x - fp.x), R = B.ring;
                if (d > R + 16) toward(fp.x, fp.z, BANDIT.RUN);
                else { const h = ringHeading(v.x, v.z, fp.x, fp.z, R, B.dir); toward(v.x - Math.sin(h) * 6, v.z - Math.cos(h) * 6, BANDIT.RING); }
                void a;
                if (dmin < R + 8) this._attack(P);
                break;
            }
            case 'ambush': {
                if (!P.ambush || P.ambushT <= 0) {
                    const ly = this._lookYaw(P);
                    P.ambush = behindPoint(fp.x, fp.z, ly, 42);
                    P.ambushT = 2.5;
                }
                P.ambushT -= dt / Math.max(1, mounted.length);
                const ap = { x: P.ambush.x + Math.cos(B.k * 1.7) * 5, z: P.ambush.z + Math.sin(B.k * 1.7) * 5 };
                const da = Math.hypot(ap.x - v.x, ap.z - v.z);
                if (da > 6 && P.t < 30) toward(ap.x, ap.z, d > 70 ? BANDIT.RUN : BANDIT.STALK);
                else { toward(fp.x, fp.z, BANDIT.STALK); }
                // (they fall on when he is near, hurt, or time has run out)
                if (dmin < 24 || (P.t > 30 && dmin < 60) || P.t > 55 || this._hurt(P)) this._attack(P);
                break;
            }
            case 'pincer': {
                if (!P.flanks) P.flanks = flankPoints(fp.x, fp.z, v.x, v.z, 30);
                const f = P.flanks[B.k % 2];
                const df = Math.hypot(f.x - v.x, f.z - v.z);
                if (df > 7) toward(f.x, f.z, BANDIT.RUN); else toward(fp.x, fp.z, BANDIT.STALK);
                B.inPlace = df <= 10;
                const all = mounted.every((m) => m.bandit?.inPlace || Math.hypot(fp.x - m.x, fp.z - m.z) < 20);
                if ((all && mounted.length >= 2) || P.t > 16 || dmin < 16) this._attack(P);
                break;
            }
            default: toward(fp.x, fp.z, BANDIT.RUN);
        }
    }

    _attack(P) {
        if (P.phase !== 'approach') return;
        P.phase = 'attack'; P.attackT = 0; P.turnT = 0; P._going = null;
        for (const v of P.members) if (v.bandit?.role === 'rider') { v.bandit.st = P.strategy === 'circle' ? 'wait' : 'close'; v.bandit.t = 0; }
        this._say(P, pick(SHOUT.charge));
        this.log.push({ ev: 'attack', id: P.id, strategy: P.strategy });
    }

    /** Where the player looks (yaw): the local one — the camera; another — away from where the gang came. */
    _lookYaw(P) {
        const g = this.game, q = g.camera?.quaternion;
        if (P.target === g.localId && q) { const fx = -2 * (q.x * q.z + q.w * q.y), fz = -(1 - 2 * (q.x * q.x + q.y * q.y)); return Math.atan2(-fx, -fz); }
        const lead = P.members.find((v) => !v.dead), fp = P.fp;
        return lead && fp ? headTo(lead.x - fp.x, lead.z - fp.z) + Math.PI : 0;
    }

    /** Was the player hurt since they began (his health below what it was)? */
    _hurt(P) {
        const c = this.game.combat;
        if (P.target !== this.game.localId || !c) return false;
        if (P.hp0 == null) P.hp0 = c.hp;
        return c.hp < P.hp0 - 0.5;
    }

    // ---------------------------------------------------------------- the swordsman
    _swordsman(P, v, B, fp, d, dt) {
        B.t += dt;
        let heading = headTo(fp.x - v.x, fp.z - v.z), speed = BANDIT.CHARGE, mode = 'ride', strike = false;
        if (B.st === 'wait') {
            // on the ring till his turn: they go in one after another, not all at once
            heading = ringHeading(v.x, v.z, fp.x, fp.z, B.ring + 3, B.dir);
            speed = BANDIT.RING;
            P.turnT = (P.turnT || 0) + dt / Math.max(1, P.members.filter((m) => m.bandit?.role === 'rider' && !m.dead).length);
            const goer = P._going ? P.members.find((m) => m.id === P._going && !m.dead && m.bandit && m.bandit.st !== 'wait') : null;
            if (!goer && (P.turnT > 2.2 || this._hurt(P))) { B.st = 'close'; B.t = 0; P._going = v.id; P.turnT = 0; }
            return { heading, speed, mode, strike };
        }
        if (B.st === 'pass') {
            // on past him, then wheel round
            heading = headTo(v.x - fp.x, v.z - fp.z); // (straight on, away from the target)
            speed = BANDIT.CHARGE;
            if (d > BANDIT.PASS_AWAY || B.t > 3.2) { B.st = P.strategy === 'circle' ? 'wait' : 'close'; B.t = 0; if (P._going === v.id) P._going = null; }
            return { heading, speed, mode, strike };
        }
        // closing on him
        if (d < BANDIT.REACH + 1.6) {
            // the blow from the saddle: the sword arm swings while he rides at him; the strike lands by CastleLife._strike (range, the face turned to him)
            mode = 'rideAttack'; strike = true;
            speed = Math.max(5, BANDIT.CHARGE * Math.min(1, d / 6));
            if (d < 2.0 || B.t > 6) { B.st = 'pass'; B.t = 0; }
        } else if (d < 16) {
            speed = BANDIT.CHARGE;
            // (aims a little ahead of a walking man)
        }
        return { heading, speed, mode, strike };
    }

    // ---------------------------------------------------------------- the archer
    _archer(P, v, B, fp, d, dt) {
        B.shootT -= dt;
        const R = B.ring;
        let heading = ringHeading(v.x, v.z, fp.x, fp.z, d < 7 ? R + 8 : R, B.dir), speed = BANDIT.RING, mode = 'ride';
        if (d < 6) { heading = headTo(v.x - fp.x, v.z - fp.z); speed = BANDIT.RUN; } // (somebody comes close: back off)
        if (d > R + 22) { heading = headTo(fp.x - v.x, fp.z - v.z); speed = BANDIT.RUN; }
        // draw and loose from the saddle (the body turned to the target; not further than the torso can turn)
        const turn = shotTurn(v.horse.group.rotation.y, fp.x - v.x, fp.z - v.z);
        if (B.drawing > 0) {
            mode = 'rideShoot';
            B.drawing -= dt;
            if (B.drawing <= 0) {
                B.drawing = 0;
                if (turn.ok && d < 38 && this._clear(v, fp)) this._loose(P, v, fp);
                B.shootT = BANDIT.SHOOT_EVERY[0] + Math.random() * (BANDIT.SHOOT_EVERY[1] - BANDIT.SHOOT_EVERY[0]);
            }
        } else if (B.shootT <= 0 && turn.ok && d < 36 && d > 4) { B.drawing = BANDIT.DRAW_T; mode = 'rideShoot'; }
        return { heading, speed, mode };
    }

    _clear(v, fp) {
        const c = this.game.collision;
        return c?.lineOfSight ? c.lineOfSight(v.x, v.y + 0.4, v.z, fp.x, fp.y + 0.4, fp.z, 1.0) : true;
    }

    /** (host) An arrow off a robber's bow from the saddle: aimed and led, a little off — they shoot on the move. */
    _loose(P, v, fp) {
        const g = this.game;
        if (!g.gear?.fire) return;
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        const from = new THREE.Vector3(v.x + fx * 0.6, v.y + 0.0, v.z + fz * 0.6); // (v.y is the saddle's top: the shoulders are a little over it)
        from.y += 2.2;
        const to = { x: fp.x, y: fp.y + 0.6, z: fp.z };
        const aim = aimArrow(from, to, null, BANDIT.ARROW_SPEED);
        if (!aim) return;
        const D = Math.hypot(to.x - from.x, to.z - from.z), err = 0.02 + D * 0.0026; // (worse than a standing knight's: the horse shakes)
        const vel = new THREE.Vector3(aim.x, aim.y, aim.z);
        vel.applyAxisAngle(_a.set(0, 1, 0), (Math.random() - 0.5) * 2 * err);
        vel.y += (Math.random() - 0.5) * 2 * err * BANDIT.ARROW_SPEED;
        g.gear.fire(from, vel, BANDIT.ARROW_DMG, v.id);
        g.sync?.arrow?.(from, vel, BANDIT.ARROW_DMG, v.id);
        const me = g.character?.group?.position;
        if (me && Math.hypot(me.x - v.x, me.z - v.z) < 40) g.sound?.playBowRelease?.(0.7);
    }

    // ---------------------------------------------------------------- the dead target: what he dropped
    _loot(P, mounted, dt) {
        const g = this.game, it = g.items;
        P.lootT += dt;
        if (P.lootT > BANDIT.LOOT_T || !P.deathAt) { this._leave(P, false); return; }
        P._pickT = (P._pickT || 0) - dt;
        if (P._pickT > 0 || !it?.loose) return;
        const c = P.deathAt;
        const near = mounted.filter((v) => Math.hypot(c.x - v.x, c.z - v.z) < 5.5);
        if (!near.length) return;
        // the nearest loose thing round the body (not his wand: it comes back to him; not a good of a shop)
        let best = null, bd = BANDIT.LOOT_R;
        for (const [uid, L] of it.loose) {
            const p = L.model?.position;
            if (!p || L.item.kind === 'wand' || (L.item.shop && !L.item.shop.paid)) continue;
            const d = Math.hypot(p.x - c.x, p.z - c.z);
            if (d < bd) { bd = d; best = uid; }
        }
        P._pickT = 0.7;
        if (!best || P.loot.length >= BANDIT.LOOT_MAX) { if (!best) P.lootT = Math.max(P.lootT, BANDIT.LOOT_T - 3); return; }
        const taker = near[0];
        const item = it.removeLoose(best);
        if (!item) return;
        g.sync?.itemGone?.(best, '#' + taker.id, null);
        P.loot.push(item);
        allLog('Предметы', `разбойники забрали: ${item.kind}${item.count > 1 ? ' ×' + item.count : ''} (всего у банды ${P.loot.length})`);
    }

    /** One of them died: what the gang carries falls with him (the first to fall holds it all), and a few coins of his own. */
    _drop(P, v) {
        const g = this.game, it = g.items;
        if (!it?.spawnLoose) return;
        const at = new THREE.Vector3(v.x, (v.y ?? 0) + 0.8, v.z);
        const coins = BANDIT.COIN_DROP[0] + Math.floor(Math.random() * (BANDIT.COIN_DROP[1] - BANDIT.COIN_DROP[0] + 1));
        it.spawnLoose({ kind: 'coins', uid: newUid(), count: coins }, at);
        while (P.loot.length) it.spawnLoose(P.loot.pop(), at.clone().add(_a.set((Math.random() - 0.5) * 2, 0.2 + Math.random(), (Math.random() - 0.5) * 2)), { vel: new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3) });
    }

    // ---------------------------------------------------------------- on foot / gone
    /** He is on the ground: an ordinary knight with the player as his foe (the standard knight AI takes him). */
    _afoot(P, v) {
        v.foe = P.target || v.foe;
        v.bandit = null; v.job = 'wander'; v.party = null; // (the knight's own mind from now on)
        this.log.push({ ev: 'afoot', id: v.id });
    }

    /** (host, Travelers.step) The robber is not in the saddle (or never will be): an ordinary knight now. True: handled. */
    step(v) {
        const B = v.bandit;
        if (!B) return false;
        if (v.seated && v.horse) return true; // (in the saddle: _ride leads him)
        v.bandit = null; v.job = 'wander'; v.party = null; // (down: the knight's own mind — he fights the player)
        if (B.P?.target) v.foe = B.P.target;
        v.path = null;
        return false;
    }

    _gone(P, alive) {
        const g = this.game, L = this.life;
        const x = alive[0].x, z = alive[0].z;
        const players = L._players();
        const dmin = Math.min(...players.map((pl) => Math.hypot(pl.p.x - x, pl.p.z - z)), Infinity);
        if (dmin > BANDIT.GONE * 2) return true;
        if (P.phase === 'leave' || P.phase === 'approach' && !P.target && P.t > 60) {
            const look = g.animals?._look?.(_look), me = g.character?.group.position;
            const unseen = !look || !me || outOfSight(me, look, x, z, 1.2);
            return dmin > 160 && unseen || dmin > BANDIT.GONE;
        }
        return dmin > BANDIT.GONE * 1.3 && !P.target;
    }

    _remove(P) {
        const L = this.life;
        for (const v of P.members) if (!v.dead && !v.removable) L._deactivate(v);
        for (const v of P.members) { v.bandit = null; v.party = null; }
        this.riders.remove(P);
        P.members = [];
        this.gangs.delete(P.id);
        this.log.push({ ev: 'gone', id: P.id });
    }

    dispose() { for (const P of [...this.gangs.values()]) this._remove(P); }
}
