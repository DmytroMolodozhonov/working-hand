/**
 * ThreatRank.js — how a creature defends itself when several come at it (the author 19.11: «умная система приоритизации действий NPC в контексте защиты
 * себя самого… кто ближе, кто опаснее, на кого нужно первым отвлекаться… в активном бою может резко поменяться система приоритетов… нападают 2–3 существа,
 * может целая армия, может вообще нужно бежать, даже при том, что он очень сильный»). Pure: no THREE, no game — the game gives the numbers, this gives the decision.
 *
 * Three questions, asked a few times a second (and at once when something new happens):
 *
 *   1. WHO is the danger?  `threatOf` — how much each attacker threatens ME: its power, how soon it reaches me (or already can: a bow, a spell), whether it is
 *      after me or after somebody else, whether it has just hurt me (the damage taken is remembered and fades: `ThreatBook`), whether it is lying down.
 *   2. WHOM do I strike first?  `priorityOf` — the danger, scaled by how well I can do something about it: near and reachable, nearly dead (a kill that takes the
 *      danger away at once), not behind three others. A weak one at my back that I can finish in a blow comes before a strong one far off.
 *   3. WHAT do I do?  `assess` → a stance: 'fight' (strike the first of the list), 'guard' (hold, give ground, face them, shield up — outmatched but not yet
 *      beaten), 'breakout' (surrounded: strike the weak side and go through it), 'flee' (the force against me is more than my courage allows — however strong I
 *      am; an army is not fought alone). The stance has a memory: it changes only when the numbers have really moved (two thresholds, a short dwell), so
 *      nobody dithers at the edge; but a collapse — my health crashing, a great force arriving at once — changes it at the same moment.
 *
 * The same decision serves every fighter: a knight, a wizard, a zombie, a cow (the numbers differ: `power`, `courage`), a hero's servant. Where the creature
 * cannot flee (a servant of a team in the arena of «Битва существ») the stance 'flee' is turned into 'guard' by the caller (`opts.noFlee`).
 *
 * Shapes. me: { x, z, hp (0…1), power, reach, speed, courage (0…1), armor (0…1), allies: [{x, z, power, hp}] }.
 *        attacker: { id, x, z, hp (0…1), power, reach, speed, ranged (m, 0: melee only), aimed (0…1: it is after me), down (bool), airborne (bool), claimed (my friends already on it) }.
 */

export const THREAT = {
    RANGE: 45, // m: attackers farther than this are not counted
    HIT_HALF: 4, // s: half-life of «he hurt me» (the damage taken from one attacker fades)
    RECENT: 2.2, // s: a blow this recent makes the attacker «hot» (it is after me, whatever else is known)
    TTC_HALF: 1.6, // s: how fast the urgency of an attacker falls with the time it needs to reach me
    KEEP: 1.3, // a foe is kept unless a rival's priority is more than this times his
    COMMIT: 1.4, // s: after a voluntary change of foe he is kept at least this long
    EMERGENCY: 1.35, // a rival that is hurting me, near, and this much worse than my foe is taken at once (the commitment is off)
    SURROUND_R: 3.6, // m: this near and in melee → part of the ring
    SURROUND_N: 3, // this many round me (from different sides) is «surrounded»
    GAP: 1.9, // rad: the widest empty arc between the ring's men that counts as a way out
    DWELL: 1.6, // s: a stance is kept at least this long (a crash of the numbers excepted)
    FLEE_BASE: 1.25, // force ratio (mine / theirs) below which the cowardly (courage 0) run
    FLEE_BRAVE: 0.22, // …and the bravest (courage 1): only a hopeless odds make them run
    HOLD_GAP: 1.35, // the ratio must rise this much above the line to stop fleeing / guarding (the second threshold)
    HP_CRASH: 0.22, // my health below this (with a danger near) is a reason to run for all but the bravest
    ALLY_R: 16, // m: allies this near count for me
    ALLY_W: 0.65, // an ally's weight beside my own power
    RALLY: 0.12, // each ally near lifts courage a little (they are not alone)
    CORNER_BOOST: 0.35, // courage added when there is nowhere to run (a cornered beast fights)
};

/** The line of the force ratio under which a creature of this courage runs. */
export const fleeLine = (courage) => THREAT.FLEE_BASE + (THREAT.FLEE_BRAVE - THREAT.FLEE_BASE) * Math.max(0, Math.min(1, courage));

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Memory of the damage taken, by attacker: `hit(id, dmg, now)`, `recent(id, now)` (a damage sum, fading), `last` (the latest hitter). */
export class ThreatBook {
    constructor() { this.m = new Map(); this.last = null; this.lastAt = -1e9; this.lastDmg = 0; }
    hit(id, dmg, now) {
        if (id == null) return;
        const e = this.m.get(id) || { v: 0, t: now, hitAt: now };
        e.v = this._fade(e, now) + Math.max(0, dmg);
        e.t = now; e.hitAt = now;
        this.m.set(id, e);
        this.last = id; this.lastAt = now; this.lastDmg = dmg;
        if (this.m.size > 40) this._trim(now);
    }
    _fade(e, now) { return e.v * Math.pow(0.5, Math.max(0, now - e.t) / THREAT.HIT_HALF); }
    /** The damage taken from `id` lately (faded to now). */
    recent(id, now) { const e = this.m.get(id); return e ? this._fade(e, now) : 0; }
    /** Seconds since `id` last hurt me (Infinity: never). */
    since(id, now) { const e = this.m.get(id); return e ? now - e.hitAt : Infinity; }
    /** The sum over everybody, faded. */
    total(now) { let s = 0; for (const e of this.m.values()) s += this._fade(e, now); return s; }
    _trim(now) { for (const [k, e] of this.m) if (this._fade(e, now) < 0.05) this.m.delete(k); }
    clear() { this.m.clear(); this.last = null; }
}

/** Seconds the attacker needs before it can hurt me (0: it can now). */
export function timeToContact(me, a) {
    const d = Math.hypot(a.x - me.x, a.z - me.z);
    const reach = Math.max(a.reach ?? 1.8, 0.1), rng = a.ranged || 0;
    if (rng > 0 && d <= rng) return 0; // (a bow, a spell: it reaches me from where it stands)
    const gap = Math.max(0, d - Math.max(reach, rng > 0 ? rng * 0.0 : 0) - (me.reach ?? 1.8) * 0.3);
    return gap / Math.max(a.speed ?? 4, 0.5);
}

/** How much `a` threatens me, ≥ 0 (not a probability: a score — only the order and the ratios matter). */
export function threatOf(me, a, book, now) {
    if (a.down) return 0; // (lying: no threat while it lies — it gets up later and is counted again)
    const hp = clamp(a.hp ?? 1, 0.02, 1);
    const ttc = timeToContact(me, a);
    const urgency = 1 / (1 + ttc / THREAT.TTC_HALF);
    const hot = book ? book.since(a.id, now) < THREAT.RECENT : false;
    const aimed = Math.max(a.aimed ?? 0, hot ? 1 : 0);
    const focus = 0.3 + 0.7 * aimed; // (one that is after somebody else is a lesser danger to me)
    const taken = book ? Math.min(2.5, book.recent(a.id, now) / Math.max(1, (me.maxHp ?? 20) * 0.15)) : 0; // (it has hurt me: a share of 15 % of my health = +1)
    const reach = a.airborne && ttc > 0 ? 0.6 : 1; // (out of my reach in the air: but it still threatens)
    return Math.max(0, (a.power ?? 1) * (0.55 + 0.45 * Math.sqrt(hp)) * urgency * focus * reach * (1 + taken));
}

/** How worth striking first `a` is: its threat, scaled by what I can do about it. */
export function priorityOf(me, a, book, now) {
    const th = threatOf(me, a, book, now);
    if (th <= 0) return 0;
    const d = Math.hypot(a.x - me.x, a.z - me.z);
    const hp = clamp(a.hp ?? 1, 0.02, 1);
    const reachable = 1 / (1 + Math.max(0, d - (me.reach ?? 1.8)) / 9); // (the near one first: I can do something about it now)
    const finish = 1 + 0.9 * (1 - hp) * (d < (me.reach ?? 1.8) + 5 ? 1 : 0.4); // (nearly dead and near: one blow takes the danger away)
    const air = a.airborne && (me.ranged ?? 0) <= 0 ? 0.45 : 1; // (a melee fighter cannot do much about one in the air)
    const crowd = 1 / (1 + 0.3 * Math.max(0, (a.claimed ?? 0) - 1)); // (two of my friends are on it already: the others take another — nobody left free while all rush one)
    return th * reachable * finish * air * crowd;
}

/** The ring round me: how many melee attackers stand within SURROUND_R, and the widest empty arc (rad) between them. */
export function ringOf(me, list) {
    const ang = [];
    for (const a of list) {
        if (a.down) continue;
        if ((a.ranged || 0) > 0 && (a.reach ?? 1.8) < 3) continue;
        const d = Math.hypot(a.x - me.x, a.z - me.z);
        if (d <= THREAT.SURROUND_R) ang.push(Math.atan2(a.z - me.z, a.x - me.x));
    }
    if (ang.length < 2) return { n: ang.length, gap: Math.PI * 2, gapAt: 0 };
    ang.sort((x, y) => x - y);
    let gap = 0, gapAt = 0;
    for (let i = 0; i < ang.length; i++) {
        const next = i + 1 < ang.length ? ang[i + 1] : ang[0] + Math.PI * 2;
        const g = next - ang[i];
        if (g > gap) { gap = g; gapAt = ang[i] + g / 2; }
    }
    return { n: ang.length, gap, gapAt };
}

/** My strength with the help near me. */
export function myStrength(me) {
    const hp = clamp(me.hp ?? 1, 0.03, 1);
    let s = (me.power ?? 1) * Math.pow(hp, 0.7) * (0.75 + 0.25 * clamp(me.armor ?? 0, 0, 1) * 2);
    for (const al of me.allies || []) {
        const d = Math.hypot(al.x - me.x, al.z - me.z);
        if (d > THREAT.ALLY_R) continue;
        s += THREAT.ALLY_W * (al.power ?? 1) * Math.pow(clamp(al.hp ?? 1, 0.03, 1), 0.7) * (1 - 0.5 * d / THREAT.ALLY_R);
    }
    return s;
}

/** The force against me: everybody coming, the near ones in full, the far ones as they get here. */
export function theirStrength(me, list) {
    let s = 0;
    for (const a of list) {
        if (a.down) continue;
        const ttc = timeToContact(me, a);
        const w = clamp(1 - ttc / 7, 0.12, 1) * (0.5 + 0.5 * (a.aimed ?? 0.5));
        s += (a.power ?? 1) * Math.pow(clamp(a.hp ?? 1, 0.03, 1), 0.5) * w;
    }
    return s;
}

/**
 * The whole decision, no memory (`ThreatMind.think` adds it). → { order: [{id, threat, priority}] (best first), foe, ratio, danger (0…1), ring, stance (the raw one),
 * escape: {x, z} (a unit vector away from the force), surrounded, force: {mine, theirs} }.
 */
export function assess(me, list, book, now, opts = {}) {
    const near = list.filter((a) => Math.hypot(a.x - me.x, a.z - me.z) <= THREAT.RANGE);
    const order = near.map((a) => ({ id: a.id, threat: threatOf(me, a, book, now), priority: priorityOf(me, a, book, now), a })).filter((e) => e.priority > 0);
    order.sort((x, y) => y.priority - x.priority);
    const mine = myStrength(me), theirs = theirStrength(me, near);
    const ratio = theirs > 1e-4 ? mine / theirs : 99;
    const ring = ringOf(me, near);
    const surrounded = ring.n >= THREAT.SURROUND_N && ring.gap < THREAT.GAP;
    // where to run: away from the weighted force (the nearer and the stronger, the heavier), pulled a little towards the allies
    let ex = 0, ez = 0;
    for (const e of order) {
        const dx = me.x - e.a.x, dz = me.z - e.a.z, d = Math.hypot(dx, dz) || 1;
        ex += (dx / d) * e.threat / (1 + d * 0.08); ez += (dz / d) * e.threat / (1 + d * 0.08);
    }
    for (const al of me.allies || []) {
        const dx = al.x - me.x, dz = al.z - me.z, d = Math.hypot(dx, dz);
        if (d > 2 && d < 40) { ex += (dx / d) * 0.25 * (al.power ?? 1); ez += (dz / d) * 0.25 * (al.power ?? 1); }
    }
    const el = Math.hypot(ex, ez) || 1;
    const escape = { x: ex / el, z: ez / el };
    const cornered = !!(opts.blocked && opts.blocked(me.x + escape.x * 6, me.z + escape.z * 6));
    const danger = clamp(1 - Math.exp(-order.reduce((s, e) => s + e.threat, 0) / Math.max(0.5, mine)), 0, 1);
    return { order, foe: order.length ? order[0].id : null, ratio, danger, ring, surrounded, escape, cornered, force: { mine, theirs }, n: order.length };
}

/**
 * One creature's mind: the foe it holds, its stance, the dwell times. `think(me, attackers, book, now, opts)` → { foe, stance, changed (foe), stanceChanged,
 * emergency, escape, why, a } — call a few times a second, and at once on a blow (`opts.event: 'hit'`).
 * opts: noFlee (a servant of a team: never runs), blocked(x, z) (is that place a wall/water: nowhere to run), courage (overrides me.courage).
 */
export class ThreatMind {
    constructor() { this.foe = null; this.foeSince = -1e9; this.foeFrom = -1e9; this.stance = 'fight'; this.stanceSince = -1e9; this.last = null; }

    think(me, list, book, now, opts = {}) {
        const T = THREAT;
        const A = assess(me, list, book, now, opts);
        this.last = A;
        // ---- the foe: keep the one I have unless a rival is clearly better (or hurting me now and far worse)
        const cur = this.foe != null ? A.order.find((e) => e.id === this.foe) : null;
        const best = A.order[0] || null;
        let foe = cur ? cur.id : null, why = '', emergency = false;
        if (!best) { foe = null; }
        else if (!cur) { foe = best.id; why = 'новая цель'; }
        else if (best.id !== cur.id) {
            const hurting = book ? book.since(best.id, now) < T.RECENT : false;
            const nearBest = Math.hypot(best.a.x - me.x, best.a.z - me.z) < (me.reach ?? 1.8) + 5;
            if (hurting && nearBest && best.priority > cur.priority * T.EMERGENCY) { foe = best.id; emergency = true; why = 'бьёт меня — важнее'; }
            else if (now - this.foeFrom >= T.COMMIT && best.priority > cur.priority * T.KEEP) { foe = best.id; why = 'опаснее / удобнее'; }
            else if (cur.priority <= 0) { foe = best.id; why = 'прежняя цель выбыла'; }
        }
        const changed = foe !== this.foe;
        if (changed) { this.foe = foe; this.foeSince = now; if (foe != null) this.foeFrom = now; }
        // ---- the stance: two thresholds and a dwell
        const courage = clamp((opts.courage ?? me.courage ?? 0.5) + Math.min(0.3, (me.allies || []).filter((al) => Math.hypot(al.x - me.x, al.z - me.z) < T.ALLY_R).length * T.RALLY) + (A.cornered ? T.CORNER_BOOST : 0), 0, 1);
        const line = fleeLine(courage);
        const hp = clamp(me.hp ?? 1, 0, 1);
        let want = this.stance;
        const hpCrash = hp < T.HP_CRASH && A.danger > 0.35 && courage < 0.9;
        if (A.n === 0) want = 'fight';
        else if (A.surrounded && A.ratio >= line * 0.6) want = 'breakout';
        else if (A.ratio < line || hpCrash) want = 'flee';
        else if (A.ratio < line * T.HOLD_GAP) want = this.stance === 'flee' ? 'flee' : 'guard'; // (between the lines: no flip at the edge)
        else want = 'fight';
        if (this.stance === 'flee' && want !== 'flee' && A.ratio < line * T.HOLD_GAP && !hpCrash) want = 'flee'; // (stops running only when it has clearly turned)
        if (want === 'flee' && (A.cornered || opts.noFlee)) want = A.cornered && !opts.noFlee ? 'breakout' : 'guard'; // (nowhere to run, or it may not run: it fights on, hard)
        // a collapse is at once; anything else waits out the dwell
        const crash = want === 'flee' && (hpCrash || A.ratio < line * 0.5);
        let stanceChanged = false;
        if (want !== this.stance && (crash || now - this.stanceSince >= T.DWELL)) { this.stance = want; this.stanceSince = now; stanceChanged = true; }
        return { foe: this.foe, stance: this.stance, changed, stanceChanged, emergency, escape: A.escape, why, a: A, courage, line };
    }

    reset() { this.foe = null; this.stance = 'fight'; this.stanceSince = -1e9; this.foeFrom = -1e9; this.last = null; }
}

/** A short line for the log: who is first, the stance, the odds. */
export function describe(d) {
    const a = d.a || {};
    return `${d.stance}: цель ${d.foe ?? '—'}${d.why ? ' (' + d.why + ')' : ''}, соотношение сил ${a.ratio != null ? Math.min(99, a.ratio).toFixed(2) : '?'}, нападают ${a.n ?? 0}${a.surrounded ? ', окружён' : ''}${a.cornered ? ', некуда бежать' : ''}`;
}

// ------------------------------------------------------------------ what the kinds of creatures are worth (the numbers the game cannot read off a body)
/** Rough power (1 = an ordinary armed man), reach, speed and the range of its ranged attack, by kind — for the creatures that have no better number. */
export const KINDS = {
    zombie: { power: 0.4, reach: 1.9, speed: 4.2, ranged: 0 },
    cow: { power: 0.3, reach: 2.2, speed: 5, ranged: 0 }, pig: { power: 0.2, reach: 1.8, speed: 5, ranged: 0 }, sheep: { power: 0.18, reach: 1.8, speed: 5, ranged: 0 },
    horse: { power: 0.55, reach: 2.4, speed: 9, ranged: 0 },
    knight: { power: 1, reach: 2.4, speed: 5.5, ranged: 0 }, villager: { power: 0.35, reach: 1.8, speed: 4.5, ranged: 0 },
    novice: { power: 0.45, reach: 1.8, speed: 4.5, ranged: 18 }, wizard: { power: 0.9, reach: 1.8, speed: 4.5, ranged: 24 }, archmage: { power: 1.7, reach: 1.8, speed: 5, ranged: 28 },
    supermage: { power: 3.6, reach: 1.8, speed: 6, ranged: 34 }, savior: { power: 2.6, reach: 1.8, speed: 8, ranged: 34 },
    fire: { power: 1.5, reach: 2, speed: 5.5, ranged: 24 }, water: { power: 1.3, reach: 2, speed: 5, ranged: 24 }, earth: { power: 1.5, reach: 2, speed: 4.5, ranged: 22 }, air: { power: 1.5, reach: 2, speed: 7, ranged: 22 },
    player: { power: 0.9, reach: 2.6, speed: 6, ranged: 14 }, dragon: { power: 7, reach: 9, speed: 14, ranged: 30 }, spider: { power: 3, reach: 4, speed: 7, ranged: 0 },
};
export const kindProfile = (kind) => KINDS[kind] || KINDS.villager;

/** The courage of a kind of fighter (0 coward … 1 would not run): the king's guard and knights are brave, a pupil is not, a beast runs when hurt. */
export const COURAGE = { knight: 0.72, king: 0.55, villager: 0.1, novice: 0.2, wizard: 0.45, archmage: 0.7, supermage: 0.9, savior: 0.8, fire: 0.7, water: 0.6, earth: 0.7, air: 0.6, zombie: 1, cow: 0.2, pig: 0.15, sheep: 0.1, horse: 0.35, player: 0.5 };
export const courageOf = (kind) => COURAGE[kind] ?? 0.4;
