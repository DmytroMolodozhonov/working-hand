/**
 * Threats.js — the game side of ThreatRank.js (the author 19.11: the people defend themselves SMARTLY — who is the danger, whom first, when to run).
 * It collects, for a person who fights, the attackers round him (players who are hostile to his place or struck him, the creatures of the other team in
 * «Битва существ»), his friends near, the blows he has taken; gives them to the pure rules; and applies what comes back: another foe (`v.foe`), a stance
 * (`v.stance`: 'fight' | 'guard' | 'breakout' | 'flee'), a run for it (`v.fleeT`/`fleeFrom` — the people's own flight: FleePlan, shelters — with `v.routedUntil`:
 * no going back at once). One brain for the knights, the wizards, the road's brave folk, the crowd — the numbers differ (ThreatRank.KINDS, COURAGE).
 *
 * Cheap: a person thinks ≈ 3 times a second (staggered), at once on a blow; the lists are small (≤ 12 attackers, ≤ 8 friends); nothing is allocated per frame
 * but those lists (reused). The journal line «решение: …» is written only when the foe or the stance changes.
 */
import { ThreatBook, ThreatMind, THREAT, kindProfile, courageOf, describe } from './ThreatRank.js';
import { foeRef } from './BrawlRules.js';
import { isLord } from './Bodyguard.js';

const MAX_ATT = 12, MAX_ALLY = 8;
const ROLE_KIND = { knight: 'knight', king: 'knight', savior: 'savior', teacher: 'archmage', master: 'archmage', student: 'novice' };

/** What kind of fighter is this person (ThreatRank.KINDS key). */
export function kindOfPerson(v) {
    if (v.brawl?.def?.id) return v.brawl.def.id;
    if (v.element) return v.element;
    if (v.savior != null) return 'savior';
    if (v.wizard) {
        const r = v.rank || v.entry?.rank;
        return r === 'supermage' ? 'supermage' : r === 'teacher' || r === 'master' || r === 'head' ? 'archmage' : r === 'novice' ? 'novice' : 'wizard';
    }
    return ROLE_KIND[v.role] || 'villager';
}

export class Threats {
    constructor(game) {
        this.game = game;
        this._att = []; this._ally = [];
        this.stats = { thought: 0, switched: 0, emergencies: 0, fled: 0, guarded: 0, breakouts: 0 };
    }

    get L() { return this.game.castleLife; }
    now() { return performance.now() / 1000; }

    book(v) { return v._tb || (v._tb = new ThreatBook()); }
    mind(v) { return v._tm || (v._tm = new ThreatMind()); }

    /** A blow taken (CastleLife.hit): remember who and how much. `by`: a player id / a master / a `bf|…` foe id. */
    noteHit(v, by, dmg) {
        if (by == null || !(dmg > 0)) return;
        this.book(v).hit(by, dmg, this.now());
        v.threatHitAt = this.now();
    }

    // ------------------------------------------------------------------ the numbers
    /** My numbers (ThreatRank `me`). */
    meOf(v, out = {}) {
        const kind = kindOfPerson(v), P = kindProfile(kind);
        out.x = v.x; out.z = v.z;
        out.hp = Math.max(0, Math.min(1, v.hp / (v.maxHp || 1)));
        out.maxHp = v.maxHp || 20;
        out.power = P.power * (v.element ? 1 : 1); out.reach = P.reach; out.speed = P.speed; out.ranged = P.ranged;
        out.courage = (v.courage ?? courageOf(v.role === 'king' ? 'king' : kind)) + (v.brave ? 0.15 : 0);
        out.armor = Math.max(0, Math.min(1, (v.armor || 0) / Math.max(1, v.maxArmor || 10)));
        out.allies = this._allies(v);
        return out;
    }

    _allies(v) {
        const L = this.L, out = this._ally; out.length = 0;
        if (!L || !v.cs) return out;
        const brawl = v.brawl?.team;
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || out.length >= MAX_ALLY) continue;
            if (brawl) { if (o.brawl?.team !== brawl) continue; }
            else if (!(o.role === 'knight' || o.role === 'king' || o.wizard || o.mob)) continue; // (the ones who fight beside him)
            if (Math.hypot(o.x - v.x, o.z - v.z) > THREAT.ALLY_R * 1.5) continue;
            const P = kindProfile(kindOfPerson(o));
            out.push({ x: o.x, z: o.z, power: P.power, hp: Math.max(0, Math.min(1, o.hp / (o.maxHp || 1))) });
        }
        return out;
    }

    /** The attackers of a person: players hostile to his place / who struck him / are his foe, and (in the arena of «Битва существ») the other team. */
    attackersOf(v) {
        const g = this.game, L = this.L, out = this._att; out.length = 0;
        const now = Date.now(), t = this.now(), b = this.book(v);
        if (v.brawl && g.brawl) {
            const team = v.brawl.team;
            for (const e of g.brawl._enemies()) {
                if (e.team === team || out.length >= MAX_ATT) continue;
                out.push(g.brawl.attackerOf(e, v));
            }
            return out;
        }
        const seen = new Set();
        const push = (pid, aimed) => {
            if (pid == null || seen.has(pid) || out.length >= MAX_ATT) return;
            const p = L._playerPos(pid);
            if (!p) return;
            seen.add(pid);
            const rem = typeof pid === 'string' && pid.startsWith('bf|') ? foeRef(pid) : null;
            const P = kindProfile('player');
            const hpK = pid === g.localId && g.combat?.enabled ? Math.max(0.05, Math.min(1, (g.combat.health ?? 1) / (g.combat.maxHealth || 1))) : 1;
            let claimed = 0;
            if (v.cs) for (const o of v.cs.active.values()) if (o !== v && !o.dead && o.foe === pid) claimed++;
            out.push({ id: pid, x: p.x, z: p.z, hp: rem ? 1 : hpK, power: P.power, reach: P.reach, speed: P.speed, ranged: P.ranged, aimed, down: false, airborne: false, claimed });
        };
        if (v.foe != null) push(v.foe, 1);
        if (v.cs?.hostile) for (const [pid, until] of v.cs.hostile) if (until > now) push(pid, v.grudge?.id === pid ? 1 : 0.55);
        for (const [pid, e] of b.m) if (t - e.hitAt < 12) push(pid, 1);
        return out;
    }

    // ------------------------------------------------------------------ the thinking
    /**
     * One person's defence for this moment. `opts.event` 'hit' = right after a blow (no waiting). Returns true when he has decided to run (the caller stops his fight).
     * Call it from the person's turn while he is in a fight or has just been hit.
     */
    step(v, dt, opts = {}) {
        if (!v || v.dead) return false;
        const t = this.now();
        v._thinkT = (v._thinkT || 0) - dt;
        if (v._thinkT > 0 && !opts.event) return false;
        v._thinkT = 0.28 + Math.random() * 0.12;
        const L = this.L;
        const list = this.attackersOf(v);
        if (!list.length) { if (v._tm && v._tm.stance !== 'fight') { v._tm.reset(); v.stance = 'fight'; } return false; }
        const me = this.meOf(v, this._me || (this._me = {}));
        const mind = this.mind(v);
        const brawl = !!v.brawl;
        const d = mind.think(me, list, this.book(v), t, { event: opts.event, noFlee: brawl || v.servantOf != null || v.hd === 'guard', courage: me.courage, blocked: (x, z) => (L._walkable ? !L._walkable(x, z, v.y) : false) });
        this.stats.thought++;
        v.stance = d.stance;
        // ---- a new foe
        if (d.foe != null && d.foe !== v.foe && !(v.gaveUp?.id === d.foe && v.gaveUp.until > Date.now())) {
            if (!(v.cs && typeof d.foe === 'string' && !d.foe.startsWith('bf|') && isLord(v, d.foe, L.lordOf(v.cs, d.foe)))) { // (the king and his friends are never his own men's enemy)
                const old = v.foe;
                v.foe = d.foe; v.path = null; v.chaseT = 0; v.seated = false; v.investigate = null;
                if (old != null) { this.stats.switched++; if (d.emergency) this.stats.emergencies++; }
                L.alog?.decision(v, 'решение: ' + describe(d));
            }
        } else if (d.stanceChanged) L.alog?.decision(v, 'решение: ' + describe(d));
        if (d.stanceChanged) { if (d.stance === 'guard') this.stats.guarded++; else if (d.stance === 'breakout') this.stats.breakouts++; }
        // ---- the run
        if (d.stance === 'flee' && d.stanceChanged !== false && !v.fleeT) return this._run(v, d, list);
        if (d.stance === 'flee' && v.routedUntil > Date.now()) return true;
        return false;
    }

    /** He runs: the foe is dropped, the people's own flight (a shelter, away from the force) takes him; he does not turn back for a while. */
    _run(v, d, list) {
        const L = this.L;
        const first = list.find((a) => a.id === d.a.order[0]?.id) || list[0];
        v.foe = null; v.path = null; v.chaseT = 0; v.grudge = null; v.lesson = null;
        v.fleeT = 8 + Math.random() * 3; v.fleeFrom = first?.id ?? null; v.fleeing = false; v.seated = false;
        v.routedUntil = Date.now() + 7000 + Math.random() * 3000;
        if (first) v.fleeAt = { x: first.x, z: first.z }; // (away from where the force stands)
        this.stats.fled++;
        L._say?.(v, v.wizard ? 'Нас слишком много… назад!' : v.role === 'knight' ? 'Их слишком много — отходим!' : 'Нас окружают — бежим!', 3);
        L.alog?.decision(v, 'бежит: ' + describe(d));
        return true;
    }

    /** May he go back to fighting (he has not just run)? */
    mayEngage(v) { return !(v.routedUntil > Date.now()); }
}
