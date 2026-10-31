/**
 * Handover.js — passing a thing from one player to another (pure logic, unit-tested).
 * Items.js (_give) does the game side, NetSync carries the `hov` messages.
 *
 * The author: only from the SECONDARY ("daughter") hand — the one opposite the wand hand; the two players
 * come to each other and TOUCH the other's hand for 2–3 seconds; the taker's own secondary hand must be EMPTY,
 * the thing goes into it. Otherwise nothing is passed.
 *
 * Units: the hero is ~2.8 world units per real metre, so 0.35 m ≈ 1.0 unit, 0.5 m ≈ 1.4 unit.
 *
 * The passing is atomic, in three steps (messages are reliable and in order):
 *   giver  → taker : `q` ask   (tid, kind, which of the taker's hands is touched)   — the giver KEEPS the thing
 *   taker  → giver : `a` answer (tid, ok, why)    — ok: the taker only reserves, it takes nothing yet
 *   giver  → taker : `c` commit (tid, item)       — the giver lets the thing go and sends it in the same breath
 * The taker puts the committed thing into the hand; if the hand has been taken in the meantime — into a slot, and
 * with no room at its feet: never nowhere. A give not answered in ASK_T, or a taker who left, ends with the thing
 * still in the giver's hand. So a thing is in one place at every moment (in flight: only in the one `c` message).
 */

export const HANDOVER = {
    NEAR: 1.0,        // hands this near (≈ 35 cm) count as touching
    BREAK: 1.4,       // …apart this far (≈ 50 cm): the touch is over at once
    HOLD: 2.5,        // touching this long (s) and the thing is handed over
    GAP: 0.3,         // a short break in the touch (s) does not start it again
    LOST: 0.25,       // the camera lost the hand (≈ 6 frames): counts as a gap, no more
    ASK_T: 3.0,       // the answer must come within this, else the give is off
    RESERVE_T: 4.0,   // the taker keeps its hand free for the commit this long
    FLY_T: 0.25,      // the thing floats from hand to hand this long
    HINT_T: 5.0,      // a hint to the other player not more often than this
    SPEED: 12,        // hands moving this fast against each other (units/s) are no handing over
};

/** The reasons (log text) a give is refused. */
export const WHY = {
    primary: 'предмет в основной руке — передаётся только второй (дочерней)',
    empty: 'в руке ничего нет',
    dead: 'отдающий мёртв / без сил',
    busy: 'у принимающего занята вторая рука',
    wrongHand: 'коснулись основной руки принимающего',
    heavy: 'такой предмет двумя руками (щит Protection) не передать',
    spell: 'держится заклинание',
    bound: 'предмет привязан к игроку',
    state: 'принимающий не может принять (мёртв, спит, в дуэли, в Империусе…)',
    gone: 'предмет в руке уже другой',
    late: 'ответ не пришёл вовремя',
    left: 'игрок вышел',
    far: 'руки разошлись',
};

/** Kinds that never pass from hand to hand. */
const NO_PASS = new Set(['mantle', 'robe']);

/**
 * May the thing in my hand be offered? side/off: the hand it is in, my secondary hand.
 * ctx: {dead, spell (a held spell), twoHanded (Protection's both-hands rule)}. Returns null or a WHY key.
 */
export function giveWhy(item, side, off, ctx = {}) {
    if (ctx.dead) return 'dead';
    if (!item) return 'empty';
    if (side !== off) return 'primary';
    if (NO_PASS.has(item.kind) || item.bound) return 'bound';
    if (ctx.twoHanded) return 'heavy';
    if (ctx.spell) return 'spell';
    return null;
}

/** May I (the taker) take it? Returns null or a WHY key. */
export function takeWhy({ rs, off, handFree, canTake = true, reserved = false }) {
    if (!canTake) return 'state';
    if (rs !== off) return 'wrongHand';
    if (!handFree || reserved) return 'busy';
    return null;
}

/**
 * The timer of one touching pair of hands (giver side). update(dt, dist) each frame: dist — distance between the
 * palms in world units, or null (no data / the camera lost a hand). Progress counts only while near; a gap up to
 * GAP (and a lost hand up to LOST) keeps it; apart more than BREAK, or a longer gap, resets it.
 */
export class TouchTimer {
    constructor() { this.t = 0; this.gap = 0; this.lost = 0; this.done = false; }
    reset() { this.t = 0; this.gap = 0; this.lost = 0; this.done = false; }
    get progress() { return Math.min(1, this.t / HANDOVER.HOLD); }
    get active() { return this.t > 0; }
    update(dt, dist) {
        if (this.done) return true;
        if (dist == null) {
            this.lost += dt; this.gap += dt;
            if (this.lost > HANDOVER.LOST || this.gap > HANDOVER.GAP) this.reset();
            return false;
        }
        this.lost = 0;
        if (dist > HANDOVER.BREAK) { this.reset(); return false; }
        if (dist > HANDOVER.NEAR) {
            this.gap += dt;
            if (this.gap > HANDOVER.GAP) this.reset();
            return false;
        }
        // (a gap only counts if the touch was running; it ends when the hands touch again)
        this.gap = 0;
        this.t += dt;
        if (this.t >= HANDOVER.HOLD) this.done = true;
        return this.done;
    }
}

/**
 * One computer's side of the protocol (both roles; the game gives it hooks). hooks:
 *  send(to, msg)            — a reliable message
 *  held()                   — the thing in my secondary hand (item or null)
 *  take(item)               — put it into my hand → true, or false (then slot / feet)
 *  release()                — my hand lets it go → the item
 *  canTake(rs)              — null, or a WHY key (my hand/state)
 *  alive(id)                — is that player still here (optional)
 *  now()                    — seconds
 */
export class HandoverPeer {
    constructor(hooks) {
        this.h = hooks;
        this.ask = null;      // giving: {tid, to, uid, t0}
        this.reserve = null;  // taking: {tid, from, t0}
        this.seq = 0;
        this.log = [];
    }
    note(s) { this.log.push(s); if (this.log.length > 40) this.log.shift(); }

    /** The hold is over: ask the player `to` (whose hand `rs` is touched). false: not started. */
    start(to, rs, id) {
        if (this.ask || this.reserve) return false; // (one at a time; at the same time giving and taking: a refusal — no swap)
        const item = this.h.held();
        if (!item) return false;
        const tid = id + ':' + (++this.seq);
        this.ask = { tid, to, uid: item.uid, t0: this.h.now() };
        this.h.send(to, { k: 'q', tid, kind: item.kind, rs });
        return true;
    }

    /** A message from `from`. Returns {event} for the game (toasts, logs) or null. */
    onMsg(from, m) {
        if (m.k === 'q') {
            const why = this.reserve || this.ask ? 'busy' : this.h.canTake(m.rs);
            if (why) { this.h.send(from, { k: 'a', tid: m.tid, ok: 0, why }); return { event: 'refuse', why }; }
            this.reserve = { tid: m.tid, from, t0: this.h.now() };
            this.h.send(from, { k: 'a', tid: m.tid, ok: 1 });
            return { event: 'reserved' };
        }
        if (m.k === 'a') {
            const A = this.ask;
            if (!A || A.tid !== m.tid || A.to !== from) return null; // (late / foreign answer)
            this.ask = null;
            if (!m.ok) return { event: 'refused', why: m.why || 'busy' };
            const item = this.h.held();
            if (this.h.alive && !this.h.alive(from)) return { event: 'cancel', why: 'left' }; // (gone: the thing stays)
            if (!item || item.uid !== A.uid) { this.h.send(from, { k: 'x', tid: m.tid }); return { event: 'cancel', why: 'gone' }; }
            const out = this.h.release();
            this.h.send(from, { k: 'c', tid: m.tid, item: out });
            return { event: 'given', item: out, to: from };
        }
        if (m.k === 'c') {
            const R = this.reserve;
            if (!R || R.tid !== m.tid || R.from !== from) { // (we did not wait for it: still never lost)
                this.reserve = null;
                return { event: 'taken', item: m.item, into: this.h.take(m.item) ? 'hand' : 'slot' };
            }
            this.reserve = null;
            return { event: 'taken', item: m.item, into: this.h.take(m.item) ? 'hand' : 'slot' };
        }
        if (m.k === 'x') {
            if (this.reserve && this.reserve.tid === m.tid) this.reserve = null;
            return { event: 'cancel' };
        }
        return null;
    }

    /** Time passes: an unanswered give is off (the thing stays), an unused reservation is dropped. */
    tick() {
        const t = this.h.now();
        if (this.ask && t - this.ask.t0 > HANDOVER.ASK_T) { const to = this.ask.to; this.ask = null; return { event: 'cancel', why: 'late', to }; }
        if (this.reserve && t - this.reserve.t0 > HANDOVER.RESERVE_T) { this.reserve = null; }
        return null;
    }

    /** A player left: whatever was with them is off. */
    onLeave(id) {
        if (this.ask?.to === id) this.ask = null;
        if (this.reserve?.from === id) this.reserve = null;
    }

    /** I died / the world changed / my hand's thing changed: all off. */
    abort() { this.ask = null; this.reserve = null; }
}
