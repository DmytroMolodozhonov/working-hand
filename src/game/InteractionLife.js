// InteractionLife.js — the game side of Reaction.js: «любое взаимодействие с жителем — реакция как у человека» (the author 19.11).
// `life.interact(v, kind, by, data)`: the engine (Reaction.react) judges the event by what it is worth to him, who did it, what he remembers, his character and the moment;
// here the answer becomes the game's doing: his words (after his own thinking time), the turn of the head, the face, the three bars, the alarm, the gossip.
// A person who is busy dying, asleep-and-hit, a child of the arena, a dummy of the school, a guest's copy (not the host) — are not asked.
import { react } from './Reaction.js';
import { newMind, tick } from './NpcMind.js';
import { effective } from './Relations.js';
import { mark } from './GestureLife.js';
import { itemClass } from './Interactions.js';

const CLASS_VALUE = { food: 6, drink: 5, coin: 1, weapon: 80, magic: 120, armor: 90, tool: 25, gross: 1 };
export const valueOf = (item) => item.kind === 'coins' ? Math.max(1, item.count || item.n || 1) : (CLASS_VALUE[itemClass(item.kind)] ?? 8);
const GIFT = { REACH: 3.2, HAND_SPEED: 3.5, HIT_SPEED: 6, HIT_R: 1.3, WINDOW_S: 7, SETTLE_S: 0.6 };

/** The face for a feeling (the names GestureLife.mark knows). */
const EMO_MARK = { gratitude: 'thanks', joy: 'nice', pleased: 'nice', wonder: 'show', amusement: 'joke', embarrassment: 'flirt', curiosity: 'show', anger: 'insult', fear: 'threat', disgust: 'insult', grief: 'sorry', annoyance: 'insult', reluctance: 'refuse' };
const MAX_Q = 24; // (a crowd of reactions at once: the oldest are dropped, not all said over each other)

export class InteractionLife {
    constructor(life) { this.life = life; this.q = []; this.last = null; this.log = []; }
    get game() { return this.life.game; }

    mindOf(v) { return v.npcMind || (v.npcMind = newMind(v.id ?? v.name ?? 'x', v.role || 'farmer')); }

    /** The moment, as the engine reads it. */
    ctxOf(v, by) {
        const g = this.game, st = v.sleep ? { asleep: true } : {};
        if (v.talking || v.trading) st.busy = 'talk'; else if (v.foe || v.fightT > 0) st.busy = 'fight'; else if (v.fleeT > 0) st.busy = 'flee'; else if (v.cmd || v.work) st.busy = 'work';
        st.stuck = !!(v.stuck || v.stuckT > 0);
        st.hpK = v.hp != null && v.maxHp ? v.hp / v.maxHp : 1;
        st.afraid = (v.fear?.level || 0) >= 1;
        st.night = !!g.isNight;
        st.hungry = !!v.hungry;
        st.crowd = (this.life.villagers?.filter?.((o) => o !== v && !o.dead && Math.hypot(o.x - v.x, o.z - v.z) < 20).length || 0) >= 3;
        const r = this.life.rel?.eff ? this.life.rel.eff(v, by) : { sub: 0, fr: 0, lv: 0 };
        return { now: performance.now() / 1000, role: v.role || 'farmer', rel: r || { sub: 0, fr: 0, lv: 0 }, state: st };
    }

    /**
     * Something was done to / near / with `v` by `by`. data: { item:{kind,value,count}, power, accident, thrown }.
     * Returns the engine's answer (or null when he is not asked).
     */
    interact(v, kind, by = null, data = {}) {
        const L = this.life;
        if (!v || v.dead || !L.enabled || !L.auth) return null; // (the host judges; a guest's copy is told by the net)
        if (v.entry?.dummy || v.schoolSafe || v.arena || this.game.arenaDuels?.peace?.()) return null;
        const mind = this.mindOf(v), ctx = this.ctxOf(v, by ?? this.game.localId);
        tick(mind, ctx.now);
        const out = react(mind, { kind, by: by ?? this.game.localId, ...data }, ctx);
        if (!out || out.ignored) return out || null;
        this.last = out;
        const pid = by ?? this.game.localId;
        // the bars (a gift warms, a blow cools, a rescue is remembered)
        const d = out.rel;
        if (!data.noRel && d && (d.s || d.f || d.l)) L.rel?.bump?.(v, pid, { s: d.s || 0, f: d.f || 0, l: d.l || 0 });
        // the face now, the words after his thinking time
        if (out.emotion && EMO_MARK[out.emotion]) mark(v, EMO_MARK[out.emotion], 2.5);
        this._body(v, out, data);
        if (out.say) { this.q.push({ v, at: ctx.now + out.delay, text: out.say, intent: out.intent }); if (this.q.length > MAX_Q) this.q.shift(); }
        // what the town makes of it
        if (out.report && L.alarm) L.alarm({ x: v.x, z: v.z }, 'murder', pid, 14);
        if (out.flee && L.alarm) L.alarm({ x: v.x, z: v.z }, 'threat', pid, 10);
        this.log.push({ t: ctx.now, id: v.id, kind, intent: out.intent, emo: out.emotion });
        if (this.log.length > 80) this.log.shift();
        return out;
    }

    /** The body: the head turns to the one he answers (or to the thing), the rest of the act is the gestures of the speech (GestureLife). */
    _body(v, out, data) {
        const b = out.body || {}, g = this.game, me = g.player?.group?.position || g.player?.position;
        if (b.face && me && !v.foe && !v.talking && !(v.speed > 0.3)) v.glance = { x: me.x, z: me.z, t: 3 };
        if (b.glance && data.at) v.glance = { x: data.at.x, z: data.at.z, t: 3 };
    }

    /**
     * Gifts (the author 19.11: «игрок что-то передаёт другому или кидает — он может присесть, поднять, оценить»): a thing I let go of (Items sets `thrower`):
     *  - a fast one that reaches a person = a throw (a hit: it hurts the feelings, not the body — the body's damage is Items' own);
     *  - a slow one that comes to rest within arm's reach of a person who sees me = handed over / tossed to him;
     *  - one that lands farther = «dropped near» (he looks, may come to it, picks it up).
     * He judges it (Reaction); if he takes it, the thing goes to his hands (it leaves the ground); if not — it lies where it fell.
     */
    _gifts() {
        const g = this.game, items = g.items, L0 = this.life;
        if (!items?.loose || !L0.auth) return;
        const now = performance.now();
        for (const L of items.loose.values()) {
            if (L.thrower !== g.localId || L.ixDone || L.shop || L.item?.shop) continue;
            L.ixAt ??= now;
            if (now - L.ixAt > GIFT.WINDOW_S * 1000) { L.ixDone = true; continue; }
            const p = L.model.position, sp = L.vel ? L.vel.length() : 0;
            let best = null, bd = 1e9;
            for (const v of L0.byId.values()) {
                if (v.dead || v.sleep || v.arena || v.animal) continue;
                const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd && Math.abs((v.y ?? p.y) - p.y) < 6) { bd = d; best = v; }
            }
            if (!best || bd > GIFT.REACH + 4) continue;
            const item = { kind: L.item.kind, count: L.item.count, value: valueOf(L.item) };
            if (sp > GIFT.HIT_SPEED && bd < GIFT.HIT_R + 0.5) { L.ixDone = true; this.interact(best, 'throw_at_hit', g.localId, { item, thrown: true, power: Math.min(1.4, sp / 12) }); continue; }
            if (!L.rest && sp > 1.2) { if (sp > GIFT.HIT_SPEED && bd < GIFT.REACH) { /* flying past him */ } continue; }
            if (!L.rest) continue;
            L.ixDone = true;
            const near = bd <= GIFT.REACH, kind = near ? (now - L.ixAt < 1500 ? 'give_hand' : 'toss_gentle_to') : (L.item && sp > GIFT.HIT_SPEED ? 'throw_at_miss' : 'drop_item_near');
            const out = this.interact(best, kind, g.localId, { item, at: { x: p.x, z: p.z } });
            if (out && ['accept', 'suspicious_accept', 'delight', 'thank', 'thank_big'].includes(out.intent) && near) {
                // he takes it into his hands: after a moment (a person stoops, picks it up, looks at it) it is gone from the ground
                const uid = L.item.uid; setTimeout(() => { if (items.loose.has(uid)) items.removeLoose(uid); }, Math.round(900 + out.delay * 400));
            }
        }
    }

    update(dt) {
        this._giftT = (this._giftT || 0) - dt;
        if (this._giftT <= 0) { this._giftT = 0.25; this._gifts(); }
        if (!this.q.length) return;
        const now = performance.now() / 1000;
        for (let i = this.q.length - 1; i >= 0; i--) {
            const e = this.q[i];
            if (e.v.dead) { this.q.splice(i, 1); continue; }
            if (now < e.at) continue;
            if (e.v.sayT > 0) { if (now - e.at > 6) this.q.splice(i, 1); continue; } // (he is mid-sentence: wait; after 6 s the late remark is dropped — nobody replies to an old thing)
            this.q.splice(i, 1);
            this.life._say?.(e.v, e.text, 3.5 + Math.min(2, e.text.length / 40), false);
        }
    }
}
