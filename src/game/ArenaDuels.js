/**
 * ArenaDuels.js — the life of the duel arenas (src/world/DuelArenas.js; the rules — ArenaRules.js).
 *
 * The author: «Любой зритель может прийти бесплатно, садишься на трибуну и смотришь. Волшебники выходят и
 * проводят дуэль. Дуэли должны быть интересными. Болельщики должны быть. Волшебники должны стараться.
 * Дуэли — два луча, как наши. Задача — победить соперника и отобрать его палочку: Экспеллиармус, потом
 * Акцио. Целая серия битв: одни сразились, ушли, другие пришли. Ночью дуэли не проводят. Максимум 5 минут.»
 *
 *   The fans      wizards of the tower beside it come by day (from the tower's side of its land), walk in by
 *                 the front gate, climb to a free seat on a long side and sit; they cheer a hit, a save, a
 *                 clash of beams, groan at a fall, clap when the duellists come out; they go home at night
 *                 (or when nobody is near). A player sits on the stands as anyone does — free.
 *   A bot duel    two wizards walk in, meet in the middle and bow (applause), walk to their marks, «3-2-1»,
 *                 the gong — and fight with the real duel charges (Duel.js: the beams meet in a clash, the
 *                 hand shield, a step aside), trying all the time (ArenaPoses: 12 efforts). Won: the other
 *                 can't answer (stunned, frozen, down) → «Экспеллиармус» → the wand flies → «Акцио!» → it is
 *                 the winner's: the winner raises his wand, the loser goes away sad. At 5 minutes it ends.
 *   The player    a hand on the book of duels on the lectern by the front gate (with a wand in the other
 *                 hand… or the same) — signed up; his turn: «выходите на арену», a wizard comes out to the
 *                 far mark; the player on his own mark → «3-2-1» → a real duel. Won (the wizard's wand
 *                 taken: «Акцио» or by hand) — the wizard goes away sad, 100 coins wait on the lectern;
 *                 lost (his wand taken by the wizard) — nothing; his wand is given back on the lectern.
 *   Legal         at the arena the duel is a legal fight: nobody minds the spells (CastleLife.hit → onHit,
 *                 startle → calm). Killing is a foul — a part of the wizards attack (ArenaRules.avengers);
 *                 a death from the fall after «Вингардиум Левиоса» is an accident.
 *
 * Who / what (CLAUDE.md): only the arena's own duellists fight here; every other creature, thing and spell
 * works at the arena as anywhere (a stray charge into the stands is a stray charge). The stone of the arena:
 * EnchantedStone.js. Space / planets: the arenas are on the Earth only (DuelArenas — the towers' cells).
 *
 * Network: the host runs it all (the people are CastleLife's: their places and modes go as theirs); the
 * phase, the count, the sign-up and the sounds go by 'arn' messages — each computer shows its own player's.
 */

import * as THREE from 'three';
import { ARENA_DUEL, isBanned, killVerdict, avengers, duelClock, arenaSpell, arenaStance, arenaDefence, arenaFresh, arenaDownTime, softBlow } from './ArenaRules.js';
import { ARENA, onArenaFloor } from '../world/DuelArenas.js';
import { TOWER_ZONE } from '../world/WizardTowers.js';
import { CAST_EFFORTS } from '../entities/ArenaPoses.js';
import { FX } from '../fx/WizardFx.js';
import { NPC_COST, CAST_PREP } from './WizardAI.js';
import { DUEL_SPELLS } from './Duel.js';
import { PVP } from './Combat.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { newUid } from './ItemTypes.js';
import { CappedLog } from '../core/CappedLog.js';
import { ArenaQueue, STEWARD, STEWARD_LINES, duelSpots, stewardIntent } from './ArenaSteward.js';
import { ArenaMarkFx } from '../fx/ArenaMarkFx.js';
import { ArenaTagFx } from '../fx/ArenaTagFx.js';
import { tagOf, tagKey, tagShown } from './ArenaTag.js';
import { villagerLook } from '../entities/VillagerModel.js';
import { foeRanks } from './SpawnSpots.js';
import { wizardWandOf } from './Expelliarmus.js';
import { creativeFiniteMana } from './HeroSetup.js';
import { starterWand } from './ItemTypes.js';
import { domeOf, domeCross } from './ArenaDome.js';
import { duelReport } from './DuelReport.js';
import { ArenaDomeFx } from '../fx/ArenaDomeFx.js';
import { DuelEndUi, AGAIN_AFTER, AGAIN_AFTER_LOSS } from '../ui/DuelEndUi.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const WALK = 2.3, RUN = 5.6;
/** s a wizard stands stunned after his wand was knocked out, before he runs for it (the player's «Акцио» can take it first). */
const SHOCK_AFTER_DISARM = 2.5;
/** How far the world is drawn and made in the duel-only start (m): the arena's stands reach ~50 m, the levelled land 64. */
const MODE_VIEW = 90;
/** Mana a spell costs a duellist at the arena: they pace themselves (a long duel), lighter than in a real fight. */
const arenaCost = (spell) => Math.max(2, Math.round((NPC_COST[spell] ?? 10) * 0.6));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/**
 * The steward's look: a merchant's, but in the arena's robe — a long violet gown, a gold vest, a violet cap with a gold band, a
 * rod of office in the hand; no goods, no coin pouch (he sells nothing and takes nothing).
 */
export function stewardLook(seed, female, castleColor) {
    const L = villagerLook(seed, 'merchant', female, { castleColor });
    return Object.assign(L, {
        steward: true, dress: true, dressColor: 0x4b2a7a, shirt: 0xf1ead6, pants: 0x2c1a4a, accent: 0xd8a62a,
        hat: 'beret', hatColor: 0x3a1f66, plume: false, shield: false, tool: 'staff', boots: 0x2b1a14,
    });
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3();

const FAN_LINES = {
    hit: ['Есть!', 'Попал!', 'Вот это да!', 'Ещё!', 'Давай!'],
    save: ['Щит!', 'Отбил!', 'Ловко!', 'Ух!'],
    clash: ['Лучи сошлись!', 'Дави!', 'Держись!', 'Сильнее!'],
    win: ['Браво!', 'Победа!', 'Великолепно!', 'Чемпион!'],
    fall: ['Ох!', 'Ай!', 'Осторожно!'],
    start: ['Начинают!', 'Тише, тише!', 'Смотри!'],
};

/** A wizard of the arena: what he does there now. */
const isFan = (v) => v.arena?.kind === 'fan';

export class ArenaDuels {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // arena id → state
        this.log = new CappedLog(); // (what happened: tests)
        this._scanT = 0;
        this.myQueue = null; // (this computer's player: signed up at which arena — for its hints)
        this.count = null; // (the «10…1» shown to this player: {at, n})
        this.askedAt = -1e9; // (the steward asked this computer's player «Хотите сразиться?» — a bare «да» counts after it)
        this.marks = new ArenaMarkFx(game); // the lit places of a player's duel (ArenaMarkFx.js)
        this._markT = 0;
        this.tagFx = new ArenaTagFx(game); // the sign over a duellist (Creative only: ArenaTag.js)
        this._tagT = 0;
        this.domeFx = new ArenaDomeFx(game); // the magic dome over the floor: unseen till someone comes close or a charge bursts on it
        this.endUi = new DuelEndUi(); // «Вы победили!» and «Хотите повторить дуэль?» (the duel mode)
        this.mode = null; // «Перед дуэлью» (Creative start): {arenaId, foe, id} — a fight after a fight on this arena, see startDuelMode
    }

    get life() { return this.game.castleLife; }
    get auth() { return !!this.game.authority; }

    _sites() { const g = this.game; return g.world?.terrain?.data?.sites || g.terrain?.data?.sites || null; }

    // ------------------------------------------------------------------ the frame
    update(dt) {
        const g = this.game;
        if (!g.character) return;
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = 1; this._scan(); }
        if (this.mode && this.auth) this._modeStep(dt);
        for (const A of this.list.values()) {
            if (this.auth) this._run(A, dt);
            this._signUp(A, dt);
        }
        this._countdown(dt);
        this._lit(dt);
        this._dome(dt);
        this._tags(dt);
    }

    /** The arenas near any player (the host — near anyone; a guest — near itself, for the sign-up). */
    _scan() {
        const g = this.game, S = this._sites();
        if (!S?.arenasNear) return;
        const ps = [g.character.group.position];
        if (this.auth) for (const r of g.remotes?.values?.() || []) if (r?.position && !r.dead) ps.push(r.position);
        const near = new Set();
        for (const p of ps) {
            for (const def of S.arenasNear(p.x, p.z, ARENA_DUEL.LIVE_R)) {
                near.add(def.id);
                if (!this.list.has(def.id)) this.list.set(def.id, this._state(def));
                // (the tower's empty field beside it: now and then a training fight there)
                if (def.train) { const f = this._field(def); near.add(f.id); if (!this.list.has(f.id)) this.list.set(f.id, this._state(f)); }
            }
        }
        for (const [id, A] of this.list) if (!near.has(id)) { this._close(A); this.list.delete(id); }
    }

    _state(def) {
        // where the arena's people come from: the edge of the tower's land on the arena's side
        // (a settlement's arena: from its road, past the front gate)
        const G = def.gates[0].out, c = def.centre, gl = Math.hypot(G.x - c.x, G.z - c.z) || 1;
        let home = { x: G.x + (G.x - c.x) / gl * 12, y: G.y, z: G.z + (G.z - c.z) / gl * 12 };
        if (def.towerAt) {
            const dx = def.x - def.towerAt.x, dz = def.z - def.towerAt.z, d = Math.hypot(dx, dz) || 1;
            home = { x: def.towerAt.x + dx / d * (TOWER_ZONE + 4), y: def.gates[0].out.y, z: def.towerAt.z + dz / d * (TOWER_ZONE + 4) };
        }
        // the seats on the long sides only (a charge flies along the floor's axis — never into the crowd)
        const seats = def.seats.map((s, i) => ({ ...s, i })).filter((s) => s.side);
        const restT = def.practice ? ARENA_DUEL.PRACTICE_REST[0] * Math.random() : 4;
        return { id: def.id, def, home, seats, taken: new Map(), fans: new Set(), want: 0, spawnT: 0, phase: 'idle', restT, duel: null, queue: new ArenaQueue(), owed: null, sayT: 0, netT: 0, steward: null, stewT: 0, asked: new Map(), ph: 'idle', pl: null };
    }

    /**
     * The training field beside a tower (DuelArenas.trainingField; the author: «иногда возле башни будет
     * сражение обычных магов — не насмерть, тренировочное: собрались, сразились на пустом поле в стороне от
     * башни, потренировались и ушли. Без инфраструктуры»): an arena-like place with no stands, no lectern.
     */
    _field(def) {
        const t = def.train, id = def.id + ':tr';
        if (this._fields?.has(id)) return this._fields.get(id);
        const ux0 = t.x - def.towerAt.x, uz0 = t.z - def.towerAt.z, l = Math.hypot(ux0, uz0) || 1, ux = ux0 / l, uz = uz0 / l;
        const px = -uz, pz = ux, y = t.F - 0.5;
        const at = (k, m) => ({ x: t.x + ux * k + px * m, y, z: t.z + uz * k + pz * m });
        const gate = (m) => ({ out: at(-12, 0), in: at(-4, 0), mark: at(0, m) });
        const f = {
            id, x: t.x, z: t.z, centre: at(0, 0), axis: { a: at(0, -6), b: at(0, 6), r: 10 }, outer: 16,
            gates: [gate(-8), gate(8)], desk: null, seats: [], towerAt: def.towerAt, tower: def.tower, practice: true,
        };
        (this._fields || (this._fields = new Map())).set(id, f);
        return f;
    }

    /** (every computer) The arena is left behind: its people go (the host), the hints stop. */
    _close(A) {
        if (this.auth) {
            for (const v of [...A.fans]) this._release(v, true);
            if (A.duel) for (const v of [A.duel.a, A.duel.b]) if (v) this._release(v, true);
            if (A.steward) { this._release(A.steward, true); A.steward = null; }
        }
        A.fans.clear();
        A.duel = null;
    }

    // ------------------------------------------------------------------ the host: the arena's life
    _tower(A) {
        const L = this.life, def = A.def;
        if (!def.tower || !L?.index?.byId) return null;
        const tdef = L.index.byId(def.tower);
        if (!tdef) return null;
        const cs = L._runtime(tdef);
        if (!cs.awake) L._wake(cs); // (its people live while anybody is at its arena)
        return cs;
    }

    /** Somebody at the arena (a player within LIVE_R) and day: it lives. */
    _live(A) {
        const g = this.game;
        if (this.mode?.arenaId === A.id) return true; // (the duel mode: day or night, the show goes on)
        if (g.isNight) return false;
        const near = (p) => p && Math.hypot(p.x - A.def.x, p.z - A.def.z) < ARENA_DUEL.LIVE_R;
        if (near(g.character.group.position)) return true;
        for (const r of g.remotes?.values?.() || []) if (!r.dead && near(r.position)) return true;
        return false;
    }

    _run(A, dt) {
        const L = this.life;
        if (!L?.enabled) return;
        const cs = this._tower(A);
        if (!cs) return;
        // the dead and the gone are no longer the arena's
        for (const v of [...A.fans]) if (v.dead || !L.byId.has(v.id)) { A.fans.delete(v); this._freeSeat(A, v); }
        // (not while the tower is alarmed — a blast, an enemy about: nobody strolls to the stands as if nothing happened)
        const live = this._live(A) && !((cs.wizAlarmUntil || 0) > Date.now() || [...cs.hostile.values()].some((u) => u > Date.now()));
        // the fans: come by day, a few at a time; go home at night / with nobody near
        if (live && !A.def.practice) {
            if (!A.want) A.want = ARENA_DUEL.FANS[0] + Math.floor(Math.random() * (ARENA_DUEL.FANS[1] - ARENA_DUEL.FANS[0] + 1));
            A.spawnT -= dt;
            if (!A.duel && A.fans.size < A.want && A.spawnT <= 0) { // (the people come while the field is empty — never during a duel)
                A.spawnT = 1.2 + Math.random() * 1.8; this._recruit(A, cs, 'fan'); }
        } else if (A.fans.size && !A.duel) { for (const v of [...A.fans]) this._release(v); A.fans.clear(); A.want = 0; } // (they leave when the field is free)
        this._keepSteward(A, cs, live, dt);
        // the duels: one after another (a player signed up does not wait out a long rest)
        const D = A.duel;
        if (!D) {
            if (A.queue.length && A.restT > 4) A.restT = 4;
            A.restT -= dt;
            if (live && A.restT <= 0 && this.mode?.arenaId !== A.id && this._ready(A, dt)) this._nextDuel(A, cs); // (the duel mode makes its own: _modeStep)
        } else this._referee(A, D, dt);
        // the reward: the winner at the lectern
        if (A.owed) {
            const p = L._playerPos(A.owed.id), S = A.def.desk.stand || A.def.desk.front;
            if (p && Math.hypot(p.x - S.x, p.z - S.z) < 4.5) {
                // (the steward gives the 100 coins from his hand — or, with nobody there, they lie on the book as ever)
                const w = A.steward && !A.steward.dead ? A.steward : null, b = A.def.desk.book;
                const at = w ? new THREE.Vector3(w.x + (p.x - w.x) * 0.35, w.y + 2.6, w.z + (p.z - w.z) * 0.35) : new THREE.Vector3(b.x, b.y + 0.7, b.z);
                this.game.items?.spawnLoose({ kind: 'coins', uid: newUid(), count: ARENA_DUEL.REWARD }, at, { hover: true });
                if (w) this._say(A, 'win');
                this._fx(A, 'fanfare', b);
                this._tell(A.owed.id, { e: 'paid', id: A.id });
                this.log.push('paid:' + A.owed.id);
                A.owed = null;
            } else if (!p) A.owed = null;
        }
        A.sayT -= dt;
        // a player signed up who has walked away is struck off
        for (const id of A.queue.prune((id) => { const q = L._playerPos(id), S = A.def.desk.stand; return !q || !S || Math.hypot(q.x - S.x, q.z - S.z) > STEWARD.LEAVE_R; })) this._tell(id, { e: 'off', id: A.id, why: 'left' });
    }

    // ------------------------------------------------------------------ the steward
    /**
     * (host) The arena's steward: a living man of the tower in the robe of the arena, by the front gate, by day while anybody is
     * near; a player near him who is not signed up is asked «Хотите сразиться?». He goes home at night.
     */
    _keepSteward(A, cs, live, dt) {
        const L = this.life;
        if (!A.def.desk?.stand) return;
        const s = A.steward;
        if (s && (s.dead || !L.byId.has(s.id) || s.arena?.kind !== 'steward')) A.steward = null;
        if (live && !A.steward) {
            A.stewT -= dt;
            if (A.stewT <= 0) { A.stewT = 4; A.steward = this._recruitSteward(A, cs); }
        } else if (!live && A.steward && !A.duel && !A.queue.length) { this._release(A.steward); A.steward = null; }
        if (A.steward) this._ask(A);
    }

    _recruitSteward(A, cs) {
        const L = this.life, def = cs.def, st = L.state(def.id), S = A.def.desk.stand, n = def.population || 24;
        for (let idx = n - 1; idx >= 1; idx--) { // (from the end of the roster: the same man every time; never the Master)
            if (cs.active.has(idx) || st.killed.has(idx)) continue;
            const out = yawTo(A.def.x, A.def.z, S.x, S.z);
            const v = L._activate(cs, idx, { x: S.x, y: S.y, z: S.z, yaw: out }, 'arena', { look: (look, e) => Object.assign(look, stewardLook(e.seed, e.female, def.color)) });
            if (!v) continue;
            v.arena = { id: A.id, kind: 'steward', leg: 0 };
            v.steward = true;
            L._ground(v);
            this.log.push('steward:' + v.id);
            return v;
        }
        return null;
    }

    /** (host) He asks a player who comes up to him. */
    _ask(A) {
        const L = this.life, v = A.steward, S = A.def.desk.stand, now = Date.now();
        if (!v || v.dead || v.foe || v.fleeT > 0 || (v.talking | 0) > 0) return;
        for (const { id, p } of L._players(true)) {
            if (A.queue.has(id) || A.duel?.p === id || Math.hypot(p.x - S.x, p.z - S.z) > STEWARD.ASK_R) continue;
            if (now - (A.asked.get(id) || 0) < STEWARD.ASK_EVERY * 1000) continue;
            A.asked.set(id, now);
            L._say(v, pick(STEWARD_LINES.ask), 4);
            this._tell(id, { e: 'ask', id: A.id });
            this.log.push('ask:' + id);
            return;
        }
    }

    /** (host) The steward says one of his lines (by key). */
    _say(A, key) {
        const v = A.steward;
        if (v && !v.dead && STEWARD_LINES[key]) this.life._say(v, STEWARD_LINES[key], 4);
    }

    /** (host) The steward stands on his place, turned to the nearest player (else to the road). */
    _steward(A, v, dt) {
        const L = this.life, S = A.def.desk.stand;
        v.seated = false;
        if (Math.hypot(v.x - S.x, v.z - S.z) > 1.2) { this._go(v, S, WALK, dt, 0.5); return true; }
        v.speed = 0; v.mode = 'idle';
        let best = null, bd = 12;
        for (const { p } of L._players(true)) { const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < bd) { bd = d; best = p; } }
        if (!(v.talking > 0)) v.yaw = turnToward(v.yaw, best ? yawTo(v.x, v.z, best.x, best.z) : yawTo(A.def.x, A.def.z, S.x, S.z), 2.5 * dt);
        L._ground(v);
        return true;
    }

    /**
     * (the player's computer: CastleTalk) What the steward answers to my words, or null (not for him: the villager's
     * ordinary talk goes on). Rules only, at once. Signing up / cancelling go to the host.
     */
    stewardHear(v, text) {
        const A = this.list.get(v.arena?.id), g = this.game;
        if (!A) return null;
        const it = stewardIntent(text), now = performance.now();
        const L = STEWARD_LINES;
        const mine = this.auth ? A.queue.has(g.localId) || A.duel?.p === g.localId : !!this.myQueue;
        if (it === 'no') {
            if (!mine) return it === 'no' && now - this.askedAt < STEWARD.ANSWER_T * 1000 ? { reply: L.off } : null;
            this._cancel(A, g.localId);
            return { reply: L.off };
        }
        if (it === 'info') return { reply: L.info };
        const asked = now - this.askedAt < STEWARD.ANSWER_T * 1000;
        if (it === 'want' || (it === 'yes' && asked)) {
            this.askedAt = -1e9;
            if (mine) return { reply: L.again };
            if (g.isNight) return { reply: L.night };
            if (!g.items?.wand) return { reply: L.wand };
            if (this.auth) this._join(A, g.localId); else { this.myQueue = A.id; g.sync?.arena?.({ e: 'join', id: A.id }); }
            const busy = this.auth ? !!A.duel : A.ph !== 'idle';
            return { reply: `${L.terms} ${busy ? L.wait : L.soon}` };
        }
        return null;
    }

    /** (every computer) This computer's player cancels his sign-up. */
    _cancel(A, id) {
        if (this.auth) { if (A.queue.cancel(id)) this.log.push('cancel:' + id); const D = A.duel; if (D?.p === id && D.phase !== 'fight' && D.phase !== 'over') this._end(A, D, null, 'noshow'); } else { this.myQueue = null; this.game.sync?.arena?.({ e: 'cancel', id: A.id }); }
    }

    /**
     * (host) The order of the show: first everybody comes and sits (the fans are all in their seats, nobody walks
     * on the floor), only then the duellists come out. The wait for slow ones is limited.
     */
    _ready(A, dt) {
        A.readyT = (A.readyT || 0) + dt;
        const L = this.life;
        let busy = false;
        for (const v of L.byId.values()) if (v.arena?.id === A.id && !v.dead && (v.arena.kind === 'leave' || (v.arena.kind === 'fan' && !v.seated)) && onArenaFloor(A.def, v.x, v.z, -1)) busy = true;
        if (busy) return false;
        if (!A.def.practice && A.fans.size < A.want && A.readyT < 90) return false;
        for (const v of A.fans) if (!v.seated && A.readyT < 90) return false;
        A.readyT = 0;
        return true;
    }

    /** A point on the floor's edge by the stands on the seat's side (a walk to the seat goes round the floor, never across). */
    _edge(A, seat) {
        const { a, b } = A.def.axis, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
        if (l < 1) return null;
        const nx = -dz / l, nz = dx / l, sgn = (seat.x - a.x) * nx + (seat.z - a.z) * nz >= 0 ? 1 : -1;
        const r = A.def.axis.r - 0.7;
        return { x: a.x + nx * sgn * r, y: a.y ?? A.def.floorY, z: a.z + nz * sgn * r };
    }

    /** How long a duel here may go (s): an arena's 5 minutes, a training fight's 2. */
    _maxT(A) { return A.def.practice ? ARENA_DUEL.PRACTICE_T : ARENA_DUEL.MAX_T; }

    /** (host) One more wizard of the tower for the arena: from its roster, one who is not out now. */
    _recruit(A, cs, kind, only = null) {
        const L = this.life, def = cs.def, st = L.state(def.id);
        const n = def.population || 24;
        const start = 1 + Math.floor(Math.random() * (n - 1));
        // (`only(idx)`: one of this rank — the duel mode's opponent; then the Master may come too)
        const order = only ? [...Array(n).keys()].map((i) => (i + start) % n).filter(only) : null;
        for (let k = 0; k < (order ? order.length : n - 1); k++) {
            const idx = order ? order[k] : 1 + ((start - 1 + k) % (n - 1)); // (never the Master: he keeps his study)
            if (cs.active.has(idx) || st.killed.has(idx)) continue;
            const h = A.home, a = Math.random() * Math.PI * 2, r = Math.random() * 4;
            const v = L._activate(cs, idx, { x: h.x + Math.cos(a) * r, y: h.y, z: h.z + Math.sin(a) * r, yaw: yawTo(h.x, h.z, A.def.x, A.def.z) }, 'arena');
            if (!v) continue;
            if (!v.W) { L._deactivate(v); continue; }
            v.arena = { id: A.id, kind, leg: 0 };
            v.job = 'arena';
            L._ground(v);
            if (kind === 'fan') A.fans.add(v);
            this.log.push(kind + ':' + v.id);
            return v;
        }
        return null;
    }

    /** (host) This wizard leaves the arena: back to the tower's side and gone (now: at once). */
    _release(v, now = false) {
        const L = this.life;
        if (!v || !v.arena) return;
        const A = this.list.get(v.arena.id);
        if (A) this._freeSeat(A, v);
        const fromSeat = !!v.seated; v.seated = false; v.arenaFight = false; v.fx = (v.fx | 0) & ~FX.SHIELD;
        if (v.noWand) { v.noWand = false; v.lostWand = null; v.model?.setHeldTool?.('wand'); } // (the duel is over: the wand given back)
        if (now || v.dead || !A) { v.arena = null; if ((!v.dead || this.mode) && L.byId.has(v.id)) L._deactivate(v); return; } // (the duel mode: a fallen wizard is taken away, no body left lying)
        v.arena = { id: A.id, kind: 'leave', leg: 0, sad: v.arena.sad, seat: v.arena.seat, fromSeat, home: !!v.steward };
    }

    _freeSeat(A, v) { for (const [i, w] of A.taken) if (w === v) A.taken.delete(i); }

    /** A free seat (the lower rows and the middle first, with a little chance). */
    _seat(A, v) {
        let best = null, bs = Infinity;
        for (const s of A.seats) {
            if (A.taken.has(s.i)) continue;
            const t = Math.hypot(s.x - A.def.x, s.z - A.def.z);
            const score = s.row * 3 + t * 0.15 + Math.random() * 9;
            if (score < bs) { bs = score; best = s; }
        }
        if (best) A.taken.set(best.i, v);
        return best;
    }

    // ------------------------------------------------------------------ the duels
    _nextDuel(A, cs) {
        // the players signed up first (the first in the queue still here, with a wand)
        const p = A.queue.take((id) => !!this.life._playerPos(id));
        const a = this._recruit(A, cs, 'duel');
        if (!a) { A.restT = 10; if (p != null) A.queue.list.unshift(p); return; }
        let b = null;
        if (p == null) { b = this._recruit(A, cs, 'duel'); if (!b) { this._release(a, true); A.restT = 10; return; } }
        A.duel = { a, b, p, phase: 'enter', t: 0, go: 0, offT: 0, pull: null, trophy: null, said: 0 };
        a.arena.side = 1; // (the far mark)
        if (b) b.arena.side = 0;
        this.log.push('duel:' + a.id + (b ? ':' + b.id : ':player ' + p));
        if (p != null) { this._tell(p, { e: 'call', id: A.id, name: a.name }); this._say(A, 'call'); }
        this._send(A);
    }

    /** (host) The duel's course: its phases, the end. */
    _referee(A, D, dt) {
        const L = this.life;
        D.t += dt;
        const gone = (v) => !v || v.dead || !L.byId.has(v.id) || !v.arena; // (or called away from the arena: a fight, a fright — step())
        if (D.phase === 'over') {
            if (D.t > 4.5) {
                const now = this.mode?.arenaId === A.id; // (the duel mode: the old wizard goes at once — he must not walk on at the hero during the next duel)
                for (const v of [D.a, D.b]) if (v && (!v.dead || now)) this._release(v, now);
                A.duel = null;
                const R = A.def.practice ? ARENA_DUEL.PRACTICE_REST : ARENA_DUEL.REST; // (a training: once in a while; the arena: the next pair soon)
                A.restT = R[0] + Math.random() * (R[1] - R[0]);
                this._send(A);
            }
            return;
        }
        // a duellist gone (killed by something else, the tower asleep): the duel is off
        if (gone(D.a) || (!D.p && gone(D.b))) { this._end(A, D, null, 'gone'); return; }
        if (D.p != null && !L._playerPos(D.p)) { this._end(A, D, 'a', 'left'); return; }
        const marks = A.def.gates;
        if (D.phase === 'enter') {
            // in by the front gate; the two meet in the middle (a player's opponent goes to his mark)
            const inA = this._inside(D.a), inB = D.b ? this._inside(D.b) : true;
            if (inA && inB && D.t > 4) {
                if (D.p != null) { D.phase = 'call'; D.t = 0; } else { D.phase = 'bow'; D.t = 0; this._fx(A, 'clap', A.def.centre); this._fans(A, 'start'); }
                this._send(A);
            }
            if (D.t > 90) this._end(A, D, null, 'gone');
            return;
        }
        if (D.phase === 'bow') {
            if (D.t > 2.6) { D.phase = 'marks'; D.t = 0; this._send(A); }
            return;
        }
        if (D.phase === 'marks') {
            const at = (v) => Math.hypot(v.x - marks[v.arena.side].mark.x, v.z - marks[v.arena.side].mark.z) < 1.4;
            if ((at(D.a) && at(D.b)) || D.t > 25) { D.phase = 'count'; D.t = 0; this._send(A); this._fx(A, 'beep', A.def.centre); }
            return;
        }
        if (D.phase === 'call') {
            // the player comes out to the mark at the front gate's end
            const p = L._playerPos(D.p), m = marks[0].mark;
            const on = p && Math.hypot(p.x - m.x, p.z - m.z) < STEWARD.MARK_R;
            if (on) D.atMark = true;
            else if (D.atMark && p && Math.hypot(p.x - m.x, p.z - m.z) > STEWARD.MARK_AWAY) { this._tell(D.p, { e: 'off', id: A.id, why: 'moved' }); this._end(A, D, null, 'noshow'); return; } // (stood on his place, then walked off)
            if (on && Math.hypot(D.a.x - marks[1].mark.x, D.a.z - marks[1].mark.z) < 2) {
                D.phase = 'count'; D.t = 0; this._send(A); this._fx(A, 'beep', A.def.centre); this._say(A, 'go');
            } else if (D.t > ARENA_DUEL.CALL_WAIT) { this._tell(D.p, { e: 'missed', id: A.id }); this._end(A, D, null, 'noshow'); }
            return;
        }
        if (D.phase === 'count') {
            if (D.p != null) { // (the player's place: he stays on it till «Бой!»)
                const p = L._playerPos(D.p), m = marks[0].mark;
                if (!p || Math.hypot(p.x - m.x, p.z - m.z) > STEWARD.MARK_AWAY) { this._tell(D.p, { e: 'off', id: A.id, why: 'moved' }); this._end(A, D, null, 'noshow'); return; }
            }
            const n = Math.floor(D.t);
            if (n > D.said && n < ARENA_DUEL.COUNT) { D.said = n; this._fx(A, 'beep', A.def.centre); }
            if (D.t >= ARENA_DUEL.COUNT) { D.phase = 'fight'; D.t = 0; D.go = 0; this._fx(A, 'gong', A.def.centre); this._send(A); }
            return;
        }
        // ---- the fight
        D.go += dt;
        for (const v of [D.a, D.b]) if (v) this._recover(v, D);
        if (A.def.practice ? D.go >= this._maxT(A) : duelClock(D.go) === 'draw') { this._end(A, D, null, 'time'); return; }
        // the player: off the floor too long — the duel given up
        if (D.p != null) {
            const p = L._playerPos(D.p);
            const on = p && onArenaFloor(A.def, p.x, p.z, -ARENA_DUEL.FAR_FLOOR);
            D.offT = on ? 0 : D.offT + dt;
            if (D.offT > ARENA_DUEL.OFF_FLOOR) { this._end(A, D, 'a', 'off'); return; }
        }
        this._pullStep(A, D, dt);
        // won: the loser's wand taken
        if (D.trophy) { this._end(A, D, D.trophy.by === D.a ? 'a' : 'b', 'wand'); return; }
        // the player took the wizard's wand (picked it up, «Акцио») — it is no longer lying anywhere
        if (D.p != null && D.a.noWand) {
            const lw = D.a.lostWand;
            const lying = lw && this.game.items?.loose?.has(lw.uid);
            if (!lying && !(D.pull && D.pull.to === D.a)) { this._end(A, D, 'p', 'wand'); return; }
        }
    }

    /**
     * (host) A duellist stunned / thrown down: a fresh one is up again in a moment (ArenaRules.arenaDownTime) —
     * the duel goes on; a worn-out one stays down as long as anyone.
     */
    _recover(v, D) {
        if (!(v.stunT > 0)) { v.arena.down = null; return; }
        if (v.arena.down == null) {
            v.arena.down = arenaDownTime(arenaFresh(v.mana, v.maxMana, D.go));
            v.mana = Math.max(0, v.mana - ARENA_DUEL.FALL_COST * v.maxMana); // (every fall takes it out of him: the duel goes in rounds)
            v.arena.falls = (v.arena.falls || 0) + 1;
            this._fans(this.list.get(v.arena.id), 'hit');
        }
        const cap = v.arena.down;
        const e = this.game.creatureImpact?.active?.get?.('v|' + v.id);
        if (e?.s && (e.s.state === 'falling' || e.s.state === 'down') && e.s.minDown > cap) e.s.minDown = cap;
        if (v.stunT > cap + 3) v.stunT = cap + 3; // (+ the fall and getting up)
    }

    _inside(v) {
        const A = this.list.get(v.arena.id);
        return !!A && onArenaFloor(A.def, v.x, v.z, 1) && v.arena.leg >= 2;
    }

    /**
     * (host) The end: `who` 'a' | 'b' | 'p' (the player) won, null — nobody (5 minutes, gone). The winner raises
     * his wand, the loser goes away sad; the player who won — 100 coins at the lectern; who lost — his wand back there.
     */
    _end(A, D, who, why) {
        D.phase = 'over'; D.t = 0; D.result = who; D.why = why;
        const L = this.life;
        const win = who === 'a' ? D.a : who === 'b' ? D.b : null;
        const lose = who === 'a' ? D.b : who === 'b' ? D.a : who === 'p' ? D.a : null;
        if (win) { win.arena.win = true; L._say(win, pick(['Победа!', 'Палочка моя!', 'Хорошая была дуэль!']), 3); }
        if (lose) { lose.arena.sad = true; L._say(lose, pick(['Эх…', 'В другой раз…', 'Не повезло…']), 3); }
        for (const v of [D.a, D.b]) if (v) { v.arenaFight = false; v.prep = null; v.fx = (v.fx | 0) & ~FX.SHIELD; }
        if (why !== 'gone' && why !== 'noshow' && why !== 'foul') { this._fx(A, 'gong', A.def.centre); if (who) { this._fx(A, 'cheer', A.def.centre); this._fans(A, 'win'); } }
        // the player's wand, taken by the wizard: given back on the lectern
        if (D.trophy?.player != null) {
            const b = A.def.desk.book;
            this.game.items?.spawnLoose(D.trophy.item, new THREE.Vector3(b.x, b.y + 0.9, b.z), { hover: true });
        }
        if (who === 'p') A.owed = { id: D.p };
        if (D.p != null) this._tell(D.p, { e: 'end', id: A.id, r: who === 'p' ? 'win' : who === 'a' ? 'lose' : why === 'time' ? 'draw' : why });
        this._logEnd(A, D, who, why);
        this.log.push((A.def.practice ? 'train:' : 'end:') + (who || 'none') + ':' + why + ':' + Math.round(D.go));
        this._send(A);
    }

    // ------------------------------------------------------------------ the people (CastleLife._think → step)
    /** (host) A wizard of the arena this frame: true — handled here. */
    step(v, dt) {
        const A = this.list.get(v.arena?.id);
        if (!A) { v.arena = null; return false; }
        if (v.foe || v.fleeT > 0 || v.investigate) { if (v.arena.kind === 'fan') { A.fans.delete(v); this._freeSeat(A, v); } if (v.arena.kind === 'steward') A.steward = null; v.arena = null; return false; } // (a real fight / fright: the arena is not his now)
        const k = v.arena.kind;
        if (k === 'fan') return this._fan(A, v, dt);
        if (k === 'leave') return this._leave(A, v, dt);
        if (k === 'duel') return this._duellist(A, v, dt);
        if (k === 'steward') return this._steward(A, v, dt);
        return false;
    }

    /** A duellist on the floor stays on it (the floor's capsule, a metre from the wall): the stands' steps are no place for him. */
    _keepOnFloor(A, v) {
        const { a, b, r } = A.def.axis, lim = r - 1;
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.z - a.z) * dz) / l2)) : 0;
        const cx = a.x + dx * t, cz = a.z + dz * t;
        const d = Math.hypot(v.x - cx, v.z - cz);
        if (d <= lim) return;
        v.x = cx + (v.x - cx) * lim / d; v.z = cz + (v.z - cz) * lim / d;
        v.path = null;
        this.life._ground(v);
    }

    _go(v, p, speed, dt, stop = 0.6) {
        const L = this.life;
        const d = L._steer(v, p.x, p.z, speed, dt, stop);
        v.mode = v.arena?.sad && v.speed > 0 ? 'sad' : v.speed > 0 ? (speed > WALK * 1.5 ? 'run' : 'walk') : 'idle';
        L._ground(v);
        return d <= stop + 0.05;
    }

    /** In by the front gate (legs: outside it → inside it → on). true: inside. */
    _enter(A, v, dt, speed = WALK) {
        const G = A.def.gates[0];
        if (v.arena.leg === 0) { if (this._go(v, G.out, speed, dt, 1.2)) v.arena.leg = 1; return false; }
        if (v.arena.leg === 1) { if (this._go(v, G.in, speed, dt, 1.0)) v.arena.leg = 2; return false; }
        return true;
    }

    _fan(A, v, dt) {
        if (!this._enter(A, v, dt)) return true;
        if (!v.arena.seat) { v.arena.seat = this._seat(A, v); if (!v.arena.seat) { this._release(v); return true; } }
        const s = v.arena.seat;
        if (!v.seated) {
            if (v.arena.edge === undefined) v.arena.edge = this._edge(A, s);
            if (v.arena.edge && !v.arena.edged) { if (this._go(v, v.arena.edge, WALK, dt, 0.8)) v.arena.edged = true; return true; }
            if (!this._go(v, s, WALK, dt, 0.35)) { v.arena.t = (v.arena.t || 0) + dt; if (v.arena.t > 60) { v.x = s.x; v.z = s.z; } else return true; }
            v.seated = true;
            v.arena.edged = false;
        }
        // sitting: facing the floor, the head after the duel; up with the arms at a good moment
        v.x = s.x; v.z = s.z; v.y = s.y; v.speed = 0;
        const D = A.duel;
        let yaw = s.yaw;
        if (D && D.a) {
            const fx = D.b ? (D.a.x + D.b.x) / 2 : D.a.x, fz = D.b ? (D.a.z + D.b.z) / 2 : D.a.z;
            const want = yawTo(v.x, v.z, fx, fz);
            const dy = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
            yaw = s.yaw + Math.max(-1, Math.min(1, dy)); // (turned towards it — on the seat, no more than a body turns)
        }
        v.yaw = turnToward(v.yaw, yaw, dt * 3);
        v.cheerT = (v.cheerT || 0) - dt;
        v.mode = v.cheerT > 0 ? 'sitCheer' : 'sit';
        return true;
    }

    _leave(A, v, dt) {
        const L = this.life, G = A.def.gates[0];
        v.seated = false;
        const seat = v.arena.seat, e = v.arena.fromSeat ? this._edge(A, seat) : null;
        const legs = v.arena.home ? [A.home] : e ? [e, A.def.gates[0].in, G.out, A.home] : [A.def.gates[0].in, G.out, A.home]; // (the steward walks home along the road, not through the gate)
        const leg = v.arena.leg || 0;
        if (leg === 0 && !e && !v.arena.home && !v.steward && v.arena.side != null) this._keepOnFloor(A, v); // (a duellist leaving: along the floor to the gate, not up the stands)
        if (leg < legs.length) { if (this._go(v, legs[leg], WALK * (v.arena.sad ? 0.75 : 1), dt, 1.2)) v.arena.leg = leg + 1; v.arena.t = (v.arena.t || 0) + dt; if (v.arena.t < 120) return true; }
        v.arena = null;
        L._deactivate(v); // (home in the tower)
        return true;
    }

    _duellist(A, v, dt) {
        const L = this.life, D = A.duel;
        if (!D || (D.a !== v && D.b !== v)) { this._release(v); return true; }
        const marks = A.def.gates, me = marks[v.arena.side].mark;
        const other = D.a === v ? D.b : D.a;
        v.seated = false;
        if (v.arena.leg >= 2) this._keepOnFloor(A, v); // (a duellist never climbs the stands or walks into their walls — at the fight, the bow, after it)
        switch (D.phase) {
            case 'enter': {
                if (!this._enter(A, v, dt)) return true;
                // to his own mark (equal points on opposite sides of the floor — never next to the other), facing the other: the bow, the count, only then the fight
                const at = me;
                if (this._go(v, at, WALK, dt, 0.4)) { v.mode = 'idle'; this._face(v, other ? other : marks[0].mark, dt); }
                return true;
            }
            case 'bow':
                v.speed = 0; this._face(v, other, dt);
                v.mode = D.t > 0.6 && D.t < 2.2 ? 'bow' : 'idle';
                return true;
            case 'marks':
                if (this._go(v, me, WALK, dt, 0.3)) { v.mode = 'guard'; this._face(v, other, dt); v.aimPitch = 0; }
                return true;
            case 'call': {
                if (!this._go(v, me, WALK, dt, 0.3)) return true;
                const p = L._playerPos(D.p);
                if (p) this._face(v, p, dt);
                v.mode = (D.t % 7) < 1.6 ? 'flourish' : 'guard';
                return true;
            }
            case 'count': {
                v.speed = 0;
                const o = this._oppPoint(D, v);
                if (o) this._face(v, o, dt);
                v.mode = 'guard'; v.aimPitch = 0;
                L._ground(v);
                return true;
            }
            case 'fight': return this._fight(A, D, v, dt);
            case 'over':
                v.speed = 0;
                v.mode = v.arena.win ? 'triumph' : v.arena.sad ? 'sad' : 'idle';
                L._ground(v);
                return true;
            default: return true;
        }
    }

    /**
     * A duellist's step in the fight (the author: «не разворачивается и уходит — смотрит на того, с кем борется, ходит влево-вправо, настороженно»):
     * towards (tx, tz) but face to the foe all the time — a side-step, a step back, a step in — never the back turned. Slower than a walk, on the
     * floor, where a man can stand. true: he moved.
     */
    _strafe(A, v, fp, tx, tz, dt) {
        const L = this.life;
        this._face(v, fp, dt);
        const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
        const speed = WALK * 0.85 * (v.legK ?? 1);
        if (d < 0.15) { v.speed = 0; return false; }
        const s = Math.min(d, speed * dt);
        const nx = v.x + dx / d * s, nz = v.z + dz / d * s;
        if (L._walkable(nx, nz, v.y) && onArenaFloor(A.def, nx, nz, 1.2)) { v.x = nx; v.z = nz; v.speed = speed; return true; }
        v.speed = 0;
        return false;
    }

    _face(v, p, dt) { if (p) v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, p.x, p.z), FACE.WIZARD_TURN * dt); }

    /** The opponent of `v` in duel D: {v} a wizard, {p} a player's id. */
    _opp(D, v) { return D.a === v ? (D.b ? { v: D.b } : { p: D.p }) : { v: D.a }; }

    /** Where to aim at `v`'s opponent (as WizardFight aims: a body's middle). */
    _oppPoint(D, v) {
        const o = this._opp(D, v);
        if (o.v) { const c = this.game.duel?._creaturePoint?.(o.v, _a); return c ? { x: c.x, y: c.y - 0.3, z: c.z } : { x: o.v.x, y: o.v.y + 2.4, z: o.v.z }; }
        return this.life._playerPos(o.p);
    }

    /** Can't answer now: stunned, frozen, lifted, thrown, down. */
    _helpless(o) {
        return !!(o.stunT > 0 || o.vy || o.lev || o.frozen || this.game.creatureImpact?.isDown?.(o));
    }

    /**
     * (host) A duellist in the fight: the timers of his magic, the clash, saying a spell, the answers to
     * the other's charges, the steps round him on the floor, the casting, the finish — and the efforts.
     */
    _fight(A, D, v, dt) {
        const L = this.life, g = this.game, F = L.wizards.fight, W = v.W;
        v.arenaFight = true;
        // (his magic's timers — WizardLife.think is not reached while the arena leads him)
        v.mana = Math.min(v.maxMana, v.mana + W.regen * dt);
        v.castCd = (v.castCd ?? 0) - dt; v.castT = (v.castT || 0) - dt; v.shieldT = (v.shieldT || 0) - dt;
        if (v.shieldT <= 0) v.fx &= ~FX.SHIELD;
        if (v.fx & FX.SHIELD) { v.mana -= PVP.SHIELD_DRAIN * dt; if (v.mana <= 0) { v.mana = 0; v.fx &= ~FX.SHIELD; } }
        const fp = this._oppPoint(D, v);
        if (!fp) { v.mode = 'idle'; L._ground(v); return true; }
        const opp = this._opp(D, v);
        // a step aside from a charge
        if (v.dodge) {
            v.dodge.t -= dt;
            const nx = v.x + v.dodge.x * RUN * 1.2 * dt, nz = v.z + v.dodge.z * RUN * 1.2 * dt;
            if (L._walkable(nx, nz, v.y) && onArenaFloor(A.def, nx, nz, 1)) { v.x = nx; v.z = nz; }
            v.mode = 'dodge'; v.speed = 0;
            if (v.dodge.t <= 0) v.dodge = null;
            L._ground(v);
            return true;
        }
        // the wand knocked out: a race for it — he runs for it (the other must call it first: «Акцио»)
        if (v.noWand) {
            const it = v.lostWand && g.items?.loose?.get(v.lostWand.uid);
            // (a moment of shock first, «Моя палочка!»: the other has time to call it with «Акцио» before he runs to it — the voice needs ~1–2 s)
            if (it && v.lostWand && (v.lostWand.t = (v.lostWand.t || 0) + dt) < SHOCK_AFTER_DISARM) { v.speed = 0; v.mode = 'stagger'; L._ground(v); return true; }
            if (it && !(D.pull && D.pull.uid === v.lostWand.uid)) {
                const p = it.model.position;
                if ((this._go(v, p, RUN, dt, 0.8) || Math.hypot(p.x - v.x, p.z - v.z) < 1.1) && Math.abs(p.y - v.y) < 3) {
                    g.items.pickUp(v.lostWand.uid, '#' + v.id, 'right');
                    v.noWand = false; v.lostWand = null;
                    v.model?.setHeldTool?.('wand');
                    L._say(v, 'Ещё не всё!', 2);
                    this._fans(A, 'save');
                }
            } else { v.speed = 0; v.mode = 'stagger'; L._ground(v); }
            return true;
        }
        this._react(A, D, v, opp, fp);
        // saying a spell: he stands in one of his casting efforts, the wand on the opponent
        if (F._prepTick(v, dt)) { v.mode = v.arenaCast || 'lunge'; L._ground(v); return true; }
        // the beams met: push (winning) / strain against it (losing)
        if (F._inClash(v, dt)) {
            const c = g.duel?.clashes?.find((x) => x.a.by === v.id || x.b.by === v.id);
            const share = !c ? 0.5 : c.a.by === v.id ? c.p : 1 - c.p;
            v.mode = share >= 0.45 ? 'push' : 'strain';
            this._face(v, fp, dt);
            if (!D.clashSaid) { D.clashSaid = true; this._fx(A, 'cheer', A.def.centre, 0.7); this._fans(A, 'clash'); }
            L._ground(v);
            return true;
        }
        D.clashSaid = false;
        // the finish: the other can't answer → «Экспеллиармус»; his wand out → «Акцио»
        const ov = opp.v;
        // «Акцио»: said like any spell (a moment, facing it) — only then the wand flies to him
        const loose = !D.pull && (ov ? (ov.noWand && ov.lostWand && g.items?.loose?.get(ov.lostWand.uid) ? ov.lostWand.uid : null) : this._looseWandNear(fp, 9));
        if (loose) {
            const wp = g.items.loose.get(loose).model.position;
            v.speed = 0; this._face(v, wp, dt);
            v.arena.accioT = (v.arena.accioT || 0) + dt;
            v.mode = 'overhead'; v.aimPitch = Math.atan2(wp.y - (v.y + 3.4), Math.hypot(wp.x - v.x, wp.z - v.z) || 1);
            if (v.arena.accioT > 0.8 && (v.castCd ?? 0) <= 0.5 && facesTarget(v.yaw, v.x, v.z, wp.x, wp.z, FACE.SPELL)) { v.arena.accioT = 0; this._accio(A, D, v, loose, ov ? null : D.p); }
            L._ground(v);
            return true;
        }
        v.arena.accioT = 0;
        // (a fresh one knocked down is let up — a round to the other, a bow to the stands; worn out — he is disarmed)
        const finish = ov ? this._helpless(ov) && !ov.noWand && (arenaFresh(ov.mana, ov.maxMana, D.go) < ARENA_DUEL.FINISH_FRESH || (ov.arena?.falls || 0) >= 4)
            // (the player stunned / frozen / down: the aim of the duel is his wand — «Экспеллиармус» at once, then «Акцио»; the author: «Остолбеней, потом Экспеллиармус»)
            : (D.p != null && (L._pupilDown(D.p) || (D.p === g.localId && !!g.combat?.frozen)));
        if (ov && this._helpless(ov) && !finish) { v.speed = 0; v.mode = 'flourish'; this._face(v, fp, dt); L._ground(v); return true; }
        // where to stand: in the band from him, a slow circling step round him, always on the floor
        const d = Math.hypot(fp.x - v.x, fp.z - v.z);
        const ready = (v.castCd ?? 0) <= 0 && v.castT <= 0.15 && !v.prep;
        let moving = false;
        const stance = arenaStance({ mana: v.mana, maxMana: v.maxMana, foeMana: ov?.mana ?? 30, foeMaxMana: ov?.maxMana ?? 30, t: D.go });
        if (!ready || d > (ready ? Math.max(stance.max, 29) : stance.max) || d < stance.min) { // (ready and in the beam's reach: he stops and casts — he does not walk on)
            v.arena.turnT = (v.arena.turnT || 0) - dt;
            if (v.arena.turnT <= 0) { v.arena.turnT = 2.5 + Math.random() * 3.5; v.arena.dir = Math.random() < 0.5 ? -1 : 1; }
            const ux = (v.x - fp.x) / (d || 1), uz = (v.z - fp.z) / (d || 1);
            const want = d > stance.max ? -1 : d < stance.min ? 1 : 0; // (closer / farther)
            let tx = v.x + (-uz * v.arena.dir + ux * want) * 2.5, tz = v.z + (ux * v.arena.dir + uz * want) * 2.5;
            if (!onArenaFloor(A.def, tx, tz, 2)) { tx = v.x + (A.def.centre.x - v.x) * 0.3; tz = v.z + (A.def.centre.z - v.z) * 0.3; v.arena.dir = -v.arena.dir; }
            moving = this._strafe(A, v, fp, tx, tz, dt); // (a duellist never turns his back or walks off: he side-steps, face to the foe, wary)
        }
        if (!moving) { v.speed = 0; this._face(v, fp, dt); }
        // cast: facing him, the shot clear
        if (ready && !moving && facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.SPELL) && F.clearShot(v, fp)) {
            const spell = arenaSpell({ role: v.skillRole || v.role, foeHp: ov ? ov.hp : 20, finish, player: !ov, last: v.arena.last });
            v.arena.last = spell;
            const cost = arenaCost(spell);
            if (v.mana >= cost) {
                v.arenaCast = pick(CAST_EFFORTS);
                F._begin(v, spell, ov ? null : D.p, fp, { at: ov ? { k: 'v', id: ov.id } : null, cost, cd: (finish ? 1.2 : W.cast * 1.35) * (0.85 + Math.random() * 0.5) });
            }
        }
        // between: his efforts (shield up, breathless, reeling from a blow, a flourish at the other)
        const hurt = Date.now() - (v.hurtAt || 0) < 900;
        v.mode = (v.fx & FX.SHIELD) ? 'guard' : hurt ? 'stagger' : moving ? 'guard' : v.mana < v.maxMana * 0.18 ? 'winded' : 'guard'; // (moving: still the guard — the wand on the foe, the legs side-stepping)
        if (v.mode === 'guard' || v.mode === 'flourish') v.aimPitch = Math.atan2(fp.y + 0.3 - (v.y + 3.4), d || 1);
        L._ground(v);
        return true;
    }

    /** (host) A charge of his opponent flies at him: a spell back (the beams meet), the shield, a step aside — or not. */
    _react(A, D, v, opp, fp) {
        const g = this.game, duel = g.duel, F = this.life.wizards.fight;
        if (!duel?.bolts) return;
        const oppId = opp.v ? opp.v.id : opp.p;
        for (const b of duel.bolts.values()) {
            if (b.state !== 'flying' || b.by !== oppId) continue;
            const dx = v.x - b.front.x, dz = v.z - b.front.z, dist = Math.hypot(dx, dz);
            if (dist > 26) continue;
            if (!((b.tk === 'v' && b.tid === v.id) || b.dir.x * dx + b.dir.z * dz > dist * 0.94)) continue;
            const seen = b.seenBy || (b.seenBy = new Set());
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            const eta = dist / (DUEL_SPELLS[b.spell]?.speed || 15);
            const r = arenaDefence({ skill: v.W.skill, mana: v.mana, maxMana: v.maxMana, t: D.go, eta, canCounter: !v.prep && (v.castCd ?? 0) < 0.6 && eta > CAST_PREP.T + 0.3 && facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.SPELL) });
            let met = false;
            if (r === 'counter') {
                const spell = arenaSpell({ role: v.skillRole || v.role, foeHp: opp.v ? opp.v.hp : 20, player: !opp.v });
                v.arenaCast = pick(CAST_EFFORTS);
                met = F._begin(v, spell, opp.v ? null : opp.p, fp, { vs: b.id, at: opp.v ? { k: 'v', id: opp.v.id } : null, cost: arenaCost(spell), cd: v.W.cast * 0.6 });
            }
            if ((r === 'shield' || (r === 'counter' && !met)) && v.mana >= 4) { // (no time for the spell back: the hand shield)
                if (!(v.fx & FX.SHIELD)) v.mana -= arenaCost('Protection');
                v.shieldT = Math.max(v.shieldT || 0, 1.4); v.fx |= FX.SHIELD;
                v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, b.o.x, b.o.z), 0.5);
                if (Math.random() < 0.5) this._fans(A, 'save');
            } else if (r === 'dodge') {
                const s = Math.random() < 0.5 ? -1 : 1, l = Math.hypot(b.dir.x, b.dir.z) || 1;
                v.dodge = { x: -b.dir.z / l * s, z: b.dir.x / l * s, t: 0.45 };
                v.prep = null;
            }
        }
    }

    /** A wand lying near the player (knocked out of his hand), not the wizard's own → its uid. */
    _looseWandNear(p, r) {
        const items = this.game.items;
        if (!items?.loose) return null;
        for (const [uid, L] of items.loose) {
            if (L.item?.kind !== 'wand' || L.hover) continue;
            const q = L.model.position;
            if (Math.abs(q.x - p.x) < r && Math.abs(q.z - p.z) < r && Math.hypot(q.x - p.x, q.z - p.z) < r) return uid;
        }
        return null;
    }

    /** «Акцио!»: the wand flies to his free hand. */
    _accio(A, D, v, uid, player) {
        this.life._say(v, 'Акцио!', 2);
        D.pull = { uid, to: v, t: 0, player };
        v.mode = 'lunge'; v.castT = 0.6; v.model.castNow = true;
        this.game.duel?._burst?.(v.model.getWandTip ? v.model.getWandTip(_h) : _h.set(v.x, v.y + 3.4, v.z), 0xffd36e, 10);
        this.log.push('accio:' + v.id);
    }

    /** (host) The called wand on its way: flying to the hand; there — his (the loser has none now). */
    _pullStep(A, D, dt) {
        const P = D.pull;
        if (!P) return;
        const items = this.game.items, L = items?.loose?.get(P.uid), v = P.to;
        P.t += dt;
        if (!L || v.dead || P.t > 6) { D.pull = null; return; } // (somebody caught it first — or it was stuck)
        const p = L.model.position;
        _b.set(v.x, v.y + 3.0, v.z);
        const d = _b.distanceTo(p);
        if (d < 1.3) {
            const item = { ...L.item };
            items.pickUp(P.uid, '#' + v.id, 'left');
            D.trophy = { by: v, item, player: P.player };
            D.pull = null;
            return;
        }
        L.hover = null; L.rest = false; L.sentRest = false;
        L.vel.copy(_b.sub(p).normalize().multiplyScalar(Math.min(14, 4 + d * 1.5)));
        L.vel.y += 14 * dt; // (against the fall: Items._physics pulls it down)
    }

    // ------------------------------------------------------------------ the rules (CastleLife hooks)
    /**
     * (host, CastleLife.hit — before the blow lands) Two wizards of the arena: the blow never kills (a friendly
     * duel — ArenaRules.softBlow). A player's blow stays as it is (a kill is his foul).
     */
    soften(v, by, dmg) {
        if (!v?.arena || v.arena.kind !== 'duel' || by == null || !(dmg > 0)) return dmg;
        const D = this.list.get(v.arena.id)?.duel;
        if (!D?.b || (D.a.id !== by && D.b.id !== by)) return dmg;
        return softBlow(dmg, v.hp, v.armor);
    }

    /**
     * (host, CastleLife.hit) A blow on `v` by `by`: true — the arena's (a legal duel: nobody minds it; or a
     * foul / an accident — handled here). false — not the arena's business.
     */
    onHit(v, by, killed, opts = {}) {
        if (v?.arena && by != null && this.mode?.arenaId === v.arena.id && by === this.mode.id && v.arena.kind !== 'duel') return true; // (the duel mode: a spectator or a wizard on his way out struck by a stray charge — nobody avenges)
        if (!v?.arena || v.arena.kind !== 'duel' || by == null) return false;
        const A = this.list.get(v.arena.id), D = A?.duel;
        if (!D || (D.phase !== 'fight' && D.phase !== 'count')) return false;
        const oppId = D.a === v ? (D.b ? D.b.id : D.p) : D.a.id;
        if (by !== oppId) return false;
        if (this.mode?.arenaId === A.id) { // (the duel mode: the deadly ones are allowed — a kill is a win, nobody avenges)
            if (killed) this._end(A, D, D.a === v ? 'p' : 'a', 'kill');
            else if (Math.random() < 0.6) { this._fx(A, 'cheer', A.def.centre, 0.6); this._fans(A, 'hit'); }
            return true;
        }
        const banned = !!opts.pierce || isBanned(opts.kind);
        if (killed || banned) {
            const verdict = banned && !killed ? 'foul' : killVerdict({ byOpponent: true, via: opts.via, kind: opts.kind });
            if (verdict === 'accident') {
                this._fans(A, 'fall');
                this._fx(A, 'groan', A.def.centre);
                this._end(A, D, D.a === v ? (D.b ? 'b' : 'p') : 'a', 'accident');
            } else this._foul(A, D, by);
            return true;
        }
        if (Math.random() < 0.6) { this._fx(A, 'cheer', A.def.centre, 0.6); this._fans(A, 'hit'); }
        return true;
    }

    /**
     * (host) The rules broken (a kill, a deadly spell): the duel is off, no reward, and a part of the wizards
     * round the arena (never all — ArenaRules.avengers) attack the one who did it; the others run.
     */
    _foul(A, D, by) {
        const L = this.life;
        this._end(A, D, null, 'foul');
        A.owed = null;
        if (!L._isPlayer(by)) return; // (a wizard's accident between two wizards: a grief, not a crime anyone answers)
        const cs = this._tower(A);
        const cand = [];
        for (const w of cs?.active.values() || []) {
            if (w.dead || w.foe || !L._fights(w) || Math.hypot(w.x - A.def.x, w.z - A.def.z) > ARENA_DUEL.AVENGE_R) continue;
            cand.push(w);
        }
        const chosen = new Set(avengers(cand));
        const now = Date.now();
        cs?.hostile.set(by, now + 120000);
        for (const w of cand) {
            if (w.arena) { this._freeSeat(A, w); A.fans.delete(w); w.arena = null; w.seated = false; }
            if (chosen.has(w)) { w.foe = by; w.grudge = { id: by, until: now + 120000 }; w.path = null; L._say(w, pick(['Нарушение! Убийца!', 'Ты убил его — ответишь!', 'Это против правил!']), 3); }
            else { w.fleeFrom = by; w.fleeT = 10; w.fleeing = false; }
        }
        L.deed?.(by, 'kill');
        this._tell(by, { e: 'foul', id: A.id });
        this.log.push('foul:' + by + ':' + chosen.size + '/' + cand.length);
    }

    /** (host, CastleLife.startle) A player's charge / blow at the arena during his duel: the wizards there don't mind it. */
    calm(v, by) {
        if (!v?.arena) return false;
        const A = this.list.get(v.arena.id);
        if (A && this.mode?.arenaId === A.id && by === this.mode.id) return true; // (the duel mode: the crowd only cheers — no fear, no anger, whatever the hero casts)
        return !!A?.duel && A.duel.p === by && A.duel.phase !== 'over';
    }

    /** (Duel) May these two wizards' charges meet? Only the two duellists of an arena duel. */
    pair(aBy, bBy) {
        for (const A of this.list.values()) {
            const D = A.duel;
            if (D?.b && ((D.a.id === aBy && D.b.id === bBy) || (D.a.id === bBy && D.b.id === aBy))) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ the crowd
    /** (host) Some of the fans cheer (`what`: a line kind); a few say it. */
    _fans(A, what) {
        const L = this.life;
        let said = A.sayT > 0;
        for (const v of A.fans) {
            if (!v.seated || Math.random() < 0.35) continue;
            v.cheerT = 1.2 + Math.random() * 1.8;
            if (!said && FAN_LINES[what]) { said = true; A.sayT = 3; L._say(v, pick(FAN_LINES[what]), 2); }
        }
    }

    // ------------------------------------------------------------------ the player: the sign-up, the count
    /** (every computer) This computer's player puts a hand on the book of duels: signed up. */
    _signUp(A, dt) {
        const g = this.game, ch = g.character;
        if (!A.def.desk) return; // (a training field: nobody signs up there)
        A.touchT = (A.touchT || 0) - dt;
        if (A.touchT > 0 || !ch?.getHandWorldPosition) return;
        const b = A.def.desk.book;
        for (const side of ['right', 'left']) {
            const h = ch.getHandWorldPosition(side, _h);
            if (!h || Math.abs(h.x - b.x) > 0.8 || Math.abs(h.z - b.z) > 0.8 || Math.abs(h.y - b.y) > 0.8) continue;
            A.touchT = 3;
            if (g.isNight) { g.hud?.setVoice?.('🌙 Ночью дуэлей нет — приходите днём', true); return; }
            if (!g.items?.wand) { g.hud?.setVoice?.('🪄 Для дуэли возьмите палочку в руку', true); return; }
            if (this.auth) this._join(A, g.localId);
            else g.sync?.arena?.({ e: 'join', id: A.id });
            return;
        }
    }

    /** (host) A player signs up. */
    _join(A, id) {
        if (A.duel?.p === id || A.queue.sign(id) < 0) return;
        this._tell(id, { e: 'queued', id: A.id, n: A.queue.ahead(id, !!A.duel) });
        this.log.push('join:' + id);
    }

    /** (host) A message to one player (mine — at once). */
    _tell(id, m) {
        const g = this.game;
        if (id === g.localId) this._mine(m);
        else g.sync?.arena?.({ ...m, to: id });
    }

    /** This computer's player hears from the arena. */
    _mine(m) {
        const g = this.game, hud = g.hud;
        switch (m.e) {
            case 'ask': this.askedAt = performance.now(); break;
            case 'queued': this.myQueue = m.id; hud?.setVoice?.(m.n > 0 ? `📜 Вы записались на дуэль. Перед вами: ${m.n}` : '📜 Вы записались на дуэль — вы следующий', true); g.sound?.playArena?.(g.character.group.position, 'beep', 0.6, 0.8); break;
            case 'call': this.myQueue = m.id; hud?.setVoice?.(`⚔️ Ваш черёд! Выходите на арену и встаньте на светящееся место. Соперник: ${m.name || 'волшебник'}`, true); break;
            case 'off': this.myQueue = null; this.count = null; hud?.setVoice?.(m.why === 'left' ? '🚪 Вы ушли от распорядителя — запись снята' : m.why === 'moved' ? '🚪 Вы сошли с места — запись снята' : '📜 Запись снята', true); break;
            case 'count': this.count = { t: 0 }; break;
            case 'end':
                this.count = null; this.myQueue = null;
                if (this.mode) { if (m.r === 'win') this._modeWin(); else if (m.r === 'lose') this._modeWin(true); return; } // (the duel mode has its own end: no lectern, no coins)
                hud?.setVoice?.(m.r === 'win' ? `🏆 Победа! Подойдите к распорядителю — он отдаст ${ARENA_DUEL.REWARD} монет` : m.r === 'lose' ? '😔 Поражение. Вашу палочку вернули — она на столе записи' : m.r === 'draw' ? '⏳ Пять минут прошло — ничья' : m.r === 'off' ? '🚪 Вы ушли с арены — дуэль проиграна' : '⚔️ Дуэль окончена', true);
                break;
            case 'paid': hud?.setVoice?.(`💰 Ваша награда — ${ARENA_DUEL.REWARD} монет`, true); break;
            case 'missed': this.myQueue = null; hud?.setVoice?.('⌛ Вы не вышли на арену — очередь прошла', true); break;
            case 'foul': hud?.setVoice?.('☠️ Вы убили соперника — это против правил арены!', true); break;
            default: break;
        }
    }

    /** The big «3 — 2 — 1 — Бой!» for this computer's player in a duel. */
    _countdown(dt) {
        const C = this.count;
        if (!C) return;
        C.t += dt;
        const n = ARENA_DUEL.COUNT - Math.floor(C.t);
        const text = n > 0 ? String(n) : 'Бой!';
        if (text !== C.shown) { C.shown = text; this.game.hud?.bigCount?.(text); }
        if (C.t > ARENA_DUEL.COUNT + 1) this.count = null;
    }

    // ------------------------------------------------------------------ sounds and the network
    /** A sound of the arena, here and on every computer. */
    _fx(A, kind, at, vol = 1) {
        const g = this.game;
        if (A.def.practice && kind !== 'groan') return; // (a training on a field: no gong, no crowd)
        g.sound?.playArena?.(at, kind, vol);
        if (this.auth) g.sync?.arena?.({ e: 'fx', id: A.id, k: kind, v: vol });
    }

    /** (host) The arena's state to everybody (the phase: guests show the count to their player). */
    _send(A) {
        const g = this.game, D = A.duel;
        if (D?.p != null && D.phase === 'count') this._tell(D.p, { e: 'count', id: A.id });
        if (g.sync) g.sync.arena?.({ e: 'st', id: A.id, ph: D ? D.phase : 'idle', pl: D?.p ?? null });
    }

    /** A message about the arenas (m.from: who sent it). */
    onNet(m, from) {
        const g = this.game;
        if (!m || typeof m !== 'object') return;
        if (m.e === 'join') { if (this.auth) { const A = this.list.get(m.id); if (A) this._join(A, from); } return; }
        if (m.e === 'cancel') { if (this.auth) { const A = this.list.get(m.id); if (A) this._cancel(A, from); } return; }
        if (m.e === 'tg') { const A = this.list.get(m.id); if (A && !this.auth) A.tg = Array.isArray(m.t) ? m.t.slice(0, 2) : []; return; }
        if (m.e === 'st') { const A = this.list.get(m.id); if (A) { A.ph = m.ph || 'idle'; A.pl = m.pl ?? null; } return; }
        if (m.to != null) { if (m.to === g.localId) this._mine(m); return; }
        if (m.e === 'fx') { const A = this.list.get(m.id); if (A) g.sound?.playArena?.(A.def.centre, m.k, m.v ?? 1); }
    }

    // ------------------------------------------------------------------ the duel journal
    /** One line into the journal (Settings → Журнал → «Заклинания») and the console. */
    _dl(line) {
        try { this.game.spellLog?.note?.(line); console.info('[Дуэль]', line); } catch (_) { /* (the journal never breaks a duel) */ }
    }

    /** (host) A duel with the hero begins: who is against him, the numbers of both sides. */
    _logStart(A, a) {
        const g = this.game, du = g.duel, me = g.localId, c = g.combat;
        const wand = (it) => it ? { power: it.power || 0, fav: it.fav || null, dir: it.dir || null } : null;
        const foe = {
            name: a.name, rank: a.entry?.rank || a.role, mana: a.mana, maxMana: a.maxMana, hp: a.hp, maxHp: a.maxHp, skill: a.W?.skill,
            power: du?._strength?.(a.id, 0, me), wandK: du?._wandK?.(a.id, 'Stupefy'), wand: wand(wizardWandOf(a)),
        };
        const hero = {
            mana: c?.fatigue, maxMana: c?.maxFatigue, hp: c?.hp, maxHp: c?.maxHp, mastery: g.mana?.mastery ?? 0, finite: creativeFiniteMana(g),
            power: du?._strength?.(me, 0, a.id), wandK: du?._wandK?.(me, 'Stupefy'), wand: wand(g.items?.wand), creative: g.config?.mode === 'creative',
        };
        this._cur = { at: performance.now(), foe, hero, foeId: a.id, casts: { me: {}, foe: {} }, clashes: [], arena: A.id };
        this._dl(duelReport.start(this._cur));
    }

    /** (Duel._addBolt) A charge was cast: by the hero or by the arena's wizard. */
    logCast(b) {
        const C = this._cur;
        if (!C || !b?.spell) return;
        const mine = b.by === this.game.localId;
        if (!mine && b.by !== C.foeId) return;
        const t = (mine ? C.casts.me : C.casts.foe);
        t[b.spell] = (t[b.spell] || 0) + 1;
    }

    /** (Duel._updateClash) A beam clash of the hero ended: what each side pushed with, who gave in. */
    logClash(c, loser, dissolve) {
        const C = this._cur, me = this.game.localId;
        if (!C || !c || (c.a.by !== me && c.b.by !== me)) return;
        const mineA = c.a.by === me, S = c.stat || { n: 0, sa: 0, sb: 0, ca: 0, cb: 0 };
        const k = S.n || 1, mine = mineA ? c.a : c.b, theirs = mineA ? c.b : c.a;
        const row = {
            mySpell: mine.spell, foeSpell: theirs.spell, secs: c.t,
            myPush: (mineA ? S.sa : S.sb) / k, foePush: (mineA ? S.sb : S.sa) / k,
            myContact: (mineA ? S.ca : S.cb) / k, foeContact: (mineA ? S.cb : S.ca) / k,
            myShouts: (mineA ? c.boostA : c.boostB) || 0, foeShouts: (mineA ? c.boostB : c.boostA) || 0,
            share: mineA ? c.p : 1 - c.p, lost: dissolve ? 'none' : loser === me ? 'me' : 'foe',
        };
        C.clashes.push(row);
        this._dl(duelReport.clash(row));
    }

    /** (host) The duel ended: the summary — who won, why, what each cast. */
    _logEnd(A, D, who, why) {
        const C = this._cur;
        if (!C || D?.p == null) return;
        this._dl(duelReport.end({ who, why, secs: (performance.now() - C.at) / 1000, casts: C.casts, clashes: C.clashes, foe: C.foe, hero: C.hero }));
        this._cur = null;
    }

    // ------------------------------------------------------------------ the duel mode
    /**
     * «Перед дуэлью» (старт в Творческом, HeroApply): режим «только дуэли». Трибуны уже полны болельщиков, герой на своём месте,
     * напротив ждёт соперник выбранного уровня (`foe`: DUEL_FOES), отсчёт 10…1 — бой. Бой кончился (победа, поражение, время) или герой
     * погиб (`duelDeath`) — сразу новая дуэль с новым волшебником того же уровня, и так по кругу. Хост ведёт всё; остановка — `stopDuelMode`.
     */
    startDuelMode(arenaId, foe = 'mid') {
        this.mode = { arenaId, foe, id: this.game.localId, hinted: false };
        if (this.game.world) this.game.world.duelFar = MODE_VIEW; // (only the arena is drawn and made: the workers have nothing else to do — FPS)
    }

    _unpause() { if (this.mode?.paused) { this.game.paused = false; this.mode.paused = false; } }

    stopDuelMode() { this._unpause(); this.mode = null; this.endUi.hide(); if (this.game.world) this.game.world.duelFar = 0; }

    /** The rank of the one the roster's number `idx` is (the tower's ranks — WizardAI), without waking him. */
    _rankOf(cs, idx) { try { return this.life._roster(cs.def, idx)?.rank || null; } catch (e) { return null; } }

    /** (host) A wizard of the wanted rank: from the roster; the Master (number 0) only when he is asked for and free; else the nearest rank. */
    _foe(A, cs, ranks) {
        const L = this.life, st = L.state(cs.def.id);
        const free = (i) => !cs.active.has(i) && !st.killed.has(i);
        let v = this._recruit(A, cs, 'duel', (i) => free(i) && ranks.includes(this._rankOf(cs, i)));
        if (!v && ranks.includes('master')) { // (the Master is in his study: he comes out for the duel)
            const m = L.byId.get(cs.def.id + ':0');
            if (m && !m.dead && !m.foe) { m.arena = { id: A.id, kind: 'duel', leg: 0 }; m.job = 'arena'; v = m; }
        }
        return v || this._recruit(A, cs, 'duel', free); // (no one of that rank: the nearest — anyone free)
    }

    /** (host) Every step of the mode: the fans in their seats at once, then the next duel with the count. */
    _modeStep(dt) {
        const m = this.mode, g = this.game, A = this.list.get(m.arenaId), L = this.life;
        if (!A || !L?.enabled || !g.character) return;
        const cs = this._tower(A);
        if (!cs) return;
        const D = A.duel;
        // the stands: all the fans are in their seats, none walks in (the show is ready before the count)
        if (!A.want) A.want = Math.round((ARENA_DUEL.FANS[0] + ARENA_DUEL.FANS[1]) / 4); // (half of the usual crowd: lighter for the frame — the author)
        if (A.fans.size < A.want && !(D && D.phase === 'fight')) this._recruit(A, cs, 'fan');
        for (const v of A.fans) {
            if (v.seated || !v.arena) continue;
            const s = v.arena.seat || this._seat(A, v);
            if (!s) continue;
            v.arena.seat = s; v.arena.leg = 2; v.seated = true; v.x = s.x; v.y = s.y; v.z = s.z; v.speed = 0;
        }
        if (m.freezeUntil && performance.now() < m.freezeUntil && m.pin) { // (the first seconds of a duel: the hero cannot step off his place)
            const p = g.character.group.position;
            p.x = m.pin.x; p.z = m.pin.z; g.knockback?.set?.(0, 0, 0);
        }
        this._rememberWand();
        this._keepOnFloor(A, D);
        if (m.winT != null) { m.winT += dt; if (m.winT >= (m.askAfter ?? AGAIN_AFTER)) { m.winT = null; this._askAgain(); } }
        if (m.hold && m.holdPin) { const p = g.character.group.position; p.x = m.holdPin.x; p.z = m.holdPin.z; g.knockback?.set?.(0, 0, 0); }
        if (D || m.hold) return;
        if (A.fans.size < Math.min(A.want, 4)) return; // (the stands must be filling up first)
        // the next duel: the opponent on his place, the player on his, the count 10…1
        const marks = A.def.gates;
        const a = this._foe(A, cs, foeRanks(m.foe));
        if (!a) { A.restT = 3; return; }
        const o = marks[1].mark;
        a.arena.side = 1; a.arena.leg = 2; a.x = o.x; a.z = o.z; a.y = o.y; a.speed = 0; a.yaw = yawTo(o.x, o.z, marks[0].mark.x, marks[0].mark.z);
        A.owed = null; // (no coins at the lectern here: the duel is the whole game)
        a.castCd = 0.3; a.castT = 0; a.prep = null; a.dodge = null; // (ready: his first spell goes the moment the fight begins)
        a.noWand = false; a.hp = a.maxHp; a.mana = a.maxMana ?? a.mana; L._ground?.(a);
        m.freezeUntil = performance.now() + 5000; m.pin = { x: A.def.gates[0].mark.x, z: A.def.gates[0].mark.z };
        this._resetHero(); // (the settings of the world again: the mana, the cells, the health)
        this._wandBack(); // (a wand lost in the last duel is given back: the hero never starts without one)
        this._toMark(A);
        A.duel = { a, b: null, p: m.id, phase: 'count', t: 0, go: 0, offT: 0, pull: null, trophy: null, said: 0, atMark: true };
        this.log.push('mode:' + a.id + ':' + (a.entry?.rank || '?'));
        this._logStart(A, a);
        this._fx(A, 'beep', A.def.centre);
        this._send(A);
        if (!g.items?.wand) g.hud?.setVoice?.('🪄 Возьмите палочку в руку — через 10 секунд бой!', true);
        else g.hud?.setVoice?.(`⚔️ Через 10 секунд бой! Соперник: ${a.name || 'волшебник'}. За вас болеют трибуны`, true);
    }

    /**
     * The hero's wand for the next duel: remembered while he has it; knocked out and taken («Экспеллиармус» + «Акцио») — it is gone from the
     * floor and the lectern and given into his hand again, so a lost duel never leaves him with an empty hand.
     */
    _wandBack() {
        const g = this.game, it = g.items, m = this.mode, inv = g.inventory;
        if (!it || !m) return;
        this._rememberWand();
        if (!m.wand) { // (he never held one here: a plain wand into his hand — the hero is never without one at a duel)
            if (!it.wand && !(inv?.slots || []).some((s) => s?.kind === 'wand')) m.wand = { ...starterWand(), spare: true };
            else return;
        }
        if (inv?.hasUid?.(m.wand.uid)) return; // (it is still his: in a hand / a slot)
        const w = { ...m.wand };
        try {
            if (it.loose?.has?.(w.uid)) it.removeLoose?.(w.uid); // (the same wand lying on the floor / the lectern: no second one)
            const p = g.character.group.position;
            it.spawnLoose(w, new THREE.Vector3(p.x, p.y + 1.5, p.z), { hover: true });
            it.pickUp(w.uid, g.localId, 'right'); // (Inventory.gotWand: the plain stand-in given meanwhile goes)
        } catch (e) { /* (an item system without the hand: the wand lies near him) */ }
    }

    /** The hero's own wand (not the plain stand-in), remembered whenever he holds it — it is what is given back after a loss. */
    _rememberWand() {
        const w = this.game.items?.wand, m = this.mode;
        if (!w || !m) return;
        if (!w.spare || !m.wand || m.wand.spare) m.wand = { ...w }; // (the own one wins over a plain stand-in; a stand-in is remembered when it is all he has)
    }

    /** The hero on his own place (the lit mark), facing the opponent's; health and mana full: a new duel is fresh. */
    _toMark(A) {
        const g = this.game, ch = g.character, data = g.world?.terrain?.data || g.terrain?.data, M = A.def.gates[0].mark, O = A.def.gates[1].mark;
        const y = data?.surfaceY ? data.surfaceY(M.x, M.z) : M.y;
        ch.group.position.set(M.x, y + PLAYER_GROUND_OFFSET + 0.1, M.z);
        g.faceYaw?.(Math.atan2(O.x - M.x, O.z - M.z) + Math.PI); // (the hero looks along −Z at 0: the bearing needs a half turn; kept for the camera too)
        ch.verticalVelocity = 0;
        g.knockback?.set?.(0, 0, 0);
        ch.airTop = null; ch.landing = null; g.knock?.reset?.(); // (no fall counted from before the move: the hero stands, he does not land hard)
        this._last = { x: M.x, z: M.z };
        const c = g.combat;
        if (c?.enabled) { c.hp = c.maxHp || c.hp; c.fatigue = c.maxFatigue || c.fatigue; g.playerHP = c.hp; }
    }

    /** The hero stays on the arena's floor (the barrier of the duel mode: no walking off into the stands and the world beyond). */
    _keepOnFloor(A, D) {
        const g = this.game, p = g.character.group.position;
        if (onArenaFloor(A.def, p.x, p.z, 0.4)) { (this._last || (this._last = {})).x = p.x; this._last.z = p.z; return; }
        const l = this._last;
        if (!l) return;
        // (back to the last good place, the speed gone: a wall, not a rubber band)
        p.x = l.x; p.z = l.z; g.character.verticalVelocity = Math.min(0, g.character.verticalVelocity);
        g.knockback?.set?.(0, 0, 0);
    }

    /** The settings chosen in the window between duels (the same as at the world's making): the opponent, the mana, the power, the health… */
    _applyHero(h) {
        const g = this.game, m = this.mode;
        if (!h || !m) return;
        g.hero = h;
        if (g.config) g.config.hero = h; // (kept with the world)
        m.foe = h.foe;
    }

    /**
     * Every duel starts from the settings the world was made with (the author: «мана и ячейки остаются с первого боя, а должны обнуляться»): what the
     * hero grew or won meanwhile (cells from the first spells and beaten wizards, the duel mastery) is taken back, the mana and the health are full.
     */
    _resetHero() { this.game.heroApply?.resetToSettings?.(); }

    /**
     * A fresh start of the duel mode (the window's «Начать дуэль заново»): the old wizard and the whole crowd go at once (a fallen one
     * is taken away), nobody keeps anger at the hero, and the stands fill anew — as on the first duel.
     */
    _resetArena() {
        const m = this.mode, A = m && this.list.get(m.arenaId), L = this.life;
        if (!A || !L) return;
        const cs = this._tower(A), D = A.duel;
        for (const v of [...A.fans]) this._release(v, true);
        A.fans.clear(); A.taken.clear(); A.want = 0;
        if (D) for (const v of [D.a, D.b]) if (v) this._release(v, true);
        A.duel = null;
        for (const w of [...(cs?.active.values() || [])]) {
            if (w.arena?.id === A.id || (w.dead && Math.hypot(w.x - A.def.x, w.z - A.def.z) < (A.def.outer || 40) + 10)) { w.arena = w.arena || { id: A.id }; this._release(w, true); continue; }
            if (w.foe === m.id) w.foe = null; // (whoever was angry at the hero is calm)
            if (w.grudge?.id === m.id) w.grudge = null;
            if (w.fleeFrom === m.id) { w.fleeFrom = null; w.fleeT = 0; }
        }
        if (cs) { cs.hostile.clear(); cs.wizAlarmUntil = 0; }
        this._send(A);
    }

    /** The hero won in the duel mode: the big «Вы победили!», in ten seconds the window «Хотите повторить дуэль?». */
    _modeWin(lost = false) {
        const m = this.mode;
        if (!m) return;
        const p = this.game.character.group.position;
        m.holdPin = { x: p.x, z: p.z }; // (the hero stays where he is while the result is shown and chosen from)
        m.hold = true; m.winT = 0; m.lost = lost; m.askAfter = lost ? AGAIN_AFTER_LOSS : AGAIN_AFTER;
        this.endUi.showWin(lost ? 'Попробуйте ещё раз — палочка вернётся к вам' : 'Трибуны ликуют', lost);
    }

    _askAgain() {
        const m = this.mode;
        if (!m) return;
        this.endUi.hideBox();
        if (!this.game.net?.active) { this.game.paused = true; m.paused = true; } // (the whole world stands still while the window is open)
        this.endUi.showAgain({
            lost: !!m.lost,
            hero: { ...(this.game.hero || {}), foe: m.foe },
            onStart: (hero) => { this._applyHero(hero); this.endUi.hide(); this._unpause(); this._resetArena(); m.hold = false; m.holdPin = null; },
            onExit: () => { this._unpause(); document.getElementById('pause-exit-btn')?.click(); }, // (the same way out as the pause menu: the world is saved)
        });
    }

    /** (CastleLife._die) Is this death the duel mode's own — a wizard of its arena struck down by the hero: nobody mourns, avenges or buries him. */
    quietKill(v, by) {
        const m = this.mode;
        return !!(m && v?.arena && v.arena.id === m.arenaId && by === m.id);
    }

    /**
     * The hero was about to die (Combat.die) while the duel mode runs on the floor: no death — a lost duel, at once the next one with a
     * new wizard of the same level (no death screen, no body, nothing dropped). true: handled.
     */
    duelDeath() {
        const m = this.mode;
        if (!m || !this.auth) return false;
        const A = this.list.get(m.arenaId);
        if (!A || Math.hypot(this.game.character.group.position.x - A.def.x, this.game.character.group.position.z - A.def.z) > (A.def.outer || 30) + 6) return false;
        this.game.combat.revive();
        const D = A.duel;
        if (D) {
            if (D.phase !== 'over') this._end(A, D, 'a', 'dead');
        }
        this._resetArena(); // (the old wizard and the crowd go at once, nobody keeps anger: the next duel starts clean)
        return true;
    }

    // ------------------------------------------------------------------ the lit places
    /** The arena where a player's duel is being made, and how bright its places are (every computer from the phase). */
    _litState() {
        const g = this.game, me = g.character.group.position;
        let best = null, bd = 120;
        for (const A of this.list.values()) {
            if (!A.def.desk) continue;
            const ph = this.auth ? (A.duel?.phase || 'idle') : A.ph, pl = this.auth ? (A.duel?.p ?? null) : A.pl;
            if (pl == null || ph === 'idle' || ph === 'over') continue;
            const d = Math.hypot(me.x - A.def.x, me.z - A.def.z);
            if (d >= bd) continue;
            const mine = pl === g.localId, fight = ph === 'fight';
            const k = fight ? 0.35 : 1;
            const p = duelSpots(A.def);
            const pm = Math.hypot(me.x - p.player.x, me.z - p.player.z);
            bd = d;
            best = {
                player: { x: p.player.x, y: A.def.floorY, z: p.player.z }, foe: { x: p.foe.x, y: A.def.floorY, z: p.foe.z },
                power: mine ? k : k * 0.55, foePower: (mine ? 0.8 : 0.5) * k, arrow: mine && !fight && pm > STEWARD.MARK_R,
            };
        }
        return best;
    }

    /**
     * (Creative only) The sign over each wizard fighting at the arena: his kind, mana now / cells, duel strength. The host reads
     * them (5 times a second) and tells the others when they change ('tg'); every computer draws what it has.
     */
    _tags(dt) {
        const g = this.game, on = tagShown(g.config?.mode);
        this._tagT -= dt;
        if (this._tagT > 0) return;
        this._tagT = 0.2;
        const L = this.life, list = [];
        for (const A of this.list.values()) {
            if (this.auth) {
                const D = A.duel;
                const t = on && D && D.phase !== 'over' ? [D.a, D.b].filter((v) => v && !v.dead).map(tagOf) : [];
                const key = t.map(tagKey).join(';') + t.map((x) => x.id).join(',');
                if (key !== A.tgKey) { A.tgKey = key; A.tg = t; g.sync?.arena?.({ e: 'tg', id: A.id, t }); }
            }
            if (!on) continue;
            for (const t of A.tg || []) {
                const v = L.byId.get(t.id);
                if (v && !v.dead) list.push({ tag: t, x: v.x, y: v.y, z: v.z });
            }
        }
        this.tagFx.show(on ? list.slice(0, 2) : []);
    }

    _lit(dt) { this.marks.update(dt, this._litState()); }

    /** The nearest arena with a dome within 90 m of the hero (for the look). */
    _dome(dt) {
        const p = this.game.character?.group?.position;
        let best = null, bd = 90;
        if (p) for (const A of this.list.values()) { if (A.def.practice) continue; const d = Math.hypot(p.x - A.def.x, p.z - A.def.z); if (d < bd) { bd = d; best = A.def; } }
        this.domeFx.update(dt, best);
    }

    /**
     * (Duel._step, every computer) A charge from→to crosses the skin of an arena's dome: where (it bursts there), or null. The stands behind it
     * are never touched; the flash is seen at once.
     */
    domeBlock(from, to) {
        for (const A of this.list.values()) {
            if (A.def.practice) continue;
            if (Math.hypot(from.x - A.def.x, from.z - A.def.z) > A.def.reach + 60 && Math.hypot(to.x - A.def.x, to.z - A.def.z) > A.def.reach + 60) continue;
            const D = A.dome || (A.dome = domeOf(A.def)), c = domeCross(D, from, to);
            if (c) { this.domeFx.hit(c.x, c.y, c.z); this.game.sound?.playArena?.({ x: c.x, y: c.y, z: c.z }, 'beep', 0.5, 0.6); return c; }
        }
        return null;
    }

    prewarm() { this.marks.prewarm(); this.domeFx.prewarm(); }

    dispose() { for (const A of this.list.values()) this._close(A); this.list.clear(); this.marks.dispose(); this.tagFx.dispose(); this.domeFx.dispose(); }
}
