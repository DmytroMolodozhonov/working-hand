/**
 * RelationsLife.js — the game side of Relations.js: who feels what about the hero, what he does about it.
 *
 * Kept per castle in its state (saved, sent to the guests): `st.rel[idx][playerId] = [s, f, l]` (deltas, see Relations.js) and
 * `st.rep[playerId]` (what the town knows of him). The host changes them (a guest's talk asks the host: order 'rel').
 *  - talks: the tone of the words moves the bars (+3 дружба) — capped, a person is not bought by chatter;
 *  - deeds: blows, killings, monsters killed before their eyes, gifts, theft, spells seen (the hero is known by what he did);
 *  - the bars over the person I talk to (RelationBars);
 *  - consequences (host, every 1.5 s): a fighter who hates the hero enough strikes by himself; the knights who hate him conspire
 *    and, after a whisper, strike — the loyal ones stand by the king; the vizier who hates him long and has followers leads the
 *    coup (Relations.plotOf).
 */

import { RelationBars } from '../ui/RelationBars.js';
import { friendDrag } from './Rebellion.js';
import {
    baseSub, blank, bump as bumpRel, effective, visibleBars, TONE, TALK_CAP, flirtResult, blankRep, isKnown, firstImpression, DEED,
    hatred, plotOf, strikesAlone, stance, mayEnterHome, mayTakeThing, obeys,
} from './Relations.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SCAN = 1.5; // s between two looks at the grudges
const WHISPER = [45, 90]; // s from the conspiracy to the strike
const REP_SEEN = 25; // m: the people who see a deed

export const WHISPERS = ['Слышал, что сказал король? Долго мы это терпеть не будем.', 'Пора что-то решать с ним… тише.', 'Нас много. Он один.', 'Ждём знака — и покончим с этим.', 'Он нам не государь.', 'Тс-с… не здесь.'];
export const STRIKE_CRY = ['Смерть узурпатору!', 'Долой тирана!', 'За свободу замка!', 'Хватит терпеть!'];
export const VIZIER_CRY = ['Ты довёл замок до беды! Взять его!', 'Твоё время вышло, Ваше Величество!', 'Хватит! Стража, ко мне!'];
export const LOYAL_CRY = ['Не смейте поднимать руку на короля!', 'Я присягал королю! Назад!', 'Предатели! К оружию!'];
export const WARN_VIZIER = ['Ваше Величество, среди рыцарей зреет недовольство. Будьте осторожнее.', 'Государь, я слышу ропот в казармах. Прошу вас, поговорите с ними.'];

export class RelationsLife {
    constructor(life) {
        this.life = life;
        this.bars = null;
        this._scanT = 0.5;
        this._flushT = 0;
        this.dirty = new Set();
        this.plots = new Map(); // castle id → {pid, stage, t, leader, members:Set, loyal:Set, said}
        this.vizierHate = new Map(); // vizier id → s of long hate
    }

    get game() { return this.life.game; }
    get auth() { return this.life.auth; }

    // ------------------------------------------------------------------ the numbers
    _st(cs) {
        const st = this.life.state(cs.def.id);
        if (!st.rel) st.rel = {};
        if (!st.rep) st.rep = {};
        return st;
    }

    /** Where a person's numbers are kept: a castle's people in the castle's state; any other humanoid (a sailor, a traveller) in `free`. */
    _store(v) {
        if (v.cs) { const st = this._st(v.cs); return { rel: st.rel, rep: st.rep, key: v.idx, cs: v.cs }; }
        if (!this.free) this.free = { rel: {}, rep: {} };
        return { rel: this.free.rel, rep: this.free.rep, key: v.id, cs: null };
    }

    /** What the person feels now, as a stored relation (deltas); a stranger who has heard of the hero gets the town's first impression. */
    relOf(v, pid) {
        const S = this._store(v);
        const st = { rel: S.rel, rep: S.rep };
        const m = st.rel[S.key] || (st.rel[S.key] = {});
        let a = m[pid];
        if (!a) {
            const imp = firstImpression(st.rep[pid], this.life.talk?.brain?.(v)?.character || this.life.sailorChar?.(v));
            a = m[pid] = [imp.s, imp.f, imp.l, 0, 0, 0]; // [s, f, l, talk fr gained, talk love gained, last greeting at]
        }
        return { s: a[0], f: a[1], l: a[2] };
    }

    /** The status (Attitude.STATUS key) he sees `pid` in. */
    statusOf(v, pid) {
        if (!v.cs) return this.game.ships?.loyalTo?.(v.ship, pid) ? 'king' : 'traveller'; // (a sailor: the ship's master is his king)
        if (pid === this.game.localId) return this.life.talk._status(v);
        const r = this.life.rankOf(v.cs, pid);
        return r >= 9 ? 'king' : r === 4 ? 'deputy' : r === 3 ? 'commander' : r === 2 ? 'honored' : r === 1 ? 'friend' : 'traveller';
    }

    /** The bars as they are now: {sub, fr, lv}. */
    eff(v, pid = this.game.localId, raw = false) {
        const ch = v.cs ? this.life.talk?.brain?.(v)?.character : null; // (a sailor, a ship's captain: no castle, no talk brain — Gargoyles biting a sailor once threw «reading 'def'»)
        const e = effective(this.relOf(v, pid), baseSub(this.statusOf(v, pid), ch?.obedience ?? 50));
        // the unrest of the place drags down the friendship to its owner («формально подчиняются, но ненавидят» — Rebellion.js); `raw`: without it
        if (!raw && v.cs && this.life.reb?.appliesTo(v.cs, pid)) { const d = friendDrag(this.life.reb.value(v.cs), ch?.temper ?? 50); if (d) e.fr = Math.max(-100, e.fr - d); }
        return e;
    }

    /**
     * A change: d = {s, f, l}. The host writes it; a guest asks the host (and shows it at once). `talk`: counts against the talk cap.
     * `show`: the "+3" by the bars (only for the hero's own, and only when it is seen).
     */
    bump(v, pid, d, { show = true } = {}) {
        if (!v || v.dead || !this.life.enabled) return;
        if (!this.auth) {
            if (pid === this.game.localId) this.game.sync?.villagerOrder?.(v.id, 'rel', { d });
            return;
        }
        this._apply(v, pid, d, show);
    }

    _apply(v, pid, d, show) {
        const S = this._store(v);
        const before = this.eff(v, pid);
        const cur = this.relOf(v, pid);
        const next = bumpRel(cur, d);
        const a = S.rel[S.key][pid];
        a[0] = next.s; a[1] = next.f; a[2] = next.l;
        if (S.cs) this.dirty.add(S.cs.def.id);
        if (show && pid === this.game.localId) {
            const after = this.eff(v, pid);
            this._popFor(v, before, after);
        }
    }

    _popFor(v, before, after) {
        if (!this.bars) return;
        for (const k of ['sub', 'fr', 'lv']) { const d = after[k] - before[k]; if (d) this.bars.pop(k, d); }
        this.focus = { v, until: performance.now() + 6000 };
    }

    /** What the town knows of him: a counter up. */
    _rep(cs, pid, key, n = 1) {
        const st = this._st(cs);
        const r = st.rep[pid] || (st.rep[pid] = blankRep());
        r[key] = (r[key] || 0) + n;
        this.dirty.add(cs.def.id);
    }

    // ------------------------------------------------------------------ talks
    /** (CastleTalk._apply) The words of the talk change how he takes me. `res.intent` is the rules' reading of my words. */
    talked(v, res) {
        if (!res || v.dead || !this.life.enabled) return;
        const pid = this.game.localId;
        const intent = res.intent;
        this.life.social?.touched(v); // (he was not forgotten)
        const t = TONE[intent];
        if (!t) return;
        const now = performance.now();
        // (the cooldown per kind of word: the same kindness twice in a breath is one)
        const cool = (this._cool || (this._cool = new Map()));
        const ck = `${v.id}|${intent}`;
        if (now - (cool.get(ck) || -1e9) < (t.cool || 30) * 1000) return;
        if (cool.size > 400) cool.clear();
        cool.set(ck, now);
        let d = { s: t.s || 0, f: t.f || 0, l: t.l || 0 };
        const eff = this.eff(v, pid);
        if (intent === 'flirt') d = flirtResult(eff, this.life.talk?.brain?.(v)?.character);
        // (talk alone makes at most TALK_CAP of friendship / love)
        this.relOf(v, pid);
        const S = this._store(v);
        const a = S.rel[S.key][pid];
        if (d.f > 0) { const room = Math.max(0, TALK_CAP.f - (a[3] || 0)); d.f = Math.min(d.f, room); }
        if (d.l > 0) { const room = Math.max(0, TALK_CAP.l - (a[4] || 0)); d.l = Math.min(d.l, room); }
        if (!d.f && !d.s && !d.l) return;
        if (this.auth) { a[3] = (a[3] || 0) + Math.max(0, d.f || 0); a[4] = (a[4] || 0) + Math.max(0, d.l || 0); }
        this.bump(v, pid, d);
        if (v.cs) this._rep(v.cs, pid, 'n', 0.2);
        if (v.cs && this.auth && (d.f > 0 || d.s > 0)) this.life.reb?.note(v.cs, pid, 'talk'); // (a kind word eases the unrest a little)
        this.focus = { v, until: performance.now() + 7000 };
    }

    // ------------------------------------------------------------------ deeds
    _witnesses(cs, pos, r = REP_SEEN) {
        const out = [];
        for (const w of cs.active.values()) if (!w.dead && Math.hypot(w.x - pos.x, w.z - pos.z) < r && this.life._sees(w, { x: pos.x, y: pos.y + 1.5, z: pos.z })) out.push(w);
        return out;
    }

    /** (CastleLife.hit / _die) The hero struck a person; or killed him. */
    onHit(v, by, killed) {
        if (!this.auth || !this.life._isPlayer(by) || v.arena || v.dead && !killed) return;
        if (!v.cs) { this._apply(v, by, (killed ? DEED.slay : DEED.hurt).victim, by === this.game.localId); return; } // (a sailor: only he himself — the crew hears below)
        const D = killed ? (v.foe === by ? DEED.hurt : DEED.slay) : DEED.hurt; // (killing one who was at me is self-defence: a wound, not a murder)
        const cs = v.cs, p = { x: v.x, y: v.y, z: v.z };
        this._rep(cs, by, D.rep || 'hurt');
        if (v.role !== 'king') this.life.reb?.note(cs, by, D === DEED.slay ? 'slay' : 'hurt'); // (the unrest of the place: Rebellion.js)
        for (const w of this._witnesses(cs, p)) { this._apply(w, by, w === v ? D.victim : D.witness, by === this.game.localId); if (w !== v) this.life.social?.witnessedBlow(w, v, by, killed); }
        if (v.dead || !killed) this._apply(v, by, D.victim, by === this.game.localId);
        // (a hand raised against the people: the town hears of it — one sour word to everybody)
        for (const w of cs.active.values()) if (!w.dead && w !== v) this._apply(w, by, { f: killed ? -2 : -0.5 }, false);
    }

    /** A monster killed before the town's eyes (zombies near the people): they are grateful. */
    foeSlain(pos, by) {
        if (!this.auth || !this.life._isPlayer(by)) return;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            const w = this._witnesses(cs, pos, 35);
            if (!w.length) continue;
            this._rep(cs, by, 'foes');
            this.life.reb?.note(cs, by, 'foe');
            for (const x of w) this._apply(x, by, DEED.foe.witness, by === this.game.localId);
        }
    }

    /** A spell was cast by `by` (me): who sees it knows what the hero can do. */
    sawCast(name) {
        const g = this.game, me = g.character?.group?.position;
        if (!me || !this.life.enabled) return;
        const pid = g.localId;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            let seen = 0;
            for (const w of cs.active.values()) if (!w.dead && Math.hypot(w.x - me.x, w.z - me.z) < 30 && this.life._sees(w, { x: me.x, y: me.y, z: me.z })) { w.sawMagic = (w.sawMagic || 0) + 1; seen++; }
            if (seen && this.auth) this._rep(cs, pid, 'magic');
        }
        this.life.social?.onSpell(name, me);
    }

    /** A deal done fairly, a gift, a theft: small deeds (host). */
    gift(v, by) { if (this.auth) { this._rep(v.cs, by, 'gifts'); this.life.reb?.note(v.cs, by, 'gift'); this._apply(v, by, DEED.gift.victim, by === this.game.localId); } else this.bump(v, by, DEED.gift.victim); }
    theft(v, by) { if (this.auth) { this._rep(v.cs, by, 'crimes'); this.life.reb?.note(v.cs, by, 'theft'); this._apply(v, by, DEED.theft.victim, by === this.game.localId); } }

    /** What the person knows of the hero in words, for the talk (so that his words fit): "видел N заклинаний, знает про убитых…". */
    knownText(v, pid = this.game.localId) {
        const rep = this._store(v).rep[pid];
        const out = [];
        if (v.sawMagic) out.push(`ты сам видел, как он колдует (${v.sawMagic} раз)`);
        else if (rep?.magic > 3) out.push('слышал, что он колдует');
        if (rep?.slain) out.push(`знаешь, что он убил ${rep.slain} невинных`);
        if (rep?.hurt) out.push(`слышал, что он бил людей`);
        if (rep?.foes > 2) out.push(`знаешь, что он бьёт нежить и защищает людей`);
        if (rep?.saved) out.push('знаешь, что он помогал людям');
        if (!isKnown(rep) && !v.sawMagic) return 'о нём здесь почти ничего не знают';
        return out.join('; ');
    }

    // ------------------------------------------------------------------ the bars over his head
    update(dt) {
        if (!this.life.enabled) return;
        const g = this.game;
        if (!this.bars && g.scene && typeof document !== 'undefined') this.bars = new RelationBars(g.scene);
        // who to show: the one I talk to now, or the one I look at steadily
        let v = null;
        const P = this.life.talk?._partner;
        const now = performance.now();
        if (P && !P.dead && now - (P.talkedAt || -1e9) < 9000) v = P;
        else if (this.focus && now < this.focus.until) v = this.focus.v && !this.focus.v.dead ? this.focus.v : null;
        if (!v) {
            const id = this.life.talk?.attention?.addressee?.((i) => !!this.life.byId.get(i));
            if (id) { const w = this.life.byId.get(id); if (w && (this.life.talk.attention.score(id) || 0) >= 0.55) v = w; }
        }
        if (this.bars) {
            if (v && !v.dead) this.bars.update(dt, visibleBars(this.eff(v)), v.x, v.y + (v.wizard ? 6.9 : 6.0), v.z, v.id);
            else this.bars.update(dt, null, 0, 0, 0, '');
        }
        if (!this.auth) return;
        this._flushT -= dt;
        if (this._flushT <= 0 && this.dirty.size) { this._flushT = 4; for (const id of this.dirty) { const cs = this.life.castles.get(id); if (cs) this.life._sendState(cs); } this.dirty.clear(); }
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = SCAN; for (const cs of this.life.castles.values()) if (cs.awake) this._scan(cs, SCAN); }
    }

    // ------------------------------------------------------------------ consequences (host)
    _players() { return (this.life._players?.() || []).map((q) => ({ id: q.id })); }

    _fighters(cs) { return [...cs.active.values()].filter((v) => !v.dead && !v.sleep && (v.role === 'knight' || v.role === 'advisor' || v.wizard)); }

    _scan(cs, dt) {
        const st = this._st(cs);
        const now = Date.now();
        for (const pl of this._playersNear(cs)) {
            const pid = pl.id;
            const owner = st.owner === pid;
            const people = [];
            for (const v of this._fighters(cs)) {
                const ch = this.life.talk?.brain?.(v)?.character;
                const e = this.eff(v, pid);
                const h = hatred(e, ch);
                people.push({ id: v.id, role: v.role === 'advisor' ? 'advisor' : 'knight', hate: h, v, ch });
                if (v.role === 'advisor') {
                    const cur = this.vizierHate.get(v.id) || 0;
                    this.vizierHate.set(v.id, h >= 70 ? cur + dt : Math.max(0, cur - dt * 2));
                }
                // a lone fighter who cannot bear him strikes
                if (!v.foe && !v.cmd && strikesAlone(h, ch) && !this._underPlot(cs)) this._grudge(v, pid, 'alone');
            }
            if (!owner) continue; // (a plot is against a king)
            this._plotStep(cs, pid, people, dt);
        }
        for (const [id, p] of this.plots) if (p.cs === cs.def.id && !this.life.castles.has(p.cs)) this.plots.delete(id);
        void now;
    }

    _playersNear(cs) {
        const out = [];
        for (const p of this._players()) {
            const pos = this.life._playerPos(p.id);
            if (pos && Math.hypot(pos.x - cs.def.x, pos.z - cs.def.z) < 220) out.push({ id: p.id, pos });
        }
        return out;
    }

    _underPlot(cs) { return this.plots.has(cs.def.id); }

    _grudge(v, pid, why) {
        const cs = v.cs;
        cs.hostile.set(pid, Date.now() + 300000);
        const p = this.life._playerPos(pid);
        if (p && Math.hypot(p.x - v.x, p.z - v.z) < 40) { v.foe = pid; v.grudge = { id: pid, until: Date.now() + 120000 }; this.life._say(v, pick(STRIKE_CRY), 3); }
        void why;
    }

    _plotStep(cs, pid, people, dt) {
        const id = cs.def.id;
        let plot = this.plots.get(id);
        const vh = people.find((x) => x.role === 'advisor');
        const res = plotOf(people, { vizierLong: vh ? this.vizierHate.get(vh.id) || 0 : 0 });
        if (!plot) {
            if (!res.plot) return;
            const t = WHISPER[0] + Math.random() * (WHISPER[1] - WHISPER[0]);
            plot = { cs: id, pid, stage: 'whisper', t, leader: res.leader, members: new Set(res.members), loyal: new Set(res.loyal), why: res.why, said: 0 };
            this.plots.set(id, plot);
            this.game.hud?.notify?.('⚠️ В замке неспокойно — слышен ропот');
            return;
        }
        // the plot melts if the grudge cools (the hero made peace): fewer than half remain
        if (plot.stage === 'whisper') {
            const still = people.filter((x) => plot.members.has(x.id) && x.hate >= 35).length;
            if (still < Math.ceil(plot.members.size / 2)) { this.plots.delete(id); return; }
            plot.t -= dt;
            plot.said -= dt;
            const near = this.life._playerPos(pid);
            if (plot.said <= 0) {
                plot.said = 10 + Math.random() * 8;
                const m = people.find((x) => plot.members.has(x.id) && x.v && near && Math.hypot(x.v.x - near.x, x.v.z - near.z) < 18);
                if (m) this.life._say(m.v, pick(WHISPERS), 3);
                // the loyal vizier warns the king, once (if he is near)
                if (vh && !plot.warned && !plot.members.has(vh.id) && vh.v && near && Math.hypot(vh.v.x - near.x, vh.v.z - near.z) < 14) { plot.warned = true; this.life._say(vh.v, pick(WARN_VIZIER), 5); }
            }
            if (plot.t <= 0) this._strike(cs, plot, people);
            return;
        }
        // the strike lasts while any of them stands; then the castle calms
        plot.t -= dt;
        const alive = people.filter((x) => plot.members.has(x.id));
        if (!alive.length || plot.t < -400) this.plots.delete(id);
    }

    _strike(cs, plot, people) {
        plot.stage = 'strike'; plot.t = 0;
        const pid = plot.pid;
        const cry = plot.why === 'vizier' ? VIZIER_CRY : STRIKE_CRY;
        this.game.hud?.notify?.(plot.why === 'vizier' ? '⚔️ Визирь поднял мятеж!' : '⚔️ Рыцари подняли мятеж!');
        cs.hostile.set(pid, Date.now() + 600000);
        let n = 0;
        for (const x of people) {
            if (!plot.members.has(x.id)) continue;
            const v = x.v;
            v.foe = pid; v.grudge = { id: pid, until: Date.now() + 300000 }; v.cmd = null; v.order = null; v.follow = null;
            if (n++ < 3 || x.id === plot.leader) this.life._say(v, pick(cry), 3);
        }
        // the loyal knights stand by the king: they go at the traitors
        const traitors = people.filter((x) => plot.members.has(x.id)).map((x) => x.v);
        let k = 0;
        for (const x of people) {
            if (!plot.loyal.has(x.id) || x.role !== 'knight' || !traitors.length) continue;
            const foe = traitors[k++ % traitors.length];
            this.life.orders.run(x.v, 'cmd', { id: 'fight_him', foe: foe.id, mode: 'deadly' }, pid);
            if (k <= 2) this.life._say(x.v, pick(LOYAL_CRY), 3);
        }
    }

    // ------------------------------------------------------------------ favors of friendship
    /** May the hero walk into this home / take this thing from it without a crime? (the owner's family likes him enough). */
    homeAllows(cs, home, by, what = 'enter') {
        const st = this._st(cs);
        let best = null;
        for (const v of cs.active.values()) {
            if (v.dead || v.entry?.home !== home.h) continue;
            const e = this.eff(v, by);
            const ok = what === 'take' ? mayTakeThing(e) : mayEnterHome(e);
            if (ok) return true;
            best = best || e;
        }
        void st; void best;
        return false;
    }

    /** Will he obey the hero's order of this kind, as duty or as a friend? (for Attitude / the commands) */
    willObey(v, kind, pid = this.game.localId) { return obeys(this.eff(v, pid), this.life.talk?.brain?.(v)?.character, kind); }

    stance(v, pid = this.game.localId) { return stance(this.eff(v, pid), this.life.talk?.brain?.(v)?.character); }

    // ------------------------------------------------------------------ state
    /** The compact copy for the castle's state (only what is not empty). */
    pack(cs) {
        const st = this._st(cs);
        const rel = {};
        for (const [idx, m] of Object.entries(st.rel)) {
            const o = {};
            for (const [pid, a] of Object.entries(m)) if (a[0] || a[1] || a[2] || a[3] || a[4]) o[pid] = a.map((x) => Math.round(x * 10) / 10);
            if (Object.keys(o).length) rel[idx] = o;
        }
        const rep = {};
        for (const [pid, r] of Object.entries(st.rep)) rep[pid] = r;
        const out = { rel, rep };
        if (st.court) out.court = st.court;
        if (st.jail) out.jail = st.jail;
        const reb = this.life.reb?.pack(cs);
        if (reb) out.reb = reb;
        return out;
    }

    /** The numbers of those outside any castle (sailors…): saved with the castles' states under '__free'. */
    packFree() { return this.free ? { rel: this.free.rel, rep: this.free.rep } : null; }
    unpackFree(d) { if (d && typeof d === 'object') this.free = { rel: d.rel || {}, rep: d.rep || {} }; }

    unpack(st, s) {
        st.rel = s.rel && typeof s.rel === 'object' ? s.rel : (st.rel || {});
        st.rep = s.rep && typeof s.rep === 'object' ? s.rep : (st.rep || {});
        if (s.court && typeof s.court === 'object') st.court = s.court;
        if (s.jail && typeof s.jail === 'object') st.jail = s.jail;
        this.life.reb?.unpack(st, s); // (older saves and a calm place: no `reb` — calm)
    }

    dispose() { this.bars?.dispose(); this.bars = null; }
}
