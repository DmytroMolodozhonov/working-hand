/**
 * RebellionLife.js — the game side of Rebellion.js: the hidden unrest of a castle / village toward its owner.
 *
 * Kept in the castle's state (`st.reb = {v, t}`, saved, sent to the guests; an old save has none = calm). The HOST changes it (the
 * deeds come to the host; a guest's deed arrives there as always) and reads it; the guests only see the number in their copy.
 * Only the owner's (the king-player's) deeds move it, except the killing of the old king that makes him owner.
 *  - `note(cs, by, kind, n)` — a deed (Rebellion.DEED_REB), written in the journal «решение:» when it matters;
 *  - every second: the owner walks into a house → the people at home may fall on him (`homeChance`: rich 80 %, poor 40 %);
 *    shops/civilians mutter, refuse, run (`reactionOf`);
 *  - every 200–420 s: a fit — two or three knights (never the herd) rise against him, the loyal knights stop them;
 *  - the friendship of everybody to the owner is dragged down (RelationsLife.eff → `friendDrag`).
 */

import {
    valueOf, note as noteRec, slainKing, ease, homeChance, risingKnights, nextPeriod, levelName, reactionOf, ROLE_REACT, REB,
    WHISPER_LINES, REFUSE_LINES, HOME_CRY, RISE_CRY, unpackRecord, packRecord, blank, DEED_REB,
} from './Rebellion.js';

const SCAN = 1; // s
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const KIND_WORD = {
    execution: 'казнь', slay: 'убийство жителя', hurt: 'удар по жителю', theft: 'грабёж', arson: 'поджог', wreck: 'разрушение', raid: 'нападение дома',
    foe: 'защита от врагов', saved: 'помощь', gift: 'подарок', talk: 'добрый разговор', repair: 'починка', rank: 'должность', court: 'решённая беда',
};

export class RebellionLife {
    constructor(life) {
        this.life = life;
        this._scanT = 0.7;
        this.visits = new Map(); // `${castle}|${house}` → performance time of the last roll
        this.fit = new Map(); // castle id → s to the next fit
        this.said = new Map(); // person id → time of the last mutter
    }

    get game() { return this.life.game; }
    get auth() { return this.life.auth; }

    // ------------------------------------------------------------------ the number
    _rec(cs) { const st = this.life.state(cs.def.id); return st.reb || (st.reb = blank()); }

    /** The unrest of this place toward its owner, 0…100. */
    value(cs) { return cs ? valueOf(this.life.state(cs.def.id).reb) : 0; }

    /** For `eff`: does the unrest apply to this player in this place? (his own castle only) */
    appliesTo(cs, pid) { return !!cs && pid != null && this.life.state(cs.def.id).owner === pid; }

    /**
     * (host) A deed of `by`. Counted only for the owner; the old king's killing (`slainKing`) makes the number at least KING_SLAIN.
     * Returns the new value (or null if not counted).
     */
    note(cs, by, kind, n = 1) {
        if (!cs || !this.auth || !this.life.enabled || by == null) return null;
        const st = this.life.state(cs.def.id);
        if (kind !== 'slainKing' && st.owner !== by) return null;
        const before = valueOf(st.reb);
        st.reb = kind === 'slainKing' ? slainKing(st.reb) : noteRec(st.reb, kind, n);
        const after = valueOf(st.reb);
        if (after !== before) {
            this.life.rel?.dirty.add(cs.def.id);
            this.life.alog?.note(`недовольство «${cs.def.name || cs.def.id}»: ${before.toFixed(1)} → ${after.toFixed(1)} (${kind === 'slainKing' ? 'убит прежний король' : KIND_WORD[kind] || kind}) — ${levelName(after)}`);
        }
        return after;
    }

    // ------------------------------------------------------------------ loop (host)
    update(dt) {
        if (!this.auth || !this.life.enabled) return;
        this._scanT -= dt;
        if (this._scanT > 0) return;
        const step = SCAN - this._scanT; // (≥ SCAN: the time that really passed)
        this._scanT = SCAN;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            const st = this.life.state(cs.def.id);
            if (!st.reb || !(st.reb.v > 0)) continue;
            st.reb = ease(st.reb, step); // (awake places only: a sleeping one does not cool)
            this._tell = (this._tell || 0) + step;
            if (this._tell > 30) { this._tell = 0; this.life.rel?.dirty.add(cs.def.id); } // (the guests' copy follows the slow easing)
            const pid = st.owner;
            if (!pid || !this.life._isPlayer(pid)) continue;
            const pos = this.life._playerPos(pid);
            if (!pos || Math.hypot(pos.x - cs.def.x, pos.z - cs.def.z) > 220) continue;
            const reb = valueOf(st.reb);
            if (reb < REB.RAMP_FROM) continue;
            this._homes(cs, pid, pos, reb);
            this._mood(cs, pid, pos, reb);
            this._fit(cs, pid, reb, step);
        }
        if (this.visits.size > 200) { const now = performance.now(); for (const [k, t] of this.visits) if (now - t > REB.HOME_COOL * 1000) this.visits.delete(k); }
        if (this.said.size > 300) this.said.clear();
    }

    /** The owner is in a house: the people at home may fall on him. One roll per person per visit. */
    _homes(cs, pid, pos, reb) {
        const now = performance.now();
        const e = (h) => Math.abs(pos.y - (h.inside?.y ?? h.c.y ?? pos.y)) < 6;
        cs.def.houses?.forEach((h, i) => {
            if (!h || h.lifted || !h.c) return;
            if (Math.hypot(h.c.x - pos.x, h.c.z - pos.z) > (h.r || 6) * 0.8 || !e(h)) return;
            const key = `${cs.def.id}|${i}`;
            if (now - (this.visits.get(key) || -1e9) < REB.HOME_COOL * 1000) return;
            this.visits.set(key, now);
            const people = [...cs.active.values()].filter((v) => !v.dead && v.entry?.home === i && ROLE_REACT[v.role]?.home && !v.foe && v.sleep?.phase !== 'lie' && v.mode !== 'sleep');
            let n = 0;
            for (const v of people) {
                if (n >= 2) break; // (not the whole household: two at most)
                const fr = this.life.rel?.eff(v, pid, true).fr ?? 0; // (his real friendship, without the unrest's drag)
                const p = homeChance(reb, !!h.rich, fr);
                const roll = Math.random();
                this.life.alog?.decision(v, `дом «${h.id}»: король вошёл, недовольство ${reb.toFixed(0)}, ${h.rich ? 'богатый' : 'небогатый'} — шанс нападения ${(p * 100).toFixed(0)} %, бросок ${(roll * 100).toFixed(0)} → ${roll < p ? 'нападает' : 'терпит'}`);
                if (roll >= p) continue;
                n++;
                v.grudge = { id: pid, until: Date.now() + 90000 }; v.foe = pid; v.fleeT = 0; v.path = null; v.seated = false;
                this.life._say(v, pick(HOME_CRY), 3);
                this.note(cs, pid, 'raid');
            }
        });
    }

    /** Civilians and merchants: a mutter, a step away (rare). */
    _mood(cs, pid, pos, reb) {
        const now = performance.now();
        for (const v of cs.active.values()) {
            if (v.dead || v.foe || v.sleep?.phase === 'lie' || v.talking > 0) continue;
            if (Math.hypot(v.x - pos.x, v.z - pos.z) > 10) continue;
            if (now - (this.said.get(v.id) || -1e9) < 25000) continue;
            const r = reactionOf(v.role, reb, Math.random());
            if (r.kind === 'whisper') { this.said.set(v.id, now); this.life._say(v, pick(WHISPER_LINES), 2.5); }
            else if (r.kind === 'flee') {
                this.said.set(v.id, now);
                this.life.fright.scare(v, 'attacker', { x: pos.x, y: pos.y - 1.95, z: pos.z }, pid);
                this.life.alog?.decision(v, `недовольство ${reb.toFixed(0)}: убегает от короля`);
            }
        }
    }

    /** (NightLife.heard) Does this merchant refuse the owner now? Says it and returns true. */
    refusesTrade(v, pid = this.game.localId) {
        if (!this.life.enabled || !v?.cs || (v.role !== 'merchant' && v.role !== 'seller')) return false;
        if (!this.appliesTo(v.cs, pid)) return false;
        const reb = this.value(v.cs);
        // (the same stall refuses consistently for a while: the die is thrown once per minute)
        const k = `${v.id}|shop`;
        const t = performance.now();
        const m = this._shop || (this._shop = new Map());
        let rec = m.get(k);
        if (!rec || t - rec.t > 60000) { rec = { t, no: reactionOf(v.role, reb, Math.random(), { trade: true }).kind === 'refuse' }; if (m.size > 200) m.clear(); m.set(k, rec); }
        if (!rec.no) return false;
        this.life._say(v, pick(REFUSE_LINES), 4);
        this.life.alog?.decision(v, `недовольство ${reb.toFixed(0)}: отказывается торговать с королём`);
        return true;
    }

    /** A fit: two or three knights (never the herd) rise; the loyal ones stop them. */
    _fit(cs, pid, reb, dt) {
        const id = cs.def.id;
        let left = this.fit.get(id);
        if (left == null) left = nextPeriod();
        left -= dt;
        if (left > 0) { this.fit.set(id, left); return; }
        this.fit.set(id, nextPeriod());
        if (reb < REB.KNIGHT_MIN || this.life.rel?._underPlot(cs)) return; // (a plot has its own strike)
        const knights = [...cs.active.values()].filter((v) => !v.dead && v.role === 'knight' && !v.arena && !v.sleep && v.servantOf == null);
        const free = knights.filter((v) => !v.foe && !v.cmd);
        const all = [];
        for (const v of knights) { all.push({ id: v.id, fr: this.life.rel?.eff(v, pid, true).fr ?? 0 }); }
        // (the die is thrown among all the knights of the place, so that «not all» means not half of the whole guard)
        const ids = risingKnights(all, reb).filter((x) => free.some((v) => v.id === x));
        this.life.alog?.note(`недовольство «${cs.def.name || id}» ${reb.toFixed(0)}: приступ — рыцарей ${knights.length}, восстают ${ids.length}`);
        if (!ids.length) return;
        const rebels = ids.map((x) => this.life.byId.get(x)).filter(Boolean);
        rebels.forEach((v, i) => {
            v.foe = pid; v.grudge = { id: pid, until: Date.now() + 180000 }; v.cmd = null; v.order = null; v.follow = null; v.path = null;
            if (i === 0) this.life._say(v, pick(RISE_CRY), 3);
        });
        this.game.hud?.notify?.('⚔️ Несколько рыцарей восстали против вас');
        // the loyal knights stand against them (not on an «execution»: the order is marked, it does not add unrest)
        const loyal = knights.filter((v) => !ids.includes(v.id) && !v.foe && !v.cmd && (this.life.rel?.stance(v, pid) !== 'hostile'));
        loyal.slice(0, rebels.length).forEach((v, i) => this.life.orders.run(v, 'cmd', { id: 'fight_him', foe: rebels[i].id, mode: 'deadly', rebel: true }, pid));
    }

    // ------------------------------------------------------------------ state
    /** The saved copy (null: nothing — calm). */
    pack(cs) { return packRecord(this.life.state(cs.def.id).reb); }
    /** Old saves have no `reb`: they come up calm (migration). */
    unpack(st, s) {
        st.reb = unpackRecord(s ? s.reb : null); // (absent: an older save, or the host's place is calm — both are 0)
    }
}

export { DEED_REB };
