/**
 * Travelers.js — the people of the roads: so that the world seems alive (the author: «there are
 * wanderers who walk about: knights errant, wandering wizards — I never met them, they must be
 * met at least twice as often»; «a horse pulls a cart, wizards ride in it with a chest of
 * valuables; the same, less magical — ordinary people going to town; people's carts more often,
 * the wizards' a little rarer»).
 *
 * Who goes (the host decides, every ROAD.EVERY s, a chance; never more than ROAD.MAX parties):
 *  - wandering wizards (1–2, «Странник»), on foot, with their staffs;
 *  - knights errant (1–2), on foot, sword and bow;
 *  - a people's cart: a horse, a driver and 1–2 more going to town (farmers, builders, merchants);
 *  - a wizards' carriage: two horses, a driver and 1–2 more wizards with a chest of valuables.
 * They appear 75–115 m from a player, out of sight (never popping up in front of anybody), on
 * their way from somewhere to a castle, a village or a wizards' tower that lies past the player
 * (so they really come by), or far beyond; they go round water, slopes, trees, walls and other
 * castles' lands (Carriages.wayFree). Out of everybody's sight far away, or arrived — gone.
 *
 * They are castle people of «road sites» (WizardTowers.wanderDef: 'ww' wizards, 'wk' knights,
 * 'wc' folk): everything that works on castle people works on them — blows, spells, fear, talk,
 * the network (their ids), the dead stay dead (the site's `killed`). Their site moves with them.
 *
 * Attacked (a rider, a walker, a horse, the cart, the chest): the cart stops, the riders jump
 * down; the wizards and the knights fight the attacker (WizardFight / CastleLife._fight) —
 * the wizards defend their chest; the people run away (VillagerFear). Calm again: back on the
 * cart and on their way. The cart broken or its horses gone: they go on foot.
 */

import * as THREE from 'three';
import { CART, wayFree } from './Carriages.js';
import { outOfSight } from './Animals.js';
import { WANDER_GRID } from '../world/WizardTowers.js';
import { CappedLog } from '../core/CappedLog.js';
import { earthly } from '../world/Planets.js';

export const ROAD = {
    EVERY: 20, // s between tries
    CHANCE: 0.16, CHANCE_NIGHT: 0.07, // a try's chance (about a party every two minutes by day)
    MAX: 3, // parties at once
    NEAR: [75, 115], // m from a player where they appear
    GONE: 240, // m from every player (and out of sight): gone
    DEST: [220, 1500], // m to where they go
    CALM: 12, // s with nobody fighting / afraid: back on the way
    HOSTILE_MS: 90000,
    // what goes on the roads (weights): by day, at night
    DAY: { folkCart: 0.32, wizCart: 0.2, wizards: 0.24, knights: 0.24 },
    NIGHT: { folkCart: 0.12, wizCart: 0.18, wizards: 0.4, knights: 0.3 },
};

const TYPE = { folkCart: 'wc', wizCart: 'ww', wizards: 'ww', knights: 'wk' };
const GREET = {
    folkCart: ['Доброго пути!', 'Здравствуй, путник!', 'В город едем, на ярмарку.', 'Тпру… Здравствуй!'],
    wizCart: ['Светлой дороги.', 'Не подходи к сундуку, путник.', 'Мы едем в башню. Не задерживай нас.'],
    wizards: ['Долгая дорога…', 'Светлой дороги, путник.', 'Видал я и не такое в пути.'],
    knights: ['Честь и слава!', 'Доброй дороги, путник.', 'Мы странствуем от замка к замку.'],
};
const ALARM = {
    wizCart: ['Защищайте сундук!', 'Нападение! К оружию!'],
    wizards: ['Ты пожалеешь об этом!'],
    knights: ['К оружию!', 'За честь!'],
    folkCart: ['Разбойники!', 'Помогите!', 'Бежим!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** A weighted pick of what goes on the road. */
export function pickKind(night, rnd = Math.random) {
    const W = night ? ROAD.NIGHT : ROAD.DAY;
    let s = 0;
    for (const k in W) s += W[k];
    let r = rnd() * s;
    for (const k in W) { r -= W[k]; if (r <= 0) return k; }
    return 'wizards';
}

export class Travelers {
    constructor(game) {
        this.game = game;
        this.parties = new Map(); // id → party
        this._t = ROAD.EVERY * 0.5;
        this._checkT = 0;
        this._n = 0;
        this.log = new CappedLog();
    }

    get auth() { return this.game.authority; }
    get life() { return this.game.castleLife; }

    // ---------------------------------------------------------------- frame (host)
    update(dt) {
        const L = this.life;
        if (!this.auth || !L?.enabled || !L.index) return;
        this._t -= dt;
        if (this._t <= 0) {
            this._t = ROAD.EVERY * (0.8 + Math.random() * 0.4);
            if (this.parties.size < ROAD.MAX && Math.random() < (this.game.isNight ? ROAD.CHANCE_NIGHT : ROAD.CHANCE)) this.spawnNear();
        }
        this._checkT -= dt;
        const check = this._checkT <= 0;
        if (check) this._checkT = 0.25;
        for (const P of [...this.parties.values()]) {
            P.members = P.members.filter((v) => !v.removable);
            const alive = P.members.filter((v) => !v.dead);
            if (check) this._watch(P, alive, 0.25);
            if (!alive.length && !P.cart) { this._remove(P); continue; }
            // their site walks with them (the knights' leash: CastleLife._fight)
            const lead = alive[0];
            if (lead) { P.cs.def.x = lead.x; P.cs.def.z = lead.z; }
            if (P.cart && !P.cart.wreck) this._drive(P, alive, dt);
            if (check && this._gone(P, alive)) this._remove(P);
        }
    }

    /** (host) Something goes on the road near a player: who and where (false: no good place now). */
    spawnNear(kind = null, o = {}) {
        const g = this.game, L = this.life, idx = L?.index;
        if (!idx?.towers?.wanderDef || !g.carriages) return false;
        const players = L._players();
        if (!players.length) return false;
        const pl = o.player || players[Math.floor(Math.random() * players.length)];
        if (!earthly(pl.p)) return false; // (no travellers off the Earth)
        if (idx.landAt?.(Math.round(pl.p.x), Math.round(pl.p.z))) return false; // (in a castle, a village, a tower: not there)
        kind = kind || pickKind(g.isNight);
        const cart = kind === 'folkCart' || kind === 'wizCart';
        const look = pl.id === g.localId ? g.animals?._look?.(_look) : null;
        for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2, d = ROAD.NEAR[0] + Math.random() * (ROAD.NEAR[1] - ROAD.NEAR[0]);
            const x = o.at?.x ?? pl.p.x + Math.cos(a) * d, z = o.at?.z ?? pl.p.z + Math.sin(a) * d;
            if (!o.at && look && !outOfSight(pl.p, look, x, z)) continue;
            if (!o.at && players.some((q) => Math.hypot(q.p.x - x, q.p.z - z) < ROAD.NEAR[0] * 0.8)) continue;
            if (idx.landAt?.(Math.round(x), Math.round(z))) continue;
            const dest = o.dest || this._dest(x, z, pl.p);
            const yaw = Math.atan2(-(dest.x - x), -(dest.z - z));
            // a firm, dry, open place (a cart needs room to start)
            const need = cart ? 10 : 3;
            if (wayFree(g, x, z, -Math.sin(yaw), -Math.cos(yaw), need, { half: cart ? CART.WID / 2 : 0.5, rise: 1, avoidLand: true, into: dest.into }) < need) continue;
            return this._make(kind, x, z, yaw, dest);
        }
        return false;
    }

    /** Where they go: a castle, a village or a tower past the player (they come by), else far beyond. */
    _dest(x, z, through) {
        const idx = this.life.index;
        const dir = Math.atan2(through.z - z, through.x - x);
        const opts = [];
        for (const c of idx.near?.(through.x, through.z, 900) || []) {
            if (!c || c.kind === 'wander' || c.kind === 'errant' || c.kind === 'folk') continue;
            const d = Math.hypot(c.x - x, c.z - z);
            if (d < ROAD.DEST[0] || d > ROAD.DEST[1]) continue;
            let da = Math.atan2(c.z - z, c.x - x) - dir;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            if (Math.abs(da) < 1.0) opts.push(c);
        }
        if (opts.length) {
            const c = opts[Math.floor(Math.random() * opts.length)];
            return { x: c.x, z: c.z, r: (c.zone || 20) + 14, into: c.id, name: c.name };
        }
        const far = 700, side = (Math.random() - 0.5) * 300;
        return { x: x + Math.cos(dir) * far - Math.sin(dir) * side, z: z + Math.sin(dir) * far + Math.cos(dir) * side, r: 12, into: null };
    }

    /** A party on the road. */
    _make(kind, x, z, yaw, dest) {
        const g = this.game, L = this.life, idx = L.index;
        const type = TYPE[kind];
        // (their own site: a 700 m cell not used by another party of the same kind just now)
        let gx = Math.floor(x / WANDER_GRID), gz = Math.floor(z / WANDER_GRID);
        while ([...this.parties.values()].some((P) => P.cs.def.id === type + gx + '_' + gz)) gx += 1000;
        const def = idx.towers.wanderDef(gx, gz, type);
        const cs = L._runtime(def);
        def.x = x; def.z = z;
        const n = kind === 'folkCart' || kind === 'wizCart' ? 2 + (Math.random() < 0.5 ? 1 : 0) : 1 + (Math.random() < 0.5 ? 1 : 0);
        const killed = L.state(def.id).killed;
        const nums = [];
        for (let i = 1; i < 400 && nums.length < n; i++) if (!cs.active.has(i) && !killed.has(i)) nums.push(i);
        if (!nums.length) return false;
        const P = { id: 'road' + (++this._n), kind, cs, dest, members: [], cart: null, state: 'go', calmT: 0, greetT: 6, stuckT: 0 };
        const carts = g.carriages;
        if (kind === 'folkCart' || kind === 'wizCart') {
            P.cart = carts.spawn(kind === 'wizCart', x, z, yaw);
            P.cart.party = P;
        }
        nums.forEach((i, k) => {
            let at;
            if (P.cart) at = carts.seatPos(P.cart, k, {});
            else {
                // (on foot: one after another along the way)
                at = { x: x + Math.sin(yaw) * 2.6 * k, z: z + Math.cos(yaw) * 2.6 * k };
                at.y = g.collision?.groundY ? g.collision.groundY(at.x, at.z) : 0;
                at.yaw = yaw;
            }
            const v = L._activate(cs, i, { x: at.x, y: at.y, z: at.z, yaw: at.yaw ?? yaw }, P.cart ? 'cart' : 'road');
            if (!v) return;
            v.party = P;
            if (P.cart) { v.seat = k; v.seated = true; P.cart.seats[k] = v.id; v.mode = 'sit'; }
            P.members.push(v);
        });
        if (!P.members.length) { if (P.cart) carts.remove(P.cart); return false; }
        this.parties.set(P.id, P);
        this.log.push({ ev: 'spawn', kind, id: P.id, n: P.members.length, dest: dest.name || null });
        return P;
    }

    // ---------------------------------------------------------------- the cart
    _drive(P, alive, dt) {
        const c = P.cart, carts = this.game.carriages;
        const driver = alive.find((v) => v.seat === 0 && v.seated);
        const allIn = alive.every((v) => (v.seated || v.seat == null) && !(v.talking > 0)); // (somebody talking with a player: «Тпру!» — it waits)
        let want = 0;
        if (P.state === 'go' && driver && allIn && carts.canGo(c)) want = CART.WALK;
        const left = carts.drive(c, P.dest.x, P.dest.z, want, dt, { into: P.dest.into });
        if (P.state === 'go' && left < P.dest.r) this._arrive(P);
        // stuck for long (no way round): they get down and go on foot
        if (want > 0 && c.spd < 0.05) P.stuckT += dt; else P.stuckT = 0;
        if (P.stuckT > 25) { P.stuckT = 0; this._onFoot(P, alive); }
        // the cart can't go any more (broken, the horses dead or gone): on foot
        if (!carts.canGo(c) && P.state === 'go' && !c.wreck && alive.length && !this._harnessed(c)) this._onFoot(P, alive);
    }

    _harnessed(c) { return this.game.carriages.horsesOf(c).some((a) => !a.dead && a.cart?.id === c.id); }

    /** Off the cart and on their way on foot (the cart stays there). */
    _onFoot(P, alive) {
        for (const v of alive) {
            if (v.seated) this._getDown(v);
            v.job = 'road'; v.seat = null;
        }
        if (P.cart) P.cart.party = null;
        P.cart = null;
        this.log.push({ ev: 'onFoot', id: P.id });
    }

    _getDown(v) {
        const P = v.party, c = P?.cart;
        v.seated = false;
        if (c && v.seat != null) {
            const e = this.game.carriages.exitPos(c, v.seat, {});
            v.x = e.x; v.z = e.z; v.y = e.y;
        }
    }

    _arrive(P) {
        P.state = 'arrived';
        this.log.push({ ev: 'arrive', id: P.id });
    }

    // ---------------------------------------------------------------- trouble
    /** (host) Are they attacked (somebody fights them, frightens them, hurts them)? Calm again? */
    _watch(P, alive, dt) {
        const L = this.life;
        let by = null, trouble = false;
        for (const v of P.members) {
            const hurt = v.hp < (v._roadHp ?? v.hp) || (v.dead && !v._roadDead);
            v._roadHp = v.hp; if (v.dead) v._roadDead = true;
            const who = v.foe || v.fear?.danger?.by || v.fleeFrom || v.grudge?.id || null;
            if (v.foe || v.fear || v.fleeT > 0 || hurt) { trouble = true; by = by || who; }
        }
        if (trouble && P.state !== 'trouble') this.trouble(P, by || P.cart?.hitBy || null);
        if (P.state === 'trouble') {
            P.calmT = trouble ? 0 : P.calmT + dt;
            if (P.calmT > ROAD.CALM) { P.state = 'go'; P.calmT = 0; this.log.push({ ev: 'calm', id: P.id }); }
        }
        // greeting a player who comes near
        P.greetT -= dt;
        if (P.state === 'go' && P.greetT <= 0 && alive.length) {
            for (const pl of L._players()) {
                const v = alive.find((m) => Math.hypot(m.x - pl.p.x, m.z - pl.p.z) < 11);
                if (v) { P.greetT = 45; L._say(v, pick(GREET[P.kind])); break; }
            }
        }
        // the chest touched («Алохомора» on it, or opened): that is an attack on the wizards
        const ch = P.cart?.chest;
        if (ch && (ch.picked || ch.isOpen) && !P.chestSeen) { P.chestSeen = true; this.trouble(P, this._nearestPlayer(ch.mesh.position)); }
    }

    _nearestPlayer(p) {
        let best = null, bd = 30;
        for (const pl of this.life._players()) { const d = Math.hypot(pl.p.x - p.x, pl.p.z - p.z); if (d < bd) { bd = d; best = pl.id; } }
        return best;
    }

    /** (host) The party is attacked by `by` (a player's id, or null): stop, get down, fight or run. */
    trouble(P, by) {
        const L = this.life, g = this.game;
        if (P.state !== 'trouble') this.log.push({ ev: 'trouble', id: P.id, by });
        P.state = 'trouble'; P.calmT = 0;
        const isPlayer = by != null && (by === g.localId || g.remotes?.has(by));
        if (isPlayer) P.cs.hostile.set(by, Date.now() + ROAD.HOSTILE_MS);
        let said = false;
        const from = isPlayer ? L._playerPos(by) : null;
        const at = from ? { x: from.x, y: from.y - 1.95, z: from.z } : P.cart ? { x: P.cart.x, y: P.cart.y, z: P.cart.z } : null;
        for (const v of P.members) {
            if (v.dead) continue;
            if (v.seated) this._getDown(v);
            if (L._fights(v)) {
                if (isPlayer && !v.foe) { v.foe = by; v.path = null; }
            } else if (at && !v.fear) L.fright?.scare?.(v, 'attacker', at, by);
            if (!said && Math.random() < 0.8) { said = true; L._say(v, pick(ALARM[P.kind])); }
        }
    }

    /** (host, from Carriages) The cart was hit. */
    cartHit(c, by) { if (c.party) this.trouble(c.party, by); }

    /** (host, from Animals.hit) A harnessed horse was hit. */
    horseHit(a, by) {
        const c = this.game.carriages?.ofHorse(a);
        if (c?.party) this.trouble(c.party, by);
    }

    // ---------------------------------------------------------------- the people (from CastleLife._think)
    /** (host) One step of a traveller (jobs 'road' and 'cart'). True: handled. */
    step(v, dt) {
        const P = v.party, L = this.life;
        if (!P) { v.job = 'wander'; return false; }
        if (v.job === 'cart') return this._rider(v, P, dt);
        // on foot
        if (P.state !== 'go') { v.speed = 0; v.mode = v.talking > 0 ? 'talk' : 'idle'; L._ground(v); return true; }
        const walkers = P.members.filter((m) => !m.dead && m.job === 'road');
        const lead = walkers[0];
        if (v === lead) {
            const lag = walkers.some((m) => m !== v && Math.hypot(m.x - v.x, m.z - v.z) > 12);
            const left = Math.hypot(P.dest.x - v.x, P.dest.z - v.z);
            if (left < P.dest.r) { this._arrive(P); v.speed = 0; v.mode = 'idle'; L._ground(v); return true; }
            v.roadT = (v.roadT || 0) - dt;
            if (v.roadT <= 0 || v.roadAim == null) { v.roadT = 0.8; v.roadAim = this._footHeading(v, P); }
            if (v.roadAim == null || lag) { v.speed = 0; v.mode = 'idle'; L._ground(v); return true; }
            const tx = v.x - Math.sin(v.roadAim) * 6, tz = v.z - Math.cos(v.roadAim) * 6;
            L._steer(v, tx, tz, (v.walk || 2.3) * 0.85, dt);
            v.mode = v.speed > 0 ? 'walk' : 'idle';
        } else if (lead) {
            // after the leader, a little to the side
            const k = walkers.indexOf(v);
            const back = 2.6 * k, side = k % 2 ? 1.2 : -1.2;
            const fy = lead.yaw;
            const tx = lead.x + Math.sin(fy) * back + Math.cos(fy) * side, tz = lead.z + Math.cos(fy) * back - Math.sin(fy) * side;
            const d = Math.hypot(tx - v.x, tz - v.z);
            L._steer(v, tx, tz, d > 5 ? 4.2 : (v.walk || 2.3) * 0.95, dt, 0.4);
            v.mode = v.speed > 2.4 * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        }
        L._ground(v);
        return true;
    }

    /** The way on foot: straight at the goal if free, else the nearest free way round. */
    _footHeading(v, P) {
        const direct = Math.atan2(-(P.dest.x - v.x), -(P.dest.z - v.z));
        for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
            const a = direct + off;
            if (wayFree(this.game, v.x, v.z, -Math.sin(a), -Math.cos(a), 8, { half: 0.5, rise: 2, clear: 5, avoidLand: true, into: P.dest.into }) >= 8) return a;
        }
        return null;
    }

    /** A rider: on the seat while they go; down beside the cart in trouble; back up when it is over. */
    _rider(v, P, dt) {
        const L = this.life, c = P.cart, carts = this.game.carriages;
        if (!c || c.wreck || v.seat == null) { v.job = 'road'; v.seated = false; return this.step(v, dt); }
        if (v.seated) {
            const s = carts.seatPos(c, v.seat, _seat);
            v.x = s.x; v.y = s.y; v.z = s.z; v.yaw = s.yaw;
            v.speed = 0; v.mode = 'sit';
            return true;
        }
        // down: back to the cart when it is calm, else stay by it
        const e = carts.exitPos(c, v.seat, _seat);
        const d = L._steer(v, e.x, e.z, P.state === 'go' ? (v.walk || 2.3) : (v.walk || 2.3) * 0.6, dt, 0.6);
        v.mode = v.speed > 0 ? 'walk' : 'idle';
        if (P.state === 'go' && d < 1.2) { v.seated = true; v.mode = 'sit'; }
        L._ground(v);
        return true;
    }

    // ---------------------------------------------------------------- gone
    /** Far from everybody and out of sight, or arrived and nobody near: gone. */
    _gone(P, alive) {
        const L = this.life, g = this.game;
        const c = P.cart;
        const x = alive[0]?.x ?? c?.x, z = alive[0]?.z ?? c?.z;
        if (x == null) return true;
        const players = L._players();
        const dmin = Math.min(...players.map((pl) => Math.hypot(pl.p.x - x, pl.p.z - z)), Infinity);
        const look = g.animals?._look?.(_look);
        const me = g.character?.group.position;
        const unseen = !look || !me || outOfSight(me, look, x, z, 1.2);
        if (dmin > ROAD.GONE * 2) return true; // (too far to be seen at all)
        if (P.state === 'arrived') return dmin > 90 && unseen;
        return dmin > ROAD.GONE && unseen;
    }

    _remove(P) {
        const L = this.life;
        for (const v of P.members) if (!v.dead && !v.removable) L._deactivate(v);
        for (const v of P.members) v.party = null;
        if (P.cart) { P.cart.party = null; if (!P.cart.wreck) this.game.carriages.remove(P.cart); }
        this.parties.delete(P.id);
        this.log.push({ ev: 'gone', id: P.id });
    }

    dispose() { for (const P of [...this.parties.values()]) this._remove(P); }
}

const _seat = {};
const _look = new THREE.Vector3();
