/**
 * ElementalParry.js — the fire and the air mage beat a thrown «Bombardo» / «Fireball» aside, back at the one who threw it (pure rules; the host side — ElementalMages.parry).
 *
 * The author 14.11: «если на него игрок кидает фаербол или бомбарду любого типа, он смог отбить её в сторону игрока. По-разному, не обязательно одно движение. Маг
 * воздуха тоже сможет отбивать бомбарду или огненное заклинание, только с помощью воздуха».
 *
 * A parry is a real move, not a free shield: the mage must SEE the orb coming at him (not past him), have a moment to move (the orb at least `MIN` m away, so ≥ ~0.1 s), not be
 * in the middle of a cast, pay a little mana, and he may miss (his die). Fire: a backhand — the orb is struck with the back of the hand and thrown back in a flare; air: a sweep of
 * both palms — a gust turns the orb and it goes back. The struck orb is ended (no blast at the mage) and a NEW orb of the same spell flies back from his hand at the one who threw
 * it (a little aside, a little high: it may miss), as Captain Black Moustache's beaten-aside charge does (Duel._deflect). A different swing each time (`variant`).
 *
 * «Кто/что»: only orbs of the player and of other NPCs (never the mage's own); «Бомбардо» / «Бомбардо Максима» / «Fireball» only — beams, charges of the duel, rays and the
 * rest are not beaten away (they are not thrown things). Water and earth mages do not parry (their defences are their own: the water guard, the stone wall).
 */
export const SWAT = {
    REACH: 11, // m: an orb this near (and coming) is seen
    MIN: 3.2, // m: nearer than this there is no time to move
    MISS: 2.0, // m: an orb that passes wider than this is not «at him»
    HIT: 0.15, // s: when the blow lands (the orb is taken then)
    HIT_MAX: 0.34, // s: the longest wait for the orb to be within reach
    T: 0.66, // s: the whole move
    CD: 1.9, // s between two parries
    CHANCE: { fire: 0.85, air: 0.9, water: 0.8 }, // (14.11: the author threw a Bombardo at the air mage and it was not turned: raised, and now also in the middle of his other moves)
    COST: { fire: 6, air: 8, water: 7 },
    // the water mage DOUSES the orb from afar (the author 14.11: «направлять воду на неё и тушить ещё до того, как она долетит») — a stream at it, a cloud of steam, no orb comes back
    REACH_BY: { water: 15, air: 14 }, TAKE_BY: { water: 12.5 },
    SCATTER: 0.07, // rad of the way back (a little aside)
    TAKE_R: 3.4, // m: the orb is struck when it comes this near
};
export const SWAT_MODES = { fire: 'fireSwat', air: 'airSwat', water: 'waterSwat' };

/** The spell an orb is: 'Fireball' | 'BombardoMaxima' | 'Bombardo'. */
export function swatSpell(orb) { return orb.fire ? 'Fireball' : orb.maxima ? 'BombardoMaxima' : 'Bombardo'; }

/**
 * Is the orb coming at `chest` (x, y, z)? → { dist, time } or null. `orb` = { p, v } (a position and a velocity, m/s).
 */
export function incoming(orb, chest) {
    const dx = chest.x - orb.p.x, dy = chest.y - orb.p.y, dz = chest.z - orb.p.z;
    const dist = Math.hypot(dx, dy, dz);
    const speed = Math.hypot(orb.v.x, orb.v.y, orb.v.z);
    if (!(dist > 0.01) || !(speed > 1)) return null;
    const along = (dx * orb.v.x + dy * orb.v.y + dz * orb.v.z) / speed; // (the way along its flight to the point nearest the mage)
    if (along <= 0.5) return null; // going away / past
    const perp2 = dist * dist - along * along;
    if (perp2 > SWAT.MISS * SWAT.MISS) return null; // passes wide
    return { dist, time: along / speed, along };
}

/**
 * The best orb to parry among `orbs` ([{ p, v, by, fire, maxima, mine }]): the nearest that is coming, in reach, with time left, not his own.
 */
export function pickOrb(orbs, chest, selfId, reach = SWAT.REACH) {
    let best = null;
    for (const o of orbs) {
        if (!o || o.by === selfId) continue;
        const h = incoming(o, chest);
        if (!h || h.dist > reach || h.dist < SWAT.MIN) continue;
        if (!best || h.dist < best.h.dist) best = { o, h };
    }
    return best;
}

/** The unit direction the orb goes back: at `to`, a little aside (`roll` 0…1 → −1…1 of SCATTER) and a little up. */
export function backDirection(from, to, roll, up = 0.05) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const yaw = Math.atan2(dx, dz) + (roll * 2 - 1) * SWAT.SCATTER;
    const flat = Math.hypot(dx, dz) || 1, pitch = Math.atan2(dy, flat) + up;
    const c = Math.cos(pitch);
    return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
}

/** May this mage swing now? `a` = his elemental state. Not while casting, lifting, holding a wave/guard, beaten (stunned/lifted), or cooling. */
export function canSwat(v, a, mana) {
    if (!a || (a.swat != null) || (a.parryCd || 0) > 0) return false;
    if (v.stunT > 0 || v.lev || v.carriedBy || v.vy || v.dead) return false;
    if (a.liftT > 0 || a.capture || a.wave || a.guard > 0 || a.recover) return false;
    if (v.element === 'fire' && a.phase === 'Vault') return false; // (upside down on his hands: no free arm). Mid-sweep or mid-punch he may still turn the orb: the blow is cut short
    return !!SWAT.COST[v.element] && mana >= SWAT.COST[v.element];
}

/**
 * The air mage BENDS a spell aside (the author 14.11: «если игрок кидает заклинание, он ветром, прямо видно искривление, немножко меняет траекторию — игрок промахивается»).
 * No catching, no throwing back: a gust at the flying thing turns its way by an angle that makes it miss him by about `MISS` m (more the nearer it is — never a wide curve:
 * from 14 m about 12°, from 6 m about 27°). Any thrown thing: a charge of the duel (Stupefy, Jolt, Ice… — the gods' spells excepted: nothing turns those), a Bombardo, a Fireball.
 * It costs a little mana, has its own pause, and he may fail (his die). The bent thing flies on straight and may hit whoever is there.
 */
export const BEND = { COST: 5, MISS: 3.0, CD: 0.9, HIT: 0.1, MIN_DIST: 3.2, FAR_MIN: 5.5, CHANCE: 0.9, RETURN_SHARE: 0.5 };
/** The turn (radians, a sign by the die) that makes a thing `dist` m off miss him by BEND.MISS. */
export function bendAngle(dist, roll) {
    const a = Math.atan2(BEND.MISS, Math.max(BEND.FAR_MIN, dist));
    return (roll < 0.5 ? -1 : 1) * a;
}
/** Turns a vector {x, z} about the vertical by `a` (in place; y untouched). */
export function rotateYInPlace(v, a) {
    const c = Math.cos(a), s = Math.sin(a), x = v.x, z = v.z;
    v.x = x * c + z * s; v.z = -x * s + z * c;
    return v;
}
/** A duel charge as the thing `incoming` / `pickOrb` read: { p, v, by, bolt }. `speed` m/s. */
export function boltAsOrb(b, speed) {
    return { p: b.front, v: { x: b.dir.x * speed, y: b.dir.y * speed, z: b.dir.z * speed }, by: b.by, fire: false, maxima: false, bolt: b };
}
