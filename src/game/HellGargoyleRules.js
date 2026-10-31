/**
 * HellGargoyleRules.js — the gargoyles of the underworld (pure, no THREE; node-testable).
 *
 * The author: gargoyles fly about from time to time (not too often); now and then they may attack, but ONE BY ONE, not in
 * masses: 1 to 3 gargoyles at most, never huge groups. The model, flight and weak spots are the ordinary gargoyle's
 * (Gargoyles.js, GargoyleRules.js); here only the PATROL: groups of 1–3 circle 80–200 m above their lair; a group that notices a
 * player (60 m) rolls once per meeting — 35 % to attack; an attack is 1–3 of the group (mostly 1), for a while, then they go home.
 *
 *  - fire/lava do not hurt them in the underworld (`FIRE_K` 0; the hellfire of the pentagram does not either);
 *  - «Circle Attack» ×2 and «Inspirius» ×2, as everywhere; «To the Sun» does not work there (no sun);
 *  - they do not touch Tarons and the Devil (and those do not touch them);
 *  - 25 % of the killed drop a gargoyle's head (`drop: 'gargoyleHead'` — the foundation's item; the key stays until the item exists).
 */

export const HELL_GARGOYLE = {
    PACK_MAX: 3, // at most this many gargoyles on a player at once (the author's «от 1 до 3»)
    PACK_WEIGHTS: [0.6, 0.28, 0.12], // the chance of 1, 2, 3 (mostly one)
    GROUP_SIZE: [1, 3], // a patrol group
    GROUPS: [4, 8], // groups in the underworld (by `gargoyleLairs`)
    CIRCLE_R: [80, 200], // m: the circling radius round the lair
    ALT: [26, 70], // m above the ground
    SPEED: 0.7, // × the gargoyle's flying speed while circling
    SEE: 60, // m: they notice a player (not roofed, visible)
    ATTACK_CHANCE: 0.35, // per meeting
    MEETING_GAP: 40, // s: after a roll (yes or no) this group does not roll again
    ATTACK_T: [14, 26], // s an attack lasts at most; then the attackers return
    BREAK_OFF: 90, // m from the lair: the attackers turn back
    HEAD_DROP: 0.25, // chance of the head
    LOAD_R: 520, // m: groups within this of a player are in the world (the others are not made)
    HELL_K: 0, // the share of fire's damage they take there
    DRAW_MAX: 24, // gargoyles of the patrols alive at once (the frame's cost)
};

/** Deterministic hash → 0…1 from a few integers. */
export function hash(a, b = 0, c = 0, d = 0) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647) + Math.imul(d | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/** How many gargoyles go for a player in an attack: 1, 2 or 3 (never more), from a roll 0…1 and the group's size. */
export function packSize(u, groupSize = 3) {
    const w = HELL_GARGOYLE.PACK_WEIGHTS;
    const n = u < w[0] ? 1 : u < w[0] + w[1] ? 2 : 3;
    return Math.max(1, Math.min(HELL_GARGOYLE.PACK_MAX, groupSize, n));
}

/** The meeting's roll: attack or not (0…1). */
export const rollAttack = (u) => u < HELL_GARGOYLE.ATTACK_CHANCE;

/** Does the dying gargoyle drop a head? (a roll 0…1) */
export const dropsHead = (u) => u < HELL_GARGOYLE.HEAD_DROP;

/** The size of the Nth group from the seed: 1…3 (mostly 1–2). */
export function groupSizeOf(seed, i) {
    const u = hash(seed, i, 7, 1);
    return u < 0.45 ? 1 : u < 0.85 ? 2 : 3;
}

/** How many groups for this seed: 4…8 (not more than the lairs). */
export function groupCount(seed, lairs) {
    const [a, b] = HELL_GARGOYLE.GROUPS;
    return Math.min(lairs, a + Math.floor(hash(seed, 3, 5, 9) * (b - a + 1)));
}

/** The circle of the group: radius, altitude, direction, start phase, speed (all from the seed, the same everywhere). */
export function circleOf(seed, i) {
    const R = HELL_GARGOYLE.CIRCLE_R, A = HELL_GARGOYLE.ALT;
    return {
        r: R[0] + hash(seed, i, 1, 2) * (R[1] - R[0]),
        alt: A[0] + hash(seed, i, 2, 2) * (A[1] - A[0]),
        dir: hash(seed, i, 3, 2) < 0.5 ? 1 : -1,
        phase: hash(seed, i, 4, 2) * Math.PI * 2,
        wobble: 0.15 + hash(seed, i, 5, 2) * 0.25,
    };
}

/** Where the Mth member of a group is on its circle at time t (m from the lair, and its altitude). */
export function circlePoint(c, t, m = 0, speed = 14 * HELL_GARGOYLE.SPEED) {
    const w = (speed / c.r) * c.dir;
    const a = c.phase + w * t + m * 0.55;
    const rr = c.r * (1 + c.wobble * 0.2 * Math.sin(t * 0.07 + m));
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, alt: c.alt + Math.sin(t * 0.11 + m * 2) * 6 };
}

/**
 * The group's mind (a small machine, pure): 'circle' → (a player seen, a roll says yes) 'attack' → 'return' → 'circle'.
 *   st = newGroup(n); each step: stepGroup(st, dt, { seen: bool, rolls: () => 0…1, farOk: bool })
 * → events: 'roll' (a meeting rolled), 'attack' (st.attackers = how many), 'return' (they break off).
 */
export function newGroup(n) {
    return { n: Math.max(1, Math.min(HELL_GARGOYLE.PACK_MAX, n)), mode: 'circle', t: 0, gap: 0, attackers: 0, limit: 0, lastSeen: false };
}

export function stepGroup(st, dt, { seen = false, rolls = Math.random, over = false, victimGone = false } = {}) {
    const ev = [];
    st.t += dt;
    st.gap = Math.max(0, st.gap - dt);
    if (st.mode === 'circle') {
        // a meeting: the moment the player comes into sight (a new meeting only after the gap, and only once per sighting)
        if (seen && !st.lastSeen && st.gap <= 0) {
            st.gap = HELL_GARGOYLE.MEETING_GAP;
            ev.push('roll');
            if (rollAttack(rolls())) {
                st.mode = 'attack'; st.t = 0;
                st.attackers = packSize(rolls(), st.n);
                const [a, b] = HELL_GARGOYLE.ATTACK_T;
                st.limit = a + rolls() * (b - a);
                ev.push('attack');
            }
        }
    } else if (st.mode === 'attack') {
        if (st.t >= st.limit || over || victimGone) { st.mode = 'return'; st.t = 0; ev.push('return'); st.attackers = 0; }
    } else if (st.mode === 'return') {
        if (st.t >= 4) { st.mode = 'circle'; st.t = 0; }
    }
    st.lastSeen = seen;
    return ev;
}

/** Which members attack: the first `attackers` of the group, by index (the others keep circling). */
export const isAttacker = (st, m) => st.mode === 'attack' && m < st.attackers;

/** What the underworld's gargoyle never fights (its own side). */
export const NEVER_HUNT = Object.freeze(['taron', 'devil', 'gargoyle']);
export const mayHunt = (kind) => !NEVER_HUNT.includes(kind);

/** The share of a harm they take in the underworld: fire and lava — nothing; the others — as always (1). */
export function underworldFactor(kind) {
    return ['Inferno', 'InfernoMaxima', 'Fire', 'FireMaxima', 'Hellfire', 'Burning', 'Lava', 'lava', 'fire', 'burn', 'flame'].includes(kind) ? HELL_GARGOYLE.HELL_K : 1;
}

/** «To the Sun» in the underworld: why it does nothing there. */
export const SUN_WHY = 'в подземном мире нет солнца';
