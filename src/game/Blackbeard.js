/**
 * Blackbeard.js — Captain Black Moustache («капитан Чёрные Усы») and his black ship.
 *
 * One black ship in the whole world (the host decides: the same sea for the same seed — `pirateSea` — and the
 * ship is one of Ships.js's, saved with them): it sails the open sea and never comes into a port (it keeps
 * BB.KEEP_OFF m off any shore). Its crew (Sailors.js, the roles 'blackbeard' and 'skeleton'): the captain —
 * 100 HP, his rapier, no magic, he beats duel charges aside with his blade (Sailors.parryBolt → Duel._deflect) —
 * and his skeletons (12 HP, cutlasses, boarding axes, pistols).
 *
 * What it does (the host runs it):
 *  - patrol: round its sea, far from the shores;
 *  - it sees a ship or a boat with a player aboard, a swimmer, a player on the shore by the sea (BB.SEE m): it
 *    closes in, turns its side to them and fires its broadsides (the skeletons man the guns — a gun with nobody
 *    at it is silent): the balls fly in an arc (Cannons: the barrel raised to reach), splash round them, hole
 *    their ship, hurt whom they hit; the pistols at the rail shoot at one in the water or on the shore;
 *  - a ship: after the broadsides it comes alongside, throws its grapnels and hauls her in (Ships: `lashTo` —
 *    the two lie side by side, she can't sail away), lays a plank across between the gangways, and the
 *    skeletons go over (they leap the gap) and fight whoever is aboard — the captain after them; nobody left
 *    there to fight — they come back, the lines are cast off, it sails on;
 *  - anybody can get onto it (the rope ladders at its gangways, the plank) — its crew fights them on its deck.
 *
 * Who / what × how (CLAUDE.md):
 *  - the ship (Ships.isCursed): no spell harms it while it is not taken — fire goes out on it, «Бомбардо»,
 *    lightning, cannonballs: its magic barrier flashes, green sparks, no holes, no torn sails, no broken masts —
 *    only «Инспириус» breaks through (the one exception: holes, masts, sails, harm); «Левиоса
 *    Максима» does not lift it; nobody else's wind fills its sails. The sea rocks it (waves, «Wave Attack»), a
 *    great blast makes it heel. It can only be taken by storm: its captain and every skeleton dead — then it is
 *    the taker's (Sailors.capture): an ordinary black ship (its green fires go out; it burns and sinks as any),
 *    its wheel, sails and chests his.
 *  - the captain (a man): blades, arrows, fists, fire, blasts, rays, «Инспириус», «Бомбардо» — as anybody; duel
 *    charges — as anybody, unless he parries (only from in front, not twice in a row, he tires — PARRY).
 *  - the skeletons (dead already): «Авада Кедавра» — nothing (no life to take: Sailors.SKELETON_AVADA); the
 *    other duel charges, fire, blades, axes, cannonballs, «Бомбардо», the mighty spells — as on anybody: their
 *    bones break. In the sea they do not swim: bones go down like stones; on the bottom they walk back to their
 *    ship and climb its ladder (too far, too long — they fall apart). They never sleep, never talk (a rattle).
 *  - the sea's creatures, the castles' people: the ship fires only at players; a ball hurts whom it hits.
 * Multiplayer: the host decides everything (the ship's way, the guns, the grapnels, the crew); the others see
 * the ship ('ships'), the crew ('screw'), the guns ('shipev' gun), the grapnels and the plank ('bbd').
 */

import * as THREE from 'three';
import { HELM_LOCK, SHIP_CLASSES } from './ShipTypes.js';
import { hullHalfWidth, floorAt } from './ShipLayout.js';
import { PlankCollider } from './ShipCollision.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';
import { SEA } from '../world/Sea.js';
import { railSpots } from './Sailors.js';
import { turnToward, yawTo } from './FaceTarget.js';
import { isCursed } from './Ships.js';
import { newUid } from './ItemTypes.js';

export const BB = {
    ID: 'blackship', NAME: 'Чёрный Призрак',
    OPEN: 160, // m from the shore at least: its patrol round its sea
    START_FAR: 2000, // m: its patrol never comes nearer the start than this (pirateSea)
    KEEP_OFF: 90, // m: it never comes nearer the shore than this (no ports)
    SEE: 380, // m: it notices a ship, a swimmer, one on the shore by the sea
    LOSE: 600, // m: it gives the chase up (Ships keeps it awake that far: SLEEP_FAR)
    PATROL: 8, CHASE: 15, // its own wind in the sails (m/s): ~5 m/s round its sea, ~11 m/s after its prey (it is 40 % faster than any ship: ShipTypes)
    GUN_MIN: 25, GUN_MAX: 290, // m: it fires its broadsides within
    RELOAD: 11, // s: a gun loaded again
    BEAM: 0.22, // rad: the prey this near the beam — the guns bear
    BROADSIDES: 2, // at a ship: then it goes in to board
    GRAPPLE: 22, // m between the hulls: the grapnels fly
    GAP: 1.6, // m between the hulls, hauled in
    HAUL: 0.55, // how fast the lines haul her in (1/s)
    LEAP: 1.0, // s: a leap across
    QUIET: 14, // s: nobody to fight over there — they come back, the lines are cast off
    IGNORE: 90, // s: a ship it boarded is let be this long
    GUARDS: 3, // skeletons that stay to guard its own deck
    PISTOL: { R: 38, RELOAD: 7, DMG: 3, HIT: 0.4 },
    SINK: 2.4, BOTTOM_WALK: 1.4, BOTTOM_MAX: 110, // a skeleton in the sea: down, then along the bottom home
    CLIMB: 1.8, CLIMB_U: 3.5, // m/s up a rope ladder; it takes the ladder while the ship makes less way than this
};

/** Its patrol on this sea: a circle round the middle, every point of it far from any shore (and the islands); ok — it is. */
function patrolOn(seas, sea) {
    let R = Math.max(80, Math.min(sea.r0 * 0.55, sea.r0 - BB.OPEN - 40));
    const ok = (r) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; if (seas.signedDist(sea.x + Math.cos(a) * r, sea.z + Math.sin(a) * r) < BB.OPEN) return false; } return true; };
    while (R > 60 && !ok(R)) R -= 20;
    return { R, ok: ok(R) };
}

/**
 * The black ship's sea and where it starts (pure, the same on every computer for a world). Not the sea nearest the
 * start (the author: «можно найти, но не так же быстро, что прямо сразу») — that one has the start's port and the
 * first ships the hero takes out — but the next one out whose patrol is all open sea and never nearer the start
 * than BB.START_FAR: the hero meets it when he sails off into the open sea himself. (Only one sea about: that one.)
 * null — a world without seas.
 * @param {import('../world/Sea.js').SeaIndex} seas
 */
export function pirateSea(seas, spawn = { x: 0, z: 0 }) {
    if (!seas) return null;
    const N = 3, cx = Math.floor(spawn.x / SEA.CELL), cz = Math.floor(spawn.z / SEA.CELL), all = []; // (7×7 cells: ~14 km round)
    for (let gz = cz - N; gz <= cz + N; gz++) for (let gx = cx - N; gx <= cx + N; gx++) {
        const sea = seas.cellOf(gx, gz);
        if (sea) all.push({ sea, d: Math.hypot(sea.x - spawn.x, sea.z - spawn.z) - sea.r0 }); // (by its shore: as SeaIndex.nearest)
    }
    if (seas.test) all.push({ sea: seas.test, d: Math.hypot(seas.test.x - spawn.x, seas.test.z - spawn.z) - seas.test.r0 });
    if (!all.length) return null;
    all.sort((a, b) => a.d - b.d || (a.sea.id < b.sea.id ? -1 : 1));
    let best = null;
    for (let k = all.length > 1 ? 1 : 0; k < all.length && !best; k++) {
        const e = all[k], P = patrolOn(seas, e.sea);
        if (P.ok && e.d + e.sea.r0 - P.R >= BB.START_FAR) best = { sea: e.sea, R: P.R };
    }
    if (!best) { const e = all[all.length > 1 ? 1 : 0]; best = { sea: e.sea, R: patrolOn(seas, e.sea).R }; }
    const { sea, R } = best;
    let h = 0;
    for (const ch of String(sea.id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const a0 = (Math.abs(h) % 360) * Math.PI / 180;
    const x = sea.x + Math.cos(a0) * R, z = sea.z + Math.sin(a0) * R;
    return { sea: sea.id, cx: sea.x, cz: sea.z, R, a0, x, z, yaw: a0 }; // (yaw a0: it sails round, the middle to port)
}

const angleDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _o = { x: 0, y: 0, z: 0 };
const _l = { x: 0, y: 0, z: 0 };
const _p = { x: 0, y: 0, z: 0 };
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const GRAV = 9.8, BALL = 70; // (Cannons.js: the ball's speed)

/** The barrel's rise (rad) to put a ball `D` m away and `h` m up (the low arc); the farthest arc if it can't reach. */
export function gunPitch(D, h, v = BALL, g = GRAV) {
    const v2 = v * v, disc = v2 * v2 - g * (g * D * D + 2 * h * v2);
    if (disc < 0) return Math.PI / 4;
    return Math.atan2(v2 - Math.sqrt(disc), g * D);
}

const SHOUT = {
    spot: ['Парус на горизонте! К орудиям, кости!', 'Свежее мясо для рыб! Полный вперёд!', 'Вижу добычу! Пушки к бою!'],
    fire: ['Огонь!', 'Залп!', 'Пли, ржавые кости!'],
    board: ['На абордаж!', 'Крючья за борт! Тяни!', 'Все на абордаж, мертвечина!'],
    back: ['Назад, на борт! Здесь больше некого резать!', 'Отдать концы! Уходим!'],
    win: ['Ха! Кто следующий?', 'Корм для рыб!'],
};

export class Blackbeard {
    constructor(game) {
        this.game = game;
        this.ship = null;
        this.spot = null; // pirateSea(): its sea and patrol
        this.phase = 'patrol';
        this.prey = null; // {id, kind: 'ship'|'swim'|'shore', ship}
        this.lash = null; // {T, ox, oz, oyaw, wx, wz, wyaw, planks, t}
        this.angle = 0;
        this.broadsides = 0;
        this.ignore = new Map(); // ship id → until (ms)
        this.reloadAt = new Map(); // gun id → ms
        this.gunners = new Map(); // gun id → sailor
        this._t = 0; this._netT = 0; this._hostileT = 0; this._phaseT = 0; this._quietT = 0;
        this._away = new Map(); // ship → [boarders on her deck]
        this.view = null; // the plank and the grapnel lines (every computer)
    }

    get auth() { return this.game.authority; }
    get crew() { return this.game.ships?.crew; }

    // ====================================================================== the ship
    /** The black ship of this world (made on every computer the same; the host's moves it). */
    _ensure() {
        const g = this.game, S = g.ships;
        if (this.ship || this._none || !S?.enabled) return this.ship;
        const data = g.terrain?.data;
        if (!data) return null;
        const spawn = g.world?.mapResult?.playerSpawn || { x: 0, z: 0 };
        this.spot = pirateSea(data.seas, spawn);
        if (!this.spot) { this._none = true; return null; }
        this.ship = S.list.get(BB.ID) || S.spawn('blackship', this.spot.x, this.spot.z, this.spot.yaw, { id: BB.ID, name: BB.NAME, wake: false });
        this.angle = Math.atan2(this.ship.st.z - this.spot.cz, this.ship.st.x - this.spot.cx);
        return this.ship;
    }

    /** Taken: the curse is gone, it is an ordinary ship — no more AI. */
    get taken() { return !!this.ship?.owner; }

    // ====================================================================== the frame
    update(dt) {
        const g = this.game;
        const s = this._ensure();
        if (!s) return;
        this._t += dt;
        if (this.auth && !this.taken) {
            if (s.awake) this._brain(s, dt);
            else this._drift(s, dt);
            this._boarders(dt);
        }
        if (this.taken && this.lash) this._cast();
        this._drawLash();
        this._hudBar();
        if (this.auth && g.sync && s.awake && (this._netT -= dt) <= 0) { this._netT = 0.25; this._send(); }
    }

    /** (host) Nobody near: it keeps sailing round its sea (no physics — it is asleep). */
    _drift(s, dt) {
        const P = this.spot;
        this.phase = 'patrol';
        this.angle += (5 / P.R) * dt;
        const st = s.st;
        st.x = P.cx + Math.cos(this.angle) * P.R;
        st.z = P.cz + Math.sin(this.angle) * P.R;
        st.yaw = Math.atan2(-(-Math.sin(this.angle)), -(Math.cos(this.angle))); // (along the circle, the middle to port)
        st.u = 5; st.v = 0; st.r = 0;
        s.changed = true;
    }

    /** (host) The awake ship: what it does now. */
    _brain(s, dt) {
        const g = this.game, S = g.ships;
        const now = performance.now();
        // its sails are always set (the curse fills them: its own wind)
        if (s.sails.some((sl) => sl.target < 1 && sl.burnt < 1)) S.setSails(s, 'all', 1, null);
        // every player near is its foe (they are not its own)
        if ((this._hostileT -= dt) <= 0) {
            this._hostileT = 1;
            for (const p of this._players()) if (Math.hypot(p.x - s.st.x, p.z - s.st.z) < 300) s.hostile.set(p.id, now + 60000);
        }
        if (s.state === 'sinking' || s.state === 'wreck') return;
        this._phaseT += dt;
        s.hunting = this.phase !== 'patrol'; // (Ships: kept awake further off while after its prey)
        // its prey
        const prey = this._lookout(s, now);
        if (this.phase === 'patrol' && prey) { this.prey = prey; this.phase = 'hunt'; this.broadsides = 0; this._phaseT = 0; this._shout(pick(SHOUT.spot)); this._warn(prey); }
        else if (this.phase !== 'patrol' && this.phase !== 'boarding') {
            if (!prey) { this.phase = 'patrol'; this.prey = null; }
            else this.prey = prey;
        }
        if (this.phase === 'boarding') { this._boarding(s, dt, now); return; }
        if (this.phase === 'patrol') { this._patrol(s, dt); this.gunners.clear(); return; }
        const pr = this.prey;
        const d = Math.hypot(pr.x - s.st.x, pr.z - s.st.z);
        // a ship after its broadsides (or close already): alongside, the grapnels
        if (pr.kind === 'ship' && (this.broadsides >= BB.BROADSIDES || d < 60) && pr.ship.state !== 'sinking' && pr.ship.state !== 'wreck') {
            if (this.phase !== 'board') { this.phase = 'board'; this._phaseT = 0; this._shout(pick(SHOUT.board)); }
            if (this._alongside(s, pr.ship, dt)) this._grapple(s, pr.ship);
            this.gunners.clear();
            return;
        }
        // the broadside: its side to the prey
        this.phase = 'hunt';
        this._hunt(s, pr, d, dt, now);
    }

    /** The players near: {id, x, y, z, ship (the ship object they stand on)} — not the invisible (Invisibility.aiPos), not the dead. */
    _players() {
        const g = this.game, S = g.ships;
        const out = this._pl || (this._pl = []);
        out.length = 0;
        const put = (id, p0, shipId) => {
            const p = g.invis ? g.invis.aiPos(id, p0) : p0;
            if (!p) return;
            out.push({ id, x: p.x, y: p.y, z: p.z, ship: shipId ? S.list.get(shipId) || null : null });
        };
        if (!g.isDeadLocal && !g.combat?.dead) put(g.localId, g.character.group.position, S.me?.ship?.id || null);
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) put(id, r.position, r.ship || null);
        return out;
    }

    /** (host) The nearest prey it sees: a ship with a player aboard, a swimmer, one on the shore by the sea. */
    _lookout(s, now) {
        const seas = this.game.terrain?.data?.seas;
        let best = null, bd = Infinity;
        for (const p of this._players()) {
            const d = Math.hypot(p.x - s.st.x, p.z - s.st.z);
            if (d > (this.prey?.id === p.id ? BB.LOSE : BB.SEE) || d >= bd) continue;
            let kind = null;
            if (p.ship === s) continue; // (aboard it: its crew deals with them)
            if (p.ship) { if ((this.ignore.get(p.ship.id) || 0) > now || p.ship.owner === BB.ID) continue; kind = 'ship'; }
            else {
                const sd = seas ? seas.signedDist(p.x, p.z) : -1e9;
                if (sd > 4 && p.y < WATER_LEVEL_Y + 4) kind = 'swim';
                else if (sd > -45 && sd <= 4) kind = 'shore';
            }
            if (!kind) continue;
            bd = d;
            best = { id: p.id, kind, ship: p.ship, x: p.x, y: p.y, z: p.z };
        }
        return best;
    }

    /** A warning to the player it hunts (once a hunt). */
    _warn(prey) {
        const g = this.game;
        if (prey.id === g.localId) g.hud?.setVoice?.('🏴‍☠️ Чёрный корабль капитана Чёрные Усы идёт на вас!', true);
    }

    // ---------------------------------------------------------------- sailing
    /**
     * (host) Its own wind in its sails and its wheel towards a point (world): never towards a shore — what lies
     * ahead nearer than BB.KEEP_OFF to land turns it back to the open sea.
     */
    _sail(s, tx, tz, gain, dt, wantYaw = null) {
        const st = s.st;
        const seas = this.game.terrain?.data?.seas;
        let yaw = wantYaw ?? Math.atan2(-(tx - st.x), -(tz - st.z));
        if (seas) {
            const ahead = 40 + Math.abs(st.u) * 8;
            const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
            const here = seas.signedDist(st.x, st.z), there = seas.signedDist(st.x + fx * ahead, st.z + fz * ahead);
            if (here < BB.KEEP_OFF || (there < BB.KEEP_OFF && there < here)) yaw = Math.atan2(-(this.spot.cx - st.x), -(this.spot.cz - st.z)); // (back out to sea)
            const want = seas.signedDist(st.x - Math.sin(yaw) * ahead, st.z - Math.cos(yaw) * ahead);
            if (want < BB.KEEP_OFF && here >= BB.KEEP_OFF) gain = Math.min(gain, 4); // (no further in)
        }
        const err = angleDiff(yaw, st.yaw);
        if (Math.abs(err) > 1) gain *= Math.max(0.55, 1 - (Math.abs(err) - 1) * 0.3); // (coming about: not running off at full speed)
        st.wheel = -Math.max(-1, Math.min(1, err * 2.2 - st.r * 3)) * HELM_LOCK;
        s.blow = { by: BB.ID, power: 1, gain, dx: -Math.sin(st.yaw), dz: -Math.cos(st.yaw), at: performance.now() };
        s.changed = true;
        void dt;
    }

    _patrol(s, dt) {
        const P = this.spot, st = s.st;
        // its place on the circle: a little ahead of where it is
        const a = Math.atan2(st.z - P.cz, st.x - P.cx);
        this.angle = a;
        const ta = a + 0.35;
        this._sail(s, P.cx + Math.cos(ta) * P.R, P.cz + Math.sin(ta) * P.R, BB.PATROL, dt);
    }

    /** (host) After its prey: closer, then its side to it, the guns. */
    _hunt(s, pr, d, dt, now) {
        const st = s.st;
        const bearing = Math.atan2(-(pr.x - st.x), -(pr.z - st.z));
        if (d > BB.GUN_MAX * 0.8) { this._sail(s, pr.x, pr.z, BB.CHASE, dt); this.gunners.clear(); return; }
        // the beam: the prey off its side (whichever side turns less), a little towards it to close the range
        const toward = d > 120 ? 0.35 : d < 45 ? -0.3 : 0;
        const a1 = bearing + Math.PI / 2 - toward, a2 = bearing - Math.PI / 2 + toward;
        // (the side that turns less — unless that course runs towards the shore: then the other one)
        const seas = this.game.terrain?.data?.seas;
        const room = (a) => (seas ? seas.signedDist(st.x - Math.sin(a) * 80, st.z - Math.cos(a) * 80) : 1e9);
        let want = Math.abs(angleDiff(a1, st.yaw)) < Math.abs(angleDiff(a2, st.yaw)) ? a1 : a2;
        const other = want === a1 ? a2 : a1;
        if (room(want) < BB.KEEP_OFF + 20 && room(other) > room(want)) want = other;
        this._sail(s, 0, 0, d < 60 ? 6 : 10, dt, want);
        // which side bears: +1 starboard (x+)
        s.pose.toLocal(pr.x, st.y0 ?? 0, pr.z, _l);
        const side = _l.x >= 0 ? 1 : -1;
        const off = Math.atan2(Math.abs(_l.z), Math.abs(_l.x)); // (0: right abeam)
        this._manGuns(s, side);
        if (off < BB.BEAM + 0.15 && d > BB.GUN_MIN && d < BB.GUN_MAX) this._broadside(s, side, pr, now);
        this._pistols(s, pr, now);
    }

    // ---------------------------------------------------------------- the guns
    /** The guns of the side that bears: a skeleton at each (the nearest free ones go to them). */
    _manGuns(s, side) {
        const list = this.crew?.crews.get(s.id) || [];
        const guns = s.layout.cannons.filter((c) => c.side === side);
        for (const [id, v] of this.gunners) if (v.dead || v.ship !== s || !guns.some((c) => c.id === id)) { if (v.gun === id) v.gun = null; this.gunners.delete(id); }
        for (const c of guns) {
            if (this.gunners.has(c.id)) continue;
            let best = null, bd = Infinity;
            for (const v of list) {
                if (v.dead || v.overboard || v.role !== 'skeleton' || v.gun || v.board || v.ship !== s) continue;
                const dd = Math.hypot(v.l.x - c.x, v.l.z - c.z);
                if (dd < bd) { bd = dd; best = v; }
            }
            if (best) { best.gun = c.id; this.gunners.set(c.id, best); }
        }
    }

    /** Where a gunner stands at his gun (ship-local): inboard of it. */
    _gunSpot(s, c) { return { x: c.x - c.side * 2.6, y: c.y, z: c.z }; }

    /** (host) Every gun of that side loaded, manned and bearing: its barrel raised to reach, the fuse lit. */
    _broadside(s, side, pr, now) {
        const g = this.game, C = g.ships.cannons;
        let i = 0, any = false;
        for (const c of s.layout.cannons) {
            if (c.side !== side || now < (this.reloadAt.get(c.id) || 0)) continue;
            const G = C.gunOf(s, c.id);
            if (!G || G.st.fuse > 0) continue;
            const v = this.gunners.get(c.id);
            if (!v || v.dead || v.ship !== s || Math.hypot(v.l.x - (c.x - c.side * 2.6), v.l.z - c.z) > 3.5) continue; // (nobody at it: silent)
            // the prey led by its motion over the ball's flight
            s.pose.toWorld(c.muzzle.x, c.muzzle.y, c.muzzle.z, _o);
            const lead = this._preyVel(pr, _p);
            const D0 = Math.hypot(pr.x - _o.x, pr.z - _o.z), tf = D0 / (BALL * 0.95);
            const tx = pr.x + lead.x * tf, tz = pr.z + lead.z * tf;
            s.pose.dirToWorld(c.side, 0, _l);
            const along = (tx - _o.x) * _l.x + (tz - _o.z) * _l.z;
            const across = Math.abs(-(tx - _o.x) * _l.z + (tz - _o.z) * _l.x);
            if (along < BB.GUN_MIN * 0.8 || across > Math.max(10, along * 0.14)) continue; // (it does not bear)
            const ty = pr.kind === 'ship' ? pr.ship.pose.y + pr.ship.layout.deck * 0.5 : pr.kind === 'swim' ? WATER_LEVEL_Y : pr.y - 1;
            G.st.loaded = true;
            G.st.pitch = gunPitch(along, ty - _o.y) + (Math.random() - 0.5) * 0.012;
            C.light(G, BB.ID);
            G.st.fuse += i * 0.28; // (a rolling broadside: gun after gun)
            this.reloadAt.set(c.id, now + BB.RELOAD * 1000 + i * 280);
            i++; any = true;
            if (i === 1) g.castleLife?.alarm?.({ x: _o.x, y: _o.y, z: _o.z }, 'blast', BB.ID, 4); // (the guns are heard ashore)
        }
        if (any && now - (this._lastBroadside || 0) > 3000) { this._lastBroadside = now; this.broadsides++; const cap = this._captain(); if (cap) this.crew._say(cap, pick(SHOUT.fire)); }
    }

    _preyVel(pr, out) {
        out.x = out.z = 0;
        if (pr.kind === 'ship' && pr.ship) return this.game.ships.pointVel(pr.ship, pr.x, pr.z, out);
        return out;
    }

    /** (host) The pistols at the rail: at one in the water, on the shore, on another deck — near enough. */
    _pistols(s, pr, now) {
        const g = this.game;
        for (const v of this.crew?.crews.get(s.id) || []) {
            if (v.dead || v.overboard || v.ship !== s || v.model?.toolKind !== 'pistol' || v.gun || v.board || v.foe) continue;
            const d = Math.hypot(pr.x - v.x, pr.z - v.z);
            if (d > BB.PISTOL.R) { v.aimAt = null; continue; }
            v.aimAt = pr.id;
            if (now < (v.shotAt || 0)) continue;
            // («лицом к цели»: only once he faces it)
            const yaw = s.st.yaw + v.lyaw, want = Math.atan2(-(pr.x - v.x), -(pr.z - v.z));
            if (Math.abs(angleDiff(want, yaw)) > 0.25) continue;
            v.shotAt = now + (BB.PISTOL.RELOAD + Math.random() * 3) * 1000;
            this._shot(v, pr, d);
        }
    }

    /** A pistol shot (the host decides the hit; everybody sees the flash and the smoke). */
    _shot(v, pr, d) {
        const g = this.game;
        v.model.getRightHandWorldPosition?.(_v);
        this._shotFx(_v);
        g.sync?.net.send({ t: 'bbd', shot: [r2(_v.x), r2(_v.y), r2(_v.z)] });
        // a wall, a rock between: no
        const data = g.terrain?.data;
        if (data) for (let k = 0.15; k < 1; k += 0.1) if (data.isSolidAt(_v.x + (pr.x - _v.x) * k, _v.y + (pr.y - _v.y) * k, _v.z + (pr.z - _v.z) * k)) return;
        if (Math.random() > BB.PISTOL.HIT * (1 - d / (BB.PISTOL.R * 1.6))) return;
        if (pr.id === g.localId) { if (g.combat?.enabled) g.combat.damage(BB.PISTOL.DMG, v.id, 'Pistol'); else g.damageLocalPlayer?.(BB.PISTOL.DMG); }
        else g.sync?.playerHit?.(pr.id, BB.PISTOL.DMG, false, null);
    }

    _shotFx(p) {
        const g = this.game;
        g.fx?.lightFlash?.(p, 0xffc070, 2, 0.1, 14);
        if (g.fx?.spark) for (let i = 0; i < 12; i++) g.fx.spark(p, i % 3 ? 0xcfcfcf : 0xffa040, 0.25 + Math.random() * 0.25, _w.set((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2), 1 + Math.random());
        g.sound?.playExplosion?.(p, g.character.group.position, 0.12);
    }

    // ---------------------------------------------------------------- boarding
    /**
     * (host) Alongside her: the black ship comes up on her side, parallel (or the other way round if that is
     * nearer). true — near enough for the grapnels.
     */
    _alongside(s, T, dt) {
        const st = s.st;
        T.pose.toLocal(st.x, T.pose.y, st.z, _l);
        const sB = _l.x >= 0 ? 1 : -1;
        const gapNow = Math.abs(_l.x) - (s.layout.B + T.layout.B) / 2;
        if (gapNow < BB.GRAPPLE && Math.abs(_l.z) < (s.layout.L + T.layout.L) / 2) return true;
        const par = Math.abs(angleDiff(T.st.yaw, st.yaw)) < Math.PI / 2 || Math.abs(T.st.u) > 1.5;
        const yaw = par ? T.st.yaw : T.st.yaw + Math.PI;
        // where it wants to be: abeam of her, its side to hers — and a little ahead of that while it is far
        const lx = sB * ((s.layout.B + T.layout.B) / 2 + BB.GAP + 4);
        T.pose.toWorld(lx, 0, 0, _o);
        const far = Math.hypot(_o.x - st.x, _o.z - st.z);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const lead = Math.min(40, far * 0.5);
        this._sail(s, _o.x + fx * lead, _o.z + fz * lead, far > 60 ? BB.CHASE : 7 + Math.abs(T.st.u) * 1.4, dt);
        if (this._phaseT > 60) { this._phaseT = 0; this.broadsides = 0; this.phase = 'hunt'; } // (it could not get alongside: the guns again)
        return false;
    }

    /** (host) The grapnels fly: she is held, hauled in alongside (her gangway abreast of its own). */
    _grapple(s, T) {
        if (this.lash) return;
        s.pose.toLocal(T.st.x, s.pose.y, T.st.z, _l);
        const side = _l.x >= 0 ? 1 : -1;
        const dyaw = angleDiff(T.st.yaw, s.st.yaw);
        const flip = Math.abs(dyaw) > Math.PI / 2;
        const wyaw = flip ? Math.PI : 0;
        const wx = side * ((s.layout.B + T.layout.B) / 2 + BB.GAP);
        // her gangway abreast of its own: along the black ship's length
        const wz = flip ? s.layout.gangZ + T.layout.gangZ : s.layout.gangZ - T.layout.gangZ;
        this.lash = { T, side, flip, ox: _l.x, oz: _l.z, oyaw: dyaw, wx, wz, wyaw, planks: false, t: 0 };
        T.lashTo = s.id;
        s.blow = null; s.st.tau = 6; // (its own wind off: they drift together)
        this.phase = 'boarding';
        this._phaseT = 0; this._quietT = 0;
        this._shout('Крючья за борт! Тяни!');
        this.game.sound?.playWhoosh?.();
        this.gunners.clear();
        for (const v of this.crew?.crews.get(s.id) || []) v.gun = null;
    }

    /** (host, Ships._simulate) The held ship: where the lines hold her, alongside. true — she is held. */
    lashStep(T, dt) {
        const L = this.lash, B = this.ship;
        if (!L || L.T !== T || !B?.awake || B.state === 'sinking' || T.state === 'sinking' || T.state === 'wreck') { T.lashTo = null; return false; }
        L.t += dt;
        const k = Math.min(1, dt * BB.HAUL);
        L.ox += (L.wx - L.ox) * k; L.oz += (L.wz - L.oz) * k; L.oyaw += angleDiff(L.wyaw, L.oyaw) * k;
        const c = Math.cos(B.st.yaw), sn = Math.sin(B.st.yaw);
        const st = T.st;
        st.x = B.st.x + L.ox * c + L.oz * sn;
        st.z = B.st.z - L.ox * sn + L.oz * c;
        st.yaw = B.st.yaw + L.oyaw;
        const f = Math.cos(L.oyaw);
        st.u = B.st.u * f; st.v = B.st.v * f; st.r = B.st.r; st.wheel = 0;
        if (!L.planks && Math.abs(L.ox - L.wx) < 0.6 && Math.abs(L.oz - L.wz) < 1.2) { L.planks = true; this._shout('Трап за борт!'); }
        T.changed = true;
        return true;
    }

    /** (host) The lines cast off, the plank pulled back. */
    _cast() {
        const L = this.lash;
        if (!L) return;
        L.T.lashTo = null;
        this.lash = null;
        this.phase = 'patrol';
        this._phaseT = 0;
    }

    /** (host) Lashed alongside: who goes over, when they come back, when the lines are cast off. */
    _boarding(s, dt, now) {
        const L = this.lash;
        if (!L || L.T.lashTo !== s.id) { this._cast(); this._recall(); return; }
        const T = L.T;
        s.blow = null;
        if (!L.planks) return;
        // somebody to fight over there (or on the plank)?
        let foes = 0;
        for (const p of this._players()) if (p.ship === T || (Math.hypot(p.x - T.st.x, p.z - T.st.z) < T.layout.L / 2 + 6 && !p.ship)) foes++;
        if (foes) this._quietT = 0; else this._quietT += dt;
        const list = this.crew?.crews.get(s.id) || [];
        if (this._quietT < BB.QUIET) {
            // the boarders: every skeleton but the guards; the captain after the first of them are over
            const free = list.filter((v) => !v.dead && !v.overboard && v.role === 'skeleton');
            const guards = Math.min(BB.GUARDS, Math.max(0, free.length - 2));
            free.slice(guards).forEach((v) => { if (!v.board) v.board = T.id; });
            const cap = this._captain();
            if (cap && !cap.board && this._phaseT > 6 && foes) { cap.board = T.id; this.crew._say(cap, 'За мной, кости! Шпаги наголо!'); }
            return;
        }
        // nobody left: back aboard, the lines off
        this._recall();
        const away = list.some((v) => !v.dead && v.ship !== s && !v.overboard);
        if (!away && this._quietT > BB.QUIET + 3) {
            this._shout(pick(SHOUT.back));
            this.ignore.set(T.id, now + BB.IGNORE * 1000);
            this._cast();
        }
    }

    /** Everybody back to the black ship. */
    _recall() {
        for (const v of this.crew?.crews.get(this.ship?.id) || []) v.board = null;
    }

    /** The black ship's gangway point (ship-local) on `side`, and her gangway facing it. */
    _gangways(L, out) {
        const B = this.ship, T = L.T;
        out.a = { x: L.side * (hullHalfWidth(B.layout, B.layout.gangZ, B.layout.deck) - 1.0), y: B.layout.deck, z: B.layout.gangZ };
        const sT = (L.flip ? 1 : -1) * L.side; // (her side that faces the black ship)
        out.b = { x: sT * (hullHalfWidth(T.layout, T.layout.gangZ, T.layout.deck) - 1.0), y: T.layout.deck, z: T.layout.gangZ };
        out.sT = sT;
        return out;
    }

    /**
     * (host, Sailors._think) A pirate on his own deck: the black ship's business before the usual — going over to
     * board, the guns, the pistol at the rail. false: as any sailor (a foe aboard first of all).
     */
    thinkHome(v, s, dt) {
        if (s !== this.ship || this.taken || v.stunT > 0 || v.vy) return false;
        const g = this.game;
        // a foe on its own deck: everybody fights him (the usual)
        if (g.ships.me?.ship === s) return false;
        for (const [, r] of g.remotes || []) if (r.ship === s.id && !r.dead) return false;
        const C = this.crew;
        if (v.board && this.lash?.planks && this.lash.T.id === v.board) {
            // to the gangway, then over the gap
            const gw = this._gangways(this.lash, this._gw || (this._gw = {}));
            const tx = gw.a.x - Math.sign(gw.a.x) * 0.6, tz = gw.a.z + ((v.idx % 3) - 1) * 1.2;
            if (Math.hypot(tx - v.l.x, tz - v.l.z) > 1.2) { C._steer(v, s, tx, tz, 5.2, dt); v.mode = 'run'; return true; }
            const T = this.lash.T;
            const to = { x: gw.b.x - Math.sign(gw.b.x) * (1.4 + Math.random() * 2.5), y: T.layout.deck, z: gw.b.z + (Math.random() - 0.5) * 8 };
            to.y = floorAt(T.layout, to.x, to.z, T.layout.deck + 1) ?? T.layout.deck;
            this._leap(v, s, T, to);
            return true;
        }
        if (v.gun && this.phase === 'hunt') {
            const c = s.layout.cannons.find((x) => x.id === v.gun);
            if (!c) { v.gun = null; return false; }
            const sp = this._gunSpot(s, c);
            if (Math.hypot(sp.x - v.l.x, sp.z - v.l.z) > 0.8) { C._steer(v, s, sp.x, sp.z, 5.2, dt); v.mode = 'run'; }
            else { v.mode = 'work'; v.speed = 0; v.lyaw = c.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
            return true;
        }
        if (v.aimAt && this.prey && v.aimAt === this.prey.id) {
            // the pistol: to the rail on that side, facing the prey
            const pr = this.prey;
            s.pose.toLocal(pr.x, pr.y, pr.z, _l);
            const side = _l.x >= 0 ? 1 : -1;
            let spot = null, bd = Infinity;
            for (const r of railSpots(s.layout)) { if (r.side !== side) continue; const d = Math.abs(r.z - v.l.z) + Math.abs(r.z - _l.z) * 0.3; if (d < bd) { bd = d; spot = r; } }
            if (spot && Math.hypot(spot.x - Math.sign(spot.x) * 0.4 - v.l.x, spot.z - v.l.z) > 1) { C._steer(v, s, spot.x - Math.sign(spot.x) * 0.4, spot.z, 4, dt); v.mode = 'run'; return true; }
            v.mode = 'idle'; v.speed = 0;
            v.lyaw = turnToward(v.lyaw ?? 0, yawTo(v.l.x, v.l.z, _l.x, _l.z), 6 * dt);
            return true;
        }
        return false;
    }

    /** (host) A boarder on another ship's deck (Sailors.update): his foe there — or back over to his own ship. */
    thinkAway(v, dt) {
        const T = v.ship, B = this.ship, C = this.crew;
        if (!B || !C) return false;
        if (v.dead) { v.mode = 'dead'; v.speed = 0; C._fall(v, T, dt); C._offStair(v, T, dt); return true; }
        if (v.lev) { v.mode = 'idle'; v.speed = 0; return true; }
        if (v.stunT > 0 || v.vy) {
            if (v.stunT > 0) v.stunT -= dt;
            C._fall(v, T, dt); C._offStair(v, T, dt);
            v.mode = 'idle'; v.speed = 0; v.busy = false;
            if (v.fs) v.fs.st = 'close';
            return true;
        }
        if (v.parryShow > 0) { v.parryShow -= dt; v.mode = 'block'; v.speed = 0; return true; }
        if (v.braceT > 0) { C._braced(v, dt); return true; } // (braced against a push on her deck: Sailors.BRACE)
        const L = this.lash;
        if (!L || L.T !== T) { C._overboard(v, Math.random() < 0.5 ? -1 : 1); return true; } // (the lines are off: into the sea — home along the bottom)
        // a foe aboard her: the nearest
        let foe = null, fd = Infinity;
        for (const p of this._players()) {
            if (p.ship !== T) continue;
            T.pose.toLocal(p.x, p.y - 2, p.z, _l);
            const d = Math.hypot(_l.x - v.l.x, _l.z - v.l.z) - (p.id === v.foe ? 1e6 : 0);
            if (d < fd) { fd = d; foe = { id: p.id, x: _l.x, y: _l.y, z: _l.z }; }
        }
        if (foe && v.board) { v.foe = foe.id; v.fp = foe; v.path = null; this._addAway(T, v); return true; }
        if (v.foe) { v.foe = null; v.fp = null; v.fs = null; v.busy = false; v.tac = null; v.fpath = null; }
        // back: to her gangway, over the gap
        const gw = this._gangways(L, this._gw || (this._gw = {}));
        const tx = gw.b.x - Math.sign(gw.b.x) * 0.6, tz = gw.b.z + ((v.idx % 3) - 1) * 1.2;
        if (Math.hypot(tx - v.l.x, tz - v.l.z) > 1.2) { C._steer(v, T, tx, tz, 5.2, dt); v.mode = 'run'; return true; }
        const to = { x: gw.a.x - Math.sign(gw.a.x) * (1.5 + Math.random() * 3), y: B.layout.deck, z: gw.a.z + (Math.random() - 0.5) * 8 };
        to.y = floorAt(B.layout, to.x, to.z, B.layout.deck + 1) ?? B.layout.deck;
        this._leap(v, T, B, to);
        return true;
    }

    _addAway(T, v) {
        let a = this._away.get(T);
        if (!a) { a = []; this._away.set(T, a); }
        a.push(v);
    }

    /** (host) The boarders' fight on her deck — the crew's own tactics, there (Sailors._tactics). */
    _boarders(dt) {
        const C = this.crew;
        for (const [T, list] of this._away) {
            if (list.length && T.awake) { C._tactics(T, list, dt); C._separate(T, list, dt); }
            list.length = 0;
        }
    }

    /** (host) A leap across the gap between the two ships: from a deck of `from` to `to` (local of `dest`). */
    _leap(v, from, dest, to) {
        from.pose.toWorld(v.l.x, v.l.y, v.l.z, _o);
        dest.pose.toWorld(to.x, to.y, to.z, _l);
        v.overboard = { x: _o.x, y: _o.y, z: _o.z, vy: 0, vx: 0, vz: 0, t: 0, wet: false, leap: { ax: _o.x, ay: _o.y, az: _o.z, t: 0, dest, l: { x: to.x, y: to.y, z: to.z } } };
        v.leapYaw = Math.atan2(-(_l.x - _o.x), -(_l.z - _o.z));
        v.ship = v.crew; // (in the air: his own crew's, until he lands)
        v.mode = 'run'; v.fs = null; v.busy = false; v.tac = null; v.foe = null; v.fp = null; v.path = null; v.fpath = null;
        if (Math.random() < 0.3) this.crew._say(v, 'Кх-х-ха!');
    }

    /**
     * (host, Sailors._think) A pirate «overboard»: a leap in the air (lands on the other deck); a skeleton in the
     * sea (bones sink: down to the bottom, along it to his ship's ladder, up). false: the captain swims as anybody.
     */
    overboard(v, s, dt) {
        const o = v.overboard;
        if (o.leap) {
            const J = o.leap;
            J.t += dt;
            const k = Math.min(1, J.t / BB.LEAP);
            J.dest.pose.toWorld(J.l.x, J.l.y, J.l.z, _l);
            o.x = J.ax + (_l.x - J.ax) * k;
            o.z = J.az + (_l.z - J.az) * k;
            o.y = J.ay + (_l.y - J.ay) * k + Math.sin(Math.PI * k) * 3.2;
            v.speed = 5;
            if (k >= 1) {
                v.overboard = null; v.leapYaw = null;
                v.ship = J.dest;
                v.l.x = J.l.x; v.l.y = J.l.y; v.l.z = J.l.z;
                v.node = this.crew._nearestNode(J.dest, v.l);
                v.mode = 'idle'; v.speed = 0;
                v.lyaw = Math.atan2(-(Math.sign(J.l.x) || 1), 0) + Math.PI; // (inboard)
                this.game.sound?.playHit?.();
            }
            return true;
        }
        if (v.role !== 'skeleton') return false;
        const g = this.game;
        o.t += dt;
        if (o.vx || o.vz) { o.x += o.vx * dt; o.z += o.vz * dt; const kk = Math.exp(-dt * 3); o.vx *= kk; o.vz *= kk; if (Math.abs(o.vx) + Math.abs(o.vz) < 0.05) o.vx = o.vz = 0; }
        if (o.y > WATER_LEVEL_Y && !o.wet) { o.vy -= 14 * dt; o.y += o.vy * dt; v.mode = 'run'; return true; }
        if (!o.wet) {
            o.wet = true;
            if (g.fx?.spark) for (let i = 0; i < 22; i++) g.fx.spark(_v.set(o.x, WATER_LEVEL_Y + 0.2, o.z), i % 3 ? 0xe8f6ff : 0x9fd3ea, 0.16, _w.set((Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 5), 0.9);
            g.sound?.playSplash?.();
        }
        if (v.dead) { o.climb = null; o.y = Math.max(this._bed(o.x, o.z), o.y - BB.SINK * dt); return true; }
        if (o.climb) return this._climb(v, o, dt); // (up a rope ladder)
        // down like a stone
        const bed = this._bed(o.x, o.z);
        if (o.y > bed + 0.05) { o.y = Math.max(bed, o.y - BB.SINK * dt); v.mode = 'idle'; v.speed = 0; return true; }
        o.y = bed;
        // along the bottom to the nearest rope ladder: his own ship's — or, while the black ship is lashed to its
        // prey and he is one of the boarders, hers (thrown off her deck, he comes up her side again: the author)
        const home = v.crew || s, L = this.lash;
        const ships = L?.planks && L.T && v.board === L.T.id && !L.T.flooded ? [home, L.T] : [home];
        let ship = home, lad = null, d = Infinity, dx = 0, dz = 0;
        for (const sh of ships) for (const ld of sh.layout.ladders) {
            sh.pose.toWorld(ld.x * 1.05, 0, ld.z, _l);
            const k = Math.hypot(_l.x - o.x, _l.z - o.z);
            if (k < d) { d = k; ship = sh; lad = ld; dx = _l.x - o.x; dz = _l.z - o.z; }
        }
        if (!lad || d > BB.BOTTOM_MAX || o.t > 150) { this.crew._die(v, home.lastBy); return true; } // (lost on the bottom: it falls apart)
        if (d < 2.5 && Math.abs(ship.st.u) < BB.CLIMB_U) {
            // takes the ladder: up it, rung by rung (_climb), aboard at its gangway
            o.climb = { ship, lad, y: Math.max(lad.bottom - 2, ship.pose.toLocal(o.x, o.y, o.z, _l).y) };
            return true;
        }
        const step = Math.min(d, BB.BOTTOM_WALK * dt);
        const nx = o.x + (dx / d) * step, nz = o.z + (dz / d) * step;
        const nb = this._bed(nx, nz);
        if (nb < o.y + 1.2) { o.x = nx; o.z = nz; o.y = Math.max(nb, o.y - BB.SINK * dt); } // (a step up the bottom, not a cliff)
        v.leapYaw = Math.atan2(-dx, -dz);
        v.mode = 'walk'; v.speed = BB.BOTTOM_WALK;
        return true;
    }

    /** (host) A skeleton up a rope ladder from the water (o.climb): hands and feet on the rungs, the ship's side under him. */
    _climb(v, o, dt) {
        const C = o.climb, sh = C.ship, lad = C.lad;
        if (sh.flooded || Math.abs(sh.st.u) > BB.CLIMB_U + 1.5) { o.climb = null; return true; } // (torn off by the ship's way: back down)
        C.y = Math.min(lad.top, C.y + BB.CLIMB * dt);
        sh.pose.toWorld(lad.x * 1.05, C.y, lad.z, _o);
        o.x = _o.x; o.y = _o.y; o.z = _o.z;
        v.leapYaw = sh.st.yaw + (lad.side > 0 ? -Math.PI / 2 : Math.PI / 2) + Math.PI; // (facing the hull)
        v.mode = 'walk'; v.speed = BB.CLIMB;
        if (C.y < lad.top) return true;
        // over the rail: on her deck at the gangway
        const gw = sh.layout.nodes.find((n) => n.tag === 'gangway:' + (lad.side > 0 ? '+1' : '-1')) || sh.layout.nodes.find((n) => n.tag && n.tag.startsWith('gangway')) || sh.layout.nodes[0];
        v.ship = sh;
        v.l.x = gw.x; v.l.y = gw.y; v.l.z = gw.z; v.node = gw.id; v.vy = 0;
        v.overboard = null; v.leapYaw = null; v.mode = 'idle'; v.path = null;
        return true;
    }

    _bed(x, z) {
        const data = this.game.terrain?.data;
        const y = data?.surfaceY ? data.surfaceY(x, z) : WATER_LEVEL_Y - 12;
        return Math.min(WATER_LEVEL_Y - 1.8, Number.isFinite(y) ? y : WATER_LEVEL_Y - 12);
    }

    /** (host, Sailors._die) One of the black ship's dead: the captain drops his rapier (a magic sword, +60 %). */
    died(v, by) {
        const g = this.game;
        if (v.role !== 'blackbeard' || !this.auth) return;
        v.board = null;
        const p = new THREE.Vector3(v.x, v.y + 3, v.z);
        try {
            const w = g.weapons?.spawnHovering?.('sword', p, newUid());
            if (w) { w.magic = true; w.bonus = 60; w.applyMagicLook?.(); g.sync?.weaponAppeared?.(w); }
        } catch (e) { console.warn('blackbeard rapier', e); }
        for (const o of this.crew?.crews.get(v.crew?.id || BB.ID) || []) if (!o.dead && o.role === 'skeleton') { this.crew._say(o, 'Х-р-р-р…', 3); break; }
        void by;
    }

    _captain() {
        return (this.crew?.crews.get(BB.ID) || []).find((v) => v.role === 'blackbeard' && !v.dead) || null;
    }

    _shout(text) {
        const cap = this._captain();
        if (cap && !cap.overboard) this.crew._say(cap, text);
    }

    // ================================================================ the plank, the grapnel lines (every computer)
    _drawLash() {
        const g = this.game;
        const L = this.lash || this._netLash();
        const B = this.ship;
        const show = !!(L && B?.awake && L.T?.awake);
        if (!show) { if (this.view) this._dropView(); return; }
        if (!this.view) {
            const mat = LINE_MAT || (LINE_MAT = new THREE.LineBasicMaterial({ color: 0x2a2018 }));
            const lines = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
            lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
            lines.frustumCulled = false;
            g.scene.add(lines);
            this.view = { lines, plank: null, col: null };
        }
        const V = this.view;
        // four grapnel lines from its rail to hers
        const arr = V.lines.geometry.attributes.position.array;
        const sT = (L.flip ? 1 : -1) * L.side;
        const zs = [-14, -5, 5, 14];
        for (let i = 0; i < 4; i++) {
            const z = B.layout.gangZ + zs[i];
            B.pose.toWorld(L.side * hullHalfWidth(B.layout, z, B.layout.deck), B.layout.railTopAt(z), z, _o);
            L.T.pose.toLocal(_o.x, _o.y, _o.z, _l);
            const tz = Math.max(-L.T.layout.L / 2 + 2, Math.min(L.T.layout.L / 2 - 2, _l.z));
            L.T.pose.toWorld(sT * hullHalfWidth(L.T.layout, tz, L.T.layout.deck), L.T.layout.railTopAt(tz), tz, _l);
            arr.set([_o.x, _o.y, _o.z, _l.x, _l.y, _l.z], i * 6);
        }
        V.lines.geometry.attributes.position.needsUpdate = true;
        // the plank between the gangways (both ships' gangway gaps open while it lies there)
        if (L.planks) {
            if (!V.plank) {
                V.plank = new THREE.Mesh(PLANK_GEO || (PLANK_GEO = new THREE.BoxGeometry(2.4, 0.15, 1)), PLANK_MAT || (PLANK_MAT = new THREE.MeshLambertMaterial({ color: 0x3a2a1e })));
                V.plank.castShadow = true;
                g.scene.add(V.plank);
                V.col = new PlankCollider();
                g.collision?.addMover?.(V.col);
                B.boardPlank = true; L.T.boardPlank = true;
                V.T = L.T;
            }
            const gw = this._gangways(L, this._gw2 || (this._gw2 = {}));
            B.pose.toWorld(gw.a.x + Math.sign(gw.a.x) * 0.4, gw.a.y, gw.a.z, _o);
            L.T.pose.toWorld(gw.b.x + Math.sign(gw.b.x) * 0.4, gw.b.y, gw.b.z, _l);
            V.col.set(_o, _l);
            const len = Math.hypot(_l.x - _o.x, _l.y - _o.y, _l.z - _o.z);
            V.plank.scale.set(1, 1, Math.max(0.5, len));
            V.plank.position.set((_o.x + _l.x) / 2, (_o.y + _l.y) / 2 + 0.08, (_o.z + _l.z) / 2);
            V.plank.lookAt(_l.x, _l.y + 0.08, _l.z);
        }
    }

    _dropView() {
        const g = this.game, V = this.view;
        if (!V) return;
        g.scene.remove(V.lines);
        V.lines.geometry.dispose();
        if (V.plank) g.scene.remove(V.plank);
        if (V.col) g.collision?.removeMover?.(V.col);
        if (this.ship) this.ship.boardPlank = false;
        if (V.T) V.T.boardPlank = false;
        this.view = null;
    }

    _netLash() {
        const n = this.net;
        if (!n?.l) return null;
        const T = this.game.ships?.list.get(n.l[0]);
        if (!T) return null;
        return { T, side: n.l[1], flip: !!n.l[2], planks: !!n.l[3] };
    }

    // ================================================================ the captain's health over the screen
    _hudBar() {
        if (typeof document === 'undefined') return;
        const g = this.game;
        const cap = this._captain();
        const me = g.character?.group.position;
        const show = !!cap && !!me && Math.hypot(cap.x - me.x, cap.z - me.z) < 70 && !this.taken;
        if (!this._hud && !show) return;
        if (!this._hud) {
            const el = this._hud = document.createElement('div');
            el.id = 'bb-bar';
            el.innerHTML = '<div class="boss-name">🏴‍☠️ Капитан Чёрные Усы</div><div class="boss-track"><div class="boss-fill"></div></div>';
            document.body.appendChild(el);
        }
        this._hud.style.display = show ? 'block' : 'none';
        if (show) this._hud.querySelector('.boss-fill').style.width = (100 * Math.max(0, cap.hp) / (cap.maxHp || 100)).toFixed(1) + '%';
    }

    // ================================================================ network
    _send() {
        const L = this.lash;
        this.game.sync.net.send({ t: 'bbd', ph: this.phase, l: L ? [L.T.id, L.side, L.flip ? 1 : 0, L.planks ? 1 : 0] : 0 });
    }

    onNet(m, isHost) {
        if (isHost) return;
        if (Array.isArray(m.shot)) { this._shotFx(_v.set(+m.shot[0], +m.shot[1], +m.shot[2])); return; }
        this.net = { ph: m.ph, l: Array.isArray(m.l) ? m.l : null };
        this.phase = m.ph || this.phase;
    }

    dispose() {
        this._dropView();
        if (this._hud) { this._hud.remove(); this._hud = null; }
    }
}

let LINE_MAT = null, PLANK_GEO = null, PLANK_MAT = null;

void SHIP_CLASSES; void SEA; void r3; void isCursed;
