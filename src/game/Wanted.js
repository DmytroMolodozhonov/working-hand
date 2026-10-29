/**
 * Wanted.js — the hidden «wanted level» of each player (like the stars of GTA, but never shown
 * anywhere): how much harm this player has done to the people of the castles, the villages and the
 * wizards' towers. It grows with what they do (a blow, a kill, a blast in a town, a burnt house…)
 * and slowly goes down with time. The knights and the wizards fight a player by it: at first they
 * only stun and freeze him, then they get angry (heavier spells, no mercy for one on the ground),
 * and a mass murderer gets «Авада Кедавра» (pure logic, node-testable).
 *
 * It is also how much the people WANT the criminal (the hidden «interest», GTA-like, never shown): it grows with every deed and falls with time
 * (DECAY after CALM). WizardMind.HUNT reads its level: the higher, the more of the wizards go after him, the farther from home and the longer
 * they search (the last known place first, then the likely ways); a hero they never noticed (invisible) is not guessed at.
 *
 * The host keeps it (it runs the castle people); one level for everybody — a player is known by
 * what he did, wherever he goes (castle knights, wandering knights, the towers, the wanderers).
 */

/** Points for each deed (the person's role matters: the Master or a king counts more). */
export const DEEDS = {
    hurt: 1, // a person hurt (a blow with a weapon, a spell)
    kill: 3, // a person killed
    killChief: 6, // the king, the Master of an academy
    wreck: 1, // a blast that broke a part of a castle / a tower / a village (more for a big one: see wreckPoints)
    scare: 0.3, // something dreadful cast among the people (a quake, a storm…), nobody hurt
};

/**
 * Levels: 0 — calm (they stun, freeze), 1 — after a blow or a blast (as before), 2 — angry (more
 * damage, no mercy for one lying down), 3 — «kill him» (≈ 4–5 people killed: «Авада Кедавра»).
 */
export const WANTED = {
    LEVELS: [0, 1.5, 7, 13],
    DECAY: 1 / 45, // points a second (one point in 45 s)…
    CALM: 30, // …after this many seconds without a new deed
    MAX: 40,
};

/** A big blast is worth more than a broken window. */
export function wreckPoints(blocks) {
    if (!(blocks > 0)) return 0;
    return Math.min(4, DEEDS.wreck + blocks / 40);
}

/** The level (0…3) for so many points. */
export function wantedLevel(points) {
    let lvl = 0;
    for (let i = 1; i < WANTED.LEVELS.length; i++) if (points >= WANTED.LEVELS[i]) lvl = i;
    return lvl;
}

/**
 * How the knights and the wizards fight a player of this level.
 *   avada   chance of «Авада Кедавра» in a wizard's cast (a student never casts it)
 *   heavy   chance a wizard's stunning spell becomes a heavy one («Сапира»)
 *   soft    level 0: only stunning / freezing spells (no «Сапира»)
 *   pace    × the pause between the casts
 *   mercy   one lying helpless is spared
 *   dmg     × a knight's blow and arrow
 */
export function wantedTactics(level, role = 'teacher') {
    const chief = role === 'master';
    switch (level) {
        case 3: return { avada: role === 'student' ? 0 : chief ? 0.4 : 0.25, heavy: 0.5, soft: false, pace: 0.75, mercy: false, dmg: 1.6 };
        case 2: return { avada: 0, heavy: 0.4, soft: false, pace: 0.85, mercy: false, dmg: 1.3 };
        case 1: return { avada: 0, heavy: 0, soft: false, pace: 1, mercy: true, dmg: 1 };
        default: return { avada: 0, heavy: 0, soft: true, pace: 1, mercy: true, dmg: 1 };
    }
}

/** Per player: {points, at (s of the last deed)}. `now` in seconds. */
export class Wanted {
    constructor() {
        this.list = new Map();
    }

    /** A deed of player `id`: `kind` of DEEDS, or a number of points. */
    add(id, kind, now, extra = 0) {
        if (id == null) return 0;
        const pts = (typeof kind === 'number' ? kind : DEEDS[kind] || 0) + extra;
        if (!(pts > 0)) return this.points(id, now);
        const r = this._decayed(id, now);
        r.points = Math.min(WANTED.MAX, r.points + pts);
        r.at = now;
        return r.points;
    }

    points(id, now) { return this.list.has(id) ? this._decayed(id, now).points : 0; }

    level(id, now) { return wantedLevel(this.points(id, now)); }

    _decayed(id, now) {
        let r = this.list.get(id);
        if (!r) { r = { points: 0, at: now, t: now }; this.list.set(id, r); return r; }
        const calmFrom = Math.max(r.t, r.at + WANTED.CALM);
        if (now > calmFrom) r.points = Math.max(0, r.points - (now - calmFrom) * WANTED.DECAY);
        r.t = Math.max(r.t, now);
        return r;
    }

    snapshot() { return [...this.list].map(([id, r]) => [id, Math.round(r.points * 10) / 10]); }

    restore(list, now) {
        this.list.clear();
        for (const [id, p] of list || []) if (p > 0) this.list.set(id, { points: p, at: now, t: now });
    }
}
