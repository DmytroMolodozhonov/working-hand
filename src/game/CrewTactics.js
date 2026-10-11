/**
 * CrewTactics.js — how a group fights (pure, Node-testable): a ship's crew on its deck, the knights
 * of a castle, anybody who fights together.
 *
 * Against a group: the men share the foes out (shareFoes) — every foe gets his share of them, none
 * is left free while all rush one; a man stays on his foe while that foe has no more than his share
 * (no running back and forth); one hurting them more (at the wheel, say) gets a bigger share.
 * Against one foe (each foe of a group the same way):
 * A crowd can't swing cutlasses at one man all at once: they would cut each other. So:
 *   - at most two go at him at a time (one where the deck is narrow), from different sides;
 *   - the two take turns: one swings, steps back, the other swings — never both together;
 *   - the rest stand round in a ring a few metres off, blades up, waiting for their turn;
 *   - a man who has fought a while, or is hurt, steps back into the ring and the next one goes in;
 *   - the captain stays back and gives orders — he fights himself only when his men are (nearly) gone,
 *     or when the foe is right on him.
 * Everything is in the ship's own frame (x: starboard, z: aft).
 */

export const TACTICS = {
    MAX_ENGAGE: 2, // how many fight him at once
    TURN: 8, // s: one man's turn in front, then another takes his place (if one waits)
    REST: 4, // s: one who just stepped back waits at least this long before going in again
    HURT: 0.4, // hp share: below it a man steps back (if somebody can take his place)
    RING: 4.8, // m: where the waiting ones stand round the foe
    RING_CAPT: 7, // m: …and the captain
    STANDOFF: 1.7, // m: from the foe, where a swing starts
    REACH: 2.6, // m: a cutlass reaches this far (the foe stepped back further: the blade cuts the air)
    BACKOFF: 2.9, // m: where one steps back to after a swing
    SWING: 0.6, // s: one swing (the model's ATTACK_PERIOD)
    HIT_AT: 0.3, // s: the blade comes down at this moment of the swing
    GAP: 0.75, // s: the least time between two swings of the crew (they take turns)
    FLANK: 1.65, // rad: the second one comes at him from the side, not from behind the first
    CLEAR: 0.6, // rad: the ring keeps clear of the fighters' lines
};

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); };
const bearing = (f, foe) => Math.atan2(f.l.z - foe.z, f.l.x - foe.x);
const dist = (f, foe) => Math.hypot(f.l.x - foe.x, f.l.z - foe.z);

/** A point `r` m from the foe along bearing `a` (ship frame). */
export function spotAt(foe, a, r) { return { x: foe.x + Math.cos(a) * r, z: foe.z + Math.sin(a) * r }; }

/**
 * Who goes at the foe now and where everybody stands.
 * fighters: [{id, idx, role, l: {x, z}, hp, maxHp, busy?}] — the crew after this foe that can fight
 *   (not lying, not in the water); `busy`: in the middle of a swing (never pulled out of it).
 * foe: {x, z}. now: seconds. opts.fits(x, z) → can one stand there (on this deck, inside the rails);
 * opts.max: how many at once (default MAX_ENGAGE).
 * Each fighter gets f.tac = {role: 'engage'|'wait', slot (bearing from the foe, rad), r (m), since, restUntil}.
 * Returns {engage, wait, swaps: [{out, in}]} (swaps: one stepped back, another took his place).
 */
export function assignRoles(fighters, foe, now, opts = {}) {
    const T = TACTICS;
    const fits = opts.fits || (() => true);
    const max = Math.max(1, opts.max ?? T.MAX_ENGAGE);
    for (const f of fighters) if (!f.tac) f.tac = { role: 'wait', slot: bearing(f, foe), r: T.RING, since: now, restUntil: 0 };
    const men = fighters.filter((f) => f.role !== 'captain').length;
    // the captain commands from behind while he has men to send
    const eligible = (f) => f.role !== 'captain' || men < 2 || dist(f, foe) < T.STANDOFF + 0.6;
    const hurt = (f) => f.hp < f.maxHp * T.HURT;
    const ready = fighters.filter((f) => f.tac.role !== 'engage' && eligible(f) && now >= f.tac.restUntil);
    const swaps = [];
    const out = [];
    let engage = [];
    for (const f of fighters) {
        if (f.tac.role !== 'engage') continue;
        if (!eligible(f)) { out.push(f); continue; }
        // his turn is over (or he is hurt) and somebody fresh can take his place — unless he is mid-swing
        const spare = ready.some((o) => !hurt(o));
        if (!f.busy && spare && (hurt(f) || now - f.tac.since > T.TURN)) { out.push(f); continue; }
        engage.push(f);
    }
    // too many in front (the deck got narrower): the farthest steps back
    engage.sort((a, b) => dist(a, foe) - dist(b, foe));
    while (engage.length > max) { const f = engage.findLast((x) => !x.busy) || engage[engage.length - 1]; engage.splice(engage.indexOf(f), 1); out.push(f); }
    for (const f of out) { f.tac.role = 'wait'; f.tac.since = now; f.tac.restUntil = now + T.REST; }
    // fill the places: the nearest of the fresh ones (the hurt only if nobody else)
    const pool = ready.filter((f) => !out.includes(f)).sort((a, b) => (dist(a, foe) + (hurt(a) ? 50 : 0)) - (dist(b, foe) + (hurt(b) ? 50 : 0)));
    let k = 0;
    while (engage.length < max && pool.length) {
        const f = pool.shift();
        f.tac.role = 'engage'; f.tac.since = now;
        engage.push(f);
        if (out[k]) swaps.push({ out: out[k++], in: f });
    }
    // nobody rested enough and nobody fights: the nearest goes anyway
    if (!engage.length) {
        const f = fighters.filter(eligible).sort((a, b) => dist(a, foe) - dist(b, foe))[0];
        if (f) { f.tac.role = 'engage'; f.tac.since = now; engage.push(f); }
    }
    // where the fighters come from: the first from where he is; the second from the side
    // (the one who went in first keeps his line; the steady order stops them swapping places)
    const order = [...engage].sort((a, b) => a.tac.since - b.tac.since || (a.idx ?? 0) - (b.idx ?? 0));
    if (order.length) {
        const a0 = bearing(order[0], foe);
        order[0].tac.slot = fits(...xz(spotAt(foe, a0, T.STANDOFF))) ? a0 : bestFit(foe, a0, T.STANDOFF, fits);
        order[0].tac.r = T.STANDOFF;
        for (let i = 1; i < order.length; i++) {
            const f = order[i], mine = bearing(f, foe), base = order[0].tac.slot;
            // (from the side if there is room; else from the other end; only then closer to the first)
            let pick = null;
            for (const set of [[base + T.FLANK, base - T.FLANK], [base + Math.PI], [base + T.FLANK * 0.6, base - T.FLANK * 0.6]]) {
                const ok = set.filter((a) => fits(...xz(spotAt(foe, a, T.STANDOFF)))).sort((p, q) => angDiff(p, mine) - angDiff(q, mine));
                if (ok.length) { pick = ok[0]; break; }
            }
            f.tac.slot = pick ?? base + T.FLANK;
            f.tac.r = T.STANDOFF;
        }
    }
    // the ring: free places round the foe, clear of the fighters' lines, each man the nearest to him
    const wait = fighters.filter((f) => !engage.includes(f));
    for (const f of wait) f.tac.role = 'wait';
    const taken = engage.map((f) => f.tac.slot);
    wait.sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
    for (const f of wait) {
        const r = f.role === 'captain' ? T.RING_CAPT : T.RING;
        const mine = bearing(f, foe);
        let best = null, bs = Infinity;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU - Math.PI;
            if (taken.some((t) => angDiff(a, t) < T.CLEAR)) continue;
            let rr = r;
            // (where the deck is too narrow for the ring: a little closer or further along)
            if (!fits(...xz(spotAt(foe, a, rr)))) { rr = r * 0.75; if (!fits(...xz(spotAt(foe, a, rr)))) { rr = r * 1.35; if (!fits(...xz(spotAt(foe, a, rr)))) continue; } }
            const sc = angDiff(a, mine) + Math.abs(rr - r) * 0.2;
            if (sc < bs) { bs = sc; best = { a, rr }; }
        }
        if (best) { f.tac.slot = best.a; f.tac.r = best.rr; taken.push(best.a); } else { f.tac.slot = mine; f.tac.r = r; }
    }
    return { engage, wait, swaps };
}

/** A swing may start now: no other of the crew is swinging at this foe, and the last swing was a moment ago. */
export function canSwing(fighters, f, now, lastSwing = -1e9) {
    if (now - lastSwing < TACTICS.GAP) return false;
    return !fighters.some((o) => o !== f && o.busy);
}

/** The best of the standing spots round the foe near bearing `a` (the deck may not have room everywhere). */
function bestFit(foe, a, r, fits) {
    for (let k = 1; k <= 8; k++) for (const s of [1, -1]) { const b = a + s * k * 0.35; if (fits(...xz(spotAt(foe, b, r)))) return b; }
    return a;
}

const xz = (p) => [p.x, p.z];

/**
 * Who goes for whom when a group fights a group.
 * fighters: [{id, x, z, foe}] (foe: the one he fights now, or null); foes: [{id, x, z, w?}] (w: how
 * dangerous, 1 by default). opts.reach: a man is never sent to a foe farther than this (m) unless
 * that one is already his. Returns a Map fighter id → foe id (a man with no foe in reach: not in it).
 */
export function shareFoes(fighters, foes, opts = {}) {
    const out = new Map();
    if (!fighters.length || !foes.length) return out;
    const reach = opts.reach ?? Infinity;
    const d = (f, e) => Math.hypot(f.x - e.x, f.z - e.z);
    const N = fighters.length, M = foes.length;
    // the shares: by weight (largest remainders); while there are enough men, everybody gets one
    const W = foes.reduce((a, e) => a + (e.w ?? 1), 0) || 1;
    let cx = 0, cz = 0;
    for (const f of fighters) { cx += f.x; cz += f.z; }
    cx /= N; cz /= N;
    const q = foes.map((e) => { const x = (N * (e.w ?? 1)) / W; return { e, n: Math.floor(x), r: x - Math.floor(x), near: Math.hypot(e.x - cx, e.z - cz) }; });
    let left = N - q.reduce((a, x) => a + x.n, 0);
    for (const x of [...q].sort((a, b) => b.r - a.r || a.near - b.near)) { if (left <= 0) break; x.n++; left--; }
    if (N >= M) {
        for (const x of q) {
            if (x.n > 0) continue;
            const rich = q.filter((y) => y.n > 1).sort((a, b) => b.n - a.n)[0];
            if (rich) { rich.n--; x.n = 1; }
        }
    }
    const quota = new Map(q.map((x) => [x.e.id, x.n]));
    const byId = new Map(foes.map((e) => [e.id, e]));
    // a man keeps his foe while that foe is not over his share (the nearest ones keep him)
    const free = [];
    for (const e of foes) {
        const mine = fighters.filter((f) => f.foe === e.id).sort((a, b) => d(a, e) - d(b, e));
        const n = quota.get(e.id);
        mine.forEach((f, i) => { if (i < n) out.set(f.id, e.id); else free.push(f); });
        quota.set(e.id, Math.max(0, n - mine.length));
    }
    for (const f of fighters) if (!out.has(f.id) && !free.includes(f)) free.push(f);
    // the others: each to the nearest foe still short of men (the nearest pairs first)
    while (free.length) {
        let best = null;
        for (const f of free) for (const e of foes) {
            if (!(quota.get(e.id) > 0)) continue;
            const dd = d(f, e);
            if (dd > reach && f.foe !== e.id) continue;
            if (!best || dd < best.dd) best = { f, e, dd };
        }
        if (!best) break;
        out.set(best.f.id, best.e.id);
        quota.set(best.e.id, quota.get(best.e.id) - 1);
        free.splice(free.indexOf(best.f), 1);
    }
    // more men than places in reach: the rest go for the nearest foe they can reach (or keep theirs)
    for (const f of free) {
        let best = null, bd = Infinity;
        for (const e of foes) { const dd = d(f, e); if ((dd <= reach || f.foe === e.id) && dd < bd) { bd = dd; best = e; } }
        if (best) out.set(f.id, best.id);
        else if (f.foe && byId.has(f.foe)) out.set(f.id, f.foe);
    }
    return out;
}
