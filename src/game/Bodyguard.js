/**
 * Bodyguard.js — the king's knights guard the player who took the castle.
 *
 * Who guards: the knights who walk after the owner (`follow_me`, `gather_army`: `v.follow` = the owner), the
 * ones told «охраняй меня» (`guard_me`: strict — no wandering off after strangers), and — with no order at all —
 * the nearest awake knights of the castle while the owner is on its land and something is at him (helpers).
 *
 *  1. Whoever attacks the owner is the FIRST thing to deal with (above any hunt for random enemies); a creature
 *     that hit him gets a mark («враг игрока») and is finished while it is alive and not lost from sight.
 *  2. On the way they keep a formation round him (two ahead, one at each side, one behind, the rest in an outer
 *     ring): 3–6 m, never in his way, the bodies kept apart by `crowdStep`.
 *  3. They see a threat before it strikes (a day's / night's sight by line of sight, a hearing range without it)
 *     and go to meet it.
 *  4. Hurt (< 40 % HP) → a closer ring and the fight stays near him.
 *  5. The owner is never their target, whatever happens (a shove, a blast, «Брейнрот»…): `isLord`.
 *  A dragon is not fought recklessly: they close up round the owner with the shields up (`cover`).
 *
 * Pure rules at the top (Node-tested: tests/unit/bodyguard.test.js); the class works on the host only
 * (the host moves the knights; the guests see them — and tell their orders to the host: `vord`).
 */

export const GUARD = {
    RING: 4.5, // m: the formation's radius
    RING_HURT: 3, // m: …with the owner hurt
    OUTER: 3.5, // m: the outer ring is this much farther (the front pair is pushed out 1.2 while walking: they never touch)
    WOUNDED: 0.4, // hp share
    SIGHT_DAY: 40, // m: a threat is seen this far (line of sight)
    SIGHT_NIGHT: 22,
    HEAR: 12, // m: heard without seeing
    HIT_NEAR: 4.5, // m: a creature this close when the owner is hit is the one who hit him
    LEASH: 34, // m: a free follower goes this far from the owner after a threat
    LEASH_HURT: 12, // m: …with the owner hurt
    LEASH_STRICT: 16, // m: …under «охраняй меня»
    HELP_R: 70, // m: a knight of the castle this near runs to help the owner on the castle's land
    HELP_S: 8, // s: a helper goes back to his life this long after the owner is safe
    MARK_S: 8, // s: a marked creature is chased this long after it was lost from sight
    ON_FOE: 3, // at most this many on one creature that is at the owner
    ON_FAR: 2, // …on one that only comes
    TALK_S: 6,
};

const TAU = Math.PI * 2;
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** The owner's own men never take him for an enemy (his men: follow him, guard him, or serve his castle). */
export function isLord(v, pid, ownerOfCastle = null) {
    if (pid == null) return false;
    return v.follow === pid || v.gOwner === pid || ownerOfCastle === pid;
}

/** Is it a hurt owner (below WOUNDED of his health)? */
export function isHurt(hp, max) {
    return Number.isFinite(hp) && max > 0 && hp / max < GUARD.WOUNDED;
}

/** The sight a guard has on the owner's side. */
export function sightOf(night) { return night ? GUARD.SIGHT_NIGHT : GUARD.SIGHT_DAY; }

/**
 * Slots of the formation round the owner (world x, z), `n` of them. `head` is where he walks (rad, atan2 of
 * dz, dx): two ahead (a little to the sides), one at each side, one behind, the rest in an outer ring.
 * Moving: the front pair is pushed out a bit so that they do not stand in his way.
 */
export function guardSlots(m, head, n, { hurt = false, moving = false } = {}) {
    const R = hurt ? GUARD.RING_HURT : GUARD.RING;
    const out = [];
    const base = [
        [0.4, R + (moving ? 1.2 : 0)], [-0.4, R + (moving ? 1.2 : 0)],
        [Math.PI / 2, R], [-Math.PI / 2, R],
        [Math.PI, R],
    ];
    for (let i = 0; i < n; i++) {
        let a, r;
        if (i < base.length) [a, r] = base[i];
        else {
            const k = i - base.length, m2 = Math.max(1, n - base.length);
            a = head + Math.PI / m2 * 0.5 + (k / m2) * TAU; r = R + (hurt ? 1.5 : GUARD.OUTER);
            out.push({ x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r, a, r });
            continue;
        }
        a += head;
        out.push({ x: m.x + Math.cos(a) * r, z: m.z + Math.sin(a) * r, a, r });
    }
    return out;
}

/** Each guard the nearest free slot (greedy, the closest pair first): nobody crosses the others' ways. Returns slot per guard. */
export function matchSlots(guards, slots) {
    const pairs = [];
    guards.forEach((g, i) => slots.forEach((s, j) => pairs.push([Math.hypot(g.x - s.x, g.z - s.z), i, j])));
    pairs.sort((a, b) => a[0] - b[0]);
    const gi = new Set(), sj = new Set(), res = new Array(guards.length).fill(null);
    for (const [, i, j] of pairs) {
        if (gi.has(i) || sj.has(j)) continue;
        gi.add(i); sj.add(j); res[i] = slots[j];
        if (gi.size === guards.length) break;
    }
    return res;
}

/**
 * Who goes at which threat (pure). guards: [{x, z, strict}], threats: [{key, x, z, hits, dMaster, kind}],
 * owner {x, z, hurt}. Returns an array parallel to guards: the threat or null.
 * Priority: the ones that are AT the owner (hits) before any other; then the nearest to him. A guard takes
 * the best threat by (priority + distance to him + how many already go at it); a threat gets no more than
 * ON_FOE / ON_FAR. A dragon gets no attackers (they cover). A hurt owner keeps one guard at his side.
 */
export function assignFoes(guards, threats, owner) {
    const res = new Array(guards.length).fill(null);
    if (!guards.length || !threats.length) return res;
    const load = new Map();
    const order = guards.map((g, i) => i);
    // (the nearest to the threats first: they take them, the far ones stay in formation)
    const best = (g) => Math.min(...threats.map((t) => Math.hypot(g.x - t.x, g.z - t.z)));
    order.sort((a, b) => best(guards[a]) - best(guards[b]));
    const keep = owner.hurt && guards.length >= 3 ? 1 : 0; // (the hurt owner never stands alone)
    let free = guards.length - keep;
    for (const gi of order) {
        if (free <= 0) break;
        const g = guards[gi];
        let bt = null, bs = Infinity;
        for (const t of threats) {
            if (t.kind === 'D') continue; // (not at a dragon with swords: cover)
            const leash = owner.hurt ? GUARD.LEASH_HURT : g.strict ? GUARD.LEASH_STRICT : GUARD.LEASH;
            if (!t.hits && t.dMaster > leash) continue;
            const cap = t.hits ? GUARD.ON_FOE : GUARD.ON_FAR;
            const l = load.get(t.key) || 0;
            if (l >= cap) continue;
            const s = (t.hits ? 0 : 60) + t.dMaster + 0.5 * Math.hypot(g.x - t.x, g.z - t.z) + l * 14;
            if (s < bs) { bs = s; bt = t; }
        }
        if (bt) { res[gi] = bt; load.set(bt.key, (load.get(bt.key) || 0) + 1); free--; }
    }
    return res;
}

/** The threats in order of priority (those at the owner first, then near him). */
export function rankThreats(list) {
    return list.slice().sort((a, b) => (b.hits - a.hits) || (a.dMaster - b.dMaster));
}

const SHOUT = ['Король в опасности!', 'Защитить государя!', 'К королю!', 'Не подпускать их к королю!'];
const _p = { x: 0, y: 0, z: 0 };

export class Bodyguard {
    constructor(life) {
        this.life = life;
        this.marks = new Map(); // owner id -> Map(key -> {until, hits})
        this.hurt = new Map(); // owner id -> {t, by, kind}
        this.state = new Map(); // owner id -> {x, z, head, t, moving}
        this._t = 0;
        this._shoutT = 0;
        this._lastHp = new Map();
    }

    get game() { return this.life.game; }

    // ------------------------------------------------------------ the owner
    _hp(owner) {
        const g = this.game;
        if (owner === g.localId) return g.combat?.enabled ? { hp: g.combat.hp, max: g.combat.maxHp || 100 } : { hp: 1, max: 1 };
        const r = g.remotes?.get(owner);
        return r && r.hp != null ? { hp: r.hp, max: 100 } : { hp: 1, max: 1 };
    }

    /** (host) The owner got hurt (Combat.damage of the local player): who did it, if known. */
    masterHurt(owner, byId, kind) {
        this.hurt.set(owner, { t: performance.now(), by: byId ?? null, kind: kind || null });
    }

    _heading(owner, mp, dt) {
        let s = this.state.get(owner);
        if (!s) { s = { x: mp.x, z: mp.z, head: 0, t: 0, moving: false, speed: 0 }; this.state.set(owner, s); }
        s.t += dt;
        if (s.t >= 0.4) {
            const dx = mp.x - s.x, dz = mp.z - s.z, d = Math.hypot(dx, dz);
            s.speed = d / s.t;
            s.moving = s.speed > 1.2;
            if (s.moving) s.head = Math.atan2(dz, dx);
            s.x = mp.x; s.z = mp.z; s.t = 0;
        }
        return s;
    }

    // ------------------------------------------------------------ threats
    /** Everything at the owner / near him that a guard should deal with: [{key, kind, id, obj, x, y, z, hits, dMaster}]. */
    threats(owner, mp, night) {
        const g = this.game, life = this.life, now = performance.now();
        const sight = sightOf(night);
        const out = [];
        const marks = this.marks.get(owner) || this.marks.set(owner, new Map()).get(owner);
        const hurtNow = this.hurt.get(owner);
        const justHit = hurtNow && now - hurtNow.t < 1500;
        let looked = 0;
        const add = (kind, id, obj, p, atMe) => {
            const key = kind + ':' + id;
            const dM = hyp(p, mp);
            let m = marks.get(key);
            if (atMe) m = { until: now + GUARD.MARK_S * 1000 };
            else if (justHit && kind !== 'p' && dM < GUARD.HIT_NEAR && (!m || m.until < now)) m = { until: now + GUARD.MARK_S * 1000 };
            const seen = atMe || dM < GUARD.HEAR || (dM < sight && looked++ < 6 && this._lineOk(mp, p));
            if (m && seen) m.until = now + GUARD.MARK_S * 1000;
            if (m) marks.set(key, m);
            const hits = !!m && m.until > now;
            if (!hits && !seen) return;
            out.push({ key, kind, id, obj, x: p.x, y: p.y ?? mp.y, z: p.z, hits, dMaster: dM });
        };
        for (const z of g.zombies || []) {
            if (z.isDead || z.isDying || (z.isThrall && z.thrallOwner === owner)) continue;
            const p = z.group.position;
            if (Math.abs(p.x - mp.x) > sight + 2 || Math.abs(p.z - mp.z) > sight + 2) continue;
            add('z', z.id, z, p, false);
        }
        for (const a of g.animals?.list || []) {
            if (a.dead || a.servantOf === owner) continue;
            if (a.state === 'attack' && a.attacker === owner) add('a', a.id, a, a.group.position, true);
        }
        for (const s of g.spiders?.list || []) if (!s.dead && s.target === owner) add('s', s.id, s, s.model.position, true);
        for (const d of g.dragons?.list || []) if (!d.dead && d.target === owner) add('D', d.id, d, d.model.position, true);
        for (const c of g.iceCastle?.list || []) if (!c.dead && c.target?.id === owner) add('I', c.id, c, c.model.position, true);
        for (const v of life.byId.values()) {
            // (a knight / a wizard of another place who goes at the owner; never our own, never a servant of his)
            if (v.dead || v.foe !== owner || v.servantOf === owner || isLord(v, owner, life.state(v.cs.def.id).owner)) continue;
            _p.x = v.x; _p.y = v.y; _p.z = v.z;
            add('v', v.id, v, _p, true);
        }
        // a player who hit him (PvP): the knights take him as an enemy of the castle (the usual fight)
        if (justHit && hurtNow.by != null && hurtNow.by !== owner && life._isPlayer(hurtNow.by)) {
            const pp = life._playerPos(hurtNow.by);
            if (pp) add('p', hurtNow.by, null, pp, true);
        } else for (const [key, m] of marks) if (key.startsWith('p:') && m.until > now) {
            const pid = key.slice(2), pp = life._playerPos(pid);
            if (pp) add('p', pid, null, pp, false);
        }
        // the dead and the lost are forgotten
        for (const [key, m] of marks) if (m.until < now - 1000) marks.delete(key);
        return rankThreats(out);
    }

    _lineOk(mp, p) {
        const c = this.game.collision;
        return c?.lineOfSight ? c.lineOfSight(mp.x, mp.y + 1.5, mp.z, p.x, (p.y ?? mp.y) + 1, p.z, 0.6) : true;
    }

    // ------------------------------------------------------------ each frame (host)
    /** Who guards whom, who goes at which threat, where each one stands. Once a frame, before the people think. */
    update(dt) {
        const life = this.life, g = this.game;
        this._t -= dt;
        this._shoutT -= dt;
        if (this._t > 0) return;
        this._t = 0.3;
        const now = performance.now();
        // 1. the guards of every owner
        const byOwner = new Map();
        for (const cs of life.castles.values()) {
            if (!cs.awake) continue;
            const owner = life.state(cs.def.id).owner;
            for (const v of cs.active.values()) {
                if (v.dead || !life._fights(v) || v.role === 'king') { v.gOwner = null; continue; }
                const sworn = v.follow != null && v.followFar && (v.follow === owner || v.guard);
                if (sworn) { v.gOwner = v.follow; v.gHelp = 0; }
                else if (!(v.gHelp > now)) { v.gOwner = null; v.gFoe = null; v.guardOrder = null; continue; }
                (byOwner.get(v.gOwner) || byOwner.set(v.gOwner, []).get(v.gOwner)).push(v);
            }
        }
        // 2. the owners with nobody sworn: the knights of their castle run to help if they are attacked on its land
        for (const cs of life.castles.values()) {
            if (!cs.awake) continue;
            const owner = life.state(cs.def.id).owner;
            if (owner == null) continue;
            const mp = life._playerPos(owner);
            if (!mp || !life._inLand(cs.def, mp, 0)) continue;
            const T = this.threats(owner, mp, !!g.isNight).filter((t) => t.hits);
            if (!T.length) continue;
            const list = byOwner.get(owner) || byOwner.set(owner, []).get(owner);
            for (const v of cs.active.values()) {
                if (v.dead || !life._fights(v) || v.role === 'king' || list.includes(v)) continue;
                if (v.foe || v.fear || v.fleeT > 0 || v.fireT > 0 || v.servantOf != null || v.sleep || v.lev || v.stunT > 0 || v.arena) continue;
                if (v.order || v.investigate || v.climb) continue;
                if (Math.hypot(v.x - mp.x, v.z - mp.z) > GUARD.HELP_R || Math.abs(v.y - (mp.y - 1.95)) > 12) continue;
                v.gOwner = owner; v.gHelp = now + GUARD.HELP_S * 1000;
                list.push(v);
            }
        }
        // 3. per owner: the threats, the assignment, the formation
        for (const [owner, guards] of byOwner) {
            const mp = life._playerPos(owner);
            if (!mp) { for (const v of guards) { v.gFoe = null; v.gSlot = null; } continue; }
            const hp = this._hp(owner);
            // (a guest-king's health drops: hurt by someone we do not see — the nearest creature is the one)
            if (owner !== g.localId) { const last = this._lastHp.get(owner); if (last != null && hp.hp < last - 0.5) this.masterHurt(owner, null, 'hit'); this._lastHp.set(owner, hp.hp); }
            const hurt = isHurt(hp.hp, hp.max);
            const T = this.threats(owner, mp, !!g.isNight);
            const sw = guards.filter((v) => !(v.gHelp > now));
            const asg = assignFoes(guards.map((v) => ({ x: v.x, z: v.z, strict: !!v.guard })), T, { x: mp.x, z: mp.z, hurt });
            guards.forEach((v, i) => {
                const t = asg[i];
                // a helper with nothing to do goes back to his life
                if (!t && v.gHelp > now) { v.gFoe = null; if (!T.some((x) => x.hits)) v.gHelp = Math.min(v.gHelp, now + 1500); }
                v.gFoe = t ? { key: t.key, kind: t.kind, id: t.id, obj: t.obj } : null;
                v.gCover = T.find((x) => x.kind === 'D') || null;
                v.gHurt = hurt;
            });
            if (T.some((t) => t.hits) && this._shoutT <= 0 && sw.length) { this._shoutT = GUARD.TALK_S; life._say(sw[0], SHOUT[Math.floor(Math.random() * SHOUT.length)], 2.5); }
            // the formation (only for those sworn to walk with him)
            if (sw.length) {
                const s = this._heading(owner, mp, 0.3);
                const slots = guardSlots(mp, s.head, sw.length, { hurt, moving: s.moving });
                const got = matchSlots(sw, slots);
                sw.forEach((v, i) => { v.gSlot = got[i]; v.gKingV = s.moving ? s.speed : 0; });
            }
        }
    }

    // ------------------------------------------------------------ one guard (called from CastleLife._think)
    /** → true when the guard handled the frame; false: the usual life (the hall's places, the old follow) goes on. */
    step(v, dt) {
        if (v.gOwner == null) return false;
        const life = this.life, owner = v.gOwner;
        const helper = !(v.follow === owner);
        const mp = life._playerPos(owner);
        if (!mp) return false;
        if (!helper) {
            v.followT -= dt;
            if (v.followT <= 0) { life.orders._release(v); v.guard = null; v.gOwner = null; return false; }
        }
        // (never the owner himself)
        if (v.foe === owner) { v.foe = null; v.grudge = null; }
        v.seated = false;
        const f = v.gFoe;
        if (f) {
            v.investigate = null;
            if (f.kind === 'p') {
                // a player who hit the owner: the usual fight of the castle against an enemy (squads, slots round him)
                if (f.id === owner) { v.gFoe = null; return false; }
                v.cs.hostile.set(f.id, Date.now() + 60000);
                v.foe = f.id; v.guardOrder = null;
                life._fight(v, dt);
                return true;
            }
            const c = { kind: f.kind, obj: f.obj };
            if (life.orders._alive(c)) {
                v.guardOrder = { prey: c, by: owner };
                life.orders._fightCreature(v, c, dt);
                return true;
            }
            v.gFoe = null; v.guardOrder = null;
        }
        v.guardOrder = null;
        if (helper) return false; // (a helper with no enemy: his own life)
        // a hall with the owner on the throne: the old places before the dais
        if (life._hallSlot(v, mp)) return false;
        const slot = v.gSlot;
        if (!slot) return false;
        const d = Math.hypot(slot.x - v.x, slot.z - v.z);
        if (d > 0.9) {
            // (as fast as the king walks and a little more, so that the ring keeps up with him and does not saw back and forth)
            const kv = v.gKingV || 0;
            const sp = d > 6 ? 5.6 : kv > 0.5 ? Math.min(5.6, Math.max(2.3, kv * 1.15 + d * 0.4)) : d > 3 ? 3.2 : 2.3;
            life._goSpot(v, slot.x, slot.z, sp, dt, 0.6);
            v.mode = v.speed > 2.4 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        } else {
            v.speed = 0; v.path = null;
            // standing in the ring: looks out from the owner (at the dragon, if there is one); shield up when hurt or covering
            const out = v.gCover ? Math.atan2(-(v.gCover.x - v.x), -(v.gCover.z - v.z)) : Math.atan2(-(v.x - mp.x), -(v.z - mp.z));
            v.yaw = turnTo(v.yaw, out, dt * 4);
            v.mode = v.gCover || v.gHurt ? 'block' : 'idle';
        }
        life._ground(v);
        return true;
    }
}

function turnTo(a, b, k) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    return a + d * Math.min(1, k);
}
