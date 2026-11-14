/** Elemental discipline and endurance are separate: every tier has the same repertoire. */
import { createRng } from '../core/math.js';
import { rollRank,rollMana } from './WizardAI.js';
export function elementalEndurance(entry,fallback=220){
 const r=createRng((entry.seed??1)^0x68a3c521),rolled=rollRank('wanderer',r),tier=entry.rank||(rolled==='teacher'?'elder':rolled);
 return {tier,mana:entry.mana??(entry.seed!=null?rollMana(tier,r):fallback)};
}

/**
 * The air mage lifts a player with the air and THROWS him (the author 14.11: «маг воздуха сможет поднять другого игрока с помощью воздуха и кинуть куда-то. Это одна из его
 * атакующих возможностей. Защититься можно при помощи Protection Maxima; обычный Protection не сможет»). The lift is the great kind («Левиоса Максима»: goes through magic armour,
 * holds while his mana lasts); the dome of «Protection Maxima» turns it away or breaks it (Levitation.liftMe/_updateLifted: `air`).
 * HOLD s overhead, then the swing: the body flies `SPEED` m/s horizontally, `UP` up, aside by up to `SPREAD` rad from straight away from the mage.
 */
export const AIR_THROW = { HOLD: 2.8, SPEED: 13, UP: 6, SPREAD: 0.7 };
/** The throw's velocity {x, y, z}: from the mage (mx, mz) over the foe (fx, fz), a die `roll` 0…1 for the side. Never zero. */
export function throwVector(mx, mz, fx, fz, roll) {
    let dx = fx - mx, dz = fz - mz; const l = Math.hypot(dx, dz);
    if (l < 0.01) { dx = 0; dz = -1; } else { dx /= l; dz /= l; }
    const a = (roll * 2 - 1) * AIR_THROW.SPREAD, c = Math.cos(a), s = Math.sin(a);
    return { x: (dx * c - dz * s) * AIR_THROW.SPEED, y: AIR_THROW.UP, z: (dx * s + dz * c) * AIR_THROW.SPEED };
}

/**
 * When an elemental mage must rest, and when he is ready again (the author 14.11: «через какое-то время битвы они резко перестают атаковать и просто стоят на месте»).
 * A long fight of each mage showed it: the water mage's mana stopped at 12 — above the old «rest below 10» line and below the 20 a vortex costs — and in a fight nothing
 * gave mana back: he stood «gathering» for 250 s. Now: he rests below the price of his cheapest attack (+ a margin), mana comes back all the time (`REGEN`, faster while resting),
 * and he is ready again at about two such attacks — never a long wait.
 */
export const ELEMENT_LOW = { air: 12, water: 22, fire: 12 };
export const REGEN = { FIGHT: 1.5, REST: 5 };
export function lowMana(element, maxMana) { return Math.min(ELEMENT_LOW[element] ?? 12, maxMana || 30); }
export function readyMana(element, maxMana) { return Math.min(maxMana || 30, Math.max(lowMana(element, maxMana) * 2.2, 30)); }

/**
 * The air mage's moves (the author 14.11: «у него как будто только два движения. Он должен быть разнообразным, должен закручиваться. Разные виды отталкивания»):
 * `Sweep` — the sweep of both arms (a gust, or a heavy one); `Spin` — he whirls on the spot, two turns, and the air flies off him in a ring (the pushing blow at a near foe, a heavy
 * gust at a far one); `Lash` — a low lash of the arm along the ground (a gust that sweeps the foe's feet). Never the same move twice in a row.
 */
export const AIR_MOVES = ['Sweep', 'Spin', 'Lash'];
export const AIR_SPIN = { RATE: 18, SPIN_T: 0.7, FIRE_T: 0.78, END_T: 1.25 }; // rad/s (two turns: 12.6 rad ≈ 4π), s
export function nextAirMove(last, roll) {
    const rest = AIR_MOVES.filter((m) => m !== last);
    return rest[Math.min(rest.length - 1, Math.floor(roll * rest.length))];
}

/**
 * The water mage's ICE SHARDS (the author 14.11: «превратить воду в лёд, потом в осколки, направить на игрока — по аналогии с магом земли»): the water he has — a stream, his tank,
 * the moisture of the air — is wound round him and freezes into `N` shards that hang and turn about him (FREEZE_T), then they are hurled in a volley at the foe (HURL_T…), each a little
 * aside and a little late. A shard hurts one player (the shield or the dome of «Protection» turns it: the cost of «Ice»); the host decides, every computer draws the same flight.
 */
export const SHARDS = { N: 6, COST: 24, FREEZE_T: 0.95, HURL_T: 1.25, END_T: 1.8, SPEED: 26, GRAV: 3, LIFE: 2.2, DAMAGE: 3.5, SPREAD: 0.1, STAGGER: 0.07, MIN_DIST: 5, MAX_DIST: 30, HIT_R: 0.35, ORBIT_R: 1.5, MAX_LIVE: 96 };
/** Where shard `i` of `n` hangs round a mage at (x, y, z) at time `t` (a turning ring, bobbing). → out {x, y, z} */
export function orbitPoint(i, n, t, x, y, z, out = {}) {
    const a = t * 2.6 + i * (Math.PI * 2 / n);
    out.x = x + Math.cos(a) * SHARDS.ORBIT_R; out.z = z + Math.sin(a) * SHARDS.ORBIT_R; out.y = y + 2.4 + 0.45 * Math.sin(t * 2 + i * 1.7);
    return out;
}
/** The unit direction of shard `k` thrown from `from` at `to`: aside by up to SPREAD (`roll` 0…1), a touch up for the gravity. */
export function shardAim(from, to, roll, up = 0.02) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, flat = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz) + (roll * 2 - 1) * SHARDS.SPREAD, pitch = Math.atan2(dy, flat) + up + ((roll * 7.3) % 1 - 0.5) * SHARDS.SPREAD * 0.6;
    const c = Math.cos(pitch);
    return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
}
/** Does the segment p0→p1 come within `r` of the capsule axis a→b? → the fraction t along p0→p1 of the closest approach, or null. */
export function segHitsCapsule(p0, p1, a, b, r) {
    let best = null, bd = Infinity;
    for (let k = 0; k <= 6; k++) {
        const t = k / 6, x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t, z = p0.z + (p1.z - p0.z) * t;
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L = abx * abx + aby * aby + abz * abz;
        const u = L > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / L)) : 0;
        const d = Math.hypot(x - a.x - abx * u, y - a.y - aby * u, z - a.z - abz * u);
        if (d <= r && d < bd) { bd = d; best = t; }
    }
    return best;
}
